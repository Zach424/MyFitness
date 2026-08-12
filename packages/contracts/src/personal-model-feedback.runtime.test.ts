import { describe, expect, it } from 'vitest'

import {
  personalModelFeedbackWriteRequestSchema,
  personalModelFeedbackWriteResponseSchema,
} from './personal-model'
import {
  isPersonalModelFeedbackWriteRequest,
  isPersonalModelFeedbackWriteResponse,
} from './personal-model-feedback.runtime'

const eventId = '61f0b052-5e54-4ebb-b772-21c313888cd1'
const itemId = '28a70d16-e322-4b28-bb83-834654c1b352'

const request = () => ({
  schemaVersion: 'personal-model-feedback-write-request-v1',
  eventId,
  choice: 'uncertain',
  reasonCode: null,
  note: null,
  contextValidUntil: null,
})

const response = () => ({
  schemaVersion: 'personal-model-feedback-write-response-v1',
  outcome: 'revised',
  eventId,
  itemId,
  targetRevision: 3,
  currentRevision: 4,
  choice: 'uncertain',
  feedbackState: 'uncertain',
  status: 'active',
  validTo: null,
  acceptedAt: '2026-08-12T08:00:00.000Z',
  noOpReason: null,
})

describe('personal model feedback lightweight runtime contract', () => {
  it.each([
    request(),
    {
      ...request(),
      choice: 'temporary_context',
      reasonCode: 'context_changed',
      note: '仅在本周成立',
      contextValidUntil: '2026-08-19T16:00:00+08:00',
    },
  ])('matches the canonical request schema for accepted value %#', (value) => {
    expect(isPersonalModelFeedbackWriteRequest(value)).toBe(true)
    expect(personalModelFeedbackWriteRequestSchema.safeParse(value).success).toBe(true)
  })

  it.each([
    null,
    { ...request(), ownerUserId: itemId },
    { ...request(), eventId: 'not-a-uuid' },
    { ...request(), note: '   ' },
    { ...request(), contextValidUntil: '2026-08-19T16:00:00Z' },
    {
      ...request(),
      choice: 'temporary_context',
      contextValidUntil: '2026-02-30T08:00:00Z',
    },
    { ...request(), choice: 'temporary_context' },
  ])('matches the canonical request schema for rejected value %#', (value) => {
    expect(isPersonalModelFeedbackWriteRequest(value)).toBe(false)
    expect(personalModelFeedbackWriteRequestSchema.safeParse(value).success).toBe(false)
  })

  it.each([
    response(),
    {
      ...response(),
      outcome: 'no_op',
      currentRevision: 3,
      noOpReason: 'feedback_already_current',
    },
    {
      ...response(),
      choice: 'temporary_context',
      feedbackState: 'temporary',
      validTo: '2026-08-19T16:00:00+08:00',
    },
  ])('matches the canonical response schema for accepted value %#', (value) => {
    expect(isPersonalModelFeedbackWriteResponse(value)).toBe(true)
    expect(personalModelFeedbackWriteResponseSchema.safeParse(value).success).toBe(true)
  })

  it.each([
    null,
    { ...response(), ownerUserId: itemId },
    { ...response(), currentRevision: 5 },
    { ...response(), feedbackState: 'confirmed' },
    { ...response(), status: 'superseded', validTo: '2026-08-12T08:00:00Z' },
    { ...response(), choice: 'disagree', feedbackState: 'disagreed' },
    { ...response(), outcome: 'no_op', currentRevision: 3 },
    { ...response(), acceptedAt: '2026-02-30T08:00:00Z' },
  ])('matches the canonical response schema for rejected value %#', (value) => {
    expect(isPersonalModelFeedbackWriteResponse(value)).toBe(false)
    expect(personalModelFeedbackWriteResponseSchema.safeParse(value).success).toBe(false)
  })
})
