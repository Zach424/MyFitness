import * as z from 'zod'

import { equipmentSchema, weekdaySchema } from './onboarding'
import {
  nutritionFocusKeys,
  planActivityRoles,
  planEngineVersion,
  planIntensityLevels,
  planRevisionActions,
  planSessionKinds,
  planStatuses,
} from './plan.constants'

export * from './plan.constants'

const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const stableKeySchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9_]+$/)

export const planStatusSchema = z.enum(planStatuses)
export const planRevisionActionSchema = z.enum(planRevisionActions)
export const planSessionKindSchema = z.enum(planSessionKinds)
export const planIntensitySchema = z.enum(planIntensityLevels)
export const planActivityRoleSchema = z.enum(planActivityRoles)
export const nutritionFocusKeySchema = z.enum(nutritionFocusKeys)

export const planActivityOptionSchema = z
  .object({
    id: stableKeySchema,
    title: z.string().trim().min(1).max(80),
    dose: z.string().trim().min(1).max(120),
    equipment: z.array(equipmentSchema).max(3),
    note: z.string().trim().min(1).max(180).optional(),
  })
  .strict()

export const planActivitySchema = z
  .object({
    id: stableKeySchema,
    role: planActivityRoleSchema,
    selectedOptionId: stableKeySchema,
    options: z.array(planActivityOptionSchema).min(1).max(6),
    safetyNote: z.string().trim().min(1).max(180).optional(),
  })
  .strict()
  .superRefine((activity, ctx) => {
    const ids = activity.options.map((option) => option.id)
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'activity option ids must be unique',
        path: ['options'],
      })
    }
    if (!ids.includes(activity.selectedOptionId)) {
      ctx.addIssue({
        code: 'custom',
        message: 'selectedOptionId must reference an activity option',
        path: ['selectedOptionId'],
      })
    }
  })

export const planSessionSchema = z
  .object({
    kind: planSessionKindSchema,
    title: z.string().trim().min(1).max(80),
    plannedMinutes: z.number().int().min(10).max(90),
    intensity: planIntensitySchema,
    activities: z.array(planActivitySchema).min(1).max(8),
    note: z.string().trim().min(1).max(240),
  })
  .strict()

export const planDaySchema = z
  .object({
    weekday: weekdaySchema,
    date: localDateSchema,
    available: z.boolean(),
    session: planSessionSchema.nullable(),
  })
  .strict()

export const nutritionFocusSchema = z
  .object({
    key: nutritionFocusKeySchema,
    title: z.string().trim().min(1).max(60),
    action: z.string().trim().min(1).max(180),
    reason: z.string().trim().min(1).max(240),
    alternatives: z.array(z.string().trim().min(1).max(120)).min(1).max(4),
  })
  .strict()

export const planReasonSchema = z
  .object({
    code: stableKeySchema,
    label: z.string().trim().min(1).max(60),
    detail: z.string().trim().min(1).max(240),
  })
  .strict()

export const planEvidenceSchema = z
  .object({
    onboardingRevision: z.number().int().positive(),
    dashboardGeneratedAt: z.string().datetime({ offset: true }),
    readinessScore: z.number().int().min(0).max(100).nullable(),
    recentActiveDays: z.number().int().min(0),
    recentWorkoutCount: z.number().int().min(0),
    recentActiveMinutes: z.number().finite().min(0),
    recentMealCount: z.number().int().min(0),
  })
  .strict()

export const weeklyPlanContentSchema = z
  .object({
    days: z.array(planDaySchema).length(7),
    nutritionFocuses: z.array(nutritionFocusSchema).min(3).max(4),
    reasons: z.array(planReasonSchema).min(1).max(8),
    evidence: planEvidenceSchema,
  })
  .strict()
  .superRefine((content, ctx) => {
    const weekdays = content.days.map((day) => day.weekday)
    const dates = content.days.map((day) => day.date)
    if (new Set(weekdays).size !== 7) {
      ctx.addIssue({
        code: 'custom',
        message: 'plan days must contain seven weekdays',
        path: ['days'],
      })
    }
    if (new Set(dates).size !== 7) {
      ctx.addIssue({ code: 'custom', message: 'plan day dates must be unique', path: ['days'] })
    }
    const activityIds = content.days.flatMap((day) =>
      day.session ? day.session.activities.map((activity) => activity.id) : [],
    )
    if (new Set(activityIds).size !== activityIds.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'activity ids must be unique across a plan',
        path: ['days'],
      })
    }
  })

export const weeklyPlanSchema = weeklyPlanContentSchema.safeExtend({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  weekStart: localDateSchema,
  timezone: z.string().trim().min(1).max(64),
  engineVersion: z.literal(planEngineVersion),
  status: planStatusSchema,
  revision: z.number().int().positive(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
})

export const generateWeeklyPlanSchema = z
  .object({ weekStart: localDateSchema })
  .strict()
  .superRefine((input, ctx) => {
    const date = new Date(`${input.weekStart}T12:00:00.000Z`)
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input.weekStart) {
      ctx.addIssue({
        code: 'custom',
        message: 'weekStart must be a real date',
        path: ['weekStart'],
      })
    } else if (date.getUTCDay() !== 1) {
      ctx.addIssue({ code: 'custom', message: 'weekStart must be a Monday', path: ['weekStart'] })
    }
  })

export const planSelectionSchema = z
  .object({ activityId: stableKeySchema, optionId: stableKeySchema })
  .strict()

export const planDecisionSchema = z
  .object({
    decision: z.enum(['accepted', 'modified', 'skipped']),
    expectedRevision: z.number().int().positive(),
    selections: z.array(planSelectionSchema).max(24).default([]),
    note: z.string().trim().min(1).max(300).optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.decision === 'modified' && input.selections.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'modified decisions require at least one selection',
        path: ['selections'],
      })
    }
    if (input.decision !== 'modified' && input.selections.length > 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'only modified decisions may include selections',
        path: ['selections'],
      })
    }
    const ids = input.selections.map((selection) => selection.activityId)
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'an activity may be selected only once',
        path: ['selections'],
      })
    }
  })

export const weeklyPlanListSchema = z.object({ items: z.array(weeklyPlanSchema) }).strict()
export const weeklyPlanHistoryItemSchema = weeklyPlanSchema.safeExtend({
  action: planRevisionActionSchema,
  changedAt: z.string().datetime({ offset: true }),
  decisionNote: z.string().nullable(),
})
export const weeklyPlanHistorySchema = z
  .object({ planId: z.string().uuid(), items: z.array(weeklyPlanHistoryItemSchema) })
  .strict()
export const weeklyPlanIdSchema = z.string().uuid()

export type WeeklyPlanContent = z.infer<typeof weeklyPlanContentSchema>
export type WeeklyPlan = z.infer<typeof weeklyPlanSchema>
export type GenerateWeeklyPlan = z.infer<typeof generateWeeklyPlanSchema>
export type PlanDecision = z.infer<typeof planDecisionSchema>
export type WeeklyPlanHistoryItem = z.infer<typeof weeklyPlanHistoryItemSchema>
