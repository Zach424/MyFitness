import {
  personalModelCurrentSubjectViewSchema,
  type PersonalModelCurrentSubjectView,
  type PersonalModelSubjectKey,
} from '@myfitness/contracts'

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
  const parsed = personalModelCurrentSubjectViewSchema.safeParse(value)
  if (!parsed.success || parsed.data.subjectKey !== subjectKey) {
    throw new PersonalModelCurrentSubjectResponseError()
  }
  return parsed.data
}

export type PersonalModelCurrentSubjectTransport = (
  subjectKey: PersonalModelSubjectKey,
) => Promise<unknown>

export const createPersonalModelCurrentSubjectReader =
  (transport: PersonalModelCurrentSubjectTransport) =>
  async (subjectKey: PersonalModelSubjectKey): Promise<PersonalModelCurrentSubjectView> =>
    parsePersonalModelCurrentSubjectResponse(subjectKey, await transport(subjectKey))
