import { createHash, randomUUID } from 'node:crypto'

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import type {
  GenerateWeeklyPlan,
  PlanDecision,
  OnboardingResponse,
  WeeklyPlan,
  WeeklyPlanContent,
  WeeklyPlanHistoryItem,
} from '@myfitness/contracts'
import { planEngineVersion, weeklyPlanContentSchema } from '@myfitness/contracts'
import {
  applyPlanSelections,
  assessPlanEligibility,
  buildWeeklyPlanContent,
  PlanSelectionError,
} from '@myfitness/domain'
import type { QueryResult, QueryResultRow } from 'pg'

import { DatabaseService } from '../database/database.service'
import { InsightsService } from '../insights/insights.service'
import { OnboardingService } from '../onboarding/onboarding.service'

type QueryExecutor = {
  query<T extends QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>>
}

type PlanRow = {
  id: string
  user_id: string
  week_start: string | Date
  timezone: string
  engine_version: typeof planEngineVersion
  status: WeeklyPlan['status']
  payload: WeeklyPlanContent
  revision: number
  idempotency_key: string
  request_hash: string
  created_at: Date
  updated_at: Date
}

const localDate = (value: string | Date) => {
  if (typeof value === 'string') return value.slice(0, 10)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}

const mapPlan = (row: PlanRow): WeeklyPlan => ({
  id: row.id,
  userId: row.user_id,
  weekStart: localDate(row.week_start),
  timezone: row.timezone,
  engineVersion: row.engine_version,
  status: row.status,
  ...weeklyPlanContentSchema.parse(row.payload),
  revision: row.revision,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
})

const insertRevision = async (
  executor: QueryExecutor,
  plan: WeeklyPlan,
  action: WeeklyPlanHistoryItem['action'],
  decisionNote: string | null = null,
) => {
  await executor.query(
    `
      INSERT INTO weekly_plan_revisions (
        id, plan_id, user_id, action, revision, snapshot, decision_note
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
    `,
    [randomUUID(), plan.id, plan.userId, action, plan.revision, JSON.stringify(plan), decisionNote],
  )
}

@Injectable()
export class PlansService {
  constructor(
    private readonly database: DatabaseService,
    private readonly onboarding: OnboardingService,
    private readonly insights: InsightsService,
  ) {}

  private async loadEligibleProfile(userId: string): Promise<OnboardingResponse> {
    let profile: OnboardingResponse
    try {
      profile = await this.onboarding.get(userId)
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new UnprocessableEntityException({
          code: 'onboarding_required',
          message: '请先完成个人资料和安全问答，再生成周计划。',
        })
      }
      throw error
    }

    const eligibility = assessPlanEligibility(profile)
    if (!eligibility.allowed) {
      throw new UnprocessableEntityException({
        code: eligibility.code,
        message: eligibility.message,
        riskFlags: eligibility.riskFlags,
      })
    }
    return profile
  }

  async generate(userId: string, idempotencyKey: string, input: GenerateWeeklyPlan) {
    const profile = await this.loadEligibleProfile(userId)
    const dashboard = await this.insights.dashboard(userId, profile.profile.timezone)
    const payload = buildWeeklyPlanContent({
      weekStart: input.weekStart,
      onboarding: profile,
      dashboard,
    })
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ input, onboardingRevision: profile.revision, payload }))
      .digest('hex')

    return this.database.withTransaction(async (client) => {
      const inserted = await client.query<PlanRow>(
        `
          INSERT INTO weekly_plans (
            id, user_id, week_start, timezone, engine_version, status,
            payload, idempotency_key, request_hash
          ) VALUES ($1, $2, $3, $4, $5, 'draft', $6::jsonb, $7, $8)
          ON CONFLICT DO NOTHING
          RETURNING *
        `,
        [
          randomUUID(),
          userId,
          input.weekStart,
          profile.profile.timezone,
          planEngineVersion,
          JSON.stringify(payload),
          idempotencyKey,
          requestHash,
        ],
      )
      const created = inserted.rows[0]
      if (created) {
        const plan = mapPlan(created)
        await insertRevision(client, plan, 'generated')
        return plan
      }

      const byWeek = await client.query<PlanRow>(
        'SELECT * FROM weekly_plans WHERE user_id = $1 AND week_start = $2 FOR UPDATE',
        [userId, input.weekStart],
      )
      const existingWeek = byWeek.rows[0]
      if (existingWeek) {
        if (existingWeek.payload.evidence.onboardingRevision === profile.revision) {
          return mapPlan(existingWeek)
        }
        const refreshed = await client.query<PlanRow>(
          `
            UPDATE weekly_plans
            SET timezone = $1, engine_version = $2, status = 'draft', payload = $3::jsonb,
                request_hash = $4, revision = revision + 1, updated_at = NOW()
            WHERE id = $5 AND user_id = $6 AND revision = $7
            RETURNING *
          `,
          [
            profile.profile.timezone,
            planEngineVersion,
            JSON.stringify(payload),
            requestHash,
            existingWeek.id,
            userId,
            existingWeek.revision,
          ],
        )
        const plan = mapPlan(refreshed.rows[0]!)
        await insertRevision(client, plan, 'generated')
        return plan
      }

      const byKey = await client.query<PlanRow>(
        'SELECT * FROM weekly_plans WHERE user_id = $1 AND idempotency_key = $2',
        [userId, idempotencyKey],
      )
      if (byKey.rows[0]?.request_hash !== requestHash) {
        throw new ConflictException('idempotency key was already used for a different plan')
      }
      if (byKey.rows[0]) return mapPlan(byKey.rows[0])
      throw new ConflictException('plan generation conflict could not be resolved')
    })
  }

  async list(userId: string) {
    const result = await this.database.query<PlanRow>(
      `
        SELECT * FROM weekly_plans
        WHERE user_id = $1
        ORDER BY week_start DESC, created_at DESC
        LIMIT 12
      `,
      [userId],
    )
    return { items: result.rows.map(mapPlan) }
  }

  async getActionableForAi(userId: string, planId: string, expectedRevision: number) {
    const result = await this.database.query<PlanRow>(
      'SELECT * FROM weekly_plans WHERE id = $1 AND user_id = $2',
      [planId, userId],
    )
    const row = result.rows[0]
    if (!row) throw new NotFoundException('weekly plan not found')
    if (row.revision !== expectedRevision) {
      throw new ConflictException(`plan revision changed; current revision is ${row.revision}`)
    }
    if (row.status === 'skipped') {
      throw new UnprocessableEntityException({
        code: 'plan_not_actionable',
        message: '本周计划已跳过；如需解释，请先重新生成当前版本。',
      })
    }

    const profile = await this.loadEligibleProfile(userId)
    if (profile.revision !== row.payload.evidence.onboardingRevision) {
      throw new ConflictException('planning constraints changed; generate a new plan version')
    }
    return mapPlan(row)
  }

  async decide(userId: string, planId: string, input: PlanDecision) {
    return this.database.withTransaction(async (client) => {
      const current = await client.query<PlanRow>(
        'SELECT * FROM weekly_plans WHERE id = $1 AND user_id = $2 FOR UPDATE',
        [planId, userId],
      )
      const row = current.rows[0]
      if (!row) throw new NotFoundException('weekly plan not found')
      if (row.revision !== input.expectedRevision) {
        throw new ConflictException(`plan revision changed; current revision is ${row.revision}`)
      }
      if (input.decision !== 'skipped') {
        const profile = await this.loadEligibleProfile(userId)
        if (profile.revision !== row.payload.evidence.onboardingRevision) {
          throw new ConflictException('planning constraints changed; generate a new plan version')
        }
      }

      let payload = weeklyPlanContentSchema.parse(row.payload)
      if (input.decision === 'modified') {
        try {
          payload = applyPlanSelections(payload, input.selections)
        } catch (error) {
          if (error instanceof PlanSelectionError) throw new BadRequestException(error.message)
          throw error
        }
      }

      const updated = await client.query<PlanRow>(
        `
          UPDATE weekly_plans
          SET status = $1, payload = $2::jsonb, revision = revision + 1, updated_at = NOW()
          WHERE id = $3 AND user_id = $4 AND revision = $5
          RETURNING *
        `,
        [input.decision, JSON.stringify(payload), planId, userId, input.expectedRevision],
      )
      const plan = mapPlan(updated.rows[0]!)
      await insertRevision(client, plan, input.decision, input.note ?? null)
      return plan
    })
  }

  async history(userId: string, planId: string) {
    const owned = await this.database.query<{ id: string }>(
      'SELECT id FROM weekly_plans WHERE id = $1 AND user_id = $2',
      [planId, userId],
    )
    if (!owned.rows[0]) throw new NotFoundException('weekly plan not found')

    const result = await this.database.query<{
      action: WeeklyPlanHistoryItem['action']
      snapshot: WeeklyPlan
      decision_note: string | null
      changed_at: Date
    }>(
      `
        SELECT action, snapshot, decision_note, changed_at
        FROM weekly_plan_revisions
        WHERE plan_id = $1 AND user_id = $2
        ORDER BY revision DESC
      `,
      [planId, userId],
    )
    return {
      planId,
      items: result.rows.map((revision) => ({
        ...revision.snapshot,
        action: revision.action,
        changedAt: revision.changed_at.toISOString(),
        decisionNote: revision.decision_note,
      })),
    }
  }
}
