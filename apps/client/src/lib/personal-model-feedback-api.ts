import { requestPersonalModelFeedback } from './api'
import { createPersonalModelFeedbackWriter } from './personal-model-feedback-response'

export const submitPersonalModelFeedback = createPersonalModelFeedbackWriter(
  requestPersonalModelFeedback,
)
