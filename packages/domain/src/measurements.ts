import type { MetricCode, UnitCode } from '@myfitness/contracts'

type MetricDefinition = {
  canonicalUnit: UnitCode
  allowedUnits: readonly UnitCode[]
  min: number
  max: number
  integer?: boolean
}

export const metricDefinitions: Record<MetricCode, MetricDefinition> = {
  'body.weight': { canonicalUnit: 'kg', allowedUnits: ['kg', 'lb'], min: 20, max: 500 },
  'body.waist': { canonicalUnit: 'cm', allowedUnits: ['cm', 'in'], min: 30, max: 300 },
  'body.body_fat': {
    canonicalUnit: 'percent',
    allowedUnits: ['percent'],
    min: 1,
    max: 75,
  },
  'body.resting_heart_rate': {
    canonicalUnit: 'bpm',
    allowedUnits: ['bpm'],
    min: 25,
    max: 250,
    integer: true,
  },
  'recovery.sleep_duration': {
    canonicalUnit: 'minute',
    allowedUnits: ['minute', 'hour'],
    min: 0,
    max: 1_440,
  },
  'recovery.sleep_quality': {
    canonicalUnit: 'score_1_5',
    allowedUnits: ['score_1_5'],
    min: 1,
    max: 5,
    integer: true,
  },
  'recovery.soreness': {
    canonicalUnit: 'score_1_5',
    allowedUnits: ['score_1_5'],
    min: 1,
    max: 5,
    integer: true,
  },
  'recovery.energy': {
    canonicalUnit: 'score_1_5',
    allowedUnits: ['score_1_5'],
    min: 1,
    max: 5,
    integer: true,
  },
  'recovery.stress': {
    canonicalUnit: 'score_1_5',
    allowedUnits: ['score_1_5'],
    min: 1,
    max: 5,
    integer: true,
  },
}

const roundCanonical = (value: number) => Math.round((value + Number.EPSILON) * 10_000) / 10_000

const convertUnit = (value: number, unit: UnitCode, canonicalUnit: UnitCode) => {
  if (unit === canonicalUnit) return value
  if (unit === 'lb' && canonicalUnit === 'kg') return value * 0.45359237
  if (unit === 'in' && canonicalUnit === 'cm') return value * 2.54
  if (unit === 'hour' && canonicalUnit === 'minute') return value * 60
  throw new MeasurementError(`cannot convert ${unit} to ${canonicalUnit}`)
}

export class MeasurementError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MeasurementError'
  }
}

export const normalizeMeasurement = (metric: MetricCode, value: number, unit: UnitCode) => {
  const definition = metricDefinitions[metric]

  if (!definition.allowedUnits.includes(unit)) {
    throw new MeasurementError(`${unit} is not allowed for ${metric}`)
  }

  const canonicalValue = roundCanonical(convertUnit(value, unit, definition.canonicalUnit))
  if (canonicalValue < definition.min || canonicalValue > definition.max) {
    throw new MeasurementError(
      `${metric} must be between ${definition.min} and ${definition.max} ${definition.canonicalUnit}`,
    )
  }
  if (definition.integer && !Number.isInteger(canonicalValue)) {
    throw new MeasurementError(`${metric} must be a whole-number score or count`)
  }

  return {
    canonicalValue,
    canonicalUnit: definition.canonicalUnit,
    displayValue: value,
    displayUnit: unit,
  }
}
