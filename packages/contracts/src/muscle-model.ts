import * as z from 'zod'

import {
  muscleBodyViews,
  muscleIds,
  muscleModelCatalog,
  muscleModelMuscles,
  muscleModelRegions,
  muscleModelVersion,
  muscleNodeTypes,
  muscleRegionIds,
} from './muscle-model.constants'

export * from './muscle-model.constants'

export const muscleModelVersionSchema = z.literal(muscleModelVersion)
export const muscleRegionIdSchema = z.enum(muscleRegionIds)
export const muscleIdSchema = z.enum(muscleIds)
export const muscleNodeTypeSchema = z.enum(muscleNodeTypes)
export const muscleBodyViewSchema = z.enum(muscleBodyViews)

const canonicalRegionById = new Map(muscleModelRegions.map((region) => [region.id, region]))
const canonicalMuscleById = new Map(muscleModelMuscles.map((muscle) => [muscle.id, muscle]))

const sameStringArray = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index])

export const muscleRegionSchema = z
  .object({
    id: muscleRegionIdSchema,
    nameZh: z.string().trim().min(1).max(24),
    displayOrder: z.number().int().positive(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const canonical = canonicalRegionById.get(value.id)
    if (
      canonical === undefined ||
      canonical.nameZh !== value.nameZh ||
      canonical.displayOrder !== value.displayOrder
    ) {
      ctx.addIssue({
        code: 'custom',
        message: `${value.id} does not match the canonical ${muscleModelVersion} region`,
      })
    }
  })

export const muscleDefinitionSchema = z
  .object({
    id: muscleIdSchema,
    regionId: muscleRegionIdSchema,
    nameZh: z.string().trim().min(1).max(24),
    nodeType: muscleNodeTypeSchema,
    bodyViews: z.array(muscleBodyViewSchema).min(1).max(muscleBodyViews.length),
    displayOrder: z.number().int().positive(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.bodyViews).size !== value.bodyViews.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'bodyViews must not contain duplicates',
        path: ['bodyViews'],
      })
    }
    const expectedNodeType = value.id === 'core_global' ? 'aggregate' : 'muscle_group'
    if (value.nodeType !== expectedNodeType) {
      ctx.addIssue({
        code: 'custom',
        message: `${value.id} must use nodeType ${expectedNodeType}`,
        path: ['nodeType'],
      })
    }
    const canonical = canonicalMuscleById.get(value.id)
    if (
      canonical === undefined ||
      canonical.regionId !== value.regionId ||
      canonical.nameZh !== value.nameZh ||
      canonical.nodeType !== value.nodeType ||
      canonical.displayOrder !== value.displayOrder ||
      !sameStringArray(canonical.bodyViews, value.bodyViews)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: `${value.id} does not match the canonical ${muscleModelVersion} definition`,
      })
    }
  })

export const muscleModelCatalogSchema = z
  .object({
    version: muscleModelVersionSchema,
    regions: z.array(muscleRegionSchema).length(muscleRegionIds.length),
    muscles: z.array(muscleDefinitionSchema).length(muscleIds.length),
  })
  .strict()
  .superRefine((value, ctx) => {
    const regionIds = value.regions.map((region) => region.id)
    if (!sameStringArray(regionIds, muscleRegionIds)) {
      ctx.addIssue({
        code: 'custom',
        message: 'regions must contain the canonical v1 identities in display order',
        path: ['regions'],
      })
    }

    for (const [index, region] of value.regions.entries()) {
      const canonical = canonicalRegionById.get(region.id)
      if (
        canonical === undefined ||
        canonical.nameZh !== region.nameZh ||
        canonical.displayOrder !== region.displayOrder
      ) {
        ctx.addIssue({
          code: 'custom',
          message: `${region.id} does not match the canonical ${muscleModelVersion} region`,
          path: ['regions', index],
        })
      }
    }

    const receivedMuscleIds = value.muscles.map((muscle) => muscle.id)
    if (!sameStringArray(receivedMuscleIds, muscleIds)) {
      ctx.addIssue({
        code: 'custom',
        message: 'muscles must contain the canonical v1 identities in display order',
        path: ['muscles'],
      })
    }

    for (const [index, muscle] of value.muscles.entries()) {
      const canonical = canonicalMuscleById.get(muscle.id)
      if (
        canonical === undefined ||
        canonical.regionId !== muscle.regionId ||
        canonical.nameZh !== muscle.nameZh ||
        canonical.nodeType !== muscle.nodeType ||
        canonical.displayOrder !== muscle.displayOrder ||
        !sameStringArray(canonical.bodyViews, muscle.bodyViews)
      ) {
        ctx.addIssue({
          code: 'custom',
          message: `${muscle.id} does not match the canonical ${muscleModelVersion} definition`,
          path: ['muscles', index],
        })
      }
    }
  })

export const canonicalMuscleModelCatalog = muscleModelCatalogSchema.parse(muscleModelCatalog)

export type MuscleModelVersion = z.infer<typeof muscleModelVersionSchema>
export type MuscleRegionId = z.infer<typeof muscleRegionIdSchema>
export type MuscleId = z.infer<typeof muscleIdSchema>
export type MuscleNodeType = z.infer<typeof muscleNodeTypeSchema>
export type MuscleBodyView = z.infer<typeof muscleBodyViewSchema>
export type MuscleRegion = z.infer<typeof muscleRegionSchema>
export type MuscleDefinition = z.infer<typeof muscleDefinitionSchema>
export type MuscleModelCatalog = z.infer<typeof muscleModelCatalogSchema>
