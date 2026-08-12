import * as z from 'zod'

import {
  bodyMetricCategories,
  bodyMetricCodes,
  bodyMetricDefinitions,
  bodyMetricDerivationKinds,
  bodyMetricRegistry,
  bodyMetricRegistryStatuses,
  bodyMetricRegistryVersion,
  bodyMetricSourceCapabilities,
  bodyMetricUnitCodes,
} from './body-metric-registry.constants'

export * from './body-metric-registry.constants'

export const bodyMetricRegistryVersionSchema = z.literal(bodyMetricRegistryVersion)
export const bodyMetricCodeSchema = z.enum(bodyMetricCodes)
export const bodyMetricCategorySchema = z.enum(bodyMetricCategories)
export const bodyMetricRegistryStatusSchema = z.enum(bodyMetricRegistryStatuses)
export const bodyMetricUnitCodeSchema = z.enum(bodyMetricUnitCodes)
export const bodyMetricSourceCapabilitySchema = z.enum(bodyMetricSourceCapabilities)
export const bodyMetricDerivationKindSchema = z.enum(bodyMetricDerivationKinds)

export const bodyMetricTechnicalBoundsSchema = z
  .object({
    minimum: z.number().finite(),
    maximum: z.number().finite(),
    wholeNumber: z.boolean(),
    interpretation: z.literal('ingestion_guard_not_clinical_range'),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.minimum >= value.maximum) {
      ctx.addIssue({
        code: 'custom',
        message: 'technical minimum must be lower than maximum',
        path: ['minimum'],
      })
    }
  })

export const bodyMetricDerivationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }).strict(),
  z
    .object({
      kind: z.literal('deterministic'),
      formulaVersion: z.string().trim().min(1).max(80),
      inputMetrics: z.array(bodyMetricCodeSchema).min(1).max(8),
    })
    .strict()
    .superRefine((value, ctx) => {
      if (new Set(value.inputMetrics).size !== value.inputMetrics.length) {
        ctx.addIssue({
          code: 'custom',
          message: 'deterministic derivation inputs must be unique',
          path: ['inputMetrics'],
        })
      }
    }),
])

export const bodyMetricDefinitionSchema = z
  .object({
    code: bodyMetricCodeSchema,
    nameZh: z.string().trim().min(1).max(32),
    category: bodyMetricCategorySchema,
    status: bodyMetricRegistryStatusSchema,
    canonicalUnit: bodyMetricUnitCodeSchema,
    allowedDisplayUnits: z.array(bodyMetricUnitCodeSchema).min(1).max(4),
    persistenceDecimalPlaces: z.number().int().min(0).max(8),
    technicalBounds: bodyMetricTechnicalBoundsSchema,
    sourceCapabilities: z
      .array(bodyMetricSourceCapabilitySchema)
      .min(1)
      .max(bodyMetricSourceCapabilities.length),
    derivation: bodyMetricDerivationSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.allowedDisplayUnits.includes(value.canonicalUnit)) {
      ctx.addIssue({
        code: 'custom',
        message: 'allowedDisplayUnits must include canonicalUnit',
        path: ['allowedDisplayUnits'],
      })
    }
    if (new Set(value.allowedDisplayUnits).size !== value.allowedDisplayUnits.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'allowedDisplayUnits must not contain duplicates',
        path: ['allowedDisplayUnits'],
      })
    }
    if (new Set(value.sourceCapabilities).size !== value.sourceCapabilities.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'sourceCapabilities must not contain duplicates',
        path: ['sourceCapabilities'],
      })
    }
    const hasDerivedSource = value.sourceCapabilities.includes('deterministic_derived')
    if ((value.derivation.kind === 'deterministic') !== hasDerivedSource) {
      ctx.addIssue({
        code: 'custom',
        message: 'deterministic derivation and source capability must be declared together',
        path: ['derivation'],
      })
    }
  })

const canonicalDefinitionByCode = new Map(
  bodyMetricDefinitions.map((definition) => [definition.code, definition]),
)

const isCanonicalDefinition = (value: z.infer<typeof bodyMetricDefinitionSchema>) => {
  const canonical = canonicalDefinitionByCode.get(value.code)
  return canonical !== undefined && JSON.stringify(value) === JSON.stringify(canonical)
}

export const bodyMetricRegistrySchema = z
  .object({
    version: bodyMetricRegistryVersionSchema,
    persistenceDecimalPlaces: z.number().int().min(0).max(8),
    metrics: z.array(bodyMetricDefinitionSchema).length(bodyMetricCodes.length),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.persistenceDecimalPlaces !== bodyMetricRegistry.persistenceDecimalPlaces) {
      ctx.addIssue({
        code: 'custom',
        message: `${bodyMetricRegistryVersion} must use the canonical persistence precision`,
        path: ['persistenceDecimalPlaces'],
      })
    }
    const receivedCodes = value.metrics.map((metric) => metric.code)
    if (JSON.stringify(receivedCodes) !== JSON.stringify(bodyMetricCodes)) {
      ctx.addIssue({
        code: 'custom',
        message: 'metrics must contain the canonical v2 identities in registry order',
        path: ['metrics'],
      })
    }
    for (const [index, metric] of value.metrics.entries()) {
      if (!isCanonicalDefinition(metric)) {
        ctx.addIssue({
          code: 'custom',
          message: `${metric.code} does not match the canonical ${bodyMetricRegistryVersion} definition`,
          path: ['metrics', index],
        })
      }
    }
  })

export const canonicalBodyMetricRegistry = bodyMetricRegistrySchema.parse(bodyMetricRegistry)

export type BodyMetricRegistryVersion = z.infer<typeof bodyMetricRegistryVersionSchema>
export type BodyMetricCode = z.infer<typeof bodyMetricCodeSchema>
export type BodyMetricCategory = z.infer<typeof bodyMetricCategorySchema>
export type BodyMetricRegistryStatus = z.infer<typeof bodyMetricRegistryStatusSchema>
export type BodyMetricUnitCode = z.infer<typeof bodyMetricUnitCodeSchema>
export type BodyMetricSourceCapability = z.infer<typeof bodyMetricSourceCapabilitySchema>
export type BodyMetricDefinition = z.infer<typeof bodyMetricDefinitionSchema>
export type BodyMetricRegistry = z.infer<typeof bodyMetricRegistrySchema>
