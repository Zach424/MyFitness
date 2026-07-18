export const ageBands = ['18_24', '25_34', '35_44', '45_54', '55_64', '65_plus'] as const
export const sexForCalculationOptions = ['female', 'male', 'unspecified'] as const
export const unitSystems = ['metric', 'imperial'] as const
export const primaryGoals = ['fat_loss', 'muscle_gain', 'fitness', 'habit'] as const
export const experienceLevels = ['beginner', 'intermediate', 'advanced'] as const
export const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export const equipmentOptions = [
  'bodyweight',
  'dumbbells',
  'barbell',
  'machines',
  'bands',
  'cardio',
] as const
export const dietaryPreferenceOptions = [
  'none',
  'vegetarian',
  'vegan',
  'halal',
  'lactose_free',
] as const
export const riskFlags = [
  'chest_pain',
  'fainting',
  'uncontrolled_condition',
  'acute_injury',
  'pregnancy',
  'eating_disorder_history',
] as const

export const consentVersions = {
  terms: '2026-07-18',
  privacy: '2026-07-18',
  healthData: '2026-07-18',
} as const
