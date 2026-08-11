import * as z from 'zod'

import { weekdaySchema } from './onboarding'
import {
  personalModelClaimSchemaVersions,
  personalModelConfidenceLevels,
  personalModelConfidenceLimitations,
  personalModelConfidencePolicyVersion,
  personalModelContractVersion,
  personalModelEvidenceKinds,
  personalModelEvidenceQualificationStates,
  personalModelEvidenceRoles,
  personalModelEvidenceSources,
  personalModelEvidenceWithdrawalReasons,
  personalModelFeedbackChoices,
  personalModelFeedbackNoteMaximumLength,
  personalModelFeedbackReasonCodes,
  personalModelFeedbackStates,
  personalModelKinds,
  personalModelMaximumObservationWeeks,
  personalModelMaximumWorkoutEvidenceCount,
  personalModelMinimumActiveObservationWeeks,
  personalModelMinimumActiveWorkoutCount,
  personalModelSources,
  personalModelStatuses,
  personalModelSubjectKeys,
  personalModelUnknownReasons,
  personalModelUnknownReceiptVersion,
} from './personal-model.constants'
import { workoutSourceKindSchema } from './workout'

export * from './personal-model.constants'

export const personalModelKindSchema = z.enum(personalModelKinds)
export const personalModelStatusSchema = z.enum(personalModelStatuses)
export const personalModelSourceSchema = z.enum(personalModelSources)
export const personalModelFeedbackStateSchema = z.enum(personalModelFeedbackStates)
export const personalModelConfidenceLevelSchema = z.enum(personalModelConfidenceLevels)
export const personalModelConfidenceLimitationSchema = z.enum(personalModelConfidenceLimitations)
export const personalModelEvidenceRoleSchema = z.enum(personalModelEvidenceRoles)
export const personalModelEvidenceKindSchema = z.enum(personalModelEvidenceKinds)
export const personalModelEvidenceSourceSchema = z.enum(personalModelEvidenceSources)
export const personalModelEvidenceQualificationStateSchema = z.enum(
  personalModelEvidenceQualificationStates,
)
export const personalModelEvidenceWithdrawalReasonSchema = z.enum(
  personalModelEvidenceWithdrawalReasons,
)
export const personalModelClaimSchemaVersionSchema = z.enum(personalModelClaimSchemaVersions)
export const personalModelSubjectKeySchema = z.enum(personalModelSubjectKeys)
export const personalModelFeedbackChoiceSchema = z.enum(personalModelFeedbackChoices)
export const personalModelFeedbackReasonCodeSchema = z.enum(personalModelFeedbackReasonCodes)
export const personalModelUnknownReasonSchema = z.enum(personalModelUnknownReasons)

const offsetDateTimeSchema = z.string().datetime({ offset: true })
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)

const uniqueArray = <T extends z.ZodType>(schema: T, message: string) =>
  z.array(schema).refine((values) => new Set(values).size === values.length, { message })

const ianaTimezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(
    (timezone) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(0)
        return true
      } catch {
        return false
      }
    },
    { message: 'timezone must be a valid IANA time zone' },
  )

const addIssue = (ctx: z.RefinementCtx, path: PropertyKey[], message: string) => {
  ctx.addIssue({ code: 'custom', message, path })
}

const median = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!
}

const daysBetweenLocalDates = (startDate: string, endDateExclusive: string) =>
  (Date.parse(`${endDateExclusive}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) /
  86_400_000

const observationWindowSchema = z
  .object({
    startDate: localDateSchema,
    endDateExclusive: localDateSchema,
    completeWeeks: z.number().int().min(1).max(personalModelMaximumObservationWeeks),
    timezone: ianaTimezoneSchema,
  })
  .strict()
  .superRefine((window, ctx) => {
    if (
      daysBetweenLocalDates(window.startDate, window.endDateExclusive) !==
      window.completeWeeks * 7
    ) {
      addIssue(
        ctx,
        ['endDateExclusive'],
        'observation window must contain exactly completeWeeks local weeks',
      )
    }
  })

const instantEvidenceTimeSchema = z
  .object({
    kind: z.literal('instant'),
    occurredAt: offsetDateTimeSchema,
  })
  .strict()

const intervalEvidenceTimeSchema = z
  .object({
    kind: z.literal('interval'),
    startedAt: offsetDateTimeSchema,
    endedAt: offsetDateTimeSchema,
    timezone: ianaTimezoneSchema,
  })
  .strict()
  .superRefine((time, ctx) => {
    if (Date.parse(time.endedAt) < Date.parse(time.startedAt)) {
      addIssue(ctx, ['endedAt'], 'evidence interval must not end before it starts')
    }
  })

const evidenceReferenceCoreSchema = z
  .object({
    id: z.string().uuid(),
    ownerUserId: z.string().uuid(),
    role: personalModelEvidenceRoleSchema,
    aggregateId: z.string().uuid(),
    aggregateRevision: z.number().int().positive(),
    qualification: personalModelEvidenceQualificationStateSchema,
    withdrawnReason: personalModelEvidenceWithdrawalReasonSchema.nullable(),
  })
  .strict()

const onboardingGoalEvidenceReferenceSchema = evidenceReferenceCoreSchema.extend({
  evidenceKind: z.literal('onboarding_goal_revision'),
  sourceKind: z.literal('user_confirmed'),
  time: instantEvidenceTimeSchema,
})

const workoutEvidenceReferenceSchema = evidenceReferenceCoreSchema.extend({
  evidenceKind: z.literal('workout_revision'),
  sourceKind: workoutSourceKindSchema,
  time: intervalEvidenceTimeSchema,
})

export const personalModelEvidenceReferenceSchema = z
  .discriminatedUnion('evidenceKind', [
    onboardingGoalEvidenceReferenceSchema,
    workoutEvidenceReferenceSchema,
  ])
  .superRefine((reference, ctx) => {
    const withdrawn = reference.qualification === 'withdrawn'
    if (withdrawn !== (reference.withdrawnReason !== null)) {
      addIssue(
        ctx,
        ['withdrawnReason'],
        'withdrawn evidence must have a reason and eligible evidence must not',
      )
    }
    if (withdrawn && reference.role !== 'context') {
      addIssue(
        ctx,
        ['role'],
        'withdrawn evidence must remain context, not support or contradiction',
      )
    }
  })

export const personalModelEvidenceSetSchema = z
  .object({
    policyVersion: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,79}$/),
    ownerUserId: z.string().uuid(),
    asOf: offsetDateTimeSchema,
    window: z
      .object({
        startAt: offsetDateTimeSchema,
        endAt: offsetDateTimeSchema,
        timezone: ianaTimezoneSchema,
      })
      .strict(),
    includedCount: z.number().int().min(0).max(personalModelMaximumWorkoutEvidenceCount),
    supportingCount: z.number().int().min(0).max(personalModelMaximumWorkoutEvidenceCount),
    contradictingCount: z.number().int().min(0).max(personalModelMaximumWorkoutEvidenceCount),
    withdrawnCount: z.number().int().min(0).max(personalModelMaximumWorkoutEvidenceCount),
    evidenceFingerprint: sha256Schema,
    references: z
      .array(personalModelEvidenceReferenceSchema)
      .min(1)
      .max(personalModelMaximumWorkoutEvidenceCount),
  })
  .strict()
  .superRefine((set, ctx) => {
    if (Date.parse(set.window.endAt) <= Date.parse(set.window.startAt)) {
      addIssue(ctx, ['window', 'endAt'], 'evidence window must end after it starts')
    }
    if (Date.parse(set.asOf) < Date.parse(set.window.endAt)) {
      addIssue(ctx, ['asOf'], 'evidence asOf must not precede the observation window end')
    }
    if (set.references.some((reference) => reference.ownerUserId !== set.ownerUserId)) {
      addIssue(ctx, ['references'], 'every evidence reference must have the evidence set owner')
    }
    if (new Set(set.references.map((reference) => reference.id)).size !== set.references.length) {
      addIssue(ctx, ['references'], 'evidence reference ids must be unique')
    }
    if (
      new Set(
        set.references.map(
          (reference) =>
            `${reference.evidenceKind}:${reference.aggregateId}:${reference.aggregateRevision}`,
        ),
      ).size !== set.references.length
    ) {
      addIssue(ctx, ['references'], 'evidence aggregate revisions must be unique')
    }

    const eligible = set.references.filter((reference) => reference.qualification === 'eligible')
    const expectedSupporting = eligible.filter(
      (reference) => reference.role === 'supporting',
    ).length
    const expectedContradicting = eligible.filter(
      (reference) => reference.role === 'contradicting',
    ).length
    const expectedWithdrawn = set.references.length - eligible.length
    if (set.includedCount !== eligible.length) {
      addIssue(ctx, ['includedCount'], 'includedCount must match eligible evidence references')
    }
    if (set.supportingCount !== expectedSupporting) {
      addIssue(
        ctx,
        ['supportingCount'],
        'supportingCount must match eligible supporting references',
      )
    }
    if (set.contradictingCount !== expectedContradicting) {
      addIssue(
        ctx,
        ['contradictingCount'],
        'contradictingCount must match eligible contradicting references',
      )
    }
    if (set.withdrawnCount !== expectedWithdrawn) {
      addIssue(ctx, ['withdrawnCount'], 'withdrawnCount must match withdrawn references')
    }
  })

const confidenceLimitationsSchema = uniqueArray(
  personalModelConfidenceLimitationSchema,
  'confidence limitations must be unique',
).max(personalModelConfidenceLimitations.length)

const userConfirmedConfidenceReceiptSchema = z
  .object({
    policyVersion: z.literal(personalModelConfidencePolicyVersion),
    basis: z.literal('user_confirmed'),
    level: z.literal('high'),
    qualifiedEvidenceCount: z.literal(1),
    limitations: confidenceLimitationsSchema,
  })
  .strict()

const longitudinalConfidenceReceiptSchema = z
  .object({
    policyVersion: z.literal(personalModelConfidencePolicyVersion),
    basis: z.literal('longitudinal_observation'),
    level: personalModelConfidenceLevelSchema,
    qualifiedEvidenceCount: z.number().int().min(0).max(personalModelMaximumWorkoutEvidenceCount),
    distinctLocalDates: z.number().int().min(0).max(personalModelMaximumWorkoutEvidenceCount),
    completeWeeks: z.number().int().min(0).max(personalModelMaximumObservationWeeks),
    comparedWindowCount: z.number().int().min(0).max(personalModelMaximumObservationWeeks),
    stableWindowCount: z.number().int().min(0).max(personalModelMaximumObservationWeeks),
    contradictingEvidenceCount: z
      .number()
      .int()
      .min(0)
      .max(personalModelMaximumWorkoutEvidenceCount),
    latestEvidenceAt: offsetDateTimeSchema.nullable(),
    limitations: confidenceLimitationsSchema,
  })
  .strict()
  .superRefine((receipt, ctx) => {
    if (receipt.distinctLocalDates > receipt.qualifiedEvidenceCount) {
      addIssue(
        ctx,
        ['distinctLocalDates'],
        'distinctLocalDates must not exceed qualified evidence count',
      )
    }
    if (receipt.qualifiedEvidenceCount > 0 && receipt.completeWeeks === 0) {
      addIssue(ctx, ['completeWeeks'], 'qualified longitudinal evidence requires observed weeks')
    }
    if (receipt.distinctLocalDates > receipt.completeWeeks * 7) {
      addIssue(
        ctx,
        ['distinctLocalDates'],
        'distinct local dates must fit inside the complete observed weeks',
      )
    }
    if (receipt.comparedWindowCount > receipt.completeWeeks) {
      addIssue(ctx, ['comparedWindowCount'], 'compared windows must fit inside observed weeks')
    }
    if (receipt.stableWindowCount > receipt.comparedWindowCount) {
      addIssue(ctx, ['stableWindowCount'], 'stable windows must not exceed compared windows')
    }
    if (receipt.contradictingEvidenceCount > receipt.qualifiedEvidenceCount) {
      addIssue(
        ctx,
        ['contradictingEvidenceCount'],
        'contradicting evidence must not exceed qualified evidence',
      )
    }
    if (receipt.level === 'insufficient' && !receipt.limitations.includes('limited_coverage')) {
      addIssue(ctx, ['limitations'], 'insufficient confidence must explain limited coverage')
    }
    if (receipt.qualifiedEvidenceCount === 0 && receipt.latestEvidenceAt !== null) {
      addIssue(
        ctx,
        ['latestEvidenceAt'],
        'zero qualified evidence cannot have a latest evidence timestamp',
      )
    }
    if (receipt.qualifiedEvidenceCount > 0 && receipt.latestEvidenceAt === null) {
      addIssue(ctx, ['latestEvidenceAt'], 'qualified evidence requires a latest evidence timestamp')
    }
  })

export const personalModelConfidenceReceiptSchema = z.discriminatedUnion('basis', [
  userConfirmedConfidenceReceiptSchema,
  longitudinalConfidenceReceiptSchema,
])

export const trainingAvailabilityConstraintClaimSchema = z
  .object({
    availableDays: uniqueArray(weekdaySchema, 'availableDays must not contain duplicates')
      .min(1)
      .max(7),
    sessionMinutes: z.number().int().min(15).max(180),
    sourceGoalRevision: z.number().int().positive(),
    durationUnit: z.literal('minutes'),
  })
  .strict()

export const recordedTrainingFrequencyBehaviorClaimSchema = z
  .object({
    observationWindow: observationWindowSchema,
    weeklyRecordedSessionCounts: z
      .array(z.number().int().min(0).max(100))
      .min(1)
      .max(personalModelMaximumObservationWeeks),
    qualifyingWorkoutCount: z
      .number()
      .int()
      .positive()
      .max(personalModelMaximumWorkoutEvidenceCount),
    recordedWeekCount: z.number().int().positive().max(personalModelMaximumObservationWeeks),
    medianSessionsPerWeek: z.number().finite().min(0).max(100),
    minimumSessionsPerWeek: z.number().int().min(0).max(100),
    maximumSessionsPerWeek: z.number().int().min(0).max(100),
    frequencyUnit: z.literal('recorded_sessions_per_week'),
    medianPolicyVersion: z.literal('numeric-median-v1'),
  })
  .strict()
  .superRefine((claim, ctx) => {
    const counts = claim.weeklyRecordedSessionCounts
    if (counts.length !== claim.observationWindow.completeWeeks) {
      addIssue(
        ctx,
        ['weeklyRecordedSessionCounts'],
        'weekly counts must contain one entry for every complete week',
      )
      return
    }
    const sum = counts.reduce((total, count) => total + count, 0)
    if (claim.qualifyingWorkoutCount !== sum) {
      addIssue(
        ctx,
        ['qualifyingWorkoutCount'],
        'qualifying workout count must equal the weekly count sum',
      )
    }
    if (claim.recordedWeekCount !== counts.filter((count) => count > 0).length) {
      addIssue(ctx, ['recordedWeekCount'], 'recorded week count must match non-zero weekly entries')
    }
    if (claim.minimumSessionsPerWeek !== Math.min(...counts)) {
      addIssue(ctx, ['minimumSessionsPerWeek'], 'minimum must match the weekly counts')
    }
    if (claim.maximumSessionsPerWeek !== Math.max(...counts)) {
      addIssue(ctx, ['maximumSessionsPerWeek'], 'maximum must match the weekly counts')
    }
    if (claim.medianSessionsPerWeek !== median(counts)) {
      addIssue(ctx, ['medianSessionsPerWeek'], 'median must match the weekly counts')
    }
  })

export const recordedSessionDurationBaselineClaimSchema = z
  .object({
    observationWindow: observationWindowSchema,
    sampleCount: z.number().int().positive().max(personalModelMaximumWorkoutEvidenceCount),
    coveredWeeks: z.number().int().positive().max(personalModelMaximumObservationWeeks),
    firstQuartileMinutes: z.number().finite().positive().max(1_440),
    medianMinutes: z.number().finite().positive().max(1_440),
    thirdQuartileMinutes: z.number().finite().positive().max(1_440),
    durationUnit: z.literal('minutes'),
    durationPolicyVersion: z.literal('elapsed-duration-minutes-v1'),
    quartilePolicyVersion: z.literal('nearest-rank-quartiles-v1'),
  })
  .strict()
  .superRefine((claim, ctx) => {
    if (claim.coveredWeeks > claim.observationWindow.completeWeeks) {
      addIssue(ctx, ['coveredWeeks'], 'covered weeks must not exceed complete observed weeks')
    }
    if (
      claim.firstQuartileMinutes > claim.medianMinutes ||
      claim.medianMinutes > claim.thirdQuartileMinutes
    ) {
      addIssue(ctx, ['medianMinutes'], 'duration quartiles must be ordered')
    }
  })

const personalModelItemCoreSchema = z
  .object({
    contractVersion: z.literal(personalModelContractVersion),
    id: z.string().uuid(),
    userId: z.string().uuid(),
    status: personalModelStatusSchema,
    confidence: personalModelConfidenceReceiptSchema,
    evidenceSet: personalModelEvidenceSetSchema,
    validFrom: offsetDateTimeSchema,
    validTo: offsetDateTimeSchema.nullable(),
    observedFrom: offsetDateTimeSchema,
    observedThrough: offsetDateTimeSchema,
    derivedAt: offsetDateTimeSchema,
    revision: z.number().int().positive(),
    feedbackState: personalModelFeedbackStateSchema,
    createdAt: offsetDateTimeSchema,
    updatedAt: offsetDateTimeSchema,
  })
  .strict()

const trainingAvailabilityConstraintItemSchema = personalModelItemCoreSchema.extend({
  kind: z.literal('constraint'),
  subjectKey: z.literal('training.availability'),
  claimSchemaVersion: z.literal('training_availability_constraint_v1'),
  source: z.literal('user_confirmed'),
  claim: trainingAvailabilityConstraintClaimSchema,
})

const recordedTrainingFrequencyBehaviorItemSchema = personalModelItemCoreSchema.extend({
  kind: z.literal('behavior'),
  subjectKey: z.literal('training.recorded_frequency'),
  claimSchemaVersion: z.literal('recorded_training_frequency_behavior_v1'),
  source: z.literal('deterministic_rule'),
  claim: recordedTrainingFrequencyBehaviorClaimSchema,
})

const recordedSessionDurationBaselineItemSchema = personalModelItemCoreSchema.extend({
  kind: z.literal('baseline'),
  subjectKey: z.literal('training.recorded_session_duration'),
  claimSchemaVersion: z.literal('recorded_session_duration_baseline_v1'),
  source: z.literal('deterministic_rule'),
  claim: recordedSessionDurationBaselineClaimSchema,
})

const isLongitudinalClaimEligible = (
  item:
    | z.infer<typeof recordedTrainingFrequencyBehaviorItemSchema>
    | z.infer<typeof recordedSessionDurationBaselineItemSchema>,
) =>
  item.claimSchemaVersion === 'recorded_training_frequency_behavior_v1'
    ? item.claim.observationWindow.completeWeeks >= personalModelMinimumActiveObservationWeeks &&
      item.claim.qualifyingWorkoutCount >= personalModelMinimumActiveWorkoutCount
    : item.claim.coveredWeeks >= personalModelMinimumActiveObservationWeeks &&
      item.claim.sampleCount >= personalModelMinimumActiveWorkoutCount

export const personalModelItemSchema = z
  .discriminatedUnion('claimSchemaVersion', [
    trainingAvailabilityConstraintItemSchema,
    recordedTrainingFrequencyBehaviorItemSchema,
    recordedSessionDurationBaselineItemSchema,
  ])
  .superRefine((item, ctx) => {
    const terminal = item.status === 'superseded' || item.status === 'invalidated'
    if (item.userId !== item.evidenceSet.ownerUserId) {
      addIssue(ctx, ['evidenceSet', 'ownerUserId'], 'item and evidence set owners must match')
    }
    if (item.observedFrom !== item.evidenceSet.window.startAt) {
      addIssue(ctx, ['observedFrom'], 'item observation start must match its evidence set')
    }
    if (item.observedThrough !== item.evidenceSet.window.endAt) {
      addIssue(ctx, ['observedThrough'], 'item observation end must match its evidence set')
    }
    if (item.derivedAt !== item.evidenceSet.asOf) {
      addIssue(ctx, ['derivedAt'], 'item derivation time must match evidence asOf')
    }
    if (Date.parse(item.observedThrough) < Date.parse(item.observedFrom)) {
      addIssue(ctx, ['observedThrough'], 'item observation end must not precede its start')
    }
    if (item.validTo !== null && Date.parse(item.validTo) < Date.parse(item.validFrom)) {
      addIssue(ctx, ['validTo'], 'item validity end must not precede its start')
    }
    if (Date.parse(item.updatedAt) < Date.parse(item.createdAt)) {
      addIssue(ctx, ['updatedAt'], 'item update time must not precede creation')
    }
    if (Date.parse(item.updatedAt) < Date.parse(item.derivedAt)) {
      addIssue(ctx, ['updatedAt'], 'item update time must not precede derivation')
    }
    if (terminal && item.validTo === null) {
      addIssue(ctx, ['validTo'], 'terminal model items require a validity end')
    }
    if (!terminal && item.evidenceSet.includedCount === 0) {
      addIssue(
        ctx,
        ['evidenceSet', 'includedCount'],
        'current model items require eligible evidence',
      )
    }
    if (item.status === 'disputed' && item.feedbackState !== 'disagreed') {
      addIssue(ctx, ['feedbackState'], 'disputed items require disagreed feedback')
    }
    if (
      item.feedbackState === 'disagreed' &&
      item.status !== 'disputed' &&
      item.status !== 'superseded' &&
      item.status !== 'invalidated'
    ) {
      addIssue(ctx, ['status'], 'disagreed feedback requires a disputed or terminal item')
    }
    if (item.feedbackState === 'temporary' && item.validTo === null) {
      addIssue(ctx, ['validTo'], 'temporary feedback requires an explicit validity end')
    }
    if (item.status === 'disputed' && !item.confidence.limitations.includes('user_disputed')) {
      addIssue(ctx, ['confidence', 'limitations'], 'disputed items must disclose user dispute')
    }

    const activeForDecision = item.status === 'active' || item.status === 'disputed'
    if (activeForDecision && !['moderate', 'high'].includes(item.confidence.level)) {
      addIssue(ctx, ['confidence', 'level'], 'active or disputed items require moderate confidence')
    }

    if (item.claimSchemaVersion === 'training_availability_constraint_v1') {
      if (item.status === 'candidate') {
        addIssue(
          ctx,
          ['status'],
          'a user-confirmed availability constraint cannot remain candidate',
        )
      }
      if (item.confidence.basis !== 'user_confirmed') {
        addIssue(
          ctx,
          ['confidence', 'basis'],
          'availability constraints require user-confirmed confidence',
        )
      }
      const references = item.evidenceSet.references
      if (
        references.length !== 1 ||
        references[0]?.evidenceKind !== 'onboarding_goal_revision' ||
        references[0].aggregateRevision !== item.claim.sourceGoalRevision
      ) {
        addIssue(
          ctx,
          ['evidenceSet', 'references'],
          'availability constraints require the exact onboarding goal revision',
        )
      }
      return
    }

    if (item.confidence.basis !== 'longitudinal_observation') {
      addIssue(
        ctx,
        ['confidence', 'basis'],
        'recorded observations require longitudinal confidence',
      )
      return
    }
    if (
      item.evidenceSet.references.some((reference) => reference.evidenceKind !== 'workout_revision')
    ) {
      addIssue(
        ctx,
        ['evidenceSet', 'references'],
        'recorded observations only accept workout revisions',
      )
    }

    const eligible = isLongitudinalClaimEligible(item)
    if (item.status === 'candidate' && eligible) {
      addIssue(ctx, ['status'], 'eligible deterministic observations must not remain candidate')
    }
    if ((item.status === 'active' || item.status === 'disputed') && !eligible) {
      addIssue(
        ctx,
        ['status'],
        'insufficient deterministic observations cannot be active or disputed',
      )
    }
    if (item.status === 'candidate' && !['insufficient', 'low'].includes(item.confidence.level)) {
      addIssue(
        ctx,
        ['confidence', 'level'],
        'candidate observations must remain low or insufficient',
      )
    }

    const claimEvidenceCount =
      item.claimSchemaVersion === 'recorded_training_frequency_behavior_v1'
        ? item.claim.qualifyingWorkoutCount
        : item.claim.sampleCount
    const claimCompleteWeeks = item.claim.observationWindow.completeWeeks
    if (!terminal && item.evidenceSet.includedCount !== claimEvidenceCount) {
      addIssue(ctx, ['evidenceSet', 'includedCount'], 'claim count must match eligible evidence')
    }
    if (!terminal && item.confidence.qualifiedEvidenceCount !== claimEvidenceCount) {
      addIssue(
        ctx,
        ['confidence', 'qualifiedEvidenceCount'],
        'claim count must match confidence receipt',
      )
    }
    if (!terminal && item.confidence.completeWeeks !== claimCompleteWeeks) {
      addIssue(ctx, ['confidence', 'completeWeeks'], 'claim weeks must match confidence receipt')
    }
    if (
      !terminal &&
      item.confidence.contradictingEvidenceCount !== item.evidenceSet.contradictingCount
    ) {
      addIssue(
        ctx,
        ['confidence', 'contradictingEvidenceCount'],
        'confidence contradiction count must match the evidence set',
      )
    }
  })

export const personalModelDecisionInputSchema = personalModelItemSchema.refine(
  (item) => item.status === 'active',
  { message: 'only active personal model items may be decision inputs', path: ['status'] },
)

export const personalModelUnknownReceiptSchema = z
  .object({
    schemaVersion: z.literal(personalModelUnknownReceiptVersion),
    kind: z.literal('unknown'),
    userId: z.string().uuid(),
    subjectKey: personalModelSubjectKeySchema,
    reasons: uniqueArray(personalModelUnknownReasonSchema, 'unknown reasons must be unique').min(1),
    evidencePolicyVersion: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,79}$/),
    evaluatedAt: offsetDateTimeSchema,
    window: z
      .object({
        startAt: offsetDateTimeSchema,
        endAt: offsetDateTimeSchema,
        timezone: ianaTimezoneSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((receipt, ctx) => {
    if (Date.parse(receipt.window.endAt) <= Date.parse(receipt.window.startAt)) {
      addIssue(ctx, ['window', 'endAt'], 'unknown receipt window must end after it starts')
    }
    if (Date.parse(receipt.evaluatedAt) < Date.parse(receipt.window.endAt)) {
      addIssue(ctx, ['evaluatedAt'], 'unknown receipt must be evaluated after its window')
    }
  })

export const personalModelFeedbackEventSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    itemId: z.string().uuid(),
    itemRevision: z.number().int().positive(),
    choice: personalModelFeedbackChoiceSchema,
    reasonCode: personalModelFeedbackReasonCodeSchema.nullable(),
    note: z.string().trim().min(1).max(personalModelFeedbackNoteMaximumLength).nullable(),
    contextValidUntil: offsetDateTimeSchema.nullable(),
    createdAt: offsetDateTimeSchema,
  })
  .strict()
  .superRefine((event, ctx) => {
    if (event.choice === 'temporary_context') {
      if (event.contextValidUntil === null) {
        addIssue(ctx, ['contextValidUntil'], 'temporary context feedback requires a validity end')
      } else if (Date.parse(event.contextValidUntil) <= Date.parse(event.createdAt)) {
        addIssue(ctx, ['contextValidUntil'], 'temporary context must end after feedback creation')
      }
    } else if (event.contextValidUntil !== null) {
      addIssue(ctx, ['contextValidUntil'], 'only temporary context feedback may set a validity end')
    }
  })

export type PersonalModelKind = z.infer<typeof personalModelKindSchema>
export type PersonalModelStatus = z.infer<typeof personalModelStatusSchema>
export type PersonalModelEvidenceReference = z.infer<typeof personalModelEvidenceReferenceSchema>
export type PersonalModelEvidenceSet = z.infer<typeof personalModelEvidenceSetSchema>
export type PersonalModelConfidenceReceipt = z.infer<typeof personalModelConfidenceReceiptSchema>
export type PersonalModelItem = z.infer<typeof personalModelItemSchema>
export type PersonalModelUnknownReceipt = z.infer<typeof personalModelUnknownReceiptSchema>
export type PersonalModelFeedbackEvent = z.infer<typeof personalModelFeedbackEventSchema>
