import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common'
import {
  progressPhotoAnalysisConsentPurpose,
  progressPhotoAnalysisConsentVersion,
  progressPhotoAnalysisRetentionHours,
  progressPhotoContentTypes,
  progressPhotoItemSchema,
  progressPhotoListSchema,
  progressPhotoMaxBytes,
  progressPhotoPreviewTtlSeconds,
  progressPhotoQualityMethodVersion,
  progressPhotoRetentionConsentPurpose,
  progressPhotoRetentionConsentVersion,
  progressPhotoTicketSchema,
  progressPhotoUploadTtlSeconds,
  type CreateProgressPhoto,
  type ProgressPhotoItem,
  type ProgressPhotoQuality,
  type ProgressPhotoTicket,
} from '@myfitness/contracts'
import type { PoolClient, QueryResultRow } from 'pg'

import {
  APPLICATION_LIFECYCLE_POLICY,
  type ApplicationLifecyclePolicy,
} from '../application-lifecycle'
import { getRuntimeConfig } from '../config'
import { DatabaseService } from '../database/database.service'
import { PhotoStorageService, type StoredPhoto } from '../nutrition/photo-storage.service'
import { DataOperationsService } from '../operations/data-operations.service'
import { analyzeProgressPhotoQuality } from './progress-photo-quality'

type ProgressPhotoRow = QueryResultRow & {
  id: string
  user_id: string
  status: 'reserved' | 'ready' | 'deleted' | 'expired'
  view: 'front' | 'side' | 'back'
  retention_mode: 'analysis_only' | 'retained'
  captured_at: Date
  timezone: string
  storage_key: string | null
  quality: ProgressPhotoQuality | null
  input_fingerprint: string
  upload_expires_at: Date
  retention_expires_at: Date | null
  media_deletion_status: 'not_required' | 'pending' | 'deleted'
  analysis_revoked_at: Date | null
  created_at: Date
  completed_at: Date | null
  deleted_at: Date | null
}

type UploadedPhoto = { buffer: Buffer; mimetype: string; size: number }

@Injectable()
export class ProgressPhotosService implements OnModuleInit, OnModuleDestroy {
  private readonly config = getRuntimeConfig()
  private readonly logger = new Logger(ProgressPhotosService.name)
  private cleanupTimer?: NodeJS.Timeout

  constructor(
    private readonly database: DatabaseService,
    private readonly storage: PhotoStorageService,
    private readonly dataOperations: DataOperationsService,
    @Inject(APPLICATION_LIFECYCLE_POLICY)
    private readonly lifecycle: ApplicationLifecyclePolicy,
  ) {}

  async onModuleInit() {
    if (!this.lifecycle.runBackgroundJobs) return
    await this.expireOld()
    this.cleanupTimer = setInterval(
      () => {
        void this.expireOld().catch(() => {
          this.logger.error('progress-photo expiry reconciliation failed')
        })
      },
      15 * 60 * 1_000,
    )
    this.cleanupTimer.unref()
  }

  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer)
  }

  private sign(id: string, userId: string, action: 'upload' | 'preview', expires: number) {
    const payload = `progress:${action}:${id}:${userId}:${expires}`
    const signature = createHmac('sha256', this.config.photoSigningSecret)
      .update(payload)
      .digest('base64url')
    return `${expires}.${signature}`
  }

  private verify(token: string, id: string, userId: string, action: 'upload' | 'preview') {
    const [rawExpires, signature, extra] = token.split('.')
    const expires = Number(rawExpires)
    if (
      extra ||
      !signature ||
      !Number.isInteger(expires) ||
      expires < Math.floor(Date.now() / 1_000)
    ) {
      throw new UnauthorizedException('photo link is invalid or expired')
    }
    const expected = this.sign(id, userId, action, expires).split('.')[1]!
    const actualBytes = Buffer.from(signature)
    const expectedBytes = Buffer.from(expected)
    if (
      actualBytes.length !== expectedBytes.length ||
      !timingSafeEqual(actualBytes, expectedBytes)
    ) {
      throw new UnauthorizedException('photo link is invalid or expired')
    }
  }

  private uploadPath(id: string, userId: string, expires: number) {
    return `/v1/progress-photos/${id}/upload?token=${this.sign(id, userId, 'upload', expires)}`
  }

  private previewPath(id: string, userId: string) {
    const expires = Math.floor(Date.now() / 1_000) + progressPhotoPreviewTtlSeconds
    return `/v1/progress-photos/${id}/preview?token=${this.sign(id, userId, 'preview', expires)}`
  }

  private ticket(row: ProgressPhotoRow): ProgressPhotoTicket {
    const uploadExpires = Math.min(
      Math.floor(row.upload_expires_at.getTime() / 1_000),
      Math.floor(Date.now() / 1_000) + progressPhotoUploadTtlSeconds,
    )
    return progressPhotoTicketSchema.parse({
      id: row.id,
      status: 'reserved',
      view: row.view,
      retentionMode: row.retention_mode,
      upload: {
        path: this.uploadPath(row.id, row.user_id, uploadExpires),
        expiresAt: new Date(uploadExpires * 1_000).toISOString(),
        maxBytes: progressPhotoMaxBytes,
        acceptedContentTypes: progressPhotoContentTypes,
      },
      capturedAt: row.captured_at.toISOString(),
      timezone: row.timezone,
      createdAt: row.created_at.toISOString(),
    })
  }

  private item(row: ProgressPhotoRow): ProgressPhotoItem {
    if (row.status !== 'ready' || !row.storage_key) {
      throw new ConflictException('progress photo is not ready for review')
    }
    return progressPhotoItemSchema.parse({
      id: row.id,
      status: 'ready',
      view: row.view,
      retentionMode: row.retention_mode,
      previewPath: this.previewPath(row.id, row.user_id),
      analysisAvailable: Boolean(row.quality),
      quality: row.quality,
      mediaDeleted: false,
      mediaDeletionStatus: 'not_required',
      capturedAt: row.captured_at.toISOString(),
      timezone: row.timezone,
      expiresAt: row.retention_expires_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
    })
  }

  async reserve(
    userId: string,
    idempotencyKey: string,
    input: CreateProgressPhoto,
  ): Promise<ProgressPhotoTicket> {
    await this.expireOld()
    const capturedAt = new Date(input.capturedAt)
    if (capturedAt.getTime() > Date.now() + 5 * 60 * 1_000) {
      throw new ConflictException('capture time cannot be in the future')
    }
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex')
    return this.database.withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `progress-photo:${userId}:${idempotencyKey}`,
      ])
      const existing = await client.query<ProgressPhotoRow>(
        'SELECT * FROM progress_photos WHERE user_id = $1 AND idempotency_key = $2',
        [userId, idempotencyKey],
      )
      const row = existing.rows[0]
      if (row) {
        if (row.input_fingerprint !== fingerprint) {
          throw new ConflictException('idempotency key was already used for another request')
        }
        if (row.status !== 'reserved' || row.upload_expires_at.getTime() <= Date.now()) {
          throw new ConflictException('progress photo reservation is no longer uploadable')
        }
        return this.ticket(row)
      }

      const activeUser = await client.query<{ id: string }>(
        "SELECT id FROM users WHERE id = $1 AND status = 'active' FOR UPDATE",
        [userId],
      )
      if (!activeUser.rows[0]) throw new ConflictException('account is not active')

      const analysisConsentId = randomUUID()
      await client.query(
        `INSERT INTO consent_events (id, user_id, purpose, version)
         VALUES ($1, $2, $3, $4)`,
        [
          analysisConsentId,
          userId,
          progressPhotoAnalysisConsentPurpose,
          progressPhotoAnalysisConsentVersion,
        ],
      )
      let retentionConsentId: string | null = null
      if (input.retention.mode === 'retained') {
        retentionConsentId = randomUUID()
        await client.query(
          `INSERT INTO consent_events (id, user_id, purpose, version)
           VALUES ($1, $2, $3, $4)`,
          [
            retentionConsentId,
            userId,
            progressPhotoRetentionConsentPurpose,
            progressPhotoRetentionConsentVersion,
          ],
        )
      }
      const id = randomUUID()
      const inserted = await client.query<ProgressPhotoRow>(
        `INSERT INTO progress_photos (
           id, user_id, status, view, retention_mode, captured_at, timezone,
           quality_method_version, analysis_consent_event_id, retention_consent_event_id,
           input_fingerprint, idempotency_key, upload_expires_at, retention_expires_at
         ) VALUES (
           $1, $2, 'reserved', $3, $4, $5, $6, $7, $8, $9, $10, $11,
           NOW() + ($12 * INTERVAL '1 second'),
           CASE WHEN $4 = 'analysis_only'
             THEN NOW() + ($13 * INTERVAL '1 hour') ELSE NULL END
         ) RETURNING *`,
        [
          id,
          userId,
          input.view,
          input.retention.mode,
          capturedAt,
          input.timezone,
          progressPhotoQualityMethodVersion,
          analysisConsentId,
          retentionConsentId,
          fingerprint,
          idempotencyKey,
          progressPhotoUploadTtlSeconds,
          progressPhotoAnalysisRetentionHours,
        ],
      )
      return this.ticket(inserted.rows[0]!)
    })
  }

  private async runDeletionJobs(jobIds: string[]) {
    const outcomes = await Promise.allSettled(
      jobIds.map((jobId) => this.dataOperations.runById(jobId)),
    )
    if (outcomes.some((outcome) => outcome.status === 'rejected')) {
      this.logger.error('durable progress-photo deletion persisted but immediate execution failed')
    }
  }

  private async removeDetachedObject(storageKey: string, cause: string) {
    try {
      await this.storage.remove(storageKey)
    } catch {
      const jobId = await this.database.withTransaction((client) =>
        this.dataOperations.enqueuePhotoDeletion(client, storageKey, cause),
      )
      await this.dataOperations.runById(jobId)
    }
  }

  private async markReady(
    userId: string,
    id: string,
    stored: StoredPhoto,
    quality: ProgressPhotoQuality,
  ) {
    let result
    try {
      result = await this.database.query<ProgressPhotoRow>(
        `UPDATE progress_photos
         SET status = 'ready', storage_key = $3, content_type = 'image/jpeg',
             byte_size = $4, width = $5, height = $6, media_sha256 = $7,
             quality = $8::jsonb, completed_at = NOW()
         WHERE id = $1 AND user_id = $2 AND status = 'reserved'
           AND upload_expires_at > NOW()
           AND EXISTS (SELECT 1 FROM users WHERE id = $2 AND status = 'active')
         RETURNING *`,
        [
          id,
          userId,
          stored.storageKey,
          stored.byteSize,
          stored.width,
          stored.height,
          stored.sha256,
          JSON.stringify(quality),
        ],
      )
    } catch (error) {
      await this.removeDetachedObject(stored.storageKey, 'progress_transition_failed')
      throw error
    }
    if (!result.rows[0]) {
      await this.removeDetachedObject(stored.storageKey, 'progress_reservation_inactive')
      throw new ConflictException('progress photo reservation is no longer uploadable')
    }
    return result.rows[0]
  }

  async upload(userId: string, id: string, token: string, upload: UploadedPhoto) {
    this.verify(token, id, userId, 'upload')
    await this.expireOld()
    const stored = await this.storage.sanitizeAndStore(userId, id, upload, 'progress')
    const quality = await analyzeProgressPhotoQuality(stored)
    return this.item(await this.markReady(userId, id, stored, quality))
  }

  async list(userId: string) {
    await this.expireOld()
    const result = await this.database.query<ProgressPhotoRow>(
      `SELECT * FROM progress_photos
       WHERE user_id = $1 AND status = 'ready'
       ORDER BY captured_at DESC, created_at DESC LIMIT 100`,
      [userId],
    )
    return progressPhotoListSchema.parse({ items: result.rows.map((row) => this.item(row)) })
  }

  async preview(id: string, token: string) {
    const result = await this.database.query<ProgressPhotoRow>(
      `SELECT * FROM progress_photos
       WHERE id = $1 AND status = 'ready'
         AND (retention_expires_at IS NULL OR retention_expires_at > NOW())`,
      [id],
    )
    const row = result.rows[0]
    if (!row?.storage_key) throw new NotFoundException('private progress photo is unavailable')
    this.verify(token, id, row.user_id, 'preview')
    return this.storage.read(row.storage_key)
  }

  async remove(userId: string, id: string) {
    const jobIds = await this.database.withTransaction(async (client) => {
      const owned = await client.query<ProgressPhotoRow>(
        `SELECT * FROM progress_photos
         WHERE id = $1 AND user_id = $2 AND status IN ('reserved', 'ready')
         FOR UPDATE`,
        [id, userId],
      )
      const current = owned.rows[0]
      if (!current) throw new NotFoundException('progress photo is unavailable')
      const jobIds = current.storage_key
        ? [
            await this.dataOperations.enqueuePhotoDeletion(
              client,
              current.storage_key,
              'progress_photo_deleted',
              { kind: 'progress_photo', id },
            ),
          ]
        : []
      await client.query(
        `UPDATE progress_photos
         SET status = 'deleted', storage_key = NULL, content_type = NULL,
             byte_size = NULL, width = NULL, height = NULL, media_sha256 = NULL,
             quality = NULL, media_deletion_status = $3, deleted_at = NOW()
         WHERE id = $1 AND user_id = $2 AND status IN ('reserved', 'ready')`,
        [id, userId, current.storage_key ? 'pending' : 'deleted'],
      )
      return jobIds
    })
    await this.runDeletionJobs(jobIds)
  }

  async expireOld() {
    const jobIds = await this.database.withTransaction(async (client) => {
      const expired = await client.query<ProgressPhotoRow>(
        `SELECT * FROM progress_photos
         WHERE (status = 'reserved' AND upload_expires_at <= NOW())
            OR (status = 'ready' AND retention_expires_at IS NOT NULL
                AND retention_expires_at <= NOW())
         ORDER BY COALESCE(retention_expires_at, upload_expires_at)
         FOR UPDATE SKIP LOCKED LIMIT 100`,
      )
      const jobIds: string[] = []
      for (const row of expired.rows) {
        if (row.storage_key) {
          jobIds.push(
            await this.dataOperations.enqueuePhotoDeletion(
              client,
              row.storage_key,
              'progress_retention_expired',
              { kind: 'progress_photo', id: row.id },
            ),
          )
        }
      }
      if (expired.rows.length) {
        await client.query(
          `UPDATE progress_photos
           SET status = 'expired', storage_key = NULL, content_type = NULL,
               byte_size = NULL, width = NULL, height = NULL, media_sha256 = NULL,
               quality = NULL,
               media_deletion_status = CASE WHEN storage_key IS NULL THEN 'deleted' ELSE 'pending' END,
               deleted_at = NOW()
           WHERE id = ANY($1::uuid[]) AND status IN ('reserved', 'ready')`,
          [expired.rows.map((row) => row.id)],
        )
      }
      return jobIds
    })
    await this.runDeletionJobs(jobIds)
  }

  async revokeAnalysisForUser(userId: string) {
    const { count, jobIds } = await this.database.withTransaction(async (client) => {
      const rows = await client.query<ProgressPhotoRow>(
        `SELECT * FROM progress_photos
         WHERE user_id = $1 AND status IN ('reserved', 'ready') FOR UPDATE`,
        [userId],
      )
      const disposable = rows.rows.filter(
        (row) => row.status === 'reserved' || row.retention_mode === 'analysis_only',
      )
      const jobIds: string[] = []
      for (const row of disposable) {
        if (row.storage_key) {
          jobIds.push(
            await this.dataOperations.enqueuePhotoDeletion(
              client,
              row.storage_key,
              'progress_analysis_revoked',
              { kind: 'progress_photo', id: row.id },
            ),
          )
        }
      }
      if (disposable.length) {
        await client.query(
          `UPDATE progress_photos
           SET status = 'deleted', storage_key = NULL, content_type = NULL,
               byte_size = NULL, width = NULL, height = NULL, media_sha256 = NULL,
               quality = NULL,
               media_deletion_status = CASE WHEN storage_key IS NULL THEN 'deleted' ELSE 'pending' END,
               analysis_revoked_at = NOW(), deleted_at = NOW()
           WHERE id = ANY($1::uuid[])`,
          [disposable.map((row) => row.id)],
        )
      }
      await client.query(
        `UPDATE progress_photos SET quality = NULL, analysis_revoked_at = NOW()
         WHERE user_id = $1 AND status = 'ready' AND retention_mode = 'retained'`,
        [userId],
      )
      return { count: rows.rowCount ?? 0, jobIds }
    })
    await this.runDeletionJobs(jobIds)
    return count
  }

  async purgeForUser(userId: string) {
    const { count, jobIds } = await this.database.withTransaction(async (client) => {
      const rows = await client.query<{ id: string; storage_key: string | null }>(
        'SELECT id, storage_key FROM progress_photos WHERE user_id = $1 FOR UPDATE',
        [userId],
      )
      const jobIds: string[] = []
      for (const row of rows.rows) {
        if (row.storage_key) {
          jobIds.push(
            await this.dataOperations.enqueuePhotoDeletion(
              client,
              row.storage_key,
              'progress_retention_revoked',
            ),
          )
        }
      }
      jobIds.push(
        await this.dataOperations.enqueuePhotoPrefixDeletion(
          client,
          userId,
          'progress_retention_revoked',
          'progress',
        ),
      )
      await client.query('DELETE FROM progress_photos WHERE user_id = $1', [userId])
      return { count: rows.rowCount ?? 0, jobIds }
    })
    await this.runDeletionJobs(jobIds)
    return count
  }
}
