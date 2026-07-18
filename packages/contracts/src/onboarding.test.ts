import { describe, expect, it } from 'vitest'

import { consentVersions, onboardingRequestSchema } from './onboarding'

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
})
