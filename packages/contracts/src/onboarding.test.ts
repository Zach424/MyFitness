import { describe, expect, it } from 'vitest'

import {
  consentVersions,
  onboardingGoalRevisionSnapshotSchema,
  onboardingRequestSchema,
} from './onboarding'

export const validOnboardingRequest = {
  adultConfirmed: true,
  profile: {
    displayName: '志庆',
    ageBand: '25_34',
    sexForCalculations: 'unspecified',
    height: { value: 175, unit: 'cm' },
    unitSystem: 'metric',
    timezone: 'Asia/Shanghai',
  },
  goal: {
    primaryGoal: 'fitness',
    experience: 'beginner',
    availableDays: ['mon', 'wed', 'sat'],
    sessionMinutes: 45,
    equipment: ['bodyweight', 'dumbbells'],
    dietaryPreferences: ['none'],
  },
  risk: { flags: [], acknowledged: true },
  consents: {
    terms: { accepted: true, version: consentVersions.terms },
    privacy: { accepted: true, version: consentVersions.privacy },
    healthData: { accepted: true, version: consentVersions.healthData },
  },
} as const

describe('onboarding contract', () => {
  it('accepts an adult profile with versioned consent', () => {
    expect(onboardingRequestSchema.parse(validOnboardingRequest)).toEqual(validOnboardingRequest)
  })

  it('rejects missing adult confirmation and stale consent', () => {
    expect(
      onboardingRequestSchema.safeParse({
        ...validOnboardingRequest,
        adultConfirmed: false,
        consents: {
          ...validOnboardingRequest.consents,
          privacy: { accepted: true, version: 'old' },
        },
      }).success,
    ).toBe(false)
  })

  it('rejects invalid time zones and duplicate availability', () => {
    expect(
      onboardingRequestSchema.safeParse({
        ...validOnboardingRequest,
        profile: { ...validOnboardingRequest.profile, timezone: 'Shanghai/Local' },
        goal: { ...validOnboardingRequest.goal, availableDays: ['mon', 'mon'] },
      }).success,
    ).toBe(false)
  })

  it('does not combine no dietary restriction with restrictions', () => {
    expect(
      onboardingRequestSchema.safeParse({
        ...validOnboardingRequest,
        goal: {
          ...validOnboardingRequest.goal,
          dietaryPreferences: ['none', 'vegetarian'],
        },
      }).success,
    ).toBe(false)
  })

  it('keeps complete and migration-checkpoint goal history distinguishable', () => {
    const snapshot = {
      schemaVersion: 'onboarding-goal-snapshot-v1',
      goalId: '22222222-2222-4222-8222-222222222222',
      ownerUserId: '11111111-1111-4111-8111-111111111111',
      revision: 3,
      action: 'migration_checkpoint',
      historyCoverage: 'checkpoint_only',
      goal: validOnboardingRequest.goal,
      changedAt: '2026-08-12T00:00:00.000000Z',
    } as const
    expect(onboardingGoalRevisionSnapshotSchema.parse(snapshot)).toEqual(snapshot)
    expect(
      onboardingGoalRevisionSnapshotSchema.safeParse({
        ...snapshot,
        action: 'created',
        historyCoverage: 'complete',
      }).success,
    ).toBe(false)
  })
})
