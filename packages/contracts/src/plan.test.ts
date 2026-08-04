import { describe, expect, it } from 'vitest'

import {
  generateWeeklyPlanSchema,
  normalizePersistedPlanEvidence,
  planDecisionSchema,
  planEvidenceSchema,
  planFreshnessSchema,
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
})
