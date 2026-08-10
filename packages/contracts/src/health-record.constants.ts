export const metricCodes = [
  'body.weight',
  'body.waist',
  'body.body_fat',
  'body.resting_heart_rate',
  'recovery.sleep_duration',
  'recovery.sleep_quality',
  'recovery.soreness',
  'recovery.energy',
  'recovery.stress',
] as const

export const unitCodes = [
  'kg',
  'lb',
  'cm',
  'in',
  'percent',
  'bpm',
  'minute',
  'hour',
  'score_1_5',
] as const

export const metricUnitDefinitions = {
  'body.weight': { canonicalUnit: 'kg', allowedUnits: ['kg', 'lb'] },
  'body.waist': { canonicalUnit: 'cm', allowedUnits: ['cm', 'in'] },
  'body.body_fat': { canonicalUnit: 'percent', allowedUnits: ['percent'] },
  'body.resting_heart_rate': { canonicalUnit: 'bpm', allowedUnits: ['bpm'] },
  'recovery.sleep_duration': {
    canonicalUnit: 'minute',
    allowedUnits: ['minute', 'hour'],
  },
  'recovery.sleep_quality': {
    canonicalUnit: 'score_1_5',
    allowedUnits: ['score_1_5'],
  },
  'recovery.soreness': {
    canonicalUnit: 'score_1_5',
    allowedUnits: ['score_1_5'],
  },
  'recovery.energy': {
    canonicalUnit: 'score_1_5',
    allowedUnits: ['score_1_5'],
  },
  'recovery.stress': {
    canonicalUnit: 'score_1_5',
    allowedUnits: ['score_1_5'],
  },
} as const satisfies Record<
  (typeof metricCodes)[number],
  {
    canonicalUnit: (typeof unitCodes)[number]
    allowedUnits: readonly (typeof unitCodes)[number][]
  }
>

export const measurementPersistenceDecimalPlaces = 4

export const unitCanonicalConversionDefinitions = {
  kg: { canonicalUnit: 'kg', factor: 1 },
  lb: { canonicalUnit: 'kg', factor: 0.45359237 },
  cm: { canonicalUnit: 'cm', factor: 1 },
  in: { canonicalUnit: 'cm', factor: 2.54 },
  percent: { canonicalUnit: 'percent', factor: 1 },
  bpm: { canonicalUnit: 'bpm', factor: 1 },
  minute: { canonicalUnit: 'minute', factor: 1 },
  hour: { canonicalUnit: 'minute', factor: 60 },
  score_1_5: { canonicalUnit: 'score_1_5', factor: 1 },
} as const satisfies Record<
  (typeof unitCodes)[number],
  { canonicalUnit: (typeof unitCodes)[number]; factor: number }
>

const measurementPersistenceHalfQuantum = 0.5 * 10 ** -measurementPersistenceDecimalPlaces

export const convertMeasurementValueToCanonical = (
  displayValue: number,
  displayUnit: (typeof unitCodes)[number],
) => displayValue * unitCanonicalConversionDefinitions[displayUnit].factor

export const persistedMeasurementConversionTolerance = (
  displayUnit: (typeof unitCodes)[number],
) => {
  const conversion = unitCanonicalConversionDefinitions[displayUnit]
  const displayRoundingError =
    displayUnit === conversion.canonicalUnit
      ? 0
      : Math.abs(conversion.factor) * measurementPersistenceHalfQuantum
  return measurementPersistenceHalfQuantum + displayRoundingError
}

export const isPersistedMeasurementConversionConsistent = (
  canonicalValue: number,
  canonicalUnit: (typeof unitCodes)[number],
  displayValue: number,
  displayUnit: (typeof unitCodes)[number],
) => {
  if (![canonicalValue, displayValue].every(Number.isFinite)) return false
  const conversion = unitCanonicalConversionDefinitions[displayUnit]
  if (conversion.canonicalUnit !== canonicalUnit) return false

  const expectedCanonicalValue = convertMeasurementValueToCanonical(displayValue, displayUnit)
  const floatingPointSlack =
    Number.EPSILON * Math.max(1, Math.abs(canonicalValue), Math.abs(expectedCanonicalValue)) * 4
  return (
    Math.abs(canonicalValue - expectedCanonicalValue) <=
    persistedMeasurementConversionTolerance(displayUnit) + floatingPointSlack
  )
}

export const sourceKinds = ['manual', 'device', 'imported', 'ai_estimate'] as const
export const recordStatuses = ['candidate', 'confirmed'] as const
export const revisionActions = ['created', 'updated', 'deleted'] as const
