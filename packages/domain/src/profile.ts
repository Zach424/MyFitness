import type { RiskFlag } from '@myfitness/contracts'

import { MeasurementError } from './measurements'

export const normalizeHeight = (value: number, unit: 'cm' | 'in') => {
  const centimeters = unit === 'in' ? value * 2.54 : value
  const canonicalHeightCm = Math.round((centimeters + Number.EPSILON) * 100) / 100

  if (canonicalHeightCm < 100 || canonicalHeightCm > 250) {
    throw new MeasurementError('height must be between 100 and 250 cm')
  }

  return {
    canonicalHeightCm,
    displayHeight: { value, unit },
  }
}

export const determineEligibility = (flags: readonly RiskFlag[]) => ({
  status: flags.length ? ('professional_clearance_required' as const) : ('eligible' as const),
  riskFlags: [...flags],
})
