import * as z from 'zod'

import {
  exerciseCatalogRevisionActions,
  exerciseCatalogSources,
  exerciseCatalogVersion,
  exerciseEquipmentOptions,
  exerciseMuscleMappingSources,
  exerciseTrackingModes,
} from './exercise-catalog.constants'
import { mappableMuscleIds, muscleModelVersion } from './muscle-model.constants'
import { exerciseCategories } from './workout.constants'
import { recordListQuerySchema, recordPageCursorSchema } from './pagination'

export * from './exercise-catalog.constants'

export const exerciseCatalogSourceSchema = z.enum(exerciseCatalogSources)
export const exerciseCatalogRevisionActionSchema = z.enum(exerciseCatalogRevisionActions)
export const exerciseTrackingModeSchema = z.enum(exerciseTrackingModes)
export const exerciseEquipmentSchema = z.enum(exerciseEquipmentOptions)
export const exerciseMuscleMappingSourceSchema = z.enum(exerciseMuscleMappingSources)
export const mappableMuscleIdSchema = z.enum(mappableMuscleIds)

const validateMuscleSets = (
  value: {
    primaryMuscles: Array<(typeof mappableMuscleIds)[number]>
    secondaryMuscles: Array<(typeof mappableMuscleIds)[number]>
  },
  ctx: z.RefinementCtx,
) => {
  if (new Set(value.primaryMuscles).size !== value.primaryMuscles.length) {
    ctx.addIssue({
      code: 'custom',
      message: 'primaryMuscles must not contain duplicates',
      path: ['primaryMuscles'],
    })
  }
  if (new Set(value.secondaryMuscles).size !== value.secondaryMuscles.length) {
    ctx.addIssue({
      code: 'custom',
      message: 'secondaryMuscles must not contain duplicates',
      path: ['secondaryMuscles'],
    })
  }
  const primary = new Set(value.primaryMuscles)
  if (value.secondaryMuscles.some((muscleId) => primary.has(muscleId))) {
    ctx.addIssue({
      code: 'custom',
      message: 'primaryMuscles and secondaryMuscles must not overlap',
      path: ['secondaryMuscles'],
    })
  }
}

export const exerciseMuscleMappingInputSchema = z
  .object({
    modelVersion: z.literal(muscleModelVersion),
    primaryMuscles: z.array(mappableMuscleIdSchema).min(1).max(8),
    secondaryMuscles: z.array(mappableMuscleIdSchema).max(12),
  })
  .strict()
  .superRefine(validateMuscleSets)

export const mappedExerciseMuscleMappingSchema = exerciseMuscleMappingInputSchema.safeExtend({
  status: z.literal('mapped'),
  source: exerciseMuscleMappingSourceSchema,
})

export const unmappedExerciseMuscleMappingSchema = z
  .object({
    status: z.literal('unmapped'),
    modelVersion: z.null(),
    source: z.null(),
    primaryMuscles: z.tuple([]),
    secondaryMuscles: z.tuple([]),
  })
  .strict()

export const exerciseMuscleMappingSchema = z.discriminatedUnion('status', [
  mappedExerciseMuscleMappingSchema,
  unmappedExerciseMuscleMappingSchema,
])

const catalogNameSchema = z.string().trim().min(1).max(80)
const aliasesSchema = z.array(z.string().trim().min(1).max(80)).max(8)
const equipmentSchema = z.array(exerciseEquipmentSchema).min(1).max(6)

const validateCatalogDefinition = (
  value: { name: string; aliases?: string[]; equipment: string[]; equipmentNotes?: string },
  ctx: z.RefinementCtx,
) => {
  const labels = [value.name, ...(value.aliases ?? [])].map((label) => label.toLocaleLowerCase())
  if (new Set(labels).size !== labels.length) {
    ctx.addIssue({ code: 'custom', message: 'name and aliases must be unique', path: ['aliases'] })
  }
  if (new Set(value.equipment).size !== value.equipment.length) {
    ctx.addIssue({
      code: 'custom',
      message: 'equipment must not contain duplicates',
      path: ['equipment'],
    })
  }
  if (value.equipment.includes('other') && !value.equipmentNotes?.trim()) {
    ctx.addIssue({
      code: 'custom',
      message: 'equipmentNotes is required when equipment contains other',
      path: ['equipmentNotes'],
    })
  }
}

export const exerciseCatalogEntryInputBaseSchema = z
  .object({
    name: catalogNameSchema,
    aliases: aliasesSchema.optional(),
    category: z.enum(exerciseCategories),
    trackingMode: exerciseTrackingModeSchema,
    equipment: equipmentSchema,
    equipmentNotes: z.string().trim().min(1).max(120).optional(),
    muscleMapping: exerciseMuscleMappingInputSchema.nullable().optional(),
  })
  .strict()

export const createExerciseCatalogEntrySchema =
  exerciseCatalogEntryInputBaseSchema.superRefine(validateCatalogDefinition)

export const updateExerciseCatalogEntryBaseSchema = exerciseCatalogEntryInputBaseSchema.extend({
  expectedRevision: z.number().int().positive(),
})

export const updateExerciseCatalogEntrySchema =
  updateExerciseCatalogEntryBaseSchema.superRefine(validateCatalogDefinition)

const catalogDefinitionShape = {
  name: catalogNameSchema,
  aliases: aliasesSchema,
  category: z.enum(exerciseCategories),
  trackingMode: exerciseTrackingModeSchema,
  equipment: equipmentSchema,
  equipmentNotes: z.string().max(120).nullable(),
  muscleMapping: exerciseMuscleMappingSchema,
}

export const starterExerciseCatalogItemSchema = z
  .object({
    source: z.literal('starter'),
    id: z.string().regex(/^starter:[a-z0-9_]{2,80}$/),
    key: z.string().regex(/^[a-z0-9_]{2,80}$/),
    ...catalogDefinitionShape,
    catalogVersion: z.literal(exerciseCatalogVersion),
    revision: z.literal(1),
    editable: z.literal(false),
    archivedAt: z.null(),
    createdAt: z.null(),
    updatedAt: z.null(),
  })
  .strict()

export const customExerciseCatalogEntrySchema = z
  .object({
    source: z.literal('custom'),
    id: z.string().uuid(),
    userId: z.string().uuid(),
    key: z.string().regex(/^custom_[a-f0-9]{32}$/),
    ...catalogDefinitionShape,
    catalogVersion: z.null(),
    revision: z.number().int().positive(),
    editable: z.literal(true),
    archivedAt: z.string().datetime({ offset: true }).nullable(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()

export const exerciseCatalogItemSchema = z.discriminatedUnion('source', [
  starterExerciseCatalogItemSchema,
  customExerciseCatalogEntrySchema,
])

export const exerciseCatalogListSchema = z
  .object({
    starterVersion: z.literal(exerciseCatalogVersion),
    items: z.array(exerciseCatalogItemSchema),
  })
  .strict()

export const exerciseCatalogEntryHistoryItemSchema = customExerciseCatalogEntrySchema.extend({
  action: exerciseCatalogRevisionActionSchema,
  changedAt: z.string().datetime({ offset: true }),
})

export const exerciseCatalogEntryHistorySchema = z
  .object({
    entryId: z.string().uuid(),
    items: z.array(exerciseCatalogEntryHistoryItemSchema).max(50),
    nextCursor: recordPageCursorSchema.nullable(),
  })
  .strict()
export const exerciseCatalogEntryHistoryQuerySchema = recordListQuerySchema(20, 50)

export const exerciseCatalogEntryIdSchema = z.string().uuid()

export type ExerciseEquipment = z.infer<typeof exerciseEquipmentSchema>
export type ExerciseTrackingMode = z.infer<typeof exerciseTrackingModeSchema>
export type ExerciseMuscleMappingInput = z.infer<typeof exerciseMuscleMappingInputSchema>
export type ExerciseMuscleMapping = z.infer<typeof exerciseMuscleMappingSchema>
export type CreateExerciseCatalogEntry = z.infer<typeof createExerciseCatalogEntrySchema>
export type UpdateExerciseCatalogEntry = z.infer<typeof updateExerciseCatalogEntrySchema>
export type StarterExerciseCatalogItem = z.infer<typeof starterExerciseCatalogItemSchema>
export type CustomExerciseCatalogEntry = z.infer<typeof customExerciseCatalogEntrySchema>
export type ExerciseCatalogItem = z.infer<typeof exerciseCatalogItemSchema>
export type ExerciseCatalogEntryHistoryItem = z.infer<typeof exerciseCatalogEntryHistoryItemSchema>
export type ExerciseCatalogEntryHistory = z.infer<typeof exerciseCatalogEntryHistorySchema>
export type ExerciseCatalogEntryHistoryQuery = z.infer<
  typeof exerciseCatalogEntryHistoryQuerySchema
>
