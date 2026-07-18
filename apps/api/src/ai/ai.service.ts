import { createHash, randomUUID } from 'node:crypto'

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
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
export class AiService {
  private readonly config = getRuntimeConfig()

  constructor(
    private readonly database: DatabaseService,
    private readonly plans: PlansService,
  ) {}

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
  ): Promise<{ id: string; existing?: AiExplanation }> {
    return this.database.withTransaction(async (client) => {
      const consentId = randomUUID()
      await client.query(
        `
          INSERT INTO consent_events (id, user_id, purpose, version)
          VALUES ($1, $2, 'ai_plan_explanation', $3)
          ON CONFLICT (user_id, purpose, version) DO NOTHING
        `,
        [consentId, userId, aiPlanConsentVersion],
      )
      const consent = await client.query<{ id: string }>(
        `
          SELECT id FROM consent_events
          WHERE user_id = $1 AND purpose = 'ai_plan_explanation'
            AND version = $2 AND revoked_at IS NULL
        `,
        [userId, aiPlanConsentVersion],
      )
      const activeConsentId = consent.rows[0]?.id
      if (!activeConsentId) throw new ConflictException('AI explanation consent is unavailable')

      const id = randomUUID()
      const inserted = await client.query<{ id: string }>(
        `
          INSERT INTO ai_explanation_runs (
            id, user_id, plan_id, plan_revision, status,
            prompt_version, validator_version, input_fingerprint,
            idempotency_key, consent_event_id
          ) VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8, $9)
          ON CONFLICT (user_id, idempotency_key) DO NOTHING
          RETURNING id
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
          activeConsentId,
        ],
      )
      if (inserted.rows[0]) return { id }

      const existing = await client.query<RunRow>(
        'SELECT * FROM ai_explanation_runs WHERE user_id = $1 AND idempotency_key = $2',
        [userId, idempotencyKey],
      )
      const row = existing.rows[0]
      if (!row || row.input_fingerprint !== requestHash) {
        throw new ConflictException('idempotency key was already used for another request')
      }
      if (row.status === 'pending') {
        throw new ConflictException({
          code: 'ai_explanation_in_progress',
          message: '解释仍在生成，请稍后读取历史记录。',
        })
      }
      return { id: row.id, existing: mapRun(row) }
    })
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
            input_tokens = $10, output_tokens = $11, completed_at = NOW()
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
    if (!row) throw new ConflictException('AI explanation run is no longer pending')
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
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ context, consentVersion: input.consent.version }))
      .digest('hex')
    const reservation = await this.reserve(
      userId,
      planId,
      plan.revision,
      idempotencyKey,
      requestHash,
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
        content = buildDeterministicAiFallback(context)
        source = 'fallback'
        provider = worker.provider
        model = worker.model
        failureCode = 'safety_validation_failed'
      }
    } else {
      content = buildDeterministicAiFallback(context)
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
