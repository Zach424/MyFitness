import { describe, expect, it } from 'vitest'

import { planEvidenceSchema } from './plan'
import {
  recoveryStateFactorLabelMaximumLength,
  recoveryStateLabelMaximumLength,
  recoveryStateLimitationMaximumLength,
  recoveryStateNoteMaximumLength,
} from './recovery-state.constants'
import { recoveryStateEstimateSchema } from './recovery-state'

const emptyCoverage = {
  recent: {
    startAt: '2026-08-03T08:00:00.000Z',
    endAt: '2026-08-10T08:00:00.000Z',
    days: 7 as const,
    observationCount: 0,
    recordedDays: 0,
    metricCount: 0,
  },
  baseline: {
    startAt: '2026-07-06T08:00:00.000Z',
    endAt: '2026-08-03T08:00:00.000Z',
    days: 28 as const,
    observationCount: 0,
    recordedDays: 0,
    metricCount: 0,
  },
  excludedObservationCount: 0,
}

const unknownEstimate = {
  policyVersion: 'subjective-recovery-state-v1' as const,
  state: 'unknown' as const,
  score: null,
  baselineScore: null,
  changeFromBaseline: null,
  confidence: 'insufficient' as const,
  consistency: 'unknown' as const,
  label: '主观恢复证据不足',
  note: '近 7 天没有足够证据。',
  coverage: emptyCoverage,
  factors: [],
  evidence: [],
  limitations: ['主观恢复摘要不是医学或生理恢复结论。'],
}

describe('recovery state contract', () => {
  it('preserves Unknown without manufacturing a score', () => {
    expect(recoveryStateEstimateSchema.parse(unknownEstimate)).toEqual(unknownEstimate)
  })

  it('rejects a current-only estimate presented with stronger confidence', () => {
    const result = recoveryStateEstimateSchema.safeParse({
      ...unknownEstimate,
      state: 'current_only',
      score: 75,
      confidence: 'moderate',
      consistency: 'aligned',
    })

    expect(result.success).toBe(false)
  })

  it('rejects coverage that is not backed by evidence references', () => {
    const result = recoveryStateEstimateSchema.safeParse({
      ...unknownEstimate,
      coverage: {
        ...emptyCoverage,
        recent: { ...emptyCoverage.recent, observationCount: 1, recordedDays: 1, metricCount: 1 },
      },
    })

    expect(result.success).toBe(false)
  })

  it('rejects AI estimates and mixed signals presented as moderate confidence', () => {
    const evidence = {
      recordId: '00000000-0000-4000-8000-000000000001',
      revision: 1,
      metric: 'recovery.energy',
      occurredAt: '2026-08-09T08:00:00.000Z',
      sourceKind: 'ai_estimate',
      window: 'recent',
      canonicalValue: 4,
      normalizedScore: 75,
    }
    expect(
      recoveryStateEstimateSchema.safeParse({
        ...unknownEstimate,
        coverage: {
          ...emptyCoverage,
          recent: { ...emptyCoverage.recent, observationCount: 1, recordedDays: 1, metricCount: 1 },
        },
        evidence: [evidence],
      }).success,
    ).toBe(false)

    expect(
      recoveryStateEstimateSchema.safeParse({
        ...unknownEstimate,
        state: 'near_baseline',
        score: 75,
        baselineScore: 75,
        changeFromBaseline: 0,
        confidence: 'moderate',
        consistency: 'mixed',
      }).success,
    ).toBe(false)
  })

  it('rejects derived display strings beyond the persisted v1 boundary', () => {
    expect(
      recoveryStateEstimateSchema.safeParse({
        ...unknownEstimate,
        label: '恢'.repeat(recoveryStateLabelMaximumLength + 1),
      }).success,
    ).toBe(false)
    expect(
      recoveryStateEstimateSchema.safeParse({
        ...unknownEstimate,
        note: '恢'.repeat(recoveryStateNoteMaximumLength + 1),
      }).success,
    ).toBe(false)
    expect(
      recoveryStateEstimateSchema.safeParse({
        ...unknownEstimate,
        factors: [
          {
            metric: 'recovery.energy',
            label: '恢'.repeat(recoveryStateFactorLabelMaximumLength + 1),
            recentScore: 50,
            baselineScore: null,
            changeFromBaseline: null,
            recentObservationCount: 1,
            baselineObservationCount: 0,
          },
        ],
      }).success,
    ).toBe(false)
    expect(
      recoveryStateEstimateSchema.safeParse({
        ...unknownEstimate,
        limitations: ['恢'.repeat(recoveryStateLimitationMaximumLength + 1)],
      }).success,
    ).toBe(false)
  })

  it('keeps the maximum bounded planning evidence below one 64 KiB database payload', () => {
    const metrics = [
      'recovery.energy',
      'recovery.sleep_quality',
      'recovery.stress',
      'recovery.soreness',
    ] as const
    const evidence = Array.from({ length: 148 }, (_, index) => ({
      recordId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      revision: 2_147_483_647,
      metric: metrics[index % metrics.length],
      occurredAt: '9999-12-31T23:59:59.999+14:00',
      sourceKind: 'imported' as const,
      window: index < 32 ? ('recent' as const) : ('baseline' as const),
      canonicalValue: 5,
      normalizedScore: 100,
    }))
    const recoveryState = recoveryStateEstimateSchema.parse({
      policyVersion: 'subjective-recovery-state-v1',
      state: 'unknown',
      score: null,
      baselineScore: null,
      changeFromBaseline: null,
      confidence: 'insufficient',
      consistency: 'unknown',
      label: '恢'.repeat(recoveryStateLabelMaximumLength),
      note: '恢'.repeat(recoveryStateNoteMaximumLength),
      coverage: {
        recent: {
          startAt: '9999-12-24T23:59:59.999+14:00',
          endAt: '9999-12-31T23:59:59.999+14:00',
          days: 7,
          observationCount: 32,
          recordedDays: 8,
          metricCount: 4,
        },
        baseline: {
          startAt: '9999-11-26T23:59:59.999+14:00',
          endAt: '9999-12-24T23:59:59.999+14:00',
          days: 28,
          observationCount: 116,
          recordedDays: 29,
          metricCount: 4,
        },
        excludedObservationCount: 2_147_483_647,
      },
      factors: metrics.map((metric) => ({
        metric,
        label: '恢'.repeat(recoveryStateFactorLabelMaximumLength),
        recentScore: 100,
        baselineScore: 100,
        changeFromBaseline: 0,
        recentObservationCount: 8,
        baselineObservationCount: 29,
      })),
      evidence,
      limitations: Array.from({ length: 5 }, () =>
        '恢'.repeat(recoveryStateLimitationMaximumLength),
      ),
    })
    const planEvidence = planEvidenceSchema.parse({
      onboardingRevision: 2_147_483_647,
      dashboardGeneratedAt: '9999-12-31T23:59:59.999+14:00',
      readinessScore: null,
      recentActiveDays: 2_147_483_647,
      recentWorkoutCount: 2_147_483_647,
      recentActiveMinutes: Number.MAX_VALUE,
      recentMealCount: 2_147_483_647,
      recoveryState,
      evidencePolicyVersion: 'planning-impact-v1',
      evidenceFingerprint: 'planning-impact-v1:readiness-missing',
    })

    expect(new TextEncoder().encode(JSON.stringify(planEvidence)).byteLength).toBeLessThan(
      64 * 1024,
    )
  })
})
