import { describe, expect, it } from 'vitest'

import { MeasurementError, normalizeMeasurement } from './measurements'

describe('measurement normalization', () => {
  it('normalizes pounds to canonical kilograms', () => {
    expect(normalizeMeasurement('body.weight', 160, 'lb')).toEqual({
      canonicalValue: 72.5748,
      canonicalUnit: 'kg',
      displayValue: 160,
      displayUnit: 'lb',
    })
  })

  it('normalizes sleep hours to minutes', () => {
    expect(normalizeMeasurement('recovery.sleep_duration', 7.5, 'hour').canonicalValue).toBe(450)
  })

  it('rejects a unit that does not belong to the metric', () => {
    expect(() => normalizeMeasurement('body.waist', 80, 'kg')).toThrow(MeasurementError)
  })

  it('rejects implausible values and fractional 1-to-5 scores', () => {
    expect(() => normalizeMeasurement('body.weight', 900, 'kg')).toThrow(/between/)
    expect(() => normalizeMeasurement('recovery.energy', 3.5, 'score_1_5')).toThrow(/whole-number/)
  })
})
