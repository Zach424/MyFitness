import { requestCurrentPersonalModelSubject } from './api'
import { createPersonalModelCurrentSubjectReader } from './personal-model-current-subject-response'

export const getCurrentPersonalModelSubject = createPersonalModelCurrentSubjectReader(
  requestCurrentPersonalModelSubject,
)
