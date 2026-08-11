import type {
  PortableExportConsentHealthCatalogSnapshotSession,
  PortableExportConsentHealthCatalogWorkoutNutritionFavoriteSnapshotSession,
  PortableExportConsentHealthCatalogWorkoutNutritionSnapshotSession,
  PortableExportConsentHealthCatalogWorkoutSnapshotSession,
  PortableExportConsentHealthExerciseCatalogSnapshotSession,
  PortableExportExerciseCatalogSnapshotEntry,
} from './portable-export-database-snapshot'
import {
  portableExportJsonAsyncArray,
  type PortableExportJsonAsyncArray,
} from './portable-export-json-stream'
import { createPortableExportNutritionMealJsonArray } from './portable-export-nutrition-meal-json-source'
import { createPortableExportWorkoutJsonArray } from './portable-export-workout-json-source'

export type PortableExportConsentHealthExerciseCatalogJsonSource = {
  consentEvents: PortableExportJsonAsyncArray<Record<string, unknown>>
  healthRecords: PortableExportJsonAsyncArray<Record<string, unknown>>
  healthRecordRevisions: PortableExportJsonAsyncArray<Record<string, unknown>>
  exerciseCatalog: PortableExportJsonAsyncArray<Record<string, unknown>>
  receipt: PortableExportConsentHealthExerciseCatalogSnapshotSession['receipt']
  complete: PortableExportConsentHealthExerciseCatalogSnapshotSession['complete']
  cancel: PortableExportConsentHealthExerciseCatalogSnapshotSession['cancel']
}

export type PortableExportConsentHealthCatalogJsonSource =
  PortableExportConsentHealthExerciseCatalogJsonSource & {
    foodCatalog: PortableExportJsonAsyncArray<Record<string, unknown>>
    receipt: PortableExportConsentHealthCatalogSnapshotSession['receipt']
    complete: PortableExportConsentHealthCatalogSnapshotSession['complete']
    cancel: PortableExportConsentHealthCatalogSnapshotSession['cancel']
  }

export type PortableExportConsentHealthCatalogWorkoutJsonSource =
  PortableExportConsentHealthCatalogJsonSource & {
    workouts: PortableExportJsonAsyncArray<Record<string, unknown>>
    receipt: PortableExportConsentHealthCatalogWorkoutSnapshotSession['receipt']
    complete: PortableExportConsentHealthCatalogWorkoutSnapshotSession['complete']
    cancel: PortableExportConsentHealthCatalogWorkoutSnapshotSession['cancel']
  }

export type PortableExportConsentHealthCatalogWorkoutNutritionJsonSource =
  PortableExportConsentHealthCatalogWorkoutJsonSource & {
    nutritionMeals: PortableExportJsonAsyncArray<Record<string, unknown>>
    receipt: PortableExportConsentHealthCatalogWorkoutNutritionSnapshotSession['receipt']
    complete: PortableExportConsentHealthCatalogWorkoutNutritionSnapshotSession['complete']
    cancel: PortableExportConsentHealthCatalogWorkoutNutritionSnapshotSession['cancel']
  }

export type PortableExportConsentHealthCatalogWorkoutNutritionFavoriteJsonSource =
  PortableExportConsentHealthCatalogWorkoutNutritionJsonSource & {
    nutritionFavorites: PortableExportJsonAsyncArray<Record<string, unknown>>
    receipt: PortableExportConsentHealthCatalogWorkoutNutritionFavoriteSnapshotSession['receipt']
    complete: PortableExportConsentHealthCatalogWorkoutNutritionFavoriteSnapshotSession['complete']
    cancel: PortableExportConsentHealthCatalogWorkoutNutritionFavoriteSnapshotSession['cancel']
  }

const catalogJsonValues = async function* (
  entries: AsyncIterable<PortableExportExerciseCatalogSnapshotEntry>,
): AsyncGenerator<Record<string, unknown>> {
  for await (const entry of entries) {
    if (!Object.hasOwn(entry, 'history')) {
      throw new Error('portable export exercise catalog entry is missing its history placeholder')
    }
    const value = entry as Record<string, unknown>
    value.history = portableExportJsonAsyncArray(entry.history)
    yield value
  }
}

export const createPortableExportConsentHealthExerciseCatalogJsonSource = (
  session: PortableExportConsentHealthExerciseCatalogSnapshotSession,
): PortableExportConsentHealthExerciseCatalogJsonSource => ({
  consentEvents: portableExportJsonAsyncArray(session.consentEvents),
  healthRecords: portableExportJsonAsyncArray(session.healthRecords),
  healthRecordRevisions: portableExportJsonAsyncArray(session.healthRecordRevisions),
  exerciseCatalog: portableExportJsonAsyncArray(catalogJsonValues(session.exerciseCatalog)),
  receipt: session.receipt,
  complete: session.complete,
  cancel: session.cancel,
})

export const createPortableExportConsentHealthCatalogJsonSource = (
  session: PortableExportConsentHealthCatalogSnapshotSession,
): PortableExportConsentHealthCatalogJsonSource => ({
  consentEvents: portableExportJsonAsyncArray(session.consentEvents),
  healthRecords: portableExportJsonAsyncArray(session.healthRecords),
  healthRecordRevisions: portableExportJsonAsyncArray(session.healthRecordRevisions),
  exerciseCatalog: portableExportJsonAsyncArray(catalogJsonValues(session.exerciseCatalog)),
  foodCatalog: portableExportJsonAsyncArray(catalogJsonValues(session.foodCatalog)),
  receipt: session.receipt,
  complete: session.complete,
  cancel: session.cancel,
})

export const createPortableExportConsentHealthCatalogWorkoutJsonSource = (
  session: PortableExportConsentHealthCatalogWorkoutSnapshotSession,
): PortableExportConsentHealthCatalogWorkoutJsonSource => ({
  consentEvents: portableExportJsonAsyncArray(session.consentEvents),
  healthRecords: portableExportJsonAsyncArray(session.healthRecords),
  healthRecordRevisions: portableExportJsonAsyncArray(session.healthRecordRevisions),
  exerciseCatalog: portableExportJsonAsyncArray(catalogJsonValues(session.exerciseCatalog)),
  foodCatalog: portableExportJsonAsyncArray(catalogJsonValues(session.foodCatalog)),
  workouts: createPortableExportWorkoutJsonArray(session.workouts),
  receipt: session.receipt,
  complete: session.complete,
  cancel: session.cancel,
})

export const createPortableExportConsentHealthCatalogWorkoutNutritionJsonSource = (
  session: PortableExportConsentHealthCatalogWorkoutNutritionSnapshotSession,
): PortableExportConsentHealthCatalogWorkoutNutritionJsonSource => ({
  consentEvents: portableExportJsonAsyncArray(session.consentEvents),
  healthRecords: portableExportJsonAsyncArray(session.healthRecords),
  healthRecordRevisions: portableExportJsonAsyncArray(session.healthRecordRevisions),
  exerciseCatalog: portableExportJsonAsyncArray(catalogJsonValues(session.exerciseCatalog)),
  foodCatalog: portableExportJsonAsyncArray(catalogJsonValues(session.foodCatalog)),
  workouts: createPortableExportWorkoutJsonArray(session.workouts),
  nutritionMeals: createPortableExportNutritionMealJsonArray(session.nutritionMeals),
  receipt: session.receipt,
  complete: session.complete,
  cancel: session.cancel,
})

export const createPortableExportConsentHealthCatalogWorkoutNutritionFavoriteJsonSource = (
  session: PortableExportConsentHealthCatalogWorkoutNutritionFavoriteSnapshotSession,
): PortableExportConsentHealthCatalogWorkoutNutritionFavoriteJsonSource => ({
  consentEvents: portableExportJsonAsyncArray(session.consentEvents),
  healthRecords: portableExportJsonAsyncArray(session.healthRecords),
  healthRecordRevisions: portableExportJsonAsyncArray(session.healthRecordRevisions),
  exerciseCatalog: portableExportJsonAsyncArray(catalogJsonValues(session.exerciseCatalog)),
  foodCatalog: portableExportJsonAsyncArray(catalogJsonValues(session.foodCatalog)),
  workouts: createPortableExportWorkoutJsonArray(session.workouts),
  nutritionMeals: createPortableExportNutritionMealJsonArray(session.nutritionMeals),
  nutritionFavorites: portableExportJsonAsyncArray(session.nutritionFavorites),
  receipt: session.receipt,
  complete: session.complete,
  cancel: session.cancel,
})
