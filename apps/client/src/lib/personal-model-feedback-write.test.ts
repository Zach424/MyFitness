import { describe, expect, it } from 'vitest'

import {
  acceptPersonalModelFeedbackWrite,
  beginPersonalModelFeedbackWrite,
  classifyPersonalModelFeedbackWriteFailure,
  createPersonalModelFeedbackWriteState,
  failPersonalModelFeedbackWrite,
  invalidatePersonalModelFeedbackWrite,
  replacePersonalModelFeedbackSubject,
} from './personal-model-feedback-write'

const itemId = '28a70d16-e322-4b28-bb83-834654c1b352'
const eventId = '61f0b052-5e54-4ebb-b772-21c313888cd1'
const target = { itemId, revision: 3 }
const result = {
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

describe('personal model feedback page-memory write authority', () => {
  it('moves from idle through submitting to the exact succeeded receipt', () => {
    const idle = createPersonalModelFeedbackWriteState('training.recorded_frequency')
    const pending = beginPersonalModelFeedbackWrite(idle, target, eventId)
    expect(pending.state).toMatchObject({ phase: 'submitting', target, eventId })

    const succeeded = acceptPersonalModelFeedbackWrite(pending.state, pending.receipt, result)
    expect(succeeded.phase).toBe('succeeded')
    expect(succeeded.result).toBe(result)
  })

  it('rejects late settlement after a newer event supersedes its authority', () => {
    const first = beginPersonalModelFeedbackWrite(
      createPersonalModelFeedbackWriteState('training.recorded_frequency'),
      target,
      eventId,
    )
    const second = beginPersonalModelFeedbackWrite(
      first.state,
      target,
      '0d8c2a5e-e1dc-453a-9280-3c06effe362c',
    )
    expect(acceptPersonalModelFeedbackWrite(second.state, first.receipt, result)).toBe(second.state)
    expect(failPersonalModelFeedbackWrite(second.state, first.receipt, new Error('late'))).toBe(
      second.state,
    )
  })

  it('rejects settlement after subject replacement or invalidation', () => {
    const pending = beginPersonalModelFeedbackWrite(
      createPersonalModelFeedbackWriteState('training.recorded_frequency'),
      target,
      eventId,
    )
    const replaced = replacePersonalModelFeedbackSubject(pending.state, 'training.availability')
    expect(replaced.phase).toBe('idle')
    expect(acceptPersonalModelFeedbackWrite(replaced, pending.receipt, result)).toBe(replaced)

    const invalidated = invalidatePersonalModelFeedbackWrite(pending.state)
    expect(invalidated.phase).toBe('idle')
    expect(acceptPersonalModelFeedbackWrite(invalidated, pending.receipt, result)).toBe(invalidated)
  })

  it.each([
    [Object.assign(new Error('conflict'), { statusCode: 409 }), 'conflict'],
    [Object.assign(new Error('refused'), { statusCode: 403 }), 'refused'],
    [Object.assign(new Error('service'), { statusCode: 503 }), 'service'],
    [
      Object.assign(new Error('invalid'), { name: 'PersonalModelFeedbackResponseError' }),
      'invalid-contract',
    ],
    [Object.assign(new Error('offline'), { errMsg: 'request:fail' }), 'offline'],
  ] as const)('classifies bounded write failure %# without backend copy', (error, kind) => {
    expect(classifyPersonalModelFeedbackWriteFailure(error)).toBe(kind)
  })

  it('records only a classified failure for the current exact receipt', () => {
    const pending = beginPersonalModelFeedbackWrite(
      createPersonalModelFeedbackWriteState('training.recorded_frequency'),
      target,
      eventId,
    )
    const failed = failPersonalModelFeedbackWrite(
      pending.state,
      pending.receipt,
      Object.assign(new Error('raw backend copy'), { statusCode: 409 }),
    )
    expect(failed.phase).toBe('failed')
    expect(failed.failure).toEqual({ kind: 'conflict' })
    expect(JSON.stringify(failed)).not.toContain('raw backend copy')
  })
})
