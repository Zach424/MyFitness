import * as z from 'zod'

import {
  foodCatalogRevisionActions,
  foodCatalogSources,
  foodCatalogVersion,
} from './food-catalog.constants'
import { foodCategorySchema, foodServingSchema, nutrientsPer100gSchema } from './nutrition'
import { recordListQuerySchema, recordPageCursorSchema } from './pagination'

export * from './food-catalog.constants'

export const foodCatalogSourceSchema = z.enum(foodCatalogSources)
export const foodCatalogRevisionActionSchema = z.enum(foodCatalogRevisionActions)

const foodCatalogNameSchema = z.string().trim().min(1).max(100)
const foodCatalogAliasesSchema = z.array(z.string().trim().min(1).max(100)).max(8)
const foodCatalogReferenceSchema = z.string().trim().min(2).max(200)

const validateFoodDefinition = (
  value: { name: string; aliases?: string[] },
  ctx: z.RefinementCtx,
) => {
  const labels = [value.name, ...(value.aliases ?? [])].map((label) => label.toLocaleLowerCase())
  if (new Set(labels).size !== labels.length) {
    ctx.addIssue({ code: 'custom', message: 'name and aliases must be unique', path: ['aliases'] })
  }
}

export const foodCatalogEntryInputBaseSchema = z
  .object({
    name: foodCatalogNameSchema,
    aliases: foodCatalogAliasesSchema.optional(),
    category: foodCategorySchema,
    nutrientsPer100g: nutrientsPer100gSchema,
    reference: foodCatalogReferenceSchema,
    defaultServing: foodServingSchema,
  })
  .strict()

export const createFoodCatalogEntrySchema =
  foodCatalogEntryInputBaseSchema.superRefine(validateFoodDefinition)

export const updateFoodCatalogEntryBaseSchema = foodCatalogEntryInputBaseSchema.extend({
  expectedRevision: z.number().int().positive(),
})

export const updateFoodCatalogEntrySchema =
  updateFoodCatalogEntryBaseSchema.superRefine(validateFoodDefinition)

const foodDefinitionShape = {
  name: foodCatalogNameSchema,
  aliases: foodCatalogAliasesSchema,
  category: foodCategorySchema,
  nutrientsPer100g: nutrientsPer100gSchema,
  reference: foodCatalogReferenceSchema,
  defaultServing: foodServingSchema,
}

export const starterFoodCatalogItemSchema = z
  .object({
    source: z.literal('starter'),
    id: z.string().regex(/^starter:[a-z0-9_]{2,80}$/),
    foodKey: z.string().regex(/^[a-z0-9_]{2,80}$/),
    ...foodDefinitionShape,
    catalogVersion: z.literal(foodCatalogVersion),
    revision: z.literal(1),
    editable: z.literal(false),
    archivedAt: z.null(),
    createdAt: z.null(),
    updatedAt: z.null(),
  })
  .strict()

export const customFoodCatalogEntrySchema = z
  .object({
    source: z.literal('custom'),
    id: z.string().uuid(),
    userId: z.string().uuid(),
    foodKey: z.string().regex(/^custom:[a-f0-9]{32}$/),
    ...foodDefinitionShape,
    catalogVersion: z.null(),
    revision: z.number().int().positive(),
    editable: z.literal(true),
    archivedAt: z.string().datetime({ offset: true }).nullable(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()

export const foodCatalogItemSchema = z.discriminatedUnion('source', [
  starterFoodCatalogItemSchema,
  customFoodCatalogEntrySchema,
])

export const foodCatalogListSchema = z
  .object({
    starterVersion: z.literal(foodCatalogVersion),
    items: z.array(foodCatalogItemSchema),
  })
  .strict()

export const foodCatalogEntryHistoryItemSchema = customFoodCatalogEntrySchema.extend({
  action: foodCatalogRevisionActionSchema,
  changedAt: z.string().datetime({ offset: true }),
})

export const foodCatalogEntryHistorySchema = z
  .object({
    entryId: z.string().uuid(),
    items: z.array(foodCatalogEntryHistoryItemSchema).max(50),
    nextCursor: recordPageCursorSchema.nullable(),
  })
  .strict()
export const foodCatalogEntryHistoryQuerySchema = recordListQuerySchema(20, 50)

export const foodCatalogEntryIdSchema = z.string().uuid()

export type CreateFoodCatalogEntry = z.infer<typeof createFoodCatalogEntrySchema>
export type UpdateFoodCatalogEntry = z.infer<typeof updateFoodCatalogEntrySchema>
export type StarterFoodCatalogItem = z.infer<typeof starterFoodCatalogItemSchema>
export type CustomFoodCatalogEntry = z.infer<typeof customFoodCatalogEntrySchema>
export type FoodCatalogItem = z.infer<typeof foodCatalogItemSchema>
export type FoodCatalogEntryHistoryItem = z.infer<typeof foodCatalogEntryHistoryItemSchema>
export type FoodCatalogEntryHistory = z.infer<typeof foodCatalogEntryHistorySchema>
export type FoodCatalogEntryHistoryQuery = z.infer<typeof foodCatalogEntryHistoryQuerySchema>
