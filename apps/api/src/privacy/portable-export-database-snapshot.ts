import { Injectable, NotFoundException } from '@nestjs/common'
import type { PoolClient, QueryResult, QueryResultRow } from 'pg'

import { DatabaseService } from '../database/database.service'

export const portableExportSnapshotDefaultBatchRows = 25
export const portableExportSnapshotMaximumBatchRows = 100
export const portableExportSnapshotMaximumPayloadBytes = 64 * 1024

export type PortableExportDatabaseSnapshotReceipt = {
  batchRows: number
  maximumPayloadBytes: number
  batchCount: number
  rowCount: number
}

export type PortableExportDatabaseSnapshotSession = {
  rows: AsyncIterable<Record<string, unknown>>
  receipt: Promise<PortableExportDatabaseSnapshotReceipt>
}

export type PortableExportDatabaseSnapshotOptions = {
  batchRows?: number
  maximumPayloadBytes?: number
  signal?: AbortSignal
}

export type PortableExportHealthRecordSnapshotReceipt = PortableExportDatabaseSnapshotReceipt
export type PortableExportHealthRecordSnapshotSession = PortableExportDatabaseSnapshotSession
export type PortableExportHealthRecordRevisionSnapshotReceipt =
  PortableExportDatabaseSnapshotReceipt
export type PortableExportHealthRecordRevisionSnapshotSession =
  PortableExportDatabaseSnapshotSession
export type PortableExportConsentEventSnapshotReceipt = PortableExportDatabaseSnapshotReceipt
export type PortableExportConsentEventSnapshotSession = PortableExportDatabaseSnapshotSession
export type PortableExportWorkoutHeaderSnapshotReceipt = PortableExportDatabaseSnapshotReceipt
export type PortableExportWorkoutHeaderSnapshotSession = PortableExportDatabaseSnapshotSession

export type PortableExportWorkoutExerciseLayerSnapshotWorkout = {
  header: Record<string, unknown>
  exercises: AsyncIterable<Record<string, unknown>>
}

export type PortableExportWorkoutExerciseLayerSnapshotReceipt = {
  batchRows: number
  maximumPayloadBytes: number
  workoutHeaders: PortableExportHealthHistorySnapshotCollectionReceipt
  workoutExercises: PortableExportHealthHistorySnapshotCollectionReceipt
}

export type PortableExportWorkoutExerciseLayerSnapshotSession = {
  workouts: AsyncIterable<PortableExportWorkoutExerciseLayerSnapshotWorkout>
  receipt: Promise<PortableExportWorkoutExerciseLayerSnapshotReceipt>
  complete: () => Promise<void>
  cancel: (error: unknown) => Promise<void>
}

export type PortableExportWorkoutSetLayerSnapshotExercise = {
  header: Record<string, unknown>
  sets: AsyncIterable<Record<string, unknown>>
}

export type PortableExportWorkoutSetLayerSnapshotWorkout = {
  header: Record<string, unknown>
  exercises: AsyncIterable<PortableExportWorkoutSetLayerSnapshotExercise>
}

export type PortableExportWorkoutSetLayerSnapshotReceipt = {
  batchRows: number
  maximumPayloadBytes: number
  workoutHeaders: PortableExportHealthHistorySnapshotCollectionReceipt
  workoutExercises: PortableExportHealthHistorySnapshotCollectionReceipt
  workoutSets: PortableExportHealthHistorySnapshotCollectionReceipt
}

export type PortableExportWorkoutSetLayerSnapshotSession = {
  workouts: AsyncIterable<PortableExportWorkoutSetLayerSnapshotWorkout>
  receipt: Promise<PortableExportWorkoutSetLayerSnapshotReceipt>
  complete: () => Promise<void>
  cancel: (error: unknown) => Promise<void>
}

export type PortableExportHealthHistorySnapshotCollectionReceipt = {
  batchCount: number
  rowCount: number
}

export type PortableExportHealthHistorySnapshotReceipt = {
  batchRows: number
  maximumPayloadBytes: number
  healthRecords: PortableExportHealthHistorySnapshotCollectionReceipt
  healthRecordRevisions: PortableExportHealthHistorySnapshotCollectionReceipt
}

export type PortableExportHealthHistorySnapshotSession = {
  healthRecords: AsyncIterable<Record<string, unknown>>
  healthRecordRevisions: AsyncIterable<Record<string, unknown>>
  receipt: Promise<PortableExportHealthHistorySnapshotReceipt>
  complete: () => Promise<void>
  cancel: (error: unknown) => Promise<void>
}

export type PortableExportConsentHealthSnapshotReceipt = {
  batchRows: number
  maximumPayloadBytes: number
  consentEvents: PortableExportHealthHistorySnapshotCollectionReceipt
  healthRecords: PortableExportHealthHistorySnapshotCollectionReceipt
  healthRecordRevisions: PortableExportHealthHistorySnapshotCollectionReceipt
}

export type PortableExportConsentHealthSnapshotSession = {
  consentEvents: AsyncIterable<Record<string, unknown>>
  healthRecords: AsyncIterable<Record<string, unknown>>
  healthRecordRevisions: AsyncIterable<Record<string, unknown>>
  receipt: Promise<PortableExportConsentHealthSnapshotReceipt>
  complete: () => Promise<void>
  cancel: (error: unknown) => Promise<void>
}

type BoundedSnapshotRow = QueryResultRow & {
  id: string
  payload_text: string | null
  payload_byte_length: number
}

type MutableSnapshotStats = {
  batchCount: number
  rowCount: number
}

const validateBatchRows = (batchRows: number) => {
  if (
    !Number.isSafeInteger(batchRows) ||
    batchRows < 1 ||
    batchRows > portableExportSnapshotMaximumBatchRows
  ) {
    throw new RangeError(
      `portable export snapshot batch rows must be between 1 and ${portableExportSnapshotMaximumBatchRows}`,
    )
  }
  return batchRows
}

const validateMaximumPayloadBytes = (maximumPayloadBytes: number) => {
  if (
    !Number.isSafeInteger(maximumPayloadBytes) ||
    maximumPayloadBytes < 1 ||
    maximumPayloadBytes > portableExportSnapshotMaximumPayloadBytes
  ) {
    throw new RangeError(
      `portable export snapshot maximum payload bytes must be between 1 and ${portableExportSnapshotMaximumPayloadBytes}`,
    )
  }
  return maximumPayloadBytes
}

export class PortableExportSnapshotPayloadTooLargeError extends RangeError {
  readonly code = 'portable_export_snapshot_payload_too_large'

  constructor(
    readonly maximumBytes: number,
    readonly actualBytes: number,
  ) {
    super(`portable export snapshot payload exceeds ${maximumBytes} bytes`)
    this.name = 'PortableExportSnapshotPayloadTooLargeError'
  }
}

const throwIfAborted = (signal?: AbortSignal) => {
  if (!signal?.aborted) return
  if (signal.reason instanceof Error) throw signal.reason
  throw new Error('portable export database snapshot was aborted')
}

const assertActiveAccount = async (client: PoolClient, userId: string) => {
  const account = await client.query<{ id: string }>(
    "SELECT id FROM users WHERE id = $1 AND status = 'active'",
    [userId],
  )
  if (!account.rows[0]) throw new NotFoundException('active account not found')
}

function* boundedPagePayloads(
  rows: BoundedSnapshotRow[],
  batchRows: number,
  maximumPayloadBytes: number,
  stats: MutableSnapshotStats,
  pageLabel: string,
  signal?: AbortSignal,
): Generator<Record<string, unknown>> {
  if (rows.length > batchRows) {
    throw new Error('portable export snapshot query exceeded its batch row limit')
  }

  stats.batchCount += 1
  const pageIds = new Set<string>()
  for (const row of rows) {
    throwIfAborted(signal)
    if (
      !row.id ||
      pageIds.has(row.id) ||
      !Number.isSafeInteger(row.payload_byte_length) ||
      row.payload_byte_length < 0
    ) {
      throw new Error(`portable export snapshot returned an invalid ${pageLabel} page`)
    }
    if (row.payload_byte_length > maximumPayloadBytes) {
      throw new PortableExportSnapshotPayloadTooLargeError(
        maximumPayloadBytes,
        row.payload_byte_length,
      )
    }
    if (row.payload_text === null) {
      throw new Error(`portable export snapshot returned an invalid ${pageLabel} page`)
    }
    let payload: unknown
    try {
      payload = JSON.parse(row.payload_text)
    } catch {
      throw new Error(`portable export snapshot returned an invalid ${pageLabel} page`)
    }
    if (
      payload === null ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      (payload as Record<string, unknown>).id !== row.id
    ) {
      throw new Error(`portable export snapshot returned an invalid ${pageLabel} page`)
    }
    pageIds.add(row.id)
    stats.rowCount += 1
    if (!Number.isSafeInteger(stats.rowCount)) {
      throw new RangeError('portable export snapshot row count exceeds the safe integer boundary')
    }
    yield payload as Record<string, unknown>
  }
}

async function* consentEventPageRows(
  client: PoolClient,
  userId: string,
  batchRows: number,
  maximumPayloadBytes: number,
  stats: MutableSnapshotStats,
  signal?: AbortSignal,
): AsyncGenerator<Record<string, unknown>> {
  throwIfAborted(signal)
  let anchorId: string | null = null

  while (true) {
    throwIfAborted(signal)
    const page: QueryResult<BoundedSnapshotRow> = await client.query<BoundedSnapshotRow>(
      `WITH page AS MATERIALIZED (
         SELECT id, purpose, version, accepted_at, revoked_at
         FROM consent_events
         WHERE user_id = $1
           AND (
             $2::uuid IS NULL
             OR (accepted_at, id) > (
               SELECT accepted_at, id
               FROM consent_events
               WHERE user_id = $1 AND id = $2::uuid
             )
           )
         ORDER BY accepted_at, id
         LIMIT $3
       ), encoded AS MATERIALIZED (
         SELECT id, accepted_at, to_jsonb(page)::text AS payload_text
         FROM page
       )
       SELECT id,
              CASE
                WHEN octet_length(payload_text) <= $4 THEN payload_text
                ELSE NULL
              END AS payload_text,
              octet_length(payload_text) AS payload_byte_length
       FROM encoded
       ORDER BY accepted_at, id`,
      [userId, anchorId, batchRows, maximumPayloadBytes],
    )
    if (page.rows.length === 0) break
    yield* boundedPagePayloads(
      page.rows,
      batchRows,
      maximumPayloadBytes,
      stats,
      'consent event',
      signal,
    )

    anchorId = page.rows.at(-1)!.id
    if (page.rows.length < batchRows) break
  }
}

async function* healthRecordPageRows(
  client: PoolClient,
  userId: string,
  batchRows: number,
  maximumPayloadBytes: number,
  stats: MutableSnapshotStats,
  signal?: AbortSignal,
): AsyncGenerator<Record<string, unknown>> {
  throwIfAborted(signal)
  let anchorId: string | null = null

  while (true) {
    throwIfAborted(signal)
    const page: QueryResult<BoundedSnapshotRow> = await client.query<BoundedSnapshotRow>(
      `WITH page AS MATERIALIZED (
         SELECT id, metric, canonical_value, canonical_unit, display_value, display_unit,
                source_kind, source_metadata, confidence, status, occurred_at, timezone,
                revision, deleted_at, created_at, updated_at
         FROM health_records
         WHERE user_id = $1
           AND (
             $2::uuid IS NULL
             OR (occurred_at, created_at, id) > (
               SELECT occurred_at, created_at, id
               FROM health_records
               WHERE user_id = $1 AND id = $2::uuid
             )
         )
         ORDER BY occurred_at, created_at, id
         LIMIT $3
       ), encoded AS MATERIALIZED (
         SELECT id, occurred_at, created_at, to_jsonb(page)::text AS payload_text
         FROM page
       )
       SELECT id,
              CASE
                WHEN octet_length(payload_text) <= $4 THEN payload_text
                ELSE NULL
              END AS payload_text,
              octet_length(payload_text) AS payload_byte_length
       FROM encoded
       ORDER BY occurred_at, created_at, id`,
      [userId, anchorId, batchRows, maximumPayloadBytes],
    )
    if (page.rows.length === 0) break
    yield* boundedPagePayloads(
      page.rows,
      batchRows,
      maximumPayloadBytes,
      stats,
      'health record',
      signal,
    )

    anchorId = page.rows.at(-1)!.id
    if (page.rows.length < batchRows) break
  }
}

async function* healthRecordRevisionPageRows(
  client: PoolClient,
  userId: string,
  batchRows: number,
  maximumPayloadBytes: number,
  stats: MutableSnapshotStats,
  signal?: AbortSignal,
): AsyncGenerator<Record<string, unknown>> {
  throwIfAborted(signal)
  let anchorId: string | null = null

  while (true) {
    throwIfAborted(signal)
    const page: QueryResult<BoundedSnapshotRow> = await client.query<BoundedSnapshotRow>(
      `WITH page AS MATERIALIZED (
         SELECT id, record_id, action, revision, metric, canonical_value, canonical_unit,
                display_value, display_unit, source_kind, source_metadata, confidence,
                status, occurred_at, timezone, created_at, updated_at, changed_at
         FROM health_record_revisions
         WHERE user_id = $1
           AND (
             $2::uuid IS NULL
             OR (changed_at, revision, id) > (
               SELECT changed_at, revision, id
               FROM health_record_revisions
               WHERE user_id = $1 AND id = $2::uuid
             )
         )
         ORDER BY changed_at, revision, id
         LIMIT $3
       ), encoded AS MATERIALIZED (
         SELECT id, changed_at, revision, to_jsonb(page)::text AS payload_text
         FROM page
       )
       SELECT id,
              CASE
                WHEN octet_length(payload_text) <= $4 THEN payload_text
                ELSE NULL
              END AS payload_text,
              octet_length(payload_text) AS payload_byte_length
       FROM encoded
       ORDER BY changed_at, revision, id`,
      [userId, anchorId, batchRows, maximumPayloadBytes],
    )
    if (page.rows.length === 0) break
    yield* boundedPagePayloads(
      page.rows,
      batchRows,
      maximumPayloadBytes,
      stats,
      'health record revision',
      signal,
    )

    anchorId = page.rows.at(-1)!.id
    if (page.rows.length < batchRows) break
  }
}

export const portableExportWorkoutHeaderPageQuery = `WITH page AS MATERIALIZED (
         SELECT id, title, status, source_kind, source_metadata, started_at, ended_at,
                timezone, pain_level, fatigue, note, revision, deleted_at, created_at, updated_at
         FROM workout_sessions
         WHERE user_id = $1
           AND (
             $2::uuid IS NULL
             OR (started_at, created_at, id) > (
               SELECT started_at, created_at, id
               FROM workout_sessions
               WHERE user_id = $1 AND id = $2::uuid
             )
           )
         ORDER BY started_at, created_at, id
         LIMIT $3
       ), encoded AS MATERIALIZED (
         SELECT id, started_at, created_at, to_jsonb(page)::text AS payload_text
         FROM page
       )
       SELECT id,
              CASE
                WHEN octet_length(payload_text) <= $4 THEN payload_text
                ELSE NULL
              END AS payload_text,
              octet_length(payload_text) AS payload_byte_length
       FROM encoded
       ORDER BY started_at, created_at, id`

async function* workoutHeaderPageRows(
  client: PoolClient,
  userId: string,
  batchRows: number,
  maximumPayloadBytes: number,
  stats: MutableSnapshotStats,
  signal?: AbortSignal,
): AsyncGenerator<Record<string, unknown>> {
  throwIfAborted(signal)
  let anchorId: string | null = null

  while (true) {
    throwIfAborted(signal)
    const page: QueryResult<BoundedSnapshotRow> = await client.query<BoundedSnapshotRow>(
      portableExportWorkoutHeaderPageQuery,
      [userId, anchorId, batchRows, maximumPayloadBytes],
    )
    if (page.rows.length === 0) break
    yield* boundedPagePayloads(
      page.rows,
      batchRows,
      maximumPayloadBytes,
      stats,
      'workout header',
      signal,
    )

    anchorId = page.rows.at(-1)!.id
    if (page.rows.length < batchRows) break
  }
}

export const portableExportWorkoutExerciseHeaderPageQuery = `WITH page AS MATERIALIZED (
         SELECT exercise.id, exercise.position, exercise.exercise_key, exercise.name,
                exercise.category, exercise.notes, exercise.tracking_mode,
                exercise.equipment, exercise.equipment_notes
         FROM workout_exercises AS exercise
         INNER JOIN workout_sessions AS workout ON workout.id = exercise.workout_id
         WHERE workout.user_id = $1
           AND exercise.workout_id = $2
           AND (
             $3::uuid IS NULL
             OR exercise.position > (
               SELECT anchor.position
               FROM workout_exercises AS anchor
               INNER JOIN workout_sessions AS anchor_workout
                 ON anchor_workout.id = anchor.workout_id
               WHERE anchor_workout.user_id = $1
                 AND anchor.workout_id = $2
                 AND anchor.id = $3::uuid
             )
           )
         ORDER BY exercise.position
         LIMIT $4
       ), encoded AS MATERIALIZED (
         SELECT id, position, to_jsonb(page)::text AS payload_text
         FROM page
       )
       SELECT id,
              CASE
                WHEN octet_length(payload_text) <= $5 THEN payload_text
                ELSE NULL
              END AS payload_text,
              octet_length(payload_text) AS payload_byte_length
       FROM encoded
       ORDER BY position`

async function* workoutExerciseHeaderPageRows(
  client: PoolClient,
  userId: string,
  workoutId: string,
  batchRows: number,
  maximumPayloadBytes: number,
  stats: MutableSnapshotStats,
  signal?: AbortSignal,
): AsyncGenerator<Record<string, unknown>> {
  throwIfAborted(signal)
  let anchorId: string | null = null

  while (true) {
    throwIfAborted(signal)
    const page: QueryResult<BoundedSnapshotRow> = await client.query<BoundedSnapshotRow>(
      portableExportWorkoutExerciseHeaderPageQuery,
      [userId, workoutId, anchorId, batchRows, maximumPayloadBytes],
    )
    if (page.rows.length === 0) break
    yield* boundedPagePayloads(
      page.rows,
      batchRows,
      maximumPayloadBytes,
      stats,
      'workout exercise header',
      signal,
    )

    anchorId = page.rows.at(-1)!.id
    if (page.rows.length < batchRows) break
  }
}

export const portableExportWorkoutSetPageQuery = `WITH page AS MATERIALIZED (
         SELECT set_row.id, set_row.position, set_row.kind, set_row.reps,
                set_row.display_load, set_row.display_load_unit,
                set_row.canonical_load_kg, set_row.duration_seconds,
                set_row.distance_meters, set_row.rpe, set_row.completed
         FROM workout_sets AS set_row
         INNER JOIN workout_exercises AS exercise ON exercise.id = set_row.exercise_id
         INNER JOIN workout_sessions AS workout ON workout.id = exercise.workout_id
         WHERE workout.user_id = $1
           AND exercise.workout_id = $2
           AND set_row.exercise_id = $3
           AND (
             $4::uuid IS NULL
             OR set_row.position > (
               SELECT anchor.position
               FROM workout_sets AS anchor
               INNER JOIN workout_exercises AS anchor_exercise
                 ON anchor_exercise.id = anchor.exercise_id
               INNER JOIN workout_sessions AS anchor_workout
                 ON anchor_workout.id = anchor_exercise.workout_id
               WHERE anchor_workout.user_id = $1
                 AND anchor_exercise.workout_id = $2
                 AND anchor.exercise_id = $3
                 AND anchor.id = $4::uuid
             )
           )
         ORDER BY set_row.position
         LIMIT $5
       ), encoded AS MATERIALIZED (
         SELECT id, position, to_jsonb(page)::text AS payload_text
         FROM page
       )
       SELECT id,
              CASE
                WHEN octet_length(payload_text) <= $6 THEN payload_text
                ELSE NULL
              END AS payload_text,
              octet_length(payload_text) AS payload_byte_length
       FROM encoded
       ORDER BY position`

async function* workoutSetPageRows(
  client: PoolClient,
  userId: string,
  workoutId: string,
  exerciseId: string,
  batchRows: number,
  maximumPayloadBytes: number,
  stats: MutableSnapshotStats,
  signal?: AbortSignal,
): AsyncGenerator<Record<string, unknown>> {
  throwIfAborted(signal)
  let anchorId: string | null = null

  while (true) {
    throwIfAborted(signal)
    const page: QueryResult<BoundedSnapshotRow> = await client.query<BoundedSnapshotRow>(
      portableExportWorkoutSetPageQuery,
      [userId, workoutId, exerciseId, anchorId, batchRows, maximumPayloadBytes],
    )
    if (page.rows.length === 0) break
    yield* boundedPagePayloads(
      page.rows,
      batchRows,
      maximumPayloadBytes,
      stats,
      'workout set',
      signal,
    )

    anchorId = page.rows.at(-1)!.id
    if (page.rows.length < batchRows) break
  }
}

async function* healthRecordRows(
  client: PoolClient,
  userId: string,
  batchRows: number,
  maximumPayloadBytes: number,
  stats: MutableSnapshotStats,
  signal?: AbortSignal,
): AsyncGenerator<Record<string, unknown>> {
  throwIfAborted(signal)
  await assertActiveAccount(client, userId)
  yield* healthRecordPageRows(client, userId, batchRows, maximumPayloadBytes, stats, signal)
}

async function* consentEventRows(
  client: PoolClient,
  userId: string,
  batchRows: number,
  maximumPayloadBytes: number,
  stats: MutableSnapshotStats,
  signal?: AbortSignal,
): AsyncGenerator<Record<string, unknown>> {
  throwIfAborted(signal)
  await assertActiveAccount(client, userId)
  yield* consentEventPageRows(client, userId, batchRows, maximumPayloadBytes, stats, signal)
}

async function* healthRecordRevisionRows(
  client: PoolClient,
  userId: string,
  batchRows: number,
  maximumPayloadBytes: number,
  stats: MutableSnapshotStats,
  signal?: AbortSignal,
): AsyncGenerator<Record<string, unknown>> {
  throwIfAborted(signal)
  await assertActiveAccount(client, userId)
  yield* healthRecordRevisionPageRows(client, userId, batchRows, maximumPayloadBytes, stats, signal)
}

async function* workoutHeaderRows(
  client: PoolClient,
  userId: string,
  batchRows: number,
  maximumPayloadBytes: number,
  stats: MutableSnapshotStats,
  signal?: AbortSignal,
): AsyncGenerator<Record<string, unknown>> {
  throwIfAborted(signal)
  await assertActiveAccount(client, userId)
  yield* workoutHeaderPageRows(client, userId, batchRows, maximumPayloadBytes, stats, signal)
}

type SnapshotRowsFactory = (
  client: PoolClient,
  userId: string,
  batchRows: number,
  maximumPayloadBytes: number,
  stats: MutableSnapshotStats,
  signal?: AbortSignal,
) => AsyncIterable<Record<string, unknown>>

const createSnapshotSession = (
  database: DatabaseService,
  userId: string,
  options: PortableExportDatabaseSnapshotOptions,
  rowFactory: SnapshotRowsFactory,
): PortableExportDatabaseSnapshotSession => {
  const batchRows = validateBatchRows(options.batchRows ?? portableExportSnapshotDefaultBatchRows)
  const maximumPayloadBytes = validateMaximumPayloadBytes(
    options.maximumPayloadBytes ?? portableExportSnapshotMaximumPayloadBytes,
  )
  let resolveReceipt!: (receipt: PortableExportDatabaseSnapshotReceipt) => void
  let rejectReceipt!: (error: unknown) => void
  const receipt = new Promise<PortableExportDatabaseSnapshotReceipt>((resolve, reject) => {
    resolveReceipt = resolve
    rejectReceipt = reject
  })
  const stats: MutableSnapshotStats = { batchCount: 0, rowCount: 0 }
  const transactionRows = database.streamReadOnlyRepeatableRead((client) =>
    rowFactory(client, userId, batchRows, maximumPayloadBytes, stats, options.signal),
  )

  const rows = (async function* () {
    let completed = false
    try {
      for await (const row of transactionRows) yield row
      completed = true
      resolveReceipt({
        batchRows,
        maximumPayloadBytes,
        batchCount: stats.batchCount,
        rowCount: stats.rowCount,
      })
    } catch (error) {
      rejectReceipt(error)
      throw error
    } finally {
      if (!completed) {
        rejectReceipt(new Error('portable export database snapshot did not complete'))
      }
    }
  })()

  return { rows, receipt }
}

type WorkoutExerciseLayerSnapshotItem =
  | {
      kind: 'workout'
      value: PortableExportWorkoutExerciseLayerSnapshotWorkout
    }
  | {
      kind: 'boundary'
    }

const createWorkoutExerciseLayerSnapshotSession = (
  database: DatabaseService,
  userId: string,
  options: PortableExportDatabaseSnapshotOptions,
): PortableExportWorkoutExerciseLayerSnapshotSession => {
  const batchRows = validateBatchRows(options.batchRows ?? portableExportSnapshotDefaultBatchRows)
  const maximumPayloadBytes = validateMaximumPayloadBytes(
    options.maximumPayloadBytes ?? portableExportSnapshotMaximumPayloadBytes,
  )
  const workoutHeaderStats: MutableSnapshotStats = { batchCount: 0, rowCount: 0 }
  const workoutExerciseStats: MutableSnapshotStats = { batchCount: 0, rowCount: 0 }
  let resolveReceipt!: (receipt: PortableExportWorkoutExerciseLayerSnapshotReceipt) => void
  let rejectReceipt!: (error: unknown) => void
  const receipt = new Promise<PortableExportWorkoutExerciseLayerSnapshotReceipt>(
    (resolve, reject) => {
      resolveReceipt = resolve
      rejectReceipt = reject
    },
  )
  let finalized = false
  let finalizedError: unknown
  let workoutsStarted = false
  let workoutsReachedBoundary = false
  let activeExerciseIterator: AsyncIterator<Record<string, unknown>, void, undefined> | undefined
  let transactionIterator: AsyncIterator<WorkoutExerciseLayerSnapshotItem, void, undefined>
  let failLayer!: (rootError: unknown) => Promise<unknown>

  const transactionItems = database.streamReadOnlyRepeatableRead(
    async function* (client): AsyncGenerator<WorkoutExerciseLayerSnapshotItem> {
      throwIfAborted(options.signal)
      await assertActiveAccount(client, userId)

      for await (const header of workoutHeaderPageRows(
        client,
        userId,
        batchRows,
        maximumPayloadBytes,
        workoutHeaderStats,
        options.signal,
      )) {
        const workoutId = header.id
        if (typeof workoutId !== 'string' || workoutId.length === 0) {
          throw new Error('portable export workout exercise layer returned an invalid workout')
        }
        let exercisesStarted = false
        let exercisesCompleted = false

        const exercises: AsyncIterable<Record<string, unknown>> = {
          [Symbol.asyncIterator]: () => {
            if (exercisesStarted) {
              return (async function* () {
                throw await failLayer(
                  new Error(
                    'portable export workout exercises must be read once before the next workout',
                  ),
                )
              })()
            }
            exercisesStarted = true
            const sourceIterator = workoutExerciseHeaderPageRows(
              client,
              userId,
              workoutId,
              batchRows,
              maximumPayloadBytes,
              workoutExerciseStats,
              options.signal,
            )[Symbol.asyncIterator]()
            let iterator!: AsyncGenerator<Record<string, unknown>, void, undefined>
            iterator = (async function* () {
              let sourceError: unknown
              try {
                while (true) {
                  const next = await sourceIterator.next()
                  if (next.done) {
                    exercisesCompleted = true
                    return
                  }
                  yield next.value
                }
              } catch (error) {
                sourceError = error
                throw error
              } finally {
                if (activeExerciseIterator === iterator) activeExerciseIterator = undefined
                if (!exercisesCompleted) {
                  let cleanupError: unknown
                  try {
                    await sourceIterator.return?.(undefined)
                  } catch (error) {
                    cleanupError = error
                  }
                  if (!finalized) {
                    const rootError =
                      sourceError ?? new Error('portable export workout exercises did not complete')
                    throw await failLayer(
                      cleanupError === undefined
                        ? rootError
                        : new AggregateError(
                            [rootError, cleanupError],
                            'portable export workout exercise source and cleanup both failed',
                          ),
                    )
                  }
                  if (cleanupError !== undefined) throw cleanupError
                }
              }
            })()
            activeExerciseIterator = iterator
            return iterator
          },
        }

        yield { kind: 'workout', value: { header, exercises } }
        if (!exercisesStarted || !exercisesCompleted) {
          throw new Error('portable export workout exercises must complete before the next workout')
        }
      }

      throwIfAborted(options.signal)
      yield { kind: 'boundary' }
    },
  )
  transactionIterator = transactionItems[Symbol.asyncIterator]()

  const fail = async (rootError: unknown) => {
    if (finalized) return finalizedError ?? rootError
    finalized = true
    const cleanupErrors: unknown[] = []
    try {
      await activeExerciseIterator?.return?.()
    } catch (error) {
      cleanupErrors.push(error)
    } finally {
      activeExerciseIterator = undefined
    }
    try {
      await transactionIterator.return?.()
    } catch (error) {
      cleanupErrors.push(error)
    }
    finalizedError =
      cleanupErrors.length === 0
        ? rootError
        : new AggregateError(
            [rootError, ...cleanupErrors],
            'portable export workout exercise layer and transaction cleanup both failed',
          )
    rejectReceipt(finalizedError)
    return finalizedError
  }
  failLayer = fail

  const workouts: AsyncIterable<PortableExportWorkoutExerciseLayerSnapshotWorkout> = {
    [Symbol.asyncIterator]: () =>
      (async function* () {
        if (workoutsStarted) {
          throw await fail(
            new Error('portable export workout exercise layer must be read once in order'),
          )
        }
        workoutsStarted = true
        try {
          while (true) {
            const next = await transactionIterator.next()
            if (next.done) {
              throw new Error('portable export workout exercise layer ended before its boundary')
            }
            if (next.value.kind === 'boundary') {
              workoutsReachedBoundary = true
              return
            }
            yield next.value.value
          }
        } catch (error) {
          throw await fail(error)
        } finally {
          if (!workoutsReachedBoundary && !finalized) {
            await fail(new Error('portable export workout exercise layer did not complete'))
          }
        }
      })(),
  }

  const complete = async () => {
    if (finalized || !workoutsStarted || !workoutsReachedBoundary) {
      throw await fail(
        new Error('portable export workout exercise layer cannot commit before it completes'),
      )
    }
    try {
      const next = await transactionIterator.next()
      if (!next.done) {
        throw new Error('portable export workout exercise layer returned data after its boundary')
      }
      finalized = true
      resolveReceipt({
        batchRows,
        maximumPayloadBytes,
        workoutHeaders: { ...workoutHeaderStats },
        workoutExercises: { ...workoutExerciseStats },
      })
    } catch (error) {
      throw await fail(error)
    }
  }

  const cancel = async (error: unknown) => {
    const rootError = error ?? new Error('portable export workout exercise layer was cancelled')
    const finalError = await fail(rootError)
    if (finalError !== rootError) throw finalError
  }

  return { workouts, receipt, complete, cancel }
}

type WorkoutSetLayerSnapshotItem =
  | {
      kind: 'workout'
      value: PortableExportWorkoutSetLayerSnapshotWorkout
    }
  | {
      kind: 'boundary'
    }

const createWorkoutSetLayerSnapshotSession = (
  database: DatabaseService,
  userId: string,
  options: PortableExportDatabaseSnapshotOptions,
): PortableExportWorkoutSetLayerSnapshotSession => {
  const batchRows = validateBatchRows(options.batchRows ?? portableExportSnapshotDefaultBatchRows)
  const maximumPayloadBytes = validateMaximumPayloadBytes(
    options.maximumPayloadBytes ?? portableExportSnapshotMaximumPayloadBytes,
  )
  const workoutHeaderStats: MutableSnapshotStats = { batchCount: 0, rowCount: 0 }
  const workoutExerciseStats: MutableSnapshotStats = { batchCount: 0, rowCount: 0 }
  const workoutSetStats: MutableSnapshotStats = { batchCount: 0, rowCount: 0 }
  let resolveReceipt!: (receipt: PortableExportWorkoutSetLayerSnapshotReceipt) => void
  let rejectReceipt!: (error: unknown) => void
  const receipt = new Promise<PortableExportWorkoutSetLayerSnapshotReceipt>((resolve, reject) => {
    resolveReceipt = resolve
    rejectReceipt = reject
  })
  let finalized = false
  let finalizedError: unknown
  let workoutsStarted = false
  let workoutsReachedBoundary = false
  let activeExerciseIterator:
    AsyncIterator<PortableExportWorkoutSetLayerSnapshotExercise, void, undefined> | undefined
  let activeSetIterator: AsyncIterator<Record<string, unknown>, void, undefined> | undefined
  let transactionIterator: AsyncIterator<WorkoutSetLayerSnapshotItem, void, undefined>
  let failLayer!: (rootError: unknown) => Promise<unknown>

  const transactionItems = database.streamReadOnlyRepeatableRead(
    async function* (client): AsyncGenerator<WorkoutSetLayerSnapshotItem> {
      throwIfAborted(options.signal)
      await assertActiveAccount(client, userId)

      for await (const workoutHeader of workoutHeaderPageRows(
        client,
        userId,
        batchRows,
        maximumPayloadBytes,
        workoutHeaderStats,
        options.signal,
      )) {
        const workoutId = workoutHeader.id
        if (typeof workoutId !== 'string' || workoutId.length === 0) {
          throw new Error('portable export workout set layer returned an invalid workout')
        }
        let exercisesStarted = false
        let exercisesCompleted = false

        const exercises: AsyncIterable<PortableExportWorkoutSetLayerSnapshotExercise> = {
          [Symbol.asyncIterator]: () => {
            if (exercisesStarted) {
              return (async function* () {
                throw await failLayer(
                  new Error(
                    'portable export workout set layer exercises must be read once before the next workout',
                  ),
                )
              })()
            }
            exercisesStarted = true
            const exerciseSourceIterator = workoutExerciseHeaderPageRows(
              client,
              userId,
              workoutId,
              batchRows,
              maximumPayloadBytes,
              workoutExerciseStats,
              options.signal,
            )[Symbol.asyncIterator]()
            let suppressSetRootFailure = false
            let exerciseIterator!: AsyncGenerator<
              PortableExportWorkoutSetLayerSnapshotExercise,
              void,
              undefined
            >
            exerciseIterator = (async function* () {
              let exerciseSourceError: unknown
              try {
                while (true) {
                  const nextExercise = await exerciseSourceIterator.next()
                  if (nextExercise.done) {
                    exercisesCompleted = true
                    return
                  }
                  const exerciseHeader = nextExercise.value
                  const exerciseId = exerciseHeader.id
                  if (typeof exerciseId !== 'string' || exerciseId.length === 0) {
                    throw new Error(
                      'portable export workout set layer returned an invalid exercise',
                    )
                  }
                  let setsStarted = false
                  let setsCompleted = false

                  const sets: AsyncIterable<Record<string, unknown>> = {
                    [Symbol.asyncIterator]: () => {
                      if (setsStarted) {
                        return (async function* () {
                          throw await failLayer(
                            new Error(
                              'portable export workout sets must be read once before the next exercise',
                            ),
                          )
                        })()
                      }
                      setsStarted = true
                      const setSourceIterator = workoutSetPageRows(
                        client,
                        userId,
                        workoutId,
                        exerciseId,
                        batchRows,
                        maximumPayloadBytes,
                        workoutSetStats,
                        options.signal,
                      )[Symbol.asyncIterator]()
                      let setIterator!: AsyncGenerator<Record<string, unknown>, void, undefined>
                      setIterator = (async function* () {
                        let setSourceError: unknown
                        try {
                          while (true) {
                            const nextSet = await setSourceIterator.next()
                            if (nextSet.done) {
                              setsCompleted = true
                              return
                            }
                            yield nextSet.value
                          }
                        } catch (error) {
                          setSourceError = error
                          throw error
                        } finally {
                          if (activeSetIterator === setIterator) activeSetIterator = undefined
                          if (!setsCompleted) {
                            let cleanupError: unknown
                            try {
                              await setSourceIterator.return?.(undefined)
                            } catch (error) {
                              cleanupError = error
                            }
                            if (!finalized && !suppressSetRootFailure) {
                              const rootError =
                                setSourceError ??
                                new Error('portable export workout sets did not complete')
                              throw await failLayer(
                                cleanupError === undefined
                                  ? rootError
                                  : new AggregateError(
                                      [rootError, cleanupError],
                                      'portable export workout set source and cleanup both failed',
                                    ),
                              )
                            }
                            if (cleanupError !== undefined) throw cleanupError
                          }
                        }
                      })()
                      activeSetIterator = setIterator
                      return setIterator
                    },
                  }

                  yield { header: exerciseHeader, sets }
                  if (!setsStarted || !setsCompleted) {
                    throw new Error(
                      'portable export workout sets must complete before the next exercise',
                    )
                  }
                }
              } catch (error) {
                exerciseSourceError = error
                throw error
              } finally {
                if (activeExerciseIterator === exerciseIterator) {
                  activeExerciseIterator = undefined
                }
                if (!exercisesCompleted) {
                  suppressSetRootFailure = true
                  const cleanupErrors: unknown[] = []
                  try {
                    await activeSetIterator?.return?.(undefined)
                  } catch (error) {
                    cleanupErrors.push(error)
                  } finally {
                    activeSetIterator = undefined
                  }
                  try {
                    await exerciseSourceIterator.return?.(undefined)
                  } catch (error) {
                    cleanupErrors.push(error)
                  } finally {
                    suppressSetRootFailure = false
                  }
                  if (!finalized) {
                    const rootError =
                      exerciseSourceError ??
                      new Error('portable export workout set layer exercises did not complete')
                    throw await failLayer(
                      cleanupErrors.length === 0
                        ? rootError
                        : new AggregateError(
                            [rootError, ...cleanupErrors],
                            'portable export workout exercise source and nested cleanup both failed',
                          ),
                    )
                  }
                  if (cleanupErrors.length === 1) throw cleanupErrors[0]
                  if (cleanupErrors.length > 1) {
                    throw new AggregateError(
                      cleanupErrors,
                      'portable export workout exercise nested cleanup failed',
                    )
                  }
                }
              }
            })()
            activeExerciseIterator = exerciseIterator
            return exerciseIterator
          },
        }

        yield { kind: 'workout', value: { header: workoutHeader, exercises } }
        if (!exercisesStarted || !exercisesCompleted) {
          throw new Error(
            'portable export workout set layer exercises must complete before the next workout',
          )
        }
      }

      throwIfAborted(options.signal)
      yield { kind: 'boundary' }
    },
  )
  transactionIterator = transactionItems[Symbol.asyncIterator]()

  const fail = async (rootError: unknown) => {
    if (finalized) return finalizedError ?? rootError
    finalized = true
    const cleanupErrors: unknown[] = []
    try {
      await activeSetIterator?.return?.(undefined)
    } catch (error) {
      cleanupErrors.push(error)
    } finally {
      activeSetIterator = undefined
    }
    try {
      await activeExerciseIterator?.return?.(undefined)
    } catch (error) {
      cleanupErrors.push(error)
    } finally {
      activeExerciseIterator = undefined
    }
    try {
      await transactionIterator.return?.(undefined)
    } catch (error) {
      cleanupErrors.push(error)
    }
    finalizedError =
      cleanupErrors.length === 0
        ? rootError
        : new AggregateError(
            [rootError, ...cleanupErrors],
            'portable export workout set layer and nested cleanup both failed',
          )
    rejectReceipt(finalizedError)
    return finalizedError
  }
  failLayer = fail

  const workouts: AsyncIterable<PortableExportWorkoutSetLayerSnapshotWorkout> = {
    [Symbol.asyncIterator]: () =>
      (async function* () {
        if (workoutsStarted) {
          throw await fail(
            new Error('portable export workout set layer must be read once in order'),
          )
        }
        workoutsStarted = true
        try {
          while (true) {
            const next = await transactionIterator.next()
            if (next.done) {
              throw new Error('portable export workout set layer ended before its boundary')
            }
            if (next.value.kind === 'boundary') {
              workoutsReachedBoundary = true
              return
            }
            yield next.value.value
          }
        } catch (error) {
          throw await fail(error)
        } finally {
          if (!workoutsReachedBoundary && !finalized) {
            await fail(new Error('portable export workout set layer did not complete'))
          }
        }
      })(),
  }

  const complete = async () => {
    if (finalized || !workoutsStarted || !workoutsReachedBoundary) {
      throw await fail(
        new Error('portable export workout set layer cannot commit before it completes'),
      )
    }
    try {
      const next = await transactionIterator.next()
      if (!next.done) {
        throw new Error('portable export workout set layer returned data after its boundary')
      }
      finalized = true
      resolveReceipt({
        batchRows,
        maximumPayloadBytes,
        workoutHeaders: { ...workoutHeaderStats },
        workoutExercises: { ...workoutExerciseStats },
        workoutSets: { ...workoutSetStats },
      })
    } catch (error) {
      throw await fail(error)
    }
  }

  const cancel = async (error: unknown) => {
    const rootError = error ?? new Error('portable export workout set layer was cancelled')
    const finalError = await fail(rootError)
    if (finalError !== rootError) throw finalError
  }

  return { workouts, receipt, complete, cancel }
}

type CoordinatedSnapshotItem<Collection extends string> =
  | {
      kind: 'row'
      collection: Collection
      value: Record<string, unknown>
    }
  | {
      kind: 'boundary'
      collection: Collection
    }

type CoordinatedSnapshotCollectionDefinition<Collection extends string> = {
  name: Collection
  rowFactory: SnapshotRowsFactory
}

type CoordinatedSnapshotReceipt<Collection extends string> = {
  batchRows: number
  maximumPayloadBytes: number
} & Record<Collection, PortableExportHealthHistorySnapshotCollectionReceipt>

type CoordinatedSnapshotSession<Collection extends string> = {
  receipt: Promise<CoordinatedSnapshotReceipt<Collection>>
  complete: () => Promise<void>
  cancel: (error: unknown) => Promise<void>
} & Record<Collection, AsyncIterable<Record<string, unknown>>>

const createCoordinatedSnapshotSession = <Collection extends string>(
  database: DatabaseService,
  userId: string,
  options: PortableExportDatabaseSnapshotOptions,
  definitions: readonly CoordinatedSnapshotCollectionDefinition<Collection>[],
): CoordinatedSnapshotSession<Collection> => {
  if (
    definitions.length === 0 ||
    new Set(definitions.map((definition) => definition.name)).size !== definitions.length
  ) {
    throw new Error('portable export coordinated snapshot requires unique collections')
  }
  const batchRows = validateBatchRows(options.batchRows ?? portableExportSnapshotDefaultBatchRows)
  const maximumPayloadBytes = validateMaximumPayloadBytes(
    options.maximumPayloadBytes ?? portableExportSnapshotMaximumPayloadBytes,
  )
  const stats = new Map<Collection, MutableSnapshotStats>(
    definitions.map((definition) => [definition.name, { batchCount: 0, rowCount: 0 }]),
  )
  let resolveReceipt!: (receipt: CoordinatedSnapshotReceipt<Collection>) => void
  let rejectReceipt!: (error: unknown) => void
  const receipt = new Promise<CoordinatedSnapshotReceipt<Collection>>((resolve, reject) => {
    resolveReceipt = resolve
    rejectReceipt = reject
  })

  const transactionItems = database.streamReadOnlyRepeatableRead(
    async function* (client): AsyncGenerator<CoordinatedSnapshotItem<Collection>> {
      throwIfAborted(options.signal)
      await assertActiveAccount(client, userId)
      for (const definition of definitions) {
        const collectionStats = stats.get(definition.name)
        if (!collectionStats) {
          throw new Error('portable export coordinated snapshot lost collection statistics')
        }
        for await (const value of definition.rowFactory(
          client,
          userId,
          batchRows,
          maximumPayloadBytes,
          collectionStats,
          options.signal,
        )) {
          yield { kind: 'row', collection: definition.name, value }
        }
        yield { kind: 'boundary', collection: definition.name }
      }
      throwIfAborted(options.signal)
    },
  )
  const transactionIterator = transactionItems[Symbol.asyncIterator]()
  let nextCollectionIndex = 0
  let activeCollection: Collection | undefined
  let finalized = false

  const fail = async (rootError: unknown) => {
    if (finalized) return rootError
    finalized = true
    let cleanupError: unknown
    try {
      await transactionIterator.return?.()
    } catch (error) {
      cleanupError = error
    }
    const finalError =
      cleanupError === undefined || cleanupError === rootError
        ? rootError
        : new AggregateError(
            [rootError, cleanupError],
            'portable export coordinated snapshot and transaction cleanup both failed',
          )
    rejectReceipt(finalError)
    return finalError
  }

  const consumeCollection = async function* (
    collection: Collection,
    collectionIndex: number,
  ): AsyncGenerator<Record<string, unknown>> {
    if (
      finalized ||
      activeCollection !== undefined ||
      nextCollectionIndex !== collectionIndex ||
      definitions[collectionIndex]?.name !== collection
    ) {
      const error = new Error(
        'portable export coordinated snapshot collections must be read once in order',
      )
      throw await fail(error)
    }

    activeCollection = collection
    let reachedBoundary = false
    try {
      while (true) {
        const next = await transactionIterator.next()
        if (next.done) {
          throw new Error('portable export coordinated snapshot ended before its boundary')
        }
        if (next.value.kind === 'boundary') {
          if (next.value.collection !== collection) {
            throw new Error('portable export coordinated snapshot returned an invalid boundary')
          }
          reachedBoundary = true
          nextCollectionIndex += 1
          return
        }
        if (next.value.collection !== collection) {
          throw new Error('portable export coordinated snapshot returned an out-of-order row')
        }
        yield next.value.value
      }
    } catch (error) {
      throw await fail(error)
    } finally {
      activeCollection = undefined
      if (!reachedBoundary && !finalized) {
        await fail(new Error('portable export coordinated snapshot did not complete'))
      }
    }
  }

  const createCollection = (collection: Collection, collectionIndex: number) => {
    let started = false
    return {
      [Symbol.asyncIterator]: () =>
        (async function* () {
          if (started) {
            const error = new Error(
              'portable export coordinated snapshot collections must be read once in order',
            )
            throw await fail(error)
          }
          started = true
          yield* consumeCollection(collection, collectionIndex)
        })(),
    }
  }

  const complete = async () => {
    if (finalized || activeCollection !== undefined || nextCollectionIndex !== definitions.length) {
      const error = new Error(
        'portable export coordinated snapshot cannot commit before every collection completes',
      )
      throw await fail(error)
    }
    try {
      const next = await transactionIterator.next()
      if (!next.done) {
        throw new Error('portable export coordinated snapshot returned data after its boundary')
      }
      finalized = true
      const collectionReceipts = Object.fromEntries(
        definitions.map((definition) => [definition.name, { ...stats.get(definition.name)! }]),
      ) as Record<Collection, PortableExportHealthHistorySnapshotCollectionReceipt>
      resolveReceipt(Object.assign({ batchRows, maximumPayloadBytes }, collectionReceipts))
    } catch (error) {
      throw await fail(error)
    }
  }

  const cancel = async (error: unknown) => {
    const rootError = error ?? new Error('portable export coordinated snapshot was cancelled')
    const finalError = await fail(rootError)
    if (finalError !== rootError) throw finalError
  }

  const collections = Object.fromEntries(
    definitions.map((definition, index) => [
      definition.name,
      createCollection(definition.name, index),
    ]),
  ) as unknown as Record<Collection, AsyncIterable<Record<string, unknown>>>
  return Object.assign(collections, { receipt, complete, cancel })
}

const healthHistorySnapshotDefinitions = [
  { name: 'healthRecords', rowFactory: healthRecordPageRows },
  { name: 'healthRecordRevisions', rowFactory: healthRecordRevisionPageRows },
] as const

const consentHealthSnapshotDefinitions = [
  { name: 'consentEvents', rowFactory: consentEventPageRows },
  ...healthHistorySnapshotDefinitions,
] as const

@Injectable()
export class PortableExportDatabaseSnapshotService {
  constructor(private readonly database: DatabaseService) {}

  createHealthRecordSnapshot(
    userId: string,
    options: PortableExportDatabaseSnapshotOptions = {},
  ): PortableExportHealthRecordSnapshotSession {
    return createSnapshotSession(this.database, userId, options, healthRecordRows)
  }

  createHealthRecordRevisionSnapshot(
    userId: string,
    options: PortableExportDatabaseSnapshotOptions = {},
  ): PortableExportHealthRecordRevisionSnapshotSession {
    return createSnapshotSession(this.database, userId, options, healthRecordRevisionRows)
  }

  createConsentEventSnapshot(
    userId: string,
    options: PortableExportDatabaseSnapshotOptions = {},
  ): PortableExportConsentEventSnapshotSession {
    return createSnapshotSession(this.database, userId, options, consentEventRows)
  }

  createWorkoutHeaderSnapshot(
    userId: string,
    options: PortableExportDatabaseSnapshotOptions = {},
  ): PortableExportWorkoutHeaderSnapshotSession {
    return createSnapshotSession(this.database, userId, options, workoutHeaderRows)
  }

  createWorkoutExerciseLayerSnapshot(
    userId: string,
    options: PortableExportDatabaseSnapshotOptions = {},
  ): PortableExportWorkoutExerciseLayerSnapshotSession {
    return createWorkoutExerciseLayerSnapshotSession(this.database, userId, options)
  }

  createWorkoutSetLayerSnapshot(
    userId: string,
    options: PortableExportDatabaseSnapshotOptions = {},
  ): PortableExportWorkoutSetLayerSnapshotSession {
    return createWorkoutSetLayerSnapshotSession(this.database, userId, options)
  }

  createHealthHistorySnapshot(
    userId: string,
    options: PortableExportDatabaseSnapshotOptions = {},
  ): PortableExportHealthHistorySnapshotSession {
    return createCoordinatedSnapshotSession(
      this.database,
      userId,
      options,
      healthHistorySnapshotDefinitions,
    )
  }

  createConsentHealthSnapshot(
    userId: string,
    options: PortableExportDatabaseSnapshotOptions = {},
  ): PortableExportConsentHealthSnapshotSession {
    return createCoordinatedSnapshotSession(
      this.database,
      userId,
      options,
      consentHealthSnapshotDefinitions,
    )
  }
}
