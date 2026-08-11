import { describe, expect, it } from 'vitest'
import type { PoolClient } from 'pg'

import type { DatabaseService } from '../database/database.service'
import {
  PortableExportDatabaseSnapshotService,
  PortableExportSnapshotPayloadTooLargeError,
  portableExportSnapshotMaximumPayloadBytes,
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

const fakeWorkoutExerciseLayerDatabase = (
  workouts: Array<Record<string, unknown>>,
  exercisesByWorkout: Readonly<Record<string, Array<Record<string, unknown>>>>,
  setsByExercise: Readonly<Record<string, Array<Record<string, unknown>>>> = {},
  revisionsByWorkout: Readonly<Record<string, Array<Record<string, unknown>>>> = {},
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
