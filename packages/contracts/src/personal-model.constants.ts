export const personalModelContractVersion = 'personal-model-contract-v1' as const
export const personalModelConfidencePolicyVersion = 'personal-model-confidence-v1' as const
export const personalModelUnknownReceiptVersion = 'personal-model-unknown-v1' as const
export const personalModelItemRevisionVersion = 'personal-model-item-revision-v1' as const
export const personalModelCurrentSubjectEnvelopeVersion =
  'personal-model-current-subject-envelope-v1' as const
export const personalModelFeedbackTransitionVersion =
  'personal-model-feedback-transition-v1' as const
export const weeklyCognitiveReviewVersion = 'weekly-cognitive-review-v1' as const
export const weeklyCognitiveReviewEnvelopeVersion = 'weekly-cognitive-review-envelope-v1' as const
export const weeklyCognitiveReviewHistoryPageVersion =
  'weekly-cognitive-review-history-page-v1' as const

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

export const personalModelSources = [
  'user_confirmed',
  'deterministic_rule',
  'model_candidate',
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

export const personalModelUnknownReasons = [
  'no_eligible_evidence',
  'insufficient_coverage',
  'conflicting_evidence',
  'stale_evidence',
] as const

export const personalModelRevisionActions = [
  'created',
  'evidence_accumulated',
  'evidence_contradicted',
  'user_confirmed',
  'user_marked_temporary',
  'user_disagreed',
  'user_uncertain',
  'superseded',
  'invalidated',
] as const

export const weeklyCognitiveReviewQuestionKeys = ['collect_more_evidence'] as const

export const personalModelMinimumActiveObservationWeeks = 4
export const personalModelMinimumActiveWorkoutCount = 6
export const weeklyCognitiveReviewMaximumHistoryPageSize = 50

export * from './personal-model-current-subject.constants'
export * from './personal-model-feedback.constants'
