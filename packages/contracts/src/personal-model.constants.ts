export const personalModelContractVersion = 'personal-model-contract-v1' as const
export const personalModelConfidencePolicyVersion = 'personal-model-confidence-v1' as const
export const personalModelUnknownReceiptVersion = 'personal-model-unknown-v1' as const

export const personalModelKinds = [
  'goal',
  'constraint',
  'preference',
  'baseline',
  'behavior',
  'state',
  'pattern',
  'hypothesis',
] as const

export const personalModelStatuses = [
  'candidate',
  'active',
  'disputed',
  'superseded',
  'invalidated',
] as const

export const personalModelSources = [
  'user_confirmed',
  'deterministic_rule',
  'model_candidate',
] as const

export const personalModelFeedbackStates = [
  'unreviewed',
  'confirmed',
  'temporary',
  'disagreed',
  'uncertain',
] as const

export const personalModelConfidenceLevels = ['insufficient', 'low', 'moderate', 'high'] as const

export const personalModelConfidenceLimitations = [
  'limited_coverage',
  'single_window',
  'conflicting_evidence',
  'stale_evidence',
  'user_disputed',
  'source_withdrawn',
] as const

export const personalModelEvidenceRoles = ['supporting', 'contradicting', 'context'] as const

export const personalModelEvidenceKinds = ['onboarding_goal_revision', 'workout_revision'] as const

export const personalModelEvidenceSources = ['user_confirmed', 'manual', 'imported'] as const

export const personalModelEvidenceQualificationStates = ['eligible', 'withdrawn'] as const

export const personalModelEvidenceWithdrawalReasons = [
  'source_corrected',
  'source_deleted',
  'link_removed',
  'policy_changed',
] as const

export const personalModelClaimSchemaVersions = [
  'training_availability_constraint_v1',
  'recorded_training_frequency_behavior_v1',
  'recorded_session_duration_baseline_v1',
] as const

export const personalModelSubjectKeys = [
  'training.availability',
  'training.recorded_frequency',
  'training.recorded_session_duration',
] as const

export const personalModelFeedbackChoices = [
  'matches_me',
  'temporary_context',
  'disagree',
  'uncertain',
] as const

export const personalModelFeedbackReasonCodes = [
  'evidence_missing',
  'context_changed',
  'not_representative',
  'source_incorrect',
  'prefer_not_to_answer',
  'other',
] as const

export const personalModelUnknownReasons = [
  'no_eligible_evidence',
  'insufficient_coverage',
  'conflicting_evidence',
  'stale_evidence',
] as const

export const personalModelMaximumObservationWeeks = 8
export const personalModelMinimumActiveObservationWeeks = 4
export const personalModelMinimumActiveWorkoutCount = 6
export const personalModelMaximumWorkoutEvidenceCount = 800
export const personalModelFeedbackNoteMaximumLength = 300
