import { describe, expect, it } from 'vitest'
import type { Dashboard, OnboardingResponse } from '@myfitness/contracts'

import { applyPlanSelections, assessPlanEligibility, buildWeeklyPlanContent } from './plan'

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
  readiness: { score: null, label: '等待恢复记录', note: '没有证据', factors: [] },
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
        readiness: { ...dashboard.readiness, score: 82 },
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
