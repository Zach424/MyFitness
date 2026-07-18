import * as z from 'zod'

export const metricCodes = [
  'body.weight',
  'body.waist',
  'body.body_fat',
  'body.resting_heart_rate',
  'recovery.sleep_duration',
  'recovery.sleep_quality',
  'recovery.soreness',
  'recovery.energy',
  'recovery.stress',
] as const

export const unitCodes = [
  'kg',
  'lb',
  'cm',
  'in',
  'percent',
  'bpm',
  'minute',
  'hour',
  'score_1_5',
] as const

export const sourceKinds = ['manual', 'device', 'imported', 'ai_estimate'] as const
export const recordStatuses = ['candidate', 'confirmed'] as const

export const metricCodeSchema = z.enum(metricCodes)
export const unitCodeSchema = z.enum(unitCodes)
export const sourceKindSchema = z.enum(sourceKinds)
export const recordStatusSchema = z.enum(recordStatuses)

export const sourceMetadataSchema = z
  .object({
    provider: z.string().trim().min(1).max(80).optional(),
    externalId: z.string().trim().min(1).max(160).optional(),
    deviceName: z.string().trim().min(1).max(120).optional(),
    modelVersion: z.string().trim().min(1).max(120).optional(),
    promptVersion: z.string().trim().min(1).max(120).optional(),
  })
  .strict()

export const recordSourceSchema = z
  .object({
    kind: sourceKindSchema,
    metadata: sourceMetadataSchema.optional(),
  })
  .strict()

export const createHealthRecordBaseSchema = z
  .object({
    metric: metricCodeSchema,
    value: z.number().finite(),
    unit: unitCodeSchema,
    source: recordSourceSchema,
    confidence: z.number().min(0).max(1).optional(),
    status: recordStatusSchema,
    occurredAt: z.string().datetime({ offset: true }),
    timezone: z.string().trim().min(1).max(64),
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

export const createHealthRecordSchema = createHealthRecordBaseSchema.superRefine((record, ctx) => {
  if (!isValidIanaTimezone(record.timezone)) {
    ctx.addIssue({
      code: 'custom',
      message: 'timezone must be a valid IANA time zone',
      path: ['timezone'],
    })
  }

  if (record.source.kind === 'ai_estimate') {
    if (record.status !== 'candidate') {
      ctx.addIssue({
        code: 'custom',
        message: 'AI estimates must remain candidates until explicit confirmation',
        path: ['status'],
      })
    }
    if (record.confidence === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'AI estimates require confidence',
        path: ['confidence'],
      })
    }
    if (!record.source.metadata?.modelVersion || !record.source.metadata.promptVersion) {
      ctx.addIssue({
        code: 'custom',
        message: 'AI estimates require modelVersion and promptVersion provenance',
        path: ['source', 'metadata'],
      })
    }
  } else {
    if (record.status !== 'confirmed') {
      ctx.addIssue({
        code: 'custom',
        message: 'non-AI measurements are confirmed records',
        path: ['status'],
      })
    }
    if (record.confidence !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'confidence is reserved for AI estimates',
        path: ['confidence'],
      })
    }
  }
})

export const healthRecordSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    metric: metricCodeSchema,
    canonicalValue: z.number().finite(),
    canonicalUnit: unitCodeSchema,
    displayValue: z.number().finite(),
    displayUnit: unitCodeSchema,
    source: recordSourceSchema,
    confidence: z.number().min(0).max(1).nullable(),
    status: recordStatusSchema,
    occurredAt: z.string().datetime({ offset: true }),
    timezone: z.string(),
    revision: z.number().int().positive(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()

export const healthRecordListSchema = z
  .object({
    items: z.array(healthRecordSchema),
  })
  .strict()

export const problemDetailsSchema = z
  .object({
    statusCode: z.number().int(),
    message: z.union([z.string(), z.array(z.string())]),
    error: z.string().optional(),
    issues: z
      .array(
        z.object({
          path: z.string(),
          message: z.string(),
        }),
      )
      .optional(),
  })
  .passthrough()

export const demoUserIdSchema = z.string().uuid()
export const idempotencyKeySchema = z.string().trim().min(8).max(128)

export type MetricCode = z.infer<typeof metricCodeSchema>
export type UnitCode = z.infer<typeof unitCodeSchema>
export type RecordSource = z.infer<typeof recordSourceSchema>
export type CreateHealthRecord = z.infer<typeof createHealthRecordSchema>
export type HealthRecord = z.infer<typeof healthRecordSchema>
