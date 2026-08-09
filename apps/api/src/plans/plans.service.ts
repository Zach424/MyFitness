import { createHash, randomUUID } from 'node:crypto'

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import type {
  CreatePlanWorkoutLink,
  GenerateWeeklyPlan,
  PlanDecision,
  OnboardingResponse,
  PlanExperienceReflection,
  PlanFreshness,
  PlanOutcomeRecoveryObservation,
  PlanOutcomeReview,
  PlanWorkoutLink,
  WeeklyPlan,
  WeeklyPlanContent,
  WeeklyPlanHistoryItem,
  WeeklyPlanHistoryQuery,
  WritePlanExperienceReflection,
} from '@myfitness/contracts'
import {
  normalizePersistedPlanEvidence,
  planEngineVersion,
  subjectiveRecoveryMetrics,
  weeklyPlanContentSchema,
  weeklyPlanSchema,
} from '@myfitness/contracts'
import {
  applyPlanSelections,
  assessPlanEligibility,
  buildWeeklyPlanContent,
  buildPlanOutcomeReview,
  comparePlanEvidence,
  PlanSelectionError,
  planningReadinessScore,
} from '@myfitness/domain'
import type { QueryResult, QueryResultRow } from 'pg'

import { DatabaseService } from '../database/database.service'
import { InsightsService } from '../insights/insights.service'
import { OnboardingService } from '../onboarding/onboarding.service'
import { decodeRecordPageCursor, encodeRecordPageCursor } from '../pagination/record-page-cursor'

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

type PlanWorkoutLinkRow = {
  id: string
  user_id: string
  plan_id: string
  plan_revision: number
  session_date: string | Date
  workout_id: string
  workout_revision: number
  revision: number
  linked_at: Date
  workout_title: string
  workout_status: PlanWorkoutLink['workoutStatus']
  workout_started_at: Date
  current_workout_revision: number
}

type LinkableWorkoutRow = {
  id: string
  revision: number
  title: string
  status: PlanWorkoutLink['workoutStatus']
  started_at: Date
}

type PlanOutcomeContextRow = {
  plan_id: string
  plan_revision: number
  snapshot: WeeklyPlan
  baseline_snapshot: WeeklyPlan
  adopted_at: Date
}

type PlanOutcomeRecoveryRow = {
  plan_id: string
  plan_revision: number
  record_id: string
  revision: number
  metric: PlanOutcomeRecoveryObservation['metric']
  canonical_value: string
  occurred_at: Date
  source_kind: PlanOutcomeRecoveryObservation['sourceKind']
  total_count: string
}

type PlanOutcomeWithdrawalRow = {
  plan_id: string
  plan_revision: number
  workout_link_count: string
  recovery_record_count: string
}

type PlanExperienceReflectionRow = {
  id: string
  user_id: string
  plan_id: string
  plan_revision: number
  experience: PlanExperienceReflection['experience']
  source: PlanExperienceReflection['source']
  revision: number
  created_at: Date
  updated_at: Date
}

const localDate = (value: string | Date) => {
  if (typeof value === 'string') return value.slice(0, 10)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}

const normalizePayload = (payload: WeeklyPlanContent) =>
  weeklyPlanContentSchema.parse({
    ...payload,
    evidence: normalizePersistedPlanEvidence(payload.evidence),
  })

const mapPlan = (row: PlanRow): WeeklyPlan => ({
  id: row.id,
  userId: row.user_id,
  weekStart: localDate(row.week_start),
  timezone: row.timezone,
  engineVersion: row.engine_version,
  status: row.status,
  ...normalizePayload(row.payload),
  revision: row.revision,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
})

const normalizePlanSnapshot = (snapshot: WeeklyPlan) =>
  weeklyPlanSchema.parse({
    ...snapshot,
    evidence: normalizePersistedPlanEvidence(snapshot.evidence),
  })

const mapPlanWorkoutLink = (row: PlanWorkoutLinkRow): PlanWorkoutLink => ({
  id: row.id,
  userId: row.user_id,
  planId: row.plan_id,
  planRevision: row.plan_revision,
  sessionDate: localDate(row.session_date),
  workoutId: row.workout_id,
  workoutRevision: row.workout_revision,
  currentWorkoutRevision: row.current_workout_revision,
  workoutTitle: row.workout_title,
  workoutStatus: row.workout_status,
  workoutStartedAt: row.workout_started_at.toISOString(),
  revision: row.revision,
  linkedAt: row.linked_at.toISOString(),
})

const mapPlanExperienceReflection = (
  row: PlanExperienceReflectionRow,
): PlanExperienceReflection => ({
  id: row.id,
  planId: row.plan_id,
  planRevision: row.plan_revision,
  experience: row.experience,
  source: row.source,
  revision: row.revision,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
})

const loadActivePlanWorkoutLinks = async (
  executor: QueryExecutor,
  userId: string,
  planIds: string[],
) => {
  if (!planIds.length) return []
  const result = await executor.query<PlanWorkoutLinkRow>(
    `
      SELECT link.*, workout.title AS workout_title, workout.status AS workout_status,
             workout.started_at AS workout_started_at,
             workout.revision AS current_workout_revision
      FROM plan_workout_links AS link
      JOIN workout_sessions AS workout
        ON workout.id = link.workout_id AND workout.user_id = link.user_id
      WHERE link.user_id = $1
        AND link.plan_id = ANY($2::uuid[])
        AND link.unlinked_at IS NULL
        AND workout.deleted_at IS NULL
      ORDER BY link.linked_at DESC
    `,
    [userId, planIds],
  )
  return result.rows.map(mapPlanWorkoutLink)
}

const outcomeKey = (planId: string, planRevision: number) => `${planId}:${planRevision}`

const assertAcceptedPlanRevision = async (
  executor: QueryExecutor,
  userId: string,
  planId: string,
  planRevision: number,
) => {
  const accepted = await executor.query<{ revision: number }>(
    `SELECT accepted.revision
     FROM weekly_plan_revisions AS accepted
     JOIN weekly_plans AS owned
       ON owned.id = accepted.plan_id AND owned.user_id = accepted.user_id
     WHERE accepted.user_id = $1
       AND accepted.plan_id = $2
       AND accepted.revision = $3
       AND accepted.action = 'accepted'`,
    [userId, planId, planRevision],
  )
  if (!accepted.rows[0]) throw new NotFoundException('accepted weekly plan revision not found')
}

const projectPlanOutcomeReviews = async (
  executor: QueryExecutor,
  userId: string,
  contexts: PlanOutcomeContextRow[],
  linksByPlan: Map<string, PlanWorkoutLink[]>,
  now: Date,
) => {
  const reviews = new Map<string, PlanOutcomeReview>()
  if (!contexts.length) return reviews

  const windows = contexts.map((context) => {
    const adoptedAt = context.adopted_at.toISOString()
    return {
      planId: context.plan_id,
      planRevision: context.plan_revision,
      adoptedAt,
      observedThrough: new Date(
        Math.min(now.getTime(), context.adopted_at.getTime() + 7 * 24 * 60 * 60 * 1_000),
      ).toISOString(),
    }
  })
  const recoveryResult = await executor.query<PlanOutcomeRecoveryRow>(
    `
      WITH review_windows AS (
        SELECT
          (item ->> 'planId')::uuid AS plan_id,
          (item ->> 'planRevision')::integer AS plan_revision,
          (item ->> 'adoptedAt')::timestamptz AS adopted_at,
          (item ->> 'observedThrough')::timestamptz AS observed_through
        FROM jsonb_array_elements($2::jsonb) AS item
      )
      SELECT review.plan_id, review.plan_revision,
             observation.id AS record_id, observation.revision,
             observation.metric, observation.canonical_value, observation.occurred_at,
             observation.source_kind, observation.total_count
      FROM review_windows AS review
      JOIN LATERAL (
        SELECT record.id, record.revision, record.metric, record.canonical_value,
               record.occurred_at, record.source_kind,
               COUNT(*) OVER ()::text AS total_count
        FROM health_records AS record
        WHERE record.user_id = $1
          AND record.deleted_at IS NULL
          AND record.status = 'confirmed'
          AND record.source_kind <> 'ai_estimate'
          AND record.metric = ANY($3::text[])
          AND record.occurred_at >= review.adopted_at
          AND record.occurred_at <= review.observed_through
        ORDER BY record.occurred_at DESC, record.id DESC
        LIMIT 100
      ) AS observation ON TRUE
      ORDER BY review.plan_id, review.plan_revision,
               observation.occurred_at DESC, observation.id DESC
    `,
    [userId, JSON.stringify(windows), subjectiveRecoveryMetrics],
  )
  const recoveryByRevision = new Map<
    string,
    { items: PlanOutcomeRecoveryObservation[]; total: number }
  >()
  for (const row of recoveryResult.rows) {
    const key = outcomeKey(row.plan_id, row.plan_revision)
    const current = recoveryByRevision.get(key) ?? {
      items: [],
      total: Number(row.total_count),
    }
    current.items.push({
      recordId: row.record_id,
      revision: row.revision,
      metric: row.metric,
      canonicalValue: Number(row.canonical_value),
      occurredAt: row.occurred_at.toISOString(),
      sourceKind: row.source_kind,
    })
    recoveryByRevision.set(key, current)
  }

  const withdrawalResult = await executor.query<PlanOutcomeWithdrawalRow>(
    `
      WITH review_windows AS (
        SELECT
          (item ->> 'planId')::uuid AS plan_id,
          (item ->> 'planRevision')::integer AS plan_revision,
          (item ->> 'adoptedAt')::timestamptz AS adopted_at,
          (item ->> 'observedThrough')::timestamptz AS observed_through
        FROM jsonb_array_elements($2::jsonb) AS item
      )
      SELECT review.plan_id, review.plan_revision,
             (
               SELECT COUNT(*)::text
               FROM plan_workout_links AS link
               JOIN workout_sessions AS workout
                 ON workout.id = link.workout_id AND workout.user_id = link.user_id
               WHERE link.user_id = $1
                 AND link.plan_id = review.plan_id
                 AND link.plan_revision = review.plan_revision
                 AND workout.started_at >= review.adopted_at
                 AND workout.started_at <= review.observed_through
                 AND (link.unlinked_at IS NOT NULL OR workout.deleted_at IS NOT NULL)
             ) AS workout_link_count,
             (
               SELECT COUNT(*)::text
               FROM health_records AS record
               WHERE record.user_id = $1
                 AND record.deleted_at IS NOT NULL
                 AND record.status = 'confirmed'
                 AND record.source_kind <> 'ai_estimate'
                 AND record.metric = ANY($3::text[])
                 AND record.occurred_at >= review.adopted_at
                 AND record.occurred_at <= review.observed_through
             ) AS recovery_record_count
      FROM review_windows AS review
    `,
    [userId, JSON.stringify(windows), subjectiveRecoveryMetrics],
  )
  const withdrawalByRevision = new Map(
    withdrawalResult.rows.map((row) => [
      outcomeKey(row.plan_id, row.plan_revision),
      {
        workoutLinkCount: Number(row.workout_link_count),
        recoveryRecordCount: Number(row.recovery_record_count),
      },
    ]),
  )

  for (const [index, context] of contexts.entries()) {
    const key = outcomeKey(context.plan_id, context.plan_revision)
    const adopted = normalizePlanSnapshot(context.snapshot)
    const recovery = recoveryByRevision.get(key) ?? { items: [], total: 0 }
    reviews.set(
      key,
      buildPlanOutcomeReview({
        baseline: normalizePlanSnapshot(context.baseline_snapshot),
        adopted,
        adoptedAt: windows[index]!.adoptedAt,
        observedThrough: windows[index]!.observedThrough,
        linkedWorkouts: linksByPlan.get(context.plan_id) ?? [],
        recoveryObservations: recovery.items,
        recoveryObservationTotal: recovery.total,
        withdrawnEvidence: withdrawalByRevision.get(key),
      }),
    )
  }
  return reviews
}

const projectFreshness = (
  plan: WeeklyPlan,
  profile: OnboardingResponse | undefined,
  currentReadinessScore: number | null | undefined,
  checkedAt: string,
): PlanFreshness => {
  const base = {
    checkedAt,
    planOnboardingRevision: plan.evidence.onboardingRevision,
    canSkip: true as const,
  }
  if (!profile) {
    return {
      ...base,
      state: 'onboarding_required',
      currentOnboardingRevision: null,
      canAcceptOrModify: false,
      canExplainWithAi: false,
      recommendedAction: 'complete_profile',
    }
  }
  if (!assessPlanEligibility(profile).allowed) {
    return {
      ...base,
      state: 'eligibility_blocked',
      currentOnboardingRevision: profile.revision,
      canAcceptOrModify: false,
      canExplainWithAi: false,
      recommendedAction: 'review_profile',
    }
  }
  if (profile.revision !== plan.evidence.onboardingRevision) {
    return {
      ...base,
      state: 'profile_changed',
      currentOnboardingRevision: profile.revision,
      canAcceptOrModify: false,
      canExplainWithAi: false,
      recommendedAction: 'regenerate',
    }
  }
  if (currentReadinessScore === undefined) {
    throw new Error('eligible plan freshness requires a current evidence projection')
  }
  const evidence = comparePlanEvidence(plan.evidence.readinessScore, currentReadinessScore)
  const evidenceProjection = {
    evidencePolicyVersion: evidence.evidencePolicyVersion,
    planEvidenceFingerprint: evidence.planFingerprint,
    currentEvidenceFingerprint: evidence.currentFingerprint,
  }
  if (!evidence.current) {
    return {
      ...base,
      ...evidenceProjection,
      state: 'evidence_changed',
      currentOnboardingRevision: profile.revision,
      changeReason: evidence.changeReason,
      canAcceptOrModify: false,
      canExplainWithAi: false,
      recommendedAction: 'regenerate',
    }
  }
  return {
    ...base,
    ...evidenceProjection,
    state: 'current',
    currentOnboardingRevision: profile.revision,
    canAcceptOrModify: true,
    canExplainWithAi: true,
    recommendedAction: 'none',
  }
}

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

  private async assertEvidenceCurrent(
    userId: string,
    profile: OnboardingResponse,
    planReadinessScore: number | null,
  ) {
    const dashboard = await this.insights.dashboard(userId, profile.profile.timezone)
    const evidence = comparePlanEvidence(
      planReadinessScore,
      planningReadinessScore(dashboard.readiness),
    )
    if (!evidence.current) {
      throw new ConflictException({
        code: 'plan_evidence_changed',
        message: '近期恢复记录已改变计划安排边界；请按最新记录重新生成本周计划。',
        evidencePolicyVersion: evidence.evidencePolicyVersion,
        planEvidenceFingerprint: evidence.planFingerprint,
        currentEvidenceFingerprint: evidence.currentFingerprint,
        changeReason: evidence.changeReason,
      })
    }
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
        const existingPlan = mapPlan(existingWeek)
        if (
          existingPlan.evidence.onboardingRevision === profile.revision &&
          existingPlan.evidence.evidenceFingerprint === payload.evidence.evidenceFingerprint
        ) {
          return existingPlan
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
    const plans = result.rows.map(mapPlan)
    const sessionLinks = await loadActivePlanWorkoutLinks(
      this.database,
      userId,
      result.rows.map((row) => row.id),
    )
    const linksByPlan = new Map<string, PlanWorkoutLink[]>()
    for (const link of sessionLinks) {
      const current = linksByPlan.get(link.planId) ?? []
      current.push(link)
      linksByPlan.set(link.planId, current)
    }
    let profile: OnboardingResponse | undefined
    try {
      profile = await this.onboarding.get(userId)
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error
    }
    let currentReadinessScore: number | null | undefined
    if (result.rows.length && profile && assessPlanEligibility(profile).allowed) {
      const dashboard = await this.insights.dashboard(userId, profile.profile.timezone)
      currentReadinessScore = planningReadinessScore(dashboard.readiness)
    }
    const checkedAt = new Date().toISOString()
    return {
      items: plans.map((plan) => {
        return {
          ...plan,
          freshness: projectFreshness(plan, profile, currentReadinessScore, checkedAt),
          sessionLinks: linksByPlan.get(plan.id) ?? [],
        }
      }),
    }
  }

  async linkWorkout(
    userId: string,
    planId: string,
    input: CreatePlanWorkoutLink,
  ): Promise<PlanWorkoutLink> {
    return this.database.withTransaction(async (client) => {
      const current = await client.query<PlanRow>(
        'SELECT * FROM weekly_plans WHERE id = $1 AND user_id = $2 FOR UPDATE',
        [planId, userId],
      )
      const row = current.rows[0]
      if (!row) throw new NotFoundException('weekly plan not found')
      if (row.revision !== input.expectedPlanRevision) {
        throw new ConflictException({
          code: 'plan_revision_changed',
          message: `plan revision changed; current revision is ${row.revision}`,
          currentRevision: row.revision,
        })
      }
      if (row.status !== 'accepted') {
        throw new UnprocessableEntityException({
          code: 'plan_not_adopted',
          message: 'Only an explicitly accepted plan can be linked to an actual workout.',
        })
      }

      const plan = mapPlan(row)
      const day = plan.days.find((candidate) => candidate.date === input.sessionDate)
      if (!day?.session) {
        throw new UnprocessableEntityException({
          code: 'plan_session_not_found',
          message: 'The selected plan revision has no session on that date.',
        })
      }
      const profile = await this.loadEligibleProfile(userId)
      if (profile.revision !== plan.evidence.onboardingRevision) {
        throw new ConflictException({
          code: 'plan_profile_changed',
          message: 'Planning constraints changed; regenerate and accept the current plan first.',
        })
      }
      await this.assertEvidenceCurrent(userId, profile, plan.evidence.readinessScore)

      const workouts = await client.query<LinkableWorkoutRow>(
        `
          SELECT id, revision, title, status, started_at
          FROM workout_sessions
          WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
          FOR UPDATE
        `,
        [input.workoutId, userId],
      )
      const workout = workouts.rows[0]
      if (!workout) throw new NotFoundException('workout not found')
      if (workout.revision !== input.expectedWorkoutRevision) {
        throw new ConflictException({
          code: 'workout_revision_changed',
          message: `workout revision changed; current revision is ${workout.revision}`,
          currentRevision: workout.revision,
        })
      }

      const active = await client.query<PlanWorkoutLinkRow>(
        `
          SELECT link.*, workout.title AS workout_title, workout.status AS workout_status,
                 workout.started_at AS workout_started_at,
                 workout.revision AS current_workout_revision
          FROM plan_workout_links AS link
          JOIN workout_sessions AS workout
            ON workout.id = link.workout_id AND workout.user_id = link.user_id
          WHERE link.user_id = $1 AND link.unlinked_at IS NULL
            AND (
              link.workout_id = $2
              OR (
                link.plan_id = $3 AND link.plan_revision = $4 AND link.session_date = $5
              )
            )
          FOR UPDATE OF link
        `,
        [userId, input.workoutId, planId, input.expectedPlanRevision, input.sessionDate],
      )
      const exact = active.rows.find(
        (link) =>
          link.workout_id === input.workoutId &&
          link.plan_id === planId &&
          link.plan_revision === input.expectedPlanRevision &&
          localDate(link.session_date) === input.sessionDate,
      )
      if (exact && exact.workout_revision === input.expectedWorkoutRevision) {
        return mapPlanWorkoutLink(exact)
      }
      if (active.rows.length) {
        throw new ConflictException({
          code: 'plan_workout_link_conflict',
          message: 'The session or workout already has another active explicit link.',
        })
      }

      const inserted = await client.query<PlanWorkoutLinkRow>(
        `
          INSERT INTO plan_workout_links (
            id, user_id, plan_id, plan_revision, session_date, workout_id, workout_revision
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *, $8::text AS workout_title, $9::text AS workout_status,
                    $10::timestamptz AS workout_started_at,
                    $7::integer AS current_workout_revision
        `,
        [
          randomUUID(),
          userId,
          planId,
          input.expectedPlanRevision,
          input.sessionDate,
          input.workoutId,
          input.expectedWorkoutRevision,
          workout.title,
          workout.status,
          workout.started_at,
        ],
      )
      return mapPlanWorkoutLink(inserted.rows[0]!)
    })
  }

  async unlinkWorkout(userId: string, planId: string, linkId: string, expectedRevision: number) {
    return this.database.withTransaction(async (client) => {
      const result = await client.query<{ id: string; revision: number; unlinked_at: Date }>(
        `
          UPDATE plan_workout_links
          SET unlinked_at = NOW(), unlink_reason = 'user', revision = revision + 1
          WHERE id = $1 AND plan_id = $2 AND user_id = $3
            AND unlinked_at IS NULL AND revision = $4
          RETURNING id, revision, unlinked_at
        `,
        [linkId, planId, userId, expectedRevision],
      )
      if (result.rows[0]) {
        return {
          linkId: result.rows[0].id,
          revision: result.rows[0].revision,
          unlinkedAt: result.rows[0].unlinked_at.toISOString(),
        }
      }

      const existing = await client.query<{ revision: number; unlinked_at: Date | null }>(
        'SELECT revision, unlinked_at FROM plan_workout_links WHERE id = $1 AND plan_id = $2 AND user_id = $3',
        [linkId, planId, userId],
      )
      const row = existing.rows[0]
      if (!row || row.unlinked_at) throw new NotFoundException('active plan workout link not found')
      throw new ConflictException({
        code: 'plan_workout_link_revision_changed',
        message: `plan workout link revision changed; current revision is ${row.revision}`,
        currentRevision: row.revision,
      })
    })
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

    const plan = mapPlan(row)
    const profile = await this.loadEligibleProfile(userId)
    if (profile.revision !== plan.evidence.onboardingRevision) {
      throw new ConflictException('planning constraints changed; generate a new plan version')
    }
    await this.assertEvidenceCurrent(userId, profile, plan.evidence.readinessScore)
    return plan
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
      let payload = normalizePayload(row.payload)
      if (input.decision !== 'skipped') {
        const profile = await this.loadEligibleProfile(userId)
        if (profile.revision !== payload.evidence.onboardingRevision) {
          throw new ConflictException('planning constraints changed; generate a new plan version')
        }
        await this.assertEvidenceCurrent(userId, profile, payload.evidence.readinessScore)
      }

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

  async outcome(userId: string, planId: string, planRevision: number, now = new Date()) {
    const contexts = await this.database.query<PlanOutcomeContextRow>(
      `
        SELECT adopted.plan_id, adopted.revision AS plan_revision,
               adopted.snapshot, adopted.changed_at AS adopted_at,
               baseline.snapshot AS baseline_snapshot
        FROM weekly_plan_revisions AS adopted
        JOIN weekly_plans AS owned
          ON owned.id = adopted.plan_id AND owned.user_id = adopted.user_id
        JOIN LATERAL (
          SELECT generated.snapshot
          FROM weekly_plan_revisions AS generated
          WHERE generated.plan_id = adopted.plan_id
            AND generated.user_id = adopted.user_id
            AND generated.action = 'generated'
            AND generated.revision <= adopted.revision
          ORDER BY generated.revision DESC
          LIMIT 1
        ) AS baseline ON TRUE
        WHERE adopted.user_id = $1
          AND adopted.plan_id = $2
          AND adopted.revision = $3
          AND adopted.action = 'accepted'
      `,
      [userId, planId, planRevision],
    )
    if (!contexts.rows[0]) throw new NotFoundException('accepted weekly plan revision not found')

    const activeLinks = await loadActivePlanWorkoutLinks(this.database, userId, [planId])
    const linksByPlan = new Map<string, PlanWorkoutLink[]>([[planId, activeLinks]])
    const reviews = await projectPlanOutcomeReviews(
      this.database,
      userId,
      contexts.rows,
      linksByPlan,
      now,
    )
    const review = reviews.get(outcomeKey(planId, planRevision))
    if (!review) throw new NotFoundException('accepted weekly plan revision not found')
    return review
  }

  async reflection(
    userId: string,
    planId: string,
    planRevision: number,
  ): Promise<PlanExperienceReflection | null> {
    await assertAcceptedPlanRevision(this.database, userId, planId, planRevision)
    const result = await this.database.query<PlanExperienceReflectionRow>(
      `SELECT * FROM plan_experience_reflections
       WHERE user_id = $1 AND plan_id = $2 AND plan_revision = $3`,
      [userId, planId, planRevision],
    )
    return result.rows[0] ? mapPlanExperienceReflection(result.rows[0]) : null
  }

  async writeReflection(
    userId: string,
    planId: string,
    planRevision: number,
    input: WritePlanExperienceReflection,
  ): Promise<PlanExperienceReflection> {
    return this.database.withTransaction(async (client) => {
      await assertAcceptedPlanRevision(client, userId, planId, planRevision)
      const current = await client.query<PlanExperienceReflectionRow>(
        `SELECT * FROM plan_experience_reflections
         WHERE user_id = $1 AND plan_id = $2 AND plan_revision = $3
         FOR UPDATE`,
        [userId, planId, planRevision],
      )
      const existing = current.rows[0]
      if (!existing) {
        if (input.expectedRevision !== 0) {
          throw new ConflictException('plan experience reflection revision does not match')
        }
        const created = await client.query<PlanExperienceReflectionRow>(
          `INSERT INTO plan_experience_reflections
             (id, user_id, plan_id, plan_revision, experience, source, revision)
           VALUES ($1, $2, $3, $4, $5, 'user_confirmed', 1)
           RETURNING *`,
          [randomUUID(), userId, planId, planRevision, input.experience],
        )
        return mapPlanExperienceReflection(created.rows[0]!)
      }
      if (existing.revision !== input.expectedRevision) {
        throw new ConflictException('plan experience reflection revision does not match')
      }
      const updated = await client.query<PlanExperienceReflectionRow>(
        `UPDATE plan_experience_reflections
         SET experience = $1, revision = revision + 1, updated_at = NOW()
         WHERE id = $2 AND user_id = $3 AND revision = $4
         RETURNING *`,
        [input.experience, existing.id, userId, input.expectedRevision],
      )
      return mapPlanExperienceReflection(updated.rows[0]!)
    })
  }

  async deleteReflection(
    userId: string,
    planId: string,
    planRevision: number,
    expectedRevision: number,
  ): Promise<void> {
    await this.database.withTransaction(async (client) => {
      await assertAcceptedPlanRevision(client, userId, planId, planRevision)
      const deleted = await client.query<{ id: string }>(
        `DELETE FROM plan_experience_reflections
         WHERE user_id = $1 AND plan_id = $2 AND plan_revision = $3 AND revision = $4
         RETURNING id`,
        [userId, planId, planRevision, expectedRevision],
      )
      if (deleted.rows[0]) return
      const current = await client.query<{ revision: number }>(
        `SELECT revision FROM plan_experience_reflections
         WHERE user_id = $1 AND plan_id = $2 AND plan_revision = $3`,
        [userId, planId, planRevision],
      )
      if (current.rows[0]) {
        throw new ConflictException('plan experience reflection revision does not match')
      }
      throw new NotFoundException('plan experience reflection not found')
    })
  }

  async history(userId: string, planId: string, query: WeeklyPlanHistoryQuery = { limit: 20 }) {
    const cursor = decodeRecordPageCursor(query.cursor, 'weekly plan history')
    if (cursor && cursor.id !== planId) {
      throw new BadRequestException('weekly plan history cursor is invalid or expired')
    }
    const owned = await this.database.query<{ id: string }>(
      'SELECT id FROM weekly_plans WHERE id = $1 AND user_id = $2',
      [planId, userId],
    )
    if (!owned.rows[0]) throw new NotFoundException('weekly plan not found')
    if (cursor) {
      const anchor = await this.database.query<{ revision: number }>(
        `SELECT revision FROM weekly_plan_revisions
         WHERE plan_id = $1 AND user_id = $2 AND revision = $3`,
        [planId, userId, cursor.revision],
      )
      if (!anchor.rows[0]) {
        throw new BadRequestException('weekly plan history cursor is invalid or expired')
      }
    }

    const result = await this.database.query<{
      revision: number
      action: WeeklyPlanHistoryItem['action']
      snapshot: WeeklyPlan
      decision_note: string | null
      changed_at: Date
    }>(
      `
        SELECT revision, action, snapshot, decision_note, changed_at
        FROM weekly_plan_revisions
        WHERE plan_id = $1 AND user_id = $2
          AND ($3::integer IS NULL OR revision < $3)
        ORDER BY revision DESC
        LIMIT $4
      `,
      [planId, userId, cursor?.revision ?? null, query.limit + 1],
    )
    const hasMore = result.rows.length > query.limit
    const rows = result.rows.slice(0, query.limit)
    return {
      planId,
      items: rows.map((revision) => {
        const snapshot = weeklyPlanSchema.parse({
          ...revision.snapshot,
          evidence: normalizePersistedPlanEvidence(revision.snapshot.evidence),
        })
        return {
          ...snapshot,
          action: revision.action,
          changedAt: revision.changed_at.toISOString(),
          decisionNote: revision.decision_note,
        }
      }),
      nextCursor:
        hasMore && rows.at(-1)
          ? encodeRecordPageCursor({ id: planId, revision: rows.at(-1)!.revision })
          : null,
    }
  }
}
