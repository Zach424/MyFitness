import { createHash } from 'node:crypto'

import { privacyExportSchema, privacyExportSchemaVersion } from '@myfitness/contracts'
import { describe, expect, it } from 'vitest'

import type {
  PortableExportWorkoutRevisionSnapshotLayerReceipt,
  PortableExportWorkoutRevisionSnapshotLayerSession,
} from './portable-export-database-snapshot'
import { serializePortableExport } from './portable-export-artifact'
import {
  createPortableExportJsonStream,
  type PortableExportJsonSource,
} from './portable-export-json-stream'
import { createPortableExportWorkoutJsonSource } from './portable-export-workout-json-source'

const ownerId = '11111111-1111-4111-8111-111111111111'

const emptyReceipt = (): PortableExportWorkoutRevisionSnapshotLayerReceipt => ({
  batchRows: 1,
  maximumPayloadBytes: 64 * 1024,
  workoutHeaders: { batchCount: 0, rowCount: 0 },
  workoutExercises: { batchCount: 0, rowCount: 0 },
  workoutSets: { batchCount: 0, rowCount: 0 },
  workoutRevisions: { batchCount: 0, rowCount: 0 },
  workoutRevisionSnapshotRoots: { batchCount: 0, rowCount: 0 },
  workoutRevisionSnapshotExercises: { batchCount: 0, rowCount: 0 },
  workoutRevisionSnapshotSets: { batchCount: 0, rowCount: 0 },
})

const exportFixture = (workouts: Array<Record<string, unknown>>) =>
  privacyExportSchema.parse({
    schemaVersion: privacyExportSchemaVersion,
    generatedAt: '2026-08-11T10:00:00.000Z',
    accountId: ownerId,
    data: {
      account: { id: ownerId, status: 'active' },
      identities: [],
      profile: null,
      goal: null,
      consentEvents: [],
      healthRecords: [],
      healthRecordRevisions: [],
      exerciseCatalog: [],
      foodCatalog: [],
      workouts,
      nutritionMeals: [],
      nutritionFavorites: [],
      weeklyPlans: [],
      aiExplanationRuns: [],
      foodPhotoAnalyses: [],
      progressPhotos: [],
    },
  })

describe('portable export workout JSON source', () => {
  it('preserves placeholder key order and streams history before current relations byte-for-byte', async () => {
    const traversal: string[] = []
    let completed = false
    let cancelled = false
    const snapshotSet = { id: 'snapshot-set', position: 2, reps: 8 }
    const snapshotExerciseExpected = {
      id: 'snapshot-exercise',
      sets: [snapshotSet],
      position: 2,
    }
    const snapshotExpected = {
      id: 'workout-1',
      title: '不可变快照',
      exercises: [snapshotExerciseExpected],
    }
    const revisionExpected = {
      id: 'revision-1',
      action: 'created',
      revision: 1,
      snapshot: snapshotExpected,
      changed_at: '2026-08-11T09:00:00.000Z',
    }
    const currentSet = { id: 'current-set', position: 1, reps: 10 }
    const currentExerciseExpected = {
      id: 'current-exercise',
      sets: [currentSet],
      position: 1,
    }
    const workoutExpected = {
      id: 'workout-1',
      history: [revisionExpected],
      exercises: [currentExerciseExpected],
    }
    const snapshotSets = (async function* () {
      traversal.push('snapshot-set')
      yield snapshotSet
    })()
    const snapshotExercises = (async function* () {
      traversal.push('snapshot-exercise')
      yield { ...snapshotExerciseExpected, sets: snapshotSets }
    })()
    const history = (async function* () {
      traversal.push('history')
      yield {
        ...revisionExpected,
        snapshot: { ...snapshotExpected, exercises: snapshotExercises },
      }
    })()
    const currentSets = (async function* () {
      traversal.push('current-set')
      yield currentSet
    })()
    const currentExercises = (async function* () {
      traversal.push('current-exercise')
      yield {
        header: { ...currentExerciseExpected, sets: [] },
        sets: currentSets,
      }
    })()
    const session = {
      workouts: (async function* () {
        yield {
          header: { id: 'workout-1', history: [], exercises: [] },
          history,
          exercises: currentExercises,
        }
      })(),
      receipt: Promise.resolve(emptyReceipt()),
      complete: async () => {
        completed = true
      },
      cancel: async () => {
        cancelled = true
      },
    } as PortableExportWorkoutRevisionSnapshotLayerSession
    const workoutSource = createPortableExportWorkoutJsonSource(session)
    const eager = exportFixture([workoutExpected])
    const expected = serializePortableExport(eager, Number.MAX_SAFE_INTEGER)
    const lazy: PortableExportJsonSource = {
      ...eager,
      data: { ...eager.data, workouts: workoutSource.workouts as never },
    }
    const json = createPortableExportJsonStream(lazy, {
      chunkBytes: 17,
      lifecycle: workoutSource,
    })
    const chunks: Buffer[] = []

    for await (const chunk of json.bytes) chunks.push(Buffer.from(chunk))

    expect(Buffer.concat(chunks)).toEqual(expected)
    expect(traversal).toEqual([
      'history',
      'snapshot-exercise',
      'snapshot-set',
      'current-exercise',
      'current-set',
    ])
    expect(completed).toBe(true)
    expect(cancelled).toBe(false)
    await expect(json.receipt).resolves.toEqual({
      schemaVersion: privacyExportSchemaVersion,
      chunkBytes: 17,
      byteLength: expected.length,
      sha256: createHash('sha256').update(expected).digest('hex'),
    })
  })

  it('closes an active snapshot set before cancelling the database root lifecycle', async () => {
    let setStarted = false
    let setClosed = false
    let completed = false
    let cancelledWith: unknown
    let cancelObservedSetClosed = false
    const snapshotSets = (async function* () {
      try {
        setStarted = true
        yield { id: 'snapshot-set-1' }
        yield { id: 'snapshot-set-2' }
      } finally {
        setClosed = true
      }
    })()
    const snapshotExercises = (async function* () {
      yield { id: 'snapshot-exercise', sets: snapshotSets }
    })()
    const history = (async function* () {
      yield {
        id: 'revision-1',
        snapshot: { id: 'workout-1', exercises: snapshotExercises },
      }
    })()
    const session = {
      workouts: (async function* () {
        yield {
          header: { id: 'workout-1', history: [], exercises: [] },
          history,
          exercises: (async function* () {})(),
        }
      })(),
      receipt: Promise.resolve(emptyReceipt()),
      complete: async () => {
        completed = true
      },
      cancel: async (error: unknown) => {
        cancelObservedSetClosed = setClosed
        cancelledWith = error
      },
    } as PortableExportWorkoutRevisionSnapshotLayerSession
    const workoutSource = createPortableExportWorkoutJsonSource(session)
    const eager = exportFixture([])
    const payload: PortableExportJsonSource = {
      ...eager,
      data: { ...eager.data, workouts: workoutSource.workouts as never },
    }
    const json = createPortableExportJsonStream(payload, {
      chunkBytes: 1,
      lifecycle: workoutSource,
    })
    const iterator = json.bytes[Symbol.asyncIterator]()
    while (!setStarted) await iterator.next()
    const receiptFailure = json.receipt.catch((error: unknown) => error)

    await iterator.return?.()

    expect(setClosed).toBe(true)
    expect(cancelObservedSetClosed).toBe(true)
    expect(completed).toBe(false)
    expect(await receiptFailure).toBe(cancelledWith)
  })
})
