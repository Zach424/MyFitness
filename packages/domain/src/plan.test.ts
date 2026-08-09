import { describe, expect, it } from 'vitest'
import type { Dashboard, OnboardingResponse } from '@myfitness/contracts'

import {
  applyPlanSelections,
  assessPlanEligibility,
  buildWeeklyPlanContent,
  comparePlanEvidence,
} from './plan'
import { buildPlanOutcomeReview } from './plan-outcome'
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
  it('keeps the generated recovery evidence in the plan snapshot', () => {
    const plan = buildWeeklyPlanContent({ weekStart: '2026-07-20', onboarding, dashboard })

    expect(plan.evidence.recoveryState).toEqual(dashboard.readiness)
    expect(plan.evidence.readinessScore).toBeNull()
  })

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

describe('plan outcome review', () => {
  it('traces adopted substitutions and subsequent confirmed evidence without inferring effect', () => {
    const id = '10000000-0000-4000-8000-000000000001'
    const content = buildWeeklyPlanContent({ weekStart: '2026-07-20', onboarding, dashboard })
    const activity = content.days
      .flatMap((day) => day.session?.activities ?? [])
      .find((candidate) => candidate.options.length > 1)!
    const adoptedOption = activity.options[1]!
    const adjusted = applyPlanSelections(content, [
      { activityId: activity.id, optionId: adoptedOption.id },
    ])
    const aggregate = {
      id,
      userId: onboarding.userId,
      weekStart: '2026-07-20',
      timezone: 'Asia/Shanghai',
      engineVersion: 'deterministic-v1' as const,
      createdAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-20T00:00:00.000Z',
    }
    const baseline = { ...aggregate, ...content, status: 'draft' as const, revision: 1 }
    const adopted = { ...aggregate, ...adjusted, status: 'accepted' as const, revision: 3 }
    const review = buildPlanOutcomeReview({
      baseline,
      adopted,
      adoptedAt: '2026-07-20T08:00:00.000Z',
      observedThrough: '2026-07-22T08:00:00.000Z',
      linkedWorkouts: [
        {
          id: '20000000-0000-4000-8000-000000000001',
          userId: onboarding.userId,
          planId: id,
          planRevision: 3,
          sessionDate: '2026-07-21',
          workoutId: '30000000-0000-4000-8000-000000000001',
          workoutRevision: 1,
          currentWorkoutRevision: 1,
          workoutTitle: '采用后的实际训练',
          workoutStatus: 'completed',
          workoutStartedAt: '2026-07-21T08:00:00.000Z',
          revision: 1,
          linkedAt: '2026-07-21T09:00:00.000Z',
        },
      ],
      recoveryObservations: [
        {
          recordId: '40000000-0000-4000-8000-000000000001',
          revision: 2,
          metric: 'recovery.energy',
          canonicalValue: 4,
          occurredAt: '2026-07-22T07:00:00.000Z',
          sourceKind: 'manual',
        },
      ],
      recoveryObservationTotal: 1,
    })

    expect(review).toMatchObject({
      policyVersion: 'plan-outcome-review-v1',
      planRevision: 3,
      followUpState: 'observed',
      plannedSessionCount: 2,
      planningEvidence: { recoveryState: dashboard.readiness },
    })
    expect(review.adjustments).toEqual([
      expect.objectContaining({
        activityId: activity.id,
        before: { id: activity.selectedOptionId, title: expect.any(String) },
        adopted: { id: adoptedOption.id, title: adoptedOption.title },
      }),
    ])
    expect(review.limitations.join(' ')).toContain('不能单独证明计划造成了变化')
  })

  it('keeps the outcome unknown when no post-adoption record exists', () => {
    const content = buildWeeklyPlanContent({ weekStart: '2026-07-20', onboarding, dashboard })
    const plan = {
      id: '10000000-0000-4000-8000-000000000002',
      userId: onboarding.userId,
      weekStart: '2026-07-20',
      timezone: 'Asia/Shanghai',
      engineVersion: 'deterministic-v1' as const,
      status: 'accepted' as const,
      revision: 2,
      createdAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-20T00:00:00.000Z',
      ...content,
    }
    const review = buildPlanOutcomeReview({
      baseline: { ...plan, status: 'draft', revision: 1 },
      adopted: plan,
      adoptedAt: '2026-07-20T08:00:00.000Z',
      observedThrough: '2026-07-27T08:00:00.000Z',
      linkedWorkouts: [],
      recoveryObservations: [],
      recoveryObservationTotal: 0,
      withdrawnEvidence: { workoutLinkCount: 1, recoveryRecordCount: 1 },
    })

    expect(review).toMatchObject({
      followUpState: 'unknown',
      observationWindow: { state: 'closed' },
      adjustments: [],
      withdrawnEvidence: { workoutLinkCount: 1, recoveryRecordCount: 1 },
    })
    expect(review.limitations.join(' ')).toContain('这些撤销事实不再构成后续证据')
  })
})
