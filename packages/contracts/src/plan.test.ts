import { describe, expect, it } from 'vitest'

import {
  createPlanWorkoutLinkSchema,
  generateWeeklyPlanSchema,
  normalizePersistedPlanEvidence,
  planDecisionSchema,
  planExperienceReflectionSchema,
  planEvidenceSchema,
  planFreshnessSchema,
  planWorkoutLinkSchema,
  weeklyPlanHistoryQuerySchema,
  weeklyPlanRevisionSchema,
  writePlanExperienceReflectionSchema,
} from './plan'

describe('weekly plan contract', () => {
  it('accepts Monday generation and explicit decisions', () => {
    expect(generateWeeklyPlanSchema.parse({ weekStart: '2026-07-20' })).toEqual({
      weekStart: '2026-07-20',
    })
    expect(
      planDecisionSchema.parse({
        decision: 'modified',
        expectedRevision: 1,
        selections: [{ activityId: 'mon_squat', optionId: 'chair_squat' }],
      }),
    ).toMatchObject({ decision: 'modified' })
  })

  it('bounds immutable plan history pages and rejects extra query fields', () => {
    expect(weeklyPlanHistoryQuerySchema.parse({})).toEqual({ limit: 20 })
    expect(weeklyPlanHistoryQuerySchema.parse({ limit: '50' })).toEqual({ limit: 50 })
    expect(weeklyPlanHistoryQuerySchema.safeParse({ limit: 51 }).success).toBe(false)
    expect(weeklyPlanHistoryQuerySchema.safeParse({ unexpected: 'value' }).success).toBe(false)
  })

  it('accepts only positive plan revisions for exact historical reads', () => {
    expect(weeklyPlanRevisionSchema.parse('3')).toBe(3)
    expect(weeklyPlanRevisionSchema.safeParse('0').success).toBe(false)
    expect(weeklyPlanRevisionSchema.safeParse('3.5').success).toBe(false)
  })

  it('keeps plan experience subjective, user-confirmed and revision-bound', () => {
    expect(
      writePlanExperienceReflectionSchema.parse({
        experience: 'about_right',
        expectedRevision: 0,
      }),
    ).toEqual({ experience: 'about_right', expectedRevision: 0 })
    expect(
      writePlanExperienceReflectionSchema.safeParse({
        experience: 'effective',
        expectedRevision: 0,
      }).success,
    ).toBe(false)
    expect(
      planExperienceReflectionSchema.parse({
        id: 'e20576d5-5bed-4878-8b45-898152fb4f60',
        planId: 'af310f2e-e4ac-4aec-9e0f-d6658f430b09',
        planRevision: 3,
        experience: 'not_sure_yet',
        source: 'user_confirmed',
        revision: 2,
        createdAt: '2026-08-10T00:00:00.000Z',
        updatedAt: '2026-08-10T01:00:00.000Z',
      }).source,
    ).toBe('user_confirmed')
  })

  it('rejects non-Monday weeks and ambiguous decision payloads', () => {
    expect(generateWeeklyPlanSchema.safeParse({ weekStart: '2026-07-21' }).success).toBe(false)
    expect(
      planDecisionSchema.safeParse({
        decision: 'accepted',
        expectedRevision: 1,
        selections: [{ activityId: 'mon_squat', optionId: 'chair_squat' }],
      }).success,
    ).toBe(false)
    expect(
      planDecisionSchema.safeParse({
        decision: 'modified',
        expectedRevision: 1,
        selections: [],
      }).success,
    ).toBe(false)
  })

  it('keeps freshness permissions consistent with the server state', () => {
    const checkedAt = '2026-08-04T08:00:00.000Z'
    expect(
      planFreshnessSchema.parse({
        state: 'profile_changed',
        checkedAt,
        planOnboardingRevision: 1,
        currentOnboardingRevision: 2,
        canAcceptOrModify: false,
        canExplainWithAi: false,
        canSkip: true,
        recommendedAction: 'regenerate',
      }),
    ).toMatchObject({ state: 'profile_changed', canSkip: true })

    expect(
      planFreshnessSchema.safeParse({
        state: 'eligibility_blocked',
        checkedAt,
        planOnboardingRevision: 1,
        currentOnboardingRevision: 2,
        canAcceptOrModify: true,
        canExplainWithAi: false,
        canSkip: true,
        recommendedAction: 'review_profile',
      }).success,
    ).toBe(false)
  })

  it('normalizes legacy evidence into a stable planning-impact fingerprint', () => {
    const legacyEvidence = {
      onboardingRevision: 1,
      dashboardGeneratedAt: '2026-08-04T08:00:00.000Z',
      readinessScore: null,
      recentActiveDays: 0,
      recentWorkoutCount: 0,
      recentActiveMinutes: 0,
      recentMealCount: 0,
    }
    expect(normalizePersistedPlanEvidence(legacyEvidence)).toMatchObject({
      evidencePolicyVersion: 'planning-impact-v1',
      evidenceFingerprint: 'planning-impact-v1:readiness-missing',
    })
    expect(
      planEvidenceSchema.safeParse({
        ...legacyEvidence,
        evidenceFingerprint: 'planning-impact-v1:readiness-standard',
        evidencePolicyVersion: 'planning-impact-v1',
      }).success,
    ).toBe(false)
  })

  it('keeps a persisted recovery estimate and its planning score consistent', () => {
    const recoveryState = {
      policyVersion: 'subjective-recovery-state-v1' as const,
      state: 'unknown' as const,
      score: null,
      baselineScore: null,
      changeFromBaseline: null,
      confidence: 'insufficient' as const,
      consistency: 'unknown' as const,
      label: '主观恢复证据不足',
      note: '没有形成状态估计。',
      coverage: {
        recent: {
          startAt: '2026-08-03T00:00:00.000Z',
          endAt: '2026-08-10T00:00:00.000Z',
          days: 7 as const,
          observationCount: 0,
          recordedDays: 0,
          metricCount: 0,
        },
        baseline: {
          startAt: '2026-07-06T00:00:00.000Z',
          endAt: '2026-08-03T00:00:00.000Z',
          days: 28 as const,
          observationCount: 0,
          recordedDays: 0,
          metricCount: 0,
        },
        excludedObservationCount: 0,
      },
      factors: [],
      evidence: [],
      limitations: ['缺少近期证据。'],
    }
    const evidence = {
      onboardingRevision: 1,
      dashboardGeneratedAt: '2026-08-10T00:00:00.000Z',
      readinessScore: null,
      recentActiveDays: 0,
      recentWorkoutCount: 0,
      recentActiveMinutes: 0,
      recentMealCount: 0,
      recoveryState,
      evidencePolicyVersion: 'planning-impact-v1' as const,
      evidenceFingerprint: 'planning-impact-v1:readiness-missing' as const,
    }

    expect(planEvidenceSchema.parse(evidence).recoveryState).toEqual(recoveryState)
    expect(
      planEvidenceSchema.safeParse({
        ...evidence,
        readinessScore: 80,
        evidenceFingerprint: 'planning-impact-v1:readiness-standard',
      }).success,
    ).toBe(false)
  })

  it('requires evidence drift projections to be non-actionable and internally consistent', () => {
    const checkedAt = '2026-08-04T08:00:00.000Z'
    const changed = {
      state: 'evidence_changed',
      checkedAt,
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
    }
    expect(planFreshnessSchema.parse(changed)).toMatchObject({ state: 'evidence_changed' })
    expect(
      planFreshnessSchema.safeParse({
        ...changed,
        currentEvidenceFingerprint: changed.planEvidenceFingerprint,
      }).success,
    ).toBe(false)
    expect(planFreshnessSchema.safeParse({ ...changed, canExplainWithAi: true }).success).toBe(
      false,
    )
  })

  it('binds an explicit session link to both aggregate revisions', () => {
    const input = {
      expectedPlanRevision: 3,
      sessionDate: '2026-08-05',
      workoutId: 'd1f76f47-f8b3-4a44-81ad-64597712511a',
      expectedWorkoutRevision: 2,
    }
    expect(createPlanWorkoutLinkSchema.parse(input)).toEqual(input)
    expect(
      createPlanWorkoutLinkSchema.safeParse({ ...input, sessionDate: '2026-08-5' }).success,
    ).toBe(false)

    const link = {
      id: '02ed91d1-2254-4930-a798-8100e0a90fc4',
      userId: 'a9598e11-3ccf-4620-82ef-9dafb1524292',
      planId: 'af310f2e-e4ac-4aec-9e0f-d6658f430b09',
      planRevision: 3,
      sessionDate: '2026-08-05',
      workoutId: input.workoutId,
      workoutRevision: 2,
      currentWorkoutRevision: 4,
      workoutTitle: '全身训练 A',
      workoutStatus: 'partial',
      workoutStartedAt: '2026-08-05T10:00:00.000+08:00',
      revision: 1,
      linkedAt: '2026-08-05T11:00:00.000Z',
    }
    expect(planWorkoutLinkSchema.parse(link)).toEqual(link)
    expect(planWorkoutLinkSchema.safeParse({ ...link, workoutStatus: 'planned' }).success).toBe(
      false,
    )
  })
})
