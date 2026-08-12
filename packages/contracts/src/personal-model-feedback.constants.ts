export const personalModelFeedbackWriteRequestVersion =
  'personal-model-feedback-write-request-v1' as const
export const personalModelFeedbackWriteResponseVersion =
  'personal-model-feedback-write-response-v1' as const

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

export const personalModelFeedbackNoOpReasons = ['feedback_already_current'] as const
export const personalModelFeedbackNoteMaximumLength = 300
