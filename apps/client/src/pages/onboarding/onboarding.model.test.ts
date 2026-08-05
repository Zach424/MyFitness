import { describe, expect, it } from 'vitest'

import {
  buildOnboardingRequest,
  initialDraft,
  onboardingAuthorityMatchesBase,
  onboardingReadFailureCopy,
  toggleSelection,
  validateStep,
} from './onboarding.model'

describe('onboarding page model', () => {
  it('keeps the last required selection', () => {
    expect(toggleSelection(['mon'], 'mon')).toEqual(['mon'])
    expect(toggleSelection(['mon'], 'mon', true)).toEqual([])
  })

  it('requires adult and all three consents', () => {
    expect(validateStep(initialDraft, 2)).toContain('18')
    expect(validateStep({ ...initialDraft, adultConfirmed: true }, 2)).toContain('同意')
  })

  it('builds the versioned canonical request', () => {
    const request = buildOnboardingRequest({
      ...initialDraft,
      displayName: '小陈',
      adultConfirmed: true,
      termsAccepted: true,
      privacyAccepted: true,
      healthDataAccepted: true,
    })

    expect(request.profile.height).toEqual({ value: 170, unit: 'cm' })
    expect(request.risk.flags).toEqual([])
    expect(request.consents.healthData.version).toBe('2026-07-18')
  })

  it('keeps confirmed absence distinct from an unknown or changed revision', () => {
    expect(onboardingAuthorityMatchesBase(null, null)).toBe(true)
    expect(onboardingAuthorityMatchesBase(null, undefined)).toBe(false)
    expect(onboardingAuthorityMatchesBase(3, 3)).toBe(true)
    expect(onboardingAuthorityMatchesBase(4, 3)).toBe(false)
  })

  it('uses product-owned copy without turning a failed read into default facts', () => {
    expect(onboardingReadFailureCopy('service', false).detail).toContain('不会把默认年龄')
    expect(onboardingReadFailureCopy('offline', true).detail).toContain('保存保持冻结')
  })
})
