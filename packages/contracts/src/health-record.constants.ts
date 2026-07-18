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

export const sourceKinds = ['manual', 'device', 'imported', 'ai_estimate'] as const
export const recordStatuses = ['candidate', 'confirmed'] as const
export const revisionActions = ['created', 'updated', 'deleted'] as const
