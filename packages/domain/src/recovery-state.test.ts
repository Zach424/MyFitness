import { describe, expect, it } from 'vitest'

import {
  estimateSubjectiveRecoveryState,
  planningReadinessScore,
  type SubjectiveRecoveryObservation,
} from './recovery-state'

const at = new Date('2026-08-10T12:00:00.000Z')
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const observation = (
  value: number,
  daysAgo: number,
  metric: SubjectiveRecoveryObservation['metric'],
  canonicalValue: number,
  sourceKind: SubjectiveRecoveryObservation['sourceKind'] = 'manual',
): SubjectiveRecoveryObservation => ({
  recordId: id(value),
  revision: 1,
  metric,
  canonicalValue,
  occurredAt: new Date(at.getTime() - daysAgo * 86_400_000),
  sourceKind,
})

describe('主观恢复状态估计', () => {
  it('没有证据时保持 Unknown', () => {
    const estimate = estimateSubjectiveRecoveryState([], 'Asia/Shanghai', at)
    expect(estimate).toMatchObject({
      state: 'unknown',
      score: null,
      baselineScore: null,
      confidence: 'insufficient',
      consistency: 'unknown',
    })
    expect(planningReadinessScore(estimate)).toBeNull()
  })

  it('不会把一次自述升级成用户恢复状态', () => {
    const estimate = estimateSubjectiveRecoveryState(
      [observation(1, 1, 'recovery.energy', 1)],
      'Asia/Shanghai',
      at,
    )
    expect(estimate).toMatchObject({
      state: 'unknown',
      score: null,
      coverage: { recent: { recordedDays: 1, metricCount: 1 } },
    })
    expect(estimate.evidence[0]).toMatchObject({ recordId: id(1), metric: 'recovery.energy' })
  })

  it('证据达到最低覆盖但没有个人基线时只生成低置信近期摘要', () => {
    const estimate = estimateSubjectiveRecoveryState(
      [observation(1, 1, 'recovery.energy', 4), observation(2, 2, 'recovery.sleep_quality', 3)],
      'Asia/Shanghai',
      at,
    )
    expect(estimate).toMatchObject({
      state: 'current_only',
      score: 63,
      baselineScore: null,
      confidence: 'low',
      consistency: 'aligned',
    })
    expect(planningReadinessScore(estimate)).toBeNull()
  })

  it('用此前二十八天的同类指标形成可追溯个人基线', () => {
    const observations: SubjectiveRecoveryObservation[] = []
    for (let day = 8; day <= 14; day += 1) {
      observations.push(
        observation(day * 10 + 1, day, 'recovery.energy', 4),
        observation(day * 10 + 2, day, 'recovery.sleep_quality', 4),
        observation(day * 10 + 3, day, 'recovery.stress', 2),
      )
    }
    observations.push(
      observation(1, 1, 'recovery.energy', 2),
      observation(2, 2, 'recovery.sleep_quality', 2),
      observation(3, 3, 'recovery.stress', 4),
    )

    const estimate = estimateSubjectiveRecoveryState(observations, 'Asia/Shanghai', at)
    expect(estimate).toMatchObject({
      state: 'below_baseline',
      score: 25,
      baselineScore: 75,
      changeFromBaseline: -50,
      confidence: 'moderate',
      consistency: 'aligned',
      coverage: {
        recent: { recordedDays: 3, metricCount: 3, observationCount: 3 },
        baseline: { recordedDays: 7, metricCount: 3, observationCount: 21 },
      },
    })
    expect(estimate.evidence).toHaveLength(24)
    expect(planningReadinessScore(estimate)).toBe(25)
  })

  it('信号互相矛盾时保留摘要但降低置信度并禁止影响计划', () => {
    const observations: SubjectiveRecoveryObservation[] = []
    for (let day = 8; day <= 14; day += 1) {
      observations.push(
        observation(day * 10 + 1, day, 'recovery.energy', 3),
        observation(day * 10 + 2, day, 'recovery.sleep_quality', 3),
        observation(day * 10 + 3, day, 'recovery.stress', 3),
      )
    }
    observations.push(
      observation(1, 1, 'recovery.energy', 5),
      observation(2, 2, 'recovery.sleep_quality', 5),
      observation(3, 3, 'recovery.stress', 5),
    )
    const estimate = estimateSubjectiveRecoveryState(observations, 'Asia/Shanghai', at)
    expect(estimate).toMatchObject({ consistency: 'mixed', confidence: 'low' })
    expect(estimate.note).toContain('不能归结为单一原因')
    expect(planningReadinessScore(estimate)).toBeNull()
  })

  it('排除 AI 推断、未来记录和同日重复，不让高频输入放大权重', () => {
    const estimate = estimateSubjectiveRecoveryState(
      [
        observation(1, 1, 'recovery.energy', 2),
        { ...observation(2, 1, 'recovery.energy', 5), occurredAt: new Date(at.getTime() - dayMs) },
        observation(3, 2, 'recovery.sleep_quality', 3),
        observation(4, 1, 'recovery.stress', 1, 'ai_estimate'),
        observation(5, -1, 'recovery.soreness', 1),
      ],
      'Asia/Shanghai',
      at,
    )
    expect(estimate.coverage.recent.observationCount).toBe(2)
    expect(estimate.coverage.excludedObservationCount).toBe(3)
    expect(estimate.evidence.map((item) => item.recordId)).toEqual([id(2), id(3)])
  })

  it('在七个完整经过日的边界仍能保留逐日本地证据', () => {
    const estimate = estimateSubjectiveRecoveryState(
      Array.from({ length: 8 }, (_, day) => observation(day + 1, day, 'recovery.energy', 4)).concat(
        [observation(20, 1, 'recovery.sleep_quality', 4)],
      ),
      'Asia/Shanghai',
      at,
    )

    expect(estimate.coverage.recent).toMatchObject({ recordedDays: 8, observationCount: 9 })
    expect(estimate.factors[0]).toMatchObject({ recentObservationCount: 8 })
  })
})

const dayMs = 86_400_000
