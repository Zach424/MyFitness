import type { PersonalModelCurrentSubjectView, PersonalModelSubjectKey } from '@myfitness/contracts'
import { isPersonalModelCurrentSubjectView } from '@myfitness/contracts/personal-model-current-subject.runtime'

export class PersonalModelCurrentSubjectResponseError extends Error {
  constructor() {
    super('个人认知服务返回了无效数据')
    this.name = 'PersonalModelCurrentSubjectResponseError'
  }
}

export const parsePersonalModelCurrentSubjectResponse = (
  subjectKey: PersonalModelSubjectKey,
  value: unknown,
): PersonalModelCurrentSubjectView => {
  if (!isPersonalModelCurrentSubjectView(value) || value.subjectKey !== subjectKey) {
    throw new PersonalModelCurrentSubjectResponseError()
  }
  return value
}

export type PersonalModelCurrentSubjectTransport = (
  subjectKey: PersonalModelSubjectKey,
) => Promise<unknown>

export const createPersonalModelCurrentSubjectReader =
  (transport: PersonalModelCurrentSubjectTransport) =>
  async (subjectKey: PersonalModelSubjectKey): Promise<PersonalModelCurrentSubjectView> =>
    parsePersonalModelCurrentSubjectResponse(subjectKey, await transport(subjectKey))
