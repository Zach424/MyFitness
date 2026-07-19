import { createHash, randomUUID } from 'node:crypto'

import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import type {
  AiExplanation,
  AiExplanationContent,
  AiWorkerFailureCode,
  AiWorkerResponse,
  GenerateAiExplanation,
} from '@myfitness/contracts'
import {
  aiExplanationContentSchema,
  aiPlanConsentVersion,
  aiPlanPromptVersion,
  aiRunRecoveryModel,
  aiPlanSafetyNote,
  aiPlanValidatorVersion,
  aiWorkerResponseSchema,
} from '@myfitness/contracts'
import {
  buildAiPlanContext,
  buildDeterministicAiFallback,
  validateAiExplanation,
} from '@myfitness/domain'
import type { QueryResult, QueryResultRow } from 'pg'

import {
  APPLICATION_LIFECYCLE_POLICY,
  type ApplicationLifecyclePolicy,
} from '../application-lifecycle'
import { getRuntimeConfig } from '../config'
import { DatabaseService } from '../database/database.service'
import { PlansService } from '../plans/plans.service'

type QueryExecutor = {
  query<T extends QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>>
}

type RunRow = {
  id: string
  user_id: string
  plan_id: string
  plan_revision: number
  status: 'pending' | 'completed'
  source: AiExplanation['source'] | null
  provider: AiExplanation['provider'] | null
  model: string | null
  prompt_version: typeof aiPlanPromptVersion
  validator_version: typeof aiPlanValidatorVersion
  input_fingerprint: string
  content: AiExplanationContent | null
  safety_note: typeof aiPlanSafetyNote | null
  failure_code: AiWorkerFailureCode | null
  provider_response_id: string | null
  latency_ms: number | null
  input_tokens: number | null
  output_tokens: number | null
  recovery_content: AiExplanationContent | null
  expires_at: Date
  created_at: Date
  completed_at: Date | null
}

const mapRun = (row: RunRow): AiExplanation => ({
  id: row.id,
  planId: row.plan_id,
  planRevision: row.plan_revision,
  source: row.source!,
  provider: row.provider!,
  model: row.model!,
  promptVersion: row.prompt_version,
  validatorVersion: row.validator_version,
  failureCode: row.failure_code,
  content: aiExplanationContentSchema.parse(row.content),
  safetyNote: row.safety_note!,
  createdAt: (row.completed_at ?? row.created_at).toISOString(),
})

@Injectable()
export class AiService implements OnModuleInit, OnModuleDestroy {
  private readonly config = getRuntimeConfig()
  private readonly logger = new Logger(AiService.name)
  private reconcileTimer?: NodeJS.Timeout

  constructor(
    private readonly database: DatabaseService,
    private readonly plans: PlansService,
    @Inject(APPLICATION_LIFECYCLE_POLICY)
    private readonly lifecycle: ApplicationLifecyclePolicy,
  ) {}

  async onModuleInit() {
    if (!this.lifecycle.runBackgroundJobs) return
    await this.reconcileExpired().catch(() =>
      this.logger.error('initial AI explanation reconciliation failed'),
    )
    this.reconcileTimer = setInterval(() => {
      void this.reconcileExpired().catch(() =>
        this.logger.error('AI explanation reconciliation failed'),
      )
    }, this.config.aiRunReconcilePollMs)
    this.reconcileTimer.unref()
  }

  onModuleDestroy() {
    if (this.reconcileTimer) clearInterval(this.reconcileTimer)
  }

  private async callWorker(request: unknown): Promise<AiWorkerResponse | null> {
    try {
      const response = await fetch(`${this.config.aiServiceUrl}/v1/explanations`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.config.aiServiceToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.config.aiTimeoutMs),
      })
      if (!response.ok) return null
      const parsed = aiWorkerResponseSchema.safeParse(await response.json())
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }

  private async reserve(
    userId: string,
    planId: string,
    planRevision: number,
    idempotencyKey: string,
    requestHash: string,
    recoveryContent: AiExplanationContent,
  ): Promise<{ id: string; existing?: AiExplanation }> {
    return this.database.withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `ai-explanation:${userId}:${idempotencyKey}`,
      ])
      const existing = await client.query<RunRow>(
        'SELECT * FROM ai_explanation_runs WHERE user_id = $1 AND idempotency_key = $2',
        [userId, idempotencyKey],
      )
      const row = existing.rows[0]
      if (row && row.input_fingerprint !== requestHash) {
        throw new ConflictException('idempotency key was already used for another request')
      }
      if (row?.status === 'pending') {
        const recovered = await this.reconcileOne(client, row.id)
        if (recovered) return { id: recovered.id, existing: mapRun(recovered) }
        throw new ConflictException({
          code: 'ai_explanation_in_progress',
          message: '解释仍在生成，请稍后读取历史记录。',
        })
      }
      if (row) return { id: row.id, existing: mapRun(row) }

      const activeUser = await client.query<{ id: string }>(
        "SELECT id FROM users WHERE id = $1 AND status = 'active' FOR UPDATE",
        [userId],
      )
      if (!activeUser.rows[0]) throw new ConflictException('account is not active')

      const consentId = randomUUID()
      await client.query(
        `INSERT INTO consent_events (id, user_id, purpose, version)
         VALUES ($1, $2, 'ai_plan_explanation', $3)`,
        [consentId, userId, aiPlanConsentVersion],
      )
      const id = randomUUID()
      await client.query(
        `
          INSERT INTO ai_explanation_runs (
            id, user_id, plan_id, plan_revision, status,
            prompt_version, validator_version, input_fingerprint,
            idempotency_key, consent_event_id, recovery_content, expires_at
          ) VALUES (
            $1, $2, $3, $4, 'pending', $5, $6, $7, $8, $9, $10::jsonb,
            NOW() + ($11::integer * INTERVAL '1 millisecond')
          )
        `,
        [
          id,
          userId,
          planId,
          planRevision,
          aiPlanPromptVersion,
          aiPlanValidatorVersion,
          requestHash,
          idempotencyKey,
          consentId,
          JSON.stringify(recoveryContent),
          this.config.aiRunStaleMs,
        ],
      )
      return { id }
    })
  }

  private async reconcileOne(executor: QueryExecutor, id: string) {
    const result = await executor.query<RunRow>(
      `UPDATE ai_explanation_runs
       SET status = 'completed', source = 'fallback', provider = 'unavailable',
           model = $2, content = recovery_content, recovery_content = NULL,
           safety_note = $3, failure_code = 'provider_timeout',
           latency_ms = LEAST(
             2147483647,
             GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - created_at)) * 1000))
           )::integer,
           completed_at = NOW()
       WHERE id = $1 AND status = 'pending' AND expires_at <= NOW()
       RETURNING *`,
      [id, aiRunRecoveryModel, aiPlanSafetyNote],
    )
    return result.rows[0]
  }

  async reconcileExpired(limit = 50) {
    const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)))
    const result = await this.database.query<RunRow>(
      `WITH expired AS (
         SELECT id
         FROM ai_explanation_runs
         WHERE status = 'pending' AND expires_at <= NOW()
         ORDER BY expires_at, created_at
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       UPDATE ai_explanation_runs AS run
       SET status = 'completed', source = 'fallback', provider = 'unavailable',
           model = $2, content = run.recovery_content, recovery_content = NULL,
           safety_note = $3, failure_code = 'provider_timeout',
           latency_ms = LEAST(
             2147483647,
             GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - run.created_at)) * 1000))
           )::integer,
           completed_at = NOW()
       FROM expired
       WHERE run.id = expired.id AND run.status = 'pending'
       RETURNING run.*`,
      [boundedLimit, aiRunRecoveryModel, aiPlanSafetyNote],
    )
    return { reconciled: result.rowCount ?? 0 }
  }

  async snapshot() {
    const result = await this.database.query<{
      pending: string
      expired: string
      reconciled: string
      oldest_pending_at: Date | null
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending')::text AS pending,
         COUNT(*) FILTER (
           WHERE status = 'pending' AND expires_at <= NOW()
         )::text AS expired,
         COUNT(*) FILTER (
           WHERE status = 'completed' AND model = $1 AND failure_code = 'provider_timeout'
         )::text AS reconciled,
         MIN(created_at) FILTER (WHERE status = 'pending') AS oldest_pending_at
       FROM ai_explanation_runs`,
      [aiRunRecoveryModel],
    )
    const row = result.rows[0]!
    return {
      counts: {
        pending: Number(row.pending),
        expired: Number(row.expired),
        reconciled: Number(row.reconciled),
      },
      oldestPendingAt: row.oldest_pending_at?.toISOString() ?? null,
    }
  }

  private async complete(
    executor: QueryExecutor,
    id: string,
    result: {
      source: AiExplanation['source']
      provider: AiExplanation['provider']
      model: string
      content: AiExplanationContent
      failureCode: AiWorkerFailureCode | null
      providerResponseId: string | null
      latencyMs: number
      inputTokens: number | null
      outputTokens: number | null
    },
  ) {
    const updated = await executor.query<RunRow>(
      `
        UPDATE ai_explanation_runs
        SET status = 'completed', source = $2, provider = $3, model = $4,
            content = $5::jsonb, safety_note = $6, failure_code = $7,
            provider_response_id = $8, latency_ms = $9,
            input_tokens = $10, output_tokens = $11, recovery_content = NULL,
            completed_at = NOW()
        WHERE id = $1 AND status = 'pending'
        RETURNING *
      `,
      [
        id,
        result.source,
        result.provider,
        result.model,
        JSON.stringify(result.content),
        aiPlanSafetyNote,
        result.failureCode,
        result.providerResponseId,
        result.latencyMs,
        result.inputTokens,
        result.outputTokens,
      ],
    )
    const row = updated.rows[0]
    if (!row) {
      const existing = await executor.query<RunRow>(
        'SELECT * FROM ai_explanation_runs WHERE id = $1',
        [id],
      )
      if (existing.rows[0]?.status === 'completed') return mapRun(existing.rows[0])
      throw new ConflictException('AI explanation run is no longer pending')
    }
    return mapRun(row)
  }

  async generate(
    userId: string,
    planId: string,
    idempotencyKey: string,
    input: GenerateAiExplanation,
  ) {
    const plan = await this.plans.getActionableForAi(userId, planId, input.expectedPlanRevision)
    const context = buildAiPlanContext(plan)
    const recoveryContent = buildDeterministicAiFallback(context)
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ context, consentVersion: input.consent.version }))
      .digest('hex')
    const reservation = await this.reserve(
      userId,
      planId,
      plan.revision,
      idempotencyKey,
      requestHash,
      recoveryContent,
    )
    if (reservation.existing) return reservation.existing

    const worker = await this.callWorker({
      requestId: reservation.id,
      promptVersion: aiPlanPromptVersion,
      validatorVersion: aiPlanValidatorVersion,
      context,
    })
    let failureCode: AiWorkerFailureCode | null = null
    let content: AiExplanationContent
    let source: AiExplanation['source']
    let provider: AiExplanation['provider']
    let model: string

    if (worker?.status === 'generated') {
      const validation = validateAiExplanation(worker.content, context)
      if (validation.valid) {
        content = validation.content
        source = worker.provider === 'openai' ? 'model' : 'fixture'
        provider = worker.provider
        model = worker.model
      } else {
        content = recoveryContent
        source = 'fallback'
        provider = worker.provider
        model = worker.model
        failureCode = 'safety_validation_failed'
      }
    } else {
      content = recoveryContent
      source = 'fallback'
      provider = worker?.provider ?? 'unavailable'
      model = worker?.model ?? 'worker-unavailable'
      failureCode = worker?.failureCode ?? 'provider_unavailable'
    }

    return this.complete(this.database, reservation.id, {
      source,
      provider,
      model,
      content,
      failureCode,
      providerResponseId: worker?.providerResponseId ?? null,
      latencyMs: worker?.latencyMs ?? 0,
      inputTokens: worker?.usage?.inputTokens ?? null,
      outputTokens: worker?.usage?.outputTokens ?? null,
    })
  }

  async history(userId: string, planId: string) {
    const owned = await this.database.query<{ id: string }>(
      'SELECT id FROM weekly_plans WHERE id = $1 AND user_id = $2',
      [planId, userId],
    )
    if (!owned.rows[0]) throw new NotFoundException('weekly plan not found')

    const result = await this.database.query<RunRow>(
      `
        SELECT * FROM ai_explanation_runs
        WHERE user_id = $1 AND plan_id = $2 AND status = 'completed'
        ORDER BY completed_at DESC
        LIMIT 20
      `,
      [userId, planId],
    )
    return { planId, items: result.rows.map(mapRun) }
  }
}
