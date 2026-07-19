import { createHash, randomBytes, randomUUID } from 'node:crypto'

import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import {
  accountDeletionConfirmationPhrase,
  consentPurposes,
  privacyDataCategories,
  privacyExportContentType,
  privacyErasureScopeVersion,
  privacyExportSchema,
  privacyExportSchemaVersion,
  privacyOverviewSchema,
  revocableConsentPurposes,
  type AccountDeletionRequest,
  type AccountDeletionIntent,
  type ConsentState,
  type PrivacyExport,
  type PrivacyInventoryItem,
  type RevocableConsentPurpose,
} from '@myfitness/contracts'
import type { PoolClient, QueryResultRow } from 'pg'

import { DatabaseService } from '../database/database.service'
import { PhotoCandidatesService } from '../nutrition/photo-candidates.service'
import { PhotoStorageService } from '../nutrition/photo-storage.service'
import { DataOperationsService } from '../operations/data-operations.service'
import { ErasureLedgerService } from './erasure-ledger.service'

type InventoryRow = QueryResultRow & {
  category: PrivacyInventoryItem['category']
  record_count: string
  includes_history: boolean
  last_updated_at: Date | null
}

type ConsentRow = QueryResultRow & {
  purpose: ConsentState['purpose']
  version: string
  accepted_at: Date
  revoked_at: Date | null
}

type AccountRow = QueryResultRow & {
  id: string
  created_at: Date
}

type JsonPayloadRow = QueryResultRow & { payload: Record<string, unknown> }

const requiredConsentPurposes = new Set<ConsentState['purpose']>([
  'terms',
  'privacy',
  'health_data',
])
const deletionIntentLifetimeMs = 15 * 60 * 1000
const hashSecret = (secret: string) => createHash('sha256').update(secret).digest('hex')

const jsonSafe = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const jsonRows = async (client: PoolClient, sql: string, userId: string) =>
  (await client.query<JsonPayloadRow>(sql, [userId])).rows.map((row) => row.payload)

@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name)

  constructor(
    private readonly database: DatabaseService,
    private readonly photos: PhotoCandidatesService,
    private readonly photoStorage: PhotoStorageService,
    private readonly dataOperations: DataOperationsService,
    private readonly erasureLedger: ErasureLedgerService,
  ) {}

  private async account(userId: string) {
    const result = await this.database.query<AccountRow>(
      "SELECT id, created_at FROM users WHERE id = $1 AND status = 'active'",
      [userId],
    )
    if (!result.rows[0]) throw new NotFoundException('active account not found')
    return result.rows[0]
  }

  async overview(userId: string) {
    const account = await this.account(userId)
    const inventory = await this.database.query<InventoryRow>(
      `
        SELECT 'profile' AS category,
               ((SELECT COUNT(*) FROM user_profiles WHERE user_id = $1)
                + (SELECT COUNT(*) FROM user_goals WHERE user_id = $1))::text AS record_count,
               FALSE AS includes_history,
               GREATEST(
                 (SELECT MAX(updated_at) FROM user_profiles WHERE user_id = $1),
                 (SELECT MAX(updated_at) FROM user_goals WHERE user_id = $1)
               ) AS last_updated_at
        UNION ALL
        SELECT 'health_records', COUNT(*)::text, TRUE, MAX(updated_at)
          FROM health_records WHERE user_id = $1
        UNION ALL
        SELECT 'workouts', COUNT(*)::text, TRUE, MAX(updated_at)
          FROM workout_sessions WHERE user_id = $1
        UNION ALL
        SELECT 'nutrition',
               ((SELECT COUNT(*) FROM nutrition_meals WHERE user_id = $1)
                + (SELECT COUNT(*) FROM nutrition_favorites WHERE user_id = $1))::text,
               TRUE,
               GREATEST(
                 (SELECT MAX(updated_at) FROM nutrition_meals WHERE user_id = $1),
                 (SELECT MAX(updated_at) FROM nutrition_favorites WHERE user_id = $1)
               )
        UNION ALL
        SELECT 'plans', COUNT(*)::text, TRUE, MAX(updated_at)
          FROM weekly_plans WHERE user_id = $1
        UNION ALL
        SELECT 'ai_outputs', COUNT(*)::text, FALSE, MAX(created_at)
          FROM ai_explanation_runs WHERE user_id = $1
        UNION ALL
        SELECT 'photo_analyses', COUNT(*)::text, FALSE, MAX(created_at)
          FROM nutrition_photo_candidates WHERE user_id = $1
        UNION ALL
        SELECT 'consent_receipts', COUNT(*)::text, TRUE, MAX(accepted_at)
          FROM consent_events WHERE user_id = $1
      `,
      [userId],
    )
    const itemByCategory = new Map(inventory.rows.map((item) => [item.category, item]))
    const inventoryItems = privacyDataCategories.map((category) => {
      const item = itemByCategory.get(category)
      return {
        category,
        recordCount: Number(item?.record_count ?? 0),
        includesHistory: item?.includes_history ?? false,
        lastUpdatedAt: item?.last_updated_at?.toISOString() ?? null,
      }
    })

    const consentResult = await this.database.query<ConsentRow>(
      `
        SELECT DISTINCT ON (purpose) purpose, version, accepted_at, revoked_at
        FROM consent_events
        WHERE user_id = $1
        ORDER BY purpose, accepted_at DESC
      `,
      [userId],
    )
    const latestConsent = new Map(consentResult.rows.map((row) => [row.purpose, row]))
    const consents = consentPurposes.map((purpose) => {
      const row = latestConsent.get(purpose)
      return {
        purpose,
        status: !row
          ? ('never_granted' as const)
          : row.revoked_at
            ? ('revoked' as const)
            : ('active' as const),
        requiredForService: requiredConsentPurposes.has(purpose),
        revocable: revocableConsentPurposes.includes(purpose as RevocableConsentPurpose),
        version: row?.version ?? null,
        acceptedAt: row?.accepted_at.toISOString() ?? null,
        revokedAt: row?.revoked_at?.toISOString() ?? null,
      }
    })
    const activePhotoCount = await this.database.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM nutrition_photo_candidates
       WHERE user_id = $1 AND storage_key IS NOT NULL`,
      [userId],
    )

    return privacyOverviewSchema.parse({
      generatedAt: new Date().toISOString(),
      accountCreatedAt: account.created_at.toISOString(),
      totalRecordCount: inventoryItems.reduce((sum, item) => sum + item.recordCount, 0),
      activePhotoCount: Number(activePhotoCount.rows[0]?.count ?? 0),
      inventory: inventoryItems,
      consents,
      portableExport: {
        schemaVersion: privacyExportSchemaVersion,
        contentType: privacyExportContentType,
        includesHistory: true,
        includesActiveSanitizedPhotos: true,
      },
      deletion: {
        confirmationPhrase: accountDeletionConfirmationPhrase,
        permanent: true,
      },
    })
  }

  async portableExport(userId: string): Promise<PrivacyExport> {
    const payload = await this.database.withTransaction(async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
      const accountResult = await client.query<JsonPayloadRow>(
        `SELECT to_jsonb(account) AS payload
         FROM (SELECT id, status, created_at, updated_at FROM users WHERE id = $1) AS account`,
        [userId],
      )
      const account = accountResult.rows[0]?.payload
      if (!account) throw new NotFoundException('active account not found')

      const identities = await jsonRows(
        client,
        `SELECT to_jsonb(identity) AS payload FROM (
           SELECT id, provider, provider_subject, verified_at, created_at
           FROM auth_identities WHERE user_id = $1 ORDER BY created_at
         ) AS identity`,
        userId,
      )
      const profileRows = await jsonRows(
        client,
        `SELECT to_jsonb(profile) AS payload FROM (
           SELECT display_name, age_band, sex_for_calculations, height_cm, display_height,
                  display_height_unit, unit_system, timezone, adult_confirmed_at,
                  risk_status, risk_flags, revision, created_at, updated_at
           FROM user_profiles WHERE user_id = $1
         ) AS profile`,
        userId,
      )
      const goalRows = await jsonRows(
        client,
        `SELECT to_jsonb(goal) AS payload FROM (
           SELECT primary_goal, experience, available_days, session_minutes, equipment,
                  dietary_preferences, created_at, updated_at
           FROM user_goals WHERE user_id = $1
         ) AS goal`,
        userId,
      )
      const consentEvents = await jsonRows(
        client,
        `SELECT to_jsonb(consent) AS payload FROM (
           SELECT id, purpose, version, accepted_at, revoked_at
           FROM consent_events WHERE user_id = $1 ORDER BY accepted_at
         ) AS consent`,
        userId,
      )
      const healthRecords = await jsonRows(
        client,
        `SELECT to_jsonb(record) AS payload FROM (
           SELECT id, metric, canonical_value, canonical_unit, display_value, display_unit,
                  source_kind, source_metadata, confidence, status, occurred_at, timezone,
                  revision, deleted_at, created_at, updated_at
           FROM health_records WHERE user_id = $1 ORDER BY occurred_at, created_at
         ) AS record`,
        userId,
      )
      const healthRecordRevisions = await jsonRows(
        client,
        `SELECT to_jsonb(history) AS payload FROM (
           SELECT id, record_id, action, revision, metric, canonical_value, canonical_unit,
                  display_value, display_unit, source_kind, source_metadata, confidence,
                  status, occurred_at, timezone, created_at, updated_at, changed_at
           FROM health_record_revisions WHERE user_id = $1 ORDER BY changed_at, revision
         ) AS history`,
        userId,
      )
      const workouts = await jsonRows(
        client,
        `SELECT (
           to_jsonb(workout) || jsonb_build_object(
             'exercises', COALESCE((
               SELECT jsonb_agg(
                 (to_jsonb(exercise) - 'workout_id') || jsonb_build_object(
                   'sets', COALESCE((
                     SELECT jsonb_agg(to_jsonb(set_row) - 'exercise_id' ORDER BY set_row.position)
                     FROM workout_sets AS set_row WHERE set_row.exercise_id = exercise.id
                   ), '[]'::jsonb)
                 ) ORDER BY exercise.position
               ) FROM workout_exercises AS exercise WHERE exercise.workout_id = workout.id
             ), '[]'::jsonb),
             'history', COALESCE((
               SELECT jsonb_agg((to_jsonb(history) - 'user_id' - 'workout_id') ORDER BY history.revision)
               FROM workout_revisions AS history WHERE history.workout_id = workout.id
             ), '[]'::jsonb)
           )
         ) AS payload
         FROM (
           SELECT id, title, status, source_kind, source_metadata, started_at, ended_at,
                  timezone, pain_level, fatigue, note, revision, deleted_at, created_at, updated_at
           FROM workout_sessions WHERE user_id = $1 ORDER BY started_at, created_at
         ) AS workout`,
        userId,
      )
      const nutritionMeals = await jsonRows(
        client,
        `SELECT (
           to_jsonb(meal) || jsonb_build_object(
             'items', COALESCE((
               SELECT jsonb_agg(to_jsonb(item) - 'meal_id' ORDER BY item.position)
               FROM nutrition_meal_items AS item WHERE item.meal_id = meal.id
             ), '[]'::jsonb),
             'history', COALESCE((
               SELECT jsonb_agg((to_jsonb(history) - 'user_id' - 'meal_id') ORDER BY history.revision)
               FROM nutrition_meal_revisions AS history WHERE history.meal_id = meal.id
             ), '[]'::jsonb)
           )
         ) AS payload
         FROM (
           SELECT id, meal_type, title, source_kind, source_metadata, occurred_at, timezone,
                  note, revision, deleted_at, created_at, updated_at
           FROM nutrition_meals WHERE user_id = $1 ORDER BY occurred_at, created_at
         ) AS meal`,
        userId,
      )
      const nutritionFavorites = await jsonRows(
        client,
        `SELECT to_jsonb(favorite) AS payload FROM (
           SELECT food_key, food_name, food_category, energy_kcal_per_100g,
                  protein_g_per_100g, carbohydrate_g_per_100g, fat_g_per_100g,
                  fiber_g_per_100g, reference, default_amount, default_unit,
                  default_grams, created_at, updated_at
           FROM nutrition_favorites WHERE user_id = $1 ORDER BY food_key
         ) AS favorite`,
        userId,
      )
      const weeklyPlans = await jsonRows(
        client,
        `SELECT (
           to_jsonb(plan) || jsonb_build_object(
             'history', COALESCE((
               SELECT jsonb_agg((to_jsonb(history) - 'user_id' - 'plan_id') ORDER BY history.revision)
               FROM weekly_plan_revisions AS history WHERE history.plan_id = plan.id
             ), '[]'::jsonb)
           )
         ) AS payload
         FROM (
           SELECT id, week_start, timezone, engine_version, status, payload,
                  revision, created_at, updated_at
           FROM weekly_plans WHERE user_id = $1 ORDER BY week_start
         ) AS plan`,
        userId,
      )
      const aiExplanationRuns = await jsonRows(
        client,
        `SELECT to_jsonb(run) AS payload FROM (
           SELECT id, plan_id, plan_revision, status, source, provider, model,
                  prompt_version, validator_version, content, safety_note,
                  failure_code, latency_ms, created_at, completed_at
           FROM ai_explanation_runs WHERE user_id = $1 ORDER BY created_at
         ) AS run`,
        userId,
      )
      const photoRows = await client.query<
        QueryResultRow & {
          id: string
          storage_key: string | null
          payload: Record<string, unknown>
        }
      >(
        `SELECT id, storage_key, (to_jsonb(photo) - 'storage_key') AS payload FROM (
           SELECT id, status, source, provider, model, content, selection, failure_code,
                  width, height, byte_size, content_type, prompt_version, validator_version,
                  expires_at, created_at, completed_at, confirmed_at, deleted_at, storage_key
           FROM nutrition_photo_candidates WHERE user_id = $1 ORDER BY created_at
         ) AS photo`,
        [userId],
      )
      const foodPhotoAnalyses: Array<Record<string, unknown>> = []
      for (const photo of photoRows.rows) {
        let media: Record<string, unknown> | null = null
        if (photo.storage_key) {
          try {
            const bytes = await this.photoStorage.read(photo.storage_key)
            media = {
              contentType: 'image/jpeg',
              encoding: 'base64',
              data: bytes.toString('base64'),
            }
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
            media = { unavailable: true }
          }
        }
        foodPhotoAnalyses.push({ ...photo.payload, media })
      }

      return {
        schemaVersion: privacyExportSchemaVersion,
        generatedAt: new Date().toISOString(),
        accountId: userId,
        data: {
          account,
          identities,
          profile: profileRows[0] ?? null,
          goal: goalRows[0] ?? null,
          consentEvents,
          healthRecords,
          healthRecordRevisions,
          workouts,
          nutritionMeals,
          nutritionFavorites,
          weeklyPlans,
          aiExplanationRuns,
          foodPhotoAnalyses,
        },
      }
    })

    return privacyExportSchema.parse(jsonSafe(payload))
  }

  async revokeConsent(userId: string, purpose: RevocableConsentPurpose) {
    const revoked = await this.database.query<{ revoked_at: Date }>(
      `UPDATE consent_events SET revoked_at = COALESCE(revoked_at, NOW())
       WHERE user_id = $1 AND purpose = $2
       RETURNING revoked_at`,
      [userId, purpose],
    )
    if (!revoked.rows[0]) throw new NotFoundException('consent has not been granted')

    let removedPhotoAnalyses = 0
    if (purpose === 'food_photo_analysis') {
      removedPhotoAnalyses = await this.photos.purgeForUser(userId)
    } else {
      await this.database.query(
        "DELETE FROM ai_explanation_runs WHERE user_id = $1 AND status = 'pending'",
        [userId],
      )
    }
    const revokedAt = revoked.rows.reduce(
      (latest, row) => (row.revoked_at > latest ? row.revoked_at : latest),
      revoked.rows[0].revoked_at,
    )
    return {
      purpose,
      status: 'revoked' as const,
      revokedAt: revokedAt.toISOString(),
      removedPhotoAnalyses,
    }
  }

  private receiptResult(row: {
    receipt_id: string
    status: 'queued' | 'running' | 'completed' | 'dead_letter'
    scope_version: typeof privacyErasureScopeVersion
    primary_store_status: 'pending' | 'deleted'
    media_status: 'pending' | 'deleted'
    provider_status: 'pending' | 'not_applicable' | 'fixture_only' | 'policy_bound'
    backup_status: 'pending' | 'ledger_published'
    requested_at: Date
    completed_at: Date | null
    last_error_code:
      | 'object_storage_unavailable'
      | 'database_unavailable'
      | 'invalid_job_payload'
      | 'unexpected_error'
      | null
  }) {
    return {
      receiptId: row.receipt_id,
      status: row.status,
      deleted: row.status === 'completed',
      scopeVersion: row.scope_version,
      primaryStoreStatus: row.primary_store_status,
      mediaStatus: row.media_status,
      providerStatus: row.provider_status,
      backupStatus: row.backup_status,
      requestedAt: row.requested_at.toISOString(),
      deletedAt: row.completed_at?.toISOString() ?? null,
      lastErrorCode: row.last_error_code,
    }
  }

  private async receipt(receiptId: string, statusTokenHash: string) {
    const result = await this.database.query<
      Parameters<PrivacyService['receiptResult']>[0] & { status_token_hash: string }
    >(
      `SELECT receipt_id, status, scope_version, primary_store_status, media_status,
              provider_status, backup_status, requested_at, completed_at, last_error_code,
              status_token_hash
       FROM privacy_erasure_receipts
       WHERE receipt_id = $1 AND status_token_hash = $2
         AND scope_version = $3`,
      [receiptId, statusTokenHash, privacyErasureScopeVersion],
    )
    const row = result.rows[0]
    if (!row) throw new UnauthorizedException('erasure receipt token is invalid')
    return this.receiptResult(row)
  }

  async erasureReceipt(receiptId: string, statusToken: string) {
    return this.receipt(receiptId, hashSecret(statusToken))
  }

  async recoverErasureReceipt(statusToken: string) {
    const result = await this.database.query<Parameters<PrivacyService['receiptResult']>[0]>(
      `SELECT receipt_id, status, scope_version, primary_store_status, media_status,
              provider_status, backup_status, requested_at, completed_at, last_error_code
       FROM privacy_erasure_receipts
       WHERE status_token_hash = $1 AND scope_version = $2`,
      [hashSecret(statusToken), privacyErasureScopeVersion],
    )
    const row = result.rows[0]
    if (!row) throw new UnauthorizedException('erasure receipt token is invalid')
    return this.receiptResult(row)
  }

  async createDeletionIntent(userId: string): Promise<AccountDeletionIntent> {
    const intentId = randomUUID()
    const intentToken = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + deletionIntentLifetimeMs)
    await this.database.withTransaction(async (client) => {
      const account = await client.query(
        "SELECT id FROM users WHERE id = $1 AND status = 'active' FOR UPDATE",
        [userId],
      )
      if (!account.rows[0]) throw new NotFoundException('active account not found')
      await client.query(
        `INSERT INTO privacy_erasure_intents
           (intent_id, user_id, token_hash, created_at, expires_at)
         VALUES ($1, $2, $3, NOW(), $4)
         ON CONFLICT (user_id) DO UPDATE
         SET intent_id = EXCLUDED.intent_id,
             token_hash = EXCLUDED.token_hash,
             created_at = EXCLUDED.created_at,
             expires_at = EXCLUDED.expires_at`,
        [intentId, userId, hashSecret(intentToken), expiresAt],
      )
    })
    return { intentId, intentToken, expiresAt: expiresAt.toISOString() }
  }

  async deleteAccount(userId: string, input: AccountDeletionRequest, intentToken: string) {
    const receiptId = randomUUID()
    const statusToken = intentToken
    const statusTokenHash = hashSecret(statusToken)
    const jobId = await this.database.withTransaction(async (client) => {
      const account = await client.query<{ id: string }>(
        "SELECT id FROM users WHERE id = $1 AND status = 'active' FOR UPDATE",
        [userId],
      )
      if (!account.rows[0]) throw new ConflictException('account is not active')
      const intent = await client.query(
        `DELETE FROM privacy_erasure_intents
         WHERE intent_id = $1 AND user_id = $2 AND token_hash = $3 AND expires_at > NOW()
         RETURNING intent_id`,
        [input.intentId, userId, statusTokenHash],
      )
      if (!intent.rows[0]) {
        throw new UnauthorizedException('account deletion intent is invalid or expired')
      }
      await client.query(
        "UPDATE users SET status = 'deletion_pending', updated_at = NOW() WHERE id = $1 RETURNING id",
        [userId],
      )
      await client.query(
        `INSERT INTO privacy_erasure_receipts (
           receipt_id, scope_version, status, status_token_hash,
           requested_user_id, subject_ref, primary_store_status,
           media_status, provider_status, backup_status
         ) VALUES ($1, $2, 'queued', $3, $4, $5, 'pending', 'pending', 'pending', 'pending')`,
        [
          receiptId,
          privacyErasureScopeVersion,
          statusTokenHash,
          userId,
          this.erasureLedger.subjectRef(userId),
        ],
      )
      return this.dataOperations.enqueueAccountErasure(client, receiptId, userId)
    })
    await this.dataOperations.runById(jobId).catch(() => {
      this.logger.error('account erasure was persisted but immediate execution failed')
    })
    return {
      ...(await this.receipt(receiptId, statusTokenHash)),
      statusToken,
    }
  }
}
