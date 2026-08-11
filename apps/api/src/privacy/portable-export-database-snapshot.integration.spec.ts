import { createHash, randomUUID } from 'node:crypto'

import { privacyExportSchema, privacyExportSchemaVersion } from '@myfitness/contracts'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getRuntimeConfig } from '../config'
import { DatabaseService } from '../database/database.service'
import { runMigrations } from '../database/migrate'
import { serializePortableExport } from './portable-export-artifact'
import {
  PortableExportDatabaseSnapshotService,
  PortableExportSnapshotPayloadTooLargeError,
  portableExportSnapshotMaximumPayloadBytes,
  portableExportWorkoutExerciseHeaderPageQuery,
  portableExportWorkoutHeaderPageQuery,
  portableExportWorkoutRevisionHeaderPageQuery,
  portableExportWorkoutSetPageQuery,
} from './portable-export-database-snapshot'
import {
  createPortableExportJsonStream,
  portableExportJsonAsyncArray,
} from './portable-export-json-stream'

describe('portable export bounded PostgreSQL snapshot', () => {
  const config = getRuntimeConfig()
  const pool = new Pool({ connectionString: config.databaseUrl })
  const database = new DatabaseService()
  const snapshots = new PortableExportDatabaseSnapshotService(database)
  const users = new Set<string>()

  const createUser = async (status: 'active' | 'disabled' = 'active') => {
    const id = randomUUID()
    users.add(id)
    await pool.query('INSERT INTO users (id, status) VALUES ($1, $2)', [id, status])
    return id
  }

  const createRecord = async (
    userId: string,
    occurredAt: string,
    value: number,
    createdAt = occurredAt,
    sourceMetadata: Record<string, string> = {},
  ) => {
    const id = randomUUID()
    await pool.query(
      `INSERT INTO health_records (
         id, user_id, metric, canonical_value, canonical_unit,
         display_value, display_unit, source_kind, source_metadata,
         confidence, status, occurred_at, timezone, idempotency_key, request_hash,
         created_at, updated_at
       ) VALUES (
         $1, $2, 'body.weight', $3, 'kg', $3, 'kg', 'manual', $7::jsonb,
         NULL, 'confirmed', $4::timestamptz, 'Asia/Shanghai', $5, repeat('a', 64),
         $6::timestamptz, $6::timestamptz
       )`,
      [
        id,
        userId,
        value,
        occurredAt,
        `snapshot-${randomUUID()}`,
        createdAt,
        JSON.stringify(sourceMetadata),
      ],
    )
    return id
  }

  const createRevision = async (
    userId: string,
    recordId: string,
    changedAt: string,
    revision = 1,
    sourceMetadata: Record<string, string> = {},
  ) => {
    const id = randomUUID()
    const result = await pool.query(
      `INSERT INTO health_record_revisions (
         id, record_id, user_id, action, revision, metric,
         canonical_value, canonical_unit, display_value, display_unit,
         source_kind, source_metadata, confidence, status,
         occurred_at, timezone, created_at, updated_at, changed_at
       )
       SELECT $1, record.id, record.user_id, 'created', $2, record.metric,
              record.canonical_value, record.canonical_unit,
              record.display_value, record.display_unit,
              record.source_kind, $3::jsonb, record.confidence, record.status,
              record.occurred_at, record.timezone, record.created_at, record.updated_at,
              $4::timestamptz
       FROM health_records AS record
       WHERE record.id = $5 AND record.user_id = $6`,
      [id, revision, JSON.stringify(sourceMetadata), changedAt, recordId, userId],
    )
    if (result.rowCount !== 1) throw new Error('revision fixture record was not found')
    return id
  }

  const createConsentEvent = async (userId: string, acceptedAt: string, purpose = 'privacy') => {
    const id = randomUUID()
    await pool.query(
      `INSERT INTO consent_events (id, user_id, purpose, version, accepted_at)
       VALUES ($1, $2, $3, $4, $5::timestamptz)`,
      [id, userId, purpose, `snapshot-${randomUUID()}`.slice(0, 40), acceptedAt],
    )
    return id
  }

  const createWorkout = async (
    userId: string,
    startedAt: string,
    createdAt = startedAt,
    options: { id?: string; deletedAt?: string | null; title?: string } = {},
  ) => {
    const id = options.id ?? randomUUID()
    await pool.query(
      `INSERT INTO workout_sessions (
         id, user_id, title, status, source_kind, source_metadata, started_at, ended_at,
         timezone, pain_level, fatigue, note, revision, idempotency_key, request_hash,
         deleted_at, created_at, updated_at
       ) VALUES (
         $1, $2, $3, 'completed', 'manual', '{"fixture":"workout-header"}'::jsonb,
         $4::timestamptz, $4::timestamptz, 'Asia/Shanghai', 0, 3, 'header only', 1,
         $5, repeat('b', 64), $6::timestamptz, $7::timestamptz, $7::timestamptz
       )`,
      [
        id,
        userId,
        options.title ?? `Workout ${id.slice(0, 8)}`,
        startedAt,
        `workout-header-${randomUUID()}`,
        options.deletedAt ?? null,
        createdAt,
      ],
    )
    return id
  }

  const createWorkoutExercise = async (
    workoutId: string,
    position: number,
    options: { id?: string; name?: string } = {},
  ) => {
    const id = options.id ?? randomUUID()
    await pool.query(
      `INSERT INTO workout_exercises (
         id, workout_id, position, exercise_key, name, category, notes,
         tracking_mode, equipment, equipment_notes
       ) VALUES (
         $1, $2, $3, $4, $5, 'strength', $6,
         'reps_load', ARRAY['bodyweight']::text[], NULL
       )`,
      [
        id,
        workoutId,
        position,
        `fixture_${id.replaceAll('-', '')}`,
        options.name ?? `Exercise ${position}`,
        `exercise position ${position}`,
      ],
    )
    return id
  }

  const createWorkoutSet = async (exerciseId: string, position: number) => {
    const id = randomUUID()
    await pool.query(
      `INSERT INTO workout_sets (
         id, exercise_id, position, kind, reps, display_load, display_load_unit,
         canonical_load_kg, duration_seconds, distance_meters, rpe, completed
       ) VALUES (
         $1, $2, $3, 'working', 10, 20, 'kg', 20, NULL, NULL, 7, true
       )`,
      [id, exerciseId, position],
    )
    return id
  }

  const createWorkoutRevision = async (
    userId: string,
    workoutId: string,
    revision: number,
    changedAt: string,
    action: 'created' | 'updated' | 'deleted' = revision === 1 ? 'created' : 'updated',
  ) => {
    const id = randomUUID()
    await pool.query(
      `INSERT INTO workout_revisions (
         id, workout_id, user_id, action, revision, snapshot, changed_at
       ) VALUES (
         $1, $2, $3, $4, $5::integer,
         jsonb_build_object(
           'id', $2::uuid::text, 'revision', $5::integer, 'fixture', 'immutable'
         ),
         $6::timestamptz
       )`,
      [id, workoutId, userId, action, revision, changedAt],
    )
    return id
  }

  beforeAll(async () => {
    await runMigrations(config.databaseUrl)
  })

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[...users]])
    await database.onModuleDestroy()
    await pool.end()
  })

  it('keeps one owner snapshot stable across keyset pages without timestamp round-trips', async () => {
    const userId = await createUser()
    const otherUserId = await createUser()
    const occurredAt = [
      '2026-08-11T01:00:00.000001Z',
      '2026-08-11T01:00:00.000002Z',
      '2026-08-11T01:00:00.000003Z',
      '2026-08-11T01:00:00.000004Z',
      '2026-08-11T01:00:00.000005Z',
    ]
    const originalIds: string[] = []
    for (let index = 0; index < occurredAt.length; index += 1) {
      originalIds.push(await createRecord(userId, occurredAt[index]!, 70 + index))
    }
    await createRecord(otherUserId, '2026-08-11T01:00:00.000003Z', 999)

    const session = snapshots.createHealthRecordSnapshot(userId, { batchRows: 2 })
    const iterator = session.rows[Symbol.asyncIterator]()
    const first = await iterator.next()
    expect(first).toMatchObject({ done: false, value: { id: originalIds[0] } })

    const concurrentId = await createRecord(userId, '2026-08-11T01:00:00.0000035Z', 88)
    await pool.query(
      'UPDATE health_records SET canonical_value = 123, display_value = 123 WHERE id = $1',
      [originalIds[3]],
    )

    const rows = [first.value!]
    while (true) {
      const next = await iterator.next()
      if (next.done) break
      rows.push(next.value)
    }

    expect(rows.map((row) => row.id)).toEqual(originalIds)
    expect(rows[3]?.canonical_value).toBe(73)
    expect(rows.some((row) => row.id === concurrentId)).toBe(false)
    await expect(session.receipt).resolves.toEqual({
      batchRows: 2,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      batchCount: 3,
      rowCount: 5,
    })
  })

  it('streams owner workout headers in total order, including soft-deleted rows, from one stable snapshot', async () => {
    const userId = await createUser()
    const otherUserId = await createUser()
    const tiedIds = [randomUUID(), randomUUID()].sort()
    const orderedWorkouts: Array<{
      id: string
      startedAt: string
      createdAt: string
      deletedAt?: string
    }> = [
      {
        id: randomUUID(),
        startedAt: '2026-08-11T01:14:00.000001Z',
        createdAt: '2026-08-11T01:19:00.000001Z',
      },
      {
        id: randomUUID(),
        startedAt: '2026-08-11T01:15:00.000001Z',
        createdAt: '2026-08-11T01:15:00.000001Z',
      },
      {
        id: tiedIds[0]!,
        startedAt: '2026-08-11T01:15:00.000001Z',
        createdAt: '2026-08-11T01:15:00.000002Z',
        deletedAt: '2026-08-11T01:20:00.000001Z',
      },
      {
        id: tiedIds[1]!,
        startedAt: '2026-08-11T01:15:00.000001Z',
        createdAt: '2026-08-11T01:15:00.000002Z',
      },
    ]

    for (const workout of [...orderedWorkouts].reverse()) {
      await createWorkout(userId, workout.startedAt, workout.createdAt, {
        id: workout.id,
        deletedAt: workout.deletedAt ?? null,
      })
    }
    await createWorkout(otherUserId, orderedWorkouts[0]!.startedAt, orderedWorkouts[0]!.createdAt)

    const session = snapshots.createWorkoutHeaderSnapshot(userId, { batchRows: 2 })
    const iterator = session.rows[Symbol.asyncIterator]()
    const first = await iterator.next()
    expect(first).toMatchObject({ done: false })

    const concurrentId = await createWorkout(
      userId,
      '2026-08-11T01:16:00.000001Z',
      '2026-08-11T01:16:00.000002Z',
    )
    const rows = first.done ? [] : [first.value]
    for await (const row of { [Symbol.asyncIterator]: () => iterator }) rows.push(row)

    expect(rows.map((row) => row.id)).toEqual(orderedWorkouts.map((workout) => workout.id))
    expect(rows.map((row) => row.id)).not.toContain(concurrentId)
    expect(rows.filter((row) => row.deleted_at !== null)).toHaveLength(1)
    expect(Object.keys(rows[0]!).sort()).toEqual(
      [
        'id',
        'title',
        'status',
        'source_kind',
        'source_metadata',
        'started_at',
        'ended_at',
        'timezone',
        'pain_level',
        'fatigue',
        'note',
        'revision',
        'deleted_at',
        'created_at',
        'updated_at',
      ].sort(),
    )
    expect(rows[0]).not.toHaveProperty('exercises')
    expect(rows[0]).not.toHaveProperty('history')
    await expect(session.receipt).resolves.toEqual({
      batchRows: 2,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      batchCount: 2,
      rowCount: 4,
    })
  })

  it('uses the non-partial owner export index for the actual workout header page query', async () => {
    const userId = await createUser()
    await createWorkout(userId, '2026-08-11T01:25:00.000001Z')
    const definition = await pool.query<{ index_definition: string; predicate: string | null }>(
      `SELECT pg_get_indexdef(indexrelid) AS index_definition,
              pg_get_expr(indpred, indrelid) AS predicate
       FROM pg_index
       WHERE indexrelid = 'workout_sessions_user_export_idx'::regclass`,
    )
    expect(definition.rows).toEqual([
      expect.objectContaining({
        index_definition: expect.stringContaining('(user_id, started_at, created_at, id)'),
        predicate: null,
      }),
    ])

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SET LOCAL enable_seqscan = off')
      const plan = await client.query<{ 'QUERY PLAN': unknown }>(
        `EXPLAIN (FORMAT JSON, COSTS OFF) ${portableExportWorkoutHeaderPageQuery}`,
        [userId, null, 2, portableExportSnapshotMaximumPayloadBytes],
      )
      expect(JSON.stringify(plan.rows[0]?.['QUERY PLAN'])).toContain(
        'workout_sessions_user_export_idx',
      )
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }
  })

  it('propagates workout header cancellation without exposing a second row', async () => {
    const userId = await createUser()
    await createWorkout(userId, '2026-08-11T01:35:00.000001Z')
    await createWorkout(userId, '2026-08-11T01:35:00.000002Z')
    const abort = new AbortController()
    const session = snapshots.createWorkoutHeaderSnapshot(userId, {
      batchRows: 1,
      signal: abort.signal,
    })
    const iterator = session.rows[Symbol.asyncIterator]()
    await expect(iterator.next()).resolves.toMatchObject({ done: false })
    const cancellation = new Error('workout header snapshot cancelled by lease owner')
    const receiptFailure = session.receipt.catch((error: unknown) => error)

    abort.abort(cancellation)
    let streamFailure: unknown
    try {
      await iterator.next()
    } catch (error) {
      streamFailure = error
    }

    expect(streamFailure).toBe(cancellation)
    expect(await receiptFailure).toBe(cancellation)
  })

  it('keeps workout headers and ordered exercise headers in one root-owned snapshot', async () => {
    const userId = await createUser()
    const otherUserId = await createUser()
    const firstWorkoutId = await createWorkout(
      userId,
      '2026-08-11T01:36:00.000001Z',
      '2026-08-11T01:36:00.000002Z',
      { deletedAt: '2026-08-11T01:39:00.000001Z' },
    )
    const secondWorkoutId = await createWorkout(
      userId,
      '2026-08-11T01:37:00.000001Z',
      '2026-08-11T01:37:00.000002Z',
    )
    const otherWorkoutId = await createWorkout(otherUserId, '2026-08-11T01:38:00.000001Z')
    const firstWorkoutExerciseIds = [
      await createWorkoutExercise(firstWorkoutId, 2),
      await createWorkoutExercise(firstWorkoutId, 1),
    ]
    const secondWorkoutExerciseId = await createWorkoutExercise(secondWorkoutId, 1)
    await createWorkoutExercise(otherWorkoutId, 1)

    const session = snapshots.createWorkoutExerciseLayerSnapshot(userId, { batchRows: 1 })
    const workouts = session.workouts[Symbol.asyncIterator]()
    const firstWorkout = await workouts.next()
    expect(firstWorkout).toMatchObject({ done: false, value: { header: { id: firstWorkoutId } } })
    expect(firstWorkout.value!.header.deleted_at).not.toBeNull()

    const firstExercises = firstWorkout.value!.exercises[Symbol.asyncIterator]()
    const firstExercise = await firstExercises.next()
    expect(firstExercise).toMatchObject({ done: false, value: { position: 1 } })

    const concurrentFirstExerciseId = await createWorkoutExercise(firstWorkoutId, 3)
    const concurrentSecondExerciseId = await createWorkoutExercise(secondWorkoutId, 2)
    const firstExerciseRows = firstExercise.done ? [] : [firstExercise.value]
    for await (const exercise of { [Symbol.asyncIterator]: () => firstExercises }) {
      firstExerciseRows.push(exercise)
    }

    const secondWorkout = await workouts.next()
    expect(secondWorkout).toMatchObject({ done: false, value: { header: { id: secondWorkoutId } } })
    const secondExerciseRows: Array<Record<string, unknown>> = []
    for await (const exercise of secondWorkout.value!.exercises) secondExerciseRows.push(exercise)
    await expect(workouts.next()).resolves.toEqual({ done: true, value: undefined })

    expect(firstExerciseRows.map((exercise) => exercise.id)).toEqual(
      [...firstWorkoutExerciseIds].reverse(),
    )
    expect(firstExerciseRows.map((exercise) => exercise.position)).toEqual([1, 2])
    expect(firstExerciseRows.map((exercise) => exercise.id)).not.toContain(
      concurrentFirstExerciseId,
    )
    expect(secondExerciseRows.map((exercise) => exercise.id)).toEqual([secondWorkoutExerciseId])
    expect(secondExerciseRows.map((exercise) => exercise.id)).not.toContain(
      concurrentSecondExerciseId,
    )
    expect(Object.keys(firstExerciseRows[0]!).sort()).toEqual(
      [
        'id',
        'position',
        'exercise_key',
        'name',
        'category',
        'notes',
        'tracking_mode',
        'equipment',
        'equipment_notes',
      ].sort(),
    )
    expect(firstExerciseRows[0]).not.toHaveProperty('sets')

    let receiptSettled = false
    void session.receipt.then(
      () => {
        receiptSettled = true
      },
      () => {
        receiptSettled = true
      },
    )
    await Promise.resolve()
    expect(receiptSettled).toBe(false)

    await session.complete()
    await expect(session.receipt).resolves.toEqual({
      batchRows: 1,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      workoutHeaders: { batchCount: 2, rowCount: 2 },
      workoutExercises: { batchCount: 3, rowCount: 3 },
    })
  })

  it('uses the workout position index for the actual exercise header page query', async () => {
    const userId = await createUser()
    const workoutId = await createWorkout(userId, '2026-08-11T01:40:00.000001Z')
    await createWorkoutExercise(workoutId, 1)
    const definition = await pool.query<{ index_definition: string; predicate: string | null }>(
      `SELECT pg_get_indexdef(indexrelid) AS index_definition,
              pg_get_expr(indpred, indrelid) AS predicate
       FROM pg_index
       WHERE indexrelid = 'workout_exercises_workout_id_position_key'::regclass`,
    )
    expect(definition.rows).toEqual([
      expect.objectContaining({
        index_definition: expect.stringContaining('(workout_id, "position")'),
        predicate: null,
      }),
    ])

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SET LOCAL enable_seqscan = off')
      const plan = await client.query<{ 'QUERY PLAN': unknown }>(
        `EXPLAIN (FORMAT JSON, COSTS OFF) ${portableExportWorkoutExerciseHeaderPageQuery}`,
        [userId, workoutId, null, 2, portableExportSnapshotMaximumPayloadBytes],
      )
      expect(JSON.stringify(plan.rows[0]?.['QUERY PLAN'])).toContain(
        'workout_exercises_workout_id_position_key',
      )
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }
  })

  it('closes an active exercise child before cancelling its root snapshot', async () => {
    const userId = await createUser()
    const workoutId = await createWorkout(userId, '2026-08-11T01:45:00.000001Z')
    await createWorkoutExercise(workoutId, 1)
    await createWorkoutExercise(workoutId, 2)
    const session = snapshots.createWorkoutExerciseLayerSnapshot(userId, { batchRows: 1 })
    const workouts = session.workouts[Symbol.asyncIterator]()
    const workout = await workouts.next()
    const exercises = workout.value!.exercises[Symbol.asyncIterator]()
    await expect(exercises.next()).resolves.toMatchObject({ done: false })
    const cancellation = new Error('workout exercise root cancelled by lease owner')
    const receiptFailure = session.receipt.catch((error: unknown) => error)

    await session.cancel(cancellation)

    expect(await receiptFailure).toBe(cancellation)
    await expect(exercises.next()).resolves.toEqual({ done: true, value: undefined })
    await expect(workouts.next()).rejects.toBe(cancellation)
  })

  it('keeps workout, exercise and set rows in one stable owner snapshot', async () => {
    const userId = await createUser()
    const otherUserId = await createUser()
    const workoutId = await createWorkout(
      userId,
      '2026-08-11T01:46:00.000001Z',
      '2026-08-11T01:46:00.000002Z',
      { deletedAt: '2026-08-11T01:49:00.000001Z' },
    )
    const otherWorkoutId = await createWorkout(otherUserId, '2026-08-11T01:47:00.000001Z')
    const secondExerciseId = await createWorkoutExercise(workoutId, 2)
    const firstExerciseId = await createWorkoutExercise(workoutId, 1)
    const otherExerciseId = await createWorkoutExercise(otherWorkoutId, 1)
    const firstExerciseSetIds = [
      await createWorkoutSet(firstExerciseId, 2),
      await createWorkoutSet(firstExerciseId, 1),
    ]
    const secondExerciseSetId = await createWorkoutSet(secondExerciseId, 1)
    await createWorkoutSet(otherExerciseId, 1)

    const session = snapshots.createWorkoutSetLayerSnapshot(userId, { batchRows: 1 })
    const workouts = session.workouts[Symbol.asyncIterator]()
    const workout = await workouts.next()
    expect(workout).toMatchObject({ done: false, value: { header: { id: workoutId } } })
    expect(workout.value!.header.deleted_at).not.toBeNull()
    const exercises = workout.value!.exercises[Symbol.asyncIterator]()
    const firstExercise = await exercises.next()
    expect(firstExercise).toMatchObject({
      done: false,
      value: { header: { id: firstExerciseId, position: 1 } },
    })
    const firstSets = firstExercise.value!.sets[Symbol.asyncIterator]()
    const firstSet = await firstSets.next()
    expect(firstSet).toMatchObject({ done: false, value: { position: 1 } })

    const concurrentFirstSetId = await createWorkoutSet(firstExerciseId, 3)
    const concurrentSecondSetId = await createWorkoutSet(secondExerciseId, 2)
    const firstSetRows = firstSet.done ? [] : [firstSet.value]
    for await (const set of { [Symbol.asyncIterator]: () => firstSets }) firstSetRows.push(set)

    const secondExercise = await exercises.next()
    expect(secondExercise).toMatchObject({
      done: false,
      value: { header: { id: secondExerciseId, position: 2 } },
    })
    const secondSetRows: Array<Record<string, unknown>> = []
    for await (const set of secondExercise.value!.sets) secondSetRows.push(set)
    await expect(exercises.next()).resolves.toEqual({ done: true, value: undefined })
    await expect(workouts.next()).resolves.toEqual({ done: true, value: undefined })

    expect(firstSetRows.map((set) => set.id)).toEqual([...firstExerciseSetIds].reverse())
    expect(firstSetRows.map((set) => set.position)).toEqual([1, 2])
    expect(firstSetRows.map((set) => set.id)).not.toContain(concurrentFirstSetId)
    expect(secondSetRows.map((set) => set.id)).toEqual([secondExerciseSetId])
    expect(secondSetRows.map((set) => set.id)).not.toContain(concurrentSecondSetId)
    expect(Object.keys(firstSetRows[0]!).sort()).toEqual(
      [
        'id',
        'position',
        'kind',
        'reps',
        'display_load',
        'display_load_unit',
        'canonical_load_kg',
        'duration_seconds',
        'distance_meters',
        'rpe',
        'completed',
      ].sort(),
    )
    expect(firstSetRows[0]).not.toHaveProperty('exercise_id')

    let receiptSettled = false
    void session.receipt.then(
      () => {
        receiptSettled = true
      },
      () => {
        receiptSettled = true
      },
    )
    await Promise.resolve()
    expect(receiptSettled).toBe(false)

    await session.complete()
    await expect(session.receipt).resolves.toEqual({
      batchRows: 1,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      workoutHeaders: { batchCount: 1, rowCount: 1 },
      workoutExercises: { batchCount: 2, rowCount: 2 },
      workoutSets: { batchCount: 3, rowCount: 3 },
    })
  })

  it('uses the exercise position index for the actual workout set page query', async () => {
    const userId = await createUser()
    const workoutId = await createWorkout(userId, '2026-08-11T01:50:00.000001Z')
    const exerciseId = await createWorkoutExercise(workoutId, 1)
    await createWorkoutSet(exerciseId, 1)
    const definition = await pool.query<{ index_definition: string; predicate: string | null }>(
      `SELECT pg_get_indexdef(indexrelid) AS index_definition,
              pg_get_expr(indpred, indrelid) AS predicate
       FROM pg_index
       WHERE indexrelid = 'workout_sets_exercise_id_position_key'::regclass`,
    )
    expect(definition.rows).toEqual([
      expect.objectContaining({
        index_definition: expect.stringContaining('(exercise_id, "position")'),
        predicate: null,
      }),
    ])

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SET LOCAL enable_seqscan = off')
      const plan = await client.query<{ 'QUERY PLAN': unknown }>(
        `EXPLAIN (FORMAT JSON, COSTS OFF) ${portableExportWorkoutSetPageQuery}`,
        [userId, workoutId, exerciseId, null, 2, portableExportSnapshotMaximumPayloadBytes],
      )
      expect(JSON.stringify(plan.rows[0]?.['QUERY PLAN'])).toContain(
        'workout_sets_exercise_id_position_key',
      )
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }
  })

  it('closes an active set before cancelling its exercise and workout parents', async () => {
    const userId = await createUser()
    const workoutId = await createWorkout(userId, '2026-08-11T01:55:00.000001Z')
    const exerciseId = await createWorkoutExercise(workoutId, 1)
    await createWorkoutSet(exerciseId, 1)
    await createWorkoutSet(exerciseId, 2)
    const session = snapshots.createWorkoutSetLayerSnapshot(userId, { batchRows: 1 })
    const workouts = session.workouts[Symbol.asyncIterator]()
    const workout = await workouts.next()
    const exercises = workout.value!.exercises[Symbol.asyncIterator]()
    const exercise = await exercises.next()
    const sets = exercise.value!.sets[Symbol.asyncIterator]()
    await expect(sets.next()).resolves.toMatchObject({ done: false })
    const cancellation = new Error('workout set root cancelled by lease owner')
    const receiptFailure = session.receipt.catch((error: unknown) => error)

    await session.cancel(cancellation)

    expect(await receiptFailure).toBe(cancellation)
    await expect(sets.next()).resolves.toEqual({ done: true, value: undefined })
    await expect(exercises.next()).resolves.toEqual({ done: true, value: undefined })
    await expect(workouts.next()).rejects.toBe(cancellation)
  })

  it('keeps workout relation rows and revision headers in one stable owner snapshot', async () => {
    const userId = await createUser()
    const otherUserId = await createUser()
    const workoutId = await createWorkout(
      userId,
      '2026-08-11T01:56:00.000001Z',
      '2026-08-11T01:56:00.000002Z',
      { deletedAt: '2026-08-11T01:59:00.000001Z' },
    )
    const otherWorkoutId = await createWorkout(otherUserId, '2026-08-11T01:57:00.000001Z')
    const exerciseId = await createWorkoutExercise(workoutId, 1)
    const setId = await createWorkoutSet(exerciseId, 1)
    const revisionIds = [
      await createWorkoutRevision(userId, workoutId, 2, '2026-08-11T01:58:00.000002Z'),
      await createWorkoutRevision(userId, workoutId, 1, '2026-08-11T01:58:00.000001Z'),
    ]
    await createWorkoutRevision(otherUserId, otherWorkoutId, 1, '2026-08-11T01:58:00.000001Z')

    const session = snapshots.createWorkoutRevisionHeaderLayerSnapshot(userId, { batchRows: 1 })
    const workouts = session.workouts[Symbol.asyncIterator]()
    const workout = await workouts.next()
    expect(workout).toMatchObject({ done: false, value: { header: { id: workoutId } } })
    expect(workout.value!.header.deleted_at).not.toBeNull()
    const exercises = workout.value!.exercises[Symbol.asyncIterator]()
    const exercise = await exercises.next()
    expect(exercise).toMatchObject({
      done: false,
      value: { header: { id: exerciseId, position: 1 } },
    })
    const setRows: Array<Record<string, unknown>> = []
    for await (const set of exercise.value!.sets) setRows.push(set)
    await expect(exercises.next()).resolves.toEqual({ done: true, value: undefined })
    expect(setRows.map((set) => set.id)).toEqual([setId])

    const history = workout.value!.history[Symbol.asyncIterator]()
    const firstRevision = await history.next()
    expect(firstRevision).toMatchObject({
      done: false,
      value: { id: revisionIds[1], action: 'created', revision: 1 },
    })
    const concurrentRevisionId = await createWorkoutRevision(
      userId,
      workoutId,
      3,
      '2026-08-11T01:58:00.000003Z',
    )
    const historyRows = firstRevision.done ? [] : [firstRevision.value]
    for await (const revision of { [Symbol.asyncIterator]: () => history }) {
      historyRows.push(revision)
    }
    await expect(workouts.next()).resolves.toEqual({ done: true, value: undefined })

    expect(historyRows.map((revision) => revision.id)).toEqual([...revisionIds].reverse())
    expect(historyRows.map((revision) => revision.revision)).toEqual([1, 2])
    expect(historyRows.map((revision) => revision.id)).not.toContain(concurrentRevisionId)
    expect(Object.keys(historyRows[0]!).sort()).toEqual(
      ['id', 'action', 'revision', 'changed_at'].sort(),
    )
    expect(historyRows[0]).not.toHaveProperty('snapshot')
    expect(historyRows[0]).not.toHaveProperty('workout_id')
    expect(historyRows[0]).not.toHaveProperty('user_id')

    let receiptSettled = false
    void session.receipt.then(
      () => {
        receiptSettled = true
      },
      () => {
        receiptSettled = true
      },
    )
    await Promise.resolve()
    expect(receiptSettled).toBe(false)

    await session.complete()
    await expect(session.receipt).resolves.toEqual({
      batchRows: 1,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      workoutHeaders: { batchCount: 1, rowCount: 1 },
      workoutExercises: { batchCount: 1, rowCount: 1 },
      workoutSets: { batchCount: 1, rowCount: 1 },
      workoutRevisions: { batchCount: 2, rowCount: 2 },
    })
  })

  it('uses an existing workout revision index for the actual revision header page query', async () => {
    const userId = await createUser()
    const workoutId = await createWorkout(userId, '2026-08-11T02:01:00.000001Z')
    await createWorkoutRevision(userId, workoutId, 1, '2026-08-11T02:02:00.000001Z')
    const definitions = await pool.query<{
      index_name: string
      index_definition: string
      predicate: string | null
    }>(
      `SELECT indexrelid::regclass::text AS index_name,
              pg_get_indexdef(indexrelid) AS index_definition,
              pg_get_expr(indpred, indrelid) AS predicate
       FROM pg_index
       WHERE indexrelid IN (
         'workout_revisions_workout_id_revision_key'::regclass,
         'workout_revisions_user_workout_idx'::regclass
       )
       ORDER BY index_name`,
    )
    expect(definitions.rows).toEqual([
      expect.objectContaining({
        index_name: 'workout_revisions_user_workout_idx',
        index_definition: expect.stringContaining('(user_id, workout_id, revision DESC)'),
        predicate: null,
      }),
      expect.objectContaining({
        index_name: 'workout_revisions_workout_id_revision_key',
        index_definition: expect.stringContaining('(workout_id, revision)'),
        predicate: null,
      }),
    ])

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SET LOCAL enable_seqscan = off')
      const plan = await client.query<{ 'QUERY PLAN': unknown }>(
        `EXPLAIN (FORMAT JSON, COSTS OFF) ${portableExportWorkoutRevisionHeaderPageQuery}`,
        [userId, workoutId, null, 2, portableExportSnapshotMaximumPayloadBytes],
      )
      expect(JSON.stringify(plan.rows[0]?.['QUERY PLAN'])).toMatch(
        /workout_revisions_(user_workout_idx|workout_id_revision_key)/,
      )
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }
  })

  it('closes an active revision header before cancelling its workout root', async () => {
    const userId = await createUser()
    const workoutId = await createWorkout(userId, '2026-08-11T02:05:00.000001Z')
    await createWorkoutRevision(userId, workoutId, 1, '2026-08-11T02:06:00.000001Z')
    await createWorkoutRevision(userId, workoutId, 2, '2026-08-11T02:06:00.000002Z')
    const session = snapshots.createWorkoutRevisionHeaderLayerSnapshot(userId, { batchRows: 1 })
    const workouts = session.workouts[Symbol.asyncIterator]()
    const workout = await workouts.next()
    for await (const _ of workout.value!.exercises) {
      // Reach the required relation boundary before history.
    }
    const history = workout.value!.history[Symbol.asyncIterator]()
    await expect(history.next()).resolves.toMatchObject({ done: false })
    const cancellation = new Error('workout revision root cancelled by lease owner')
    const receiptFailure = session.receipt.catch((error: unknown) => error)

    await session.cancel(cancellation)

    expect(await receiptFailure).toBe(cancellation)
    await expect(history.next()).resolves.toEqual({ done: true, value: undefined })
    await expect(workouts.next()).rejects.toBe(cancellation)
  })

  it('streams one owner revision history across microsecond pages into byte-compatible v4 JSON', async () => {
    const userId = await createUser()
    const otherUserId = await createUser()
    const changedAt = [
      '2026-08-11T01:30:00.000001Z',
      '2026-08-11T01:30:00.000002Z',
      '2026-08-11T01:30:00.000003Z',
      '2026-08-11T01:30:00.000003Z',
      '2026-08-11T01:30:00.000005Z',
    ]
    const originalRevisions: Array<{ changedAt: string; id: string; revision: number }> = []
    for (let index = 0; index < changedAt.length; index += 1) {
      const recordId = await createRecord(userId, changedAt[index]!, 80 + index)
      const revision = index < 4 ? 1 : 2
      originalRevisions.push({
        changedAt: changedAt[index]!,
        id: await createRevision(userId, recordId, changedAt[index]!, revision),
        revision,
      })
    }
    const expectedOriginalIds = [...originalRevisions]
      .sort(
        (left, right) =>
          left.changedAt.localeCompare(right.changedAt) ||
          left.revision - right.revision ||
          left.id.localeCompare(right.id),
      )
      .map((revision) => revision.id)
    const otherRecordId = await createRecord(otherUserId, changedAt[2]!, 999)
    await createRevision(otherUserId, otherRecordId, changedAt[2]!)
    const index = await pool.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = 'health_record_revisions_user_export_idx'`,
    )
    expect(index.rows[0]?.indexdef).toContain('(user_id, changed_at, revision, id)')

    const stable = snapshots.createHealthRecordRevisionSnapshot(userId, { batchRows: 2 })
    const iterator = stable.rows[Symbol.asyncIterator]()
    const first = await iterator.next()
    expect(first).toMatchObject({ done: false, value: { id: expectedOriginalIds[0] } })

    const concurrentRecordId = await createRecord(userId, '2026-08-11T01:30:00.0000035Z', 88)
    const concurrentRevisionId = await createRevision(
      userId,
      concurrentRecordId,
      '2026-08-11T01:30:00.0000035Z',
    )
    const stableRows = [first.value!]
    while (true) {
      const next = await iterator.next()
      if (next.done) break
      stableRows.push(next.value)
    }

    expect(stableRows.map((row) => row.id)).toEqual(expectedOriginalIds)
    expect(stableRows.some((row) => row.id === concurrentRevisionId)).toBe(false)
    await expect(stable.receipt).resolves.toEqual({
      batchRows: 2,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      batchCount: 3,
      rowCount: 5,
    })

    const eagerSnapshot = snapshots.createHealthRecordRevisionSnapshot(userId, { batchRows: 2 })
    const eagerRows: Array<Record<string, unknown>> = []
    for await (const row of eagerSnapshot.rows) eagerRows.push(row)
    await expect(eagerSnapshot.receipt).resolves.toEqual({
      batchRows: 2,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      batchCount: 3,
      rowCount: 6,
    })
    const eagerPayload = privacyExportSchema.parse({
      schemaVersion: privacyExportSchemaVersion,
      generatedAt: '2026-08-11T01:45:00.000Z',
      accountId: userId,
      data: {
        account: { id: userId, status: 'active' },
        identities: [],
        profile: null,
        goal: null,
        consentEvents: [],
        healthRecords: [],
        healthRecordRevisions: eagerRows,
        exerciseCatalog: [],
        foodCatalog: [],
        workouts: [],
        nutritionMeals: [],
        nutritionFavorites: [],
        weeklyPlans: [],
        aiExplanationRuns: [],
        foodPhotoAnalyses: [],
        progressPhotos: [],
      },
    })
    const expected = serializePortableExport(eagerPayload, Number.MAX_SAFE_INTEGER)

    const lazySnapshot = snapshots.createHealthRecordRevisionSnapshot(userId, { batchRows: 2 })
    const json = createPortableExportJsonStream(
      {
        ...eagerPayload,
        data: {
          ...eagerPayload.data,
          healthRecordRevisions: portableExportJsonAsyncArray(lazySnapshot.rows),
        },
      },
      { chunkBytes: 41 },
    )
    const chunks: Buffer[] = []
    for await (const chunk of json.bytes) {
      expect(chunk.length).toBeLessThanOrEqual(41)
      chunks.push(Buffer.from(chunk))
    }

    expect(Buffer.concat(chunks)).toEqual(expected)
    await expect(lazySnapshot.receipt).resolves.toEqual({
      batchRows: 2,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      batchCount: 3,
      rowCount: 6,
    })
    await expect(json.receipt).resolves.toEqual({
      schemaVersion: privacyExportSchemaVersion,
      chunkBytes: 41,
      byteLength: expected.length,
      sha256: createHash('sha256').update(expected).digest('hex'),
    })
  })

  it('keeps current health facts and revisions in one root-committed database snapshot', async () => {
    const userId = await createUser()
    const firstRecordId = await createRecord(userId, '2026-08-11T01:50:00.000001Z', 70)
    const secondRecordId = await createRecord(userId, '2026-08-11T01:50:00.000002Z', 71)
    const firstRevisionId = await createRevision(
      userId,
      firstRecordId,
      '2026-08-11T01:55:00.000001Z',
    )
    const secondRevisionId = await createRevision(
      userId,
      secondRecordId,
      '2026-08-11T01:55:00.000002Z',
    )
    const stable = snapshots.createHealthHistorySnapshot(userId, { batchRows: 1 })
    const stableRecords: Array<Record<string, unknown>> = []
    const stableRevisions: Array<Record<string, unknown>> = []

    for await (const row of stable.healthRecords) stableRecords.push(row)
    const concurrentRecordId = await createRecord(userId, '2026-08-11T01:50:00.000003Z', 72)
    const concurrentRevisionId = await createRevision(
      userId,
      concurrentRecordId,
      '2026-08-11T01:55:00.000003Z',
    )
    for await (const row of stable.healthRecordRevisions) stableRevisions.push(row)
    let receiptSettled = false
    void stable.receipt.finally(() => {
      receiptSettled = true
    })

    expect(stableRecords.map((row) => row.id)).toEqual([firstRecordId, secondRecordId])
    expect(stableRevisions.map((row) => row.id)).toEqual([firstRevisionId, secondRevisionId])
    expect(stableRevisions.some((row) => row.id === concurrentRevisionId)).toBe(false)
    expect(receiptSettled).toBe(false)

    await stable.complete()

    await expect(stable.receipt).resolves.toEqual({
      batchRows: 1,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      healthRecords: { batchCount: 2, rowCount: 2 },
      healthRecordRevisions: { batchCount: 2, rowCount: 2 },
    })

    const eager = snapshots.createHealthHistorySnapshot(userId, { batchRows: 2 })
    const eagerRecords: Array<Record<string, unknown>> = []
    const eagerRevisions: Array<Record<string, unknown>> = []
    for await (const row of eager.healthRecords) eagerRecords.push(row)
    for await (const row of eager.healthRecordRevisions) eagerRevisions.push(row)
    await eager.complete()
    const eagerPayload = privacyExportSchema.parse({
      schemaVersion: privacyExportSchemaVersion,
      generatedAt: '2026-08-11T01:59:00.000Z',
      accountId: userId,
      data: {
        account: { id: userId, status: 'active' },
        identities: [],
        profile: null,
        goal: null,
        consentEvents: [],
        healthRecords: eagerRecords,
        healthRecordRevisions: eagerRevisions,
        exerciseCatalog: [],
        foodCatalog: [],
        workouts: [],
        nutritionMeals: [],
        nutritionFavorites: [],
        weeklyPlans: [],
        aiExplanationRuns: [],
        foodPhotoAnalyses: [],
        progressPhotos: [],
      },
    })
    expect(eagerRecords.map((row) => row.id)).toContain(concurrentRecordId)
    expect(eagerRevisions.map((row) => row.id)).toContain(concurrentRevisionId)
    const expected = serializePortableExport(eagerPayload, Number.MAX_SAFE_INTEGER)

    const lazy = snapshots.createHealthHistorySnapshot(userId, { batchRows: 2 })
    const json = createPortableExportJsonStream(
      {
        ...eagerPayload,
        data: {
          ...eagerPayload.data,
          healthRecords: portableExportJsonAsyncArray(lazy.healthRecords),
          healthRecordRevisions: portableExportJsonAsyncArray(lazy.healthRecordRevisions),
        },
      },
      { chunkBytes: 43, lifecycle: lazy },
    )
    const chunks: Buffer[] = []
    for await (const chunk of json.bytes) chunks.push(Buffer.from(chunk))

    expect(Buffer.concat(chunks)).toEqual(expected)
    await expect(lazy.receipt).resolves.toEqual({
      batchRows: 2,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      healthRecords: { batchCount: 2, rowCount: 3 },
      healthRecordRevisions: { batchCount: 2, rowCount: 3 },
    })
    await expect(json.receipt).resolves.toEqual({
      schemaVersion: privacyExportSchemaVersion,
      chunkBytes: 43,
      byteLength: expected.length,
      sha256: createHash('sha256').update(expected).digest('hex'),
    })
  })

  it('streams consent evidence and health history from one ordered root snapshot', async () => {
    const userId = await createUser()
    const otherUserId = await createUser()
    const consentAcceptedAt = '2026-08-11T01:47:00.000001Z'
    await Promise.all([
      createConsentEvent(userId, consentAcceptedAt, 'privacy'),
      createConsentEvent(userId, consentAcceptedAt, 'health_data'),
    ])
    const originalConsentIds = await pool.query<{ id: string }>(
      'SELECT id FROM consent_events WHERE user_id = $1 ORDER BY accepted_at, id',
      [userId],
    )
    await createConsentEvent(otherUserId, consentAcceptedAt, 'privacy')
    const firstRecordId = await createRecord(userId, '2026-08-11T01:48:00.000001Z', 70)
    const secondRecordId = await createRecord(userId, '2026-08-11T01:48:00.000002Z', 71)
    const firstRevisionId = await createRevision(
      userId,
      firstRecordId,
      '2026-08-11T01:49:00.000001Z',
    )
    const secondRevisionId = await createRevision(
      userId,
      secondRecordId,
      '2026-08-11T01:49:00.000002Z',
    )
    const index = await pool.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = 'consent_events_user_history_idx'`,
    )
    expect(index.rows[0]?.indexdef).toContain('(user_id, accepted_at DESC, id DESC)')

    const stable = snapshots.createConsentHealthSnapshot(userId, { batchRows: 1 })
    const stableConsentEvents: Array<Record<string, unknown>> = []
    const stableHealthRecords: Array<Record<string, unknown>> = []
    const stableHealthRecordRevisions: Array<Record<string, unknown>> = []
    for await (const row of stable.consentEvents) stableConsentEvents.push(row)

    const concurrentConsentId = await createConsentEvent(
      userId,
      '2026-08-11T01:47:00.000002Z',
      'progress_photo_analysis',
    )
    const concurrentRecordId = await createRecord(userId, '2026-08-11T01:48:00.000003Z', 72)
    const concurrentRevisionId = await createRevision(
      userId,
      concurrentRecordId,
      '2026-08-11T01:49:00.000003Z',
    )
    for await (const row of stable.healthRecords) stableHealthRecords.push(row)
    for await (const row of stable.healthRecordRevisions) {
      stableHealthRecordRevisions.push(row)
    }

    expect(stableConsentEvents.map((row) => row.id)).toEqual(
      originalConsentIds.rows.map((row) => row.id),
    )
    expect(stableConsentEvents.some((row) => row.id === concurrentConsentId)).toBe(false)
    expect(stableHealthRecords.map((row) => row.id)).toEqual([firstRecordId, secondRecordId])
    expect(stableHealthRecords.some((row) => row.id === concurrentRecordId)).toBe(false)
    expect(stableHealthRecordRevisions.map((row) => row.id)).toEqual([
      firstRevisionId,
      secondRevisionId,
    ])
    expect(stableHealthRecordRevisions.some((row) => row.id === concurrentRevisionId)).toBe(false)
    await stable.complete()
    await expect(stable.receipt).resolves.toEqual({
      batchRows: 1,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      consentEvents: { batchCount: 2, rowCount: 2 },
      healthRecords: { batchCount: 2, rowCount: 2 },
      healthRecordRevisions: { batchCount: 2, rowCount: 2 },
    })

    const eager = snapshots.createConsentHealthSnapshot(userId, { batchRows: 2 })
    const eagerConsentEvents: Array<Record<string, unknown>> = []
    const eagerHealthRecords: Array<Record<string, unknown>> = []
    const eagerHealthRecordRevisions: Array<Record<string, unknown>> = []
    for await (const row of eager.consentEvents) eagerConsentEvents.push(row)
    for await (const row of eager.healthRecords) eagerHealthRecords.push(row)
    for await (const row of eager.healthRecordRevisions) eagerHealthRecordRevisions.push(row)
    await eager.complete()
    expect(eagerConsentEvents.map((row) => row.id)).toContain(concurrentConsentId)
    expect(eagerHealthRecords.map((row) => row.id)).toContain(concurrentRecordId)
    expect(eagerHealthRecordRevisions.map((row) => row.id)).toContain(concurrentRevisionId)
    const eagerPayload = privacyExportSchema.parse({
      schemaVersion: privacyExportSchemaVersion,
      generatedAt: '2026-08-11T01:59:10.000Z',
      accountId: userId,
      data: {
        account: { id: userId, status: 'active' },
        identities: [],
        profile: null,
        goal: null,
        consentEvents: eagerConsentEvents,
        healthRecords: eagerHealthRecords,
        healthRecordRevisions: eagerHealthRecordRevisions,
        exerciseCatalog: [],
        foodCatalog: [],
        workouts: [],
        nutritionMeals: [],
        nutritionFavorites: [],
        weeklyPlans: [],
        aiExplanationRuns: [],
        foodPhotoAnalyses: [],
        progressPhotos: [],
      },
    })
    const expected = serializePortableExport(eagerPayload, Number.MAX_SAFE_INTEGER)

    const lazy = snapshots.createConsentHealthSnapshot(userId, { batchRows: 2 })
    const json = createPortableExportJsonStream(
      {
        ...eagerPayload,
        data: {
          ...eagerPayload.data,
          consentEvents: portableExportJsonAsyncArray(lazy.consentEvents),
          healthRecords: portableExportJsonAsyncArray(lazy.healthRecords),
          healthRecordRevisions: portableExportJsonAsyncArray(lazy.healthRecordRevisions),
        },
      },
      { chunkBytes: 47, lifecycle: lazy },
    )
    const chunks: Buffer[] = []
    for await (const chunk of json.bytes) chunks.push(Buffer.from(chunk))

    expect(Buffer.concat(chunks)).toEqual(expected)
    await expect(lazy.receipt).resolves.toEqual({
      batchRows: 2,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      consentEvents: { batchCount: 2, rowCount: 3 },
      healthRecords: { batchCount: 2, rowCount: 3 },
      healthRecordRevisions: { batchCount: 2, rowCount: 3 },
    })
    await expect(json.receipt).resolves.toEqual({
      schemaVersion: privacyExportSchemaVersion,
      chunkBytes: 47,
      byteLength: expected.length,
      sha256: createHash('sha256').update(expected).digest('hex'),
    })
  })

  it('rolls back the root transaction when JSON is cancelled after consent evidence', async () => {
    const userId = await createUser()
    await createConsentEvent(userId, '2026-08-11T01:59:20.000001Z')
    const snapshot = snapshots.createConsentHealthSnapshot(userId, { batchRows: 1 })
    let consentEventsCompleted = false
    let healthRecordsStarted = false
    const observedConsentEvents = (async function* () {
      for await (const row of snapshot.consentEvents) yield row
      consentEventsCompleted = true
    })()
    const observedHealthRecords = (async function* () {
      healthRecordsStarted = true
      yield* snapshot.healthRecords
    })()
    const payload = privacyExportSchema.parse({
      schemaVersion: privacyExportSchemaVersion,
      generatedAt: '2026-08-11T01:59:30.000Z',
      accountId: userId,
      data: {
        account: { id: userId },
        identities: [],
        profile: null,
        goal: null,
        consentEvents: [],
        healthRecords: [],
        healthRecordRevisions: [],
        exerciseCatalog: [],
        foodCatalog: [],
        workouts: [],
        nutritionMeals: [],
        nutritionFavorites: [],
        weeklyPlans: [],
        aiExplanationRuns: [],
        foodPhotoAnalyses: [],
        progressPhotos: [],
      },
    })
    const json = createPortableExportJsonStream(
      {
        ...payload,
        data: {
          ...payload.data,
          consentEvents: portableExportJsonAsyncArray(observedConsentEvents),
          healthRecords: portableExportJsonAsyncArray(observedHealthRecords),
          healthRecordRevisions: portableExportJsonAsyncArray(snapshot.healthRecordRevisions),
        },
      },
      { chunkBytes: 1, lifecycle: snapshot },
    )
    const iterator = json.bytes[Symbol.asyncIterator]()
    while (!consentEventsCompleted) {
      await expect(iterator.next()).resolves.toMatchObject({ done: false })
    }
    expect(healthRecordsStarted).toBe(false)
    const jsonFailure = json.receipt.catch((error: unknown) => error)
    const snapshotFailure = snapshot.receipt.catch((error: unknown) => error)

    await iterator.return?.()

    expect(await snapshotFailure).toBe(await jsonFailure)
    expect(await jsonFailure).toMatchObject({
      message: 'portable export JSON stream did not complete',
    })
  })

  it('rolls back one root transaction when JSON is cancelled between health fields', async () => {
    const userId = await createUser()
    const recordId = await createRecord(userId, '2026-08-11T01:59:30.000001Z', 70)
    await createRevision(userId, recordId, '2026-08-11T01:59:40.000001Z')
    const snapshot = snapshots.createHealthHistorySnapshot(userId, { batchRows: 1 })
    let healthRecordsCompleted = false
    let healthRecordRevisionsStarted = false
    const observedHealthRecords = (async function* () {
      for await (const row of snapshot.healthRecords) yield row
      healthRecordsCompleted = true
    })()
    const observedHealthRecordRevisions = (async function* () {
      healthRecordRevisionsStarted = true
      yield* snapshot.healthRecordRevisions
    })()
    const payload = privacyExportSchema.parse({
      schemaVersion: privacyExportSchemaVersion,
      generatedAt: '2026-08-11T01:59:50.000Z',
      accountId: userId,
      data: {
        account: { id: userId },
        identities: [],
        profile: null,
        goal: null,
        consentEvents: [],
        healthRecords: [],
        healthRecordRevisions: [],
        exerciseCatalog: [],
        foodCatalog: [],
        workouts: [],
        nutritionMeals: [],
        nutritionFavorites: [],
        weeklyPlans: [],
        aiExplanationRuns: [],
        foodPhotoAnalyses: [],
        progressPhotos: [],
      },
    })
    const json = createPortableExportJsonStream(
      {
        ...payload,
        data: {
          ...payload.data,
          healthRecords: portableExportJsonAsyncArray(observedHealthRecords),
          healthRecordRevisions: portableExportJsonAsyncArray(observedHealthRecordRevisions),
        },
      },
      { chunkBytes: 1, lifecycle: snapshot },
    )
    const iterator = json.bytes[Symbol.asyncIterator]()
    while (!healthRecordsCompleted) {
      await expect(iterator.next()).resolves.toMatchObject({ done: false })
    }
    expect(healthRecordRevisionsStarted).toBe(false)
    const jsonFailure = json.receipt.catch((error: unknown) => error)
    const snapshotFailure = snapshot.receipt.catch((error: unknown) => error)

    await iterator.return?.()

    expect(await snapshotFailure).toBe(await jsonFailure)
    expect(await jsonFailure).toMatchObject({
      message: 'portable export JSON stream did not complete',
    })
  })

  it('fails closed for an inactive owner and for cancellation between rows', async () => {
    const disabledUserId = await createUser('disabled')
    const inactive = snapshots.createHealthRecordSnapshot(disabledUserId)
    const inactiveReceipt = expect(inactive.receipt).rejects.toThrowError(
      'active account not found',
    )
    await expect(
      (async () => {
        for await (const _ of inactive.rows) {
          // No row may be exposed for an inactive owner.
        }
      })(),
    ).rejects.toThrowError('active account not found')
    await inactiveReceipt

    const activeUserId = await createUser()
    await createRecord(activeUserId, '2026-08-11T02:00:00.000001Z', 70)
    await createRecord(activeUserId, '2026-08-11T02:00:00.000002Z', 71)
    const abort = new AbortController()
    const cancelled = snapshots.createHealthRecordSnapshot(activeUserId, {
      batchRows: 1,
      signal: abort.signal,
    })
    const cancelledIterator = cancelled.rows[Symbol.asyncIterator]()
    await expect(cancelledIterator.next()).resolves.toMatchObject({ done: false })
    abort.abort(new Error('snapshot cancelled by lease owner'))
    const cancelledReceipt = expect(cancelled.receipt).rejects.toThrowError(
      'snapshot cancelled by lease owner',
    )
    await expect(cancelledIterator.next()).rejects.toThrowError('snapshot cancelled by lease owner')
    await cancelledReceipt
  })

  it('withholds an oversized row in PostgreSQL and propagates one root error through JSON', async () => {
    const userId = await createUser()
    const secretMarker = `must-not-cross-the-database-boundary-${randomUUID()}`
    const recordId = await createRecord(
      userId,
      '2026-08-11T02:30:00.000001Z',
      70,
      '2026-08-11T02:30:00.000001Z',
      { provider: `${secretMarker}-${'x'.repeat(2048)}` },
    )
    const measured = await pool.query<{ payload_byte_length: number }>(
      `SELECT octet_length(to_jsonb(record)::text) AS payload_byte_length
       FROM (
         SELECT id, metric, canonical_value, canonical_unit, display_value, display_unit,
                source_kind, source_metadata, confidence, status, occurred_at, timezone,
                revision, deleted_at, created_at, updated_at
         FROM health_records
         WHERE id = $1
       ) AS record`,
      [recordId],
    )
    const expectedPayloadBytes = measured.rows[0]!.payload_byte_length
    expect(expectedPayloadBytes).toBeGreaterThan(512)

    const snapshot = snapshots.createHealthRecordSnapshot(userId, {
      batchRows: 1,
      maximumPayloadBytes: 512,
    })
    const snapshotReceiptFailure = snapshot.receipt.catch((error: unknown) => error)
    const base = privacyExportSchema.parse({
      schemaVersion: privacyExportSchemaVersion,
      generatedAt: '2026-08-11T02:45:00.000Z',
      accountId: userId,
      data: {
        account: { id: userId },
        identities: [],
        profile: null,
        goal: null,
        consentEvents: [],
        healthRecords: [],
        healthRecordRevisions: [],
        exerciseCatalog: [],
        foodCatalog: [],
        workouts: [],
        nutritionMeals: [],
        nutritionFavorites: [],
        weeklyPlans: [],
        aiExplanationRuns: [],
        foodPhotoAnalyses: [],
        progressPhotos: [],
      },
    })
    const json = createPortableExportJsonStream(
      {
        ...base,
        data: {
          ...base.data,
          healthRecords: portableExportJsonAsyncArray(snapshot.rows),
        },
      },
      { chunkBytes: 64 },
    )
    const jsonReceiptFailure = json.receipt.catch((error: unknown) => error)
    const chunks: Buffer[] = []
    let streamFailure: unknown

    try {
      for await (const chunk of json.bytes) chunks.push(Buffer.from(chunk))
    } catch (error) {
      streamFailure = error
    }

    expect(streamFailure).toBeInstanceOf(PortableExportSnapshotPayloadTooLargeError)
    expect(streamFailure).toMatchObject({
      code: 'portable_export_snapshot_payload_too_large',
      maximumBytes: 512,
      actualBytes: expectedPayloadBytes,
    })
    expect(Buffer.concat(chunks).toString('utf8')).not.toContain(secretMarker)
    expect(await snapshotReceiptFailure).toBe(streamFailure)
    expect(await jsonReceiptFailure).toBe(streamFailure)
  })

  it('reuses the database payload gate for oversized health record revisions', async () => {
    const userId = await createUser()
    const secretMarker = `revision-must-not-cross-${randomUUID()}`
    const recordId = await createRecord(userId, '2026-08-11T02:50:00.000001Z', 70)
    const revisionId = await createRevision(userId, recordId, '2026-08-11T02:55:00.000001Z', 1, {
      provider: `${secretMarker}-${'y'.repeat(2048)}`,
    })
    const measured = await pool.query<{ payload_byte_length: number }>(
      `SELECT octet_length(to_jsonb(history)::text) AS payload_byte_length
       FROM (
         SELECT id, record_id, action, revision, metric, canonical_value, canonical_unit,
                display_value, display_unit, source_kind, source_metadata, confidence,
                status, occurred_at, timezone, created_at, updated_at, changed_at
         FROM health_record_revisions
         WHERE id = $1
       ) AS history`,
      [revisionId],
    )
    const expectedPayloadBytes = measured.rows[0]!.payload_byte_length
    expect(expectedPayloadBytes).toBeGreaterThan(512)

    const snapshot = snapshots.createHealthRecordRevisionSnapshot(userId, {
      batchRows: 1,
      maximumPayloadBytes: 512,
    })
    const snapshotReceiptFailure = snapshot.receipt.catch((error: unknown) => error)
    const base = privacyExportSchema.parse({
      schemaVersion: privacyExportSchemaVersion,
      generatedAt: '2026-08-11T02:59:00.000Z',
      accountId: userId,
      data: {
        account: { id: userId },
        identities: [],
        profile: null,
        goal: null,
        consentEvents: [],
        healthRecords: [],
        healthRecordRevisions: [],
        exerciseCatalog: [],
        foodCatalog: [],
        workouts: [],
        nutritionMeals: [],
        nutritionFavorites: [],
        weeklyPlans: [],
        aiExplanationRuns: [],
        foodPhotoAnalyses: [],
        progressPhotos: [],
      },
    })
    const json = createPortableExportJsonStream(
      {
        ...base,
        data: {
          ...base.data,
          healthRecordRevisions: portableExportJsonAsyncArray(snapshot.rows),
        },
      },
      { chunkBytes: 64 },
    )
    const jsonReceiptFailure = json.receipt.catch((error: unknown) => error)
    const chunks: Buffer[] = []
    let streamFailure: unknown

    try {
      for await (const chunk of json.bytes) chunks.push(Buffer.from(chunk))
    } catch (error) {
      streamFailure = error
    }

    expect(streamFailure).toBeInstanceOf(PortableExportSnapshotPayloadTooLargeError)
    expect(streamFailure).toMatchObject({
      code: 'portable_export_snapshot_payload_too_large',
      maximumBytes: 512,
      actualBytes: expectedPayloadBytes,
    })
    expect(Buffer.concat(chunks).toString('utf8')).not.toContain(secretMarker)
    expect(await snapshotReceiptFailure).toBe(streamFailure)
    expect(await jsonReceiptFailure).toBe(streamFailure)
  })

  it('feeds the owner snapshot into a byte-compatible complete v4 JSON tree without an array copy', async () => {
    const userId = await createUser()
    await createRecord(userId, '2026-08-11T03:00:00.000001Z', 70)
    await createRecord(userId, '2026-08-11T03:00:00.000002Z', 71)
    await createRecord(userId, '2026-08-11T03:00:00.000003Z', 72)

    const eagerSnapshot = snapshots.createHealthRecordSnapshot(userId, { batchRows: 2 })
    const eagerRows: Array<Record<string, unknown>> = []
    for await (const row of eagerSnapshot.rows) eagerRows.push(row)
    await expect(eagerSnapshot.receipt).resolves.toEqual({
      batchRows: 2,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      batchCount: 2,
      rowCount: 3,
    })
    const eagerPayload = privacyExportSchema.parse({
      schemaVersion: privacyExportSchemaVersion,
      generatedAt: '2026-08-11T03:30:00.000Z',
      accountId: userId,
      data: {
        account: { id: userId, status: 'active' },
        identities: [],
        profile: null,
        goal: null,
        consentEvents: [],
        healthRecords: eagerRows,
        healthRecordRevisions: [],
        exerciseCatalog: [],
        foodCatalog: [],
        workouts: [],
        nutritionMeals: [],
        nutritionFavorites: [],
        weeklyPlans: [],
        aiExplanationRuns: [],
        foodPhotoAnalyses: [],
        progressPhotos: [],
      },
    })
    const expected = serializePortableExport(eagerPayload, Number.MAX_SAFE_INTEGER)

    const lazySnapshot = snapshots.createHealthRecordSnapshot(userId, { batchRows: 2 })
    const json = createPortableExportJsonStream(
      {
        ...eagerPayload,
        data: {
          ...eagerPayload.data,
          healthRecords: portableExportJsonAsyncArray(lazySnapshot.rows),
        },
      },
      { chunkBytes: 37 },
    )
    const chunks: Buffer[] = []
    for await (const chunk of json.bytes) {
      expect(chunk.length).toBeLessThanOrEqual(37)
      chunks.push(Buffer.from(chunk))
    }

    expect(Buffer.concat(chunks)).toEqual(expected)
    await expect(lazySnapshot.receipt).resolves.toEqual({
      batchRows: 2,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      batchCount: 2,
      rowCount: 3,
    })
    await expect(json.receipt).resolves.toEqual({
      schemaVersion: privacyExportSchemaVersion,
      chunkBytes: 37,
      byteLength: expected.length,
      sha256: createHash('sha256').update(expected).digest('hex'),
    })
  })

  it('rolls back the database snapshot when the composed JSON consumer stops early', async () => {
    const userId = await createUser()
    await createRecord(userId, '2026-08-11T04:00:00.000001Z', 70)
    await createRecord(userId, '2026-08-11T04:00:00.000002Z', 71)
    const snapshot = snapshots.createHealthRecordSnapshot(userId, { batchRows: 1 })
    let yieldedRows = 0
    const observedRows = (async function* () {
      for await (const row of snapshot.rows) {
        yieldedRows += 1
        yield row
      }
    })()
    const base = privacyExportSchema.parse({
      schemaVersion: privacyExportSchemaVersion,
      generatedAt: '2026-08-11T04:30:00.000Z',
      accountId: userId,
      data: {
        account: { id: userId },
        identities: [],
        profile: null,
        goal: null,
        consentEvents: [],
        healthRecords: [],
        healthRecordRevisions: [],
        exerciseCatalog: [],
        foodCatalog: [],
        workouts: [],
        nutritionMeals: [],
        nutritionFavorites: [],
        weeklyPlans: [],
        aiExplanationRuns: [],
        foodPhotoAnalyses: [],
        progressPhotos: [],
      },
    })
    const json = createPortableExportJsonStream(
      {
        ...base,
        data: {
          ...base.data,
          healthRecords: portableExportJsonAsyncArray(observedRows),
        },
      },
      { chunkBytes: 32 },
    )
    const iterator = json.bytes[Symbol.asyncIterator]()
    while (yieldedRows === 0) {
      await expect(iterator.next()).resolves.toMatchObject({ done: false })
    }
    const jsonReceiptRejection = expect(json.receipt).rejects.toThrowError(
      'portable export JSON stream did not complete',
    )
    const snapshotReceiptRejection = expect(snapshot.receipt).rejects.toThrowError(
      'portable export database snapshot did not complete',
    )

    await iterator.return?.()
    await Promise.all([jsonReceiptRejection, snapshotReceiptRejection])
  })
})
