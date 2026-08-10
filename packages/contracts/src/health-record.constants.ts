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

export const sourceKinds = ['manual', 'device', 'imported', 'ai_estimate'] as const
export const recordStatuses = ['candidate', 'confirmed'] as const
export const revisionActions = ['created', 'updated', 'deleted'] as const
