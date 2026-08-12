import {
  personalModelFeedbackStates,
  personalModelStatuses,
} from './personal-model-current-subject.constants'
import {
  personalModelFeedbackChoices,
  personalModelFeedbackNoteMaximumLength,
  personalModelFeedbackNoOpReasons,
  personalModelFeedbackReasonCodes,
  personalModelFeedbackWriteRequestVersion,
  personalModelFeedbackWriteResponseVersion,
} from './personal-model-feedback.constants'
import type {
  PersonalModelFeedbackWriteRequest,
  PersonalModelFeedbackWriteResponse,
} from './personal-model'
import { isPersonalModelOffsetDateTime } from './personal-model-time.runtime'

type JsonRecord = Record<string, unknown>

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const requestKeys = [
  'schemaVersion',
  'eventId',
  'choice',
  'reasonCode',
  'note',
  'contextValidUntil',
] as const

const responseKeys = [
  'schemaVersion',
  'outcome',
  'eventId',
  'itemId',
  'targetRevision',
  'currentRevision',
  'choice',
  'feedbackState',
  'status',
  'validTo',
  'acceptedAt',
  'noOpReason',
] as const

const feedbackStateByChoice = {
  matches_me: 'confirmed',
  temporary_context: 'temporary',
  disagree: 'disagreed',
  uncertain: 'uncertain',
} as const

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasExactKeys = (value: JsonRecord, keys: readonly string[]) => {
  const actual = Object.keys(value)
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}

const isOneOf = <T extends string>(value: unknown, values: readonly T[]): value is T =>
  typeof value === 'string' && values.includes(value as T)

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && uuidPattern.test(value)

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0

export const isPersonalModelFeedbackWriteRequest = (
  value: unknown,
): value is PersonalModelFeedbackWriteRequest => {
  if (!isRecord(value) || !hasExactKeys(value, requestKeys)) return false
  if (
    value.schemaVersion !== personalModelFeedbackWriteRequestVersion ||
    !isUuid(value.eventId) ||
    !isOneOf(value.choice, personalModelFeedbackChoices) ||
    (value.reasonCode !== null && !isOneOf(value.reasonCode, personalModelFeedbackReasonCodes)) ||
    (value.note !== null &&
      (typeof value.note !== 'string' ||
        value.note.trim().length < 1 ||
        value.note.trim().length > personalModelFeedbackNoteMaximumLength)) ||
    (value.contextValidUntil !== null && !isPersonalModelOffsetDateTime(value.contextValidUntil))
  ) {
    return false
  }
  return value.choice === 'temporary_context'
    ? value.contextValidUntil !== null
    : value.contextValidUntil === null
}

export const isPersonalModelFeedbackWriteResponse = (
  value: unknown,
): value is PersonalModelFeedbackWriteResponse => {
  if (!isRecord(value) || !hasExactKeys(value, responseKeys)) return false
  if (
    value.schemaVersion !== personalModelFeedbackWriteResponseVersion ||
    !isOneOf(value.outcome, ['revised', 'no_op']) ||
    !isUuid(value.eventId) ||
    !isUuid(value.itemId) ||
    !isPositiveInteger(value.targetRevision) ||
    !isPositiveInteger(value.currentRevision) ||
    !isOneOf(value.choice, personalModelFeedbackChoices) ||
    !isOneOf(value.feedbackState, personalModelFeedbackStates) ||
    !isOneOf(value.status, personalModelStatuses) ||
    value.status === 'superseded' ||
    value.status === 'invalidated' ||
    (value.validTo !== null && !isPersonalModelOffsetDateTime(value.validTo)) ||
    !isPersonalModelOffsetDateTime(value.acceptedAt) ||
    (value.noOpReason !== null && !isOneOf(value.noOpReason, personalModelFeedbackNoOpReasons))
  ) {
    return false
  }

  const expectedCurrentRevision =
    value.outcome === 'revised' ? value.targetRevision + 1 : value.targetRevision
  if (
    value.currentRevision !== expectedCurrentRevision ||
    (value.outcome === 'no_op') !== (value.noOpReason !== null) ||
    value.feedbackState !== feedbackStateByChoice[value.choice] ||
    (value.choice === 'temporary_context' && value.validTo === null) ||
    (value.choice === 'disagree' && value.status !== 'disputed')
  ) {
    return false
  }
  return true
}
