import { describe, expect, it } from 'vitest'

import { determineEligibility, normalizeHeight } from './profile'

describe('profile rules', () => {
  it('normalizes imperial height to centimeters', () => {
    expect(normalizeHeight(69, 'in')).toEqual({
      canonicalHeightCm: 175.26,
      displayHeight: { value: 69, unit: 'in' },
    })
  })

  it('rejects implausible height', () => {
    expect(() => normalizeHeight(80, 'cm')).toThrow(/between 100 and 250/)
  })

  it('requires professional clearance when any risk flag is present', () => {
    expect(determineEligibility([]).status).toBe('eligible')
    expect(determineEligibility(['chest_pain'])).toEqual({
      status: 'professional_clearance_required',
      riskFlags: ['chest_pain'],
    })
  })
})
