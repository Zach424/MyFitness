import {
  measurementPersistenceDecimalPlaces,
  metricCodes,
  metricUnitDefinitions,
} from './health-record.constants'

export const bodyMetricRegistryVersion = 'ilens-body-metric-registry-v2' as const

export const bodyMetricRegistryStatuses = ['current', 'planned'] as const

export const bodyMetricCategories = [
  'body_basic',
  'body_composition',
  'body_advanced',
  'recovery',
] as const

export const bodyMetricUnitCodes = [
  'kg',
  'lb',
  'cm',
  'in',
  'percent',
  'bpm',
  'minute',
  'hour',
  'score_1_5',
  'kg_per_m2',
  'kcal_per_day',
  'ratio',
  'square_cm',
  'degree',
] as const

export const bodyMetricSourceCapabilities = [
  'manual_entry',
  'device_measurement',
  'imported_report',
  'ai_estimated_candidate',
  'ai_extracted_candidate',
  'deterministic_derived',
] as const

export const bodyMetricDerivationKinds = ['none', 'deterministic'] as const

export const bodyMetricUnitConversionDefinitions = {
  kg: { canonicalUnit: 'kg', factor: 1 },
  lb: { canonicalUnit: 'kg', factor: 0.45359237 },
  cm: { canonicalUnit: 'cm', factor: 1 },
  in: { canonicalUnit: 'cm', factor: 2.54 },
  percent: { canonicalUnit: 'percent', factor: 1 },
  bpm: { canonicalUnit: 'bpm', factor: 1 },
  minute: { canonicalUnit: 'minute', factor: 1 },
  hour: { canonicalUnit: 'minute', factor: 60 },
  score_1_5: { canonicalUnit: 'score_1_5', factor: 1 },
  kg_per_m2: { canonicalUnit: 'kg_per_m2', factor: 1 },
  kcal_per_day: { canonicalUnit: 'kcal_per_day', factor: 1 },
  ratio: { canonicalUnit: 'ratio', factor: 1 },
  square_cm: { canonicalUnit: 'square_cm', factor: 1 },
  degree: { canonicalUnit: 'degree', factor: 1 },
} as const satisfies Record<
  (typeof bodyMetricUnitCodes)[number],
  { canonicalUnit: (typeof bodyMetricUnitCodes)[number]; factor: number }
>

const currentSources = [
  'manual_entry',
  'device_measurement',
  'imported_report',
  'ai_estimated_candidate',
  'ai_extracted_candidate',
] as const

const measuredBodySources = [
  'manual_entry',
  'device_measurement',
  'imported_report',
  'ai_extracted_candidate',
] as const

const currentDefinition = <
  Code extends (typeof metricCodes)[number],
  Category extends (typeof bodyMetricCategories)[number],
>(
  code: Code,
  nameZh: string,
  category: Category,
  technicalMinimum: number,
  technicalMaximum: number,
  wholeNumber = false,
) => ({
  code,
  nameZh,
  category,
  status: 'current' as const,
  canonicalUnit: metricUnitDefinitions[code].canonicalUnit,
  allowedDisplayUnits: metricUnitDefinitions[code].allowedUnits,
  persistenceDecimalPlaces: measurementPersistenceDecimalPlaces,
  technicalBounds: {
    minimum: technicalMinimum,
    maximum: technicalMaximum,
    wholeNumber,
    interpretation: 'ingestion_guard_not_clinical_range' as const,
  },
  sourceCapabilities: currentSources,
  derivation: { kind: 'none' as const },
})

const plannedDefinition = <
  const Code extends string,
  const Category extends (typeof bodyMetricCategories)[number],
  const CanonicalUnit extends (typeof bodyMetricUnitCodes)[number],
  const DisplayUnit extends (typeof bodyMetricUnitCodes)[number],
  const Sources extends readonly (typeof bodyMetricSourceCapabilities)[number][],
  const Derivation extends
    | { readonly kind: 'none' }
    | {
        readonly kind: 'deterministic'
        readonly formulaVersion: string
        readonly inputMetrics: readonly string[]
      },
>(definition: {
  code: Code
  nameZh: string
  category: Category
  canonicalUnit: CanonicalUnit
  allowedDisplayUnits: readonly DisplayUnit[]
  technicalMinimum: number
  technicalMaximum: number
  wholeNumber?: boolean
  sourceCapabilities: Sources
  derivation: Derivation
}) => ({
  code: definition.code,
  nameZh: definition.nameZh,
  category: definition.category,
  status: 'planned' as const,
  canonicalUnit: definition.canonicalUnit,
  allowedDisplayUnits: definition.allowedDisplayUnits,
  persistenceDecimalPlaces: measurementPersistenceDecimalPlaces,
  technicalBounds: {
    minimum: definition.technicalMinimum,
    maximum: definition.technicalMaximum,
    wholeNumber: definition.wholeNumber ?? false,
    interpretation: 'ingestion_guard_not_clinical_range' as const,
  },
  sourceCapabilities: definition.sourceCapabilities,
  derivation: definition.derivation,
})

export const bodyMetricDefinitions = [
  currentDefinition('body.weight', '体重', 'body_basic', 20, 500),
  currentDefinition('body.waist', '腰围', 'body_basic', 30, 300),
  currentDefinition('body.body_fat', '体脂率', 'body_composition', 1, 75),
  currentDefinition('body.resting_heart_rate', '静息心率', 'body_basic', 25, 250, true),
  currentDefinition('recovery.sleep_duration', '睡眠时长', 'recovery', 0, 1_440),
  currentDefinition('recovery.sleep_quality', '睡眠质量', 'recovery', 1, 5, true),
  currentDefinition('recovery.soreness', '酸痛程度', 'recovery', 1, 5, true),
  currentDefinition('recovery.energy', '精力水平', 'recovery', 1, 5, true),
  currentDefinition('recovery.stress', '压力水平', 'recovery', 1, 5, true),
  plannedDefinition({
    code: 'body.height',
    nameZh: '身高',
    category: 'body_basic',
    canonicalUnit: 'cm',
    allowedDisplayUnits: ['cm', 'in'],
    technicalMinimum: 50,
    technicalMaximum: 260,
    sourceCapabilities: measuredBodySources,
    derivation: { kind: 'none' },
  }),
  plannedDefinition({
    code: 'body.bmi',
    nameZh: 'BMI',
    category: 'body_basic',
    canonicalUnit: 'kg_per_m2',
    allowedDisplayUnits: ['kg_per_m2'],
    technicalMinimum: 5,
    technicalMaximum: 100,
    sourceCapabilities: [...measuredBodySources, 'deterministic_derived'],
    derivation: {
      kind: 'deterministic',
      formulaVersion: 'ilens-bmi-v1',
      inputMetrics: ['body.weight', 'body.height'],
    },
  }),
  plannedDefinition({
    code: 'body.chest',
    nameZh: '胸围',
    category: 'body_basic',
    canonicalUnit: 'cm',
    allowedDisplayUnits: ['cm', 'in'],
    technicalMinimum: 30,
    technicalMaximum: 300,
    sourceCapabilities: measuredBodySources,
    derivation: { kind: 'none' },
  }),
  plannedDefinition({
    code: 'body.hip',
    nameZh: '臀围',
    category: 'body_basic',
    canonicalUnit: 'cm',
    allowedDisplayUnits: ['cm', 'in'],
    technicalMinimum: 30,
    technicalMaximum: 300,
    sourceCapabilities: measuredBodySources,
    derivation: { kind: 'none' },
  }),
  plannedDefinition({
    code: 'body.upper_arm',
    nameZh: '上臂围',
    category: 'body_basic',
    canonicalUnit: 'cm',
    allowedDisplayUnits: ['cm', 'in'],
    technicalMinimum: 5,
    technicalMaximum: 150,
    sourceCapabilities: measuredBodySources,
    derivation: { kind: 'none' },
  }),
  plannedDefinition({
    code: 'body.thigh',
    nameZh: '大腿围',
    category: 'body_basic',
    canonicalUnit: 'cm',
    allowedDisplayUnits: ['cm', 'in'],
    technicalMinimum: 10,
    technicalMaximum: 250,
    sourceCapabilities: measuredBodySources,
    derivation: { kind: 'none' },
  }),
  plannedDefinition({
    code: 'body.body_fat_mass',
    nameZh: '体脂肪量',
    category: 'body_composition',
    canonicalUnit: 'kg',
    allowedDisplayUnits: ['kg', 'lb'],
    technicalMinimum: 0,
    technicalMaximum: 400,
    sourceCapabilities: [...measuredBodySources, 'deterministic_derived'],
    derivation: {
      kind: 'deterministic',
      formulaVersion: 'ilens-body-fat-mass-v1',
      inputMetrics: ['body.weight', 'body.body_fat'],
    },
  }),
  plannedDefinition({
    code: 'body.skeletal_muscle_mass',
    nameZh: '骨骼肌量',
    category: 'body_composition',
    canonicalUnit: 'kg',
    allowedDisplayUnits: ['kg', 'lb'],
    technicalMinimum: 0,
    technicalMaximum: 400,
    sourceCapabilities: measuredBodySources,
    derivation: { kind: 'none' },
  }),
  plannedDefinition({
    code: 'body.muscle_mass',
    nameZh: '肌肉量',
    category: 'body_composition',
    canonicalUnit: 'kg',
    allowedDisplayUnits: ['kg', 'lb'],
    technicalMinimum: 0,
    technicalMaximum: 450,
    sourceCapabilities: measuredBodySources,
    derivation: { kind: 'none' },
  }),
  plannedDefinition({
    code: 'body.fat_free_mass',
    nameZh: '去脂体重',
    category: 'body_composition',
    canonicalUnit: 'kg',
    allowedDisplayUnits: ['kg', 'lb'],
    technicalMinimum: 0,
    technicalMaximum: 500,
    sourceCapabilities: [...measuredBodySources, 'deterministic_derived'],
    derivation: {
      kind: 'deterministic',
      formulaVersion: 'ilens-fat-free-mass-v1',
      inputMetrics: ['body.weight', 'body.body_fat'],
    },
  }),
  plannedDefinition({
    code: 'body.total_body_water',
    nameZh: '身体总水分',
    category: 'body_composition',
    canonicalUnit: 'kg',
    allowedDisplayUnits: ['kg', 'lb'],
    technicalMinimum: 0,
    technicalMaximum: 400,
    sourceCapabilities: measuredBodySources,
    derivation: { kind: 'none' },
  }),
  plannedDefinition({
    code: 'body.protein_mass',
    nameZh: '蛋白质',
    category: 'body_composition',
    canonicalUnit: 'kg',
    allowedDisplayUnits: ['kg', 'lb'],
    technicalMinimum: 0,
    technicalMaximum: 100,
    sourceCapabilities: measuredBodySources,
    derivation: { kind: 'none' },
  }),
  plannedDefinition({
    code: 'body.mineral_mass',
    nameZh: '无机盐',
    category: 'body_composition',
    canonicalUnit: 'kg',
    allowedDisplayUnits: ['kg', 'lb'],
    technicalMinimum: 0,
    technicalMaximum: 50,
    sourceCapabilities: measuredBodySources,
    derivation: { kind: 'none' },
  }),
  plannedDefinition({
    code: 'body.skeletal_muscle_index',
    nameZh: 'SMI',
    category: 'body_advanced',
    canonicalUnit: 'kg_per_m2',
    allowedDisplayUnits: ['kg_per_m2'],
    technicalMinimum: 0,
    technicalMaximum: 30,
    sourceCapabilities: measuredBodySources,
    derivation: { kind: 'none' },
  }),
  plannedDefinition({
    code: 'body.basal_metabolic_rate',
    nameZh: '基础代谢率',
    category: 'body_advanced',
    canonicalUnit: 'kcal_per_day',
    allowedDisplayUnits: ['kcal_per_day'],
    technicalMinimum: 300,
    technicalMaximum: 10_000,
    wholeNumber: true,
    sourceCapabilities: measuredBodySources,
    derivation: { kind: 'none' },
  }),
  plannedDefinition({
    code: 'body.waist_hip_ratio',
    nameZh: '腰臀比',
    category: 'body_advanced',
    canonicalUnit: 'ratio',
    allowedDisplayUnits: ['ratio'],
    technicalMinimum: 0.2,
    technicalMaximum: 3,
    sourceCapabilities: [...measuredBodySources, 'deterministic_derived'],
    derivation: {
      kind: 'deterministic',
      formulaVersion: 'ilens-waist-hip-ratio-v1',
      inputMetrics: ['body.waist', 'body.hip'],
    },
  }),
  plannedDefinition({
    code: 'body.visceral_fat_area',
    nameZh: '内脏脂肪面积',
    category: 'body_advanced',
    canonicalUnit: 'square_cm',
    allowedDisplayUnits: ['square_cm'],
    technicalMinimum: 0,
    technicalMaximum: 1_000,
    sourceCapabilities: measuredBodySources,
    derivation: { kind: 'none' },
  }),
  plannedDefinition({
    code: 'body.extracellular_water_ratio',
    nameZh: '细胞外水分比',
    category: 'body_advanced',
    canonicalUnit: 'ratio',
    allowedDisplayUnits: ['ratio'],
    technicalMinimum: 0,
    technicalMaximum: 1,
    sourceCapabilities: measuredBodySources,
    derivation: { kind: 'none' },
  }),
  plannedDefinition({
    code: 'body.body_cell_mass',
    nameZh: '身体细胞量',
    category: 'body_advanced',
    canonicalUnit: 'kg',
    allowedDisplayUnits: ['kg', 'lb'],
    technicalMinimum: 0,
    technicalMaximum: 400,
    sourceCapabilities: measuredBodySources,
    derivation: { kind: 'none' },
  }),
  plannedDefinition({
    code: 'body.phase_angle',
    nameZh: '相位角',
    category: 'body_advanced',
    canonicalUnit: 'degree',
    allowedDisplayUnits: ['degree'],
    technicalMinimum: 0,
    technicalMaximum: 30,
    sourceCapabilities: measuredBodySources,
    derivation: { kind: 'none' },
  }),
] as const

export const bodyMetricCodes = bodyMetricDefinitions.map((definition) => definition.code)

export const currentBodyMetricDefinitions = bodyMetricDefinitions.filter(
  (definition) => definition.status === 'current',
)

export const plannedBodyMetricDefinitions = bodyMetricDefinitions.filter(
  (definition) => definition.status === 'planned',
)

export const bodyMetricRegistry = {
  version: bodyMetricRegistryVersion,
  persistenceDecimalPlaces: measurementPersistenceDecimalPlaces,
  metrics: bodyMetricDefinitions,
} as const
