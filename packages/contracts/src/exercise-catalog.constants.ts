export const exerciseCatalogVersion = 'starter-2026-08-05-v1' as const

export const exerciseCatalogSources = ['starter', 'custom'] as const
export const exerciseCatalogRevisionActions = ['created', 'updated', 'archived'] as const
export const exerciseTrackingModes = ['reps_load', 'duration', 'duration_distance'] as const
export const exerciseEquipmentOptions = [
  'bodyweight',
  'dumbbells',
  'barbell',
  'kettlebell',
  'resistance_band',
  'bench',
  'pull_up_bar',
  'cable_machine',
  'cardio_machine',
  'bicycle',
  'open_space',
  'other',
] as const

export const starterExerciseCatalog = [
  {
    key: 'goblet_squat',
    name: '高脚杯深蹲',
    aliases: ['杯式深蹲'],
    category: 'strength',
    trackingMode: 'reps_load',
    equipment: ['dumbbells'],
  },
  {
    key: 'romanian_deadlift',
    name: '罗马尼亚硬拉',
    aliases: ['RDL'],
    category: 'strength',
    trackingMode: 'reps_load',
    equipment: ['dumbbells'],
  },
  {
    key: 'push_up',
    name: '俯卧撑',
    aliases: ['伏地挺身'],
    category: 'strength',
    trackingMode: 'reps_load',
    equipment: ['bodyweight'],
  },
  {
    key: 'dumbbell_row',
    name: '哑铃划船',
    aliases: ['单臂划船'],
    category: 'strength',
    trackingMode: 'reps_load',
    equipment: ['dumbbells'],
  },
  {
    key: 'overhead_press',
    name: '肩上推举',
    aliases: ['推肩'],
    category: 'strength',
    trackingMode: 'reps_load',
    equipment: ['dumbbells'],
  },
  {
    key: 'plank',
    name: '平板支撑',
    aliases: ['平板'],
    category: 'strength',
    trackingMode: 'duration',
    equipment: ['bodyweight'],
  },
  {
    key: 'running',
    name: '跑步',
    aliases: ['慢跑'],
    category: 'cardio',
    trackingMode: 'duration_distance',
    equipment: ['open_space'],
  },
  {
    key: 'cycling',
    name: '骑行',
    aliases: ['自行车'],
    category: 'cardio',
    trackingMode: 'duration_distance',
    equipment: ['bicycle'],
  },
  {
    key: 'mobility_flow',
    name: '灵活性练习',
    aliases: ['关节活动'],
    category: 'mobility',
    trackingMode: 'duration',
    equipment: ['bodyweight'],
  },
] as const

// Backward-compatible name for clients compiled before the catalog became an API resource.
export const exerciseCatalog = starterExerciseCatalog
