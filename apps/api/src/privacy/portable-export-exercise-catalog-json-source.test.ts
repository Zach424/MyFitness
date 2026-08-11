import { createHash } from 'node:crypto'

import { privacyExportSchema, privacyExportSchemaVersion } from '@myfitness/contracts'
import { describe, expect, it } from 'vitest'

import type {
  PortableExportConsentHealthCatalogSnapshotReceipt,
  PortableExportConsentHealthCatalogSnapshotSession,
  PortableExportConsentHealthExerciseCatalogSnapshotReceipt,
  PortableExportConsentHealthExerciseCatalogSnapshotSession,
} from './portable-export-database-snapshot'
import { serializePortableExport } from './portable-export-artifact'
import {
  createPortableExportConsentHealthCatalogJsonSource,
  createPortableExportConsentHealthExerciseCatalogJsonSource,
} from './portable-export-exercise-catalog-json-source'
import {
  createPortableExportJsonStream,
  type PortableExportJsonSource,
} from './portable-export-json-stream'

const ownerId = '11111111-1111-4111-8111-111111111111'

const emptyReceipt = (): PortableExportConsentHealthExerciseCatalogSnapshotReceipt => ({
  batchRows: 1,
  maximumPayloadBytes: 64 * 1024,
  consentEvents: { batchCount: 0, rowCount: 0 },
  healthRecords: { batchCount: 0, rowCount: 0 },
  healthRecordRevisions: { batchCount: 0, rowCount: 0 },
  exerciseCatalog: { batchCount: 0, rowCount: 0 },
  exerciseCatalogRevisions: { batchCount: 0, rowCount: 0 },
})

const emptyCatalogReceipt = (): PortableExportConsentHealthCatalogSnapshotReceipt => ({
  ...emptyReceipt(),
  foodCatalog: { batchCount: 0, rowCount: 0 },
  foodCatalogRevisions: { batchCount: 0, rowCount: 0 },
})

const exportFixture = (
  exerciseCatalog: Array<Record<string, unknown>>,
  foodCatalog: Array<Record<string, unknown>> = [],
) =>
  privacyExportSchema.parse({
    schemaVersion: privacyExportSchemaVersion,
    generatedAt: '2026-08-11T11:00:00.000Z',
    accountId: ownerId,
    data: {
      account: { id: ownerId, status: 'active' },
      identities: [],
      profile: null,
      goal: null,
      consentEvents: [{ id: 'consent-1' }],
      healthRecords: [{ id: 'health-1' }],
      healthRecordRevisions: [{ id: 'health-revision-1' }],
      exerciseCatalog,
      foodCatalog,
      workouts: [],
      nutritionMeals: [],
      nutritionFavorites: [],
      weeklyPlans: [],
      aiExplanationRuns: [],
      foodPhotoAnalyses: [],
      progressPhotos: [],
    },
  })

describe('portable export exercise catalog JSON source', () => {
  it('preserves the database placeholder position and streams all four fields byte-for-byte', async () => {
    const traversal: string[] = []
    let completed = false
    let cancelled = false
    const historyExpected = [
      { id: 'catalog-revision-1', action: 'created', revision: 1 },
      { id: 'catalog-revision-2', action: 'archived', revision: 2 },
    ]
    const entryExpected = {
      id: 'catalog-entry-1',
      name: '自定义深蹲',
      history: historyExpected,
      revision: 2,
    }
    const session = {
      consentEvents: (async function* () {
        traversal.push('consent')
        yield { id: 'consent-1' }
      })(),
      healthRecords: (async function* () {
        traversal.push('health')
        yield { id: 'health-1' }
      })(),
      healthRecordRevisions: (async function* () {
        traversal.push('health-revision')
        yield { id: 'health-revision-1' }
      })(),
      exerciseCatalog: (async function* () {
        traversal.push('catalog-entry')
        yield {
          id: entryExpected.id,
          name: entryExpected.name,
          history: (async function* () {
            for (const revision of historyExpected) {
              traversal.push(revision.id)
              yield revision
            }
          })(),
          revision: entryExpected.revision,
        }
      })(),
      receipt: Promise.resolve(emptyReceipt()),
      complete: async () => {
        completed = true
      },
      cancel: async () => {
        cancelled = true
      },
    } as PortableExportConsentHealthExerciseCatalogSnapshotSession
    const source = createPortableExportConsentHealthExerciseCatalogJsonSource(session)
    const eager = exportFixture([entryExpected])
    const expected = serializePortableExport(eager, Number.MAX_SAFE_INTEGER)
    const lazy: PortableExportJsonSource = {
      ...eager,
      data: {
        ...eager.data,
        consentEvents: source.consentEvents as never,
        healthRecords: source.healthRecords as never,
        healthRecordRevisions: source.healthRecordRevisions as never,
        exerciseCatalog: source.exerciseCatalog as never,
      },
    }
    const json = createPortableExportJsonStream(lazy, { chunkBytes: 19, lifecycle: source })
    const chunks: Buffer[] = []

    for await (const chunk of json.bytes) chunks.push(Buffer.from(chunk))

    expect(Buffer.concat(chunks)).toEqual(expected)
    expect(traversal).toEqual([
      'consent',
      'health',
      'health-revision',
      'catalog-entry',
      'catalog-revision-1',
      'catalog-revision-2',
    ])
    expect(completed).toBe(true)
    expect(cancelled).toBe(false)
    await expect(json.receipt).resolves.toEqual({
      schemaVersion: privacyExportSchemaVersion,
      chunkBytes: 19,
      byteLength: expected.length,
      sha256: createHash('sha256').update(expected).digest('hex'),
    })
  })

  it('closes active catalog history before cancelling the coordinated database root', async () => {
    let historyStarted = false
    let historyClosed = false
    let completed = false
    let cancelledWith: unknown
    let cancelObservedHistoryClosed = false
    const session = {
      consentEvents: (async function* () {})(),
      healthRecords: (async function* () {})(),
      healthRecordRevisions: (async function* () {})(),
      exerciseCatalog: (async function* () {
        yield {
          id: 'catalog-entry-1',
          history: (async function* () {
            try {
              historyStarted = true
              yield { id: 'catalog-revision-1' }
              yield { id: 'catalog-revision-2' }
            } finally {
              historyClosed = true
            }
          })(),
        }
      })(),
      receipt: Promise.resolve(emptyReceipt()),
      complete: async () => {
        completed = true
      },
      cancel: async (error: unknown) => {
        cancelObservedHistoryClosed = historyClosed
        cancelledWith = error
      },
    } as PortableExportConsentHealthExerciseCatalogSnapshotSession
    const source = createPortableExportConsentHealthExerciseCatalogJsonSource(session)
    const eager = exportFixture([])
    const payload: PortableExportJsonSource = {
      ...eager,
      data: {
        ...eager.data,
        consentEvents: source.consentEvents as never,
        healthRecords: source.healthRecords as never,
        healthRecordRevisions: source.healthRecordRevisions as never,
        exerciseCatalog: source.exerciseCatalog as never,
      },
    }
    const json = createPortableExportJsonStream(payload, { chunkBytes: 1, lifecycle: source })
    const iterator = json.bytes[Symbol.asyncIterator]()
    while (!historyStarted) await iterator.next()
    const receiptFailure = json.receipt.catch((error: unknown) => error)

    await iterator.return?.()

    expect(historyClosed).toBe(true)
    expect(cancelObservedHistoryClosed).toBe(true)
    expect(completed).toBe(false)
    expect(await receiptFailure).toBe(cancelledWith)
  })

  it('streams the fifth food catalog field and its history byte-for-byte', async () => {
    const traversal: string[] = []
    let completed = false
    let cancelled = false
    const historyExpected = [
      { id: 'food-revision-1', action: 'created', revision: 1 },
      { id: 'food-revision-2', action: 'updated', revision: 2 },
    ]
    const foodExpected = {
      id: 'food-entry-1',
      name: '自定义燕麦碗',
      history: historyExpected,
      revision: 2,
    }
    const session = {
      consentEvents: (async function* () {
        traversal.push('consent')
        yield { id: 'consent-1' }
      })(),
      healthRecords: (async function* () {
        traversal.push('health')
        yield { id: 'health-1' }
      })(),
      healthRecordRevisions: (async function* () {
        traversal.push('health-revision')
        yield { id: 'health-revision-1' }
      })(),
      exerciseCatalog: (async function* () {
        traversal.push('exercise-catalog')
      })(),
      foodCatalog: (async function* () {
        traversal.push('food-entry')
        yield {
          id: foodExpected.id,
          name: foodExpected.name,
          history: (async function* () {
            for (const revision of historyExpected) {
              traversal.push(revision.id)
              yield revision
            }
          })(),
          revision: foodExpected.revision,
        }
      })(),
      receipt: Promise.resolve(emptyCatalogReceipt()),
      complete: async () => {
        completed = true
      },
      cancel: async () => {
        cancelled = true
      },
    } as PortableExportConsentHealthCatalogSnapshotSession
    const source = createPortableExportConsentHealthCatalogJsonSource(session)
    const eager = exportFixture([], [foodExpected])
    const expected = serializePortableExport(eager, Number.MAX_SAFE_INTEGER)
    const lazy: PortableExportJsonSource = {
      ...eager,
      data: {
        ...eager.data,
        consentEvents: source.consentEvents as never,
        healthRecords: source.healthRecords as never,
        healthRecordRevisions: source.healthRecordRevisions as never,
        exerciseCatalog: source.exerciseCatalog as never,
        foodCatalog: source.foodCatalog as never,
      },
    }
    const json = createPortableExportJsonStream(lazy, { chunkBytes: 23, lifecycle: source })
    const chunks: Buffer[] = []

    for await (const chunk of json.bytes) chunks.push(Buffer.from(chunk))

    expect(Buffer.concat(chunks)).toEqual(expected)
    expect(traversal).toEqual([
      'consent',
      'health',
      'health-revision',
      'exercise-catalog',
      'food-entry',
      'food-revision-1',
      'food-revision-2',
    ])
    expect(completed).toBe(true)
    expect(cancelled).toBe(false)
  })

  it('closes active food history before cancelling the five-field database root', async () => {
    let historyStarted = false
    let historyClosed = false
    let completed = false
    let cancelledWith: unknown
    let cancelObservedHistoryClosed = false
    const session = {
      consentEvents: (async function* () {})(),
      healthRecords: (async function* () {})(),
      healthRecordRevisions: (async function* () {})(),
      exerciseCatalog: (async function* () {})(),
      foodCatalog: (async function* () {
        yield {
          id: 'food-entry-1',
          history: (async function* () {
            try {
              historyStarted = true
              yield { id: 'food-revision-1' }
              yield { id: 'food-revision-2' }
            } finally {
              historyClosed = true
            }
          })(),
        }
      })(),
      receipt: Promise.resolve(emptyCatalogReceipt()),
      complete: async () => {
        completed = true
      },
      cancel: async (error: unknown) => {
        cancelObservedHistoryClosed = historyClosed
        cancelledWith = error
      },
    } as PortableExportConsentHealthCatalogSnapshotSession
    const source = createPortableExportConsentHealthCatalogJsonSource(session)
    const eager = exportFixture([])
    const payload: PortableExportJsonSource = {
      ...eager,
      data: {
        ...eager.data,
        consentEvents: source.consentEvents as never,
        healthRecords: source.healthRecords as never,
        healthRecordRevisions: source.healthRecordRevisions as never,
        exerciseCatalog: source.exerciseCatalog as never,
        foodCatalog: source.foodCatalog as never,
      },
    }
    const json = createPortableExportJsonStream(payload, { chunkBytes: 1, lifecycle: source })
    const iterator = json.bytes[Symbol.asyncIterator]()
    while (!historyStarted) await iterator.next()
    const receiptFailure = json.receipt.catch((error: unknown) => error)

    await iterator.return?.()

    expect(historyClosed).toBe(true)
    expect(cancelObservedHistoryClosed).toBe(true)
    expect(completed).toBe(false)
    expect(await receiptFailure).toBe(cancelledWith)
  })
})
