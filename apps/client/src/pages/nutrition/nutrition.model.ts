import type {
  CreateMeal,
  ConfirmFoodPhotoCandidate,
  FoodServing,
  FoodSnapshot,
  Meal,
  MealItemInput,
  UpdateMeal,
} from '@myfitness/contracts'
import { starterFoodCatalog } from '@myfitness/contracts/nutrition.constants'

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
  occurredAt?: string
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
})

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

export const draftsFromPhotoConfirmation = (
  items: ConfirmFoodPhotoCandidate['items'],
): FoodDraft[] =>
  items.map((item) => {
    const catalog = starterFoodCatalog.find((entry) => entry.foodKey === item.catalogKey)
    if (!catalog) throw new Error('照片候选已不在当前食物库中，请重新选择照片')
    const draft = draftFromCatalog(catalog)
    return { ...draft, amount: String(item.grams), unit: 'g', gramsPerUnit: 1 }
  })

export const createCustomFoodDraft = (input: {
  name: string
  grams: string
  energyKcal: string
  proteinG: string
  carbohydrateG: string
  fatG: string
}): FoodDraft => ({
  food: {
    foodKey: `custom:${Date.now()}`,
    name: input.name.trim(),
    category: 'custom',
    nutrientsPer100g: {
      energyKcal: Number(input.energyKcal),
      proteinG: Number(input.proteinG),
      carbohydrateG: Number(input.carbohydrateG),
      fatG: Number(input.fatG),
    },
    reference: '用户手工录入的每 100g 营养快照',
  },
  amount: input.grams,
  unit: 'g',
  gramsPerUnit: 1,
})

export const validateCustomFood = (input: {
  name: string
  grams: string
  energyKcal: string
  proteinG: string
  carbohydrateG: string
  fatG: string
}) => {
  if (!input.name.trim()) return '请填写食物名称'
  if (!finitePositive(input.grams)) return '份量需大于 0'
  for (const [label, value] of [
    ['热量', input.energyKcal],
    ['蛋白质', input.proteinG],
    ['碳水', input.carbohydrateG],
    ['脂肪', input.fatG],
  ] as const) {
    if (value.trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0) {
      return `${label}需为不小于 0 的数字`
    }
  }
  return ''
}

export const validateMealDraft = (draft: MealDraft) => {
  if (!draft.title.trim()) return '请填写餐次名称'
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

const timezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
  } catch {
    return 'Asia/Shanghai'
  }
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
    occurredAt: draft.occurredAt ?? new Date().toISOString(),
    timezone: timezone(),
    ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
  }
}

export const draftFromMeal = (meal: Meal, repeat = false): MealDraft => ({
  mealType: meal.mealType,
  title: meal.title,
  items: meal.items.map((item) => ({
    food: item.food,
    amount: String(item.serving.amount),
    unit: item.serving.unit,
    gramsPerUnit: item.serving.grams / item.serving.amount,
  })),
  note: repeat ? '' : (meal.note ?? ''),
  ...(repeat ? {} : { occurredAt: meal.occurredAt }),
})

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
