import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common'
import {
  foodPhotoAnalysisSchema,
  foodPhotoConsentPurpose,
  foodPhotoConsentVersion,
  foodPhotoContentTypes,
  foodPhotoMaxBytes,
  foodPhotoPreviewTtlSeconds,
  foodPhotoPromptVersion,
  foodPhotoRetentionHours,
  foodPhotoTicketSchema,
  foodPhotoUploadTtlSeconds,
  foodPhotoValidatorVersion,
  foodPhotoWorkerResponseSchema,
  starterFoodCatalog,
  type ConfirmFoodPhotoCandidate,
  type FoodPhotoAnalysis,
  type FoodPhotoCandidateContent,
  type FoodPhotoTicket,
  type FoodPhotoWorkerResponse,
} from '@myfitness/contracts'
import { validateFoodPhotoCandidates, validateFoodPhotoConfirmation } from '@myfitness/domain'
import type { QueryResultRow } from 'pg'

import { getRuntimeConfig } from '../config'
import { DatabaseService } from '../database/database.service'
import { PhotoStorageService, type StoredPhoto } from './photo-storage.service'

type PhotoStatus =
  'reserved' | 'processing' | 'ready' | 'failed' | 'rejected' | 'confirmed' | 'deleted' | 'expired'

type PhotoRow = QueryResultRow & {
  id: string
  user_id: string
  status: PhotoStatus
  storage_key: string | null
  source: 'model' | 'fixture' | null
  provider: 'fixture' | 'openai' | null
  model: string | null
  content: FoodPhotoCandidateContent | null
  selection: Array<{ catalogKey: string; grams: number }> | null
  failure_code: FoodPhotoWorkerResponse['failureCode']
  expires_at: Date
  created_at: Date
  completed_at: Date | null
  confirmed_at: Date | null
  deleted_at: Date | null
  input_fingerprint: string
}

type UploadedPhoto = { buffer: Buffer; mimetype: string; size: number }

@Injectable()
export class PhotoCandidatesService implements OnModuleInit, OnModuleDestroy {
  private readonly config = getRuntimeConfig()
  private readonly logger = new Logger(PhotoCandidatesService.name)
  private cleanupTimer?: NodeJS.Timeout

  constructor(
    private readonly database: DatabaseService,
    private readonly storage: PhotoStorageService,
  ) {}

  async onModuleInit() {
    await this.expireOld()
    this.cleanupTimer = setInterval(
      () => {
        void this.expireOld().catch(() => {
          this.logger.error('food-photo expiry reconciliation failed')
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
    const payload = `${action}:${id}:${userId}:${expires}`
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
    return `/v1/nutrition/photo-candidates/${id}/upload?token=${this.sign(id, userId, 'upload', expires)}`
  }

  private previewPath(id: string, userId: string) {
    const expires = Math.floor(Date.now() / 1_000) + foodPhotoPreviewTtlSeconds
    return `/v1/nutrition/photo-candidates/${id}/preview?token=${this.sign(id, userId, 'preview', expires)}`
  }

  private ticket(row: PhotoRow): FoodPhotoTicket {
    const uploadExpires = Math.floor(Date.now() / 1_000) + foodPhotoUploadTtlSeconds
    const uploadExpiresAt = new Date(uploadExpires * 1_000).toISOString()
    return foodPhotoTicketSchema.parse({
      id: row.id,
      status: 'reserved',
      upload: {
        path: this.uploadPath(row.id, row.user_id, uploadExpires),
        expiresAt: uploadExpiresAt,
        maxBytes: foodPhotoMaxBytes,
        acceptedContentTypes: foodPhotoContentTypes,
      },
      createdAt: row.created_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
    })
  }

  private analysis(row: PhotoRow): FoodPhotoAnalysis {
    if (!['ready', 'failed', 'rejected'].includes(row.status)) {
      throw new ConflictException('photo candidate is not ready for review')
    }
    return foodPhotoAnalysisSchema.parse({
      id: row.id,
      status: row.status,
      previewPath: row.status === 'ready' ? this.previewPath(row.id, row.user_id) : null,
      content: row.content,
      source: row.source,
      provider: row.provider,
      model: row.model,
      promptVersion: foodPhotoPromptVersion,
      validatorVersion: foodPhotoValidatorVersion,
      failureCode: row.failure_code,
      mediaDeleted: row.status !== 'ready',
      createdAt: row.created_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
    })
  }

  async reserve(userId: string, idempotencyKey: string): Promise<FoodPhotoTicket> {
    await this.expireOld()
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ consent: foodPhotoConsentVersion }))
      .digest('hex')
    return this.database.withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `food-photo:${userId}:${idempotencyKey}`,
      ])
      const existing = await client.query<PhotoRow>(
        'SELECT * FROM nutrition_photo_candidates WHERE user_id = $1 AND idempotency_key = $2',
        [userId, idempotencyKey],
      )
      const row = existing.rows[0]
      if (!row || row.input_fingerprint !== fingerprint) {
        if (row) throw new ConflictException('idempotency key was already used for another request')
      } else {
        if (row.status !== 'reserved' || row.expires_at.getTime() <= Date.now()) {
          throw new ConflictException('photo reservation is no longer uploadable')
        }
        return this.ticket(row)
      }

      const activeUser = await client.query<{ id: string }>(
        "SELECT id FROM users WHERE id = $1 AND status = 'active' FOR UPDATE",
        [userId],
      )
      if (!activeUser.rows[0]) throw new ConflictException('account is not active')

      const consentId = randomUUID()
      await client.query(
        `INSERT INTO consent_events (id, user_id, purpose, version)
         VALUES ($1, $2, $3, $4)`,
        [consentId, userId, foodPhotoConsentPurpose, foodPhotoConsentVersion],
      )
      const id = randomUUID()
      const inserted = await client.query<PhotoRow>(
        `
          INSERT INTO nutrition_photo_candidates (
            id, user_id, status, prompt_version, validator_version,
            input_fingerprint, idempotency_key, consent_event_id, expires_at
          ) VALUES ($1, $2, 'reserved', $3, $4, $5, $6, $7,
                    NOW() + ($8 * INTERVAL '1 hour'))
          RETURNING *
        `,
        [
          id,
          userId,
          foodPhotoPromptVersion,
          foodPhotoValidatorVersion,
          fingerprint,
          idempotencyKey,
          consentId,
          foodPhotoRetentionHours,
        ],
      )
      const created = inserted.rows[0]
      if (!created) throw new ConflictException('photo reservation could not be created')
      return this.ticket(created)
    })
  }

  private async worker(id: string, buffer: Buffer): Promise<FoodPhotoWorkerResponse | null> {
    try {
      const response = await fetch(`${this.config.aiServiceUrl}/v1/food-photo-candidates`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.config.aiServiceToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          requestId: id,
          promptVersion: foodPhotoPromptVersion,
          validatorVersion: foodPhotoValidatorVersion,
          imageDataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}`,
          allowedFoods: starterFoodCatalog.map((food) => ({
            catalogKey: food.foodKey,
            label: food.name,
            category: food.category,
          })),
        }),
        signal: AbortSignal.timeout(this.config.aiTimeoutMs),
      })
      if (!response.ok) return null
      const parsed = foodPhotoWorkerResponseSchema.safeParse(await response.json())
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }

  private async markProcessing(userId: string, id: string, stored: StoredPhoto) {
    let result
    try {
      result = await this.database.query<PhotoRow>(
        `
          UPDATE nutrition_photo_candidates
          SET status = 'processing', storage_key = $3, content_type = 'image/jpeg',
              byte_size = $4, width = $5, height = $6, media_sha256 = $7
           WHERE id = $1 AND user_id = $2 AND status = 'reserved' AND expires_at > NOW()
             AND EXISTS (SELECT 1 FROM users WHERE id = $2 AND status = 'active')
          RETURNING *
        `,
        [
          id,
          userId,
          stored.storageKey,
          stored.byteSize,
          stored.width,
          stored.height,
          stored.sha256,
        ],
      )
    } catch (error) {
      await this.storage.remove(stored.storageKey)
      throw error
    }
    if (!result.rows[0]) {
      await this.storage.remove(stored.storageKey)
      throw new ConflictException('photo reservation is no longer uploadable')
    }
  }

  private async fail(
    id: string,
    worker: FoodPhotoWorkerResponse | null,
    failureCode: NonNullable<FoodPhotoWorkerResponse['failureCode']>,
  ) {
    const current = await this.database.query<{ storage_key: string | null }>(
      "SELECT storage_key FROM nutrition_photo_candidates WHERE id = $1 AND status = 'processing'",
      [id],
    )
    if (current.rows[0]?.storage_key) await this.storage.remove(current.rows[0].storage_key)
    const result = await this.database.query<PhotoRow>(
      `
        UPDATE nutrition_photo_candidates
        SET status = 'failed', storage_key = NULL, content_type = NULL, byte_size = NULL,
            width = NULL, height = NULL, media_sha256 = NULL,
            provider = $2, model = $3, failure_code = $4,
            provider_response_id = $5, latency_ms = $6,
            input_tokens = $7, output_tokens = $8,
            completed_at = NOW(), deleted_at = NOW()
        WHERE id = $1 AND status = 'processing'
        RETURNING *
      `,
      [
        id,
        worker?.provider ?? null,
        worker?.model ?? null,
        failureCode,
        worker?.providerResponseId ?? null,
        worker?.latencyMs ?? 0,
        worker?.usage?.inputTokens ?? null,
        worker?.usage?.outputTokens ?? null,
      ],
    )
    if (!result.rows[0]) throw new ConflictException('photo analysis state changed')
    return this.analysis(result.rows[0])
  }

  async upload(userId: string, id: string, token: string, upload: UploadedPhoto) {
    this.verify(token, id, userId, 'upload')
    await this.expireOld()
    const stored = await this.storage.sanitizeAndStore(userId, id, upload)
    await this.markProcessing(userId, id, stored)

    const worker = await this.worker(id, stored.buffer)
    if (!worker || worker.status === 'failed') {
      return this.fail(id, worker, worker?.failureCode ?? 'provider_unavailable')
    }
    const validation = validateFoodPhotoCandidates(worker.content)
    if (!validation.valid) return this.fail(id, worker, 'safety_validation_failed')

    const rejected = validation.content.safetyStatus === 'rejected'
    if (rejected) await this.storage.remove(stored.storageKey)
    const result = await this.database.query<PhotoRow>(
      `
        UPDATE nutrition_photo_candidates
        SET status = $2, storage_key = CASE WHEN $2 = 'rejected' THEN NULL ELSE storage_key END,
            content_type = CASE WHEN $2 = 'rejected' THEN NULL ELSE content_type END,
            byte_size = CASE WHEN $2 = 'rejected' THEN NULL ELSE byte_size END,
            width = CASE WHEN $2 = 'rejected' THEN NULL ELSE width END,
            height = CASE WHEN $2 = 'rejected' THEN NULL ELSE height END,
            media_sha256 = CASE WHEN $2 = 'rejected' THEN NULL ELSE media_sha256 END,
            source = $3, provider = $4, model = $5, content = $6::jsonb,
            provider_response_id = $7, latency_ms = $8,
            input_tokens = $9, output_tokens = $10, completed_at = NOW(),
            deleted_at = CASE WHEN $2 = 'rejected' THEN NOW() ELSE NULL END
        WHERE id = $1 AND status = 'processing'
        RETURNING *
      `,
      [
        id,
        rejected ? 'rejected' : 'ready',
        worker.provider === 'openai' ? 'model' : 'fixture',
        worker.provider,
        worker.model,
        JSON.stringify(validation.content),
        worker.providerResponseId,
        worker.latencyMs,
        worker.usage?.inputTokens ?? null,
        worker.usage?.outputTokens ?? null,
      ],
    )
    if (!result.rows[0]) {
      await this.storage.remove(stored.storageKey)
      throw new ConflictException('photo analysis state changed')
    }
    return this.analysis(result.rows[0])
  }

  async list(userId: string) {
    await this.expireOld()
    const result = await this.database.query<PhotoRow>(
      `SELECT * FROM nutrition_photo_candidates
       WHERE user_id = $1 AND status IN ('ready', 'failed', 'rejected')
       ORDER BY created_at DESC LIMIT 20`,
      [userId],
    )
    return { items: result.rows.map((row) => this.analysis(row)) }
  }

  async preview(id: string, token: string) {
    const result = await this.database.query<PhotoRow>(
      `SELECT * FROM nutrition_photo_candidates
       WHERE id = $1 AND status = 'ready' AND expires_at > NOW()`,
      [id],
    )
    const row = result.rows[0]
    if (!row) throw new NotFoundException('private photo is unavailable')
    this.verify(token, id, row.user_id, 'preview')
    if (!row.storage_key) throw new NotFoundException('private photo is unavailable')
    return this.storage.read(row.storage_key)
  }

  async confirm(userId: string, id: string, input: ConfirmFoodPhotoCandidate) {
    await this.expireOld()
    const result = await this.database.query<PhotoRow>(
      `SELECT * FROM nutrition_photo_candidates
       WHERE id = $1 AND user_id = $2 AND status = 'ready' AND expires_at > NOW()`,
      [id, userId],
    )
    const row = result.rows[0]
    if (!row || !row.content) throw new NotFoundException('photo candidate is unavailable')
    if (!validateFoodPhotoConfirmation(row.content, input)) {
      throw new UnprocessableEntityException('selection must use displayed candidates and ranges')
    }

    if (!row.storage_key) throw new NotFoundException('private photo is unavailable')
    await this.storage.remove(row.storage_key)
    const updated = await this.database.query<PhotoRow>(
      `
        UPDATE nutrition_photo_candidates
        SET status = 'confirmed', storage_key = NULL, content_type = NULL, byte_size = NULL,
            width = NULL, height = NULL, media_sha256 = NULL, content = NULL,
            selection = $3::jsonb, confirmed_at = NOW(), deleted_at = NOW()
        WHERE id = $1 AND user_id = $2 AND status = 'ready'
        RETURNING *
      `,
      [id, userId, JSON.stringify(input.items)],
    )
    if (!updated.rows[0]) throw new ConflictException('photo candidate state changed')
    return {
      photoCandidateId: id,
      status: 'confirmed' as const,
      items: input.items,
      mediaDeleted: true as const,
      confirmedAt: updated.rows[0].confirmed_at!.toISOString(),
    }
  }

  async remove(userId: string, id: string) {
    const owned = await this.database.query<{ id: string; storage_key: string | null }>(
      `SELECT id, storage_key FROM nutrition_photo_candidates
       WHERE id = $1 AND user_id = $2
         AND status IN ('reserved', 'processing', 'ready', 'failed', 'rejected')`,
      [id, userId],
    )
    if (!owned.rows[0]) throw new NotFoundException('photo candidate is unavailable')
    if (owned.rows[0].storage_key) await this.storage.remove(owned.rows[0].storage_key)
    const result = await this.database.query<PhotoRow>(
      `
        UPDATE nutrition_photo_candidates
        SET status = 'deleted', storage_key = NULL, content_type = NULL, byte_size = NULL,
            width = NULL, height = NULL, media_sha256 = NULL, content = NULL,
            selection = NULL, deleted_at = NOW()
        WHERE id = $1 AND user_id = $2 AND status IN ('reserved', 'processing', 'ready', 'failed', 'rejected')
        RETURNING *
      `,
      [id, userId],
    )
    if (!result.rows[0]) throw new NotFoundException('photo candidate is unavailable')
  }

  async expireOld() {
    const expired = await this.database.query<{ id: string; storage_key: string | null }>(
      `SELECT id, storage_key FROM nutrition_photo_candidates
       WHERE status IN ('reserved', 'processing', 'ready') AND expires_at <= NOW()`,
    )
    await Promise.all(
      expired.rows.map((row) =>
        row.storage_key ? this.storage.remove(row.storage_key) : Promise.resolve(),
      ),
    )
    if (!expired.rows.length) return
    await this.database.query(
      `
        UPDATE nutrition_photo_candidates
        SET status = 'expired', storage_key = NULL, content_type = NULL, byte_size = NULL,
            width = NULL, height = NULL, media_sha256 = NULL, content = NULL,
            selection = NULL, deleted_at = NOW()
        WHERE id = ANY($1::uuid[]) AND status IN ('reserved', 'processing', 'ready')
      `,
      [expired.rows.map((row) => row.id)],
    )
  }

  async purgeForUser(userId: string) {
    const owned = await this.database.query<{ storage_key: string | null }>(
      'SELECT storage_key FROM nutrition_photo_candidates WHERE user_id = $1',
      [userId],
    )
    await Promise.all(
      owned.rows.map((row) =>
        row.storage_key ? this.storage.remove(row.storage_key) : Promise.resolve(),
      ),
    )
    await this.storage.removeUserDirectory(userId)
    const deleted = await this.database.query(
      'DELETE FROM nutrition_photo_candidates WHERE user_id = $1',
      [userId],
    )
    return deleted.rowCount ?? 0
  }
}
