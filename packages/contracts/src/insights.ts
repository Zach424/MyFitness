import * as z from 'zod'

import { exerciseEquipmentSchema, exerciseTrackingModeSchema } from './exercise-catalog'
import { exerciseCategorySchema, exerciseKeySchema } from './workout'

export const evidenceKindSchema = z.enum(['body', 'recovery', 'workout', 'nutrition'])

export const todayEvidenceSchema = z
  .object({
    id: z.string().uuid(),
    kind: evidenceKindSchema,
    occurredAt: z.string().datetime({ offset: true }),
    title: z.string().min(1),
    value: z.string().min(1),
    note: z.string().min(1),
  })
  .strict()

export const readinessSummarySchema = z
  .object({
    score: z.number().int().min(0).max(100).nullable(),
    label: z.string().min(1),
    note: z.string().min(1),
    factors: z.array(z.object({ label: z.string(), value: z.string() }).strict()).max(4),
  })
  .strict()

export const trendWindowSchema = z
  .object({
    days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
    activeDays: z.number().int().min(0),
    measurementCount: z.number().int().min(0),
    workoutCount: z.number().int().min(0),
    mealCount: z.number().int().min(0),
    workoutVolumeKg: z.number().finite().min(0),
    activeMinutes: z.number().finite().min(0),
    energyKcal: z.number().finite().min(0),
    proteinG: z.number().finite().min(0),
  })
  .strict()

export const dashboardSchema = z
  .object({
    generatedAt: z.string().datetime({ offset: true }),
    timezone: z.string(),
    today: z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        items: z.array(todayEvidenceSchema),
      })
      .strict(),
    readiness: readinessSummarySchema,
    trends: z.array(trendWindowSchema).length(3),
  })
  .strict()

export const dashboardQuerySchema = z
  .object({
    timezone: z.string().trim().min(1).max(64),
    at: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .superRefine((query, ctx) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: query.timezone }).format()
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: 'timezone must be a valid IANA time zone',
        path: ['timezone'],
      })
    }
  })

const exerciseInsightMetricsSchema = z
  .object({
    sessionCount: z.number().int().min(0),
    completedSetCount: z.number().int().min(0),
    totalReps: z.number().int().min(0),
    volumeKg: z.number().finite().min(0),
    activeMinutes: z.number().finite().min(0),
    distanceKm: z.number().finite().min(0),
  })
  .strict()

export const exerciseInsightWindowSchema = exerciseInsightMetricsSchema.safeExtend({
  days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
})

export const exerciseInsightIdentitySchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    category: exerciseCategorySchema,
    trackingMode: exerciseTrackingModeSchema.nullable(),
    equipment: z.array(exerciseEquipmentSchema).max(6),
    equipmentNotes: z.string().trim().min(1).max(120).nullable(),
  })
  .strict()

export const exerciseInsightPointSchema = exerciseInsightMetricsSchema
  .omit({ sessionCount: true })
  .safeExtend({
    workoutId: z.string().uuid(),
    workoutRevision: z.number().int().positive(),
    occurredAt: z.string().datetime({ offset: true }),
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    identity: exerciseInsightIdentitySchema,
    totalSetCount: z.number().int().positive(),
  })
  .strict()

export const exerciseInsightSchema = z
  .object({
    generatedAt: z.string().datetime({ offset: true }),
    timezone: z.string().trim().min(1).max(64),
    exerciseKey: exerciseKeySchema,
    identity: exerciseInsightIdentitySchema.nullable(),
    windows: z.array(exerciseInsightWindowSchema).length(3),
    series: z.array(exerciseInsightPointSchema).max(180),
    hasMore: z.boolean(),
  })
  .strict()

export const exerciseInsightQuerySchema = dashboardQuerySchema

export type Dashboard = z.infer<typeof dashboardSchema>
export type TodayEvidence = z.infer<typeof todayEvidenceSchema>
export type TrendWindow = z.infer<typeof trendWindowSchema>
export type ExerciseInsight = z.infer<typeof exerciseInsightSchema>
export type ExerciseInsightWindow = z.infer<typeof exerciseInsightWindowSchema>
export type ExerciseInsightPoint = z.infer<typeof exerciseInsightPointSchema>
