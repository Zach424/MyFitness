import { randomUUID } from 'node:crypto'

import type { INestApplication } from '@nestjs/common'
import {
  accountDeletionConfirmationPhrase,
  consentVersions,
  createWorkoutSchema,
  foodPhotoConsentVersion,
  maximumPrivacyExportBytes,
  privacyExportTooLargeCode,
} from '@myfitness/contracts'
import { Pool } from 'pg'
import sharp from 'sharp'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { createApplication } from '../bootstrap'
import { getRuntimeConfig } from '../config'
import { runMigrations } from '../database/migrate'
import { PhotoStorageService } from '../nutrition/photo-storage.service'
import { DataOperationsService } from '../operations/data-operations.service'
import { ObjectStorageService } from '../operations/object-storage.service'
import { ErasureLedgerService } from './erasure-ledger.service'
import * as portableExportArtifact from './portable-export-artifact'
import { portableExportSnapshotMaximumPayloadBytes } from './portable-export-database-snapshot'

describe('privacy ownership API with PostgreSQL and private media', () => {
  const config = getRuntimeConfig()
  const pool = new Pool({ connectionString: config.databaseUrl })
  const users = new Set<string>()
  const receipts = new Set<string>()
  let app: INestApplication
  let storage: PhotoStorageService
  let erasureLedger: ErasureLedgerService
  let dataOperations: DataOperationsService
  let objectStorage: ObjectStorageService
  let operationJobCutoff: Date

  const onboarding = {
    adultConfirmed: true,
    profile: {
      displayName: '数据主人',
      ageBand: '25_34',
      sexForCalculations: 'unspecified',
      height: { value: 172, unit: 'cm' },
      unitSystem: 'metric',
      timezone: 'Asia/Shanghai',
    },
    goal: {
      primaryGoal: 'fitness',
      experience: 'beginner',
      availableDays: ['mon', 'wed', 'sat'],
      sessionMinutes: 45,
      equipment: ['bodyweight'],
      dietaryPreferences: ['none'],
    },
    risk: { flags: [], acknowledged: true },
    consents: {
      terms: { accepted: true, version: consentVersions.terms },
      privacy: { accepted: true, version: consentVersions.privacy },
      healthData: { accepted: true, version: consentVersions.healthData },
    },
  }

  const createUser = async () => {
    const subject = `privacy-${randomUUID()}`
    const session = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .send({ subject })
      .expect(200)
    const userId = String(session.body.userId)
    const token = String(session.body.accessToken)
    users.add(userId)
    await request(app.getHttpServer())
      .put('/v1/me/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send(onboarding)
      .expect(200)
    return { subject, userId, token }
  }

  const createHealthRecord = (token: string) =>
    request(app.getHttpServer())
      .post('/v1/health-records')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', `privacy-record-${randomUUID()}`)
      .send({
        metric: 'body.weight',
        value: 70,
        unit: 'kg',
        source: { kind: 'manual' },
        status: 'confirmed',
        occurredAt: '2026-07-19T06:00:00+08:00',
        timezone: 'Asia/Shanghai',
      })
      .expect(201)

  const createPlanReflection = async (token: string) => {
    const generated = await request(app.getHttpServer())
      .post('/v1/plans/weekly')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', `privacy-plan-${randomUUID()}`)
      .send({ weekStart: '2026-08-24' })
      .expect(201)
    const accepted = await request(app.getHttpServer())
      .put(`/v1/plans/weekly/${generated.body.id}/decision`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'accepted', expectedRevision: generated.body.revision, selections: [] })
      .expect(200)
    const reflection = await request(app.getHttpServer())
      .put(`/v1/plans/weekly/${generated.body.id}/history/${accepted.body.revision}/reflection`)
      .set('Authorization', `Bearer ${token}`)
      .send({ experience: 'about_right', expectedRevision: 0 })
      .expect(200)
    return { planId: generated.body.id as string, reflectionId: reflection.body.id as string }
  }

  const createDeletionIntent = async (token: string) => {
    const response = await request(app.getHttpServer())
      .post('/v1/me/privacy/account-deletion-intents')
      .set('Authorization', `Bearer ${token}`)
      .expect(201)
    return {
      intentId: String(response.body.intentId),
      intentToken: String(response.body.intentToken),
      expiresAt: String(response.body.expiresAt),
    }
  }

  const createPhoto = async (token: string, userId: string, idempotencyKey = randomUUID()) => {
    const ticket = await request(app.getHttpServer())
      .post('/v1/nutrition/photo-candidates')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', `privacy-photo-${idempotencyKey}`)
      .send({ consent: { granted: true, version: foodPhotoConsentVersion } })
      .expect(201)
    const photoId = String(ticket.body.id)
    const image = await sharp({
      create: { width: 180, height: 120, channels: 3, background: '#b88f53' },
    })
      .png()
      .toBuffer()
    await request(app.getHttpServer())
      .post(String(ticket.body.upload.path))
      .set('Authorization', `Bearer ${token}`)
      .attach('file', image, { filename: 'meal.png', contentType: 'image/png' })
      .expect(201)
    return {
      photoId,
      storageKey: `${userId}/food/${photoId}.jpg`,
    }
  }

  beforeAll(async () => {
    await runMigrations(config.databaseUrl)
    operationJobCutoff = (await pool.query<{ cutoff: Date }>('SELECT clock_timestamp() AS cutoff'))
      .rows[0]!.cutoff
    app = await createApplication(false)
    await app.init()
    storage = app.get(PhotoStorageService)
    erasureLedger = app.get(ErasureLedgerService)
    dataOperations = app.get(DataOperationsService)
    objectStorage = app.get(ObjectStorageService)
  })

  afterAll(async () => {
    for (const userId of users) {
      await storage.removeUserDirectory(userId)
    }
    for (const receiptId of receipts) {
      await erasureLedger.removeForVerification(receiptId)
    }
    await pool.query('DELETE FROM data_operation_jobs WHERE created_at >= $1', [operationJobCutoff])
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[...users]])
    await pool.query(
      'DELETE FROM auth_identity_suppressions WHERE erasure_receipt_id = ANY($1::uuid[])',
      [[...receipts]],
    )
    await pool.query('DELETE FROM privacy_erasure_receipts WHERE receipt_id = ANY($1::uuid[])', [
      [...receipts],
    ])
    await pool.end()
    await app.close()
  })

  it('inventories owned data and exports history plus active sanitized media without secrets', async () => {
    const { token, userId } = await createUser()
    await createHealthRecord(token)
    const plan = await createPlanReflection(token)
    const photo = await createPhoto(token, userId)
    await pool.query(
      "UPDATE consent_events SET accepted_at = '2026-08-11T00:00:00.000001Z' WHERE user_id = $1",
      [userId],
    )
    const expectedConsentOrder = await pool.query<{ id: string }>(
      'SELECT id FROM consent_events WHERE user_id = $1 ORDER BY accepted_at, id',
      [userId],
    )

    const overview = await request(app.getHttpServer())
      .get('/v1/me/privacy')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(overview.body).toMatchObject({ activePhotoCount: 1 })
    expect(overview.body.inventory).toHaveLength(8)
    expect(
      overview.body.inventory.find(
        (item: { category: string }) => item.category === 'health_records',
      ),
    ).toMatchObject({ recordCount: 1, includesHistory: true })
    expect(
      overview.body.inventory.find((item: { category: string }) => item.category === 'plans'),
    ).toMatchObject({ recordCount: 2, includesHistory: true })

    const exported = await request(app.getHttpServer())
      .get('/v1/me/privacy/export')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(exported.headers['cache-control']).toContain('no-store')
    expect(exported.headers['content-disposition']).toContain('myfitness-export.json')
    expect(Number(exported.headers['content-length'])).toBe(
      Buffer.byteLength(exported.text, 'utf8'),
    )
    expect(Number(exported.headers['content-length'])).toBeLessThanOrEqual(
      maximumPrivacyExportBytes,
    )
    const payload = JSON.parse(exported.text) as {
      schemaVersion: string
      data: {
        consentEvents: Array<{ id: string }>
        healthRecords: unknown[]
        healthRecordRevisions: unknown[]
        weeklyPlans: Array<{
          id: string
          experience_reflections: Array<{
            id: string
            experience: string
            source: string
            user_id?: string
          }>
        }>
        foodPhotoAnalyses: Array<{ media?: { encoding?: string; data?: string } }>
        progressPhotos: unknown[]
      }
    }
    expect(payload.schemaVersion).toBe('myfitness-portable-export-v4')
    expect(payload.data.consentEvents.map((event) => event.id)).toEqual(
      expectedConsentOrder.rows.map((event) => event.id),
    )
    expect(payload.data.healthRecords).toHaveLength(1)
    expect(payload.data.healthRecordRevisions).toHaveLength(1)
    expect(payload.data.weeklyPlans).toEqual([
      expect.objectContaining({
        id: plan.planId,
        experience_reflections: [
          expect.objectContaining({
            id: plan.reflectionId,
            experience: 'about_right',
            source: 'user_confirmed',
          }),
        ],
      }),
    ])
    expect(payload.data.weeklyPlans[0]?.experience_reflections[0]).not.toHaveProperty('user_id')
    expect(payload.data.foodPhotoAnalyses[0]?.media).toMatchObject({ encoding: 'base64' })
    expect(payload.data.foodPhotoAnalyses[0]?.media?.data?.length).toBeGreaterThan(20)
    expect(payload.data.progressPhotos).toEqual([])
    expect(exported.text).not.toContain(token)
    expect(exported.text).not.toContain('token_hash')
    expect(exported.text).not.toContain('request_hash')
    expect(exported.text).not.toContain('storage_key')

    await request(app.getHttpServer())
      .delete(`/v1/nutrition/photo-candidates/${photo.photoId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204)
  })

  it('exports workouts in a total order while preserving a legal aggregate above the row gate', async () => {
    const { token, userId } = await createUser()
    const workoutIds = [randomUUID(), randomUUID()].sort()
    const [firstWorkoutId, secondWorkoutId] = workoutIds
    const sharedStartedAt = '2026-08-10T00:00:00.000001Z'
    const sharedCreatedAt = '2026-08-10T01:00:00.000001Z'
    const largeInput = createWorkoutSchema.parse({
      title: '训练'.repeat(50),
      source: {
        kind: 'imported',
        metadata: { provider: '来源'.repeat(40), externalId: 'e'.repeat(160) },
      },
      exercises: Array.from({ length: 30 }, (_, exerciseIndex) => ({
        position: exerciseIndex + 1,
        exerciseKey: `exercise_${exerciseIndex + 1}`,
        name: '动作'.repeat(40),
        category: 'strength' as const,
        trackingMode: 'reps_load' as const,
        equipment: ['bodyweight', 'dumbbells', 'barbell', 'kettlebell', 'bench', 'other'] as const,
        equipmentNotes: '器械'.repeat(60),
        notes: '说明'.repeat(150),
        sets: Array.from({ length: 50 }, (_, setIndex) => ({
          position: setIndex + 1,
          kind: 'working' as const,
          reps: 1_000,
          load: 1_000,
          loadUnit: 'kg' as const,
          durationSeconds: 86_400,
          distanceMeters: 500_000,
          rpe: 10,
          completed: true,
        })),
      })),
      startedAt: sharedStartedAt,
      endedAt: '2026-08-10T00:45:00.000001Z',
      timezone: 'Asia/Shanghai',
      painLevel: 0,
      fatigue: 5,
      note: '记录'.repeat(250),
    })

    for (const workoutId of [...workoutIds].reverse()) {
      const isLarge = workoutId === firstWorkoutId
      await pool.query(
        `INSERT INTO workout_sessions (
           id, user_id, title, status, source_kind, source_metadata,
           started_at, ended_at, timezone, pain_level, fatigue, note,
           revision, idempotency_key, request_hash, created_at, updated_at
         ) VALUES (
           $1, $2, $3, 'completed', $4, $5::jsonb,
           $6, $7, 'Asia/Shanghai', 0, 5, $8,
           $9, $10, $11, $12, $12
         )`,
        [
          workoutId,
          userId,
          isLarge ? largeInput.title : '同时间训练',
          isLarge ? largeInput.source.kind : 'manual',
          JSON.stringify(isLarge ? largeInput.source.metadata : {}),
          sharedStartedAt,
          isLarge ? largeInput.endedAt : '2026-08-10T00:30:00.000001Z',
          isLarge ? largeInput.note : null,
          isLarge ? 2 : 1,
          `privacy-workout-${workoutId}`,
          '0'.repeat(64),
          sharedCreatedAt,
        ],
      )
    }

    await pool.query(
      `INSERT INTO workout_exercises (
         id, workout_id, position, exercise_key, name, category,
         tracking_mode, equipment, equipment_notes, notes
       )
       SELECT gen_random_uuid(), $1, position, 'exercise_' || position, $2,
              'strength', 'reps_load', $3::text[], $4, $5
       FROM generate_series(1, 30) AS position
       ORDER BY position DESC`,
      [
        firstWorkoutId,
        '动作'.repeat(40),
        [...largeInput.exercises[0]!.equipment!],
        largeInput.exercises[0]!.equipmentNotes,
        largeInput.exercises[0]!.notes,
      ],
    )
    await pool.query(
      `INSERT INTO workout_sets (
         id, exercise_id, position, kind, reps, display_load, display_load_unit,
         canonical_load_kg, duration_seconds, distance_meters, rpe, completed
       )
       SELECT gen_random_uuid(), exercise.id, set_position, 'working', 1000, 1000, 'kg',
              1000, 86400, 500000, 10, TRUE
       FROM workout_exercises AS exercise
       CROSS JOIN generate_series(1, 50) AS set_position
       WHERE exercise.workout_id = $1
       ORDER BY exercise.position DESC, set_position DESC`,
      [firstWorkoutId],
    )
    const smallExerciseId = randomUUID()
    await pool.query(
      `INSERT INTO workout_exercises (
         id, workout_id, position, exercise_key, name, category, tracking_mode, equipment
       ) VALUES ($1, $2, 1, 'small_exercise', '小训练', 'strength', 'reps_load', '{bodyweight}')`,
      [smallExerciseId, secondWorkoutId],
    )
    await pool.query(
      `INSERT INTO workout_sets (
         id, exercise_id, position, kind, reps, canonical_load_kg, completed
       ) VALUES (gen_random_uuid(), $1, 1, 'working', 1, NULL, TRUE)`,
      [smallExerciseId],
    )
    await pool.query(
      `INSERT INTO workout_revisions (id, workout_id, user_id, action, revision, snapshot, changed_at)
       VALUES
         (gen_random_uuid(), $1, $2, 'updated', 2, $3::jsonb, '2026-08-10T02:00:00.000002Z'),
         (gen_random_uuid(), $1, $2, 'created', 1, $3::jsonb, '2026-08-10T02:00:00.000001Z'),
         (gen_random_uuid(), $4, $2, 'created', 1, '{}'::jsonb, '2026-08-10T02:00:00.000001Z')`,
      [firstWorkoutId, userId, JSON.stringify(largeInput), secondWorkoutId],
    )

    const expectedOrder = await pool.query<{ id: string }>(
      `SELECT id FROM workout_sessions
       WHERE user_id = $1
       ORDER BY started_at, created_at, id`,
      [userId],
    )
    const exported = await request(app.getHttpServer())
      .get('/v1/me/privacy/export')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    const payload = JSON.parse(exported.text) as {
      data: {
        workouts: Array<{
          id: string
          exercises: Array<{ position: number; sets: Array<{ position: number }> }>
          history: Array<{ revision: number }>
        }>
      }
    }

    expect(payload.data.workouts.map((workout) => workout.id)).toEqual(
      expectedOrder.rows.map((workout) => workout.id),
    )
    const largeWorkout = payload.data.workouts.find((workout) => workout.id === firstWorkoutId)!
    expect(largeWorkout.exercises.map((exercise) => exercise.position)).toEqual(
      Array.from({ length: 30 }, (_, index) => index + 1),
    )
    expect(
      largeWorkout.exercises.every(
        (exercise) =>
          exercise.sets.length === 50 &&
          exercise.sets.every((set, index) => set.position === index + 1),
      ),
    ).toBe(true)
    expect(largeWorkout.history.map((revision) => revision.revision)).toEqual([1, 2])
    expect(
      Buffer.byteLength(JSON.stringify({ ...largeWorkout, history: [] }), 'utf8'),
    ).toBeGreaterThan(portableExportSnapshotMaximumPayloadBytes)
  }, 30_000)

  it('rejects an oversized metadata floor before reading private media objects', async () => {
    const { token, userId } = await createUser()
    await createPhoto(token, userId)
    const read = vi.spyOn(storage, 'read')
    const exactAssertion = portableExportArtifact.assertPortableExportWithinLimit
    const floorGate = vi
      .spyOn(portableExportArtifact, 'assertPortableExportWithinLimit')
      .mockImplementation((payload) => exactAssertion(payload, 1))

    try {
      const refused = await request(app.getHttpServer())
        .get('/v1/me/privacy/export')
        .set('Authorization', `Bearer ${token}`)
        .expect(413)

      expect(refused.body).toMatchObject({
        statusCode: 413,
        code: privacyExportTooLargeCode,
        maximumBytes: 1,
      })
      expect(refused.body).not.toHaveProperty('data')
      expect(floorGate).toHaveBeenCalledTimes(1)
      expect(floorGate.mock.calls[0]?.[0].data.foodPhotoAnalyses[0]).toMatchObject({ media: null })
      expect(read).not.toHaveBeenCalled()
    } finally {
      floorGate.mockRestore()
      read.mockRestore()
    }
  })

  it('stops before encoding or reading later media once the expanded floor is oversized', async () => {
    const { token, userId } = await createUser()
    await createPhoto(token, userId)
    await createPhoto(token, userId)
    const originalRead = storage.read.bind(storage)
    let encodedMediaCount = 0
    const read = vi.spyOn(storage, 'read').mockImplementation(async (storageKey) => {
      const bytes = await originalRead(storageKey)
      const encode = bytes.toString.bind(bytes)
      bytes.toString = ((encoding?: BufferEncoding, start?: number, end?: number) => {
        if (encoding === 'base64') encodedMediaCount += 1
        return encode(encoding, start, end)
      }) as Buffer['toString']
      return bytes
    })
    const exactAssertion = portableExportArtifact.assertPortableExportByteLengthWithinLimit
    const expandedGate = vi
      .spyOn(portableExportArtifact, 'assertPortableExportByteLengthWithinLimit')
      .mockImplementation((byteLength) => exactAssertion(byteLength, byteLength - 1))

    try {
      const refused = await request(app.getHttpServer())
        .get('/v1/me/privacy/export')
        .set('Authorization', `Bearer ${token}`)
        .expect(413)

      expect(refused.body).toMatchObject({
        statusCode: 413,
        code: privacyExportTooLargeCode,
      })
      expect(refused.body).not.toHaveProperty('data')
      expect(expandedGate).toHaveBeenCalledTimes(1)
      expect(read).toHaveBeenCalledTimes(1)
      expect(encodedMediaCount).toBe(0)
    } finally {
      expandedGate.mockRestore()
      read.mockRestore()
    }
  })

  it('pages owner consent receipts without turning history into current authorization', async () => {
    const bareSession = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .send({ subject: `privacy-empty-${randomUUID()}` })
      .expect(200)
    users.add(String(bareSession.body.userId))
    await request(app.getHttpServer())
      .get('/v1/me/privacy/consents/history')
      .set('Authorization', `Bearer ${String(bareSession.body.accessToken)}`)
      .expect(200)
      .expect({ items: [], nextCursor: null })

    const owner = await createUser()
    const other = await createUser()
    await pool.query(
      "UPDATE consent_events SET accepted_at = accepted_at - INTERVAL '1 day' WHERE user_id = $1",
      [owner.userId],
    )
    await pool.query(
      `INSERT INTO consent_events (id, user_id, purpose, version, accepted_at, revoked_at)
       VALUES
         (gen_random_uuid(), $1, 'ai_plan_explanation', 'history-ai-v1', NOW() - INTERVAL '3 minutes', NOW() - INTERVAL '2 minutes'),
         (gen_random_uuid(), $1, 'food_photo_analysis', 'history-food-v1', NOW() - INTERVAL '1 minute', NULL),
         (gen_random_uuid(), $1, 'progress_photo_analysis', 'history-progress-v1', NOW(), NULL)`,
      [owner.userId],
    )
    const receiptCount = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM consent_events WHERE user_id = $1',
      [owner.userId],
    )
    expect(receiptCount.rows[0]?.count).toBe('6')

    const first = await request(app.getHttpServer())
      .get('/v1/me/privacy/consents/history?limit=2')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200)
    expect(first.body.items).toHaveLength(2)
    expect(first.body.items.map((item: { purpose: string }) => item.purpose)).toEqual([
      'progress_photo_analysis',
      'food_photo_analysis',
    ])
    expect(first.body.nextCursor).toEqual(expect.any(String))
    expect(first.body.items[0]).not.toHaveProperty('status')
    expect(first.text).not.toContain(owner.userId)

    const insertedAfterCursor = randomUUID()
    await pool.query(
      `INSERT INTO consent_events (id, user_id, purpose, version, accepted_at)
       VALUES ($1, $2, 'progress_photo_retention', 'history-later-v1', NOW() + INTERVAL '1 second')`,
      [insertedAfterCursor, owner.userId],
    )

    const seenIds = first.body.items.map((item: { receiptId: string }) => item.receiptId)
    const observedPages = [
      first.body.items.map((item: { purpose: string; acceptedAt: string }) => ({
        purpose: item.purpose,
        acceptedAt: item.acceptedAt,
      })),
    ]
    let cursor: string | null = String(first.body.nextCursor)
    while (cursor) {
      const page = await request(app.getHttpServer())
        .get(`/v1/me/privacy/consents/history?limit=2&cursor=${encodeURIComponent(cursor)}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(200)
      seenIds.push(...page.body.items.map((item: { receiptId: string }) => item.receiptId))
      observedPages.push(
        page.body.items.map((item: { purpose: string; acceptedAt: string }) => ({
          purpose: item.purpose,
          acceptedAt: item.acceptedAt,
        })),
      )
      cursor = page.body.nextCursor ? String(page.body.nextCursor) : null
    }
    expect(seenIds, JSON.stringify(observedPages)).toHaveLength(6)
    expect(new Set(seenIds).size).toBe(6)
    expect(seenIds).not.toContain(insertedAfterCursor)

    const otherFirst = await request(app.getHttpServer())
      .get('/v1/me/privacy/consents/history?limit=1')
      .set('Authorization', `Bearer ${other.token}`)
      .expect(200)
    await request(app.getHttpServer())
      .get(
        `/v1/me/privacy/consents/history?limit=1&cursor=${encodeURIComponent(String(otherFirst.body.nextCursor))}`,
      )
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(400)
    await request(app.getHttpServer())
      .get('/v1/me/privacy/consents/history?cursor=not-a-cursor')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(400)
  })

  it('revokes optional photo consent, clears its data and permits a later explicit grant', async () => {
    const { token, userId } = await createUser()
    const first = await createPhoto(token, userId)

    const revoked = await request(app.getHttpServer())
      .post('/v1/me/privacy/consents/food_photo_analysis/revoke')
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmed: true })
      .expect(200)
    expect(revoked.body).toMatchObject({
      purpose: 'food_photo_analysis',
      status: 'revoked',
      removedPhotoAnalyses: 1,
      removedProgressPhotos: 0,
    })
    expect(await storage.exists(first.storageKey)).toBe(false)
    const afterRevoke = await request(app.getHttpServer())
      .get('/v1/me/privacy')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(
      afterRevoke.body.consents.find(
        (item: { purpose: string }) => item.purpose === 'food_photo_analysis',
      ),
    ).toMatchObject({ status: 'revoked', revocable: true })

    const second = await createPhoto(token, userId)
    const consentRows = await pool.query<{ revoked_at: Date | null }>(
      `SELECT revoked_at FROM consent_events
       WHERE user_id = $1 AND purpose = 'food_photo_analysis' ORDER BY accepted_at`,
      [userId],
    )
    expect(consentRows.rows).toHaveLength(2)
    expect(consentRows.rows[0]?.revoked_at).toBeInstanceOf(Date)
    expect(consentRows.rows[1]?.revoked_at).toBeNull()
    await request(app.getHttpServer())
      .delete(`/v1/nutrition/photo-candidates/${second.photoId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204)
  })

  it('requires deliberate confirmation, erases the account graph and invalidates its session', async () => {
    const { token, userId } = await createUser()
    await createHealthRecord(token)
    await createPlanReflection(token)
    const photo = await createPhoto(token, userId)
    const intent = await createDeletionIntent(token)

    await request(app.getHttpServer())
      .delete('/v1/me/privacy/account')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Erasure-Intent-Token', intent.intentToken)
      .send({
        intentId: intent.intentId,
        confirmationPhrase: '删除账户',
        exportChoice: 'skip',
        understandsPermanent: true,
      })
      .expect(400)

    const deleted = await request(app.getHttpServer())
      .delete('/v1/me/privacy/account')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Erasure-Intent-Token', intent.intentToken)
      .send({
        intentId: intent.intentId,
        confirmationPhrase: accountDeletionConfirmationPhrase,
        exportChoice: 'skip',
        understandsPermanent: true,
      })
      .expect(202)
    expect(deleted.body).toMatchObject({
      deleted: true,
      status: 'completed',
      primaryStoreStatus: 'deleted',
      mediaStatus: 'deleted',
      providerStatus: 'fixture_only',
      backupStatus: 'ledger_published',
    })
    expect(deleted.body.scopeVersion).toBe('durable-erasure-v2')
    expect(deleted.body.receiptId).toMatch(/^[0-9a-f-]{36}$/)
    expect(deleted.body.statusToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(deleted.body.statusToken).toBe(intent.intentToken)
    receipts.add(String(deleted.body.receiptId))

    await request(app.getHttpServer())
      .get(`/v1/privacy/erasure-receipts/${deleted.body.receiptId}`)
      .set('X-Erasure-Receipt-Token', deleted.body.statusToken)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ status: 'completed', deleted: true })
        expect(body).not.toHaveProperty('statusToken')
      })
    await request(app.getHttpServer())
      .post('/v1/privacy/erasure-receipts/recover')
      .set('X-Erasure-Receipt-Token', intent.intentToken)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          receiptId: deleted.body.receiptId,
          status: 'completed',
          deleted: true,
        })
        expect(body).not.toHaveProperty('statusToken')
      })
    await request(app.getHttpServer())
      .post('/v1/privacy/erasure-receipts/recover')
      .set('X-Erasure-Receipt-Token', 'x'.repeat(43))
      .expect(401)
    await request(app.getHttpServer())
      .get(`/v1/privacy/erasure-receipts/${deleted.body.receiptId}`)
      .set('X-Erasure-Receipt-Token', 'x'.repeat(43))
      .expect(401)

    await request(app.getHttpServer())
      .get('/v1/me/privacy')
      .set('Authorization', `Bearer ${token}`)
      .expect(401)
    const remaining = await pool.query<{
      users: string
      records: string
      consents: string
      reflections: string
    }>(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE id = $1)::text AS users,
         (SELECT COUNT(*) FROM health_records WHERE user_id = $1)::text AS records,
         (SELECT COUNT(*) FROM consent_events WHERE user_id = $1)::text AS consents,
         (SELECT COUNT(*) FROM plan_experience_reflections WHERE user_id = $1)::text AS reflections`,
      [userId],
    )
    expect(remaining.rows[0]).toEqual({
      users: '0',
      records: '0',
      consents: '0',
      reflections: '0',
    })
    const receipt = await pool.query<{ scope_version: string }>(
      'SELECT scope_version FROM privacy_erasure_receipts WHERE receipt_id = $1',
      [deleted.body.receiptId],
    )
    expect(receipt.rows[0]?.scope_version).toBe('durable-erasure-v2')
    expect(await storage.exists(photo.storageKey)).toBe(false)
    users.delete(userId)
  })

  it('keeps a deletion receipt recoverable while object storage is temporarily unavailable', async () => {
    const { token, userId } = await createUser()
    const photo = await createPhoto(token, userId)
    const intent = await createDeletionIntent(token)
    objectStorage.failNextForTest('delete')

    const accepted = await request(app.getHttpServer())
      .delete('/v1/me/privacy/account')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Erasure-Intent-Token', intent.intentToken)
      .send({
        intentId: intent.intentId,
        confirmationPhrase: accountDeletionConfirmationPhrase,
        exportChoice: 'skip',
        understandsPermanent: true,
      })
      .expect(202)
    expect(accepted.body).toMatchObject({
      status: 'queued',
      deleted: false,
      primaryStoreStatus: 'pending',
      mediaStatus: 'pending',
      backupStatus: 'pending',
      lastErrorCode: 'object_storage_unavailable',
    })
    receipts.add(String(accepted.body.receiptId))
    expect(await storage.exists(photo.storageKey)).toBe(true)

    await request(app.getHttpServer())
      .get('/v1/me/privacy')
      .set('Authorization', `Bearer ${token}`)
      .expect(401)
    const pending = await pool.query<{ id: string; status: string; attempt_count: number }>(
      `SELECT id, status, attempt_count FROM data_operation_jobs
       WHERE receipt_id = $1`,
      [accepted.body.receiptId],
    )
    expect(pending.rows[0]).toMatchObject({ status: 'retry_wait', attempt_count: 1 })
    await pool.query('UPDATE data_operation_jobs SET available_at = NOW() WHERE id = $1', [
      pending.rows[0]!.id,
    ])
    expect(await dataOperations.drain()).toMatchObject({ claimed: 1, succeeded: 1 })

    const completed = await request(app.getHttpServer())
      .get(`/v1/privacy/erasure-receipts/${accepted.body.receiptId}`)
      .set('X-Erasure-Receipt-Token', accepted.body.statusToken)
      .expect(200)
    expect(completed.body).toMatchObject({
      status: 'completed',
      deleted: true,
      primaryStoreStatus: 'deleted',
      mediaStatus: 'deleted',
      backupStatus: 'ledger_published',
    })
    expect(await storage.exists(photo.storageKey)).toBe(false)
    const remaining = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM users WHERE id = $1',
      [userId],
    )
    expect(remaining.rows[0]?.count).toBe('0')
    users.delete(userId)
  })

  it('rotates prior deletion intents and rejects expired intent secrets without closing the account', async () => {
    const { token, userId } = await createUser()
    const first = await createDeletionIntent(token)
    const second = await createDeletionIntent(token)
    expect(second.intentId).not.toBe(first.intentId)
    expect(second.intentToken).not.toBe(first.intentToken)

    const deletionBody = {
      intentId: first.intentId,
      confirmationPhrase: accountDeletionConfirmationPhrase,
      exportChoice: 'skip',
      understandsPermanent: true,
    }
    await request(app.getHttpServer())
      .delete('/v1/me/privacy/account')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Erasure-Intent-Token', first.intentToken)
      .send(deletionBody)
      .expect(401)

    await pool.query(
      `UPDATE privacy_erasure_intents
       SET created_at = NOW() - INTERVAL '20 minutes',
           expires_at = NOW() - INTERVAL '1 second'
       WHERE intent_id = $1`,
      [second.intentId],
    )
    await request(app.getHttpServer())
      .delete('/v1/me/privacy/account')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Erasure-Intent-Token', second.intentToken)
      .send({ ...deletionBody, intentId: second.intentId })
      .expect(401)

    const account = await pool.query<{ status: string }>('SELECT status FROM users WHERE id = $1', [
      userId,
    ])
    expect(account.rows[0]?.status).toBe('active')
  })
})
