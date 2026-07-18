export const planStatuses = ['draft', 'accepted', 'modified', 'skipped'] as const
export const planRevisionActions = ['generated', 'accepted', 'modified', 'skipped'] as const
export const planSessionKinds = ['strength', 'cardio', 'recovery'] as const
export const planIntensityLevels = ['easy', 'moderate'] as const
export const planActivityRoles = [
  'warmup',
  'squat',
  'hinge',
  'push',
  'pull',
  'core',
  'cardio',
  'mobility',
] as const
export const nutritionFocusKeys = [
  'regular_meals',
  'food_variety',
  'protein_source',
  'hydration',
] as const

export const planEngineVersion = 'deterministic-v1' as const
