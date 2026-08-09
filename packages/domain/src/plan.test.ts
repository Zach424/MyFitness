import { describe, expect, it } from 'vitest'
import type { Dashboard, OnboardingResponse } from '@myfitness/contracts'

import {
  applyPlanSelections,
  assessPlanEligibility,
  buildWeeklyPlanContent,
  comparePlanEvidence,
} from './plan'
import { estimateSubjectiveRecoveryState } from './recovery-state'

const recoveryAt = new Date('2026-07-19T08:00:00.000Z')
const recoveryObservation = (
  id: number,
  metric: 'recovery.energy' | 'recovery.sleep_quality' | 'recovery.stress',
  occurredAt: string,
  canonicalValue: number,
) => ({
  recordId: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
  revision: 1,
  metric,
  occurredAt: new Date(occurredAt),
  canonicalValue,
  sourceKind: 'manual' as const,
})

const unknownReadiness = estimateSubjectiveRecoveryState([], 'Asia/Shanghai', recoveryAt)
const moderateReadiness = estimateSubjectiveRecoveryState(
  [
    ...Array.from({ length: 7 }, (_, index) =>
      (['recovery.energy', 'recovery.sleep_quality', 'recovery.stress'] as const).map(
        (metric, metricIndex) =>
          recoveryObservation(
            index * 3 + metricIndex + 1,
            metric,
            `2026-07-${String(index + 1).padStart(2, '0')}T08:00:00.000Z`,
            3,
          ),
      ),
    ).flat(),
    ...Array.from({ length: 3 }, (_, index) =>
      (['recovery.energy', 'recovery.sleep_quality', 'recovery.stress'] as const).map(
        (metric, metricIndex) =>
          recoveryObservation(
            30 + index * 3 + metricIndex,
            metric,
            `2026-07-${16 + index}T08:00:00.000Z`,
            metric === 'recovery.stress' ? 2 : 4,
          ),
      ),
    ).flat(),
  ],
  'Asia/Shanghai',
  recoveryAt,
)

const onboarding = {
  userId: '00000000-0000-4000-8000-000000000001',
  revision: 2,
  profile: {
    displayName: '小陈',
    ageBand: '25_34',
    sexForCalculations: 'unspecified',
    canonicalHeightCm: 175,
    displayHeight: { value: 175, unit: 'cm' },
    unitSystem: 'metric',
    timezone: 'Asia/Shanghai',
  },
  goal: {
    primaryGoal: 'habit',
    experience: 'beginner',
    availableDays: ['tue', 'thu', 'sat'],
    sessionMinutes: 45,
    equipment: ['dumbbells'],
    dietaryPreferences: ['vegan'],
  },
  eligibility: { status: 'eligible', riskFlags: [] },
  consents: [],
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
} satisfies OnboardingResponse

const dashboard = {
  generatedAt: '2026-07-19T08:00:00.000Z',
  timezone: 'Asia/Shanghai',
  today: { date: '2026-07-19', items: [] },
  readiness: unknownReadiness,
  trends: [
    {
      days: 7,
      activeDays: 2,
      measurementCount: 0,
      workoutCount: 1,
      mealCount: 2,
      workoutVolumeKg: 0,
      activeMinutes: 20,
      energyKcal: 800,
      proteinG: 30,
    },
    {
      days: 30,
      activeDays: 2,
      measurementCount: 0,
      workoutCount: 1,
      mealCount: 2,
      workoutVolumeKg: 0,
      activeMinutes: 20,
      energyKcal: 800,
      proteinG: 30,
    },
    {
      days: 90,
      activeDays: 2,
      measurementCount: 0,
      workoutCount: 1,
      mealCount: 2,
      workoutVolumeKg: 0,
      activeMinutes: 20,
      energyKcal: 800,
      proteinG: 30,
    },
  ],
} satisfies Dashboard

describe('deterministic weekly plan', () => {
  it('respects available days, conservative recovery and dietary preferences', () => {
    const plan = buildWeeklyPlanContent({ weekStart: '2026-07-20', onboarding, dashboard })
    const sessions = plan.days.filter((day) => day.session)

    expect(plan.days.map((day) => day.date)).toEqual([
      '2026-07-20',
      '2026-07-21',
      '2026-07-22',
      '2026-07-23',
      '2026-07-24',
      '2026-07-25',
      '2026-07-26',
    ])
    expect(sessions).toHaveLength(2)
    expect(sessions.every((day) => day.available && day.session?.intensity === 'easy')).toBe(true)
    expect(sessions.map((day) => day.weekday)).toEqual(['tue', 'sat'])
    expect(plan.nutritionFocuses.find((focus) => focus.key === 'protein_source')?.action).toContain(
      '豆',
    )
    expect(JSON.stringify(plan)).not.toContain('machines')
  })

  it('adds a separated cardio day when evidence and experience allow it', () => {
    const plan = buildWeeklyPlanContent({
      weekStart: '2026-07-20',
      onboarding: {
        ...onboarding,
        goal: {
          ...onboarding.goal,
          experience: 'intermediate',
          availableDays: ['mon', 'wed', 'fri', 'sun'],
        },
      },
      dashboard: {
        ...dashboard,
        readiness: moderateReadiness,
      },
    })
    expect(plan.days.flatMap((day) => (day.session ? [day.session.kind] : []))).toEqual([
      'strength',
      'cardio',
      'strength',
    ])
    expect(
      plan.days.filter((day) => day.session).every((day) => day.session?.intensity === 'moderate'),
    ).toBe(true)
  })

  it('blocks risk-flagged profiles before generation', () => {
    expect(
      assessPlanEligibility({
        ...onboarding,
        eligibility: { status: 'professional_clearance_required', riskFlags: ['chest_pain'] },
      }),
    ).toMatchObject({ allowed: false, code: 'professional_clearance_required' })
  })

  it('invalidates only readiness changes that cross a planning-impact boundary', () => {
    expect(comparePlanEvidence(null, null)).toMatchObject({ current: true })
    expect(comparePlanEvidence(42, 59)).toMatchObject({ current: true })
    expect(comparePlanEvidence(60, 88)).toMatchObject({ current: true })
    expect(comparePlanEvidence(null, 80)).toMatchObject({
      current: false,
      changeReason: 'recovery_added',
    })
    expect(comparePlanEvidence(80, null)).toMatchObject({
      current: false,
      changeReason: 'recovery_expired',
    })
    expect(comparePlanEvidence(80, 59)).toMatchObject({
      current: false,
      changeReason: 'recovery_threshold_crossed',
    })
  })

  it('applies only a declared substitution', () => {
    const plan = buildWeeklyPlanContent({ weekStart: '2026-07-20', onboarding, dashboard })
    const activity = plan.days
      .flatMap((day) => day.session?.activities ?? [])
      .find((item) => item.options.length > 1)!
    const changed = applyPlanSelections(plan, [
      { activityId: activity.id, optionId: activity.options[1]!.id },
    ])
    expect(
      changed.days
        .flatMap((day) => day.session?.activities ?? [])
        .find((item) => item.id === activity.id)?.selectedOptionId,
    ).toBe(activity.options[1]!.id)
    expect(() =>
      applyPlanSelections(plan, [{ activityId: activity.id, optionId: 'unknown_option' }]),
    ).toThrow(/not available/)
  })
})
