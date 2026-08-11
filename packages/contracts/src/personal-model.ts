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
  personalModelFeedbackNoOpReasons,
  personalModelFeedbackReasonCodes,
  personalModelFeedbackStates,
  personalModelKinds,
  personalModelItemRevisionVersion,
  personalModelMaximumObservationWeeks,
  personalModelMaximumWorkoutEvidenceCount,
  personalModelMinimumActiveObservationWeeks,
  personalModelMinimumActiveWorkoutCount,
  personalModelSources,
  personalModelStatuses,
  personalModelSubjectKeys,
  personalModelUnknownReasons,
  personalModelUnknownReceiptVersion,
  personalModelFeedbackTransitionVersion,
  personalModelRevisionActions,
  weeklyCognitiveReviewEnvelopeVersion,
  weeklyCognitiveReviewHistoryPageVersion,
  weeklyCognitiveReviewMaximumHistoryPageSize,
  weeklyCognitiveReviewQuestionKeys,
  weeklyCognitiveReviewVersion,
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
export const personalModelRevisionActionSchema = z.enum(personalModelRevisionActions)
export const personalModelFeedbackNoOpReasonSchema = z.enum(personalModelFeedbackNoOpReasons)
export const weeklyCognitiveReviewQuestionKeySchema = z.enum(weeklyCognitiveReviewQuestionKeys)

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

    if (item.status === 'active' && !['moderate', 'high'].includes(item.confidence.level)) {
      addIssue(ctx, ['confidence', 'level'], 'active items require moderate confidence')
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
      const eligibleReferences = references.filter(
        (reference) => reference.qualification === 'eligible',
      )
      const claimReference = references.find(
        (reference) => reference.aggregateRevision === item.claim.sourceGoalRevision,
      )
      if (
        references.some((reference) => reference.evidenceKind !== 'onboarding_goal_revision') ||
        new Set(references.map((reference) => reference.aggregateId)).size !== 1 ||
        claimReference === undefined ||
        (!terminal &&
          (eligibleReferences.length !== 1 || claimReference.qualification !== 'eligible'))
      ) {
        addIssue(
          ctx,
          ['evidenceSet', 'references'],
          'availability constraints require one stable goal chain and its exact current revision',
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
    if (item.status === 'active' && !eligible) {
      addIssue(ctx, ['status'], 'insufficient deterministic observations cannot be active')
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

const personalModelFeedbackStateForChoice = (
  choice: z.infer<typeof personalModelFeedbackChoiceSchema>,
) =>
  ({
    matches_me: 'confirmed',
    temporary_context: 'temporary',
    disagree: 'disagreed',
    uncertain: 'uncertain',
  })[choice] as z.infer<typeof personalModelFeedbackStateSchema>

const personalModelRevisionActionForChoice = (
  choice: z.infer<typeof personalModelFeedbackChoiceSchema>,
) =>
  ({
    matches_me: 'user_confirmed',
    temporary_context: 'user_marked_temporary',
    disagree: 'user_disagreed',
    uncertain: 'user_uncertain',
  })[choice] as z.infer<typeof personalModelRevisionActionSchema>

export const personalModelItemRevisionSchema = z
  .object({
    schemaVersion: z.literal(personalModelItemRevisionVersion),
    id: z.string().uuid(),
    userId: z.string().uuid(),
    itemId: z.string().uuid(),
    revision: z.number().int().positive(),
    previousRevision: z.number().int().positive().nullable(),
    action: personalModelRevisionActionSchema,
    snapshot: personalModelItemSchema,
    derivationFingerprint: sha256Schema,
    feedbackEventId: z.string().uuid().nullable(),
    changedAt: offsetDateTimeSchema,
  })
  .strict()
  .superRefine((revision, ctx) => {
    if (
      revision.snapshot.id !== revision.itemId ||
      revision.snapshot.userId !== revision.userId ||
      revision.snapshot.revision !== revision.revision
    ) {
      addIssue(ctx, ['snapshot'], 'revision snapshot identity must match its revision envelope')
    }
    if (revision.snapshot.updatedAt !== revision.changedAt) {
      addIssue(ctx, ['changedAt'], 'revision changedAt must match the snapshot update time')
    }

    if (revision.action === 'created') {
      if (revision.revision !== 1 || revision.previousRevision !== null) {
        addIssue(
          ctx,
          ['previousRevision'],
          'created revisions must start at one without a predecessor',
        )
      }
    } else if (revision.previousRevision !== revision.revision - 1) {
      addIssue(ctx, ['previousRevision'], 'revision predecessor must be exactly revision minus one')
    }

    const feedbackAction = revision.action.startsWith('user_')
    if (feedbackAction !== (revision.feedbackEventId !== null)) {
      addIssue(
        ctx,
        ['feedbackEventId'],
        'user feedback revisions require an event and non-feedback revisions must not have one',
      )
    }

    const expectedFeedbackStates: Partial<
      Record<z.infer<typeof personalModelRevisionActionSchema>, string>
    > = {
      user_confirmed: 'confirmed',
      user_marked_temporary: 'temporary',
      user_disagreed: 'disagreed',
      user_uncertain: 'uncertain',
    }
    const expectedFeedbackState = expectedFeedbackStates[revision.action]
    if (expectedFeedbackState && revision.snapshot.feedbackState !== expectedFeedbackState) {
      addIssue(ctx, ['snapshot', 'feedbackState'], 'revision action must match snapshot feedback')
    }
    if (revision.action === 'user_disagreed' && revision.snapshot.status !== 'disputed') {
      addIssue(ctx, ['snapshot', 'status'], 'user disagreement must produce a disputed snapshot')
    }
    if (revision.action === 'superseded' && revision.snapshot.status !== 'superseded') {
      addIssue(ctx, ['snapshot', 'status'], 'superseded action must produce a superseded snapshot')
    }
    if (revision.action === 'invalidated' && revision.snapshot.status !== 'invalidated') {
      addIssue(
        ctx,
        ['snapshot', 'status'],
        'invalidated action must produce an invalidated snapshot',
      )
    }
    if (
      revision.action === 'evidence_contradicted' &&
      !revision.snapshot.confidence.limitations.includes('conflicting_evidence')
    ) {
      addIssue(
        ctx,
        ['snapshot', 'confidence', 'limitations'],
        'contradicted evidence revisions must disclose conflicting evidence',
      )
    }
  })

export const personalModelFeedbackApplicationSchema = z
  .object({
    item: personalModelItemSchema,
    event: personalModelFeedbackEventSchema,
  })
  .strict()
  .superRefine((application, ctx) => {
    if (
      application.event.userId !== application.item.userId ||
      application.event.itemId !== application.item.id ||
      application.event.itemRevision !== application.item.revision
    ) {
      addIssue(ctx, ['event'], 'feedback must target the exact owner, item and current revision')
    }
    if (application.item.status === 'superseded' || application.item.status === 'invalidated') {
      addIssue(ctx, ['item', 'status'], 'terminal personal model items cannot accept feedback')
    }
    if (Date.parse(application.event.createdAt) < Date.parse(application.item.updatedAt)) {
      addIssue(ctx, ['event', 'createdAt'], 'feedback must not precede the target revision')
    }
  })

const revisedFeedbackTransitionSchema = z
  .object({
    schemaVersion: z.literal(personalModelFeedbackTransitionVersion),
    outcome: z.literal('revised'),
    event: personalModelFeedbackEventSchema,
    previousItem: personalModelItemSchema,
    revision: personalModelItemRevisionSchema,
  })
  .strict()

const noOpFeedbackTransitionSchema = z
  .object({
    schemaVersion: z.literal(personalModelFeedbackTransitionVersion),
    outcome: z.literal('no_op'),
    event: personalModelFeedbackEventSchema,
    currentItem: personalModelItemSchema,
    reason: personalModelFeedbackNoOpReasonSchema,
    resultFingerprint: sha256Schema,
  })
  .strict()

export const personalModelFeedbackTransitionResultSchema = z
  .discriminatedUnion('outcome', [revisedFeedbackTransitionSchema, noOpFeedbackTransitionSchema])
  .superRefine((result, ctx) => {
    const item = result.outcome === 'revised' ? result.previousItem : result.currentItem
    if (
      result.event.userId !== item.userId ||
      result.event.itemId !== item.id ||
      result.event.itemRevision !== item.revision
    ) {
      addIssue(ctx, ['event'], 'feedback transition must target the exact current item revision')
    }
    if (item.status === 'superseded' || item.status === 'invalidated') {
      addIssue(ctx, ['event'], 'feedback transition cannot target a terminal item')
    }
    if (Date.parse(result.event.createdAt) < Date.parse(item.updatedAt)) {
      addIssue(ctx, ['event', 'createdAt'], 'feedback transition must not predate its target')
    }

    const expectedFeedbackState = personalModelFeedbackStateForChoice(result.event.choice)
    if (result.outcome === 'no_op') {
      if (result.currentItem.feedbackState !== expectedFeedbackState) {
        addIssue(ctx, ['currentItem', 'feedbackState'], 'no-op requires feedback already current')
      }
      if (result.event.choice === 'disagree' && result.currentItem.status !== 'disputed') {
        addIssue(ctx, ['currentItem', 'status'], 'disagreement no-op requires a disputed item')
      }
      if (
        result.event.choice === 'temporary_context' &&
        result.currentItem.validTo !== result.event.contextValidUntil
      ) {
        addIssue(
          ctx,
          ['currentItem', 'validTo'],
          'temporary feedback no-op requires the same validity end',
        )
      }
      return
    }

    if (
      result.revision.userId !== item.userId ||
      result.revision.itemId !== item.id ||
      result.revision.previousRevision !== item.revision ||
      result.revision.revision !== item.revision + 1
    ) {
      addIssue(ctx, ['revision'], 'feedback revision must follow the exact previous item')
    }
    if (result.revision.feedbackEventId !== result.event.id) {
      addIssue(ctx, ['revision', 'feedbackEventId'], 'feedback revision must cite the event')
    }
    if (Date.parse(result.revision.changedAt) < Date.parse(result.event.createdAt)) {
      addIssue(ctx, ['revision', 'changedAt'], 'feedback revision must not predate its event')
    }
    if (result.revision.action !== personalModelRevisionActionForChoice(result.event.choice)) {
      addIssue(
        ctx,
        ['revision', 'action'],
        'feedback choice must map to the matching revision action',
      )
    }
    if (result.revision.snapshot.feedbackState !== expectedFeedbackState) {
      addIssue(
        ctx,
        ['revision', 'snapshot', 'feedbackState'],
        'feedback state must match the event',
      )
    }
    if (
      result.event.choice === 'temporary_context' &&
      result.revision.snapshot.validTo !== result.event.contextValidUntil
    ) {
      addIssue(
        ctx,
        ['revision', 'snapshot', 'validTo'],
        'temporary feedback revision must use the event validity end',
      )
    }
  })

const weeklyReviewItemReferenceCoreSchema = z
  .object({
    ownerUserId: z.string().uuid(),
    itemId: z.string().uuid(),
    itemRevision: z.number().int().positive(),
    subjectKey: z.string().regex(/^[a-z][a-z0-9_.-]{2,119}$/),
    derivedAt: offsetDateTimeSchema,
    evidenceFingerprint: sha256Schema,
  })
  .strict()

const weeklyReviewRecentChangeReferenceSchema = weeklyReviewItemReferenceCoreSchema.extend({
  kind: z.enum(['goal', 'constraint', 'behavior', 'state']),
  status: z.literal('active'),
})

const weeklyReviewBaselineReferenceSchema = weeklyReviewItemReferenceCoreSchema.extend({
  kind: z.literal('baseline'),
  status: z.literal('active'),
})

const weeklyReviewPatternReferenceSchema = weeklyReviewItemReferenceCoreSchema.extend({
  kind: z.literal('pattern'),
  status: z.literal('active'),
})

const weeklyReviewModelRevisionReferenceSchema = weeklyReviewItemReferenceCoreSchema.extend({
  kind: personalModelKindSchema,
  status: personalModelStatusSchema,
})

const weeklyReviewVerificationReferenceSchema = weeklyReviewItemReferenceCoreSchema.extend({
  kind: z.enum(['pattern', 'hypothesis']),
  status: z.enum(['candidate', 'active', 'disputed']),
})

export const weeklyCognitiveReviewContentSchema = z
  .object({
    recentChanges: z.array(weeklyReviewRecentChangeReferenceSchema).max(3),
    baselineDeviations: z.array(weeklyReviewBaselineReferenceSchema).max(2),
    newPatterns: z.array(weeklyReviewPatternReferenceSchema).max(1),
    modelRevisions: z.array(weeklyReviewModelRevisionReferenceSchema).max(3),
    unknowns: z.array(personalModelUnknownReceiptSchema).max(2),
    verificationQuestion: z
      .object({
        questionKey: weeklyCognitiveReviewQuestionKeySchema,
        item: weeklyReviewVerificationReferenceSchema,
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((content, ctx) => {
    const cardCount =
      content.recentChanges.length +
      content.baselineDeviations.length +
      content.newPatterns.length +
      content.modelRevisions.length +
      content.unknowns.length +
      (content.verificationQuestion === null ? 0 : 1)
    if (cardCount === 0) {
      addIssue(ctx, [], 'weekly cognitive review must contain at least one structured card')
    }
  })

const weeklyReviewReferences = (content: z.infer<typeof weeklyCognitiveReviewContentSchema>) => [
  ...content.recentChanges,
  ...content.baselineDeviations,
  ...content.newPatterns,
  ...content.modelRevisions,
  ...(content.verificationQuestion === null ? [] : [content.verificationQuestion.item]),
]

export const weeklyCognitiveReviewRevisionSchema = z
  .object({
    schemaVersion: z.literal(weeklyCognitiveReviewVersion),
    id: z.string().uuid(),
    reviewId: z.string().uuid(),
    userId: z.string().uuid(),
    weekStart: localDateSchema,
    weekEndExclusive: localDateSchema,
    timezone: ianaTimezoneSchema,
    observedThrough: offsetDateTimeSchema,
    revision: z.number().int().positive(),
    evidenceWatermark: sha256Schema,
    modelWatermark: sha256Schema,
    reviewFingerprint: sha256Schema,
    content: weeklyCognitiveReviewContentSchema,
    generatedAt: offsetDateTimeSchema,
  })
  .strict()
  .superRefine((review, ctx) => {
    if (new Date(`${review.weekStart}T00:00:00.000Z`).getUTCDay() !== 1) {
      addIssue(ctx, ['weekStart'], 'weekly cognitive review must start on Monday')
    }
    if (daysBetweenLocalDates(review.weekStart, review.weekEndExclusive) !== 7) {
      addIssue(ctx, ['weekEndExclusive'], 'weekly cognitive review must span seven local days')
    }
    if (Date.parse(review.generatedAt) < Date.parse(review.observedThrough)) {
      addIssue(ctx, ['generatedAt'], 'weekly review generation must follow its evidence cutoff')
    }

    const references = weeklyReviewReferences(review.content)
    if (references.some((reference) => reference.ownerUserId !== review.userId)) {
      addIssue(ctx, ['content'], 'every weekly review item reference must have the review owner')
    }
    if (
      references.some(
        (reference) => Date.parse(reference.derivedAt) > Date.parse(review.observedThrough),
      )
    ) {
      addIssue(
        ctx,
        ['content'],
        'weekly review cannot cite item revisions derived after its cutoff',
      )
    }
    if (
      new Set(references.map((reference) => `${reference.itemId}:${reference.itemRevision}`))
        .size !== references.length
    ) {
      addIssue(ctx, ['content'], 'weekly review item revision references must be unique')
    }
    if (review.content.unknowns.some((unknown) => unknown.userId !== review.userId)) {
      addIssue(ctx, ['content', 'unknowns'], 'weekly review unknown receipts must have the owner')
    }
    if (
      review.content.unknowns.some(
        (unknown) => Date.parse(unknown.evaluatedAt) > Date.parse(review.observedThrough),
      )
    ) {
      addIssue(ctx, ['content', 'unknowns'], 'weekly review cannot cite future unknown receipts')
    }
  })

export const weeklyCognitiveReviewEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(weeklyCognitiveReviewEnvelopeVersion),
    userId: z.string().uuid(),
    weekStart: localDateSchema,
    timezone: ianaTimezoneSchema,
    observedThrough: offsetDateTimeSchema,
    generatedAt: offsetDateTimeSchema,
    review: weeklyCognitiveReviewRevisionSchema.nullable(),
  })
  .strict()
  .superRefine((envelope, ctx) => {
    if (new Date(`${envelope.weekStart}T00:00:00.000Z`).getUTCDay() !== 1) {
      addIssue(ctx, ['weekStart'], 'weekly review envelope must start on Monday')
    }
    if (Date.parse(envelope.generatedAt) < Date.parse(envelope.observedThrough)) {
      addIssue(ctx, ['generatedAt'], 'review envelope cannot predate its evidence cutoff')
    }
    if (
      envelope.review &&
      Date.parse(envelope.generatedAt) < Date.parse(envelope.review.generatedAt)
    ) {
      addIssue(ctx, ['generatedAt'], 'review envelope cannot predate its revision')
    }
    if (
      envelope.review &&
      (envelope.review.userId !== envelope.userId ||
        envelope.review.weekStart !== envelope.weekStart ||
        envelope.review.timezone !== envelope.timezone ||
        envelope.review.observedThrough !== envelope.observedThrough)
    ) {
      addIssue(
        ctx,
        ['review'],
        'review envelope identity and evidence cutoff must match its revision',
      )
    }
  })

export const weeklyCognitiveReviewHistoryPageSchema = z
  .object({
    schemaVersion: z.literal(weeklyCognitiveReviewHistoryPageVersion),
    userId: z.string().uuid(),
    reviewId: z.string().uuid(),
    items: z
      .array(weeklyCognitiveReviewRevisionSchema)
      .min(1)
      .max(weeklyCognitiveReviewMaximumHistoryPageSize),
    nextCursor: z.string().min(1).max(512).nullable(),
  })
  .strict()
  .superRefine((page, ctx) => {
    if (page.items.some((item) => item.userId !== page.userId || item.reviewId !== page.reviewId)) {
      addIssue(ctx, ['items'], 'weekly review history must have one owner and review identity')
    }
    for (let index = 1; index < page.items.length; index += 1) {
      if (page.items[index - 1]!.revision <= page.items[index]!.revision) {
        addIssue(ctx, ['items', index, 'revision'], 'weekly review history must be newest first')
        break
      }
    }
    if (new Set(page.items.map((item) => item.revision)).size !== page.items.length) {
      addIssue(ctx, ['items'], 'weekly review history revisions must be unique')
    }
    const first = page.items[0]
    if (
      first &&
      page.items.some(
        (item) =>
          item.weekStart !== first.weekStart ||
          item.weekEndExclusive !== first.weekEndExclusive ||
          item.timezone !== first.timezone,
      )
    ) {
      addIssue(ctx, ['items'], 'weekly review history must describe one local week')
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
export type PersonalModelItemRevision = z.infer<typeof personalModelItemRevisionSchema>
export type PersonalModelFeedbackApplication = z.infer<
  typeof personalModelFeedbackApplicationSchema
>
export type PersonalModelFeedbackTransitionResult = z.infer<
  typeof personalModelFeedbackTransitionResultSchema
>
export type WeeklyCognitiveReviewContent = z.infer<typeof weeklyCognitiveReviewContentSchema>
export type WeeklyCognitiveReviewRevision = z.infer<typeof weeklyCognitiveReviewRevisionSchema>
export type WeeklyCognitiveReviewEnvelope = z.infer<typeof weeklyCognitiveReviewEnvelopeSchema>
export type WeeklyCognitiveReviewHistoryPage = z.infer<
  typeof weeklyCognitiveReviewHistoryPageSchema
>
