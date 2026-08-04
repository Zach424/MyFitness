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

export const planEvidencePolicyVersion = 'planning-impact-v1' as const
export const planReadinessBands = ['missing', 'conservative', 'standard'] as const
export const planEvidenceFingerprints = [
  'planning-impact-v1:readiness-missing',
  'planning-impact-v1:readiness-conservative',
  'planning-impact-v1:readiness-standard',
] as const
export const planEvidenceChangeReasons = [
  'recovery_added',
  'recovery_expired',
  'recovery_threshold_crossed',
] as const

export type PlanReadinessBand = (typeof planReadinessBands)[number]
export type PlanEvidenceFingerprint = (typeof planEvidenceFingerprints)[number]

export const planReadinessBand = (readinessScore: number | null): PlanReadinessBand => {
  if (readinessScore === null) return 'missing'
  return readinessScore < 60 ? 'conservative' : 'standard'
}

export const planEvidenceFingerprint = (readinessScore: number | null): PlanEvidenceFingerprint =>
  `${planEvidencePolicyVersion}:readiness-${planReadinessBand(readinessScore)}` as PlanEvidenceFingerprint
