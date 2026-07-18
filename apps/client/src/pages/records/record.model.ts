import type {
  CreateHealthRecord,
  HealthRecord,
  MetricCode,
  UnitCode,
  UpdateHealthRecord,
} from '@myfitness/contracts'

export type RecordGroup = 'body' | 'recovery'

type MetricUiDefinition = {
  group: RecordGroup
  label: string
  shortLabel: string
  hint: string
  units: readonly UnitCode[]
  defaultUnit: UnitCode
  defaultValue: string
  min: number
  max: number
  integer?: boolean
  score?: boolean
}

export const metricUiDefinitions: Record<MetricCode, MetricUiDefinition> = {
  'body.weight': {
    group: 'body',
    label: '体重',
    shortLabel: '体重',
    hint: '建议在相近时间和条件下记录',
    units: ['kg', 'lb'],
    defaultUnit: 'kg',
    defaultValue: '70',
    min: 20,
    max: 500,
  },
  'body.waist': {
    group: 'body',
    label: '腰围',
    shortLabel: '腰围',
    hint: '自然呼气后，在肚脐水平测量',
    units: ['cm', 'in'],
    defaultUnit: 'cm',
    defaultValue: '75',
    min: 30,
    max: 300,
  },
  'body.body_fat': {
    group: 'body',
    label: '体脂率',
    shortLabel: '体脂',
    hint: '不同设备的结果不宜直接横向比较',
    units: ['percent'],
    defaultUnit: 'percent',
    defaultValue: '20',
    min: 1,
    max: 75,
  },
  'body.resting_heart_rate': {
    group: 'body',
    label: '静息心率',
    shortLabel: '心率',
    hint: '安静坐卧至少 5 分钟后记录',
    units: ['bpm'],
    defaultUnit: 'bpm',
    defaultValue: '65',
    min: 25,
    max: 250,
    integer: true,
  },
  'recovery.sleep_duration': {
    group: 'recovery',
    label: '睡眠时长',
    shortLabel: '时长',
    hint: '填写实际睡眠时间，不含清醒卧床时间',
    units: ['hour', 'minute'],
    defaultUnit: 'hour',
    defaultValue: '7.5',
    min: 0,
    max: 24,
  },
  'recovery.sleep_quality': {
    group: 'recovery',
    label: '睡眠质量',
    shortLabel: '质量',
    hint: '1 很差 · 5 很好',
    units: ['score_1_5'],
    defaultUnit: 'score_1_5',
    defaultValue: '4',
    min: 1,
    max: 5,
    integer: true,
    score: true,
  },
  'recovery.soreness': {
    group: 'recovery',
    label: '肌肉酸痛',
    shortLabel: '酸痛',
    hint: '1 几乎没有 · 5 非常明显',
    units: ['score_1_5'],
    defaultUnit: 'score_1_5',
    defaultValue: '2',
    min: 1,
    max: 5,
    integer: true,
    score: true,
  },
  'recovery.energy': {
    group: 'recovery',
    label: '精力状态',
    shortLabel: '精力',
    hint: '1 精疲力竭 · 5 精力充沛',
    units: ['score_1_5'],
    defaultUnit: 'score_1_5',
    defaultValue: '4',
    min: 1,
    max: 5,
    integer: true,
    score: true,
  },
  'recovery.stress': {
    group: 'recovery',
    label: '压力感受',
    shortLabel: '压力',
    hint: '1 很放松 · 5 压力很大',
    units: ['score_1_5'],
    defaultUnit: 'score_1_5',
    defaultValue: '2',
    min: 1,
    max: 5,
    integer: true,
    score: true,
  },
}

export const groupMetrics: Record<RecordGroup, MetricCode[]> = {
  body: ['body.weight', 'body.waist', 'body.body_fat', 'body.resting_heart_rate'],
  recovery: [
    'recovery.sleep_duration',
    'recovery.sleep_quality',
    'recovery.soreness',
    'recovery.energy',
    'recovery.stress',
  ],
}

export const unitLabels: Record<UnitCode, string> = {
  kg: 'kg',
  lb: 'lb',
  cm: 'cm',
  in: 'in',
  percent: '%',
  bpm: 'bpm',
  minute: '分钟',
  hour: '小时',
  score_1_5: '/ 5',
}

export type RecordDraft = {
  metric: MetricCode
  value: string
  unit: UnitCode
  occurredAt?: string
}

export const createDraft = (metric: MetricCode): RecordDraft => {
  const definition = metricUiDefinitions[metric]
  return {
    metric,
    value: definition.defaultValue,
    unit: definition.defaultUnit,
  }
}

const getTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
  } catch {
    return 'Asia/Shanghai'
  }
}

const displayRange = (metric: MetricCode, unit: UnitCode): [number, number] => {
  const definition = metricUiDefinitions[metric]
  if (unit === 'lb') return [definition.min / 0.45359237, definition.max / 0.45359237]
  if (unit === 'in') return [definition.min / 2.54, definition.max / 2.54]
  if (unit === 'minute') return [definition.min * 60, definition.max * 60]
  return [definition.min, definition.max]
}

export const validateRecordDraft = (draft: RecordDraft) => {
  const definition = metricUiDefinitions[draft.metric]
  const value = Number(draft.value)
  if (!Number.isFinite(value)) return '请输入有效数值'
  if (!definition.units.includes(draft.unit)) return '记录单位与项目不匹配'
  const [min, max] = displayRange(draft.metric, draft.unit)
  if (value < min || value > max) return `请输入 ${min.toFixed(1)}–${max.toFixed(1)} 之间的数值`
  if (definition.integer && !Number.isInteger(value)) return '该项目需要填写整数'
  return ''
}

export function buildRecordRequest(draft: RecordDraft): CreateHealthRecord
export function buildRecordRequest(draft: RecordDraft, expectedRevision: number): UpdateHealthRecord
export function buildRecordRequest(
  draft: RecordDraft,
  expectedRevision?: number,
): CreateHealthRecord | UpdateHealthRecord {
  const error = validateRecordDraft(draft)
  if (error) throw new Error(error)

  return {
    metric: draft.metric,
    value: Number(draft.value),
    unit: draft.unit,
    source: { kind: 'manual' },
    status: 'confirmed',
    occurredAt: draft.occurredAt ?? new Date().toISOString(),
    timezone: getTimezone(),
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
  }
}

export const draftFromRecord = (record: HealthRecord): RecordDraft => ({
  metric: record.metric,
  value: String(record.displayValue),
  unit: record.displayUnit,
  occurredAt: record.occurredAt,
})

export const formatRecordValue = (record: Pick<HealthRecord, 'displayValue' | 'displayUnit'>) =>
  `${Number(record.displayValue).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} ${unitLabels[record.displayUnit]}`
