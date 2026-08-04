import { describe, expect, it } from 'vitest'
import type { WeeklyPlan } from '@myfitness/contracts'

import {
  changedPlanSelections,
  currentPlanFreshness,
  defaultPlanWeekStart,
  planFreshnessNotice,
  planFreshnessProjectionKey,
  updatePlanSelection,
} from './plan.model'

const plan = {
  evidence: {
    onboardingRevision: 1,
    dashboardGeneratedAt: '2026-07-20T08:00:00.000Z',
    readinessScore: null,
    recentActiveDays: 0,
    recentWorkoutCount: 0,
    recentActiveMinutes: 0,
    recentMealCount: 0,
    evidencePolicyVersion: 'planning-impact-v1',
    evidenceFingerprint: 'planning-impact-v1:readiness-missing',
  },
  days: [
    {
      weekday: 'mon',
      date: '2026-07-20',
      available: true,
      session: {
        kind: 'strength',
        title: '全身力量 A',
        plannedMinutes: 30,
        intensity: 'easy',
        note: '按状态调整',
        activities: [
          {
            id: 'mon_squat',
            role: 'squat',
            selectedOptionId: 'chair_squat',
            options: [
              { id: 'chair_squat', title: '椅子深蹲', dose: '2 组', equipment: [] },
              {
                id: 'goblet_squat',
                title: '高脚杯深蹲',
                dose: '2 组',
                equipment: ['dumbbells'],
              },
            ],
          },
        ],
      },
    },
  ],
} as WeeklyPlan

describe('plan page model', () => {
  it('uses next Monday when opened on Sunday', () => {
    expect(defaultPlanWeekStart(new Date('2026-07-19T09:00:00+08:00'))).toBe('2026-07-20')
    expect(defaultPlanWeekStart(new Date('2026-07-22T09:00:00+08:00'))).toBe('2026-07-20')
  })

  it('reports only changed substitutions', () => {
    const changed = updatePlanSelection(plan, 'mon_squat', 'goblet_squat')
    expect(changedPlanSelections(plan, changed)).toEqual([
      { activityId: 'mon_squat', optionId: 'goblet_squat' },
    ])
    expect(changedPlanSelections(plan, plan)).toEqual([])
  })

  it('distinguishes a current plan from a stale server projection', () => {
    const current = currentPlanFreshness(plan, '2026-08-04T08:00:00.000Z')
    expect(current).toMatchObject({
      state: 'current',
      planOnboardingRevision: plan.evidence.onboardingRevision,
      canAcceptOrModify: true,
      canExplainWithAi: true,
      currentEvidenceFingerprint: 'planning-impact-v1:readiness-missing',
    })
    expect(planFreshnessNotice(current)).toBeNull()
    expect(
      planFreshnessNotice({
        state: 'profile_changed',
        checkedAt: '2026-08-04T08:00:00.000Z',
        planOnboardingRevision: 1,
        currentOnboardingRevision: 2,
        canAcceptOrModify: false,
        canExplainWithAi: false,
        canSkip: true,
        recommendedAction: 'regenerate',
      }),
    ).toMatchObject({
      eyebrow: 'MISALIGNED FOLD',
      actionLabel: '按最新资料重排本周',
    })
  })

  it('explains material evidence drift without presenting it as a diagnosis', () => {
    const changed = {
      state: 'evidence_changed',
      checkedAt: '2026-08-04T08:00:00.000Z',
      planOnboardingRevision: 1,
      currentOnboardingRevision: 1,
      evidencePolicyVersion: 'planning-impact-v1',
      planEvidenceFingerprint: 'planning-impact-v1:readiness-missing',
      currentEvidenceFingerprint: 'planning-impact-v1:readiness-standard',
      changeReason: 'recovery_added',
      canAcceptOrModify: false,
      canExplainWithAi: false,
      canSkip: true,
      recommendedAction: 'regenerate',
    } as const
    expect(planFreshnessNotice(changed)).toMatchObject({
      eyebrow: 'EVIDENCE SHIFT',
      title: '新的恢复记录改变了本周安排边界',
      actionLabel: '按最新记录重排本周',
    })
    expect(planFreshnessNotice(changed)?.body).toContain('不是医学判断')
    expect(planFreshnessProjectionKey(changed)).not.toBe(
      planFreshnessProjectionKey({
        ...changed,
        currentEvidenceFingerprint: 'planning-impact-v1:readiness-conservative',
        changeReason: 'recovery_threshold_crossed',
      }),
    )
  })
})
