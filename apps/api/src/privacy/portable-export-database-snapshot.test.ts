import { describe, expect, it } from 'vitest'
import type { PoolClient } from 'pg'

import type { DatabaseService } from '../database/database.service'
import {
  PortableExportDatabaseSnapshotService,
  PortableExportSnapshotPayloadTooLargeError,
  PortableExportWorkoutRevisionSnapshotNotDecomposableError,
  portableExportSnapshotMaximumPayloadBytes,
  portableExportWorkoutRevisionSnapshotExercisePageQuery,
  portableExportWorkoutRevisionSnapshotHeaderPageQuery,
  portableExportWorkoutRevisionSnapshotRootQuery,
  portableExportWorkoutRevisionSnapshotSetPageQuery,
  portableExportWorkoutRevisionSnapshotShapeQuery,
} from './portable-export-database-snapshot'

const fakeDatabase = (values: Array<Record<string, unknown>>) =>
  ({
    streamReadOnlyRepeatableRead: (operation: (client: PoolClient) => AsyncIterable<unknown>) => {
      const client = {
        query: async (sql: string, parameters: unknown[]) => {
          if (sql.startsWith('SELECT id FROM users')) return { rows: [{ id: parameters[0] }] }
          const anchorId = parameters[1] as string | null
          const batchRows = parameters[2] as number
          const maximumPayloadBytes = parameters[3] as number
          const anchorIndex = anchorId ? values.findIndex((value) => value.id === anchorId) : -1
          return {
            rows: values.slice(anchorIndex + 1, anchorIndex + 1 + batchRows).map((payload) => {
              const payloadText = JSON.stringify(payload)
              const payloadByteLength = Buffer.byteLength(payloadText)
              return {
                id: payload.id,
                payload_text: payloadByteLength <= maximumPayloadBytes ? payloadText : null,
                payload_byte_length: payloadByteLength,
              }
            }),
          }
        },
      } as unknown as PoolClient
      return operation(client)
    },
  }) as unknown as DatabaseService

const fakeHealthHistoryDatabase = (
  healthRecords: Array<Record<string, unknown>>,
  healthRecordRevisions: Array<Record<string, unknown>>,
  consentEvents: Array<Record<string, unknown>> = [],
) => {
  const lifecycle = {
    accountQueries: 0,
    streamCount: 0,
    committed: false,
    rolledBack: false,
  }
  const database = {
    streamReadOnlyRepeatableRead: (operation: (client: PoolClient) => AsyncIterable<unknown>) => {
      lifecycle.streamCount += 1
      const client = {
        query: async (sql: string, parameters: unknown[]) => {
          if (sql.startsWith('SELECT id FROM users')) {
            lifecycle.accountQueries += 1
            return { rows: [{ id: parameters[0] }] }
          }
          const values = sql.includes('FROM consent_events')
            ? consentEvents
            : sql.includes('FROM health_record_revisions')
              ? healthRecordRevisions
              : healthRecords
          const anchorId = parameters[1] as string | null
          const batchRows = parameters[2] as number
          const maximumPayloadBytes = parameters[3] as number
          const anchorIndex = anchorId ? values.findIndex((value) => value.id === anchorId) : -1
          return {
            rows: values.slice(anchorIndex + 1, anchorIndex + 1 + batchRows).map((payload) => {
              const payloadText = JSON.stringify(payload)
              const payloadByteLength = Buffer.byteLength(payloadText)
              return {
                id: payload.id,
                payload_text: payloadByteLength <= maximumPayloadBytes ? payloadText : null,
                payload_byte_length: payloadByteLength,
              }
            }),
          }
        },
      } as unknown as PoolClient

      return (async function* () {
        let completed = false
        try {
          for await (const value of operation(client)) yield value
          completed = true
          lifecycle.committed = true
        } finally {
          if (!completed) lifecycle.rolledBack = true
        }
      })()
    },
  } as unknown as DatabaseService
  return { database, lifecycle }
}

const fakeConsentHealthExerciseCatalogDatabase = (
  consentEvents: Array<Record<string, unknown>>,
  healthRecords: Array<Record<string, unknown>>,
  healthRecordRevisions: Array<Record<string, unknown>>,
  exerciseCatalog: Array<Record<string, unknown> & { history: Array<Record<string, unknown>> }>,
) => {
  const lifecycle = {
    accountQueries: 0,
    streamCount: 0,
    queryOrder: [] as string[],
    committed: false,
    rolledBack: false,
  }
  const boundedRows = (values: Array<Record<string, unknown>>, maximumPayloadBytes: number) =>
    values.map((payload) => {
      const payloadText = JSON.stringify(payload)
      const payloadByteLength = Buffer.byteLength(payloadText)
      return {
        id: payload.id,
        payload_text: payloadByteLength <= maximumPayloadBytes ? payloadText : null,
        payload_byte_length: payloadByteLength,
      }
    })
  const pageAfter = (
    values: Array<Record<string, unknown>>,
    anchorId: string | null,
    batchRows: number,
  ) => {
    const anchorIndex = anchorId ? values.findIndex((value) => value.id === anchorId) : -1
    return values.slice(anchorIndex + 1, anchorIndex + 1 + batchRows)
  }
  const database = {
    streamReadOnlyRepeatableRead: (operation: (client: PoolClient) => AsyncIterable<unknown>) => {
      lifecycle.streamCount += 1
      const client = {
        query: async (sql: string, parameters: unknown[]) => {
          if (sql.startsWith('SELECT id FROM users')) {
            lifecycle.accountQueries += 1
            return { rows: [{ id: parameters[0] }] }
          }
          if (sql.includes('FROM user_exercise_catalog_revisions AS history')) {
            lifecycle.queryOrder.push('catalog-history')
            const entry = exerciseCatalog.find((value) => value.id === parameters[1])
            return {
              rows: boundedRows(
                pageAfter(
                  entry?.history ?? [],
                  parameters[2] as string | null,
                  parameters[3] as number,
                ),
                parameters[4] as number,
              ),
            }
          }
          if (sql.includes('FROM user_exercise_catalog_entries AS entry')) {
            lifecycle.queryOrder.push('catalog-entry')
            return {
              rows: boundedRows(
                pageAfter(
                  exerciseCatalog.map(({ history: _history, ...entry }) => ({
                    ...entry,
                    history: [],
                  })),
                  parameters[1] as string | null,
                  parameters[2] as number,
                ),
                parameters[3] as number,
              ),
            }
          }
          const values = sql.includes('FROM consent_events')
            ? consentEvents
            : sql.includes('FROM health_record_revisions')
              ? healthRecordRevisions
              : healthRecords
          lifecycle.queryOrder.push(
            sql.includes('FROM consent_events')
              ? 'consent'
              : sql.includes('FROM health_record_revisions')
                ? 'health-revision'
                : 'health',
          )
          return {
            rows: boundedRows(
              pageAfter(values, parameters[1] as string | null, parameters[2] as number),
              parameters[3] as number,
            ),
          }
        },
      } as unknown as PoolClient

      return (async function* () {
        let completed = false
        try {
          for await (const value of operation(client)) yield value
          completed = true
          lifecycle.committed = true
        } finally {
          if (!completed) lifecycle.rolledBack = true
        }
      })()
    },
  } as unknown as DatabaseService
  return { database, lifecycle }
}

const fakeWorkoutExerciseLayerDatabase = (
  workouts: Array<Record<string, unknown>>,
  exercisesByWorkout: Readonly<Record<string, Array<Record<string, unknown>>>>,
  setsByExercise: Readonly<Record<string, Array<Record<string, unknown>>>> = {},
  revisionsByWorkout: Readonly<Record<string, Array<Record<string, unknown>>>> = {},
  snapshotsByRevision: Readonly<Record<string, Record<string, unknown>>> = {},
) => {
  const lifecycle = {
    accountQueries: 0,
    streamCount: 0,
    committed: false,
    rolledBack: false,
  }
  const database = {
    streamReadOnlyRepeatableRead: (operation: (client: PoolClient) => AsyncIterable<unknown>) => {
      lifecycle.streamCount += 1
      const client = {
        query: async (sql: string, parameters: unknown[]) => {
          if (sql.startsWith('SELECT id FROM users')) {
            lifecycle.accountQueries += 1
            return { rows: [{ id: parameters[0] }] }
          }
          const boundedRows = (
            values: Array<Record<string, unknown>>,
            maximumPayloadBytes: number,
          ) =>
            values.map((payload) => {
              const payloadText = JSON.stringify(payload)
              const payloadByteLength = Buffer.byteLength(payloadText)
              return {
                id: payload.id,
                payload_text: payloadByteLength <= maximumPayloadBytes ? payloadText : null,
                payload_byte_length: payloadByteLength,
              }
            })
          const pageAfter = (
            values: Array<Record<string, unknown>>,
            anchorId: string | null,
            batchRows: number,
          ) => {
            const anchorIndex = anchorId ? values.findIndex((value) => value.id === anchorId) : -1
            return values.slice(anchorIndex + 1, anchorIndex + 1 + batchRows)
          }
          if (sql === portableExportWorkoutRevisionSnapshotShapeQuery) {
            const snapshot = snapshotsByRevision[parameters[2] as string]
            if (!snapshot) return { rows: [] }
            const exercises = snapshot.exercises as Array<Record<string, unknown>>
            const sets = exercises.flatMap(
              (exercise) => exercise.sets as Array<Record<string, unknown>>,
            )
            return {
              rows: [
                {
                  revision: snapshot.revision,
                  compatibility: 'legacy',
                  root_header_bytes: Buffer.byteLength(
                    JSON.stringify({ ...snapshot, exercises: [] }),
                  ),
                  exercise_count: exercises.length,
                  set_count: sets.length,
                  legacy_exercise_count: exercises.length,
                  extended_exercise_count: 0,
                  maximum_exercise_header_bytes: Math.max(
                    0,
                    ...exercises.map((exercise) =>
                      Buffer.byteLength(JSON.stringify({ ...exercise, sets: [] })),
                    ),
                  ),
                  maximum_set_bytes: Math.max(
                    0,
                    ...sets.map((set) => Buffer.byteLength(JSON.stringify(set))),
                  ),
                  exercise_storage_order_matches_position: true,
                  set_storage_order_matches_position: true,
                  decomposable: true,
                },
              ],
            }
          }
          if (sql === portableExportWorkoutRevisionSnapshotRootQuery) {
            const snapshot = snapshotsByRevision[parameters[2] as string]
            return {
              rows: snapshot
                ? boundedRows([{ ...snapshot, exercises: [] }], parameters[3] as number)
                : [],
            }
          }
          if (sql === portableExportWorkoutRevisionSnapshotExercisePageQuery) {
            const snapshot = snapshotsByRevision[parameters[2] as string]
            const exercises = (snapshot?.exercises ?? []) as Array<Record<string, unknown>>
            return {
              rows: boundedRows(
                pageAfter(exercises, parameters[3] as string | null, parameters[4] as number).map(
                  (exercise) => ({ ...exercise, sets: [] }),
                ),
                parameters[5] as number,
              ),
            }
          }
          if (sql === portableExportWorkoutRevisionSnapshotSetPageQuery) {
            const snapshot = snapshotsByRevision[parameters[2] as string]
            const exercises = (snapshot?.exercises ?? []) as Array<Record<string, unknown>>
            const exercise = exercises.find((value) => value.id === parameters[3])
            const sets = (exercise?.sets ?? []) as Array<Record<string, unknown>>
            return {
              rows: boundedRows(
                pageAfter(sets, parameters[4] as string | null, parameters[5] as number),
                parameters[6] as number,
              ),
            }
          }
          const isRevisionPage = sql.includes('FROM workout_revisions AS history')
          const isSetPage = sql.includes('FROM workout_sets AS set_row')
          const isExercisePage = sql.includes('FROM workout_exercises AS exercise')
          const values = isRevisionPage
            ? (revisionsByWorkout[parameters[1] as string] ?? [])
            : isSetPage
              ? (setsByExercise[parameters[2] as string] ?? [])
              : isExercisePage
                ? (exercisesByWorkout[parameters[1] as string] ?? [])
                : workouts
          const anchorId = parameters[isSetPage ? 3 : isRevisionPage || isExercisePage ? 2 : 1] as
            string | null
          const batchRows = parameters[
            isSetPage ? 4 : isRevisionPage || isExercisePage ? 3 : 2
          ] as number
          const maximumPayloadBytes = parameters[
            isSetPage ? 5 : isRevisionPage || isExercisePage ? 4 : 3
          ] as number
          const anchorIndex = anchorId ? values.findIndex((value) => value.id === anchorId) : -1
          return {
            rows: values.slice(anchorIndex + 1, anchorIndex + 1 + batchRows).map((payload) => {
              const encodedPayload =
                sql === portableExportWorkoutRevisionSnapshotHeaderPageQuery
                  ? { ...payload, snapshot: null }
                  : payload
              const payloadText = JSON.stringify(encodedPayload)
              const payloadByteLength = Buffer.byteLength(payloadText)
              return {
                id: payload.id,
                payload_text: payloadByteLength <= maximumPayloadBytes ? payloadText : null,
                payload_byte_length: payloadByteLength,
              }
            }),
          }
        },
      } as unknown as PoolClient

      return (async function* () {
        let completed = false
        try {
          for await (const value of operation(client)) yield value
          completed = true
          lifecycle.committed = true
        } finally {
          if (!completed) lifecycle.rolledBack = true
        }
      })()
    },
  } as unknown as DatabaseService
  return { database, lifecycle }
}

const fakeWorkoutRevisionSnapshotShapeDatabase = (row?: Record<string, unknown>) => {
  const lifecycle = {
    accountQueries: 0,
    shapeQueries: 0,
    committed: false,
    rolledBack: false,
  }
  const database = {
    streamReadOnlyRepeatableRead: (operation: (client: PoolClient) => AsyncIterable<unknown>) => {
      const client = {
        query: async (sql: string, parameters: unknown[]) => {
          if (sql.startsWith('SELECT id FROM users')) {
            lifecycle.accountQueries += 1
            return { rows: [{ id: parameters[0] }] }
          }
          lifecycle.shapeQueries += 1
          return { rows: row ? [row] : [] }
        },
      } as unknown as PoolClient
      return (async function* () {
        let completed = false
        try {
          for await (const value of operation(client)) yield value
          completed = true
          lifecycle.committed = true
        } finally {
          if (!completed) lifecycle.rolledBack = true
        }
      })()
    },
  } as unknown as DatabaseService
  return { database, lifecycle }
}

const fakeWorkoutRevisionSnapshotDatabase = (
  snapshot: Record<string, unknown>,
  decomposable = true,
) => {
  const exercises = snapshot.exercises as Array<Record<string, unknown>>
  const lifecycle = {
    accountQueries: 0,
    streamCount: 0,
    shapeQueries: 0,
    rootQueries: 0,
    exerciseQueries: 0,
    setQueries: 0,
    committed: false,
    rolledBack: false,
  }
  const boundedRows = (values: Array<Record<string, unknown>>, maximumPayloadBytes: number) =>
    values.map((payload) => {
      const payloadText = JSON.stringify(payload)
      const payloadByteLength = Buffer.byteLength(payloadText)
      return {
        id: payload.id,
        payload_text: payloadByteLength <= maximumPayloadBytes ? payloadText : null,
        payload_byte_length: payloadByteLength,
      }
    })
  const pageAfter = (
    values: Array<Record<string, unknown>>,
    anchorId: string | null,
    batchRows: number,
  ) => {
    const anchorIndex = anchorId ? values.findIndex((value) => value.id === anchorId) : -1
    return values.slice(anchorIndex + 1, anchorIndex + 1 + batchRows)
  }
  const database = {
    streamReadOnlyRepeatableRead: (operation: (client: PoolClient) => AsyncIterable<unknown>) => {
      lifecycle.streamCount += 1
      const client = {
        query: async (sql: string, parameters: unknown[]) => {
          if (sql.startsWith('SELECT id FROM users')) {
            lifecycle.accountQueries += 1
            return { rows: [{ id: parameters[0] }] }
          }
          if (sql === portableExportWorkoutRevisionSnapshotShapeQuery) {
            lifecycle.shapeQueries += 1
            const root = { ...snapshot, exercises: [] }
            const setRows = exercises.flatMap(
              (exercise) => exercise.sets as Array<Record<string, unknown>>,
            )
            return {
              rows: [
                {
                  revision: snapshot.revision,
                  compatibility: 'legacy',
                  root_header_bytes: Buffer.byteLength(JSON.stringify(root)),
                  exercise_count: exercises.length,
                  set_count: setRows.length,
                  legacy_exercise_count: exercises.length,
                  extended_exercise_count: 0,
                  maximum_exercise_header_bytes: Math.max(
                    ...exercises.map((exercise) =>
                      Buffer.byteLength(JSON.stringify({ ...exercise, sets: [] })),
                    ),
                  ),
                  maximum_set_bytes: Math.max(
                    ...setRows.map((set) => Buffer.byteLength(JSON.stringify(set))),
                  ),
                  exercise_storage_order_matches_position: false,
                  set_storage_order_matches_position: false,
                  decomposable,
                },
              ],
            }
          }
          if (sql === portableExportWorkoutRevisionSnapshotRootQuery) {
            lifecycle.rootQueries += 1
            return {
              rows: boundedRows([{ ...snapshot, exercises: [] }], parameters[3] as number),
            }
          }
          if (sql === portableExportWorkoutRevisionSnapshotExercisePageQuery) {
            lifecycle.exerciseQueries += 1
            const page = pageAfter(
              exercises,
              parameters[3] as string | null,
              parameters[4] as number,
            ).map((exercise) => ({ ...exercise, sets: [] }))
            return { rows: boundedRows(page, parameters[5] as number) }
          }
          if (sql === portableExportWorkoutRevisionSnapshotSetPageQuery) {
            lifecycle.setQueries += 1
            const exercise = exercises.find((value) => value.id === parameters[3])
            const sets = (exercise?.sets ?? []) as Array<Record<string, unknown>>
            const page = pageAfter(sets, parameters[4] as string | null, parameters[5] as number)
            return { rows: boundedRows(page, parameters[6] as number) }
          }
          throw new Error('unexpected workout revision snapshot query')
        },
      } as unknown as PoolClient
      return (async function* () {
        let completed = false
        try {
          for await (const value of operation(client)) yield value
          completed = true
          lifecycle.committed = true
        } finally {
          if (!completed) lifecycle.rolledBack = true
        }
      })()
    },
  } as unknown as DatabaseService
  return { database, lifecycle }
}

describe('portable export database snapshot session', () => {
  it('publishes a bounded receipt only after every row is consumed', async () => {
    const service = new PortableExportDatabaseSnapshotService(
      fakeDatabase(Array.from({ length: 5 }, (_, index) => ({ id: `record-${index}` }))),
    )
    const session = service.createHealthRecordSnapshot('11111111-1111-4111-8111-111111111111', {
      batchRows: 2,
    })
    let receiptSettled = false
    void session.receipt.finally(() => {
      receiptSettled = true
    })
    const rows: Array<Record<string, unknown>> = []

    for await (const row of session.rows) {
      rows.push(row)
      expect(receiptSettled).toBe(false)
    }

    expect(rows).toHaveLength(5)
    await expect(session.receipt).resolves.toEqual({
      batchRows: 2,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      batchCount: 3,
      rowCount: 5,
    })
  })

  it('applies the shared bounded receipt to health record revisions', async () => {
    const service = new PortableExportDatabaseSnapshotService(
      fakeDatabase([{ id: 'revision-1' }, { id: 'revision-2' }, { id: 'revision-3' }]),
    )
    const session = service.createHealthRecordRevisionSnapshot(
      '11111111-1111-4111-8111-111111111111',
      { batchRows: 2 },
    )
    const rows: Array<Record<string, unknown>> = []

    for await (const row of session.rows) rows.push(row)

    expect(rows.map((row) => row.id)).toEqual(['revision-1', 'revision-2', 'revision-3'])
    await expect(session.receipt).resolves.toEqual({
      batchRows: 2,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      batchCount: 2,
      rowCount: 3,
    })
  })

  it('applies the shared bounded receipt to consent events', async () => {
    const service = new PortableExportDatabaseSnapshotService(
      fakeDatabase([{ id: 'consent-1' }, { id: 'consent-2' }, { id: 'consent-3' }]),
    )
    const session = service.createConsentEventSnapshot('11111111-1111-4111-8111-111111111111', {
      batchRows: 2,
    })
    const rows: Array<Record<string, unknown>> = []

    for await (const row of session.rows) rows.push(row)

    expect(rows.map((row) => row.id)).toEqual(['consent-1', 'consent-2', 'consent-3'])
    await expect(session.receipt).resolves.toEqual({
      batchRows: 2,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      batchCount: 2,
      rowCount: 3,
    })
  })

  it('applies the shared bounded receipt to workout headers', async () => {
    const service = new PortableExportDatabaseSnapshotService(
      fakeDatabase([{ id: 'workout-1' }, { id: 'workout-2' }, { id: 'workout-3' }]),
    )
    const session = service.createWorkoutHeaderSnapshot('11111111-1111-4111-8111-111111111111', {
      batchRows: 2,
    })
    const rows: Array<Record<string, unknown>> = []

    for await (const row of session.rows) rows.push(row)

    expect(rows.map((row) => row.id)).toEqual(['workout-1', 'workout-2', 'workout-3'])
    await expect(session.receipt).resolves.toEqual({
      batchRows: 2,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      batchCount: 2,
      rowCount: 3,
    })
  })

  it('keeps workout headers and their exercise headers in one root-owned stream', async () => {
    const { database, lifecycle } = fakeWorkoutExerciseLayerDatabase(
      [{ id: 'workout-1' }, { id: 'workout-2' }],
      {
        'workout-1': [{ id: 'exercise-1' }, { id: 'exercise-2' }],
        'workout-2': [{ id: 'exercise-3' }],
      },
    )
    const service = new PortableExportDatabaseSnapshotService(database)
    const session = service.createWorkoutExerciseLayerSnapshot(
      '11111111-1111-4111-8111-111111111111',
      { batchRows: 1 },
    )
    const observed: Array<{ workoutId: unknown; exerciseIds: unknown[] }> = []

    for await (const workout of session.workouts) {
      const exerciseIds: unknown[] = []
      for await (const exercise of workout.exercises) exerciseIds.push(exercise.id)
      observed.push({ workoutId: workout.header.id, exerciseIds })
    }
    expect(lifecycle.committed).toBe(false)

    await session.complete()

    expect(observed).toEqual([
      { workoutId: 'workout-1', exerciseIds: ['exercise-1', 'exercise-2'] },
      { workoutId: 'workout-2', exerciseIds: ['exercise-3'] },
    ])
    expect(lifecycle).toMatchObject({
      accountQueries: 1,
      streamCount: 1,
      committed: true,
      rolledBack: false,
    })
    await expect(session.receipt).resolves.toEqual({
      batchRows: 1,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      workoutHeaders: { batchCount: 2, rowCount: 2 },
      workoutExercises: { batchCount: 3, rowCount: 3 },
    })
  })

  it('fails the root transaction when a workout exercise field is skipped', async () => {
    const { database, lifecycle } = fakeWorkoutExerciseLayerDatabase(
      [{ id: 'workout-1' }, { id: 'workout-2' }],
      { 'workout-1': [{ id: 'exercise-1' }], 'workout-2': [] },
    )
    const service = new PortableExportDatabaseSnapshotService(database)
    const session = service.createWorkoutExerciseLayerSnapshot(
      '11111111-1111-4111-8111-111111111111',
    )
    const workouts = session.workouts[Symbol.asyncIterator]()
    await expect(workouts.next()).resolves.toMatchObject({ done: false })
    const receiptFailure = session.receipt.catch((error: unknown) => error)
    let streamFailure: unknown

    try {
      await workouts.next()
    } catch (error) {
      streamFailure = error
    }

    expect(streamFailure).toMatchObject({
      message: 'portable export workout exercises must complete before the next workout',
    })
    expect(await receiptFailure).toBe(streamFailure)
    expect(lifecycle).toMatchObject({ committed: false, rolledBack: true })
  })

  it('closes the root transaction when an active workout exercise field stops early', async () => {
    const { database, lifecycle } = fakeWorkoutExerciseLayerDatabase([{ id: 'workout-1' }], {
      'workout-1': [{ id: 'exercise-1' }, { id: 'exercise-2' }],
    })
    const service = new PortableExportDatabaseSnapshotService(database)
    const session = service.createWorkoutExerciseLayerSnapshot(
      '11111111-1111-4111-8111-111111111111',
      { batchRows: 1 },
    )
    const workouts = session.workouts[Symbol.asyncIterator]()
    const workout = await workouts.next()
    expect(workout).toMatchObject({ done: false })
    if (workout.done) throw new Error('workout fixture was not returned')
    const exercises = workout.value.exercises[Symbol.asyncIterator]()
    await expect(exercises.next()).resolves.toMatchObject({ done: false })
    const receiptFailure = session.receipt.catch((error: unknown) => error)
    let streamFailure: unknown

    try {
      await exercises.return?.()
    } catch (error) {
      streamFailure = error
    }

    expect(streamFailure).toMatchObject({
      message: 'portable export workout exercises did not complete',
    })
    expect(await receiptFailure).toBe(streamFailure)
    expect(lifecycle).toMatchObject({ committed: false, rolledBack: true })
  })

  it('rejects repeated consumption of a completed workout exercise field', async () => {
    const { database, lifecycle } = fakeWorkoutExerciseLayerDatabase([{ id: 'workout-1' }], {
      'workout-1': [{ id: 'exercise-1' }],
    })
    const service = new PortableExportDatabaseSnapshotService(database)
    const session = service.createWorkoutExerciseLayerSnapshot(
      '11111111-1111-4111-8111-111111111111',
    )
    const workouts = session.workouts[Symbol.asyncIterator]()
    const workout = await workouts.next()
    if (workout.done) throw new Error('workout fixture was not returned')
    for await (const _ of workout.value.exercises) {
      // Consume the permitted exercise field once.
    }
    const receiptFailure = session.receipt.catch((error: unknown) => error)
    let repeatedFailure: unknown

    try {
      await workout.value.exercises[Symbol.asyncIterator]().next()
    } catch (error) {
      repeatedFailure = error
    }

    expect(repeatedFailure).toMatchObject({
      message: 'portable export workout exercises must be read once before the next workout',
    })
    expect(await receiptFailure).toBe(repeatedFailure)
    expect(lifecycle).toMatchObject({ committed: false, rolledBack: true })
  })

  it('keeps workout, exercise and set rows in one explicitly committed root stream', async () => {
    const { database, lifecycle } = fakeWorkoutExerciseLayerDatabase(
      [{ id: 'workout-1' }],
      {
        'workout-1': [{ id: 'exercise-1' }, { id: 'exercise-2' }],
      },
      {
        'exercise-1': [{ id: 'set-1' }, { id: 'set-2' }],
        'exercise-2': [{ id: 'set-3' }],
      },
    )
    const service = new PortableExportDatabaseSnapshotService(database)
    const session = service.createWorkoutSetLayerSnapshot('11111111-1111-4111-8111-111111111111', {
      batchRows: 1,
    })
    const observed: Array<{ workoutId: unknown; exercises: unknown[][] }> = []

    for await (const workout of session.workouts) {
      const exercises: unknown[][] = []
      for await (const exercise of workout.exercises) {
        const setIds: unknown[] = []
        for await (const set of exercise.sets) setIds.push(set.id)
        exercises.push([exercise.header.id, ...setIds])
      }
      observed.push({ workoutId: workout.header.id, exercises })
    }
    expect(lifecycle.committed).toBe(false)

    await session.complete()

    expect(observed).toEqual([
      {
        workoutId: 'workout-1',
        exercises: [
          ['exercise-1', 'set-1', 'set-2'],
          ['exercise-2', 'set-3'],
        ],
      },
    ])
    expect(lifecycle).toMatchObject({
      accountQueries: 1,
      streamCount: 1,
      committed: true,
      rolledBack: false,
    })
    await expect(session.receipt).resolves.toEqual({
      batchRows: 1,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      workoutHeaders: { batchCount: 1, rowCount: 1 },
      workoutExercises: { batchCount: 2, rowCount: 2 },
      workoutSets: { batchCount: 3, rowCount: 3 },
    })
  })

  it('fails the set-layer root when its exercise field is skipped', async () => {
    const { database, lifecycle } = fakeWorkoutExerciseLayerDatabase(
      [{ id: 'workout-1' }, { id: 'workout-2' }],
      { 'workout-1': [{ id: 'exercise-1' }], 'workout-2': [] },
      { 'exercise-1': [{ id: 'set-1' }] },
    )
    const service = new PortableExportDatabaseSnapshotService(database)
    const session = service.createWorkoutSetLayerSnapshot('11111111-1111-4111-8111-111111111111')
    const workouts = session.workouts[Symbol.asyncIterator]()
    await expect(workouts.next()).resolves.toMatchObject({ done: false })
    const receiptFailure = session.receipt.catch((error: unknown) => error)
    let streamFailure: unknown

    try {
      await workouts.next()
    } catch (error) {
      streamFailure = error
    }

    expect(streamFailure).toMatchObject({
      message: 'portable export workout set layer exercises must complete before the next workout',
    })
    expect(await receiptFailure).toBe(streamFailure)
    expect(lifecycle).toMatchObject({ committed: false, rolledBack: true })
  })

  it('fails the root when a workout set field is skipped before the next exercise', async () => {
    const { database, lifecycle } = fakeWorkoutExerciseLayerDatabase(
      [{ id: 'workout-1' }],
      { 'workout-1': [{ id: 'exercise-1' }, { id: 'exercise-2' }] },
      { 'exercise-1': [{ id: 'set-1' }], 'exercise-2': [{ id: 'set-2' }] },
    )
    const service = new PortableExportDatabaseSnapshotService(database)
    const session = service.createWorkoutSetLayerSnapshot('11111111-1111-4111-8111-111111111111')
    const workouts = session.workouts[Symbol.asyncIterator]()
    const workout = await workouts.next()
    if (workout.done) throw new Error('workout fixture was not returned')
    const exercises = workout.value.exercises[Symbol.asyncIterator]()
    await expect(exercises.next()).resolves.toMatchObject({ done: false })
    const receiptFailure = session.receipt.catch((error: unknown) => error)
    let streamFailure: unknown

    try {
      await exercises.next()
    } catch (error) {
      streamFailure = error
    }

    expect(streamFailure).toMatchObject({
      message: 'portable export workout sets must complete before the next exercise',
    })
    expect(await receiptFailure).toBe(streamFailure)
    expect(lifecycle).toMatchObject({ committed: false, rolledBack: true })
  })

  it('closes every parent when an active workout set field stops early', async () => {
    const { database, lifecycle } = fakeWorkoutExerciseLayerDatabase(
      [{ id: 'workout-1' }],
      { 'workout-1': [{ id: 'exercise-1' }] },
      { 'exercise-1': [{ id: 'set-1' }, { id: 'set-2' }] },
    )
    const service = new PortableExportDatabaseSnapshotService(database)
    const session = service.createWorkoutSetLayerSnapshot('11111111-1111-4111-8111-111111111111', {
      batchRows: 1,
    })
    const workouts = session.workouts[Symbol.asyncIterator]()
    const workout = await workouts.next()
    if (workout.done) throw new Error('workout fixture was not returned')
    const exercises = workout.value.exercises[Symbol.asyncIterator]()
    const exercise = await exercises.next()
    if (exercise.done) throw new Error('exercise fixture was not returned')
    const sets = exercise.value.sets[Symbol.asyncIterator]()
    await expect(sets.next()).resolves.toMatchObject({ done: false })
    const receiptFailure = session.receipt.catch((error: unknown) => error)
    let streamFailure: unknown

    try {
      await sets.return?.()
    } catch (error) {
      streamFailure = error
    }

    expect(streamFailure).toMatchObject({
      message: 'portable export workout sets did not complete',
    })
    expect(await receiptFailure).toBe(streamFailure)
    expect(lifecycle).toMatchObject({ committed: false, rolledBack: true })
  })

  it('rejects repeated consumption of a completed workout set field', async () => {
    const { database, lifecycle } = fakeWorkoutExerciseLayerDatabase(
      [{ id: 'workout-1' }],
      { 'workout-1': [{ id: 'exercise-1' }] },
      { 'exercise-1': [{ id: 'set-1' }] },
    )
    const service = new PortableExportDatabaseSnapshotService(database)
    const session = service.createWorkoutSetLayerSnapshot('11111111-1111-4111-8111-111111111111')
    const workouts = session.workouts[Symbol.asyncIterator]()
    const workout = await workouts.next()
    if (workout.done) throw new Error('workout fixture was not returned')
    const exercises = workout.value.exercises[Symbol.asyncIterator]()
    const exercise = await exercises.next()
    if (exercise.done) throw new Error('exercise fixture was not returned')
    for await (const _ of exercise.value.sets) {
      // Consume the permitted set field once.
    }
    const receiptFailure = session.receipt.catch((error: unknown) => error)
    let repeatedFailure: unknown

    try {
      await exercise.value.sets[Symbol.asyncIterator]().next()
    } catch (error) {
      repeatedFailure = error
    }

    expect(repeatedFailure).toMatchObject({
      message: 'portable export workout sets must be read once before the next exercise',
    })
    expect(await receiptFailure).toBe(repeatedFailure)
    expect(lifecycle).toMatchObject({ committed: false, rolledBack: true })
  })

  it('closes the active set before cancelling the exercise and workout parents', async () => {
    const { database, lifecycle } = fakeWorkoutExerciseLayerDatabase(
      [{ id: 'workout-1' }],
      { 'workout-1': [{ id: 'exercise-1' }] },
      { 'exercise-1': [{ id: 'set-1' }, { id: 'set-2' }] },
    )
    const service = new PortableExportDatabaseSnapshotService(database)
    const session = service.createWorkoutSetLayerSnapshot('11111111-1111-4111-8111-111111111111', {
      batchRows: 1,
    })
    const workouts = session.workouts[Symbol.asyncIterator]()
    const workout = await workouts.next()
    if (workout.done) throw new Error('workout fixture was not returned')
    const exercises = workout.value.exercises[Symbol.asyncIterator]()
    const exercise = await exercises.next()
    if (exercise.done) throw new Error('exercise fixture was not returned')
    const sets = exercise.value.sets[Symbol.asyncIterator]()
    await expect(sets.next()).resolves.toMatchObject({ done: false })
    const cancellation = new Error('workout set root cancelled by lease owner')
    const receiptFailure = session.receipt.catch((error: unknown) => error)

    await session.cancel(cancellation)

    expect(await receiptFailure).toBe(cancellation)
    await expect(sets.next()).resolves.toEqual({ done: true, value: undefined })
    await expect(exercises.next()).resolves.toEqual({ done: true, value: undefined })
    await expect(workouts.next()).rejects.toBe(cancellation)
    expect(lifecycle).toMatchObject({ committed: false, rolledBack: true })
  })

  it('keeps workout relation rows and ordered revision headers in one committed root stream', async () => {
    const { database, lifecycle } = fakeWorkoutExerciseLayerDatabase(
      [{ id: 'workout-1' }],
      { 'workout-1': [{ id: 'exercise-1' }] },
      { 'exercise-1': [{ id: 'set-1' }] },
      {
        'workout-1': [
          { id: 'revision-1', action: 'created', revision: 1 },
          { id: 'revision-2', action: 'updated', revision: 2 },
        ],
      },
    )
    const service = new PortableExportDatabaseSnapshotService(database)
    const session = service.createWorkoutRevisionHeaderLayerSnapshot(
      '11111111-1111-4111-8111-111111111111',
      { batchRows: 1 },
    )
    const observed: Array<{ workoutId: unknown; setIds: unknown[]; revisionIds: unknown[] }> = []

    for await (const workout of session.workouts) {
      const setIds: unknown[] = []
      for await (const exercise of workout.exercises) {
        for await (const set of exercise.sets) setIds.push(set.id)
      }
      const revisionIds: unknown[] = []
      for await (const revision of workout.history) revisionIds.push(revision.id)
      observed.push({ workoutId: workout.header.id, setIds, revisionIds })
    }
    expect(lifecycle.committed).toBe(false)

    await session.complete()

    expect(observed).toEqual([
      {
        workoutId: 'workout-1',
        setIds: ['set-1'],
        revisionIds: ['revision-1', 'revision-2'],
      },
    ])
    expect(lifecycle).toMatchObject({
      accountQueries: 1,
      streamCount: 1,
      committed: true,
      rolledBack: false,
    })
    await expect(session.receipt).resolves.toEqual({
      batchRows: 1,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      workoutHeaders: { batchCount: 1, rowCount: 1 },
      workoutExercises: { batchCount: 1, rowCount: 1 },
      workoutSets: { batchCount: 1, rowCount: 1 },
      workoutRevisions: { batchCount: 2, rowCount: 2 },
    })
  })

  it('rejects workout revision headers before the relation graph completes', async () => {
    const { database, lifecycle } = fakeWorkoutExerciseLayerDatabase(
      [{ id: 'workout-1' }],
      { 'workout-1': [{ id: 'exercise-1' }] },
      { 'exercise-1': [{ id: 'set-1' }] },
      { 'workout-1': [{ id: 'revision-1' }] },
    )
    const service = new PortableExportDatabaseSnapshotService(database)
    const session = service.createWorkoutRevisionHeaderLayerSnapshot(
      '11111111-1111-4111-8111-111111111111',
    )
    const workouts = session.workouts[Symbol.asyncIterator]()
    const workout = await workouts.next()
    if (workout.done) throw new Error('workout fixture was not returned')
    const receiptFailure = session.receipt.catch((error: unknown) => error)
    let historyFailure: unknown

    try {
      await workout.value.history[Symbol.asyncIterator]().next()
    } catch (error) {
      historyFailure = error
    }

    expect(historyFailure).toMatchObject({
      message: 'portable export workout revision headers must be read after exercises complete',
    })
    expect(await receiptFailure).toBe(historyFailure)
    expect(lifecycle).toMatchObject({ committed: false, rolledBack: true })
  })

  it('fails the root when workout revision headers are skipped before the next workout', async () => {
    const { database, lifecycle } = fakeWorkoutExerciseLayerDatabase(
      [{ id: 'workout-1' }, { id: 'workout-2' }],
      { 'workout-1': [], 'workout-2': [] },
      {},
      { 'workout-1': [{ id: 'revision-1' }], 'workout-2': [] },
    )
    const service = new PortableExportDatabaseSnapshotService(database)
    const session = service.createWorkoutRevisionHeaderLayerSnapshot(
      '11111111-1111-4111-8111-111111111111',
    )
    const workouts = session.workouts[Symbol.asyncIterator]()
    const workout = await workouts.next()
    if (workout.done) throw new Error('workout fixture was not returned')
    for await (const _ of workout.value.exercises) {
      // The empty relation field must still reach physical EOF.
    }
    const receiptFailure = session.receipt.catch((error: unknown) => error)
    let streamFailure: unknown

    try {
      await workouts.next()
    } catch (error) {
      streamFailure = error
    }

    expect(streamFailure).toMatchObject({
      message: 'portable export workout revision headers must complete before the next workout',
    })
    expect(await receiptFailure).toBe(streamFailure)
    expect(lifecycle).toMatchObject({ committed: false, rolledBack: true })
  })

  it('closes the root when an active workout revision header field stops early', async () => {
    const { database, lifecycle } = fakeWorkoutExerciseLayerDatabase(
      [{ id: 'workout-1' }],
      { 'workout-1': [] },
      {},
      { 'workout-1': [{ id: 'revision-1' }, { id: 'revision-2' }] },
    )
    const service = new PortableExportDatabaseSnapshotService(database)
    const session = service.createWorkoutRevisionHeaderLayerSnapshot(
      '11111111-1111-4111-8111-111111111111',
      { batchRows: 1 },
    )
    const workouts = session.workouts[Symbol.asyncIterator]()
    const workout = await workouts.next()
    if (workout.done) throw new Error('workout fixture was not returned')
    for await (const _ of workout.value.exercises) {
      // Reach the required sibling boundary.
    }
    const history = workout.value.history[Symbol.asyncIterator]()
    await expect(history.next()).resolves.toMatchObject({ done: false })
    const receiptFailure = session.receipt.catch((error: unknown) => error)
    let streamFailure: unknown

    try {
      await history.return?.()
    } catch (error) {
      streamFailure = error
    }

    expect(streamFailure).toMatchObject({
      message: 'portable export workout revision headers did not complete',
    })
    expect(await receiptFailure).toBe(streamFailure)
    expect(lifecycle).toMatchObject({ committed: false, rolledBack: true })
  })

  it('rejects repeated consumption of completed workout revision headers', async () => {
    const { database, lifecycle } = fakeWorkoutExerciseLayerDatabase(
      [{ id: 'workout-1' }],
      { 'workout-1': [] },
      {},
      { 'workout-1': [{ id: 'revision-1' }] },
    )
    const service = new PortableExportDatabaseSnapshotService(database)
    const session = service.createWorkoutRevisionHeaderLayerSnapshot(
      '11111111-1111-4111-8111-111111111111',
    )
    const workouts = session.workouts[Symbol.asyncIterator]()
    const workout = await workouts.next()
    if (workout.done) throw new Error('workout fixture was not returned')
    for await (const _ of workout.value.exercises) {
      // Reach the required sibling boundary.
    }
    for await (const _ of workout.value.history) {
      // Consume the permitted history field once.
    }
    const receiptFailure = session.receipt.catch((error: unknown) => error)
    let repeatedFailure: unknown

    try {
      await workout.value.history[Symbol.asyncIterator]().next()
    } catch (error) {
      repeatedFailure = error
    }

    expect(repeatedFailure).toMatchObject({
      message: 'portable export workout revision headers must be read once in order',
    })
    expect(await receiptFailure).toBe(repeatedFailure)
    expect(lifecycle).toMatchObject({ committed: false, rolledBack: true })
  })

  it('cancels an active workout revision header before the workout root', async () => {
    const { database, lifecycle } = fakeWorkoutExerciseLayerDatabase(
      [{ id: 'workout-1' }],
      { 'workout-1': [] },
      {},
      { 'workout-1': [{ id: 'revision-1' }, { id: 'revision-2' }] },
    )
    const service = new PortableExportDatabaseSnapshotService(database)
    const session = service.createWorkoutRevisionHeaderLayerSnapshot(
      '11111111-1111-4111-8111-111111111111',
      { batchRows: 1 },
    )
    const workouts = session.workouts[Symbol.asyncIterator]()
    const workout = await workouts.next()
    if (workout.done) throw new Error('workout fixture was not returned')
    for await (const _ of workout.value.exercises) {
      // Reach the required sibling boundary.
    }
    const history = workout.value.history[Symbol.asyncIterator]()
    await expect(history.next()).resolves.toMatchObject({ done: false })
    const cancellation = new Error('workout revision root cancelled by lease owner')
    const receiptFailure = session.receipt.catch((error: unknown) => error)

    await session.cancel(cancellation)

    expect(await receiptFailure).toBe(cancellation)
    await expect(history.next()).resolves.toEqual({ done: true, value: undefined })
    await expect(workouts.next()).rejects.toBe(cancellation)
    expect(lifecycle).toMatchObject({ committed: false, rolledBack: true })
  })

  it('streams current workout relations and complete revision snapshots in one transaction', async () => {
    const revisionId1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    const revisionId2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
    const snapshot1 = {
      id: 'workout-1',
      revision: 1,
      title: '第一版',
      exercises: [
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
          position: 2,
          sets: [{ id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', position: 2, reps: 8 }],
        },
      ],
    }
    const snapshot2 = {
      id: 'workout-1',
      revision: 2,
      title: '第二版',
      exercises: [
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
          position: 1,
          sets: [{ id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2', position: 1, reps: 10 }],
        },
      ],
    }
    const revisions = [
      {
        id: revisionId1,
        action: 'created',
        revision: 1,
        snapshot: null,
        changed_at: '2026-08-11T08:00:00.000Z',
      },
      {
        id: revisionId2,
        action: 'updated',
        revision: 2,
        snapshot: null,
        changed_at: '2026-08-11T09:00:00.000Z',
      },
    ]
    const { database, lifecycle } = fakeWorkoutExerciseLayerDatabase(
      [{ id: 'workout-1' }],
      { 'workout-1': [{ id: 'exercise-current' }] },
      { 'exercise-current': [{ id: 'set-current' }] },
      { 'workout-1': revisions },
      { [revisionId1]: snapshot1, [revisionId2]: snapshot2 },
    )
    const service = new PortableExportDatabaseSnapshotService(database)
    const session = service.createWorkoutRevisionSnapshotLayerSnapshot(
      '11111111-1111-4111-8111-111111111111',
      { batchRows: 1 },
    )
    const observedHistory: Array<Record<string, unknown>> = []

    for await (const workout of session.workouts) {
      for await (const exercise of workout.exercises) {
        for await (const _ of exercise.sets) {
          // Consume the current relation graph before history.
        }
      }
      for await (const revision of workout.history) {
        const materializedExercises: Array<Record<string, unknown>> = []
        for await (const exercise of revision.snapshot.exercises) {
          const materializedSets: Array<Record<string, unknown>> = []
          for await (const set of exercise.sets) materializedSets.push(set)
          materializedExercises.push({ ...exercise, sets: materializedSets })
        }
        observedHistory.push({
          ...revision,
          snapshot: { ...revision.snapshot, exercises: materializedExercises },
        })
      }
    }
    expect(lifecycle.committed).toBe(false)

    await session.complete()

    expect(observedHistory).toEqual([
      { ...revisions[0], snapshot: snapshot1 },
      { ...revisions[1], snapshot: snapshot2 },
    ])
    expect(lifecycle).toMatchObject({
      accountQueries: 1,
      streamCount: 1,
      committed: true,
      rolledBack: false,
    })
    await expect(session.receipt).resolves.toEqual({
      batchRows: 1,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      workoutHeaders: { batchCount: 1, rowCount: 1 },
      workoutExercises: { batchCount: 1, rowCount: 1 },
      workoutSets: { batchCount: 1, rowCount: 1 },
      workoutRevisions: { batchCount: 2, rowCount: 2 },
      workoutRevisionSnapshotRoots: { batchCount: 2, rowCount: 2 },
      workoutRevisionSnapshotExercises: { batchCount: 2, rowCount: 2 },
      workoutRevisionSnapshotSets: { batchCount: 2, rowCount: 2 },
    })
  })

  it('requires each revision snapshot to complete before reading the next revision', async () => {
    const revisionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    const snapshot = {
      id: 'workout-1',
      revision: 1,
      exercises: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', sets: [] }],
    }
    const { database, lifecycle } = fakeWorkoutExerciseLayerDatabase(
      [{ id: 'workout-1' }],
      { 'workout-1': [] },
      {},
      {
        'workout-1': [{ id: revisionId, action: 'created', revision: 1, snapshot: null }],
      },
      { [revisionId]: snapshot },
    )
    const session = new PortableExportDatabaseSnapshotService(
      database,
    ).createWorkoutRevisionSnapshotLayerSnapshot('11111111-1111-4111-8111-111111111111')
    const workouts = session.workouts[Symbol.asyncIterator]()
    const workout = await workouts.next()
    if (workout.done) throw new Error('workout fixture was not returned')
    for await (const _ of workout.value.exercises) {
      // Reach the history boundary.
    }
    const history = workout.value.history[Symbol.asyncIterator]()
    await expect(history.next()).resolves.toMatchObject({ done: false })
    const receiptFailure = session.receipt.catch((error: unknown) => error)

    await expect(history.next()).rejects.toMatchObject({
      message: 'portable export workout revision snapshot must complete before the next revision',
    })
    await expect(receiptFailure).resolves.toMatchObject({
      message: 'portable export workout revision snapshot must complete before the next revision',
    })
    expect(lifecycle).toMatchObject({ committed: false, rolledBack: true })
  })

  it('requires JSON-ordered workout history before current relation exercises', async () => {
    const { database, lifecycle } = fakeWorkoutExerciseLayerDatabase([{ id: 'workout-1' }], {
      'workout-1': [{ id: 'exercise-current' }],
    })
    const session = new PortableExportDatabaseSnapshotService(
      database,
    ).createWorkoutRevisionSnapshotJsonLayerSnapshot('11111111-1111-4111-8111-111111111111')
    const workouts = session.workouts[Symbol.asyncIterator]()
    const workout = await workouts.next()
    if (workout.done) throw new Error('workout fixture was not returned')
    const receiptFailure = session.receipt.catch((error: unknown) => error)
    let exerciseFailure: unknown

    try {
      await workout.value.exercises[Symbol.asyncIterator]().next()
    } catch (error) {
      exerciseFailure = error
    }

    expect(exerciseFailure).toMatchObject({
      message: 'portable export workout JSON exercises must be read after history completes',
    })
    expect(await receiptFailure).toBe(exerciseFailure)
    expect(lifecycle).toMatchObject({ committed: false, rolledBack: true })
  })

  it('cancels the deepest revision set before history and workout parents', async () => {
    const revisionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    const snapshot = {
      id: 'workout-1',
      revision: 1,
      exercises: [
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
          sets: [
            { id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1' },
            { id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2' },
          ],
        },
      ],
    }
    const { database, lifecycle } = fakeWorkoutExerciseLayerDatabase(
      [{ id: 'workout-1' }],
      { 'workout-1': [] },
      {},
      { 'workout-1': [{ id: revisionId, revision: 1, snapshot: null }] },
      { [revisionId]: snapshot },
    )
    const session = new PortableExportDatabaseSnapshotService(
      database,
    ).createWorkoutRevisionSnapshotLayerSnapshot('11111111-1111-4111-8111-111111111111', {
      batchRows: 1,
    })
    const workouts = session.workouts[Symbol.asyncIterator]()
    const workout = await workouts.next()
    if (workout.done) throw new Error('workout fixture was not returned')
    for await (const _ of workout.value.exercises) {
      // Reach the history boundary.
    }
    const history = workout.value.history[Symbol.asyncIterator]()
    const revision = await history.next()
    if (revision.done) throw new Error('revision fixture was not returned')
    const exercises = revision.value.snapshot.exercises[Symbol.asyncIterator]()
    const exercise = await exercises.next()
    if (exercise.done) throw new Error('snapshot exercise fixture was not returned')
    const sets = exercise.value.sets[Symbol.asyncIterator]()
    await expect(sets.next()).resolves.toMatchObject({ done: false })
    const cancellation = new Error('combined workout revision snapshot cancelled')
    const receiptFailure = session.receipt.catch((error: unknown) => error)

    await session.cancel(cancellation)

    expect(await receiptFailure).toBe(cancellation)
    await expect(sets.next()).resolves.toEqual({ done: true, value: undefined })
    await expect(exercises.next()).resolves.toEqual({ done: true, value: undefined })
    await expect(history.next()).resolves.toEqual({ done: true, value: undefined })
    await expect(workouts.next()).rejects.toBe(cancellation)
    expect(lifecycle).toMatchObject({ committed: false, rolledBack: true })
  })

  it('cancels an active set before its exercise and workout revision parents', async () => {
    const { database, lifecycle } = fakeWorkoutExerciseLayerDatabase(
      [{ id: 'workout-1' }],
      { 'workout-1': [{ id: 'exercise-1' }] },
      { 'exercise-1': [{ id: 'set-1' }, { id: 'set-2' }] },
      { 'workout-1': [{ id: 'revision-1' }] },
    )
    const service = new PortableExportDatabaseSnapshotService(database)
    const session = service.createWorkoutRevisionHeaderLayerSnapshot(
      '11111111-1111-4111-8111-111111111111',
      { batchRows: 1 },
    )
    const workouts = session.workouts[Symbol.asyncIterator]()
    const workout = await workouts.next()
    if (workout.done) throw new Error('workout fixture was not returned')
    const exercises = workout.value.exercises[Symbol.asyncIterator]()
    const exercise = await exercises.next()
    if (exercise.done) throw new Error('exercise fixture was not returned')
    const sets = exercise.value.sets[Symbol.asyncIterator]()
    await expect(sets.next()).resolves.toMatchObject({ done: false })
    const cancellation = new Error('workout revision set cancelled by lease owner')
    const receiptFailure = session.receipt.catch((error: unknown) => error)

    await session.cancel(cancellation)

    expect(await receiptFailure).toBe(cancellation)
    await expect(sets.next()).resolves.toEqual({ done: true, value: undefined })
    await expect(exercises.next()).resolves.toEqual({ done: true, value: undefined })
    await expect(workouts.next()).rejects.toBe(cancellation)
    expect(lifecycle).toMatchObject({ committed: false, rolledBack: true })
  })

  it('maps a bounded workout revision snapshot shape receipt without identifiers or content', async () => {
    const { database, lifecycle } = fakeWorkoutRevisionSnapshotShapeDatabase({
      revision: 2,
      compatibility: 'mixed',
      root_header_bytes: 512,
      exercise_count: 3,
      set_count: 8,
      legacy_exercise_count: 1,
      extended_exercise_count: 2,
      maximum_exercise_header_bytes: 384,
      maximum_set_bytes: 192,
      exercise_storage_order_matches_position: false,
      set_storage_order_matches_position: true,
      decomposable: true,
    })
    const service = new PortableExportDatabaseSnapshotService(database)

    const receipt = await service.inspectWorkoutRevisionSnapshotShape(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    )

    expect(receipt).toEqual({
      schemaVersion: 'myfitness-portable-export-workout-revision-snapshot-shape/v1',
      revision: 2,
      compatibility: 'mixed',
      rootHeaderBytes: 512,
      exerciseCount: 3,
      setCount: 8,
      legacyExerciseCount: 1,
      extendedExerciseCount: 2,
      maximumExerciseHeaderBytes: 384,
      maximumSetBytes: 192,
      exerciseStorageOrderMatchesPosition: false,
      setStorageOrderMatchesPosition: true,
      decomposable: true,
    })
    expect(receipt).not.toHaveProperty('workoutId')
    expect(receipt).not.toHaveProperty('revisionId')
    expect(lifecycle).toEqual({
      accountQueries: 1,
      shapeQueries: 1,
      committed: true,
      rolledBack: false,
    })
  })

  it('returns one owner-safe not-found result for a missing revision snapshot shape', async () => {
    const { database, lifecycle } = fakeWorkoutRevisionSnapshotShapeDatabase()
    const service = new PortableExportDatabaseSnapshotService(database)

    await expect(
      service.inspectWorkoutRevisionSnapshotShape(
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        '33333333-3333-4333-8333-333333333333',
      ),
    ).rejects.toThrowError('workout revision snapshot not found')
    expect(lifecycle).toEqual({
      accountQueries: 1,
      shapeQueries: 1,
      committed: true,
      rolledBack: false,
    })
  })

  it('rebuilds one revision snapshot in stored JSON array order and commits explicitly', async () => {
    const snapshot = {
      id: '22222222-2222-4222-8222-222222222222',
      userId: '11111111-1111-4111-8111-111111111111',
      title: 'Stored order',
      exercises: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          position: 2,
          name: 'Stored first',
          sets: [
            { id: '55555555-5555-4555-8555-555555555555', position: 2 },
            { id: '66666666-6666-4666-8666-666666666666', position: 1 },
          ],
        },
        {
          id: '44444444-4444-4444-8444-444444444444',
          position: 1,
          name: 'Stored second',
          sets: [{ id: '77777777-7777-4777-8777-777777777777', position: 1 }],
        },
      ],
      revision: 1,
    }
    const { database, lifecycle } = fakeWorkoutRevisionSnapshotDatabase(snapshot)
    const service = new PortableExportDatabaseSnapshotService(database)
    const session = service.createWorkoutRevisionSnapshot(
      snapshot.userId,
      snapshot.id,
      '88888888-8888-4888-8888-888888888888',
      { batchRows: 1 },
    )
    const materialized: Array<Record<string, unknown>> = []

    for await (const revisionSnapshot of session.snapshots) {
      const root = { ...revisionSnapshot, exercises: [] as Array<Record<string, unknown>> }
      for await (const exercise of revisionSnapshot.exercises) {
        const exerciseValue = { ...exercise, sets: [] as Array<Record<string, unknown>> }
        for await (const set of exercise.sets) exerciseValue.sets.push(set)
        root.exercises.push(exerciseValue)
      }
      materialized.push(root)
    }
    expect(lifecycle.committed).toBe(false)

    await session.complete()

    expect(JSON.stringify(materialized[0])).toBe(JSON.stringify(snapshot))
    expect(lifecycle).toMatchObject({
      accountQueries: 1,
      streamCount: 1,
      shapeQueries: 1,
      rootQueries: 1,
      exerciseQueries: 3,
      setQueries: 5,
      committed: true,
      rolledBack: false,
    })
    await expect(session.receipt).resolves.toMatchObject({
      batchRows: 1,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      shape: { decomposable: true, exerciseCount: 2, setCount: 3 },
      snapshotRoots: { batchCount: 1, rowCount: 1 },
      snapshotExercises: { batchCount: 2, rowCount: 2 },
      snapshotSets: { batchCount: 3, rowCount: 3 },
    })
  })

  it('fails a revision snapshot before reading root content when shape is not decomposable', async () => {
    const snapshot = {
      id: '22222222-2222-4222-8222-222222222222',
      userId: '11111111-1111-4111-8111-111111111111',
      title: 'secret snapshot content',
      exercises: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          sets: [{ id: '44444444-4444-4444-8444-444444444444' }],
        },
      ],
      revision: 1,
    }
    const { database, lifecycle } = fakeWorkoutRevisionSnapshotDatabase(snapshot, false)
    const service = new PortableExportDatabaseSnapshotService(database)
    const session = service.createWorkoutRevisionSnapshot(
      snapshot.userId,
      snapshot.id,
      '55555555-5555-4555-8555-555555555555',
    )
    const receiptFailure = session.receipt.catch((error: unknown) => error)
    let streamFailure: unknown

    try {
      await session.snapshots[Symbol.asyncIterator]().next()
    } catch (error) {
      streamFailure = error
    }

    expect(streamFailure).toBeInstanceOf(PortableExportWorkoutRevisionSnapshotNotDecomposableError)
    expect(String(streamFailure)).not.toContain('secret snapshot content')
    expect(await receiptFailure).toBe(streamFailure)
    expect(lifecycle).toMatchObject({
      shapeQueries: 1,
      rootQueries: 0,
      committed: false,
      rolledBack: true,
    })
  })

  it('fails the root when a revision snapshot exercise field is skipped', async () => {
    const snapshot = {
      id: '22222222-2222-4222-8222-222222222222',
      userId: '11111111-1111-4111-8111-111111111111',
      exercises: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          sets: [{ id: '44444444-4444-4444-8444-444444444444' }],
        },
      ],
      revision: 1,
    }
    const { database, lifecycle } = fakeWorkoutRevisionSnapshotDatabase(snapshot)
    const service = new PortableExportDatabaseSnapshotService(database)
    const session = service.createWorkoutRevisionSnapshot(
      snapshot.userId,
      snapshot.id,
      '55555555-5555-4555-8555-555555555555',
    )
    const snapshots = session.snapshots[Symbol.asyncIterator]()
    await expect(snapshots.next()).resolves.toMatchObject({ done: false })
    const receiptFailure = session.receipt.catch((error: unknown) => error)
    let streamFailure: unknown

    try {
      await snapshots.next()
    } catch (error) {
      streamFailure = error
    }

    expect(streamFailure).toMatchObject({
      message: 'portable export workout revision snapshot exercises must complete',
    })
    expect(await receiptFailure).toBe(streamFailure)
    expect(lifecycle).toMatchObject({ committed: false, rolledBack: true })
  })

  it('cancels an active revision snapshot set before its exercise and root', async () => {
    const snapshot = {
      id: '22222222-2222-4222-8222-222222222222',
      userId: '11111111-1111-4111-8111-111111111111',
      exercises: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          sets: [
            { id: '44444444-4444-4444-8444-444444444444' },
            { id: '55555555-5555-4555-8555-555555555555' },
          ],
        },
      ],
      revision: 1,
    }
    const { database, lifecycle } = fakeWorkoutRevisionSnapshotDatabase(snapshot)
    const service = new PortableExportDatabaseSnapshotService(database)
    const session = service.createWorkoutRevisionSnapshot(
      snapshot.userId,
      snapshot.id,
      '66666666-6666-4666-8666-666666666666',
      { batchRows: 1 },
    )
    const snapshots = session.snapshots[Symbol.asyncIterator]()
    const root = await snapshots.next()
    if (root.done) throw new Error('revision snapshot fixture was not returned')
    const exercises = root.value.exercises[Symbol.asyncIterator]()
    const exercise = await exercises.next()
    if (exercise.done) throw new Error('revision snapshot exercise fixture was not returned')
    const sets = exercise.value.sets[Symbol.asyncIterator]()
    await expect(sets.next()).resolves.toMatchObject({ done: false })
    const cancellation = new Error('revision snapshot cancelled by lease owner')
    const receiptFailure = session.receipt.catch((error: unknown) => error)

    await session.cancel(cancellation)

    expect(await receiptFailure).toBe(cancellation)
    await expect(sets.next()).resolves.toEqual({ done: true, value: undefined })
    await expect(exercises.next()).resolves.toEqual({ done: true, value: undefined })
    await expect(snapshots.next()).rejects.toBe(cancellation)
    expect(lifecycle).toMatchObject({ committed: false, rolledBack: true })
  })

  it('rejects invalid batch and payload limits before opening a database stream', () => {
    const service = new PortableExportDatabaseSnapshotService(fakeDatabase([]))

    expect(() =>
      service.createHealthRecordSnapshot('11111111-1111-4111-8111-111111111111', {
        batchRows: 0,
      }),
    ).toThrowError(RangeError)
    expect(() =>
      service.createHealthRecordSnapshot('11111111-1111-4111-8111-111111111111', {
        batchRows: 101,
      }),
    ).toThrowError(RangeError)
    expect(() =>
      service.createHealthRecordSnapshot('11111111-1111-4111-8111-111111111111', {
        maximumPayloadBytes: 0,
      }),
    ).toThrowError(RangeError)
    expect(() =>
      service.createHealthRecordSnapshot('11111111-1111-4111-8111-111111111111', {
        maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes + 1,
      }),
    ).toThrowError(RangeError)
  })

  it('rejects an oversized database payload without exposing its content', async () => {
    const service = new PortableExportDatabaseSnapshotService(
      fakeDatabase([{ id: 'oversized', secret: 'do-not-transfer'.repeat(100) }]),
    )
    const session = service.createHealthRecordSnapshot('11111111-1111-4111-8111-111111111111', {
      maximumPayloadBytes: 128,
    })
    const receiptFailure = session.receipt.catch((error: unknown) => error)
    let streamFailure: unknown

    try {
      await session.rows[Symbol.asyncIterator]().next()
    } catch (error) {
      streamFailure = error
    }

    expect(streamFailure).toBeInstanceOf(PortableExportSnapshotPayloadTooLargeError)
    expect(streamFailure).toMatchObject({
      code: 'portable_export_snapshot_payload_too_large',
      maximumBytes: 128,
    })
    expect((streamFailure as Error).message).not.toContain('oversized')
    expect((streamFailure as Error).message).not.toContain('do-not-transfer')
    expect(await receiptFailure).toBe(streamFailure)
  })

  it('accepts a payload whose UTF-8 length is exactly the configured boundary', async () => {
    const payload = { id: 'exact-boundary', note: '含 UTF-8 文本' }
    const maximumPayloadBytes = Buffer.byteLength(JSON.stringify(payload))
    const service = new PortableExportDatabaseSnapshotService(fakeDatabase([payload]))
    const session = service.createHealthRecordSnapshot('11111111-1111-4111-8111-111111111111', {
      maximumPayloadBytes,
    })
    const rows: Array<Record<string, unknown>> = []

    for await (const row of session.rows) rows.push(row)

    expect(rows).toEqual([payload])
    await expect(session.receipt).resolves.toEqual({
      batchRows: 25,
      maximumPayloadBytes,
      batchCount: 1,
      rowCount: 1,
    })
  })

  it('rejects the receipt when the consumer stops before physical EOF', async () => {
    const service = new PortableExportDatabaseSnapshotService(fakeDatabase([{ id: 'one' }]))
    const session = service.createHealthRecordSnapshot('11111111-1111-4111-8111-111111111111')
    const iterator = session.rows[Symbol.asyncIterator]()

    await expect(iterator.next()).resolves.toEqual({ done: false, value: { id: 'one' } })
    const receiptRejection = expect(session.receipt).rejects.toThrowError(
      'portable export database snapshot did not complete',
    )
    await iterator.return?.()
    await receiptRejection
  })

  it('coordinates both health collections in one stream and commits only after root completion', async () => {
    const { database, lifecycle } = fakeHealthHistoryDatabase(
      [{ id: 'record-1' }, { id: 'record-2' }],
      [{ id: 'revision-1' }],
    )
    const service = new PortableExportDatabaseSnapshotService(database)
    const session = service.createHealthHistorySnapshot('11111111-1111-4111-8111-111111111111', {
      batchRows: 1,
    })
    const records: Array<Record<string, unknown>> = []
    const revisions: Array<Record<string, unknown>> = []

    for await (const row of session.healthRecords) records.push(row)
    expect(lifecycle.committed).toBe(false)
    for await (const row of session.healthRecordRevisions) revisions.push(row)
    expect(lifecycle.committed).toBe(false)

    await session.complete()

    expect(records.map((row) => row.id)).toEqual(['record-1', 'record-2'])
    expect(revisions.map((row) => row.id)).toEqual(['revision-1'])
    expect(lifecycle).toMatchObject({
      accountQueries: 1,
      streamCount: 1,
      committed: true,
      rolledBack: false,
    })
    await expect(session.receipt).resolves.toEqual({
      batchRows: 1,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      healthRecords: { batchCount: 2, rowCount: 2 },
      healthRecordRevisions: { batchCount: 1, rowCount: 1 },
    })
  })

  it('drives consent and health collections from one ordered coordinator', async () => {
    const { database, lifecycle } = fakeHealthHistoryDatabase(
      [{ id: 'record-1' }],
      [{ id: 'revision-1' }],
      [{ id: 'consent-1' }, { id: 'consent-2' }],
    )
    const service = new PortableExportDatabaseSnapshotService(database)
    const session = service.createConsentHealthSnapshot('11111111-1111-4111-8111-111111111111', {
      batchRows: 1,
    })
    const consentEvents: Array<Record<string, unknown>> = []
    const healthRecords: Array<Record<string, unknown>> = []
    const healthRecordRevisions: Array<Record<string, unknown>> = []

    for await (const row of session.consentEvents) consentEvents.push(row)
    for await (const row of session.healthRecords) healthRecords.push(row)
    for await (const row of session.healthRecordRevisions) healthRecordRevisions.push(row)
    expect(lifecycle.committed).toBe(false)

    await session.complete()

    expect(consentEvents.map((row) => row.id)).toEqual(['consent-1', 'consent-2'])
    expect(healthRecords.map((row) => row.id)).toEqual(['record-1'])
    expect(healthRecordRevisions.map((row) => row.id)).toEqual(['revision-1'])
    expect(lifecycle).toMatchObject({
      accountQueries: 1,
      streamCount: 1,
      committed: true,
      rolledBack: false,
    })
    await expect(session.receipt).resolves.toEqual({
      batchRows: 1,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      consentEvents: { batchCount: 2, rowCount: 2 },
      healthRecords: { batchCount: 1, rowCount: 1 },
      healthRecordRevisions: { batchCount: 1, rowCount: 1 },
    })
  })

  it('coordinates owner exercise entries and bounded histories after consent and health', async () => {
    const { database, lifecycle } = fakeConsentHealthExerciseCatalogDatabase(
      [{ id: 'consent-1' }],
      [{ id: 'health-1' }],
      [{ id: 'health-revision-1' }],
      [
        {
          id: 'catalog-entry-1',
          name: 'Active custom entry',
          archived_at: null,
          history: [
            { id: 'catalog-revision-1', revision: 1 },
            { id: 'catalog-revision-2', revision: 2 },
          ],
        },
        {
          id: 'catalog-entry-2',
          name: 'Archived custom entry',
          archived_at: '2026-08-11T10:00:00.000Z',
          history: [],
        },
      ],
    )
    const service = new PortableExportDatabaseSnapshotService(database)
    const session = service.createConsentHealthExerciseCatalogSnapshot(
      '11111111-1111-4111-8111-111111111111',
      { batchRows: 1 },
    )
    const observedEntries: Array<Record<string, unknown>> = []

    for await (const _ of session.consentEvents) {
      // Complete field one.
    }
    for await (const _ of session.healthRecords) {
      // Complete field two.
    }
    for await (const _ of session.healthRecordRevisions) {
      // Complete field three.
    }
    for await (const entry of session.exerciseCatalog) {
      const value = { ...entry, history: [] as Array<Record<string, unknown>> }
      for await (const revision of entry.history) value.history.push(revision)
      observedEntries.push(value)
    }
    expect(lifecycle.committed).toBe(false)

    await session.complete()

    expect(observedEntries).toEqual([
      {
        id: 'catalog-entry-1',
        name: 'Active custom entry',
        archived_at: null,
        history: [
          { id: 'catalog-revision-1', revision: 1 },
          { id: 'catalog-revision-2', revision: 2 },
        ],
      },
      {
        id: 'catalog-entry-2',
        name: 'Archived custom entry',
        archived_at: '2026-08-11T10:00:00.000Z',
        history: [],
      },
    ])
    expect(lifecycle).toMatchObject({
      accountQueries: 1,
      streamCount: 1,
      committed: true,
      rolledBack: false,
    })
    expect(lifecycle.queryOrder).toEqual([
      'consent',
      'consent',
      'health',
      'health',
      'health-revision',
      'health-revision',
      'catalog-entry',
      'catalog-history',
      'catalog-history',
      'catalog-history',
      'catalog-entry',
      'catalog-history',
      'catalog-entry',
    ])
    await expect(session.receipt).resolves.toEqual({
      batchRows: 1,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      consentEvents: { batchCount: 1, rowCount: 1 },
      healthRecords: { batchCount: 1, rowCount: 1 },
      healthRecordRevisions: { batchCount: 1, rowCount: 1 },
      exerciseCatalog: { batchCount: 2, rowCount: 2 },
      exerciseCatalogRevisions: { batchCount: 2, rowCount: 2 },
    })
  })

  it('fails the coordinated root when catalog history is skipped', async () => {
    const { database, lifecycle } = fakeConsentHealthExerciseCatalogDatabase(
      [],
      [],
      [],
      [
        {
          id: 'catalog-entry-1',
          history: [{ id: 'catalog-revision-1', revision: 1 }],
        },
        {
          id: 'catalog-entry-2',
          history: [],
        },
      ],
    )
    const service = new PortableExportDatabaseSnapshotService(database)
    const session = service.createConsentHealthExerciseCatalogSnapshot(
      '11111111-1111-4111-8111-111111111111',
      { batchRows: 1 },
    )
    for await (const _ of session.consentEvents) {
      // Empty field boundary.
    }
    for await (const _ of session.healthRecords) {
      // Empty field boundary.
    }
    for await (const _ of session.healthRecordRevisions) {
      // Empty field boundary.
    }
    const entries = session.exerciseCatalog[Symbol.asyncIterator]()
    await expect(entries.next()).resolves.toMatchObject({
      done: false,
      value: { id: 'catalog-entry-1' },
    })
    const receiptFailure = session.receipt.catch((error: unknown) => error)
    let streamFailure: unknown

    try {
      await entries.next()
    } catch (error) {
      streamFailure = error
    }

    expect(streamFailure).toMatchObject({
      message: 'portable export exercise catalog history must complete',
    })
    expect(await receiptFailure).toBe(streamFailure)
    expect(lifecycle).toMatchObject({ committed: false, rolledBack: true })
  })

  it('rejects an oversized catalog revision before its content crosses the root', async () => {
    const { database, lifecycle } = fakeConsentHealthExerciseCatalogDatabase(
      [],
      [],
      [],
      [
        {
          id: 'catalog-entry-1',
          history: [
            {
              id: 'catalog-revision-1',
              snapshot: { notes: 'private-catalog-content'.repeat(100) },
            },
          ],
        },
      ],
    )
    const service = new PortableExportDatabaseSnapshotService(database)
    const session = service.createConsentHealthExerciseCatalogSnapshot(
      '11111111-1111-4111-8111-111111111111',
      { maximumPayloadBytes: 128 },
    )
    for await (const _ of session.consentEvents) {
      // Empty field boundary.
    }
    for await (const _ of session.healthRecords) {
      // Empty field boundary.
    }
    for await (const _ of session.healthRecordRevisions) {
      // Empty field boundary.
    }
    const entries = session.exerciseCatalog[Symbol.asyncIterator]()
    const entry = await entries.next()
    if (entry.done) throw new Error('catalog fixture was not returned')
    const receiptFailure = session.receipt.catch((error: unknown) => error)
    let historyFailure: unknown

    try {
      await entry.value.history[Symbol.asyncIterator]().next()
    } catch (error) {
      historyFailure = error
    }

    expect(historyFailure).toBeInstanceOf(PortableExportSnapshotPayloadTooLargeError)
    expect((historyFailure as Error).message).not.toContain('private-catalog-content')
    expect(await receiptFailure).toBe(historyFailure)
    expect(lifecycle).toMatchObject({ committed: false, rolledBack: true })
  })

  it('fails closed when a coordinated collection is skipped', async () => {
    const { database, lifecycle } = fakeHealthHistoryDatabase(
      [{ id: 'record-1' }],
      [{ id: 'revision-1' }],
      [{ id: 'consent-1' }],
    )
    const service = new PortableExportDatabaseSnapshotService(database)
    const session = service.createConsentHealthSnapshot('11111111-1111-4111-8111-111111111111')
    for await (const _ of session.consentEvents) {
      // Reach the first boundary, then deliberately skip health records.
    }
    const receiptFailure = session.receipt.catch((error: unknown) => error)
    let streamFailure: unknown

    try {
      await session.healthRecordRevisions[Symbol.asyncIterator]().next()
    } catch (error) {
      streamFailure = error
    }

    expect(streamFailure).toMatchObject({
      message: 'portable export coordinated snapshot collections must be read once in order',
    })
    expect(await receiptFailure).toBe(streamFailure)
    expect(lifecycle).toMatchObject({ committed: false, rolledBack: true })
  })

  it('rolls back the shared stream with one root cause when cancelled between collections', async () => {
    const { database, lifecycle } = fakeHealthHistoryDatabase(
      [{ id: 'record-1' }],
      [{ id: 'revision-1' }],
    )
    const service = new PortableExportDatabaseSnapshotService(database)
    const session = service.createHealthHistorySnapshot('11111111-1111-4111-8111-111111111111')
    for await (const _ of session.healthRecords) {
      // Finish the first collection and leave the transaction between fields.
    }
    const cancellation = new Error('portable export root was cancelled between fields')
    const receiptFailure = session.receipt.catch((error: unknown) => error)

    await session.cancel(cancellation)

    expect(lifecycle).toMatchObject({ committed: false, rolledBack: true })
    expect(await receiptFailure).toBe(cancellation)
  })
})
