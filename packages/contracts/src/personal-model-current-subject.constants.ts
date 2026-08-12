export const personalModelCurrentSubjectViewVersion =
  'personal-model-current-subject-view-v1' as const

export const personalModelStatuses = [
  'candidate',
  'active',
  'disputed',
  'superseded',
  'invalidated',
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

export const personalModelSubjectKeys = [
  'training.availability',
  'training.recorded_frequency',
  'training.recorded_session_duration',
] as const

export const personalModelMaximumObservationWeeks = 8
export const personalModelMaximumWorkoutEvidenceCount = 800
