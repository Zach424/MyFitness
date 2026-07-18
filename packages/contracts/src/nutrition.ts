import * as z from 'zod'

import {
  foodCategories,
  foodPortionUnits,
  mealRevisionActions,
  mealTypes,
  nutritionSourceKinds,
} from './nutrition.constants'

export * from './nutrition.constants'

export const mealTypeSchema = z.enum(mealTypes)
export const foodCategorySchema = z.enum(foodCategories)
export const foodPortionUnitSchema = z.enum(foodPortionUnits)
export const nutritionSourceKindSchema = z.enum(nutritionSourceKinds)
export const mealRevisionActionSchema = z.enum(mealRevisionActions)

export const nutrientsPer100gSchema = z
  .object({
    energyKcal: z.number().finite().min(0).max(1_000),
    proteinG: z.number().finite().min(0).max(100),
    carbohydrateG: z.number().finite().min(0).max(100),
    fatG: z.number().finite().min(0).max(100),
    fiberG: z.number().finite().min(0).max(100).optional(),
  })
  .strict()

export const foodSnapshotSchema = z
  .object({
    foodKey: z
      .string()
      .trim()
      .regex(/^[a-z0-9_:-]{2,100}$/),
    name: z.string().trim().min(1).max(100),
    category: foodCategorySchema,
    nutrientsPer100g: nutrientsPer100gSchema,
    reference: z.string().trim().min(1).max(200).optional(),
  })
  .strict()

export const foodServingSchema = z
  .object({
    amount: z.number().finite().positive().max(10_000),
    unit: foodPortionUnitSchema,
    grams: z.number().finite().positive().max(10_000),
  })
  .strict()

export const mealItemInputSchema = z
  .object({
    position: z.number().int().min(1).max(100),
    food: foodSnapshotSchema,
    serving: foodServingSchema,
  })
  .strict()

export const nutritionSourceSchema = z
  .object({
    kind: nutritionSourceKindSchema,
    metadata: z
      .object({
        provider: z.string().trim().min(1).max(80).optional(),
        externalId: z.string().trim().min(1).max(160).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

export const mealBaseSchema = z
  .object({
    mealType: mealTypeSchema,
    title: z.string().trim().min(1).max(80),
    source: nutritionSourceSchema,
    items: z.array(mealItemInputSchema).min(1).max(30),
    occurredAt: z.string().datetime({ offset: true }),
    timezone: z.string().trim().min(1).max(64),
    note: z.string().trim().max(500).optional(),
  })
  .strict()

const isValidIanaTimezone = (timezone: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format()
    return true
  } catch {
    return false
  }
}

const validateMeal = (meal: z.infer<typeof mealBaseSchema>, ctx: z.RefinementCtx) => {
  if (!isValidIanaTimezone(meal.timezone)) {
    ctx.addIssue({
      code: 'custom',
      message: 'timezone must be a valid IANA time zone',
      path: ['timezone'],
    })
  }
  const positions = meal.items.map((item) => item.position)
  if (new Set(positions).size !== positions.length) {
    ctx.addIssue({
      code: 'custom',
      message: 'item positions must be unique',
      path: ['items'],
    })
  }
}

export const createMealSchema = mealBaseSchema.superRefine(validateMeal)
export const updateMealBaseSchema = mealBaseSchema.extend({
  expectedRevision: z.number().int().positive(),
})
export const updateMealSchema = updateMealBaseSchema.superRefine(validateMeal)

export const nutrientSummarySchema = z
  .object({
    energyKcal: z.number().finite().min(0),
    proteinG: z.number().finite().min(0),
    carbohydrateG: z.number().finite().min(0),
    fatG: z.number().finite().min(0),
    fiberG: z.number().finite().min(0),
  })
  .strict()

export const mealItemSchema = mealItemInputSchema.safeExtend({
  id: z.string().uuid(),
  summary: nutrientSummarySchema,
})

export const mealSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    mealType: mealTypeSchema,
    title: z.string(),
    source: nutritionSourceSchema,
    items: z.array(mealItemSchema),
    summary: nutrientSummarySchema,
    occurredAt: z.string().datetime({ offset: true }),
    timezone: z.string(),
    note: z.string().nullable(),
    revision: z.number().int().positive(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()

export const mealListSchema = z.object({ items: z.array(mealSchema) }).strict()
export const mealHistoryItemSchema = mealSchema.extend({
  action: mealRevisionActionSchema,
  changedAt: z.string().datetime({ offset: true }),
})
export const mealHistorySchema = z
  .object({ mealId: z.string().uuid(), items: z.array(mealHistoryItemSchema) })
  .strict()

export const favoriteFoodInputSchema = z
  .object({ food: foodSnapshotSchema, defaultServing: foodServingSchema })
  .strict()
export const favoriteFoodSchema = favoriteFoodInputSchema.extend({
  createdAt: z.string().datetime({ offset: true }),
})
export const favoriteFoodListSchema = z.object({ items: z.array(favoriteFoodSchema) }).strict()

export const mealIdSchema = z.string().uuid()
export const foodKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9_:-]{2,100}$/)

export type NutrientsPer100g = z.infer<typeof nutrientsPer100gSchema>
export type FoodSnapshot = z.infer<typeof foodSnapshotSchema>
export type FoodServing = z.infer<typeof foodServingSchema>
export type MealItemInput = z.infer<typeof mealItemInputSchema>
export type CreateMeal = z.infer<typeof createMealSchema>
export type UpdateMeal = z.infer<typeof updateMealSchema>
export type Meal = z.infer<typeof mealSchema>
export type MealHistoryItem = z.infer<typeof mealHistoryItemSchema>
export type FavoriteFoodInput = z.infer<typeof favoriteFoodInputSchema>
export type FavoriteFood = z.infer<typeof favoriteFoodSchema>
