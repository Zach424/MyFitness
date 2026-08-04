import type {
  CreateMeal,
  ConfirmFoodPhotoCandidate,
  FoodCatalogItem,
  FoodServing,
  FoodSnapshot,
  Meal,
  MealItemInput,
  UpdateMeal,
} from '@myfitness/contracts'
import { starterFoodCatalog } from '@myfitness/contracts/nutrition.constants'

import {
  correctionDraftTarget,
  type CorrectionDraftTarget,
  isCorrectionDraftTarget,
} from '../../lib/correction-draft'
import {
  detectedTimeZone,
  formatZonedOccurrence,
  isBoundedOccurrenceInstant,
  occurrenceValidationMessage,
  preservedOccurrenceInstant,
  preservedOccurrenceValidationMessage,
} from '../../lib/occurrence-time'

export type StarterFood = (typeof starterFoodCatalog)[number]

export type FoodDraft = {
  food: FoodSnapshot
  amount: string
  unit: FoodServing['unit']
  gramsPerUnit: number
}

export type MealDraft = {
  mealType: CreateMeal['mealType']
  title: string
  items: FoodDraft[]
  note: string
  occurredLocal: string
  timezone: string
  occurrenceOffsetMinutes?: number
  originalOccurredAt?: string
  correction?: CorrectionDraftTarget
}

export const mealTypeLabels: Record<MealDraft['mealType'], string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐',
}

export const initialMealDraft = (): MealDraft => ({
  mealType: 'lunch',
  title: '午餐',
  items: [],
  note: '',
  occurredLocal: '',
  timezone: detectedTimeZone(),
})

const isDraftObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const hasOnlyDraftKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).every((key) => keys.includes(key))
const draftString = (value: unknown, max: number) =>
  typeof value === 'string' && value.length <= max
const draftNumber = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
const draftMealTypes = ['breakfast', 'lunch', 'dinner', 'snack'] as const
const draftServingUnits = ['g', 'ml', 'piece', 'serving'] as const
const draftFoodCategories = [
  'staple',
  'protein',
  'vegetable',
  'fruit',
  'dairy',
  'snack',
  'custom',
] as const

const isDraftNutrients = (value: unknown) =>
  isDraftObject(value) &&
  hasOnlyDraftKeys(value, ['energyKcal', 'proteinG', 'carbohydrateG', 'fatG', 'fiberG']) &&
  draftNumber(value.energyKcal, 0, 10_000) &&
  draftNumber(value.proteinG, 0, 1_000) &&
  draftNumber(value.carbohydrateG, 0, 1_000) &&
  draftNumber(value.fatG, 0, 1_000) &&
  (value.fiberG === undefined || draftNumber(value.fiberG, 0, 1_000))

const isDraftFoodSnapshot = (value: unknown): value is FoodSnapshot =>
  isDraftObject(value) &&
  hasOnlyDraftKeys(value, ['foodKey', 'name', 'category', 'nutrientsPer100g', 'reference']) &&
  draftString(value.foodKey, 128) &&
  draftString(value.name, 200) &&
  draftFoodCategories.includes(value.category as (typeof draftFoodCategories)[number]) &&
  isDraftNutrients(value.nutrientsPer100g) &&
  draftString(value.reference, 500)

const isFoodDraft = (value: unknown) =>
  isDraftObject(value) &&
  hasOnlyDraftKeys(value, ['food', 'amount', 'unit', 'gramsPerUnit']) &&
  isDraftFoodSnapshot(value.food) &&
  draftString(value.amount, 32) &&
  draftServingUnits.includes(value.unit as (typeof draftServingUnits)[number]) &&
  draftNumber(value.gramsPerUnit, 0.001, 10_000)

export const isMealDraft = (value: unknown): value is MealDraft =>
  isDraftObject(value) &&
  hasOnlyDraftKeys(value, [
    'mealType',
    'title',
    'items',
    'note',
    'occurredLocal',
    'timezone',
    'occurrenceOffsetMinutes',
    'originalOccurredAt',
    'correction',
  ]) &&
  draftMealTypes.includes(value.mealType as (typeof draftMealTypes)[number]) &&
  draftString(value.title, 120) &&
  Array.isArray(value.items) &&
  value.items.length <= 50 &&
  value.items.every(isFoodDraft) &&
  draftString(value.note, 2_000) &&
  draftString(value.occurredLocal, 16) &&
  draftString(value.timezone, 64) &&
  (value.occurrenceOffsetMinutes === undefined ||
    (draftNumber(value.occurrenceOffsetMinutes, -1_080, 1_080) &&
      Number.isInteger(value.occurrenceOffsetMinutes))) &&
  isBoundedOccurrenceInstant(value.originalOccurredAt) &&
  (value.correction === undefined || isCorrectionDraftTarget(value.correction))

const finitePositive = (value: string) =>
  value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) > 0

export const draftFromCatalog = (entry: StarterFood): FoodDraft => ({
  food: {
    foodKey: entry.foodKey,
    name: entry.name,
    category: entry.category,
    nutrientsPer100g: { ...entry.nutrientsPer100g },
    reference: '衡迹演示食物库 v2026-07；请按包装或实际食材校正',
  },
  amount: String(entry.defaultServing.amount),
  unit: entry.defaultServing.unit,
  gramsPerUnit: entry.defaultServing.grams / entry.defaultServing.amount,
})

export const draftFromFoodCatalogItem = (entry: FoodCatalogItem): FoodDraft => ({
  food: {
    foodKey: entry.foodKey,
    name: entry.name,
    category: entry.category,
    nutrientsPer100g: { ...entry.nutrientsPer100g },
    reference: entry.reference,
  },
  amount: String(entry.defaultServing.amount),
  unit: entry.defaultServing.unit,
  gramsPerUnit: entry.defaultServing.grams / entry.defaultServing.amount,
})

export const draftsFromPhotoConfirmation = (
  items: ConfirmFoodPhotoCandidate['items'],
): FoodDraft[] =>
  items.map((item) => {
    const catalog = starterFoodCatalog.find((entry) => entry.foodKey === item.catalogKey)
    if (!catalog) throw new Error('照片候选已不在当前食物库中，请重新选择照片')
    const draft = draftFromCatalog(catalog)
    return { ...draft, amount: String(item.grams), unit: 'g', gramsPerUnit: 1 }
  })

export const validateMealDraft = (draft: MealDraft) => {
  if (!draft.title.trim()) return '请填写餐次名称'
  const occurrenceError = occurrenceValidationMessage(
    draft.occurredLocal,
    draft.timezone,
    draft.occurrenceOffsetMinutes,
  )
  if (occurrenceError) return occurrenceError
  const preservedError = preservedOccurrenceValidationMessage(
    draft.originalOccurredAt,
    draft.occurredLocal,
    draft.timezone,
    draft.occurrenceOffsetMinutes,
  )
  if (preservedError) return preservedError
  if (!draft.items.length) return '请至少添加一种食物'
  for (const item of draft.items) {
    if (!finitePositive(item.amount)) return `${item.food.name}的份量需大于 0`
    const grams = Number(item.amount) * item.gramsPerUnit
    if (!Number.isFinite(grams) || grams <= 0 || grams > 10_000) {
      return `${item.food.name}换算后的克重无效`
    }
  }
  return ''
}

const mealItems = (draft: MealDraft): MealItemInput[] =>
  draft.items.map((item, index) => ({
    position: index + 1,
    food: item.food,
    serving: {
      amount: Number(item.amount),
      unit: item.unit,
      grams: Math.round(Number(item.amount) * item.gramsPerUnit * 1_000) / 1_000,
    },
  }))

export function buildMealRequest(draft: MealDraft): CreateMeal
export function buildMealRequest(draft: MealDraft, expectedRevision: number): UpdateMeal
export function buildMealRequest(
  draft: MealDraft,
  expectedRevision?: number,
): CreateMeal | UpdateMeal {
  const error = validateMealDraft(draft)
  if (error) throw new Error(error)
  return {
    mealType: draft.mealType,
    title: draft.title.trim(),
    source: { kind: 'manual' },
    items: mealItems(draft),
    occurredAt: preservedOccurrenceInstant(
      draft.originalOccurredAt,
      draft.occurredLocal,
      draft.timezone,
      draft.occurrenceOffsetMinutes,
    ),
    timezone: draft.timezone,
    ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
  }
}

export const draftFromMeal = (meal: Meal, repeat = false): MealDraft => {
  const occurrence = repeat ? null : formatZonedOccurrence(meal.occurredAt, meal.timezone)
  return {
    mealType: meal.mealType,
    title: meal.title,
    items: meal.items.map((item) => ({
      food: item.food,
      amount: String(item.serving.amount),
      unit: item.serving.unit,
      gramsPerUnit: item.serving.grams / item.serving.amount,
    })),
    note: repeat ? '' : (meal.note ?? ''),
    occurredLocal: occurrence?.local ?? '',
    timezone: occurrence ? meal.timezone : detectedTimeZone(),
    ...(occurrence ? { occurrenceOffsetMinutes: occurrence.offsetMinutes } : {}),
    ...(occurrence ? { originalOccurredAt: meal.occurredAt } : {}),
    ...(occurrence ? { correction: correctionDraftTarget(meal) } : {}),
  }
}

const round = (value: number, precision = 1) => {
  const factor = 10 ** precision
  return Math.round((value + Number.EPSILON) * factor) / factor
}

export const mealDraftSummary = (draft: MealDraft) => {
  const summary = {
    energyKcal: 0,
    proteinG: 0,
    carbohydrateG: 0,
    fatG: 0,
    fiberG: 0,
  }
  for (const item of draft.items) {
    if (!finitePositive(item.amount)) continue
    const factor = (Number(item.amount) * item.gramsPerUnit) / 100
    summary.energyKcal += item.food.nutrientsPer100g.energyKcal * factor
    summary.proteinG += item.food.nutrientsPer100g.proteinG * factor
    summary.carbohydrateG += item.food.nutrientsPer100g.carbohydrateG * factor
    summary.fatG += item.food.nutrientsPer100g.fatG * factor
    summary.fiberG += (item.food.nutrientsPer100g.fiberG ?? 0) * factor
  }
  return {
    energyKcal: Math.round(summary.energyKcal),
    proteinG: round(summary.proteinG),
    carbohydrateG: round(summary.carbohydrateG),
    fatG: round(summary.fatG),
    fiberG: round(summary.fiberG),
  }
}

export const recentFoods = (meals: Meal[]) => {
  const seen = new Set<string>()
  const result: Array<{ food: FoodSnapshot; defaultServing: FoodServing }> = []
  for (const meal of meals) {
    for (const item of meal.items) {
      if (seen.has(item.food.foodKey)) continue
      seen.add(item.food.foodKey)
      result.push({ food: item.food, defaultServing: item.serving })
      if (result.length === 8) return result
    }
  }
  return result
}

export const draftFromSavedFood = (entry: {
  food: FoodSnapshot
  defaultServing: FoodServing
}): FoodDraft => ({
  food: entry.food,
  amount: String(entry.defaultServing.amount),
  unit: entry.defaultServing.unit,
  gramsPerUnit: entry.defaultServing.grams / entry.defaultServing.amount,
})
