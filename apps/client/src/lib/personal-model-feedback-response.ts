import type {
  PersonalModelFeedbackWriteRequest,
  PersonalModelFeedbackWriteResponse,
} from '@myfitness/contracts'
import {
  isPersonalModelFeedbackWriteRequest,
  isPersonalModelFeedbackWriteResponse,
} from '@myfitness/contracts/personal-model-feedback.runtime'

export type PersonalModelFeedbackTarget = {
  itemId: string
  revision: number
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const isPersonalModelFeedbackTarget = (target: PersonalModelFeedbackTarget) =>
  uuidPattern.test(target.itemId) && Number.isSafeInteger(target.revision) && target.revision > 0

export class PersonalModelFeedbackRequestError extends Error {
  constructor() {
    super('个人认知反馈请求无效')
    this.name = 'PersonalModelFeedbackRequestError'
  }
}

export class PersonalModelFeedbackResponseError extends Error {
  constructor() {
    super('个人认知反馈服务返回了无效数据')
    this.name = 'PersonalModelFeedbackResponseError'
  }
}

export const parsePersonalModelFeedbackResponse = (
  target: PersonalModelFeedbackTarget,
  request: PersonalModelFeedbackWriteRequest,
  value: unknown,
): PersonalModelFeedbackWriteResponse => {
  if (
    !isPersonalModelFeedbackWriteResponse(value) ||
    value.itemId !== target.itemId ||
    value.targetRevision !== target.revision ||
    value.eventId !== request.eventId ||
    value.choice !== request.choice ||
    (request.contextValidUntil !== null &&
      (value.validTo === null ||
        Date.parse(value.validTo) !== Date.parse(request.contextValidUntil)))
  ) {
    throw new PersonalModelFeedbackResponseError()
  }
  return value
}

export type PersonalModelFeedbackTransport = (
  itemId: string,
  revision: number,
  request: PersonalModelFeedbackWriteRequest,
) => Promise<unknown>

export const createPersonalModelFeedbackWriter =
  (transport: PersonalModelFeedbackTransport) =>
  async (
    target: PersonalModelFeedbackTarget,
    request: PersonalModelFeedbackWriteRequest,
  ): Promise<PersonalModelFeedbackWriteResponse> => {
    if (!isPersonalModelFeedbackTarget(target) || !isPersonalModelFeedbackWriteRequest(request)) {
      throw new PersonalModelFeedbackRequestError()
    }
    return parsePersonalModelFeedbackResponse(
      target,
      request,
      await transport(target.itemId, target.revision, request),
    )
  }
