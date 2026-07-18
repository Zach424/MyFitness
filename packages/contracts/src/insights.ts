import * as z from 'zod'

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

export type Dashboard = z.infer<typeof dashboardSchema>
export type TodayEvidence = z.infer<typeof todayEvidenceSchema>
export type TrendWindow = z.infer<typeof trendWindowSchema>
