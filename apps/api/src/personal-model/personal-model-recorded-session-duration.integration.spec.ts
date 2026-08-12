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
  RecordedSessionDurationAuthorityNotFoundError,
} from './personal-model.repository'

describe('recorded session duration executor with PostgreSQL', () => {
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
          id, 'Duration owner', '25_34', 'unspecified',
          170, 170, 'cm', 'metric',
          'Asia/Shanghai', created_at, 'eligible', '{}',
          1, created_at, clock_timestamp()
        FROM account
      `,
      [userId, ageInWeeks],
    )
    return userId
  }

  const workoutInput = async (weeksAgo: number, durationMinutes = 60): Promise<CreateWorkout> => {
    const time = await pool.query<{ started_at: Date; ended_at: Date }>(
      `
        SELECT
          (
            DATE_TRUNC('week', clock_timestamp() AT TIME ZONE 'Asia/Shanghai')
            - ($1 * INTERVAL '1 week') + INTERVAL '10 hours'
          ) AT TIME ZONE 'Asia/Shanghai' AS started_at,
          (
            DATE_TRUNC('week', clock_timestamp() AT TIME ZONE 'Asia/Shanghai')
            - ($1 * INTERVAL '1 week') + INTERVAL '10 hours'
          ) AT TIME ZONE 'Asia/Shanghai' + ($2 * INTERVAL '1 minute') AS ended_at
      `,
      [weeksAgo, durationMinutes],
    )
    const row = time.rows[0]!
    return {
      title: `第 ${weeksAgo} 周 ${durationMinutes} 分钟训练`,
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

  const createWorkout = async (userId: string, weeksAgo: number, durationMinutes = 60) => {
    const input = await workoutInput(weeksAgo, durationMinutes)
    const created = await workoutsService.create(userId, `duration-${randomUUID()}`, input)
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
    await expect(repository.refreshRecordedSessionDuration(randomUUID())).rejects.toBeInstanceOf(
      RecordedSessionDurationAuthorityNotFoundError,
    )
  })

  it('distinguishes incomplete account coverage from complete weeks with no duration evidence', async () => {
    const recentUserId = await createOwner(0)
    const recent = await repository.refreshRecordedSessionDuration(recentUserId)
    expect(recent.outcome).toBe('unknown')
    if (recent.outcome !== 'unknown') throw new Error('expected Unknown')
    expect(recent.receipt.reasons).toEqual(['insufficient_coverage'])

    const establishedUserId = await createOwner(10)
    const established = await repository.refreshRecordedSessionDuration(establishedUserId)
    expect(established.outcome).toBe('unknown')
    if (established.outcome !== 'unknown') throw new Error('expected Unknown')
    expect(established.receipt.reasons).toEqual(['no_eligible_evidence'])

    const rows = await pool.query<{ items: string }>(
      `SELECT COUNT(*)::text AS items FROM personal_model_items WHERE user_id = ANY($1::uuid[])`,
      [[recentUserId, establishedUserId]],
    )
    expect(rows.rows[0]).toEqual({ items: '0' })
  })

  it('serializes concurrent creation and persists exact duration statistics', async () => {
    const userId = await createOwner(10)
    const samples = [
      [7, 20],
      [6, 30],
      [5, 40],
      [4, 50],
      [3, 60],
      [2, 90],
    ] as const
    for (const [weeksAgo, durationMinutes] of samples) {
      await createWorkout(userId, weeksAgo, durationMinutes)
    }

    const results = await Promise.all([
      repository.refreshRecordedSessionDuration(userId),
      repository.refreshRecordedSessionDuration(userId),
    ])
    expect(results.map((result) => result.outcome).sort()).toEqual(['created', 'no_op'])
    const created = results.find((result) => result.outcome === 'created')
    if (!created || created.outcome !== 'created') throw new Error('expected created')
    expect(created.revision.snapshot).toMatchObject({
      status: 'active',
      claim: {
        observationWindow: { completeWeeks: 8, timezone: 'Asia/Shanghai' },
        sampleCount: 6,
        coveredWeeks: 6,
        firstQuartileMinutes: 30,
        medianMinutes: 45,
        thirdQuartileMinutes: 60,
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

  it('consumes a corrected workout request and recalculates the replacement duration once', async () => {
    const userId = await createOwner(10)
    const entries = []
    for (const [weeksAgo, durationMinutes] of [
      [7, 20],
      [6, 30],
      [5, 40],
      [4, 50],
      [3, 60],
      [2, 90],
    ] as const) {
      entries.push(await createWorkout(userId, weeksAgo, durationMinutes))
    }
    const initial = await repository.refreshRecordedSessionDuration(userId)
    if (initial.outcome !== 'created') throw new Error('expected created')

    const first = entries[0]!
    const correctedInput = await workoutInput(7, 120)
    await workoutsService.update(userId, first.created.id, {
      ...correctedInput,
      expectedRevision: first.created.revision,
    })
    const refreshed = await repository.refreshRecordedSessionDuration(userId)
    expect(refreshed.outcome).toBe('revised')
    if (refreshed.outcome !== 'revised') throw new Error('expected revised')
    expect(refreshed.revision.snapshot).toMatchObject({
      claim: {
        sampleCount: 6,
        firstQuartileMinutes: 40,
        medianMinutes: 55,
        thirdQuartileMinutes: 90,
      },
      evidenceSet: { includedCount: 6, withdrawnCount: 1 },
    })
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
        WHERE item.user_id = $1 AND item.subject_key = 'training.recorded_session_duration'
      `,
      [userId],
    )
    expect(receipts.rows[0]).toEqual({ requests: '1', resolutions: '1', revision: 2 })
  })

  it('invalidates after the last duration source is deleted and owner deletion leaves no residue', async () => {
    const userId = await createOwner(10)
    const { created } = await createWorkout(userId, 3, 45)
    const initial = await repository.refreshRecordedSessionDuration(userId)
    if (initial.outcome !== 'created') throw new Error('expected created')
    expect(initial.revision.snapshot.status).toBe('candidate')

    await workoutsService.remove(userId, created.id, created.revision)
    const invalidated = await repository.refreshRecordedSessionDuration(userId)
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

  it('creates one successor generation after a terminal baseline gains new evidence', async () => {
    const userId = await createOwner(10)
    const first = await createWorkout(userId, 7, 45)
    const initial = await repository.refreshRecordedSessionDuration(userId)
    if (initial.outcome !== 'created') throw new Error('expected created')

    await workoutsService.remove(userId, first.created.id, first.created.revision)
    const invalidated = await repository.refreshRecordedSessionDuration(userId)
    if (invalidated.outcome !== 'revised') throw new Error('expected invalidated revision')
    expect(invalidated.revision.snapshot.status).toBe('invalidated')

    await createWorkout(userId, 3, 75)
    const results = await Promise.all([
      repository.refreshRecordedSessionDuration(userId),
      repository.refreshRecordedSessionDuration(userId),
    ])
    expect(results.map((result) => result.outcome).sort()).toEqual(['created', 'no_op'])
    const successor = results.find((result) => result.outcome === 'created')
    if (!successor || successor.outcome !== 'created') throw new Error('expected successor')
    expect(successor.revision.itemId).not.toBe(initial.revision.itemId)
    expect(successor.revision.snapshot).toMatchObject({
      status: 'candidate',
      claim: { sampleCount: 1, medianMinutes: 75 },
    })

    const lineage = await pool.query<{
      id: string
      generation: number
      predecessor_item_id: string | null
      retired: boolean
      status: string
    }>(
      `
        SELECT
          item.id,
          item.generation,
          item.predecessor_item_id,
          item.retired_at IS NOT NULL AS retired,
          revision.snapshot ->> 'status' AS status
        FROM personal_model_items AS item
        JOIN personal_model_item_revisions AS revision
          ON revision.user_id = item.user_id
         AND revision.item_id = item.id
         AND revision.revision = item.current_revision
        WHERE item.user_id = $1
          AND item.subject_key = 'training.recorded_session_duration'
        ORDER BY item.generation
      `,
      [userId],
    )
    expect(lineage.rows).toEqual([
      {
        id: initial.revision.itemId,
        generation: 1,
        predecessor_item_id: null,
        retired: true,
        status: 'invalidated',
      },
      {
        id: successor.revision.itemId,
        generation: 2,
        predecessor_item_id: initial.revision.itemId,
        retired: false,
        status: 'candidate',
      },
    ])
  })
})
