import { describe, expect, it } from 'vitest'
import type { OnboardingRequest, OnboardingResponse } from '@myfitness/contracts'

import {
  classifyOnboardingSaveEvidence,
  describeOnboardingSaveFailure,
  onboardingMatchesSubmitted,
} from './onboarding-recovery'

const submitted: OnboardingRequest = {
  adultConfirmed: true,
  expectedRevision: 1,
  profile: {
    displayName: '衡迹用户',
    ageBand: '25_34',
    sexForCalculations: 'unspecified',
    height: { value: 170, unit: 'cm' },
    unitSystem: 'metric',
    timezone: 'Asia/Shanghai',
  },
  goal: {
    primaryGoal: 'fitness',
    experience: 'beginner',
    availableDays: ['mon', 'wed', 'fri'],
    sessionMinutes: 45,
    equipment: ['bodyweight'],
    dietaryPreferences: ['none'],
  },
  risk: { flags: ['acute_injury'], acknowledged: true },
  consents: {
    terms: { accepted: true, version: '2026-07-18' },
    privacy: { accepted: true, version: '2026-07-18' },
    healthData: { accepted: true, version: '2026-07-18' },
  },
}

const current: OnboardingResponse = {
  userId: '11111111-1111-4111-8111-111111111111',
  revision: 2,
  profile: {
    displayName: submitted.profile.displayName,
    ageBand: submitted.profile.ageBand,
    sexForCalculations: submitted.profile.sexForCalculations,
    canonicalHeightCm: 170,
    displayHeight: submitted.profile.height,
    unitSystem: submitted.profile.unitSystem,
    timezone: submitted.profile.timezone,
  },
  goal: submitted.goal,
  eligibility: {
    status: 'professional_clearance_required',
    riskFlags: submitted.risk.flags,
  },
  consents: [
    { purpose: 'terms', version: '2026-07-18', acceptedAt: '2026-08-05T01:00:00.000Z' },
    { purpose: 'privacy', version: '2026-07-18', acceptedAt: '2026-08-05T01:00:00.000Z' },
    { purpose: 'health_data', version: '2026-07-18', acceptedAt: '2026-08-05T01:00:00.000Z' },
  ],
  createdAt: '2026-08-05T01:00:00.000Z',
  updatedAt: '2026-08-05T01:00:00.000Z',
}

describe('onboarding save response-loss recovery', () => {
  it('requires a current-profile read for network and retryable failures', () => {
    expect(describeOnboardingSaveFailure(new Error('Failed to fetch')).authority).toBe(
      'reconcile_required',
    )
    expect(
      describeOnboardingSaveFailure(Object.assign(new Error('paused'), { statusCode: 503 }))
        .authority,
    ).toBe('reconcile_required')
  })

  it('terminates an explicit non-retryable refusal', () => {
    expect(
      describeOnboardingSaveFailure(Object.assign(new Error('invalid'), { statusCode: 400 }))
        .authority,
    ).toBe('terminal')
  })

  it('matches every response-visible profile, goal, risk and consent fact', () => {
    expect(onboardingMatchesSubmitted(current, submitted)).toBe(true)
    expect(
      onboardingMatchesSubmitted(
        { ...current, goal: { ...current.goal, sessionMinutes: 60 } },
        submitted,
      ),
    ).toBe(false)
    expect(
      onboardingMatchesSubmitted(
        {
          ...current,
          consents: current.consents.filter(({ purpose }) => purpose !== 'health_data'),
        },
        submitted,
      ),
    ).toBe(false)
  })

  it('accepts an advanced matching update and a matching first profile', () => {
    expect(classifyOnboardingSaveEvidence(1, current, submitted)).toBe('applied')
    expect(classifyOnboardingSaveEvidence(null, { ...current, revision: 1 }, submitted)).toBe(
      'applied',
    )
  })

  it('keeps the same revision or confirmed absence eligible only for a new save', () => {
    expect(classifyOnboardingSaveEvidence(2, current, submitted)).toBe('not_applied')
    expect(classifyOnboardingSaveEvidence(null, undefined, submitted)).toBe('not_applied')
  })

  it('detects changed, older and unexpectedly missing current evidence', () => {
    expect(
      classifyOnboardingSaveEvidence(
        1,
        { ...current, profile: { ...current.profile, displayName: '另一份资料' } },
        submitted,
      ),
    ).toBe('diverged')
    expect(classifyOnboardingSaveEvidence(3, current, submitted)).toBe('diverged')
    expect(classifyOnboardingSaveEvidence(1, undefined, submitted)).toBe('diverged')
  })
})
