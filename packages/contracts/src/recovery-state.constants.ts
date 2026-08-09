export const subjectiveRecoveryMetrics = [
  'recovery.energy',
  'recovery.sleep_quality',
  'recovery.stress',
  'recovery.soreness',
] as const

export const recoveryStatePolicyVersion = 'subjective-recovery-state-v1' as const
export const recoveryStateValues = [
  'unknown',
  'current_only',
  'below_baseline',
  'near_baseline',
  'above_baseline',
] as const
export const recoveryConfidenceValues = ['insufficient', 'low', 'moderate'] as const
export const recoveryConsistencyValues = ['unknown', 'aligned', 'mixed'] as const
export const recoveryEvidenceWindows = ['recent', 'baseline'] as const
