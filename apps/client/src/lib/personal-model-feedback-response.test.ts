import { describe, expect, it, vi } from 'vitest'

import {
  createPersonalModelFeedbackWriter,
  parsePersonalModelFeedbackResponse,
  PersonalModelFeedbackRequestError,
  PersonalModelFeedbackResponseError,
} from './personal-model-feedback-response'

const itemId = '28a70d16-e322-4b28-bb83-834654c1b352'
const eventId = '61f0b052-5e54-4ebb-b772-21c313888cd1'
const target = { itemId, revision: 3 }
const request = {
  schemaVersion: 'personal-model-feedback-write-request-v1' as const,
  eventId,
  choice: 'uncertain' as const,
  reasonCode: null,
  note: null,
  contextValidUntil: null,
}
const response = {
  schemaVersion: 'personal-model-feedback-write-response-v1' as const,
  outcome: 'revised' as const,
  eventId,
  itemId,
  targetRevision: 3,
  currentRevision: 4,
  choice: 'uncertain' as const,
  feedbackState: 'uncertain' as const,
  status: 'active' as const,
  validTo: null,
  acceptedAt: '2026-08-12T08:00:00.000Z',
  noOpReason: null,
}

describe('personal model feedback client adapter', () => {
  it('sends only the exact target and request, then accepts its matching minimal receipt', async () => {
    const transport = vi.fn().mockResolvedValue(response)
    const write = createPersonalModelFeedbackWriter(transport)

    await expect(write(target, request)).resolves.toEqual(response)
    expect(transport).toHaveBeenCalledTimes(1)
    expect(transport).toHaveBeenCalledWith(itemId, 3, request)
  })

  it.each([
    { ...response, itemId: '8e0c17fe-9a8c-47aa-bf9a-80edb067bc53' },
    { ...response, targetRevision: 2, currentRevision: 3 },
    { ...response, eventId: '0d8c2a5e-e1dc-453a-9280-3c06effe362c' },
    { ...response, choice: 'matches_me', feedbackState: 'confirmed' },
    { ...response, ownerUserId: itemId },
  ])('rejects expanded or identity-mismatched receipt %#', (value) => {
    expect(() => parsePersonalModelFeedbackResponse(target, request, value)).toThrow(
      PersonalModelFeedbackResponseError,
    )
  })

  it('compares temporary validity by instant while preserving the server receipt', () => {
    const temporaryRequest = {
      ...request,
      choice: 'temporary_context' as const,
      contextValidUntil: '2026-08-19T16:00:00+08:00',
    }
    const temporaryResponse = {
      ...response,
      choice: 'temporary_context' as const,
      feedbackState: 'temporary' as const,
      validTo: '2026-08-19T08:00:00Z',
    }
    expect(parsePersonalModelFeedbackResponse(target, temporaryRequest, temporaryResponse)).toBe(
      temporaryResponse,
    )
  })

  it('rejects an invalid request before invoking transport', async () => {
    const transport = vi.fn()
    const write = createPersonalModelFeedbackWriter(transport)
    await expect(write(target, { ...request, eventId: 'not-a-uuid' })).rejects.toBeInstanceOf(
      PersonalModelFeedbackRequestError,
    )
    expect(transport).not.toHaveBeenCalled()
  })

  it.each([
    { itemId: 'not-a-uuid', revision: 3 },
    { itemId, revision: 0 },
    { itemId, revision: 1.5 },
  ])('rejects invalid target %# before invoking transport', async (invalidTarget) => {
    const transport = vi.fn()
    const write = createPersonalModelFeedbackWriter(transport)
    await expect(write(invalidTarget, request)).rejects.toBeInstanceOf(
      PersonalModelFeedbackRequestError,
    )
    expect(transport).not.toHaveBeenCalled()
  })

  it('preserves transport failures for write-failure classification', async () => {
    const failure = Object.assign(new Error('conflict'), { statusCode: 409 })
    const write = createPersonalModelFeedbackWriter(vi.fn().mockRejectedValue(failure))
    await expect(write(target, request)).rejects.toBe(failure)
  })
})
