import * as z from 'zod'

import { exerciseEquipmentSchema, exerciseTrackingModeSchema } from './exercise-catalog'
import {
  isPersistedMeasurementConversionConsistent,
  metricCodeSchema,
  metricUnitDefinitions,
  recordSourceSchema,
  unitCodeSchema,
} from './health-record'
import { personalStateLedgerSchema } from './personal-state'
import { recoveryStateEstimateSchema } from './recovery-state'
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

export const readinessSummarySchema = recoveryStateEstimateSchema

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

const fixedInsightWindowDays = [7, 30, 90] as const

const validateFixedInsightWindowDays = (
  windows: Array<{ days: number }>,
  path: 'trends' | 'windows',
  ctx: z.RefinementCtx,
) => {
  windows.forEach((window, index) => {
    if (window.days !== fixedInsightWindowDays[index]) {
      ctx.addIssue({
        code: 'custom',
        message: 'insight windows must use the fixed 7/30/90 order',
        path: [path, index, 'days'],
      })
    }
  })
}

const localDateInTimezone = (instant: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

const shiftLocalDate = (localDate: string, days: number) => {
  const [year, month, day] = localDate.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10)
}

const expectedLocalDateSeries = (instant: Date, timezone: string, length: number) => {
  const endDate = localDateInTimezone(instant, timezone)
  return Array.from({ length }, (_, index) => shiftLocalDate(endDate, index - length + 1))
}

export const dashboardSchema = z
  .object({
    generatedAt: z.string().datetime({ offset: true }),
    timezone: z.string().trim().min(1).max(64),
    today: z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        items: z.array(todayEvidenceSchema),
      })
      .strict(),
    readiness: readinessSummarySchema,
    trends: z.array(trendWindowSchema).length(3),
    personalState: personalStateLedgerSchema,
  })
  .strict()
  .superRefine((dashboard, ctx) => {
    const ledger = dashboard.personalState
    const referenceTime = Date.parse(dashboard.generatedAt)
    validateFixedInsightWindowDays(dashboard.trends, 'trends', ctx)
    let expectedTodayDate: string | null = null
    try {
      expectedTodayDate = localDateInTimezone(new Date(dashboard.generatedAt), dashboard.timezone)
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: 'timezone must resolve the generatedAt local date',
        path: ['timezone'],
      })
    }
    if (expectedTodayDate !== null && dashboard.today.date !== expectedTodayDate) {
      ctx.addIssue({
        code: 'custom',
        message: 'today.date must match the generatedAt local date',
        path: ['today', 'date'],
      })
    }
    const trend = dashboard.trends.find((candidate) => candidate.days === 7)
    const expectedSources = ['manual', 'device', 'imported'].filter((kind) =>
      dashboard.readiness.evidence.some((evidence) => evidence.sourceKind === kind),
    )
    const expectedLatestEvidenceAt = dashboard.readiness.evidence.reduce<string | null>(
      (latest, evidence) =>
        latest === null || Date.parse(evidence.occurredAt) > Date.parse(latest)
          ? evidence.occurredAt
          : latest,
      null,
    )
    const ledgerMismatch =
      ledger.generatedAt !== dashboard.generatedAt ||
      ledger.observedWindow.window.endAt !== dashboard.generatedAt ||
      ledger.observedWindow.freshness.asOf !== dashboard.generatedAt ||
      ledger.recoveryEstimate.freshness.asOf !== dashboard.generatedAt ||
      (ledger.planExperience !== null &&
        (ledger.planExperience.freshness.asOf !== dashboard.generatedAt ||
          Date.parse(ledger.planExperience.updatedAt) > Date.parse(dashboard.generatedAt))) ||
      ledger.recoveryEstimate.state !== dashboard.readiness.state ||
      ledger.recoveryEstimate.confidence !== dashboard.readiness.confidence ||
      ledger.recoveryEstimate.consistency !== dashboard.readiness.consistency ||
      ledger.recoveryEstimate.label !== dashboard.readiness.label ||
      ledger.recoveryEstimate.evidenceCount !== dashboard.readiness.evidence.length ||
      !trend ||
      ledger.observedWindow.activeDays !== trend.activeDays ||
      ledger.observedWindow.measurementCount !== trend.measurementCount ||
      ledger.observedWindow.workoutCount !== trend.workoutCount ||
      ledger.observedWindow.mealCount !== trend.mealCount
    const confirmedMismatch = expectedLatestEvidenceAt
      ? !ledger.confirmedRecovery ||
        ledger.confirmedRecovery.observationCount !== dashboard.readiness.evidence.length ||
        ledger.confirmedRecovery.latestEvidenceAt !== expectedLatestEvidenceAt ||
        ledger.confirmedRecovery.sourceKinds.join(',') !== expectedSources.join(',') ||
        ledger.confirmedRecovery.freshness.asOf !== dashboard.generatedAt
      : ledger.confirmedRecovery !== null
    const futureEvidence =
      dashboard.today.items.some((item) => Date.parse(item.occurredAt) > referenceTime) ||
      dashboard.readiness.evidence.some(
        (evidence) => Date.parse(evidence.occurredAt) > referenceTime,
      )
    if (futureEvidence) {
      ctx.addIssue({
        code: 'custom',
        message: 'dashboard evidence cannot occur after generatedAt',
        path: ['generatedAt'],
      })
    }
    if (ledgerMismatch || confirmedMismatch) {
      ctx.addIssue({
        code: 'custom',
        message: 'personal state ledger must match its dashboard authorities',
        path: ['personalState'],
      })
    }
  })

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

export const historyCalendarDaySchema = z
  .object({
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    hasRecords: z.boolean(),
    healthRecordCount: z.number().int().min(0),
    workoutCount: z.number().int().min(0),
    mealCount: z.number().int().min(0),
  })
  .strict()
  .superRefine((day, ctx) => {
    const count = day.healthRecordCount + day.workoutCount + day.mealCount
    if (day.hasRecords !== count > 0) {
      ctx.addIssue({ code: 'custom', message: 'hasRecords must match current record counts' })
    }
  })

export const historyCalendarSchema = z
  .object({
    generatedAt: z.string().datetime({ offset: true }),
    timezone: z.string().trim().min(1).max(64),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    series: z.array(historyCalendarDaySchema).length(28),
  })
  .strict()
  .superRefine((calendar, ctx) => {
    let expectedDates: string[]
    try {
      expectedDates = expectedLocalDateSeries(new Date(calendar.generatedAt), calendar.timezone, 28)
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: 'timezone must resolve the generatedAt local date',
        path: ['timezone'],
      })
      return
    }
    const dateMismatchIndex = calendar.series.findIndex(
      (day, index) => day.localDate !== expectedDates[index],
    )
    if (dateMismatchIndex >= 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'calendar series must cover 28 consecutive reference local dates',
        path: ['series', dateMismatchIndex, 'localDate'],
      })
    }
    if (calendar.startDate !== expectedDates[0]) {
      ctx.addIssue({
        code: 'custom',
        message: 'startDate must match the reference local-date range',
        path: ['startDate'],
      })
    }
    if (calendar.endDate !== expectedDates.at(-1)) {
      ctx.addIssue({
        code: 'custom',
        message: 'endDate must match the reference local-date range',
        path: ['endDate'],
      })
    }
  })

export const historyCalendarQuerySchema = dashboardQuerySchema

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

export const exerciseInsightWindowSchema = exerciseInsightMetricsSchema
  .safeExtend({
    days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
  })
  .superRefine((window, ctx) => {
    if (window.sessionCount > window.completedSetCount) {
      ctx.addIssue({
        code: 'custom',
        message: 'sessionCount cannot exceed completedSetCount',
        path: ['sessionCount'],
      })
    }
    if (window.sessionCount === 0 && window.completedSetCount !== 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'empty exercise windows cannot contain completed sets',
        path: ['completedSetCount'],
      })
    }
    if (window.completedSetCount === 0) {
      const measurementFields = ['totalReps', 'volumeKg', 'activeMinutes', 'distanceKm'] as const
      measurementFields.forEach((field) => {
        if (window[field] !== 0) {
          ctx.addIssue({
            code: 'custom',
            message: `exercise windows without completed sets must keep ${field} zero`,
            path: [field],
          })
        }
      })
    }
  })

const exerciseInsightWindowMonotonicFields = [
  'sessionCount',
  'completedSetCount',
  'totalReps',
  'volumeKg',
  'activeMinutes',
  'distanceKm',
] as const

const validateExerciseInsightWindowMonotonicity = (
  windows: Array<z.infer<typeof exerciseInsightWindowSchema>>,
  ctx: z.RefinementCtx,
) => {
  for (let index = 1; index < windows.length; index += 1) {
    const shorter = windows[index - 1]!
    const longer = windows[index]!
    exerciseInsightWindowMonotonicFields.forEach((field) => {
      if (longer[field] < shorter[field]) {
        ctx.addIssue({
          code: 'custom',
          message: `exercise window ${field} must not decrease as days increase`,
          path: ['windows', index, field],
        })
      }
    })
  }
}

export const exerciseInsightIdentitySchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    category: exerciseCategorySchema,
    trackingMode: exerciseTrackingModeSchema.nullable(),
    equipment: z.array(exerciseEquipmentSchema).max(6),
    equipmentNotes: z.string().trim().min(1).max(120).nullable(),
  })
  .strict()
  .superRefine((identity, ctx) => {
    if (new Set(identity.equipment).size !== identity.equipment.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'exercise insight equipment must not contain duplicates',
        path: ['equipment'],
      })
    }
    if (identity.equipment.includes('other') && identity.equipmentNotes === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'equipmentNotes is required when equipment contains other',
        path: ['equipmentNotes'],
      })
    }
  })

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
  .superRefine((point, ctx) => {
    if (point.completedSetCount === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'exercise insight points require a completed set',
        path: ['completedSetCount'],
      })
    }
    if (point.completedSetCount > point.totalSetCount) {
      ctx.addIssue({
        code: 'custom',
        message: 'completedSetCount cannot exceed totalSetCount',
        path: ['completedSetCount'],
      })
    }
  })

const validateInsightOccurrenceBoundary = (
  insight: { generatedAt: string; series: Array<{ occurredAt: string }> },
  ctx: z.RefinementCtx,
) => {
  const referenceTime = Date.parse(insight.generatedAt)
  insight.series.forEach((point, index) => {
    if (Date.parse(point.occurredAt) > referenceTime) {
      ctx.addIssue({
        code: 'custom',
        message: 'insight point cannot occur after generatedAt',
        path: ['series', index, 'occurredAt'],
      })
    }
  })
}

const validateInsightPointLocalDates = (
  insight: {
    generatedAt: string
    timezone: string
    series: Array<{ occurredAt: string; localDate: string }>
  },
  ctx: z.RefinementCtx,
) => {
  try {
    localDateInTimezone(new Date(insight.generatedAt), insight.timezone)
  } catch {
    ctx.addIssue({
      code: 'custom',
      message: 'timezone must resolve insight point local dates',
      path: ['timezone'],
    })
    return
  }
  insight.series.forEach((point, index) => {
    if (point.localDate !== localDateInTimezone(new Date(point.occurredAt), insight.timezone)) {
      ctx.addIssue({
        code: 'custom',
        message: 'insight point localDate must match occurredAt in the response timezone',
        path: ['series', index, 'localDate'],
      })
    }
  })
}

const validateInsightPointOrder = (
  insight: { series: Array<{ occurredAt: string }> },
  ctx: z.RefinementCtx,
) => {
  for (let index = 1; index < insight.series.length; index += 1) {
    if (
      Date.parse(insight.series[index]!.occurredAt) >
      Date.parse(insight.series[index - 1]!.occurredAt)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'insight points must be ordered by occurredAt descending',
        path: ['series', index, 'occurredAt'],
      })
    }
  }
}

const validateUniqueInsightPointIds = <Point>(
  series: Point[],
  idOf: (point: Point) => string,
  pathField: 'workoutId' | 'recordId',
  ctx: z.RefinementCtx,
) => {
  const seen = new Set<string>()
  series.forEach((point, index) => {
    const id = idOf(point)
    if (seen.has(id)) {
      ctx.addIssue({
        code: 'custom',
        message: 'insight points must have unique aggregate identities',
        path: ['series', index, pathField],
      })
    }
    seen.add(id)
  })
}

const exerciseInsightIdentityMatches = (
  actual: z.infer<typeof exerciseInsightIdentitySchema> | null,
  expected: z.infer<typeof exerciseInsightIdentitySchema> | null,
) => {
  if (actual === null || expected === null) {
    return actual === expected
  }
  return (
    actual.name === expected.name &&
    actual.category === expected.category &&
    actual.trackingMode === expected.trackingMode &&
    actual.equipmentNotes === expected.equipmentNotes &&
    actual.equipment.length === expected.equipment.length &&
    actual.equipment.every((item, index) => item === expected.equipment[index])
  )
}

const validateExerciseInsightIdentity = (
  insight: {
    identity: z.infer<typeof exerciseInsightIdentitySchema> | null
    series: Array<{ identity: z.infer<typeof exerciseInsightIdentitySchema> }>
  },
  ctx: z.RefinementCtx,
) => {
  if (!exerciseInsightIdentityMatches(insight.identity, insight.series[0]?.identity ?? null)) {
    ctx.addIssue({
      code: 'custom',
      message: 'exercise identity must match the latest insight point',
      path: ['identity'],
    })
  }
}

const validateInsightTruncationReceipt = (
  insight: { series: unknown[]; hasMore: boolean },
  ctx: z.RefinementCtx,
) => {
  if (insight.hasMore && insight.series.length !== 180) {
    ctx.addIssue({
      code: 'custom',
      message: 'hasMore requires a full 180-point public prefix',
      path: ['hasMore'],
    })
  }
}

const validateHealthInsightWindowPointReceipt = (
  insight: {
    windows: Array<{ days: number; recordCount: number }>
    series: unknown[]
    hasMore: boolean
  },
  ctx: z.RefinementCtx,
) => {
  const windowIndex = insight.windows.findIndex((window) => window.days === 90)
  if (windowIndex < 0) return
  const recordCount = insight.windows[windowIndex]!.recordCount
  if (insight.series.length !== Math.min(recordCount, 180)) {
    ctx.addIssue({
      code: 'custom',
      message: '90-day recordCount must match the public health point prefix',
      path: ['windows', windowIndex, 'recordCount'],
    })
  }
  if (insight.hasMore !== recordCount > 180) {
    ctx.addIssue({
      code: 'custom',
      message: 'hasMore must match the 90-day health record count',
      path: ['hasMore'],
    })
  }
}

const validateExerciseInsightWindowPointReceipt = (
  insight: {
    windows: Array<{ days: number; sessionCount: number }>
    series: unknown[]
    hasMore: boolean
  },
  ctx: z.RefinementCtx,
) => {
  const windowIndex = insight.windows.findIndex((window) => window.days === 90)
  if (windowIndex < 0) return
  const sessionCount = insight.windows[windowIndex]!.sessionCount
  if (insight.series.length !== Math.min(sessionCount, 180)) {
    ctx.addIssue({
      code: 'custom',
      message: '90-day sessionCount must match the public exercise point prefix',
      path: ['windows', windowIndex, 'sessionCount'],
    })
  }
  if (insight.hasMore !== sessionCount > 180) {
    ctx.addIssue({
      code: 'custom',
      message: 'hasMore must match the 90-day exercise session count',
      path: ['hasMore'],
    })
  }
}

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
  .superRefine((insight, ctx) => {
    validateFixedInsightWindowDays(insight.windows, 'windows', ctx)
    validateExerciseInsightWindowMonotonicity(insight.windows, ctx)
    validateInsightPointLocalDates(insight, ctx)
    validateInsightPointOrder(insight, ctx)
    validateUniqueInsightPointIds(insight.series, (point) => point.workoutId, 'workoutId', ctx)
    validateExerciseInsightIdentity(insight, ctx)
    validateInsightTruncationReceipt(insight, ctx)
    validateExerciseInsightWindowPointReceipt(insight, ctx)
    validateInsightOccurrenceBoundary(insight, ctx)
  })

export const exerciseInsightQuerySchema = dashboardQuerySchema

const nutritionInsightNutrientsSchema = z
  .object({
    energyKcal: z.number().finite().min(0).nullable(),
    proteinG: z.number().finite().min(0).nullable(),
    carbohydrateG: z.number().finite().min(0).nullable(),
    fatG: z.number().finite().min(0).nullable(),
    fiberG: z.number().finite().min(0).nullable(),
  })
  .strict()

const validateNutritionEvidence = (
  evidence: {
    mealCount: number
    itemCount: number
    fiberKnownItemCount: number
    nutrients: z.infer<typeof nutritionInsightNutrientsSchema>
  },
  ctx: z.RefinementCtx,
) => {
  if (evidence.fiberKnownItemCount > evidence.itemCount) {
    ctx.addIssue({
      code: 'custom',
      message: 'fiberKnownItemCount cannot exceed itemCount',
      path: ['fiberKnownItemCount'],
    })
  }
  const required = [
    evidence.nutrients.energyKcal,
    evidence.nutrients.proteinG,
    evidence.nutrients.carbohydrateG,
    evidence.nutrients.fatG,
  ]
  if (
    evidence.mealCount === 0 &&
    (evidence.itemCount !== 0 || required.some((value) => value !== null))
  ) {
    ctx.addIssue({ code: 'custom', message: 'missing evidence must keep required nutrients null' })
  }
  if (
    evidence.mealCount > 0 &&
    (evidence.itemCount === 0 || required.some((value) => value === null))
  ) {
    ctx.addIssue({ code: 'custom', message: 'recorded evidence requires item and nutrient totals' })
  }
  if ((evidence.fiberKnownItemCount === 0) !== (evidence.nutrients.fiberG === null)) {
    ctx.addIssue({
      code: 'custom',
      message: 'fiber total is present only when at least one item has fiber evidence',
      path: ['nutrients', 'fiberG'],
    })
  }
}

export const nutritionInsightDaySchema = z
  .object({
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    hasEvidence: z.boolean(),
    mealCount: z.number().int().min(0),
    itemCount: z.number().int().min(0),
    fiberKnownItemCount: z.number().int().min(0),
    nutrients: nutritionInsightNutrientsSchema,
  })
  .strict()
  .superRefine((day, ctx) => {
    validateNutritionEvidence(day, ctx)
    if (day.hasEvidence !== day.mealCount > 0) {
      ctx.addIssue({ code: 'custom', message: 'hasEvidence must match mealCount' })
    }
  })

export const nutritionInsightWindowSchema = z
  .object({
    days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
    recordedDays: z.number().int().min(0),
    missingDays: z.number().int().min(0),
    mealCount: z.number().int().min(0),
    itemCount: z.number().int().min(0),
    fiberKnownItemCount: z.number().int().min(0),
    nutrients: nutritionInsightNutrientsSchema,
  })
  .strict()
  .superRefine((window, ctx) => {
    validateNutritionEvidence(window, ctx)
    if (window.recordedDays + window.missingDays !== window.days) {
      ctx.addIssue({ code: 'custom', message: 'recorded and missing days must fill the window' })
    }
    if ((window.recordedDays === 0) !== (window.mealCount === 0)) {
      ctx.addIssue({ code: 'custom', message: 'recordedDays must match meal evidence' })
    }
  })

const roundNutritionTotal = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

const expectedNutritionWindow = (
  series: Array<z.infer<typeof nutritionInsightDaySchema>>,
  days: 7 | 30 | 90,
) => {
  const selected = series.slice(-days)
  const recordedDays = selected.filter((day) => day.hasEvidence).length
  const sum = (nutrient: keyof z.infer<typeof nutritionInsightNutrientsSchema>) => {
    const values = selected.flatMap((day) => {
      const value = day.nutrients[nutrient]
      return value === null ? [] : [value]
    })
    return values.length
      ? roundNutritionTotal(values.reduce((total, value) => total + value, 0))
      : null
  }
  return {
    days,
    recordedDays,
    missingDays: days - recordedDays,
    mealCount: selected.reduce((total, day) => total + day.mealCount, 0),
    itemCount: selected.reduce((total, day) => total + day.itemCount, 0),
    fiberKnownItemCount: selected.reduce((total, day) => total + day.fiberKnownItemCount, 0),
    nutrients: {
      energyKcal: sum('energyKcal'),
      proteinG: sum('proteinG'),
      carbohydrateG: sum('carbohydrateG'),
      fatG: sum('fatG'),
      fiberG: sum('fiberG'),
    },
  }
}

const nutritionWindowMatches = (
  actual: z.infer<typeof nutritionInsightWindowSchema>,
  expected: ReturnType<typeof expectedNutritionWindow>,
) =>
  actual.days === expected.days &&
  actual.recordedDays === expected.recordedDays &&
  actual.missingDays === expected.missingDays &&
  actual.mealCount === expected.mealCount &&
  actual.itemCount === expected.itemCount &&
  actual.fiberKnownItemCount === expected.fiberKnownItemCount &&
  actual.nutrients.energyKcal === expected.nutrients.energyKcal &&
  actual.nutrients.proteinG === expected.nutrients.proteinG &&
  actual.nutrients.carbohydrateG === expected.nutrients.carbohydrateG &&
  actual.nutrients.fatG === expected.nutrients.fatG &&
  actual.nutrients.fiberG === expected.nutrients.fiberG

export const nutritionInsightSchema = z
  .object({
    generatedAt: z.string().datetime({ offset: true }),
    timezone: z.string().trim().min(1).max(64),
    windows: z.array(nutritionInsightWindowSchema).length(3),
    series: z.array(nutritionInsightDaySchema).length(90),
  })
  .strict()
  .superRefine((insight, ctx) => {
    let expectedDates: string[]
    try {
      expectedDates = expectedLocalDateSeries(new Date(insight.generatedAt), insight.timezone, 90)
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: 'timezone must resolve the generatedAt local date',
        path: ['timezone'],
      })
      return
    }
    const dateMismatchIndex = insight.series.findIndex(
      (day, index) => day.localDate !== expectedDates[index],
    )
    if (dateMismatchIndex >= 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'nutrition series must cover 90 consecutive reference local dates',
        path: ['series', dateMismatchIndex, 'localDate'],
      })
    }
    ;([7, 30, 90] as const).forEach((days, index) => {
      const window = insight.windows[index]
      const expected = expectedNutritionWindow(insight.series, days)
      if (!window || !nutritionWindowMatches(window, expected)) {
        ctx.addIssue({
          code: 'custom',
          message: 'nutrition windows must be derived from the accepted date series',
          path: ['windows', index],
        })
      }
    })
  })

export const nutritionInsightQuerySchema = dashboardQuerySchema

const healthInsightStatisticsSchema = z
  .object({
    minimum: z.number().finite().nullable(),
    maximum: z.number().finite().nullable(),
    average: z.number().finite().nullable(),
  })
  .strict()

export const healthInsightWindowSchema = z
  .object({
    days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
    recordCount: z.number().int().min(0),
    recordedDays: z.number().int().min(0),
    statistics: healthInsightStatisticsSchema,
  })
  .strict()
  .superRefine((window, ctx) => {
    if (window.recordedDays > window.recordCount) {
      ctx.addIssue({ code: 'custom', message: 'recordedDays cannot exceed recordCount' })
    }
    const statistics = Object.values(window.statistics)
    if (window.recordCount === 0 && statistics.some((value) => value !== null)) {
      ctx.addIssue({ code: 'custom', message: 'empty windows must keep statistics null' })
    }
    if (window.recordCount > 0 && statistics.some((value) => value === null)) {
      ctx.addIssue({ code: 'custom', message: 'recorded windows require statistics' })
    }
    if (window.recordCount > 0 && window.recordedDays === 0) {
      ctx.addIssue({ code: 'custom', message: 'recorded windows require a recorded day' })
    }
    const { minimum, maximum, average } = window.statistics
    if (
      minimum !== null &&
      maximum !== null &&
      average !== null &&
      (minimum > average || average > maximum)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'health statistics must satisfy minimum <= average <= maximum',
        path: ['statistics'],
      })
    }
  })

const validateHealthInsightWindowMonotonicity = (
  windows: Array<z.infer<typeof healthInsightWindowSchema>>,
  ctx: z.RefinementCtx,
) => {
  for (let index = 1; index < windows.length; index += 1) {
    const shorter = windows[index - 1]!
    const longer = windows[index]!
    if (longer.recordCount < shorter.recordCount) {
      ctx.addIssue({
        code: 'custom',
        message: 'health window recordCount must not decrease as days increase',
        path: ['windows', index, 'recordCount'],
      })
    }
    if (longer.recordedDays < shorter.recordedDays) {
      ctx.addIssue({
        code: 'custom',
        message: 'health window recordedDays must not decrease as days increase',
        path: ['windows', index, 'recordedDays'],
      })
    }
    if (
      shorter.statistics.minimum !== null &&
      (longer.statistics.minimum === null || longer.statistics.minimum > shorter.statistics.minimum)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'health window minimum cannot increase as days increase',
        path: ['windows', index, 'statistics', 'minimum'],
      })
    }
    if (
      shorter.statistics.maximum !== null &&
      (longer.statistics.maximum === null || longer.statistics.maximum < shorter.statistics.maximum)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'health window maximum cannot decrease as days increase',
        path: ['windows', index, 'statistics', 'maximum'],
      })
    }
  }
}

export const healthInsightRecordTimezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(
    (timezone) => {
      try {
        localDateInTimezone(new Date(0), timezone)
        return true
      } catch {
        return false
      }
    },
    { message: 'recordTimezone must be a valid IANA time zone' },
  )

export const confirmedHealthInsightSourceSchema = recordSourceSchema.refine(
  (source) => source.kind !== 'ai_estimate',
  {
    message: 'health insight points require confirmed non-AI sources',
    path: ['kind'],
  },
)

export const healthInsightPointSchema = z
  .object({
    recordId: z.string().uuid(),
    metric: metricCodeSchema,
    recordRevision: z.number().int().positive(),
    occurredAt: z.string().datetime({ offset: true }),
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    recordTimezone: healthInsightRecordTimezoneSchema,
    canonicalValue: z.number().finite(),
    canonicalUnit: unitCodeSchema,
    displayValue: z.number().finite(),
    displayUnit: unitCodeSchema,
    source: confirmedHealthInsightSourceSchema,
  })
  .strict()

export const healthInsightSchema = z
  .object({
    generatedAt: z.string().datetime({ offset: true }),
    timezone: z.string().trim().min(1).max(64),
    metric: metricCodeSchema,
    canonicalUnit: unitCodeSchema.nullable(),
    windows: z.array(healthInsightWindowSchema).length(3),
    series: z.array(healthInsightPointSchema).max(180),
    hasMore: z.boolean(),
  })
  .strict()
  .superRefine((insight, ctx) => {
    validateFixedInsightWindowDays(insight.windows, 'windows', ctx)
    validateHealthInsightWindowMonotonicity(insight.windows, ctx)
    validateInsightPointLocalDates(insight, ctx)
    validateInsightPointOrder(insight, ctx)
    validateUniqueInsightPointIds(insight.series, (point) => point.recordId, 'recordId', ctx)
    const metricUnits = metricUnitDefinitions[insight.metric]
    insight.series.forEach((point, index) => {
      if (point.metric !== insight.metric) {
        ctx.addIssue({
          code: 'custom',
          message: 'health insight point metric must match the requested metric',
          path: ['series', index, 'metric'],
        })
      }
      const canonicalUnitMatches = point.canonicalUnit === metricUnits.canonicalUnit
      const displayUnitAllowed = (metricUnits.allowedUnits as readonly string[]).includes(
        point.displayUnit,
      )
      if (!canonicalUnitMatches) {
        ctx.addIssue({
          code: 'custom',
          message: 'health insight canonicalUnit must match the metric definition',
          path: ['series', index, 'canonicalUnit'],
        })
      }
      if (!displayUnitAllowed) {
        ctx.addIssue({
          code: 'custom',
          message: 'health insight displayUnit must be allowed for the metric',
          path: ['series', index, 'displayUnit'],
        })
      }
      if (
        canonicalUnitMatches &&
        displayUnitAllowed &&
        !isPersistedMeasurementConversionConsistent(
          point.canonicalValue,
          point.canonicalUnit,
          point.displayValue,
          point.displayUnit,
        )
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'health insight values must match the persisted unit conversion',
          path: ['series', index, 'canonicalValue'],
        })
      }
    })
    const canonicalUnit = insight.series[0]?.canonicalUnit ?? null
    if (insight.canonicalUnit !== canonicalUnit) {
      ctx.addIssue({
        code: 'custom',
        message: 'canonicalUnit must match the latest health insight point',
        path: ['canonicalUnit'],
      })
    }
    insight.series.forEach((point, index) => {
      if (point.canonicalUnit !== canonicalUnit) {
        ctx.addIssue({
          code: 'custom',
          message: 'health insight points must share one canonicalUnit',
          path: ['series', index, 'canonicalUnit'],
        })
      }
    })
    validateInsightTruncationReceipt(insight, ctx)
    validateHealthInsightWindowPointReceipt(insight, ctx)
    validateInsightOccurrenceBoundary(insight, ctx)
  })

export const healthInsightQuerySchema = dashboardQuerySchema

export type Dashboard = z.infer<typeof dashboardSchema>
export type HistoryCalendar = z.infer<typeof historyCalendarSchema>
export type HistoryCalendarDay = z.infer<typeof historyCalendarDaySchema>
export type TodayEvidence = z.infer<typeof todayEvidenceSchema>
export type TrendWindow = z.infer<typeof trendWindowSchema>
export type ExerciseInsight = z.infer<typeof exerciseInsightSchema>
export type ExerciseInsightWindow = z.infer<typeof exerciseInsightWindowSchema>
export type ExerciseInsightPoint = z.infer<typeof exerciseInsightPointSchema>
export type NutritionInsight = z.infer<typeof nutritionInsightSchema>
export type NutritionInsightDay = z.infer<typeof nutritionInsightDaySchema>
export type NutritionInsightWindow = z.infer<typeof nutritionInsightWindowSchema>
export type HealthInsight = z.infer<typeof healthInsightSchema>
export type HealthInsightPoint = z.infer<typeof healthInsightPointSchema>
export type HealthInsightWindow = z.infer<typeof healthInsightWindowSchema>
