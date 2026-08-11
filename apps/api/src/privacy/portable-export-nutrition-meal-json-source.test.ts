import { createHash } from 'node:crypto'

import { privacyExportSchema, privacyExportSchemaVersion } from '@myfitness/contracts'
import { describe, expect, it } from 'vitest'

import type {
  PortableExportNutritionMealLayerSnapshotReceipt,
  PortableExportNutritionMealLayerSnapshotSession,
} from './portable-export-database-snapshot'
import { serializePortableExport } from './portable-export-artifact'
import {
  createPortableExportJsonStream,
  type PortableExportJsonSource,
} from './portable-export-json-stream'
import { createPortableExportNutritionMealJsonSource } from './portable-export-nutrition-meal-json-source'

const ownerId = '11111111-1111-4111-8111-111111111111'

const emptyReceipt = (): PortableExportNutritionMealLayerSnapshotReceipt => ({
  batchRows: 1,
  maximumPayloadBytes: 64 * 1024,
  meals: { batchCount: 0, rowCount: 0 },
  mealItems: { batchCount: 0, rowCount: 0 },
  mealRevisions: { batchCount: 0, rowCount: 0 },
  mealRevisionSnapshotRoots: { batchCount: 0, rowCount: 0 },
  mealRevisionSnapshotItems: { batchCount: 0, rowCount: 0 },
})

const exportFixture = (nutritionMeals: Array<Record<string, unknown>>) =>
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
      workouts: [],
      nutritionMeals,
      nutritionFavorites: [],
      weeklyPlans: [],
      aiExplanationRuns: [],
      foodPhotoAnalyses: [],
      progressPhotos: [],
    },
  })

describe('portable export nutrition meal JSON source', () => {
  it('does not prefetch and preserves nested placeholder order byte-for-byte', async () => {
    const traversal: string[] = []
    let completed = false
    let cancelled = false
    const currentItem = { id: 'current-item', position: 1 }
    const snapshotItem = { id: 'snapshot-item', position: 1 }
    const snapshotExpected = {
      id: 'meal-1',
      title: '不可变餐食',
      items: [snapshotItem],
    }
    const revisionExpected = {
      id: 'revision-1',
      action: 'created',
      revision: 1,
      snapshot: snapshotExpected,
      changed_at: '2026-08-11T09:00:00.000Z',
    }
    const mealExpected = {
      id: 'meal-1',
      items: [currentItem],
      history: [revisionExpected],
    }
    const currentItems = (async function* () {
      traversal.push('current-item')
      yield currentItem
    })()
    const snapshotItems = (async function* () {
      traversal.push('snapshot-item')
      yield snapshotItem
    })()
    const history = (async function* () {
      traversal.push('history')
      yield {
        ...revisionExpected,
        snapshot: { ...snapshotExpected, items: snapshotItems },
      }
    })()
    const session = {
      meals: (async function* () {
        traversal.push('meal')
        yield {
          header: { id: 'meal-1', items: [], history: [] },
          items: currentItems,
          history,
        }
      })(),
      receipt: Promise.resolve(emptyReceipt()),
      complete: async () => {
        completed = true
      },
      cancel: async () => {
        cancelled = true
      },
    } as PortableExportNutritionMealLayerSnapshotSession
    const mealSource = createPortableExportNutritionMealJsonSource(session)
    const eager = exportFixture([mealExpected])
    const expected = serializePortableExport(eager, Number.MAX_SAFE_INTEGER)
    const lazy: PortableExportJsonSource = {
      ...eager,
      data: { ...eager.data, nutritionMeals: mealSource.nutritionMeals as never },
    }
    const json = createPortableExportJsonStream(lazy, {
      chunkBytes: 17,
      lifecycle: mealSource,
    })
    const chunks: Buffer[] = []

    expect(traversal).toEqual([])
    for await (const chunk of json.bytes) chunks.push(Buffer.from(chunk))

    expect(Buffer.concat(chunks)).toEqual(expected)
    expect(traversal).toEqual(['meal', 'current-item', 'history', 'snapshot-item'])
    expect(completed).toBe(true)
    expect(cancelled).toBe(false)
    await expect(json.receipt).resolves.toEqual({
      schemaVersion: privacyExportSchemaVersion,
      chunkBytes: 17,
      byteLength: expected.length,
      sha256: createHash('sha256').update(expected).digest('hex'),
    })
  })

  it('closes an active immutable snapshot item before cancelling the database root', async () => {
    let itemStarted = false
    let itemClosed = false
    let completed = false
    let cancelledWith: unknown
    let cancelObservedItemClosed = false
    const snapshotItems = (async function* () {
      try {
        itemStarted = true
        yield { id: 'snapshot-item-1' }
        yield { id: 'snapshot-item-2' }
      } finally {
        itemClosed = true
      }
    })()
    const history = (async function* () {
      yield {
        id: 'revision-1',
        snapshot: { id: 'meal-1', items: snapshotItems },
      }
    })()
    const session = {
      meals: (async function* () {
        yield {
          header: { id: 'meal-1', items: [], history: [] },
          items: (async function* () {})(),
          history,
        }
      })(),
      receipt: Promise.resolve(emptyReceipt()),
      complete: async () => {
        completed = true
      },
      cancel: async (error: unknown) => {
        cancelObservedItemClosed = itemClosed
        cancelledWith = error
      },
    } as PortableExportNutritionMealLayerSnapshotSession
    const mealSource = createPortableExportNutritionMealJsonSource(session)
    const eager = exportFixture([])
    const payload: PortableExportJsonSource = {
      ...eager,
      data: { ...eager.data, nutritionMeals: mealSource.nutritionMeals as never },
    }
    const json = createPortableExportJsonStream(payload, {
      chunkBytes: 1,
      lifecycle: mealSource,
    })
    const iterator = json.bytes[Symbol.asyncIterator]()
    while (!itemStarted) await iterator.next()
    const receiptFailure = json.receipt.catch((error: unknown) => error)

    await iterator.return?.()

    expect(itemClosed).toBe(true)
    expect(cancelObservedItemClosed).toBe(true)
    expect(completed).toBe(false)
    expect(await receiptFailure).toBe(cancelledWith)
  })
})
