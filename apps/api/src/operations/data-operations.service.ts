import { randomUUID } from 'node:crypto'

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { userAuthProviderSchema, type UserAuthProvider } from '@myfitness/contracts'
import type { PoolClient, QueryResultRow } from 'pg'

import { getRuntimeConfig } from '../config'
import { DatabaseService } from '../database/database.service'
import { PhotoStorageService } from '../nutrition/photo-storage.service'
import { ErasureLedgerService } from '../privacy/erasure-ledger.service'

export type DataOperationErrorCode =
  'object_storage_unavailable' | 'database_unavailable' | 'invalid_job_payload' | 'unexpected_error'

type JobStatus = 'queued' | 'running' | 'retry_wait' | 'succeeded' | 'dead_letter'

type DataOperationJob = QueryResultRow & {
  id: string
  kind: 'photo_object_delete' | 'photo_prefix_delete' | 'account_erasure'
  status: JobStatus
  payload: Record<string, unknown>
  receipt_id: string | null
  attempt_count: number
  max_attempts: number
  lease_token: string | null
  created_at: Date
}

class InvalidJobPayloadError extends Error {}

class ObjectStorageOperationError extends Error {
  constructor(readonly cause: unknown) {
    super('object storage operation failed')
  }
}

const storageKeyPattern =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/)?[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

@Injectable()
export class DataOperationsService implements OnModuleInit, OnModuleDestroy {
  private readonly config = getRuntimeConfig()
  private readonly logger = new Logger(DataOperationsService.name)
  private workerTimer?: NodeJS.Timeout
  private draining = false

  constructor(
    private readonly database: DatabaseService,
    private readonly photos: PhotoStorageService,
    private readonly erasureLedger: ErasureLedgerService,
  ) {}

  async onModuleInit() {
    if (!this.config.dataOperationsWorkerEnabled) return
    await this.drain().catch(() => this.logger.error('initial durable data-operation drain failed'))
    this.workerTimer = setInterval(() => {
      void this.drain().catch(() => this.logger.error('durable data-operation drain failed'))
    }, this.config.dataOperationsPollMs)
    this.workerTimer.unref()
  }

  onModuleDestroy() {
    if (this.workerTimer) clearInterval(this.workerTimer)
  }

  async enqueuePhotoDeletion(
    client: PoolClient,
    storageKey: string,
    cause: string,
    candidateId?: string,
  ) {
    if (!storageKeyPattern.test(storageKey)) throw new InvalidJobPayloadError()
    if (candidateId && !uuidPattern.test(candidateId)) throw new InvalidJobPayloadError()
    const result = await client.query<{ id: string }>(
      `INSERT INTO data_operation_jobs (id, kind, payload, dedupe_key)
       VALUES ($1, 'photo_object_delete', $2::jsonb, $3)
       ON CONFLICT (dedupe_key) DO UPDATE SET updated_at = data_operation_jobs.updated_at
       RETURNING id`,
      [
        randomUUID(),
        JSON.stringify({ storageKey, candidateId, cause: cause.slice(0, 80) }),
        `photo-delete:${storageKey}`,
      ],
    )
    return result.rows[0]!.id
  }

  async enqueuePhotoPrefixDeletion(client: PoolClient, userId: string, cause: string) {
    if (!uuidPattern.test(userId)) throw new InvalidJobPayloadError()
    const result = await client.query<{ id: string }>(
      `INSERT INTO data_operation_jobs (id, kind, payload, dedupe_key)
       VALUES ($1, 'photo_prefix_delete', $2::jsonb, $3)
       ON CONFLICT (dedupe_key) DO UPDATE SET updated_at = data_operation_jobs.updated_at
       RETURNING id`,
      [
        randomUUID(),
        JSON.stringify({ userId, cause: cause.slice(0, 80) }),
        `photo-prefix-delete:${userId}`,
      ],
    )
    return result.rows[0]!.id
  }

  async enqueueAccountErasure(client: PoolClient, receiptId: string, userId: string) {
    if (!uuidPattern.test(receiptId) || !uuidPattern.test(userId)) {
      throw new InvalidJobPayloadError()
    }
    const result = await client.query<{ id: string }>(
      `INSERT INTO data_operation_jobs (id, kind, payload, receipt_id, dedupe_key, max_attempts)
       VALUES ($1, 'account_erasure', $2::jsonb, $3, $4, 20)
       RETURNING id`,
      [randomUUID(), JSON.stringify({ userId }), receiptId, `account-erasure:${receiptId}`],
    )
    return result.rows[0]!.id
  }

  private async claimById(id: string) {
    const leaseToken = randomUUID()
    return this.database.withTransaction(async (client) => {
      const claimed = await client.query<DataOperationJob>(
        `UPDATE data_operation_jobs
         SET status = 'running', attempt_count = attempt_count + 1,
             lease_token = $2, lease_expires_at = NOW() + INTERVAL '2 minutes',
             updated_at = NOW()
         WHERE id = $1
           AND attempt_count < max_attempts
           AND (
             (status IN ('queued', 'retry_wait') AND available_at <= NOW())
             OR (status = 'running' AND lease_expires_at <= NOW())
           )
         RETURNING *`,
        [id, leaseToken],
      )
      const job = claimed.rows[0]
      if (!job?.receipt_id) return job
      await client.query(
        `UPDATE privacy_erasure_receipts
         SET status = 'running', updated_at = NOW(), last_error_code = NULL
         WHERE receipt_id = $1 AND status IN ('queued', 'running')`,
        [job.receipt_id],
      )
      return job
    })
  }

  private async claimNext() {
    const leaseToken = randomUUID()
    return this.database.withTransaction(async (client) => {
      const claimed = await client.query<DataOperationJob>(
        `WITH candidate AS (
           SELECT id
           FROM data_operation_jobs
           WHERE attempt_count < max_attempts
             AND (
               (status IN ('queued', 'retry_wait') AND available_at <= NOW())
               OR (status = 'running' AND lease_expires_at <= NOW())
             )
           ORDER BY available_at, created_at
           FOR UPDATE SKIP LOCKED
           LIMIT 1
         )
         UPDATE data_operation_jobs AS job
         SET status = 'running', attempt_count = job.attempt_count + 1,
             lease_token = $1, lease_expires_at = NOW() + INTERVAL '2 minutes',
             updated_at = NOW()
         FROM candidate
         WHERE job.id = candidate.id
         RETURNING job.*`,
        [leaseToken],
      )
      const job = claimed.rows[0]
      if (!job?.receipt_id) return job
      await client.query(
        `UPDATE privacy_erasure_receipts
         SET status = 'running', updated_at = NOW(), last_error_code = NULL
         WHERE receipt_id = $1 AND status IN ('queued', 'running')`,
        [job.receipt_id],
      )
      return job
    })
  }

  private photoPayload(job: DataOperationJob) {
    const storageKey = job.payload.storageKey
    if (typeof storageKey !== 'string' || !storageKeyPattern.test(storageKey)) {
      throw new InvalidJobPayloadError()
    }
    const candidateId = job.payload.candidateId
    if (
      candidateId !== undefined &&
      (typeof candidateId !== 'string' || !uuidPattern.test(candidateId))
    ) {
      throw new InvalidJobPayloadError()
    }
    return { storageKey, candidateId }
  }

  private photoPrefixPayload(job: DataOperationJob) {
    const userId = job.payload.userId
    if (typeof userId !== 'string' || !uuidPattern.test(userId)) {
      throw new InvalidJobPayloadError()
    }
    return { userId }
  }

  private accountPayload(job: DataOperationJob) {
    const userId = job.payload.userId
    if (typeof userId !== 'string' || !uuidPattern.test(userId) || !job.receipt_id) {
      throw new InvalidJobPayloadError()
    }
    return { userId, receiptId: job.receipt_id }
  }

  private async finishPhotoDeletion(job: DataOperationJob, startedAt: Date, candidateId?: string) {
    await this.database.withTransaction(async (client) => {
      const updated = await client.query(
        `UPDATE data_operation_jobs
         SET status = 'succeeded', payload = '{}'::jsonb, lease_token = NULL,
             dedupe_key = 'completed:' || id::text,
             lease_expires_at = NULL, last_error_code = NULL,
             updated_at = NOW(), completed_at = NOW()
         WHERE id = $1 AND status = 'running' AND lease_token = $2`,
        [job.id, job.lease_token],
      )
      if (!updated.rowCount) throw new Error('data-operation lease changed')
      if (candidateId) {
        await client.query(
          `UPDATE nutrition_photo_candidates
           SET media_deletion_status = 'deleted'
           WHERE id = $1 AND media_deletion_status = 'pending'`,
          [candidateId],
        )
      }
      await client.query(
        `INSERT INTO data_operation_attempts
           (job_id, attempt_number, outcome, started_at)
         VALUES ($1, $2, 'succeeded', $3)`,
        [job.id, job.attempt_count, startedAt],
      )
    })
  }

  private async providerDisposition(userId: string) {
    const result = await this.database.query<{
      has_openai: boolean
      has_fixture: boolean
    }>(
      `SELECT COALESCE(BOOL_OR(provider = 'openai'), FALSE) AS has_openai,
              COALESCE(BOOL_OR(provider = 'fixture'), FALSE) AS has_fixture
       FROM (
         SELECT provider FROM ai_explanation_runs WHERE user_id = $1
         UNION ALL
         SELECT provider FROM nutrition_photo_candidates WHERE user_id = $1
       ) AS provider_events`,
      [userId],
    )
    const row = result.rows[0]!
    if (row.has_openai) return 'policy_bound' as const
    return row.has_fixture ? ('fixture_only' as const) : ('not_applicable' as const)
  }

  private async performAccountErasure(job: DataOperationJob, startedAt: Date) {
    const { userId, receiptId } = this.accountPayload(job)
    const receipt = await this.database.query<{
      subject_ref: string
      requested_at: Date
    }>(
      `SELECT subject_ref, requested_at FROM privacy_erasure_receipts
       WHERE receipt_id = $1 AND requested_user_id = $2`,
      [receiptId, userId],
    )
    const receiptRow = receipt.rows[0]
    if (!receiptRow) throw new InvalidJobPayloadError()

    const providerStatus = await this.providerDisposition(userId)
    const identities = await this.database.query<{
      provider: UserAuthProvider
      provider_subject: string
    }>('SELECT provider, provider_subject FROM auth_identities WHERE user_id = $1', [userId])
    const identityRefs = identities.rows.map((identity) => ({
      provider: userAuthProviderSchema.parse(identity.provider),
      subjectRef: this.erasureLedger.identitySubjectRef(
        userAuthProviderSchema.parse(identity.provider),
        identity.provider_subject,
      ),
    }))
    const storedPhotos = await this.database.query<{ storage_key: string }>(
      `SELECT storage_key FROM nutrition_photo_candidates
       WHERE user_id = $1 AND storage_key IS NOT NULL`,
      [userId],
    )
    try {
      await this.erasureLedger.publish({
        schemaVersion: 'durable-erasure-ledger-v2',
        receiptId,
        subjectRef: receiptRow.subject_ref,
        identityRefs,
        requestedAt: receiptRow.requested_at.toISOString(),
      })
      for (const photo of storedPhotos.rows) {
        await this.photos.remove(photo.storage_key)
      }
      await this.photos.removeUserDirectory(userId)
    } catch (error) {
      throw new ObjectStorageOperationError(error)
    }

    await this.database.withTransaction(async (client) => {
      const leased = await client.query(
        `SELECT id FROM data_operation_jobs
         WHERE id = $1 AND status = 'running' AND lease_token = $2
         FOR UPDATE`,
        [job.id, job.lease_token],
      )
      if (!leased.rows[0]) throw new Error('data-operation lease changed')
      for (const identity of identityRefs) {
        await client.query(
          `INSERT INTO auth_identity_suppressions
             (provider, subject_ref, erasure_receipt_id, suppressed_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (provider, subject_ref) DO NOTHING`,
          [identity.provider, identity.subjectRef, receiptId, receiptRow.requested_at],
        )
      }
      const deleted = await client.query(
        "DELETE FROM users WHERE id = $1 AND status = 'deletion_pending'",
        [userId],
      )
      if (!deleted.rowCount) throw new InvalidJobPayloadError()
      await client.query(
        `UPDATE privacy_erasure_receipts
         SET status = 'completed', requested_user_id = NULL,
             subject_ref = NULL,
             primary_store_status = 'deleted', media_status = 'deleted',
             provider_status = $2, backup_status = 'ledger_published',
             last_error_code = NULL, completed_at = NOW(), updated_at = NOW()
         WHERE receipt_id = $1`,
        [receiptId, providerStatus],
      )
      await client.query(
        `UPDATE data_operation_jobs
         SET status = 'succeeded', payload = '{}'::jsonb, lease_token = NULL,
             dedupe_key = 'completed:' || id::text,
             lease_expires_at = NULL, last_error_code = NULL,
             updated_at = NOW(), completed_at = NOW()
         WHERE id = $1`,
        [job.id],
      )
      await client.query(
        `INSERT INTO data_operation_attempts
           (job_id, attempt_number, outcome, started_at)
         VALUES ($1, $2, 'succeeded', $3)`,
        [job.id, job.attempt_count, startedAt],
      )
    })
  }

  private classify(error: unknown): DataOperationErrorCode {
    if (error instanceof InvalidJobPayloadError) return 'invalid_job_payload'
    if (error instanceof ObjectStorageOperationError) return 'object_storage_unavailable'
    const candidate = error as { code?: string; $metadata?: { httpStatusCode?: number } }
    if (candidate.$metadata?.httpStatusCode || String(error).includes('injected')) {
      return 'object_storage_unavailable'
    }
    if (candidate.code && /^[0-9A-Z]{5}$/.test(candidate.code)) return 'database_unavailable'
    return 'unexpected_error'
  }

  private async scheduleFailure(
    job: DataOperationJob,
    startedAt: Date,
    errorCode: DataOperationErrorCode,
  ) {
    const deadLetter = job.attempt_count >= job.max_attempts || errorCode === 'invalid_job_payload'
    const delaySeconds = Math.min(3_600, 5 * 2 ** Math.max(0, job.attempt_count - 1))
    await this.database.withTransaction(async (client) => {
      const updated = await client.query(
        `UPDATE data_operation_jobs
         SET status = $3, lease_token = NULL, lease_expires_at = NULL,
             last_error_code = $4,
             available_at = CASE WHEN $3 = 'retry_wait'
               THEN NOW() + ($5 * INTERVAL '1 second') ELSE available_at END,
             updated_at = NOW()
         WHERE id = $1 AND status = 'running' AND lease_token = $2`,
        [
          job.id,
          job.lease_token,
          deadLetter ? 'dead_letter' : 'retry_wait',
          errorCode,
          delaySeconds,
        ],
      )
      if (!updated.rowCount) return
      await client.query(
        `INSERT INTO data_operation_attempts
           (job_id, attempt_number, outcome, error_code, started_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          job.id,
          job.attempt_count,
          deadLetter ? 'dead_lettered' : 'retry_scheduled',
          errorCode,
          startedAt,
        ],
      )
      if (job.receipt_id) {
        await client.query(
          `UPDATE privacy_erasure_receipts
           SET status = $2, last_error_code = $3, updated_at = NOW()
           WHERE receipt_id = $1 AND status <> 'completed'`,
          [job.receipt_id, deadLetter ? 'dead_letter' : 'queued', errorCode],
        )
      }
    })
  }

  private async execute(job: DataOperationJob) {
    const startedAt = new Date()
    try {
      if (job.kind === 'photo_object_delete') {
        const { storageKey, candidateId } = this.photoPayload(job)
        try {
          await this.photos.remove(storageKey)
        } catch (error) {
          throw new ObjectStorageOperationError(error)
        }
        await this.finishPhotoDeletion(job, startedAt, candidateId)
      } else if (job.kind === 'photo_prefix_delete') {
        const { userId } = this.photoPrefixPayload(job)
        try {
          await this.photos.removeUserDirectory(userId)
        } catch (error) {
          throw new ObjectStorageOperationError(error)
        }
        await this.finishPhotoDeletion(job, startedAt)
      } else {
        await this.performAccountErasure(job, startedAt)
      }
      return 'succeeded' as const
    } catch (error) {
      const errorCode = this.classify(error)
      await this.scheduleFailure(job, startedAt, errorCode)
      this.logger.warn(`data operation ${job.id} scheduled after ${errorCode}`)
      return 'retry_scheduled' as const
    }
  }

  async runById(id: string) {
    const job = await this.claimById(id)
    if (!job) return 'not_claimed' as const
    return this.execute(job)
  }

  async drain(limit = 20) {
    if (this.draining) return { claimed: 0, succeeded: 0 }
    this.draining = true
    let claimed = 0
    let succeeded = 0
    try {
      while (claimed < limit) {
        const job = await this.claimNext()
        if (!job) break
        claimed += 1
        if ((await this.execute(job)) === 'succeeded') succeeded += 1
      }
      return { claimed, succeeded }
    } finally {
      this.draining = false
    }
  }

  async snapshot() {
    const counts = await this.database.query<{ status: JobStatus; count: string }>(
      'SELECT status, COUNT(*)::text AS count FROM data_operation_jobs GROUP BY status',
    )
    const oldest = await this.database.query<{ oldest: Date | null }>(
      `SELECT MIN(created_at) AS oldest FROM data_operation_jobs
       WHERE status IN ('queued', 'running', 'retry_wait', 'dead_letter')`,
    )
    return {
      counts: Object.fromEntries(counts.rows.map((row) => [row.status, Number(row.count)])),
      oldestOutstandingAt: oldest.rows[0]?.oldest?.toISOString() ?? null,
    }
  }
}
