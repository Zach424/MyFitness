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

export const portableExportNutritionMealShapeSchemaVersion =
  'myfitness-portable-export-nutrition-meal-shape/v1' as const

export type PortableExportNutritionMealShapeReceipt = {
  schemaVersion: typeof portableExportNutritionMealShapeSchemaVersion
  mealRevision: number
  currentItemCount: number
  revisionCount: number
  headerBytes: number
  currentItemPayloadBytes: number
  maximumCurrentItemBytes: number
  revisionPayloadBytes: number
  maximumRevisionPayloadBytes: number
  maximumRevisionItemCount: number
  revisionSnapshotsHaveItemArrays: boolean
  historyAggregateExceedsPayloadBoundary: boolean
}

export type PortableExportNutritionMealRevisionSnapshotValue = Record<string, unknown> & {
  items: AsyncIterable<Record<string, unknown>>
}

export type PortableExportNutritionMealRevision = Record<string, unknown> & {
  snapshot: PortableExportNutritionMealRevisionSnapshotValue
}

export type PortableExportNutritionMealLayerSnapshotMeal = {
  header: Record<string, unknown>
  items: AsyncIterable<Record<string, unknown>>
  history: AsyncIterable<PortableExportNutritionMealRevision>
}

export type PortableExportNutritionMealLayerSnapshotReceipt = {
  batchRows: number
  maximumPayloadBytes: number
  meals: PortableExportHealthHistorySnapshotCollectionReceipt
  mealItems: PortableExportHealthHistorySnapshotCollectionReceipt
  mealRevisions: PortableExportHealthHistorySnapshotCollectionReceipt
  mealRevisionSnapshotRoots: PortableExportHealthHistorySnapshotCollectionReceipt
  mealRevisionSnapshotItems: PortableExportHealthHistorySnapshotCollectionReceipt
}

export type PortableExportNutritionMealLayerSnapshotSession = {
  meals: AsyncIterable<PortableExportNutritionMealLayerSnapshotMeal>
  receipt: Promise<PortableExportNutritionMealLayerSnapshotReceipt>
  complete: () => Promise<void>
  cancel: (error: unknown) => Promise<void>
}

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

export type PortableExportWorkoutRevisionHeaderLayerSnapshotWorkout = {
  header: Record<string, unknown>
  exercises: AsyncIterable<PortableExportWorkoutSetLayerSnapshotExercise>
  history: AsyncIterable<Record<string, unknown>>
}

export type PortableExportWorkoutRevisionHeaderLayerSnapshotReceipt = {
  batchRows: number
  maximumPayloadBytes: number
  workoutHeaders: PortableExportHealthHistorySnapshotCollectionReceipt
  workoutExercises: PortableExportHealthHistorySnapshotCollectionReceipt
  workoutSets: PortableExportHealthHistorySnapshotCollectionReceipt
  workoutRevisions: PortableExportHealthHistorySnapshotCollectionReceipt
}

export type PortableExportWorkoutRevisionHeaderLayerSnapshotSession = {
  workouts: AsyncIterable<PortableExportWorkoutRevisionHeaderLayerSnapshotWorkout>
  receipt: Promise<PortableExportWorkoutRevisionHeaderLayerSnapshotReceipt>
  complete: () => Promise<void>
  cancel: (error: unknown) => Promise<void>
}

export type PortableExportWorkoutRevisionSnapshotLayerRevision = Record<string, unknown> & {
  snapshot: PortableExportWorkoutRevisionSnapshotValue
}

export type PortableExportWorkoutRevisionSnapshotLayerWorkout = {
  header: Record<string, unknown>
  exercises: AsyncIterable<PortableExportWorkoutSetLayerSnapshotExercise>
  history: AsyncIterable<PortableExportWorkoutRevisionSnapshotLayerRevision>
}

export type PortableExportWorkoutRevisionSnapshotLayerReceipt =
  PortableExportWorkoutRevisionHeaderLayerSnapshotReceipt & {
    workoutRevisionSnapshotRoots: PortableExportHealthHistorySnapshotCollectionReceipt
    workoutRevisionSnapshotExercises: PortableExportHealthHistorySnapshotCollectionReceipt
    workoutRevisionSnapshotSets: PortableExportHealthHistorySnapshotCollectionReceipt
  }

export type PortableExportWorkoutRevisionSnapshotLayerSession = {
  workouts: AsyncIterable<PortableExportWorkoutRevisionSnapshotLayerWorkout>
  receipt: Promise<PortableExportWorkoutRevisionSnapshotLayerReceipt>
  complete: () => Promise<void>
  cancel: (error: unknown) => Promise<void>
}

export const portableExportWorkoutRevisionSnapshotShapeSchemaVersion =
  'myfitness-portable-export-workout-revision-snapshot-shape/v1' as const

export type PortableExportWorkoutRevisionSnapshotShapeReceipt = {
  schemaVersion: typeof portableExportWorkoutRevisionSnapshotShapeSchemaVersion
  revision: number
  compatibility: 'legacy' | 'extended' | 'mixed'
  rootHeaderBytes: number
  exerciseCount: number
  setCount: number
  legacyExerciseCount: number
  extendedExerciseCount: number
  maximumExerciseHeaderBytes: number
  maximumSetBytes: number
  exerciseStorageOrderMatchesPosition: boolean
  setStorageOrderMatchesPosition: boolean
  decomposable: boolean
}

export type PortableExportWorkoutRevisionSnapshotExercise = Record<string, unknown> & {
  sets: AsyncIterable<Record<string, unknown>>
}

export type PortableExportWorkoutRevisionSnapshotValue = Record<string, unknown> & {
  exercises: AsyncIterable<PortableExportWorkoutRevisionSnapshotExercise>
}

export type PortableExportWorkoutRevisionSnapshotReceipt = {
  batchRows: number
  maximumPayloadBytes: number
  shape: PortableExportWorkoutRevisionSnapshotShapeReceipt
  snapshotRoots: PortableExportHealthHistorySnapshotCollectionReceipt
  snapshotExercises: PortableExportHealthHistorySnapshotCollectionReceipt
  snapshotSets: PortableExportHealthHistorySnapshotCollectionReceipt
}

export type PortableExportWorkoutRevisionSnapshotSession = {
  snapshots: AsyncIterable<PortableExportWorkoutRevisionSnapshotValue>
  receipt: Promise<PortableExportWorkoutRevisionSnapshotReceipt>
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

export type PortableExportExerciseCatalogSnapshotEntry = Record<string, unknown> & {
  history: AsyncIterable<Record<string, unknown>>
}

export type PortableExportConsentHealthExerciseCatalogSnapshotReceipt =
  PortableExportConsentHealthSnapshotReceipt & {
    exerciseCatalog: PortableExportHealthHistorySnapshotCollectionReceipt
    exerciseCatalogRevisions: PortableExportHealthHistorySnapshotCollectionReceipt
  }

export type PortableExportConsentHealthExerciseCatalogSnapshotSession = {
  consentEvents: AsyncIterable<Record<string, unknown>>
  healthRecords: AsyncIterable<Record<string, unknown>>
  healthRecordRevisions: AsyncIterable<Record<string, unknown>>
  exerciseCatalog: AsyncIterable<PortableExportExerciseCatalogSnapshotEntry>
  receipt: Promise<PortableExportConsentHealthExerciseCatalogSnapshotReceipt>
  complete: () => Promise<void>
  cancel: (error: unknown) => Promise<void>
}

export type PortableExportFoodCatalogSnapshotEntry = Record<string, unknown> & {
  history: AsyncIterable<Record<string, unknown>>
}

export type PortableExportConsentHealthCatalogSnapshotReceipt =
  PortableExportConsentHealthExerciseCatalogSnapshotReceipt & {
    foodCatalog: PortableExportHealthHistorySnapshotCollectionReceipt
    foodCatalogRevisions: PortableExportHealthHistorySnapshotCollectionReceipt
  }

export type PortableExportConsentHealthCatalogSnapshotSession = {
  consentEvents: AsyncIterable<Record<string, unknown>>
  healthRecords: AsyncIterable<Record<string, unknown>>
  healthRecordRevisions: AsyncIterable<Record<string, unknown>>
  exerciseCatalog: AsyncIterable<PortableExportExerciseCatalogSnapshotEntry>
  foodCatalog: AsyncIterable<PortableExportFoodCatalogSnapshotEntry>
  receipt: Promise<PortableExportConsentHealthCatalogSnapshotReceipt>
  complete: () => Promise<void>
  cancel: (error: unknown) => Promise<void>
}

export type PortableExportConsentHealthCatalogWorkoutSnapshotReceipt =
  PortableExportConsentHealthCatalogSnapshotReceipt & {
    workouts: PortableExportHealthHistorySnapshotCollectionReceipt
    workoutExercises: PortableExportHealthHistorySnapshotCollectionReceipt
    workoutSets: PortableExportHealthHistorySnapshotCollectionReceipt
    workoutRevisions: PortableExportHealthHistorySnapshotCollectionReceipt
    workoutRevisionSnapshotRoots: PortableExportHealthHistorySnapshotCollectionReceipt
    workoutRevisionSnapshotExercises: PortableExportHealthHistorySnapshotCollectionReceipt
    workoutRevisionSnapshotSets: PortableExportHealthHistorySnapshotCollectionReceipt
  }

export type PortableExportConsentHealthCatalogWorkoutSnapshotSession = {
  consentEvents: AsyncIterable<Record<string, unknown>>
  healthRecords: AsyncIterable<Record<string, unknown>>
  healthRecordRevisions: AsyncIterable<Record<string, unknown>>
  exerciseCatalog: AsyncIterable<PortableExportExerciseCatalogSnapshotEntry>
  foodCatalog: AsyncIterable<PortableExportFoodCatalogSnapshotEntry>
  workouts: AsyncIterable<PortableExportWorkoutRevisionSnapshotLayerWorkout>
  receipt: Promise<PortableExportConsentHealthCatalogWorkoutSnapshotReceipt>
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

export class PortableExportWorkoutRevisionSnapshotNotDecomposableError extends Error {
  readonly code = 'portable_export_workout_revision_snapshot_not_decomposable'

  constructor() {
    super('portable export workout revision snapshot is not decomposable')
    this.name = 'PortableExportWorkoutRevisionSnapshotNotDecomposableError'
  }
}

export class PortableExportNutritionMealRevisionSnapshotNotDecomposableError extends Error {
  readonly code = 'portable_export_nutrition_meal_revision_snapshot_not_decomposable'

  constructor() {
    super('portable export nutrition meal revision snapshot is not decomposable')
    this.name = 'PortableExportNutritionMealRevisionSnapshotNotDecomposableError'
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

export const portableExportExerciseCatalogEntryPageQuery = `WITH page AS MATERIALIZED (
         SELECT entry.id, entry.created_at,
                ((to_jsonb(entry) - 'user_id' - 'idempotency_key' - 'request_hash')
                  || jsonb_build_object('history', '[]'::jsonb))::text AS payload_text
         FROM user_exercise_catalog_entries AS entry
         WHERE entry.user_id = $1
           AND (
             $2::uuid IS NULL
             OR (entry.created_at, entry.id) > (
               SELECT anchor.created_at, anchor.id
               FROM user_exercise_catalog_entries AS anchor
               WHERE anchor.user_id = $1 AND anchor.id = $2::uuid
             )
           )
         ORDER BY entry.created_at, entry.id
         LIMIT $3
       )
       SELECT id,
              CASE
                WHEN octet_length(payload_text) <= $4 THEN payload_text
                ELSE NULL
              END AS payload_text,
              octet_length(payload_text) AS payload_byte_length
       FROM page
       ORDER BY created_at, id`

export const portableExportExerciseCatalogRevisionPageQuery = `WITH page AS MATERIALIZED (
         SELECT history.id, history.revision,
                (to_jsonb(history) - 'user_id' - 'entry_id')::text AS payload_text
         FROM user_exercise_catalog_revisions AS history
         INNER JOIN user_exercise_catalog_entries AS entry ON entry.id = history.entry_id
         WHERE entry.user_id = $1
           AND history.user_id = $1
           AND history.entry_id = $2
           AND (
             $3::uuid IS NULL
             OR history.revision > (
               SELECT anchor.revision
               FROM user_exercise_catalog_revisions AS anchor
               INNER JOIN user_exercise_catalog_entries AS anchor_entry
                 ON anchor_entry.id = anchor.entry_id
               WHERE anchor_entry.user_id = $1
                 AND anchor.user_id = $1
                 AND anchor.entry_id = $2
                 AND anchor.id = $3::uuid
             )
           )
         ORDER BY history.revision
         LIMIT $4
       )
       SELECT id,
              CASE
                WHEN octet_length(payload_text) <= $5 THEN payload_text
                ELSE NULL
              END AS payload_text,
              octet_length(payload_text) AS payload_byte_length
       FROM page
       ORDER BY revision`

async function* exerciseCatalogRevisionPageRows(
  client: PoolClient,
  userId: string,
  entryId: string,
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
      portableExportExerciseCatalogRevisionPageQuery,
      [userId, entryId, anchorId, batchRows, maximumPayloadBytes],
    )
    if (page.rows.length === 0) break
    yield* boundedPagePayloads(
      page.rows,
      batchRows,
      maximumPayloadBytes,
      stats,
      'exercise catalog revision',
      signal,
    )
    anchorId = page.rows.at(-1)!.id
    if (page.rows.length < batchRows) break
  }
}

async function* exerciseCatalogPageRows(
  client: PoolClient,
  userId: string,
  batchRows: number,
  maximumPayloadBytes: number,
  entryStats: MutableSnapshotStats,
  revisionStats: MutableSnapshotStats,
  signal?: AbortSignal,
  failRoot?: (error: unknown) => Promise<unknown>,
): AsyncGenerator<PortableExportExerciseCatalogSnapshotEntry> {
  throwIfAborted(signal)
  let anchorId: string | null = null

  while (true) {
    throwIfAborted(signal)
    const page: QueryResult<BoundedSnapshotRow> = await client.query<BoundedSnapshotRow>(
      portableExportExerciseCatalogEntryPageQuery,
      [userId, anchorId, batchRows, maximumPayloadBytes],
    )
    if (page.rows.length === 0) break

    for (const header of boundedPagePayloads(
      page.rows,
      batchRows,
      maximumPayloadBytes,
      entryStats,
      'exercise catalog entry',
      signal,
    )) {
      if (
        !Object.hasOwn(header, 'history') ||
        !Array.isArray(header.history) ||
        header.history.length !== 0
      ) {
        throw new Error('portable export snapshot returned an invalid exercise catalog entry page')
      }
      const entryId = header.id as string
      let historyStarted = false
      let historyCompleted = false
      const history: AsyncIterable<Record<string, unknown>> = {
        [Symbol.asyncIterator]: () =>
          (async function* () {
            if (historyStarted) {
              const error = new Error(
                'portable export exercise catalog history must be read once in order',
              )
              throw failRoot ? await failRoot(error) : error
            }
            historyStarted = true
            let failure: unknown
            try {
              yield* exerciseCatalogRevisionPageRows(
                client,
                userId,
                entryId,
                batchRows,
                maximumPayloadBytes,
                revisionStats,
                signal,
              )
              historyCompleted = true
            } catch (error) {
              failure = error
              throw failRoot ? await failRoot(error) : error
            } finally {
              if (!historyCompleted && failure === undefined) {
                const error = new Error('portable export exercise catalog history did not complete')
                throw failRoot ? await failRoot(error) : error
              }
            }
          })(),
      }
      header.history = history
      yield header as PortableExportExerciseCatalogSnapshotEntry
      if (!historyStarted || !historyCompleted) {
        throw new Error('portable export exercise catalog history must complete')
      }
    }

    anchorId = page.rows.at(-1)!.id
    if (page.rows.length < batchRows) break
  }
}

export const portableExportFoodCatalogEntryPageQuery = `WITH page AS MATERIALIZED (
         SELECT entry.id, entry.created_at,
                ((to_jsonb(entry) - 'user_id' - 'idempotency_key' - 'request_hash')
                  || jsonb_build_object('history', '[]'::jsonb))::text AS payload_text
         FROM user_food_catalog_entries AS entry
         WHERE entry.user_id = $1
           AND (
             $2::uuid IS NULL
             OR (entry.created_at, entry.id) > (
               SELECT anchor.created_at, anchor.id
               FROM user_food_catalog_entries AS anchor
               WHERE anchor.user_id = $1 AND anchor.id = $2::uuid
             )
           )
         ORDER BY entry.created_at, entry.id
         LIMIT $3
       )
       SELECT id,
              CASE WHEN octet_length(payload_text) <= $4 THEN payload_text ELSE NULL END
                AS payload_text,
              octet_length(payload_text) AS payload_byte_length
       FROM page
       ORDER BY created_at, id`

export const portableExportFoodCatalogRevisionPageQuery = `WITH page AS MATERIALIZED (
         SELECT history.id, history.revision,
                (to_jsonb(history) - 'user_id' - 'entry_id')::text AS payload_text
         FROM user_food_catalog_revisions AS history
         INNER JOIN user_food_catalog_entries AS entry ON entry.id = history.entry_id
         WHERE entry.user_id = $1
           AND history.user_id = $1
           AND history.entry_id = $2
           AND (
             $3::uuid IS NULL
             OR history.revision > (
               SELECT anchor.revision
               FROM user_food_catalog_revisions AS anchor
               INNER JOIN user_food_catalog_entries AS anchor_entry
                 ON anchor_entry.id = anchor.entry_id
               WHERE anchor_entry.user_id = $1
                 AND anchor.user_id = $1
                 AND anchor.entry_id = $2
                 AND anchor.id = $3::uuid
             )
           )
         ORDER BY history.revision
         LIMIT $4
       )
       SELECT id,
              CASE WHEN octet_length(payload_text) <= $5 THEN payload_text ELSE NULL END
                AS payload_text,
              octet_length(payload_text) AS payload_byte_length
       FROM page
       ORDER BY revision`

async function* foodCatalogRevisionPageRows(
  client: PoolClient,
  userId: string,
  entryId: string,
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
      portableExportFoodCatalogRevisionPageQuery,
      [userId, entryId, anchorId, batchRows, maximumPayloadBytes],
    )
    if (page.rows.length === 0) break
    yield* boundedPagePayloads(
      page.rows,
      batchRows,
      maximumPayloadBytes,
      stats,
      'food catalog revision',
      signal,
    )
    anchorId = page.rows.at(-1)!.id
    if (page.rows.length < batchRows) break
  }
}

async function* foodCatalogPageRows(
  client: PoolClient,
  userId: string,
  batchRows: number,
  maximumPayloadBytes: number,
  entryStats: MutableSnapshotStats,
  revisionStats: MutableSnapshotStats,
  signal?: AbortSignal,
  failRoot?: (error: unknown) => Promise<unknown>,
): AsyncGenerator<PortableExportFoodCatalogSnapshotEntry> {
  throwIfAborted(signal)
  let anchorId: string | null = null
  while (true) {
    throwIfAborted(signal)
    const page: QueryResult<BoundedSnapshotRow> = await client.query<BoundedSnapshotRow>(
      portableExportFoodCatalogEntryPageQuery,
      [userId, anchorId, batchRows, maximumPayloadBytes],
    )
    if (page.rows.length === 0) break
    for (const header of boundedPagePayloads(
      page.rows,
      batchRows,
      maximumPayloadBytes,
      entryStats,
      'food catalog entry',
      signal,
    )) {
      if (
        !Object.hasOwn(header, 'history') ||
        !Array.isArray(header.history) ||
        header.history.length !== 0
      ) {
        throw new Error('portable export snapshot returned an invalid food catalog entry page')
      }
      const entryId = header.id as string
      let historyStarted = false
      let historyCompleted = false
      const history: AsyncIterable<Record<string, unknown>> = {
        [Symbol.asyncIterator]: () =>
          (async function* () {
            if (historyStarted) {
              const error = new Error(
                'portable export food catalog history must be read once in order',
              )
              throw failRoot ? await failRoot(error) : error
            }
            historyStarted = true
            let failure: unknown
            try {
              yield* foodCatalogRevisionPageRows(
                client,
                userId,
                entryId,
                batchRows,
                maximumPayloadBytes,
                revisionStats,
                signal,
              )
              historyCompleted = true
            } catch (error) {
              failure = error
              throw failRoot ? await failRoot(error) : error
            } finally {
              if (!historyCompleted && failure === undefined) {
                const error = new Error('portable export food catalog history did not complete')
                throw failRoot ? await failRoot(error) : error
              }
            }
          })(),
      }
      header.history = history
      yield header as PortableExportFoodCatalogSnapshotEntry
      if (!historyStarted || !historyCompleted) {
        throw new Error('portable export food catalog history must complete')
      }
    }
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

export const portableExportWorkoutJsonHeaderPageQuery = `WITH page AS MATERIALIZED (
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
         SELECT id, started_at, created_at,
                (to_jsonb(page) || jsonb_build_object(
                  'exercises', '[]'::jsonb,
                  'history', '[]'::jsonb
                ))::text AS payload_text
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
  query = portableExportWorkoutHeaderPageQuery,
  payloadLabel = 'workout header',
): AsyncGenerator<Record<string, unknown>> {
  throwIfAborted(signal)
  let anchorId: string | null = null

  while (true) {
    throwIfAborted(signal)
    const page: QueryResult<BoundedSnapshotRow> = await client.query<BoundedSnapshotRow>(query, [
      userId,
      anchorId,
      batchRows,
      maximumPayloadBytes,
    ])
    if (page.rows.length === 0) break
    yield* boundedPagePayloads(
      page.rows,
      batchRows,
      maximumPayloadBytes,
      stats,
      payloadLabel,
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

export const portableExportWorkoutJsonExerciseHeaderPageQuery = `WITH page AS MATERIALIZED (
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
         SELECT id, position,
                (to_jsonb(page) || jsonb_build_object('sets', '[]'::jsonb))::text AS payload_text
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
  query = portableExportWorkoutExerciseHeaderPageQuery,
  payloadLabel = 'workout exercise header',
): AsyncGenerator<Record<string, unknown>> {
  throwIfAborted(signal)
  let anchorId: string | null = null

  while (true) {
    throwIfAborted(signal)
    const page: QueryResult<BoundedSnapshotRow> = await client.query<BoundedSnapshotRow>(query, [
      userId,
      workoutId,
      anchorId,
      batchRows,
      maximumPayloadBytes,
    ])
    if (page.rows.length === 0) break
    yield* boundedPagePayloads(
      page.rows,
      batchRows,
      maximumPayloadBytes,
      stats,
      payloadLabel,
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

export const portableExportWorkoutRevisionHeaderPageQuery = `WITH page AS MATERIALIZED (
         SELECT history.id, history.action, history.revision, history.changed_at
         FROM workout_revisions AS history
         INNER JOIN workout_sessions AS workout ON workout.id = history.workout_id
         WHERE workout.user_id = $1
           AND history.user_id = $1
           AND history.workout_id = $2
           AND (
             $3::uuid IS NULL
             OR history.revision > (
               SELECT anchor.revision
               FROM workout_revisions AS anchor
               INNER JOIN workout_sessions AS anchor_workout
                 ON anchor_workout.id = anchor.workout_id
               WHERE anchor_workout.user_id = $1
                 AND anchor.user_id = $1
                 AND anchor.workout_id = $2
                 AND anchor.id = $3::uuid
             )
           )
         ORDER BY history.revision
         LIMIT $4
       ), encoded AS MATERIALIZED (
         SELECT id, revision, to_jsonb(page)::text AS payload_text
         FROM page
       )
       SELECT id,
              CASE
                WHEN octet_length(payload_text) <= $5 THEN payload_text
                ELSE NULL
              END AS payload_text,
              octet_length(payload_text) AS payload_byte_length
       FROM encoded
       ORDER BY revision`

export const portableExportWorkoutRevisionSnapshotHeaderPageQuery = `WITH page AS MATERIALIZED (
         SELECT history.id, history.action, history.revision,
                NULL::jsonb AS snapshot, history.changed_at
         FROM workout_revisions AS history
         INNER JOIN workout_sessions AS workout ON workout.id = history.workout_id
         WHERE workout.user_id = $1
           AND history.user_id = $1
           AND history.workout_id = $2
           AND (
             $3::uuid IS NULL
             OR history.revision > (
               SELECT anchor.revision
               FROM workout_revisions AS anchor
               INNER JOIN workout_sessions AS anchor_workout
                 ON anchor_workout.id = anchor.workout_id
               WHERE anchor_workout.user_id = $1
                 AND anchor.user_id = $1
                 AND anchor.workout_id = $2
                 AND anchor.id = $3::uuid
             )
           )
         ORDER BY history.revision
         LIMIT $4
       ), encoded AS MATERIALIZED (
         SELECT id, revision, to_jsonb(page)::text AS payload_text
         FROM page
       )
       SELECT id,
              CASE
                WHEN octet_length(payload_text) <= $5 THEN payload_text
                ELSE NULL
              END AS payload_text,
              octet_length(payload_text) AS payload_byte_length
       FROM encoded
       ORDER BY revision`

async function* workoutRevisionHeaderPageRows(
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
      portableExportWorkoutRevisionHeaderPageQuery,
      [userId, workoutId, anchorId, batchRows, maximumPayloadBytes],
    )
    if (page.rows.length === 0) break
    yield* boundedPagePayloads(
      page.rows,
      batchRows,
      maximumPayloadBytes,
      stats,
      'workout revision header',
      signal,
    )

    anchorId = page.rows.at(-1)!.id
    if (page.rows.length < batchRows) break
  }
}

async function* workoutRevisionSnapshotHeaderPageRows(
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
      portableExportWorkoutRevisionSnapshotHeaderPageQuery,
      [userId, workoutId, anchorId, batchRows, maximumPayloadBytes],
    )
    if (page.rows.length === 0) break
    yield* boundedPagePayloads(
      page.rows,
      batchRows,
      maximumPayloadBytes,
      stats,
      'workout revision snapshot header',
      signal,
    )

    anchorId = page.rows.at(-1)!.id
    if (page.rows.length < batchRows) break
  }
}

type WorkoutRevisionSnapshotShapeRow = QueryResultRow & {
  revision: number
  compatibility: 'legacy' | 'extended' | 'mixed'
  root_header_bytes: number
  exercise_count: number
  set_count: number
  legacy_exercise_count: number
  extended_exercise_count: number
  maximum_exercise_header_bytes: number
  maximum_set_bytes: number
  exercise_storage_order_matches_position: boolean
  set_storage_order_matches_position: boolean
  decomposable: boolean
}

type NutritionMealShapeRow = QueryResultRow & {
  meal_revision: number
  current_item_count: number
  revision_count: number
  header_bytes: number
  current_item_payload_bytes: number
  maximum_current_item_bytes: number
  revision_payload_bytes: number
  maximum_revision_payload_bytes: number
  maximum_revision_item_count: number
  revision_snapshots_have_item_arrays: boolean
  history_aggregate_exceeds_payload_boundary: boolean
}

export const portableExportNutritionMealShapeQuery = `WITH target AS MATERIALIZED (
         SELECT id, meal_type, title, source_kind, source_metadata, occurred_at, timezone,
                note, revision, deleted_at, created_at, updated_at
         FROM nutrition_meals
         WHERE user_id = $1 AND id = $2
       ), item_stats AS MATERIALIZED (
         SELECT count(item.id)::integer AS current_item_count,
                COALESCE(sum(octet_length((to_jsonb(item) - 'meal_id')::text)), 0)::double precision
                  AS current_item_payload_bytes,
                COALESCE(max(octet_length((to_jsonb(item) - 'meal_id')::text)), 0)::integer
                  AS maximum_current_item_bytes
         FROM target
         LEFT JOIN nutrition_meal_items AS item ON item.meal_id = target.id
       ), revision_stats AS MATERIALIZED (
         SELECT count(history.id)::integer AS revision_count,
                COALESCE(
                  sum(octet_length((to_jsonb(history) - 'user_id' - 'meal_id')::text)),
                  0
                )::double precision AS revision_payload_bytes,
                COALESCE(
                  max(octet_length((to_jsonb(history) - 'user_id' - 'meal_id')::text)),
                  0
                )::integer AS maximum_revision_payload_bytes,
                COALESCE(
                  max(
                    CASE
                      WHEN jsonb_typeof(history.snapshot->'items') = 'array'
                        THEN jsonb_array_length(history.snapshot->'items')
                      ELSE 0
                    END
                  ),
                  0
                )::integer AS maximum_revision_item_count,
                COALESCE(
                  bool_and(
                    jsonb_typeof(history.snapshot) = 'object'
                    AND jsonb_typeof(history.snapshot->'items') = 'array'
                  ),
                  false
                ) AS revision_snapshots_have_item_arrays
         FROM target
         LEFT JOIN nutrition_meal_revisions AS history ON history.meal_id = target.id
       )
       SELECT target.revision AS meal_revision,
              item_stats.current_item_count,
              revision_stats.revision_count,
              octet_length(
                (
                  to_jsonb(target)
                  || jsonb_build_object('items', '[]'::jsonb, 'history', '[]'::jsonb)
                )::text
              )::integer AS header_bytes,
              item_stats.current_item_payload_bytes,
              item_stats.maximum_current_item_bytes,
              revision_stats.revision_payload_bytes,
              revision_stats.maximum_revision_payload_bytes,
              revision_stats.maximum_revision_item_count,
              revision_stats.revision_snapshots_have_item_arrays,
              revision_stats.revision_payload_bytes > $3
                AS history_aggregate_exceeds_payload_boundary
       FROM target
       CROSS JOIN item_stats
       CROSS JOIN revision_stats`

const mapNutritionMealShape = (
  row: NutritionMealShapeRow,
): PortableExportNutritionMealShapeReceipt => ({
  schemaVersion: portableExportNutritionMealShapeSchemaVersion,
  mealRevision: row.meal_revision,
  currentItemCount: row.current_item_count,
  revisionCount: row.revision_count,
  headerBytes: row.header_bytes,
  currentItemPayloadBytes: row.current_item_payload_bytes,
  maximumCurrentItemBytes: row.maximum_current_item_bytes,
  revisionPayloadBytes: row.revision_payload_bytes,
  maximumRevisionPayloadBytes: row.maximum_revision_payload_bytes,
  maximumRevisionItemCount: row.maximum_revision_item_count,
  revisionSnapshotsHaveItemArrays: row.revision_snapshots_have_item_arrays,
  historyAggregateExceedsPayloadBoundary: row.history_aggregate_exceeds_payload_boundary,
})

export const portableExportNutritionMealHeaderPageQuery = `WITH page AS MATERIALIZED (
         SELECT id, meal_type, title, source_kind, source_metadata, occurred_at, timezone,
                note, revision, deleted_at, created_at, updated_at
         FROM nutrition_meals
         WHERE user_id = $1
           AND (
             $2::uuid IS NULL
             OR (occurred_at, created_at, id) > (
               SELECT occurred_at, created_at, id
               FROM nutrition_meals
               WHERE user_id = $1 AND id = $2::uuid
             )
           )
         ORDER BY occurred_at, created_at, id
         LIMIT $3
       ), encoded AS MATERIALIZED (
         SELECT id, occurred_at, created_at,
                (
                  to_jsonb(page)
                  || jsonb_build_object('items', '[]'::jsonb, 'history', '[]'::jsonb)
                )::text AS payload_text
         FROM page
       )
       SELECT id,
              CASE WHEN octet_length(payload_text) <= $4 THEN payload_text ELSE NULL END
                AS payload_text,
              octet_length(payload_text) AS payload_byte_length
       FROM encoded
       ORDER BY occurred_at, created_at, id`

async function* nutritionMealHeaderPageRows(
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
      portableExportNutritionMealHeaderPageQuery,
      [userId, anchorId, batchRows, maximumPayloadBytes],
    )
    if (page.rows.length === 0) break
    yield* boundedPagePayloads(
      page.rows,
      batchRows,
      maximumPayloadBytes,
      stats,
      'nutrition meal header',
      signal,
    )
    anchorId = page.rows.at(-1)!.id
    if (page.rows.length < batchRows) break
  }
}

export const portableExportNutritionMealItemPageQuery = `WITH page AS MATERIALIZED (
         SELECT item.id, item.position, item.food_key, item.food_name, item.food_category,
                item.energy_kcal_per_100g, item.protein_g_per_100g,
                item.carbohydrate_g_per_100g, item.fat_g_per_100g,
                item.fiber_g_per_100g, item.reference, item.display_amount,
                item.display_unit, item.canonical_grams
         FROM nutrition_meal_items AS item
         INNER JOIN nutrition_meals AS meal ON meal.id = item.meal_id
         WHERE meal.user_id = $1
           AND item.meal_id = $2
           AND (
             $3::uuid IS NULL
             OR item.position > (
               SELECT anchor.position
               FROM nutrition_meal_items AS anchor
               INNER JOIN nutrition_meals AS anchor_meal ON anchor_meal.id = anchor.meal_id
               WHERE anchor_meal.user_id = $1
                 AND anchor.meal_id = $2
                 AND anchor.id = $3::uuid
             )
           )
         ORDER BY item.position
         LIMIT $4
       ), encoded AS MATERIALIZED (
         SELECT id, position, to_jsonb(page)::text AS payload_text
         FROM page
       )
       SELECT id,
              CASE WHEN octet_length(payload_text) <= $5 THEN payload_text ELSE NULL END
                AS payload_text,
              octet_length(payload_text) AS payload_byte_length
       FROM encoded
       ORDER BY position`

async function* nutritionMealItemPageRows(
  client: PoolClient,
  userId: string,
  mealId: string,
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
      portableExportNutritionMealItemPageQuery,
      [userId, mealId, anchorId, batchRows, maximumPayloadBytes],
    )
    if (page.rows.length === 0) break
    yield* boundedPagePayloads(
      page.rows,
      batchRows,
      maximumPayloadBytes,
      stats,
      'nutrition meal item',
      signal,
    )
    anchorId = page.rows.at(-1)!.id
    if (page.rows.length < batchRows) break
  }
}

export const portableExportNutritionMealRevisionHeaderPageQuery = `WITH page AS MATERIALIZED (
         SELECT history.id, history.action, history.revision,
                NULL::jsonb AS snapshot, history.changed_at
         FROM nutrition_meal_revisions AS history
         INNER JOIN nutrition_meals AS meal ON meal.id = history.meal_id
         WHERE meal.user_id = $1
           AND history.user_id = $1
           AND history.meal_id = $2
           AND (
             $3::uuid IS NULL
             OR history.revision > (
               SELECT anchor.revision
               FROM nutrition_meal_revisions AS anchor
               INNER JOIN nutrition_meals AS anchor_meal ON anchor_meal.id = anchor.meal_id
               WHERE anchor_meal.user_id = $1
                 AND anchor.user_id = $1
                 AND anchor.meal_id = $2
                 AND anchor.id = $3::uuid
             )
           )
         ORDER BY history.revision
         LIMIT $4
       ), encoded AS MATERIALIZED (
         SELECT id, revision, to_jsonb(page)::text AS payload_text
         FROM page
       )
       SELECT id,
              CASE WHEN octet_length(payload_text) <= $5 THEN payload_text ELSE NULL END
                AS payload_text,
              octet_length(payload_text) AS payload_byte_length
       FROM encoded
       ORDER BY revision`

async function* nutritionMealRevisionHeaderPageRows(
  client: PoolClient,
  userId: string,
  mealId: string,
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
      portableExportNutritionMealRevisionHeaderPageQuery,
      [userId, mealId, anchorId, batchRows, maximumPayloadBytes],
    )
    if (page.rows.length === 0) break
    yield* boundedPagePayloads(
      page.rows,
      batchRows,
      maximumPayloadBytes,
      stats,
      'nutrition meal revision header',
      signal,
    )
    anchorId = page.rows.at(-1)!.id
    if (page.rows.length < batchRows) break
  }
}

type NutritionMealRevisionSnapshotRootRow = BoundedSnapshotRow & {
  decomposable: boolean
}

export const portableExportNutritionMealRevisionSnapshotRootQuery = `WITH target AS MATERIALIZED (
         SELECT history.meal_id AS id, history.snapshot,
                jsonb_typeof(history.snapshot) = 'object'
                  AND jsonb_typeof(history.snapshot->'items') = 'array' AS decomposable
         FROM nutrition_meal_revisions AS history
         INNER JOIN nutrition_meals AS meal ON meal.id = history.meal_id
         WHERE meal.user_id = $1
           AND history.user_id = $1
           AND history.meal_id = $2
           AND history.id = $3
       ), encoded AS MATERIALIZED (
         SELECT id, decomposable,
                CASE
                  WHEN decomposable THEN jsonb_set(snapshot, '{items}', '[]'::jsonb)::text
                  ELSE NULL
                END AS payload_text
         FROM target
       )
       SELECT id, decomposable,
              CASE
                WHEN decomposable AND octet_length(payload_text) <= $4 THEN payload_text
                ELSE NULL
              END AS payload_text,
              CASE WHEN decomposable THEN octet_length(payload_text) ELSE 0 END
                AS payload_byte_length
       FROM encoded`

const readNutritionMealRevisionSnapshotRoot = async (
  client: PoolClient,
  userId: string,
  mealId: string,
  revisionId: string,
  maximumPayloadBytes: number,
  stats: MutableSnapshotStats,
  signal?: AbortSignal,
) => {
  throwIfAborted(signal)
  const result = await client.query<NutritionMealRevisionSnapshotRootRow>(
    portableExportNutritionMealRevisionSnapshotRootQuery,
    [userId, mealId, revisionId, maximumPayloadBytes],
  )
  const row = result.rows[0]
  if (!row) throw new NotFoundException('nutrition meal revision snapshot not found')
  if (!row.decomposable) {
    throw new PortableExportNutritionMealRevisionSnapshotNotDecomposableError()
  }
  const roots = [
    ...boundedPagePayloads(
      [row],
      1,
      maximumPayloadBytes,
      stats,
      'nutrition meal revision snapshot root',
      signal,
    ),
  ]
  if (roots.length !== 1 || !Array.isArray(roots[0]!.items) || roots[0]!.items.length !== 0) {
    throw new Error('portable export snapshot returned an invalid nutrition meal revision root')
  }
  return roots[0]!
}

type NutritionMealRevisionSnapshotItemRow = BoundedSnapshotRow & {
  ordinality: number
}

export const portableExportNutritionMealRevisionSnapshotItemPageQuery = `WITH target AS MATERIALIZED (
         SELECT history.snapshot
         FROM nutrition_meal_revisions AS history
         INNER JOIN nutrition_meals AS meal ON meal.id = history.meal_id
         WHERE meal.user_id = $1
           AND history.user_id = $1
           AND history.meal_id = $2
           AND history.id = $3
       ), item_rows AS MATERIALIZED (
         SELECT item.value AS item_json,
                item.value->>'id' AS id,
                item.ordinality::integer AS ordinality
         FROM target
         CROSS JOIN LATERAL jsonb_array_elements(target.snapshot->'items')
           WITH ORDINALITY AS item(value, ordinality)
       ), page AS MATERIALIZED (
         SELECT id, ordinality, item_json::text AS payload_text
         FROM item_rows
         WHERE ordinality > $4
         ORDER BY ordinality
         LIMIT $5
       )
       SELECT id, ordinality,
              CASE WHEN octet_length(payload_text) <= $6 THEN payload_text ELSE NULL END
                AS payload_text,
              octet_length(payload_text) AS payload_byte_length
       FROM page
       ORDER BY ordinality`

async function* nutritionMealRevisionSnapshotItemPageRows(
  client: PoolClient,
  userId: string,
  mealId: string,
  revisionId: string,
  batchRows: number,
  maximumPayloadBytes: number,
  stats: MutableSnapshotStats,
  signal?: AbortSignal,
): AsyncGenerator<Record<string, unknown>> {
  throwIfAborted(signal)
  let anchorOrdinality = 0
  while (true) {
    throwIfAborted(signal)
    const page = await client.query<NutritionMealRevisionSnapshotItemRow>(
      portableExportNutritionMealRevisionSnapshotItemPageQuery,
      [userId, mealId, revisionId, anchorOrdinality, batchRows, maximumPayloadBytes],
    )
    if (page.rows.length === 0) break
    yield* boundedPagePayloads(
      page.rows,
      batchRows,
      maximumPayloadBytes,
      stats,
      'nutrition meal revision snapshot item',
      signal,
    )
    const nextAnchor = page.rows.at(-1)!.ordinality
    if (!Number.isSafeInteger(nextAnchor) || nextAnchor <= anchorOrdinality) {
      throw new Error('portable export nutrition meal snapshot returned an invalid item order')
    }
    anchorOrdinality = nextAnchor
    if (page.rows.length < batchRows) break
  }
}

export const portableExportWorkoutRevisionSnapshotShapeQuery = `WITH target AS MATERIALIZED (
         SELECT history.id, history.workout_id, history.user_id, history.revision, history.snapshot
         FROM workout_revisions AS history
         INNER JOIN workout_sessions AS workout ON workout.id = history.workout_id
         WHERE workout.user_id = $1
           AND history.user_id = $1
           AND history.workout_id = $2
           AND history.id = $3
       ), exercise_rows AS MATERIALIZED (
         SELECT target.id AS revision_id,
                 exercise.value AS exercise_json,
                 exercise.ordinality::integer AS exercise_ordinality,
                 CASE
                   WHEN exercise.value->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                     THEN exercise.value->>'id'
                   ELSE NULL
                 END AS exercise_id,
                 CASE
                  WHEN exercise.value->>'position' ~ '^[1-9][0-9]*$'
                    THEN (exercise.value->>'position')::integer
                  ELSE NULL
                END AS exercise_position
         FROM target
         CROSS JOIN LATERAL jsonb_array_elements(
           CASE
             WHEN jsonb_typeof(target.snapshot->'exercises') = 'array'
               THEN target.snapshot->'exercises'
             ELSE '[]'::jsonb
           END
         ) WITH ORDINALITY AS exercise(value, ordinality)
       ), exercise_order AS MATERIALIZED (
         SELECT exercise_rows.*,
                lag(exercise_position) OVER (
                  PARTITION BY revision_id ORDER BY exercise_ordinality
                ) AS previous_exercise_position
         FROM exercise_rows
       ), set_rows AS MATERIALIZED (
         SELECT exercise_order.revision_id,
                exercise_order.exercise_ordinality,
                 set_row.value AS set_json,
                 set_row.ordinality::integer AS set_ordinality,
                 CASE
                   WHEN set_row.value->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                     THEN set_row.value->>'id'
                   ELSE NULL
                 END AS set_id,
                 CASE
                  WHEN set_row.value->>'position' ~ '^[1-9][0-9]*$'
                    THEN (set_row.value->>'position')::integer
                  ELSE NULL
                END AS set_position
         FROM exercise_order
         CROSS JOIN LATERAL jsonb_array_elements(
           CASE
             WHEN jsonb_typeof(exercise_order.exercise_json->'sets') = 'array'
               THEN exercise_order.exercise_json->'sets'
             ELSE '[]'::jsonb
           END
         ) WITH ORDINALITY AS set_row(value, ordinality)
       ), set_order AS MATERIALIZED (
         SELECT set_rows.*,
                lag(set_position) OVER (
                  PARTITION BY revision_id, exercise_ordinality ORDER BY set_ordinality
                ) AS previous_set_position
         FROM set_rows
       ), exercise_stats AS MATERIALIZED (
         SELECT target.id AS revision_id,
                count(exercise_order.exercise_json)::integer AS exercise_count,
                count(*) FILTER (
                  WHERE exercise_order.exercise_json IS NOT NULL
                    AND NOT (
                      exercise_order.exercise_json
                      ?| ARRAY['trackingMode', 'equipment', 'equipmentNotes']::text[]
                    )
                )::integer AS legacy_exercise_count,
                count(*) FILTER (
                  WHERE exercise_order.exercise_json IS NOT NULL
                    AND exercise_order.exercise_json
                      ?| ARRAY['trackingMode', 'equipment', 'equipmentNotes']::text[]
                )::integer AS extended_exercise_count,
                COALESCE(
                  max(
                    octet_length(
                      jsonb_set(exercise_order.exercise_json, '{sets}', '[]'::jsonb)::text
                    )
                  ),
                  0
                )::integer AS maximum_exercise_header_bytes,
                COALESCE(
                  bool_and(
                    exercise_order.exercise_position IS NOT NULL
                    AND (
                      exercise_order.previous_exercise_position IS NULL
                      OR exercise_order.exercise_position > exercise_order.previous_exercise_position
                    )
                  ),
                  false
                ) AS exercise_storage_order_matches_position,
                COALESCE(
                  bool_and(
                    jsonb_typeof(exercise_order.exercise_json) = 'object'
                    AND exercise_order.exercise_json
                      ?& ARRAY['id', 'position', 'exerciseKey', 'name', 'category', 'sets']::text[]
                    AND NOT EXISTS (
                      SELECT 1
                      FROM jsonb_object_keys(
                        CASE
                          WHEN jsonb_typeof(exercise_order.exercise_json) = 'object'
                            THEN exercise_order.exercise_json
                          ELSE '{}'::jsonb
                        END
                      ) AS exercise_key(key)
                      WHERE exercise_key.key <> ALL (
                        ARRAY[
                          'id', 'position', 'exerciseKey', 'name', 'category', 'trackingMode',
                          'equipment', 'equipmentNotes', 'notes', 'sets'
                        ]::text[]
                      )
                    )
                     AND jsonb_typeof(exercise_order.exercise_json->'sets') = 'array'
                     AND exercise_order.exercise_id IS NOT NULL
                    AND jsonb_array_length(
                      CASE
                        WHEN jsonb_typeof(exercise_order.exercise_json->'sets') = 'array'
                          THEN exercise_order.exercise_json->'sets'
                        ELSE '[]'::jsonb
                      END
                    ) BETWEEN 1 AND 50
                    AND exercise_order.exercise_position BETWEEN 1 AND 50
                  ),
                  false
                )
                 AND count(exercise_order.exercise_json) BETWEEN 1 AND 30
                 AND count(DISTINCT exercise_order.exercise_id)
                   = count(exercise_order.exercise_json)
                 AND count(DISTINCT exercise_order.exercise_position)
                  = count(exercise_order.exercise_json) AS exercises_decomposable
         FROM target
         LEFT JOIN exercise_order ON exercise_order.revision_id = target.id
         GROUP BY target.id
       ), set_parent_stats AS MATERIALIZED (
         SELECT revision_id,
                exercise_ordinality,
                count(set_json)::integer AS set_count,
                COALESCE(
                  bool_and(
                    jsonb_typeof(set_json) = 'object'
                    AND set_json
                      ?& ARRAY['id', 'position', 'kind', 'canonicalLoadKg', 'completed']::text[]
                    AND NOT EXISTS (
                      SELECT 1
                      FROM jsonb_object_keys(
                        CASE
                          WHEN jsonb_typeof(set_json) = 'object' THEN set_json
                          ELSE '{}'::jsonb
                        END
                      ) AS set_key(key)
                      WHERE set_key.key <> ALL (
                        ARRAY[
                          'id', 'position', 'kind', 'reps', 'load', 'loadUnit',
                          'canonicalLoadKg', 'durationSeconds', 'distanceMeters', 'rpe', 'completed'
                        ]::text[]
                      )
                     )
                    AND set_id IS NOT NULL
                    AND set_position BETWEEN 1 AND 100
                  ),
                  false
                )
                AND count(DISTINCT set_id) = count(set_json)
                AND count(DISTINCT set_position) = count(set_json) AS sets_decomposable,
                COALESCE(
                  bool_and(
                    set_position IS NOT NULL
                    AND (previous_set_position IS NULL OR set_position > previous_set_position)
                  ),
                  false
                ) AS set_storage_order_matches_position,
                COALESCE(max(octet_length(set_json::text)), 0)::integer AS maximum_set_bytes
         FROM set_order
         GROUP BY revision_id, exercise_ordinality
       ), set_stats AS MATERIALIZED (
         SELECT target.id AS revision_id,
                COALESCE(sum(set_parent_stats.set_count), 0)::integer AS set_count,
                COALESCE(max(set_parent_stats.maximum_set_bytes), 0)::integer AS maximum_set_bytes,
                COALESCE(bool_and(set_parent_stats.sets_decomposable), false)
                  AS sets_decomposable,
                COALESCE(bool_and(set_parent_stats.set_storage_order_matches_position), false)
                  AS set_storage_order_matches_position
         FROM target
         LEFT JOIN set_parent_stats ON set_parent_stats.revision_id = target.id
         GROUP BY target.id
       )
       SELECT target.revision,
              CASE
                WHEN exercise_stats.legacy_exercise_count = exercise_stats.exercise_count
                  THEN 'legacy'
                WHEN exercise_stats.extended_exercise_count = exercise_stats.exercise_count
                  THEN 'extended'
                ELSE 'mixed'
              END AS compatibility,
              octet_length(
                jsonb_set(target.snapshot, '{exercises}', '[]'::jsonb)::text
              )::integer AS root_header_bytes,
              exercise_stats.exercise_count,
              set_stats.set_count,
              exercise_stats.legacy_exercise_count,
              exercise_stats.extended_exercise_count,
              exercise_stats.maximum_exercise_header_bytes,
              set_stats.maximum_set_bytes,
              exercise_stats.exercise_storage_order_matches_position,
              set_stats.set_storage_order_matches_position,
              (
                jsonb_typeof(target.snapshot) = 'object'
                AND target.snapshot
                  ?& ARRAY[
                    'id', 'userId', 'title', 'status', 'source', 'exercises', 'summary',
                    'startedAt', 'endedAt', 'timezone', 'painLevel', 'fatigue', 'note',
                    'revision', 'createdAt', 'updatedAt'
                  ]::text[]
                AND NOT EXISTS (
                  SELECT 1
                  FROM jsonb_object_keys(target.snapshot) AS root_key(key)
                  WHERE root_key.key <> ALL (
                    ARRAY[
                      'id', 'userId', 'title', 'status', 'source', 'exercises', 'summary',
                      'startedAt', 'endedAt', 'timezone', 'painLevel', 'fatigue', 'note',
                      'revision', 'createdAt', 'updatedAt'
                    ]::text[]
                  )
                )
                AND target.snapshot->>'id' = target.workout_id::text
                AND target.snapshot->>'userId' = target.user_id::text
                AND target.snapshot->>'revision' ~ '^[1-9][0-9]*$'
                AND (target.snapshot->>'revision')::integer = target.revision
                AND jsonb_typeof(target.snapshot->'source') = 'object'
                AND jsonb_typeof(target.snapshot->'summary') = 'object'
                AND jsonb_typeof(target.snapshot->'exercises') = 'array'
                AND exercise_stats.exercises_decomposable
                AND set_stats.sets_decomposable
                AND octet_length(
                  jsonb_set(target.snapshot, '{exercises}', '[]'::jsonb)::text
                ) <= $4
                AND exercise_stats.maximum_exercise_header_bytes <= $4
                AND set_stats.maximum_set_bytes <= $4
              ) AS decomposable
       FROM target
       INNER JOIN exercise_stats ON exercise_stats.revision_id = target.id
       INNER JOIN set_stats ON set_stats.revision_id = target.id`

const mapWorkoutRevisionSnapshotShape = (
  row: WorkoutRevisionSnapshotShapeRow,
): PortableExportWorkoutRevisionSnapshotShapeReceipt => ({
  schemaVersion: portableExportWorkoutRevisionSnapshotShapeSchemaVersion,
  revision: row.revision,
  compatibility: row.compatibility,
  rootHeaderBytes: row.root_header_bytes,
  exerciseCount: row.exercise_count,
  setCount: row.set_count,
  legacyExerciseCount: row.legacy_exercise_count,
  extendedExerciseCount: row.extended_exercise_count,
  maximumExerciseHeaderBytes: row.maximum_exercise_header_bytes,
  maximumSetBytes: row.maximum_set_bytes,
  exerciseStorageOrderMatchesPosition: row.exercise_storage_order_matches_position,
  setStorageOrderMatchesPosition: row.set_storage_order_matches_position,
  decomposable: row.decomposable,
})

const readWorkoutRevisionSnapshotShape = async (
  client: PoolClient,
  userId: string,
  workoutId: string,
  revisionId: string,
  maximumPayloadBytes: number,
) => {
  const result = await client.query<WorkoutRevisionSnapshotShapeRow>(
    portableExportWorkoutRevisionSnapshotShapeQuery,
    [userId, workoutId, revisionId, maximumPayloadBytes],
  )
  const row = result.rows[0]
  if (!row) throw new NotFoundException('workout revision snapshot not found')
  return mapWorkoutRevisionSnapshotShape(row)
}

export const portableExportWorkoutRevisionSnapshotRootQuery = `WITH target AS MATERIALIZED (
         SELECT history.workout_id, history.snapshot
         FROM workout_revisions AS history
         INNER JOIN workout_sessions AS workout ON workout.id = history.workout_id
         WHERE workout.user_id = $1
           AND history.user_id = $1
           AND history.workout_id = $2
           AND history.id = $3
       ), encoded AS MATERIALIZED (
         SELECT workout_id AS id,
                jsonb_set(snapshot, '{exercises}', '[]'::jsonb)::text AS payload_text
         FROM target
       )
       SELECT id,
              CASE WHEN octet_length(payload_text) <= $4 THEN payload_text ELSE NULL END
                AS payload_text,
              octet_length(payload_text) AS payload_byte_length
       FROM encoded`

const workoutRevisionSnapshotRootRows = async function* (
  client: PoolClient,
  userId: string,
  workoutId: string,
  revisionId: string,
  maximumPayloadBytes: number,
  stats: MutableSnapshotStats,
  signal?: AbortSignal,
): AsyncGenerator<Record<string, unknown>> {
  throwIfAborted(signal)
  const result = await client.query<BoundedSnapshotRow>(
    portableExportWorkoutRevisionSnapshotRootQuery,
    [userId, workoutId, revisionId, maximumPayloadBytes],
  )
  if (result.rows.length === 0) throw new NotFoundException('workout revision snapshot not found')
  yield* boundedPagePayloads(
    result.rows,
    1,
    maximumPayloadBytes,
    stats,
    'workout revision snapshot root',
    signal,
  )
}

export const portableExportWorkoutRevisionSnapshotExercisePageQuery = `WITH target AS MATERIALIZED (
         SELECT history.id, history.snapshot
         FROM workout_revisions AS history
         INNER JOIN workout_sessions AS workout ON workout.id = history.workout_id
         WHERE workout.user_id = $1
           AND history.user_id = $1
           AND history.workout_id = $2
           AND history.id = $3
       ), exercise_rows AS MATERIALIZED (
         SELECT exercise.value AS exercise_json,
                exercise.value->>'id' AS id,
                exercise.ordinality
         FROM target
         CROSS JOIN LATERAL jsonb_array_elements(target.snapshot->'exercises')
           WITH ORDINALITY AS exercise(value, ordinality)
       ), page AS MATERIALIZED (
         SELECT id, ordinality,
                jsonb_set(exercise_json, '{sets}', '[]'::jsonb)::text AS payload_text
         FROM exercise_rows
         WHERE $4::text IS NULL
            OR ordinality > (
              SELECT anchor.ordinality FROM exercise_rows AS anchor WHERE anchor.id = $4::text
            )
         ORDER BY ordinality
         LIMIT $5
       )
       SELECT id,
              CASE WHEN octet_length(payload_text) <= $6 THEN payload_text ELSE NULL END
                AS payload_text,
              octet_length(payload_text) AS payload_byte_length
       FROM page
       ORDER BY ordinality`

async function* workoutRevisionSnapshotExercisePageRows(
  client: PoolClient,
  userId: string,
  workoutId: string,
  revisionId: string,
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
      portableExportWorkoutRevisionSnapshotExercisePageQuery,
      [userId, workoutId, revisionId, anchorId, batchRows, maximumPayloadBytes],
    )
    if (page.rows.length === 0) break
    yield* boundedPagePayloads(
      page.rows,
      batchRows,
      maximumPayloadBytes,
      stats,
      'workout revision snapshot exercise',
      signal,
    )
    anchorId = page.rows.at(-1)!.id
    if (page.rows.length < batchRows) break
  }
}

export const portableExportWorkoutRevisionSnapshotSetPageQuery = `WITH target AS MATERIALIZED (
         SELECT history.id, history.snapshot
         FROM workout_revisions AS history
         INNER JOIN workout_sessions AS workout ON workout.id = history.workout_id
         WHERE workout.user_id = $1
           AND history.user_id = $1
           AND history.workout_id = $2
           AND history.id = $3
       ), exercise_target AS MATERIALIZED (
         SELECT exercise.value AS exercise_json
         FROM target
         CROSS JOIN LATERAL jsonb_array_elements(target.snapshot->'exercises')
           WITH ORDINALITY AS exercise(value, ordinality)
         WHERE exercise.value->>'id' = $4
       ), set_rows AS MATERIALIZED (
         SELECT set_row.value AS set_json,
                set_row.value->>'id' AS id,
                set_row.ordinality
         FROM exercise_target
         CROSS JOIN LATERAL jsonb_array_elements(exercise_target.exercise_json->'sets')
           WITH ORDINALITY AS set_row(value, ordinality)
       ), page AS MATERIALIZED (
         SELECT id, ordinality, set_json::text AS payload_text
         FROM set_rows
         WHERE $5::text IS NULL
            OR ordinality > (
              SELECT anchor.ordinality FROM set_rows AS anchor WHERE anchor.id = $5::text
            )
         ORDER BY ordinality
         LIMIT $6
       )
       SELECT id,
              CASE WHEN octet_length(payload_text) <= $7 THEN payload_text ELSE NULL END
                AS payload_text,
              octet_length(payload_text) AS payload_byte_length
       FROM page
       ORDER BY ordinality`

async function* workoutRevisionSnapshotSetPageRows(
  client: PoolClient,
  userId: string,
  workoutId: string,
  revisionId: string,
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
      portableExportWorkoutRevisionSnapshotSetPageQuery,
      [userId, workoutId, revisionId, exerciseId, anchorId, batchRows, maximumPayloadBytes],
    )
    if (page.rows.length === 0) break
    yield* boundedPagePayloads(
      page.rows,
      batchRows,
      maximumPayloadBytes,
      stats,
      'workout revision snapshot set',
      signal,
    )
    anchorId = page.rows.at(-1)!.id
    if (page.rows.length < batchRows) break
  }
}

type WorkoutRevisionSnapshotValueNode = {
  value: PortableExportWorkoutRevisionSnapshotValue
  shape: PortableExportWorkoutRevisionSnapshotShapeReceipt
  completed: () => boolean
  cleanup: () => Promise<void>
}

const createWorkoutRevisionSnapshotValueNode = async (
  client: PoolClient,
  userId: string,
  workoutId: string,
  revisionId: string,
  batchRows: number,
  maximumPayloadBytes: number,
  snapshotRootStats: MutableSnapshotStats,
  snapshotExerciseStats: MutableSnapshotStats,
  snapshotSetStats: MutableSnapshotStats,
  failLayer: (rootError: unknown) => Promise<unknown>,
  isFinalized: () => boolean,
  signal?: AbortSignal,
): Promise<WorkoutRevisionSnapshotValueNode> => {
  const shape = await readWorkoutRevisionSnapshotShape(
    client,
    userId,
    workoutId,
    revisionId,
    maximumPayloadBytes,
  )
  if (!shape.decomposable) {
    throw new PortableExportWorkoutRevisionSnapshotNotDecomposableError()
  }

  let snapshotHeader: Record<string, unknown> | undefined
  for await (const root of workoutRevisionSnapshotRootRows(
    client,
    userId,
    workoutId,
    revisionId,
    maximumPayloadBytes,
    snapshotRootStats,
    signal,
  )) {
    if (snapshotHeader) {
      throw new Error('portable export workout revision snapshot returned multiple roots')
    }
    snapshotHeader = root
  }
  if (!snapshotHeader || !Array.isArray(snapshotHeader.exercises)) {
    throw new Error('portable export workout revision snapshot returned an invalid root')
  }

  let exercisesStarted = false
  let exercisesCompleted = false
  let activeExerciseIterator:
    AsyncIterator<PortableExportWorkoutRevisionSnapshotExercise, void, undefined> | undefined
  let activeSetIterator: AsyncIterator<Record<string, unknown>, void, undefined> | undefined
  let suppressSetRootFailure = false

  const exercises: AsyncIterable<PortableExportWorkoutRevisionSnapshotExercise> = {
    [Symbol.asyncIterator]: () => {
      if (exercisesStarted) {
        return (async function* () {
          throw await failLayer(
            new Error('portable export workout revision snapshot exercises must be read once'),
          )
        })()
      }
      exercisesStarted = true
      const exerciseSourceIterator = workoutRevisionSnapshotExercisePageRows(
        client,
        userId,
        workoutId,
        revisionId,
        batchRows,
        maximumPayloadBytes,
        snapshotExerciseStats,
        signal,
      )[Symbol.asyncIterator]()
      let exerciseIterator!: AsyncGenerator<
        PortableExportWorkoutRevisionSnapshotExercise,
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
            if (
              typeof exerciseId !== 'string' ||
              exerciseId.length === 0 ||
              !Array.isArray(exerciseHeader.sets)
            ) {
              throw new Error(
                'portable export workout revision snapshot returned an invalid exercise',
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
                        'portable export workout revision snapshot sets must be read once before the next exercise',
                      ),
                    )
                  })()
                }
                setsStarted = true
                const setSourceIterator = workoutRevisionSnapshotSetPageRows(
                  client,
                  userId,
                  workoutId,
                  revisionId,
                  exerciseId,
                  batchRows,
                  maximumPayloadBytes,
                  snapshotSetStats,
                  signal,
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
                      if (!isFinalized() && !suppressSetRootFailure) {
                        const rootError =
                          setSourceError ??
                          new Error(
                            'portable export workout revision snapshot sets did not complete',
                          )
                        throw await failLayer(
                          cleanupError === undefined
                            ? rootError
                            : new AggregateError(
                                [rootError, cleanupError],
                                'portable export workout revision snapshot set source and cleanup both failed',
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
            exerciseHeader.sets = sets
            yield exerciseHeader as PortableExportWorkoutRevisionSnapshotExercise
            if (!setsStarted || !setsCompleted) {
              throw new Error(
                'portable export workout revision snapshot sets must complete before the next exercise',
              )
            }
          }
        } catch (error) {
          exerciseSourceError = error
          throw error
        } finally {
          if (activeExerciseIterator === exerciseIterator) activeExerciseIterator = undefined
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
            if (!isFinalized()) {
              const rootError =
                exerciseSourceError ??
                new Error('portable export workout revision snapshot exercises did not complete')
              throw await failLayer(
                cleanupErrors.length === 0
                  ? rootError
                  : new AggregateError(
                      [rootError, ...cleanupErrors],
                      'portable export workout revision snapshot exercise source and nested cleanup both failed',
                    ),
              )
            }
            if (cleanupErrors.length === 1) throw cleanupErrors[0]
            if (cleanupErrors.length > 1) {
              throw new AggregateError(
                cleanupErrors,
                'portable export workout revision snapshot exercise cleanup failed',
              )
            }
          }
        }
      })()
      activeExerciseIterator = exerciseIterator
      return exerciseIterator
    },
  }

  snapshotHeader.exercises = exercises

  return {
    value: snapshotHeader as PortableExportWorkoutRevisionSnapshotValue,
    shape,
    completed: () => exercisesStarted && exercisesCompleted,
    cleanup: async () => {
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
        await activeExerciseIterator?.return?.(undefined)
      } catch (error) {
        cleanupErrors.push(error)
      } finally {
        activeExerciseIterator = undefined
        suppressSetRootFailure = false
      }
      if (cleanupErrors.length === 1) throw cleanupErrors[0]
      if (cleanupErrors.length > 1) {
        throw new AggregateError(
          cleanupErrors,
          'portable export workout revision snapshot nested cleanup failed',
        )
      }
    },
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
  failRoot?: (error: unknown) => Promise<unknown>,
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

type WorkoutRevisionLayerSnapshotItem =
  | {
      kind: 'workout'
      value:
        | PortableExportWorkoutRevisionHeaderLayerSnapshotWorkout
        | PortableExportWorkoutRevisionSnapshotLayerWorkout
    }
  | {
      kind: 'boundary'
    }

type WorkoutRevisionLayerSnapshotContext = {
  accountAlreadyValidated?: boolean
  failRoot?: (error: unknown) => Promise<unknown>
}

const createWorkoutRevisionLayerSnapshotSession = (
  database: DatabaseService,
  userId: string,
  options: PortableExportDatabaseSnapshotOptions,
  mode: 'headers' | 'snapshots' | 'json',
  context: WorkoutRevisionLayerSnapshotContext = {},
):
  | PortableExportWorkoutRevisionHeaderLayerSnapshotSession
  | PortableExportWorkoutRevisionSnapshotLayerSession => {
  const includeRevisionSnapshots = mode !== 'headers'
  const jsonFieldOrder = mode === 'json'
  const batchRows = validateBatchRows(options.batchRows ?? portableExportSnapshotDefaultBatchRows)
  const maximumPayloadBytes = validateMaximumPayloadBytes(
    options.maximumPayloadBytes ?? portableExportSnapshotMaximumPayloadBytes,
  )
  const workoutHeaderStats: MutableSnapshotStats = { batchCount: 0, rowCount: 0 }
  const workoutExerciseStats: MutableSnapshotStats = { batchCount: 0, rowCount: 0 }
  const workoutSetStats: MutableSnapshotStats = { batchCount: 0, rowCount: 0 }
  const workoutRevisionStats: MutableSnapshotStats = { batchCount: 0, rowCount: 0 }
  const workoutRevisionSnapshotRootStats: MutableSnapshotStats = { batchCount: 0, rowCount: 0 }
  const workoutRevisionSnapshotExerciseStats: MutableSnapshotStats = { batchCount: 0, rowCount: 0 }
  const workoutRevisionSnapshotSetStats: MutableSnapshotStats = { batchCount: 0, rowCount: 0 }
  let resolveReceipt!: (
    receipt:
      | PortableExportWorkoutRevisionHeaderLayerSnapshotReceipt
      | PortableExportWorkoutRevisionSnapshotLayerReceipt,
  ) => void
  let rejectReceipt!: (error: unknown) => void
  const receipt = new Promise<
    | PortableExportWorkoutRevisionHeaderLayerSnapshotReceipt
    | PortableExportWorkoutRevisionSnapshotLayerReceipt
  >((resolve, reject) => {
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
  let activeHistoryIterator: AsyncIterator<Record<string, unknown>, void, undefined> | undefined
  let activeSnapshotCleanup: (() => Promise<void>) | undefined
  let transactionIterator: AsyncIterator<WorkoutRevisionLayerSnapshotItem, void, undefined>
  let failLayer!: (rootError: unknown) => Promise<unknown>

  const transactionItems = database.streamReadOnlyRepeatableRead(
    async function* (client): AsyncGenerator<WorkoutRevisionLayerSnapshotItem> {
      throwIfAborted(options.signal)
      if (!context.accountAlreadyValidated) await assertActiveAccount(client, userId)

      for await (const workoutHeader of workoutHeaderPageRows(
        client,
        userId,
        batchRows,
        maximumPayloadBytes,
        workoutHeaderStats,
        options.signal,
        jsonFieldOrder
          ? portableExportWorkoutJsonHeaderPageQuery
          : portableExportWorkoutHeaderPageQuery,
        jsonFieldOrder ? 'workout JSON header' : 'workout header',
      )) {
        const workoutId = workoutHeader.id
        if (typeof workoutId !== 'string' || workoutId.length === 0) {
          throw new Error(
            'portable export workout revision header layer returned an invalid workout',
          )
        }
        let exercisesStarted = false
        let exercisesCompleted = false
        let historyStarted = false
        let historyCompleted = false

        const exercises: AsyncIterable<PortableExportWorkoutSetLayerSnapshotExercise> = {
          [Symbol.asyncIterator]: () => {
            if (jsonFieldOrder && (!historyStarted || !historyCompleted)) {
              return (async function* () {
                throw await failLayer(
                  new Error(
                    'portable export workout JSON exercises must be read after history completes',
                  ),
                )
              })()
            }
            if (exercisesStarted) {
              return (async function* () {
                throw await failLayer(
                  new Error(
                    'portable export workout revision header layer exercises must be read once before history',
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
              jsonFieldOrder
                ? portableExportWorkoutJsonExerciseHeaderPageQuery
                : portableExportWorkoutExerciseHeaderPageQuery,
              jsonFieldOrder ? 'workout JSON exercise header' : 'workout exercise header',
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
                      'portable export workout revision header layer returned an invalid exercise',
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
                              'portable export workout revision header sets must be read once before the next exercise',
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
                                new Error(
                                  'portable export workout revision header sets did not complete',
                                )
                              throw await failLayer(
                                cleanupError === undefined
                                  ? rootError
                                  : new AggregateError(
                                      [rootError, cleanupError],
                                      'portable export workout revision set source and cleanup both failed',
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
                      'portable export workout revision header sets must complete before the next exercise',
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
                      new Error(
                        'portable export workout revision header layer exercises did not complete',
                      )
                    throw await failLayer(
                      cleanupErrors.length === 0
                        ? rootError
                        : new AggregateError(
                            [rootError, ...cleanupErrors],
                            'portable export workout revision exercise source and nested cleanup both failed',
                          ),
                    )
                  }
                  if (cleanupErrors.length === 1) throw cleanupErrors[0]
                  if (cleanupErrors.length > 1) {
                    throw new AggregateError(
                      cleanupErrors,
                      'portable export workout revision exercise nested cleanup failed',
                    )
                  }
                }
              }
            })()
            activeExerciseIterator = exerciseIterator
            return exerciseIterator
          },
        }

        const history: AsyncIterable<Record<string, unknown>> = {
          [Symbol.asyncIterator]: () => {
            if (!jsonFieldOrder && (!exercisesStarted || !exercisesCompleted)) {
              return (async function* () {
                throw await failLayer(
                  new Error(
                    'portable export workout revision headers must be read after exercises complete',
                  ),
                )
              })()
            }
            if (historyStarted) {
              return (async function* () {
                throw await failLayer(
                  new Error('portable export workout revision headers must be read once in order'),
                )
              })()
            }
            historyStarted = true
            const historySourceIterator = (
              includeRevisionSnapshots
                ? workoutRevisionSnapshotHeaderPageRows
                : workoutRevisionHeaderPageRows
            )(
              client,
              userId,
              workoutId,
              batchRows,
              maximumPayloadBytes,
              workoutRevisionStats,
              options.signal,
            )[Symbol.asyncIterator]()
            let historyIterator!: AsyncGenerator<Record<string, unknown>, void, undefined>
            historyIterator = (async function* () {
              let historySourceError: unknown
              try {
                while (true) {
                  const nextHistory = await historySourceIterator.next()
                  if (nextHistory.done) {
                    historyCompleted = true
                    return
                  }
                  const revisionHeader = nextHistory.value
                  if (!includeRevisionSnapshots) {
                    yield revisionHeader
                    continue
                  }
                  const revisionId = revisionHeader.id
                  if (typeof revisionId !== 'string' || revisionId.length === 0) {
                    throw new Error(
                      'portable export workout revision snapshot layer returned an invalid revision',
                    )
                  }
                  const node = await createWorkoutRevisionSnapshotValueNode(
                    client,
                    userId,
                    workoutId,
                    revisionId,
                    batchRows,
                    maximumPayloadBytes,
                    workoutRevisionSnapshotRootStats,
                    workoutRevisionSnapshotExerciseStats,
                    workoutRevisionSnapshotSetStats,
                    async (error) => {
                      if (activeHistoryIterator === historyIterator) {
                        activeHistoryIterator = undefined
                      }
                      return failLayer(error)
                    },
                    () => finalized,
                    options.signal,
                  )
                  activeSnapshotCleanup = node.cleanup
                  revisionHeader.snapshot = node.value
                  yield revisionHeader
                  if (!node.completed()) {
                    throw new Error(
                      'portable export workout revision snapshot must complete before the next revision',
                    )
                  }
                  activeSnapshotCleanup = undefined
                }
              } catch (error) {
                historySourceError = error
                throw error
              } finally {
                if (activeHistoryIterator === historyIterator) activeHistoryIterator = undefined
                if (!historyCompleted) {
                  const cleanupErrors: unknown[] = []
                  try {
                    await activeSnapshotCleanup?.()
                  } catch (error) {
                    cleanupErrors.push(error)
                  } finally {
                    activeSnapshotCleanup = undefined
                  }
                  try {
                    await historySourceIterator.return?.(undefined)
                  } catch (error) {
                    cleanupErrors.push(error)
                  }
                  if (!finalized) {
                    const rootError =
                      historySourceError ??
                      new Error('portable export workout revision headers did not complete')
                    throw await failLayer(
                      cleanupErrors.length === 0
                        ? rootError
                        : new AggregateError(
                            [rootError, ...cleanupErrors],
                            'portable export workout revision header source and cleanup both failed',
                          ),
                    )
                  }
                  if (cleanupErrors.length === 1) throw cleanupErrors[0]
                  if (cleanupErrors.length > 1) {
                    throw new AggregateError(
                      cleanupErrors,
                      'portable export workout revision snapshot history cleanup failed',
                    )
                  }
                }
              }
            })()
            activeHistoryIterator = historyIterator
            return historyIterator
          },
        }

        yield {
          kind: 'workout',
          value: { header: workoutHeader, exercises, history } as
            | PortableExportWorkoutRevisionHeaderLayerSnapshotWorkout
            | PortableExportWorkoutRevisionSnapshotLayerWorkout,
        }
        if (!exercisesStarted || !exercisesCompleted) {
          throw new Error(
            'portable export workout revision header layer exercises must complete before history',
          )
        }
        if (!historyStarted || !historyCompleted) {
          throw new Error(
            'portable export workout revision headers must complete before the next workout',
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
      await activeSnapshotCleanup?.()
    } catch (error) {
      cleanupErrors.push(error)
    } finally {
      activeSnapshotCleanup = undefined
    }
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
      await activeHistoryIterator?.return?.(undefined)
    } catch (error) {
      cleanupErrors.push(error)
    } finally {
      activeHistoryIterator = undefined
    }
    try {
      await transactionIterator.return?.(undefined)
    } catch (error) {
      cleanupErrors.push(error)
    }
    const layerError =
      cleanupErrors.length === 0
        ? rootError
        : new AggregateError(
            [rootError, ...cleanupErrors],
            'portable export workout revision header layer and nested cleanup both failed',
          )
    finalizedError = context.failRoot ? await context.failRoot(layerError) : layerError
    rejectReceipt(finalizedError)
    return finalizedError
  }
  failLayer = fail

  const workouts: AsyncIterable<PortableExportWorkoutRevisionHeaderLayerSnapshotWorkout> = {
    [Symbol.asyncIterator]: () =>
      (async function* () {
        if (workoutsStarted) {
          throw await fail(
            new Error('portable export workout revision header layer must be read once in order'),
          )
        }
        workoutsStarted = true
        try {
          while (true) {
            const next = await transactionIterator.next()
            if (next.done) {
              throw new Error(
                'portable export workout revision header layer ended before its boundary',
              )
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
            await fail(new Error('portable export workout revision header layer did not complete'))
          }
        }
      })(),
  }

  const complete = async () => {
    if (finalized || !workoutsStarted || !workoutsReachedBoundary) {
      throw await fail(
        new Error(
          'portable export workout revision header layer cannot commit before it completes',
        ),
      )
    }
    try {
      const next = await transactionIterator.next()
      if (!next.done) {
        throw new Error(
          'portable export workout revision header layer returned data after boundary',
        )
      }
      finalized = true
      const baseReceipt: PortableExportWorkoutRevisionHeaderLayerSnapshotReceipt = {
        batchRows,
        maximumPayloadBytes,
        workoutHeaders: { ...workoutHeaderStats },
        workoutExercises: { ...workoutExerciseStats },
        workoutSets: { ...workoutSetStats },
        workoutRevisions: { ...workoutRevisionStats },
      }
      resolveReceipt(
        includeRevisionSnapshots
          ? {
              ...baseReceipt,
              workoutRevisionSnapshotRoots: { ...workoutRevisionSnapshotRootStats },
              workoutRevisionSnapshotExercises: { ...workoutRevisionSnapshotExerciseStats },
              workoutRevisionSnapshotSets: { ...workoutRevisionSnapshotSetStats },
            }
          : baseReceipt,
      )
    } catch (error) {
      throw await fail(error)
    }
  }

  const cancel = async (error: unknown) => {
    const rootError =
      error ?? new Error('portable export workout revision header layer was cancelled')
    const finalError = await fail(rootError)
    if (finalError !== rootError) throw finalError
  }

  return { workouts, receipt, complete, cancel } as
    | PortableExportWorkoutRevisionHeaderLayerSnapshotSession
    | PortableExportWorkoutRevisionSnapshotLayerSession
}

type NutritionMealLayerSnapshotItem =
  | {
      kind: 'meal'
      value: PortableExportNutritionMealLayerSnapshotMeal
    }
  | {
      kind: 'boundary'
    }

const createNutritionMealLayerSnapshotSession = (
  database: DatabaseService,
  userId: string,
  options: PortableExportDatabaseSnapshotOptions,
): PortableExportNutritionMealLayerSnapshotSession => {
  const batchRows = validateBatchRows(options.batchRows ?? portableExportSnapshotDefaultBatchRows)
  const maximumPayloadBytes = validateMaximumPayloadBytes(
    options.maximumPayloadBytes ?? portableExportSnapshotMaximumPayloadBytes,
  )
  const mealStats: MutableSnapshotStats = { batchCount: 0, rowCount: 0 }
  const mealItemStats: MutableSnapshotStats = { batchCount: 0, rowCount: 0 }
  const mealRevisionStats: MutableSnapshotStats = { batchCount: 0, rowCount: 0 }
  const mealRevisionSnapshotRootStats: MutableSnapshotStats = { batchCount: 0, rowCount: 0 }
  const mealRevisionSnapshotItemStats: MutableSnapshotStats = { batchCount: 0, rowCount: 0 }
  let resolveReceipt!: (receipt: PortableExportNutritionMealLayerSnapshotReceipt) => void
  let rejectReceipt!: (error: unknown) => void
  const receipt = new Promise<PortableExportNutritionMealLayerSnapshotReceipt>(
    (resolve, reject) => {
      resolveReceipt = resolve
      rejectReceipt = reject
    },
  )
  let finalized = false
  let finalizedError: unknown
  let mealsStarted = false
  let mealsReachedBoundary = false
  let activeMealItemIterator: AsyncIterator<Record<string, unknown>, void, undefined> | undefined
  let activeHistoryIterator:
    AsyncIterator<PortableExportNutritionMealRevision, void, undefined> | undefined
  let activeSnapshotItemIterator:
    AsyncIterator<Record<string, unknown>, void, undefined> | undefined
  let transactionIterator: AsyncIterator<NutritionMealLayerSnapshotItem, void, undefined>
  let failLayer!: (rootError: unknown) => Promise<unknown>

  const transactionItems = database.streamReadOnlyRepeatableRead(
    async function* (client): AsyncGenerator<NutritionMealLayerSnapshotItem> {
      throwIfAborted(options.signal)
      await assertActiveAccount(client, userId)

      for await (const header of nutritionMealHeaderPageRows(
        client,
        userId,
        batchRows,
        maximumPayloadBytes,
        mealStats,
        options.signal,
      )) {
        const mealId = header.id
        if (
          typeof mealId !== 'string' ||
          mealId.length === 0 ||
          !Array.isArray(header.items) ||
          header.items.length !== 0 ||
          !Array.isArray(header.history) ||
          header.history.length !== 0
        ) {
          throw new Error('portable export nutrition meal layer returned an invalid meal')
        }

        let itemsStarted = false
        let itemsCompleted = false
        const items: AsyncIterable<Record<string, unknown>> = {
          [Symbol.asyncIterator]: () => {
            if (itemsStarted) {
              return (async function* () {
                throw await failLayer(
                  new Error(
                    'portable export nutrition meal items must be read once before history',
                  ),
                )
              })()
            }
            itemsStarted = true
            const sourceIterator = nutritionMealItemPageRows(
              client,
              userId,
              mealId,
              batchRows,
              maximumPayloadBytes,
              mealItemStats,
              options.signal,
            )[Symbol.asyncIterator]()
            let iterator!: AsyncGenerator<Record<string, unknown>, void, undefined>
            iterator = (async function* () {
              let sourceError: unknown
              try {
                while (true) {
                  const next = await sourceIterator.next()
                  if (next.done) {
                    itemsCompleted = true
                    return
                  }
                  yield next.value
                }
              } catch (error) {
                sourceError = error
                throw error
              } finally {
                if (activeMealItemIterator === iterator) activeMealItemIterator = undefined
                if (!itemsCompleted) {
                  let cleanupError: unknown
                  try {
                    await sourceIterator.return?.(undefined)
                  } catch (error) {
                    cleanupError = error
                  }
                  if (!finalized) {
                    const rootError =
                      sourceError ??
                      new Error('portable export nutrition meal items did not complete')
                    throw await failLayer(
                      cleanupError === undefined
                        ? rootError
                        : new AggregateError(
                            [rootError, cleanupError],
                            'portable export nutrition meal item source and cleanup both failed',
                          ),
                    )
                  }
                  if (cleanupError !== undefined) throw cleanupError
                }
              }
            })()
            activeMealItemIterator = iterator
            return iterator
          },
        }

        let historyStarted = false
        let historyCompleted = false
        let suppressSnapshotRootFailure = false
        const history: AsyncIterable<PortableExportNutritionMealRevision> = {
          [Symbol.asyncIterator]: () => {
            if (!itemsStarted || !itemsCompleted) {
              return (async function* () {
                throw await failLayer(
                  new Error('portable export nutrition meal items must complete before history'),
                )
              })()
            }
            if (historyStarted) {
              return (async function* () {
                throw await failLayer(
                  new Error(
                    'portable export nutrition meal history must be read once before the next meal',
                  ),
                )
              })()
            }
            historyStarted = true
            const historySourceIterator = nutritionMealRevisionHeaderPageRows(
              client,
              userId,
              mealId,
              batchRows,
              maximumPayloadBytes,
              mealRevisionStats,
              options.signal,
            )[Symbol.asyncIterator]()
            let historyIterator!: AsyncGenerator<
              PortableExportNutritionMealRevision,
              void,
              undefined
            >
            historyIterator = (async function* () {
              let historySourceError: unknown
              try {
                while (true) {
                  const nextRevision = await historySourceIterator.next()
                  if (nextRevision.done) {
                    historyCompleted = true
                    return
                  }
                  const revisionHeader = nextRevision.value
                  const revisionId = revisionHeader.id
                  if (
                    typeof revisionId !== 'string' ||
                    revisionId.length === 0 ||
                    revisionHeader.snapshot !== null
                  ) {
                    throw new Error(
                      'portable export nutrition meal layer returned an invalid revision',
                    )
                  }
                  const snapshotRoot = await readNutritionMealRevisionSnapshotRoot(
                    client,
                    userId,
                    mealId,
                    revisionId,
                    maximumPayloadBytes,
                    mealRevisionSnapshotRootStats,
                    options.signal,
                  )
                  let snapshotItemsStarted = false
                  let snapshotItemsCompleted = false
                  const snapshotItems: AsyncIterable<Record<string, unknown>> = {
                    [Symbol.asyncIterator]: () => {
                      if (snapshotItemsStarted) {
                        return (async function* () {
                          throw await failLayer(
                            new Error(
                              'portable export nutrition meal revision snapshot items must be read once before the next revision',
                            ),
                          )
                        })()
                      }
                      snapshotItemsStarted = true
                      const snapshotItemSourceIterator = nutritionMealRevisionSnapshotItemPageRows(
                        client,
                        userId,
                        mealId,
                        revisionId,
                        batchRows,
                        maximumPayloadBytes,
                        mealRevisionSnapshotItemStats,
                        options.signal,
                      )[Symbol.asyncIterator]()
                      let snapshotItemIterator!: AsyncGenerator<
                        Record<string, unknown>,
                        void,
                        undefined
                      >
                      snapshotItemIterator = (async function* () {
                        let snapshotItemSourceError: unknown
                        try {
                          while (true) {
                            const nextItem = await snapshotItemSourceIterator.next()
                            if (nextItem.done) {
                              snapshotItemsCompleted = true
                              return
                            }
                            yield nextItem.value
                          }
                        } catch (error) {
                          snapshotItemSourceError = error
                          throw error
                        } finally {
                          if (activeSnapshotItemIterator === snapshotItemIterator) {
                            activeSnapshotItemIterator = undefined
                          }
                          if (!snapshotItemsCompleted) {
                            let cleanupError: unknown
                            try {
                              await snapshotItemSourceIterator.return?.(undefined)
                            } catch (error) {
                              cleanupError = error
                            }
                            if (!finalized && !suppressSnapshotRootFailure) {
                              const rootError =
                                snapshotItemSourceError ??
                                new Error(
                                  'portable export nutrition meal revision snapshot items did not complete',
                                )
                              throw await failLayer(
                                cleanupError === undefined
                                  ? rootError
                                  : new AggregateError(
                                      [rootError, cleanupError],
                                      'portable export nutrition meal revision snapshot item source and cleanup both failed',
                                    ),
                              )
                            }
                            if (cleanupError !== undefined) throw cleanupError
                          }
                        }
                      })()
                      activeSnapshotItemIterator = snapshotItemIterator
                      return snapshotItemIterator
                    },
                  }
                  snapshotRoot.items = snapshotItems
                  yield {
                    ...revisionHeader,
                    snapshot: snapshotRoot as PortableExportNutritionMealRevisionSnapshotValue,
                  }
                  if (!snapshotItemsStarted || !snapshotItemsCompleted) {
                    throw new Error(
                      'portable export nutrition meal revision snapshot items must complete before the next revision',
                    )
                  }
                }
              } catch (error) {
                historySourceError = error
                throw error
              } finally {
                if (activeHistoryIterator === historyIterator) activeHistoryIterator = undefined
                if (!historyCompleted) {
                  suppressSnapshotRootFailure = true
                  const cleanupErrors: unknown[] = []
                  try {
                    await activeSnapshotItemIterator?.return?.(undefined)
                  } catch (error) {
                    cleanupErrors.push(error)
                  } finally {
                    activeSnapshotItemIterator = undefined
                  }
                  try {
                    await historySourceIterator.return?.(undefined)
                  } catch (error) {
                    cleanupErrors.push(error)
                  } finally {
                    suppressSnapshotRootFailure = false
                  }
                  if (!finalized) {
                    const rootError =
                      historySourceError ??
                      new Error('portable export nutrition meal history did not complete')
                    throw await failLayer(
                      cleanupErrors.length === 0
                        ? rootError
                        : new AggregateError(
                            [rootError, ...cleanupErrors],
                            'portable export nutrition meal history and nested cleanup both failed',
                          ),
                    )
                  }
                  if (cleanupErrors.length === 1) throw cleanupErrors[0]
                  if (cleanupErrors.length > 1) {
                    throw new AggregateError(
                      cleanupErrors,
                      'portable export nutrition meal history cleanup failed',
                    )
                  }
                }
              }
            })()
            activeHistoryIterator = historyIterator
            return historyIterator
          },
        }

        yield { kind: 'meal', value: { header, items, history } }
        if (!itemsStarted || !itemsCompleted) {
          throw new Error('portable export nutrition meal items must complete before history')
        }
        if (!historyStarted || !historyCompleted) {
          throw new Error(
            'portable export nutrition meal history must complete before the next meal',
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
      await activeSnapshotItemIterator?.return?.(undefined)
    } catch (error) {
      cleanupErrors.push(error)
    } finally {
      activeSnapshotItemIterator = undefined
    }
    try {
      await activeHistoryIterator?.return?.(undefined)
    } catch (error) {
      cleanupErrors.push(error)
    } finally {
      activeHistoryIterator = undefined
    }
    try {
      await activeMealItemIterator?.return?.(undefined)
    } catch (error) {
      cleanupErrors.push(error)
    } finally {
      activeMealItemIterator = undefined
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
            'portable export nutrition meal layer and nested cleanup both failed',
          )
    rejectReceipt(finalizedError)
    return finalizedError
  }
  failLayer = fail

  const meals: AsyncIterable<PortableExportNutritionMealLayerSnapshotMeal> = {
    [Symbol.asyncIterator]: () =>
      (async function* () {
        if (mealsStarted) {
          throw await fail(new Error('portable export nutrition meal layer must be read once'))
        }
        mealsStarted = true
        try {
          while (true) {
            const next = await transactionIterator.next()
            if (next.done) {
              throw new Error('portable export nutrition meal layer ended before its boundary')
            }
            if (next.value.kind === 'boundary') {
              mealsReachedBoundary = true
              return
            }
            yield next.value.value
          }
        } catch (error) {
          throw await fail(error)
        } finally {
          if (!mealsReachedBoundary && !finalized) {
            await fail(new Error('portable export nutrition meal layer did not complete'))
          }
        }
      })(),
  }

  const complete = async () => {
    if (finalized || !mealsStarted || !mealsReachedBoundary) {
      throw await fail(
        new Error('portable export nutrition meal layer cannot commit before it completes'),
      )
    }
    try {
      const next = await transactionIterator.next()
      if (!next.done) {
        throw new Error('portable export nutrition meal layer returned data after its boundary')
      }
      finalized = true
      resolveReceipt({
        batchRows,
        maximumPayloadBytes,
        meals: { ...mealStats },
        mealItems: { ...mealItemStats },
        mealRevisions: { ...mealRevisionStats },
        mealRevisionSnapshotRoots: { ...mealRevisionSnapshotRootStats },
        mealRevisionSnapshotItems: { ...mealRevisionSnapshotItemStats },
      })
    } catch (error) {
      throw await fail(error)
    }
  }

  const cancel = async (error: unknown) => {
    const rootError = error ?? new Error('portable export nutrition meal layer was cancelled')
    const finalError = await fail(rootError)
    if (finalError !== rootError) throw finalError
  }

  return { meals, receipt, complete, cancel }
}

type CoordinatedWorkoutSnapshotStats = {
  exercises: MutableSnapshotStats
  sets: MutableSnapshotStats
  revisions: MutableSnapshotStats
  revisionSnapshotRoots: MutableSnapshotStats
  revisionSnapshotExercises: MutableSnapshotStats
  revisionSnapshotSets: MutableSnapshotStats
}

async function* coordinatedWorkoutJsonRows(
  client: PoolClient,
  userId: string,
  batchRows: number,
  maximumPayloadBytes: number,
  workoutStats: MutableSnapshotStats,
  nestedStats: CoordinatedWorkoutSnapshotStats,
  signal?: AbortSignal,
  failRoot?: (error: unknown) => Promise<unknown>,
): AsyncGenerator<Record<string, unknown>> {
  const existingClientDatabase = {
    streamReadOnlyRepeatableRead: <T>(
      operation: (transactionClient: PoolClient) => AsyncIterable<T>,
    ): AsyncIterable<T> => operation(client),
  } as DatabaseService
  const session = createWorkoutRevisionLayerSnapshotSession(
    existingClientDatabase,
    userId,
    { batchRows, maximumPayloadBytes, signal },
    'json',
    { accountAlreadyValidated: true, failRoot },
  ) as PortableExportWorkoutRevisionSnapshotLayerSession
  const receiptResult = session.receipt.then(
    (receipt) => ({ ok: true as const, receipt }),
    (error: unknown) => ({ ok: false as const, error }),
  )

  for await (const workout of session.workouts) {
    yield workout as unknown as Record<string, unknown>
  }
  await session.complete()
  const result = await receiptResult
  if (!result.ok) throw result.error
  Object.assign(workoutStats, result.receipt.workoutHeaders)
  Object.assign(nestedStats.exercises, result.receipt.workoutExercises)
  Object.assign(nestedStats.sets, result.receipt.workoutSets)
  Object.assign(nestedStats.revisions, result.receipt.workoutRevisions)
  Object.assign(nestedStats.revisionSnapshotRoots, result.receipt.workoutRevisionSnapshotRoots)
  Object.assign(
    nestedStats.revisionSnapshotExercises,
    result.receipt.workoutRevisionSnapshotExercises,
  )
  Object.assign(nestedStats.revisionSnapshotSets, result.receipt.workoutRevisionSnapshotSets)
}

type WorkoutRevisionSnapshotItem =
  | {
      kind: 'snapshot'
      value: PortableExportWorkoutRevisionSnapshotValue
    }
  | {
      kind: 'boundary'
    }

const createWorkoutRevisionSnapshotSession = (
  database: DatabaseService,
  userId: string,
  workoutId: string,
  revisionId: string,
  options: PortableExportDatabaseSnapshotOptions,
): PortableExportWorkoutRevisionSnapshotSession => {
  const batchRows = validateBatchRows(options.batchRows ?? portableExportSnapshotDefaultBatchRows)
  const maximumPayloadBytes = validateMaximumPayloadBytes(
    options.maximumPayloadBytes ?? portableExportSnapshotMaximumPayloadBytes,
  )
  const snapshotRootStats: MutableSnapshotStats = { batchCount: 0, rowCount: 0 }
  const snapshotExerciseStats: MutableSnapshotStats = { batchCount: 0, rowCount: 0 }
  const snapshotSetStats: MutableSnapshotStats = { batchCount: 0, rowCount: 0 }
  let shape: PortableExportWorkoutRevisionSnapshotShapeReceipt | undefined
  let resolveReceipt!: (receipt: PortableExportWorkoutRevisionSnapshotReceipt) => void
  let rejectReceipt!: (error: unknown) => void
  const receipt = new Promise<PortableExportWorkoutRevisionSnapshotReceipt>((resolve, reject) => {
    resolveReceipt = resolve
    rejectReceipt = reject
  })
  let finalized = false
  let finalizedError: unknown
  let snapshotsStarted = false
  let snapshotsReachedBoundary = false
  let activeSnapshotCleanup: (() => Promise<void>) | undefined
  let transactionIterator: AsyncIterator<WorkoutRevisionSnapshotItem, void, undefined>
  let failLayer!: (rootError: unknown) => Promise<unknown>

  const transactionItems = database.streamReadOnlyRepeatableRead(
    async function* (client): AsyncGenerator<WorkoutRevisionSnapshotItem> {
      throwIfAborted(options.signal)
      await assertActiveAccount(client, userId)
      const node = await createWorkoutRevisionSnapshotValueNode(
        client,
        userId,
        workoutId,
        revisionId,
        batchRows,
        maximumPayloadBytes,
        snapshotRootStats,
        snapshotExerciseStats,
        snapshotSetStats,
        (error) => failLayer(error),
        () => finalized,
        options.signal,
      )
      shape = node.shape
      activeSnapshotCleanup = node.cleanup
      yield {
        kind: 'snapshot',
        value: node.value,
      }
      if (!node.completed()) {
        throw new Error('portable export workout revision snapshot exercises must complete')
      }
      activeSnapshotCleanup = undefined
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
      await activeSnapshotCleanup?.()
    } catch (error) {
      cleanupErrors.push(error)
    } finally {
      activeSnapshotCleanup = undefined
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
            'portable export workout revision snapshot and nested cleanup both failed',
          )
    rejectReceipt(finalizedError)
    return finalizedError
  }
  failLayer = fail

  const snapshots: AsyncIterable<PortableExportWorkoutRevisionSnapshotValue> = {
    [Symbol.asyncIterator]: () =>
      (async function* () {
        if (snapshotsStarted) {
          throw await fail(
            new Error('portable export workout revision snapshot must be read once in order'),
          )
        }
        snapshotsStarted = true
        try {
          while (true) {
            const next = await transactionIterator.next()
            if (next.done) {
              throw new Error('portable export workout revision snapshot ended before its boundary')
            }
            if (next.value.kind === 'boundary') {
              snapshotsReachedBoundary = true
              return
            }
            yield next.value.value
          }
        } catch (error) {
          throw await fail(error)
        } finally {
          if (!snapshotsReachedBoundary && !finalized) {
            await fail(new Error('portable export workout revision snapshot did not complete'))
          }
        }
      })(),
  }

  const complete = async () => {
    if (finalized || !snapshotsStarted || !snapshotsReachedBoundary || !shape) {
      throw await fail(
        new Error('portable export workout revision snapshot cannot commit before it completes'),
      )
    }
    try {
      const next = await transactionIterator.next()
      if (!next.done) {
        throw new Error('portable export workout revision snapshot returned data after boundary')
      }
      finalized = true
      resolveReceipt({
        batchRows,
        maximumPayloadBytes,
        shape,
        snapshotRoots: { ...snapshotRootStats },
        snapshotExercises: { ...snapshotExerciseStats },
        snapshotSets: { ...snapshotSetStats },
      })
    } catch (error) {
      throw await fail(error)
    }
  }

  const cancel = async (error: unknown) => {
    const rootError = error ?? new Error('portable export workout revision snapshot was cancelled')
    const finalError = await fail(rootError)
    if (finalError !== rootError) throw finalError
  }

  return { snapshots, receipt, complete, cancel }
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
  let failRoot!: (rootError: unknown) => Promise<unknown>

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
          (error) => failRoot(error),
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
  failRoot = fail

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

const consentHealthExerciseCatalogSnapshotDefinitions = (revisionStats: MutableSnapshotStats) =>
  [
    ...consentHealthSnapshotDefinitions,
    {
      name: 'exerciseCatalog',
      rowFactory: (
        client: PoolClient,
        userId: string,
        batchRows: number,
        maximumPayloadBytes: number,
        entryStats: MutableSnapshotStats,
        signal?: AbortSignal,
        failRoot?: (error: unknown) => Promise<unknown>,
      ) =>
        exerciseCatalogPageRows(
          client,
          userId,
          batchRows,
          maximumPayloadBytes,
          entryStats,
          revisionStats,
          signal,
          failRoot,
        ),
    },
  ] as const

const consentHealthCatalogSnapshotDefinitions = (
  exerciseRevisionStats: MutableSnapshotStats,
  foodRevisionStats: MutableSnapshotStats,
) =>
  [
    ...consentHealthExerciseCatalogSnapshotDefinitions(exerciseRevisionStats),
    {
      name: 'foodCatalog',
      rowFactory: (
        client: PoolClient,
        userId: string,
        batchRows: number,
        maximumPayloadBytes: number,
        entryStats: MutableSnapshotStats,
        signal?: AbortSignal,
        failRoot?: (error: unknown) => Promise<unknown>,
      ) =>
        foodCatalogPageRows(
          client,
          userId,
          batchRows,
          maximumPayloadBytes,
          entryStats,
          foodRevisionStats,
          signal,
          failRoot,
        ),
    },
  ] as const

const consentHealthCatalogWorkoutSnapshotDefinitions = (
  exerciseRevisionStats: MutableSnapshotStats,
  foodRevisionStats: MutableSnapshotStats,
  workoutNestedStats: CoordinatedWorkoutSnapshotStats,
) =>
  [
    ...consentHealthCatalogSnapshotDefinitions(exerciseRevisionStats, foodRevisionStats),
    {
      name: 'workouts',
      rowFactory: (
        client: PoolClient,
        userId: string,
        batchRows: number,
        maximumPayloadBytes: number,
        workoutStats: MutableSnapshotStats,
        signal?: AbortSignal,
        failRoot?: (error: unknown) => Promise<unknown>,
      ) =>
        coordinatedWorkoutJsonRows(
          client,
          userId,
          batchRows,
          maximumPayloadBytes,
          workoutStats,
          workoutNestedStats,
          signal,
          failRoot,
        ),
    },
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

  createWorkoutRevisionHeaderLayerSnapshot(
    userId: string,
    options: PortableExportDatabaseSnapshotOptions = {},
  ): PortableExportWorkoutRevisionHeaderLayerSnapshotSession {
    return createWorkoutRevisionLayerSnapshotSession(
      this.database,
      userId,
      options,
      'headers',
    ) as PortableExportWorkoutRevisionHeaderLayerSnapshotSession
  }

  createWorkoutRevisionSnapshotLayerSnapshot(
    userId: string,
    options: PortableExportDatabaseSnapshotOptions = {},
  ): PortableExportWorkoutRevisionSnapshotLayerSession {
    return createWorkoutRevisionLayerSnapshotSession(
      this.database,
      userId,
      options,
      'snapshots',
    ) as PortableExportWorkoutRevisionSnapshotLayerSession
  }

  createWorkoutRevisionSnapshotJsonLayerSnapshot(
    userId: string,
    options: PortableExportDatabaseSnapshotOptions = {},
  ): PortableExportWorkoutRevisionSnapshotLayerSession {
    return createWorkoutRevisionLayerSnapshotSession(
      this.database,
      userId,
      options,
      'json',
    ) as PortableExportWorkoutRevisionSnapshotLayerSession
  }

  createWorkoutRevisionSnapshot(
    userId: string,
    workoutId: string,
    revisionId: string,
    options: PortableExportDatabaseSnapshotOptions = {},
  ): PortableExportWorkoutRevisionSnapshotSession {
    return createWorkoutRevisionSnapshotSession(
      this.database,
      userId,
      workoutId,
      revisionId,
      options,
    )
  }

  async inspectWorkoutRevisionSnapshotShape(
    userId: string,
    workoutId: string,
    revisionId: string,
  ): Promise<PortableExportWorkoutRevisionSnapshotShapeReceipt> {
    const rows = this.database.streamReadOnlyRepeatableRead(
      async function* (client): AsyncGenerator<PortableExportWorkoutRevisionSnapshotShapeReceipt> {
        await assertActiveAccount(client, userId)
        const result = await client.query<WorkoutRevisionSnapshotShapeRow>(
          portableExportWorkoutRevisionSnapshotShapeQuery,
          [userId, workoutId, revisionId, portableExportSnapshotMaximumPayloadBytes],
        )
        if (result.rows[0]) yield mapWorkoutRevisionSnapshotShape(result.rows[0])
      },
    )
    let receipt: PortableExportWorkoutRevisionSnapshotShapeReceipt | undefined
    for await (const row of rows) {
      if (receipt) throw new Error('workout revision snapshot shape returned multiple rows')
      receipt = row
    }
    if (!receipt) throw new NotFoundException('workout revision snapshot not found')
    return receipt
  }

  async inspectNutritionMealShape(
    userId: string,
    mealId: string,
  ): Promise<PortableExportNutritionMealShapeReceipt> {
    const rows = this.database.streamReadOnlyRepeatableRead(
      async function* (client): AsyncGenerator<PortableExportNutritionMealShapeReceipt> {
        await assertActiveAccount(client, userId)
        const result = await client.query<NutritionMealShapeRow>(
          portableExportNutritionMealShapeQuery,
          [userId, mealId, portableExportSnapshotMaximumPayloadBytes],
        )
        if (result.rows[0]) yield mapNutritionMealShape(result.rows[0])
      },
    )
    let receipt: PortableExportNutritionMealShapeReceipt | undefined
    for await (const row of rows) {
      if (receipt) throw new Error('nutrition meal shape returned multiple rows')
      receipt = row
    }
    if (!receipt) throw new NotFoundException('nutrition meal not found')
    return receipt
  }

  createNutritionMealLayerSnapshot(
    userId: string,
    options: PortableExportDatabaseSnapshotOptions = {},
  ): PortableExportNutritionMealLayerSnapshotSession {
    return createNutritionMealLayerSnapshotSession(this.database, userId, options)
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

  createConsentHealthExerciseCatalogSnapshot(
    userId: string,
    options: PortableExportDatabaseSnapshotOptions = {},
  ): PortableExportConsentHealthExerciseCatalogSnapshotSession {
    const revisionStats: MutableSnapshotStats = { batchCount: 0, rowCount: 0 }
    const session = createCoordinatedSnapshotSession(
      this.database,
      userId,
      options,
      consentHealthExerciseCatalogSnapshotDefinitions(revisionStats),
    )
    const receipt = session.receipt.then((baseReceipt) => ({
      ...baseReceipt,
      exerciseCatalogRevisions: { ...revisionStats },
    }))
    return Object.assign(session, {
      receipt,
    }) as PortableExportConsentHealthExerciseCatalogSnapshotSession
  }

  createConsentHealthCatalogSnapshot(
    userId: string,
    options: PortableExportDatabaseSnapshotOptions = {},
  ): PortableExportConsentHealthCatalogSnapshotSession {
    const exerciseRevisionStats: MutableSnapshotStats = { batchCount: 0, rowCount: 0 }
    const foodRevisionStats: MutableSnapshotStats = { batchCount: 0, rowCount: 0 }
    const session = createCoordinatedSnapshotSession(
      this.database,
      userId,
      options,
      consentHealthCatalogSnapshotDefinitions(exerciseRevisionStats, foodRevisionStats),
    )
    const receipt = session.receipt.then((baseReceipt) => ({
      ...baseReceipt,
      exerciseCatalogRevisions: { ...exerciseRevisionStats },
      foodCatalogRevisions: { ...foodRevisionStats },
    }))
    return Object.assign(session, { receipt }) as PortableExportConsentHealthCatalogSnapshotSession
  }

  createConsentHealthCatalogWorkoutSnapshot(
    userId: string,
    options: PortableExportDatabaseSnapshotOptions = {},
  ): PortableExportConsentHealthCatalogWorkoutSnapshotSession {
    const exerciseRevisionStats: MutableSnapshotStats = { batchCount: 0, rowCount: 0 }
    const foodRevisionStats: MutableSnapshotStats = { batchCount: 0, rowCount: 0 }
    const workoutNestedStats: CoordinatedWorkoutSnapshotStats = {
      exercises: { batchCount: 0, rowCount: 0 },
      sets: { batchCount: 0, rowCount: 0 },
      revisions: { batchCount: 0, rowCount: 0 },
      revisionSnapshotRoots: { batchCount: 0, rowCount: 0 },
      revisionSnapshotExercises: { batchCount: 0, rowCount: 0 },
      revisionSnapshotSets: { batchCount: 0, rowCount: 0 },
    }
    const session = createCoordinatedSnapshotSession(
      this.database,
      userId,
      options,
      consentHealthCatalogWorkoutSnapshotDefinitions(
        exerciseRevisionStats,
        foodRevisionStats,
        workoutNestedStats,
      ),
    )
    const receipt = session.receipt.then((baseReceipt) => ({
      ...baseReceipt,
      exerciseCatalogRevisions: { ...exerciseRevisionStats },
      foodCatalogRevisions: { ...foodRevisionStats },
      workoutExercises: { ...workoutNestedStats.exercises },
      workoutSets: { ...workoutNestedStats.sets },
      workoutRevisions: { ...workoutNestedStats.revisions },
      workoutRevisionSnapshotRoots: { ...workoutNestedStats.revisionSnapshotRoots },
      workoutRevisionSnapshotExercises: { ...workoutNestedStats.revisionSnapshotExercises },
      workoutRevisionSnapshotSets: { ...workoutNestedStats.revisionSnapshotSets },
    }))
    return Object.assign(session, {
      receipt,
    }) as PortableExportConsentHealthCatalogWorkoutSnapshotSession
  }
}
