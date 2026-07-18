export const workoutStatuses = ['completed', 'partial'] as const
export const exerciseCategories = ['strength', 'cardio', 'mobility'] as const
export const workoutSetKinds = ['warmup', 'working', 'cooldown'] as const
export const loadUnits = ['kg', 'lb'] as const
export const workoutSourceKinds = ['manual', 'imported'] as const
export const workoutRevisionActions = ['created', 'updated', 'deleted'] as const

export const exerciseCatalog = [
  { key: 'goblet_squat', name: '高脚杯深蹲', category: 'strength' },
  { key: 'romanian_deadlift', name: '罗马尼亚硬拉', category: 'strength' },
  { key: 'push_up', name: '俯卧撑', category: 'strength' },
  { key: 'dumbbell_row', name: '哑铃划船', category: 'strength' },
  { key: 'overhead_press', name: '肩上推举', category: 'strength' },
  { key: 'plank', name: '平板支撑', category: 'strength' },
  { key: 'running', name: '跑步', category: 'cardio' },
  { key: 'cycling', name: '骑行', category: 'cardio' },
  { key: 'mobility_flow', name: '灵活性练习', category: 'mobility' },
] as const
