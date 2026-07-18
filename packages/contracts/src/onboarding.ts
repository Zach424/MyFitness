import * as z from 'zod'

import {
  ageBands,
  consentVersions,
  dietaryPreferenceOptions,
  equipmentOptions,
  experienceLevels,
  primaryGoals,
  riskFlags,
  sexForCalculationOptions,
  unitSystems,
  weekdays,
} from './onboarding.constants'

export * from './onboarding.constants'

const uniqueArray = <T extends z.ZodType>(schema: T, message: string) =>
  z.array(schema).superRefine((items, ctx) => {
    if (new Set(items).size !== items.length) {
      ctx.addIssue({ code: 'custom', message })
    }
  })

export const ageBandSchema = z.enum(ageBands)
export const sexForCalculationSchema = z.enum(sexForCalculationOptions)
export const unitSystemSchema = z.enum(unitSystems)
export const primaryGoalSchema = z.enum(primaryGoals)
export const experienceLevelSchema = z.enum(experienceLevels)
export const weekdaySchema = z.enum(weekdays)
export const equipmentSchema = z.enum(equipmentOptions)
export const dietaryPreferenceSchema = z.enum(dietaryPreferenceOptions)
export const riskFlagSchema = z.enum(riskFlags)

export const devSessionRequestSchema = z
  .object({
    subject: z
      .string()
      .trim()
      .min(3)
      .max(128)
      .regex(/^[A-Za-z0-9._:-]+$/),
  })
  .strict()

export const devSessionSchema = z
  .object({
    accessToken: z.string().min(32),
    userId: z.string().uuid(),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict()

export const onboardingBaseSchema = z
  .object({
    adultConfirmed: z.literal(true),
    profile: z
      .object({
        displayName: z.string().trim().min(1).max(40),
        ageBand: ageBandSchema,
        sexForCalculations: sexForCalculationSchema,
        height: z
          .object({
            value: z.number().finite().positive(),
            unit: z.enum(['cm', 'in']),
          })
          .strict(),
        unitSystem: unitSystemSchema,
        timezone: z.string().trim().min(1).max(64),
      })
      .strict(),
    goal: z
      .object({
        primaryGoal: primaryGoalSchema,
        experience: experienceLevelSchema,
        availableDays: uniqueArray(weekdaySchema, 'availableDays must not contain duplicates')
          .min(1)
          .max(7),
        sessionMinutes: z.number().int().min(15).max(180),
        equipment: uniqueArray(equipmentSchema, 'equipment must not contain duplicates').min(1),
        dietaryPreferences: uniqueArray(
          dietaryPreferenceSchema,
          'dietaryPreferences must not contain duplicates',
        ).min(1),
      })
      .strict(),
    risk: z
      .object({
        flags: uniqueArray(riskFlagSchema, 'risk flags must not contain duplicates'),
        acknowledged: z.literal(true),
      })
      .strict(),
    consents: z
      .object({
        terms: z.object({ accepted: z.literal(true), version: z.literal(consentVersions.terms) }),
        privacy: z.object({
          accepted: z.literal(true),
          version: z.literal(consentVersions.privacy),
        }),
        healthData: z.object({
          accepted: z.literal(true),
          version: z.literal(consentVersions.healthData),
        }),
      })
      .strict(),
    expectedRevision: z.number().int().nonnegative().optional(),
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

export const onboardingRequestSchema = onboardingBaseSchema.superRefine((input, ctx) => {
  if (!isValidIanaTimezone(input.profile.timezone)) {
    ctx.addIssue({
      code: 'custom',
      message: 'timezone must be a valid IANA time zone',
      path: ['profile', 'timezone'],
    })
  }
  if (input.goal.dietaryPreferences.includes('none') && input.goal.dietaryPreferences.length > 1) {
    ctx.addIssue({
      code: 'custom',
      message: 'none cannot be combined with another dietary preference',
      path: ['goal', 'dietaryPreferences'],
    })
  }
})

export const onboardingResponseSchema = z
  .object({
    userId: z.string().uuid(),
    revision: z.number().int().positive(),
    profile: z.object({
      displayName: z.string(),
      ageBand: ageBandSchema,
      sexForCalculations: sexForCalculationSchema,
      canonicalHeightCm: z.number().finite(),
      displayHeight: z.object({ value: z.number().finite(), unit: z.enum(['cm', 'in']) }),
      unitSystem: unitSystemSchema,
      timezone: z.string(),
    }),
    goal: z.object({
      primaryGoal: primaryGoalSchema,
      experience: experienceLevelSchema,
      availableDays: z.array(weekdaySchema),
      sessionMinutes: z.number().int(),
      equipment: z.array(equipmentSchema),
      dietaryPreferences: z.array(dietaryPreferenceSchema),
    }),
    eligibility: z.object({
      status: z.enum(['eligible', 'professional_clearance_required']),
      riskFlags: z.array(riskFlagSchema),
    }),
    consents: z.array(
      z.object({
        purpose: z.enum(['terms', 'privacy', 'health_data']),
        version: z.string(),
        acceptedAt: z.string().datetime({ offset: true }),
      }),
    ),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()

export type RiskFlag = z.infer<typeof riskFlagSchema>
export type OnboardingRequest = z.infer<typeof onboardingRequestSchema>
export type OnboardingResponse = z.infer<typeof onboardingResponseSchema>
export type DevSessionRequest = z.infer<typeof devSessionRequestSchema>
export type DevSession = z.infer<typeof devSessionSchema>
