import * as z from 'zod'

import { planExperienceChoiceSchema } from './plan'
import {
  personalStateInvalidationReasons,
  personalStateLedgerPolicyVersion,
} from './personal-state.constants'
import {
  recoveryConfidenceSchema,
  recoveryConsistencySchema,
  recoveryStatePolicyVersion,
  recoveryStateValueSchema,
} from './recovery-state'

export * from './personal-state.constants'

export const personalStateInvalidationReasonSchema = z.enum(personalStateInvalidationReasons)

const personalStateFreshnessSchema = z
  .object({
    asOf: z.string().datetime({ offset: true }),
    validUntil: z.null(),
    invalidatedBy: z.array(personalStateInvalidationReasonSchema).min(1).max(2),
  })
  .strict()
  .refine((freshness) => new Set(freshness.invalidatedBy).size === freshness.invalidatedBy.length, {
    message: 'personal state invalidation reasons must be unique',
  })

const sourceRecordFreshnessSchema = personalStateFreshnessSchema.refine(
  (freshness) => freshness.invalidatedBy.join(',') === 'source_record_changed,time_advanced',
  { message: 'source-backed personal state must expire after source or time changes' },
)

const planReflectionFreshnessSchema = personalStateFreshnessSchema.refine(
  (freshness) => freshness.invalidatedBy.join(',') === 'plan_reflection_changed',
  { message: 'plan experience must expire after its reflection changes' },
)

const confirmedRecoveryEvidenceSchema = z
  .object({
    kind: z.literal('confirmed_recovery_evidence'),
    knowledgeClass: z.literal('confirmed'),
    authority: z.literal('dashboard.readiness.evidence'),
    observationCount: z.number().int().positive().max(148),
    latestEvidenceAt: z.string().datetime({ offset: true }),
    sourceKinds: z
      .array(z.enum(['manual', 'device', 'imported']))
      .min(1)
      .max(3),
    freshness: sourceRecordFreshnessSchema,
  })
  .strict()

const observedRecordingWindowSchema = z
  .object({
    kind: z.literal('recording_window'),
    knowledgeClass: z.literal('observed'),
    authority: z.literal('dashboard.trends[days=7]'),
    window: z
      .object({
        startAt: z.string().datetime({ offset: true }),
        endAt: z.string().datetime({ offset: true }),
        days: z.literal(7),
      })
      .strict(),
    activeDays: z.number().int().min(0).max(7),
    measurementCount: z.number().int().min(0),
    workoutCount: z.number().int().min(0),
    mealCount: z.number().int().min(0),
    freshness: sourceRecordFreshnessSchema,
  })
  .strict()
  .refine(
    (entry) =>
      Date.parse(entry.window.endAt) - Date.parse(entry.window.startAt) ===
      7 * 24 * 60 * 60 * 1_000,
    { message: 'personal state recording window must span exactly seven days' },
  )

const recoveryStateLedgerEntrySchema = z
  .object({
    kind: z.literal('recovery_state'),
    knowledgeClass: z.enum(['estimated', 'unknown']),
    authority: z.literal('dashboard.readiness'),
    evidencePolicyVersion: z.literal(recoveryStatePolicyVersion),
    state: recoveryStateValueSchema,
    confidence: recoveryConfidenceSchema,
    consistency: recoveryConsistencySchema,
    label: z.string().min(1),
    evidenceCount: z.number().int().min(0).max(148),
    freshness: sourceRecordFreshnessSchema,
  })
  .strict()
  .superRefine((entry, ctx) => {
    const expectedClass = entry.state === 'unknown' ? 'unknown' : 'estimated'
    if (entry.knowledgeClass !== expectedClass) {
      ctx.addIssue({
        code: 'custom',
        message: 'recovery knowledge class must match the recovery state',
        path: ['knowledgeClass'],
      })
    }
  })

const planExperienceLedgerEntrySchema = z
  .object({
    kind: z.literal('plan_experience'),
    knowledgeClass: z.literal('user_confirmed'),
    authority: z.literal('plan_experience_reflection'),
    planId: z.string().uuid(),
    planRevision: z.number().int().positive(),
    experience: planExperienceChoiceSchema,
    reflectionRevision: z.number().int().positive(),
    updatedAt: z.string().datetime({ offset: true }),
    freshness: planReflectionFreshnessSchema,
  })
  .strict()

export const personalStateLedgerSchema = z
  .object({
    policyVersion: z.literal(personalStateLedgerPolicyVersion),
    generatedAt: z.string().datetime({ offset: true }),
    confirmedRecovery: confirmedRecoveryEvidenceSchema.nullable(),
    observedWindow: observedRecordingWindowSchema,
    recoveryEstimate: recoveryStateLedgerEntrySchema,
    planExperience: planExperienceLedgerEntrySchema.nullable(),
  })
  .strict()

export type PersonalStateLedger = z.infer<typeof personalStateLedgerSchema>
export type PersonalStateInvalidationReason = z.infer<typeof personalStateInvalidationReasonSchema>
