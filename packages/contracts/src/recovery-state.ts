import * as z from 'zod'

import { sourceKindSchema } from './health-record'
import {
  recoveryConfidenceValues,
  recoveryConsistencyValues,
  recoveryEvidenceWindows,
  recoveryStatePolicyVersion,
  recoveryStateValues,
  subjectiveRecoveryMetrics,
} from './recovery-state.constants'

export * from './recovery-state.constants'

export const subjectiveRecoveryMetricSchema = z.enum(subjectiveRecoveryMetrics)
export const recoveryStateValueSchema = z.enum(recoveryStateValues)
export const recoveryConfidenceSchema = z.enum(recoveryConfidenceValues)
export const recoveryConsistencySchema = z.enum(recoveryConsistencyValues)
export const recoveryEvidenceWindowSchema = z.enum(recoveryEvidenceWindows)

const recoveryWindowCoverageSchema = z
  .object({
    startAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }),
    days: z.union([z.literal(7), z.literal(28)]),
    observationCount: z.number().int().min(0).max(116),
    recordedDays: z.number().int().min(0).max(29),
    metricCount: z.number().int().min(0).max(subjectiveRecoveryMetrics.length),
  })
  .strict()
  .superRefine((window, ctx) => {
    if (Date.parse(window.startAt) >= Date.parse(window.endAt)) {
      ctx.addIssue({ code: 'custom', message: 'recovery window start must precede end' })
    }
    if (window.recordedDays > window.observationCount) {
      ctx.addIssue({ code: 'custom', message: 'recordedDays cannot exceed observationCount' })
    }
    if (window.metricCount > window.observationCount) {
      ctx.addIssue({ code: 'custom', message: 'metricCount cannot exceed observationCount' })
    }
    const maximumRecordedDays = window.days === 7 ? 8 : 29
    const maximumObservations = maximumRecordedDays * subjectiveRecoveryMetrics.length
    if (
      window.recordedDays > maximumRecordedDays ||
      window.observationCount > maximumObservations
    ) {
      ctx.addIssue({ code: 'custom', message: 'coverage exceeds its elapsed-time window' })
    }
  })

export const recoveryEvidenceReferenceSchema = z
  .object({
    recordId: z.string().uuid(),
    revision: z.number().int().positive(),
    metric: subjectiveRecoveryMetricSchema,
    occurredAt: z.string().datetime({ offset: true }),
    sourceKind: sourceKindSchema,
    window: recoveryEvidenceWindowSchema,
    canonicalValue: z.number().finite().min(1).max(5),
    normalizedScore: z.number().int().min(0).max(100),
  })
  .strict()
  .refine((evidence) => evidence.sourceKind !== 'ai_estimate', {
    message: 'subjective recovery evidence cannot use an AI estimate as an observation',
    path: ['sourceKind'],
  })

export const recoveryStateFactorSchema = z
  .object({
    metric: subjectiveRecoveryMetricSchema,
    label: z.string().min(1),
    recentScore: z.number().int().min(0).max(100),
    baselineScore: z.number().int().min(0).max(100).nullable(),
    changeFromBaseline: z.number().int().min(-100).max(100).nullable(),
    recentObservationCount: z.number().int().positive().max(8),
    baselineObservationCount: z.number().int().min(0).max(29),
  })
  .strict()
  .superRefine((factor, ctx) => {
    if (
      (factor.baselineScore === null) !== (factor.changeFromBaseline === null) ||
      (factor.baselineScore !== null &&
        factor.changeFromBaseline !== factor.recentScore - factor.baselineScore)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'factor baseline and change must be jointly absent or exactly consistent',
      })
    }
  })

export const recoveryStateEstimateSchema = z
  .object({
    policyVersion: z.literal(recoveryStatePolicyVersion),
    state: recoveryStateValueSchema,
    score: z.number().int().min(0).max(100).nullable(),
    baselineScore: z.number().int().min(0).max(100).nullable(),
    changeFromBaseline: z.number().int().min(-100).max(100).nullable(),
    confidence: recoveryConfidenceSchema,
    consistency: recoveryConsistencySchema,
    label: z.string().min(1),
    note: z.string().min(1),
    coverage: z
      .object({
        recent: recoveryWindowCoverageSchema,
        baseline: recoveryWindowCoverageSchema,
        excludedObservationCount: z.number().int().min(0),
      })
      .strict(),
    factors: z.array(recoveryStateFactorSchema).max(subjectiveRecoveryMetrics.length),
    evidence: z.array(recoveryEvidenceReferenceSchema).max(148),
    limitations: z.array(z.string().min(1)).min(1).max(5),
  })
  .strict()
  .superRefine((estimate, ctx) => {
    if (estimate.coverage.recent.days !== 7 || estimate.coverage.baseline.days !== 28) {
      ctx.addIssue({ code: 'custom', message: 'recovery estimate requires 7/28-day windows' })
    }
    const recentEvidence = estimate.evidence.filter((item) => item.window === 'recent')
    const baselineEvidence = estimate.evidence.filter((item) => item.window === 'baseline')
    if (
      recentEvidence.length !== estimate.coverage.recent.observationCount ||
      baselineEvidence.length !== estimate.coverage.baseline.observationCount
    ) {
      ctx.addIssue({ code: 'custom', message: 'coverage counts must match evidence references' })
    }
    const identities = estimate.evidence.map(
      (item) => `${item.recordId}:${item.revision}:${item.window}`,
    )
    if (new Set(identities).size !== identities.length) {
      ctx.addIssue({ code: 'custom', message: 'recovery evidence references must be unique' })
    }

    if (estimate.state === 'unknown') {
      if (
        estimate.score !== null ||
        estimate.baselineScore !== null ||
        estimate.changeFromBaseline !== null ||
        estimate.confidence !== 'insufficient' ||
        estimate.consistency !== 'unknown'
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'unknown recovery state must not expose an estimate',
        })
      }
      return
    }

    if (estimate.score === null || estimate.confidence === 'insufficient') {
      ctx.addIssue({ code: 'custom', message: 'estimated recovery state requires a score' })
    }
    if (estimate.consistency === 'unknown') {
      ctx.addIssue({ code: 'custom', message: 'estimated recovery state requires consistency' })
    }
    if (estimate.confidence === 'moderate' && estimate.consistency !== 'aligned') {
      ctx.addIssue({ code: 'custom', message: 'moderate recovery confidence requires alignment' })
    }
    if (estimate.state === 'current_only') {
      if (estimate.baselineScore !== null || estimate.changeFromBaseline !== null) {
        ctx.addIssue({
          code: 'custom',
          message: 'current-only recovery has no baseline comparison',
        })
      }
      if (estimate.confidence !== 'low') {
        ctx.addIssue({
          code: 'custom',
          message: 'current-only recovery confidence must remain low',
        })
      }
      return
    }

    if (
      estimate.score === null ||
      estimate.baselineScore === null ||
      estimate.changeFromBaseline === null ||
      estimate.changeFromBaseline !== estimate.score - estimate.baselineScore
    ) {
      ctx.addIssue({ code: 'custom', message: 'baseline recovery state requires an exact delta' })
    }
  })

export type SubjectiveRecoveryMetric = z.infer<typeof subjectiveRecoveryMetricSchema>
export type RecoveryStateEstimate = z.infer<typeof recoveryStateEstimateSchema>
export type RecoveryStateFactor = z.infer<typeof recoveryStateFactorSchema>
export type RecoveryEvidenceReference = z.infer<typeof recoveryEvidenceReferenceSchema>
