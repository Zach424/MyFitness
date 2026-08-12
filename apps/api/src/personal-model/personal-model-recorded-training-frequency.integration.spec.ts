import { randomUUID } from 'node:crypto'

import type { CreateWorkout } from '@myfitness/contracts'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'

import { getRuntimeConfig } from '../config'
import { DatabaseService } from '../database/database.service'
import { runMigrations } from '../database/migrate'
import { WorkoutsService } from '../workouts/workouts.service'
import {
  PersonalModelRepository,
  RecordedTrainingFrequencyAuthorityNotFoundError,
} from './personal-model.repository'

describe('recorded training frequency executor with PostgreSQL', () => {
  const databaseUrl = getRuntimeConfig().databaseUrl
  const pool = new Pool({ connectionString: databaseUrl })
  const database = new DatabaseService()
  const repository = new PersonalModelRepository(database)
  const workoutsService = new WorkoutsService(database)
  const owners = new Set<string>()

  const createOwner = async (ageInWeeks: number) => {
    const userId = randomUUID()
    owners.add(userId)
    await pool.query(
      `
        WITH account AS (
          INSERT INTO users (id, created_at, updated_at)
          VALUES ($1, clock_timestamp() - ($2 * INTERVAL '1 week'), clock_timestamp())
          RETURNING id, created_at
        )
        INSERT INTO user_profiles (
          user_id, display_name, age_band, sex_for_calculations,
          height_cm, display_height, display_height_unit, unit_system,
          timezone, adult_confirmed_at, risk_status, risk_flags,
          revision, created_at, updated_at
        )
        SELECT
          id, 'Frequency owner', '25_34', 'unspecified',
          170, 170, 'cm', 'metric',
          'Asia/Shanghai', created_at, 'eligible', '{}',
          1, created_at, clock_timestamp()
        FROM account
      `,
      [userId, ageInWeeks],
    )
    return userId
  }

  const workoutInput = async (weeksAgo: number): Promise<CreateWorkout> => {
    const time = await pool.query<{ started_at: Date; ended_at: Date }>(
      `
        SELECT
          (
            DATE_TRUNC('week', clock_timestamp() AT TIME ZONE 'Asia/Shanghai')
            - ($1 * INTERVAL '1 week') + INTERVAL '10 hours'
          ) AT TIME ZONE 'Asia/Shanghai' AS started_at,
          (
            DATE_TRUNC('week', clock_timestamp() AT TIME ZONE 'Asia/Shanghai')
            - ($1 * INTERVAL '1 week') + INTERVAL '11 hours'
          ) AT TIME ZONE 'Asia/Shanghai' AS ended_at
      `,
      [weeksAgo],
    )
    const row = time.rows[0]!
    return {
      title: `第 ${weeksAgo} 周训练`,
      source: { kind: 'manual' },
      exercises: [
        {
          position: 1,
          exerciseKey: 'bodyweight_squat',
          name: '深蹲',
          category: 'strength',
          sets: [{ position: 1, kind: 'working', reps: 10, completed: true }],
        },
      ],
      startedAt: row.started_at.toISOString(),
      endedAt: row.ended_at.toISOString(),
      timezone: 'Asia/Shanghai',
      painLevel: 0,
      fatigue: 2,
    }
  }

  const createWorkout = async (userId: string, weeksAgo: number) => {
    const input = await workoutInput(weeksAgo)
    const created = await workoutsService.create(userId, `frequency-${randomUUID()}`, input)
    return { input, created }
  }

  beforeAll(async () => {
    await runMigrations(databaseUrl)
  })

  afterEach(async () => {
    const userIds = [...owners]
    if (userIds.length > 0) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds])
      owners.clear()
    }
  })

  afterAll(async () => {
    await database.onModuleDestroy()
    await pool.end()
  })

  it('fails closed without an active owner and profile authority', async () => {
    await expect(repository.refreshRecordedTrainingFrequency(randomUUID())).rejects.toBeInstanceOf(
      RecordedTrainingFrequencyAuthorityNotFoundError,
    )
  })

  it('distinguishes incomplete account coverage from complete weeks with no workout evidence', async () => {
    const recentUserId = await createOwner(0)
    const recent = await repository.refreshRecordedTrainingFrequency(recentUserId)
    expect(recent.outcome).toBe('unknown')
    if (recent.outcome !== 'unknown') throw new Error('expected Unknown')
    expect(recent.receipt.reasons).toEqual(['insufficient_coverage'])

    const establishedUserId = await createOwner(10)
    const established = await repository.refreshRecordedTrainingFrequency(establishedUserId)
    expect(established.outcome).toBe('unknown')
    if (established.outcome !== 'unknown') throw new Error('expected Unknown')
    expect(established.receipt.reasons).toEqual(['no_eligible_evidence'])

    const rows = await pool.query<{ items: string }>(
      `SELECT COUNT(*)::text AS items FROM personal_model_items WHERE user_id = ANY($1::uuid[])`,
      [[recentUserId, establishedUserId]],
    )
    expect(rows.rows[0]).toEqual({ items: '0' })
  })

  it('serializes concurrent creation and publishes one active eight-week behavior', async () => {
    const userId = await createOwner(10)
    for (const weeksAgo of [7, 7, 6, 5, 4, 3]) await createWorkout(userId, weeksAgo)

    const results = await Promise.all([
      repository.refreshRecordedTrainingFrequency(userId),
      repository.refreshRecordedTrainingFrequency(userId),
    ])
    expect(results.map((result) => result.outcome).sort()).toEqual(['created', 'no_op'])
    const created = results.find((result) => result.outcome === 'created')
    if (!created || created.outcome !== 'created') throw new Error('expected created')
    expect(created.revision.snapshot).toMatchObject({
      status: 'active',
      claim: {
        observationWindow: { completeWeeks: 8, timezone: 'Asia/Shanghai' },
        qualifyingWorkoutCount: 6,
      },
      confidence: { level: 'moderate', limitations: ['single_window'] },
      evidenceSet: { includedCount: 6, withdrawnCount: 0 },
    })

    const rows = await pool.query<{
      items: string
      revisions: string
      evidence: string
      requests: string
    }>(
      `
        SELECT
          (SELECT COUNT(*) FROM personal_model_items WHERE user_id = $1)::text AS items,
          (SELECT COUNT(*) FROM personal_model_item_revisions WHERE user_id = $1)::text AS revisions,
          (SELECT COUNT(*) FROM personal_model_evidence_refs WHERE user_id = $1)::text AS evidence,
          (SELECT COUNT(*) FROM personal_model_source_refresh_requests WHERE user_id = $1)::text AS requests
      `,
      [userId],
    )
    expect(rows.rows[0]).toEqual({ items: '1', revisions: '1', evidence: '6', requests: '0' })
  })

  it('consumes a corrected workout request and binds its replacement revision exactly once', async () => {
    const userId = await createOwner(10)
    const entries = []
    for (const weeksAgo of [7, 7, 6, 5, 4, 3]) entries.push(await createWorkout(userId, weeksAgo))
    const initial = await repository.refreshRecordedTrainingFrequency(userId)
    if (initial.outcome !== 'created') throw new Error('expected created')

    const first = entries[0]!
    const moved = await workoutInput(2)
    await workoutsService.update(userId, first.created.id, {
      ...moved,
      expectedRevision: first.created.revision,
    })
    const refreshed = await repository.refreshRecordedTrainingFrequency(userId)
    expect(refreshed.outcome).toBe('revised')
    if (refreshed.outcome !== 'revised') throw new Error('expected revised')
    expect(refreshed.revision.snapshot.evidenceSet.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          aggregateId: first.created.id,
          aggregateRevision: 1,
          qualification: 'withdrawn',
          withdrawnReason: 'source_corrected',
        }),
        expect.objectContaining({
          aggregateId: first.created.id,
          aggregateRevision: 2,
          qualification: 'eligible',
        }),
      ]),
    )

    const receipts = await pool.query<{ requests: string; resolutions: string; revision: number }>(
      `
        SELECT
          (SELECT COUNT(*) FROM personal_model_source_refresh_requests WHERE user_id = $1)::text AS requests,
          (SELECT COUNT(*) FROM personal_model_source_refresh_resolutions WHERE user_id = $1)::text AS resolutions,
          item.current_revision AS revision
        FROM personal_model_items AS item
        WHERE item.user_id = $1 AND item.subject_key = 'training.recorded_frequency'
      `,
      [userId],
    )
    expect(receipts.rows[0]).toEqual({ requests: '1', resolutions: '1', revision: 2 })
  })

  it('invalidates the last recorded workout after deletion and owner deletion leaves no model residue', async () => {
    const userId = await createOwner(10)
    const { created } = await createWorkout(userId, 3)
    const initial = await repository.refreshRecordedTrainingFrequency(userId)
    if (initial.outcome !== 'created') throw new Error('expected created')
    expect(initial.revision.snapshot.status).toBe('candidate')

    await workoutsService.remove(userId, created.id, created.revision)
    const invalidated = await repository.refreshRecordedTrainingFrequency(userId)
    expect(invalidated.outcome).toBe('revised')
    if (invalidated.outcome !== 'revised') throw new Error('expected revised')
    expect(invalidated.unknownReceipt?.reasons).toEqual(['no_eligible_evidence'])
    expect(invalidated.revision).toMatchObject({
      action: 'invalidated',
      snapshot: { status: 'invalidated', evidenceSet: { includedCount: 0, withdrawnCount: 1 } },
    })

    await pool.query('DELETE FROM users WHERE id = $1', [userId])
    owners.delete(userId)
    const remaining = await pool.query<{
      items: string
      revisions: string
      evidence: string
      requests: string
      resolutions: string
    }>(
      `
        SELECT
          (SELECT COUNT(*) FROM personal_model_items WHERE user_id = $1)::text AS items,
          (SELECT COUNT(*) FROM personal_model_item_revisions WHERE user_id = $1)::text AS revisions,
          (SELECT COUNT(*) FROM personal_model_evidence_refs WHERE user_id = $1)::text AS evidence,
          (SELECT COUNT(*) FROM personal_model_source_refresh_requests WHERE user_id = $1)::text AS requests,
          (SELECT COUNT(*) FROM personal_model_source_refresh_resolutions WHERE user_id = $1)::text AS resolutions
      `,
      [userId],
    )
    expect(remaining.rows[0]).toEqual({
      items: '0',
      revisions: '0',
      evidence: '0',
      requests: '0',
      resolutions: '0',
    })
  })
})
