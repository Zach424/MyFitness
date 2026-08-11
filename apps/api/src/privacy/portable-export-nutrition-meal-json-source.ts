import type {
  PortableExportNutritionMealLayerSnapshotMeal,
  PortableExportNutritionMealLayerSnapshotReceipt,
  PortableExportNutritionMealLayerSnapshotSession,
  PortableExportNutritionMealRevision,
} from './portable-export-database-snapshot'
import {
  portableExportJsonAsyncArray,
  type PortableExportJsonAsyncArray,
} from './portable-export-json-stream'

export type PortableExportNutritionMealJsonSourceSession = {
  nutritionMeals: PortableExportJsonAsyncArray<Record<string, unknown>>
  receipt: Promise<PortableExportNutritionMealLayerSnapshotReceipt>
  complete: () => Promise<void>
  cancel: (error: unknown) => Promise<void>
}

const replaceArrayPlaceholder = (
  target: Record<string, unknown>,
  key: string,
  values: AsyncIterable<Record<string, unknown>>,
) => {
  if (!Array.isArray(target[key])) {
    throw new Error(`portable export nutrition meal JSON source requires a ${key} placeholder`)
  }
  target[key] = portableExportJsonAsyncArray(values)
}

const wrapExistingIterable = (
  target: Record<string, unknown>,
  key: string,
  expected: AsyncIterable<Record<string, unknown>>,
) => {
  if (target[key] !== expected) {
    throw new Error(`portable export nutrition meal JSON source lost its ${key} field`)
  }
  target[key] = portableExportJsonAsyncArray(expected)
}

async function* revisionJsonValues(
  history: AsyncIterable<PortableExportNutritionMealRevision>,
): AsyncGenerator<Record<string, unknown>> {
  for await (const revision of history) {
    const snapshotItems = revision.snapshot.items
    wrapExistingIterable(revision.snapshot, 'items', snapshotItems)
    yield revision
  }
}

async function* mealJsonValues(
  meals: AsyncIterable<PortableExportNutritionMealLayerSnapshotMeal>,
): AsyncGenerator<Record<string, unknown>> {
  for await (const meal of meals) {
    replaceArrayPlaceholder(meal.header, 'items', meal.items)
    replaceArrayPlaceholder(meal.header, 'history', revisionJsonValues(meal.history))
    yield meal.header
  }
}

export const createPortableExportNutritionMealJsonArray = (
  meals: AsyncIterable<PortableExportNutritionMealLayerSnapshotMeal>,
): PortableExportJsonAsyncArray<Record<string, unknown>> =>
  portableExportJsonAsyncArray(mealJsonValues(meals))

export const createPortableExportNutritionMealJsonSource = (
  session: PortableExportNutritionMealLayerSnapshotSession,
): PortableExportNutritionMealJsonSourceSession => ({
  nutritionMeals: createPortableExportNutritionMealJsonArray(session.meals),
  receipt: session.receipt,
  complete: session.complete,
  cancel: session.cancel,
})
