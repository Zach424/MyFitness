import {
  personalModelFeedbackApplicationSchema,
  personalModelFeedbackTransitionResultSchema,
  personalModelFeedbackWriteRequestSchema,
  personalModelFeedbackWriteResponseSchema,
  personalModelFeedbackWriteResponseVersion,
  personalModelItemRevisionSchema,
  type PersonalModelFeedbackEvent,
  type PersonalModelFeedbackTransitionResult,
  type PersonalModelFeedbackWriteRequest,
  type PersonalModelFeedbackWriteResponse,
  type PersonalModelItemRevision,
} from '@myfitness/contracts'

export const personalModelFeedbackApplicationPolicyVersion =
  'personal-model-feedback-application-v1' as const

type PersonalModelFeedbackApplicationInput = {
  current: PersonalModelItemRevision
  request: PersonalModelFeedbackWriteRequest
  acceptedAt: string
  revisionId: string
  sha256Hex: (value: string) => string
}

const choiceState = {
  matches_me: 'confirmed',
  temporary_context: 'temporary',
  disagree: 'disagreed',
  uncertain: 'uncertain',
} as const

const choiceAction = {
  matches_me: 'user_confirmed',
  temporary_context: 'user_marked_temporary',
  disagree: 'user_disagreed',
  uncertain: 'user_uncertain',
} as const

const digest = (sha256Hex: (value: string) => string, value: unknown) => {
  const fingerprint = sha256Hex(JSON.stringify(value))
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) {
    throw new TypeError('SHA-256 provider must return 64 lowercase hexadecimal characters')
  }
  return fingerprint
}

const canonicalDateTime = (value: string, name: string) => {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) throw new TypeError(`${name} must be a valid date-time`)
  return new Date(timestamp).toISOString()
}

const eventFor = (
  current: PersonalModelItemRevision,
  request: PersonalModelFeedbackWriteRequest,
  acceptedAt: string,
): PersonalModelFeedbackEvent => ({
  id: request.eventId,
  userId: current.userId,
  itemId: current.itemId,
  itemRevision: current.revision,
  choice: request.choice,
  reasonCode: request.reasonCode,
  note: request.note,
  contextValidUntil: request.contextValidUntil,
  createdAt: acceptedAt,
})

const isNoOp = (current: PersonalModelItemRevision, event: PersonalModelFeedbackEvent) =>
  current.snapshot.feedbackState === choiceState[event.choice] &&
  (event.choice !== 'disagree' || current.snapshot.status === 'disputed') &&
  (event.choice !== 'temporary_context' || current.snapshot.validTo === event.contextValidUntil)

const nextStatus = (
  current: PersonalModelItemRevision,
  choice: PersonalModelFeedbackEvent['choice'],
) => {
  if (choice === 'disagree') return 'disputed' as const
  if (current.snapshot.status !== 'disputed') return current.snapshot.status
  return ['moderate', 'high'].includes(current.snapshot.confidence.level)
    ? ('active' as const)
    : ('candidate' as const)
}

export const applyPersonalModelFeedback = (
  input: PersonalModelFeedbackApplicationInput,
): PersonalModelFeedbackTransitionResult => {
  const current = personalModelItemRevisionSchema.parse(input.current)
  const request = personalModelFeedbackWriteRequestSchema.parse(input.request)
  const acceptedAt = canonicalDateTime(input.acceptedAt, 'acceptedAt')
  const event = eventFor(current, request, acceptedAt)
  personalModelFeedbackApplicationSchema.parse({ item: current.snapshot, event })

  if (isNoOp(current, event)) {
    return personalModelFeedbackTransitionResultSchema.parse({
      schemaVersion: 'personal-model-feedback-transition-v1',
      outcome: 'no_op',
      event,
      currentItem: current.snapshot,
      reason: 'feedback_already_current',
      resultFingerprint: digest(input.sha256Hex, {
        policyVersion: personalModelFeedbackApplicationPolicyVersion,
        outcome: 'no_op',
        itemId: current.itemId,
        itemRevision: current.revision,
        eventId: event.id,
        choice: event.choice,
        reasonCode: event.reasonCode,
        note: event.note,
        contextValidUntil: event.contextValidUntil,
      }),
    })
  }

  const feedbackState = choiceState[event.choice]
  const limitations: Array<
    PersonalModelItemRevision['snapshot']['confidence']['limitations'][number]
  > = current.snapshot.confidence.limitations.filter((limitation) => limitation !== 'user_disputed')
  if (event.choice === 'disagree') limitations.push('user_disputed')
  const snapshot = {
    ...current.snapshot,
    status: nextStatus(current, event.choice),
    confidence: { ...current.snapshot.confidence, limitations },
    feedbackState,
    validTo:
      event.choice === 'temporary_context'
        ? event.contextValidUntil
        : current.snapshot.feedbackState === 'temporary'
          ? null
          : current.snapshot.validTo,
    revision: current.revision + 1,
    updatedAt: acceptedAt,
  }
  const derivationFingerprint = digest(input.sha256Hex, {
    policyVersion: personalModelFeedbackApplicationPolicyVersion,
    previousDerivationFingerprint: current.derivationFingerprint,
    event: {
      id: event.id,
      choice: event.choice,
      reasonCode: event.reasonCode,
      note: event.note,
      contextValidUntil: event.contextValidUntil,
      createdAt: event.createdAt,
    },
    result: {
      status: snapshot.status,
      feedbackState: snapshot.feedbackState,
      validTo: snapshot.validTo,
      limitations: snapshot.confidence.limitations,
    },
  })

  return personalModelFeedbackTransitionResultSchema.parse({
    schemaVersion: 'personal-model-feedback-transition-v1',
    outcome: 'revised',
    event,
    previousItem: current.snapshot,
    revision: {
      schemaVersion: 'personal-model-item-revision-v1',
      id: input.revisionId,
      userId: current.userId,
      itemId: current.itemId,
      revision: current.revision + 1,
      previousRevision: current.revision,
      action: choiceAction[event.choice],
      snapshot,
      derivationFingerprint,
      feedbackEventId: event.id,
      changedAt: acceptedAt,
    },
  })
}

export const projectPersonalModelFeedbackWriteResponse = (
  transition: PersonalModelFeedbackTransitionResult,
): PersonalModelFeedbackWriteResponse => {
  const result = personalModelFeedbackTransitionResultSchema.parse(transition)
  const current = result.outcome === 'revised' ? result.revision.snapshot : result.currentItem
  return personalModelFeedbackWriteResponseSchema.parse({
    schemaVersion: personalModelFeedbackWriteResponseVersion,
    outcome: result.outcome,
    eventId: result.event.id,
    itemId: result.event.itemId,
    targetRevision: result.event.itemRevision,
    currentRevision: current.revision,
    choice: result.event.choice,
    feedbackState: current.feedbackState,
    status: current.status,
    validTo: current.validTo,
    acceptedAt: result.event.createdAt,
    noOpReason: result.outcome === 'no_op' ? result.reason : null,
  })
}
