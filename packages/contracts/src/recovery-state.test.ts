import { describe, expect, it } from 'vitest'

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
})
