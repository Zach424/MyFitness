import {
  convertMeasurementValueToCanonical,
  metricUnitDefinitions,
  type MetricCode,
  type UnitCode,
} from '@myfitness/contracts'

type MetricDefinition = {
  canonicalUnit: UnitCode
  allowedUnits: readonly UnitCode[]
  min: number
  max: number
  integer?: boolean
}

export const metricDefinitions: Record<MetricCode, MetricDefinition> = {
  'body.weight': { ...metricUnitDefinitions['body.weight'], min: 20, max: 500 },
  'body.waist': { ...metricUnitDefinitions['body.waist'], min: 30, max: 300 },
  'body.body_fat': {
    ...metricUnitDefinitions['body.body_fat'],
    min: 1,
    max: 75,
  },
  'body.resting_heart_rate': {
    ...metricUnitDefinitions['body.resting_heart_rate'],
    min: 25,
    max: 250,
    integer: true,
  },
  'recovery.sleep_duration': {
    ...metricUnitDefinitions['recovery.sleep_duration'],
    min: 0,
    max: 1_440,
  },
  'recovery.sleep_quality': {
    ...metricUnitDefinitions['recovery.sleep_quality'],
    min: 1,
    max: 5,
    integer: true,
  },
  'recovery.soreness': {
    ...metricUnitDefinitions['recovery.soreness'],
    min: 1,
    max: 5,
    integer: true,
  },
  'recovery.energy': {
    ...metricUnitDefinitions['recovery.energy'],
    min: 1,
    max: 5,
    integer: true,
  },
  'recovery.stress': {
    ...metricUnitDefinitions['recovery.stress'],
    min: 1,
    max: 5,
    integer: true,
  },
}

const roundCanonical = (value: number) => Math.round((value + Number.EPSILON) * 10_000) / 10_000

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

  const canonicalValue = roundCanonical(convertMeasurementValueToCanonical(value, unit))
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
