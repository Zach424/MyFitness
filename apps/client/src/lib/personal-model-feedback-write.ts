import type {
  PersonalModelFeedbackChoice,
  PersonalModelFeedbackWriteResponse,
  PersonalModelSubjectKey,
} from '@myfitness/contracts'

import { classifyReadFailure, type ReadFailureKind } from './read-authority'

export type PersonalModelFeedbackWritePhase = 'idle' | 'submitting' | 'succeeded' | 'failed'
export type PersonalModelFeedbackWriteFailureKind =
  ReadFailureKind | 'conflict' | 'invalid-contract'

export type PersonalModelFeedbackWriteFailure = {
  kind: PersonalModelFeedbackWriteFailureKind
}

export type PersonalModelFeedbackWriteTarget = {
  itemId: string
  revision: number
}

export type PersonalModelFeedbackWriteState = {
  subjectKey: PersonalModelSubjectKey
  generation: number
  phase: PersonalModelFeedbackWritePhase
  target?: PersonalModelFeedbackWriteTarget
  eventId?: string
  choice?: PersonalModelFeedbackChoice
  result?: PersonalModelFeedbackWriteResponse
  failure?: PersonalModelFeedbackWriteFailure
}

export type PersonalModelFeedbackWriteReceipt = {
  subjectKey: PersonalModelSubjectKey
  generation: number
  itemId: string
  revision: number
  eventId: string
  choice: PersonalModelFeedbackChoice
}

export const createPersonalModelFeedbackWriteState = (
  subjectKey: PersonalModelSubjectKey,
): PersonalModelFeedbackWriteState => ({ subjectKey, generation: 0, phase: 'idle' })

export const beginPersonalModelFeedbackWrite = (
  state: PersonalModelFeedbackWriteState,
  target: PersonalModelFeedbackWriteTarget,
  eventId: string,
  choice: PersonalModelFeedbackChoice,
): { state: PersonalModelFeedbackWriteState; receipt: PersonalModelFeedbackWriteReceipt } => {
  const generation = state.generation + 1
  return {
    state: {
      subjectKey: state.subjectKey,
      generation,
      phase: 'submitting',
      target,
      eventId,
      choice,
    },
    receipt: {
      subjectKey: state.subjectKey,
      generation,
      itemId: target.itemId,
      revision: target.revision,
      eventId,
      choice,
    },
  }
}

const isCurrentReceipt = (
  state: PersonalModelFeedbackWriteState,
  receipt: PersonalModelFeedbackWriteReceipt,
) =>
  state.phase === 'submitting' &&
  state.subjectKey === receipt.subjectKey &&
  state.generation === receipt.generation &&
  state.target?.itemId === receipt.itemId &&
  state.target.revision === receipt.revision &&
  state.eventId === receipt.eventId &&
  state.choice === receipt.choice

export const acceptPersonalModelFeedbackWrite = (
  state: PersonalModelFeedbackWriteState,
  receipt: PersonalModelFeedbackWriteReceipt,
  result: PersonalModelFeedbackWriteResponse,
): PersonalModelFeedbackWriteState => {
  if (
    !isCurrentReceipt(state, receipt) ||
    result.itemId !== receipt.itemId ||
    result.targetRevision !== receipt.revision ||
    result.eventId !== receipt.eventId ||
    result.choice !== receipt.choice
  ) {
    return state
  }
  return { ...state, phase: 'succeeded', result, failure: undefined }
}

export const classifyPersonalModelFeedbackWriteFailure = (
  error: unknown,
): PersonalModelFeedbackWriteFailureKind => {
  if (
    error instanceof Error &&
    (error.name === 'PersonalModelFeedbackRequestError' ||
      error.name === 'PersonalModelFeedbackResponseError')
  ) {
    return 'invalid-contract'
  }
  const statusCode = (error as { statusCode?: unknown } | null)?.statusCode
  if (statusCode === 409) return 'conflict'
  return classifyReadFailure(error)
}

export const failPersonalModelFeedbackWrite = (
  state: PersonalModelFeedbackWriteState,
  receipt: PersonalModelFeedbackWriteReceipt,
  error: unknown,
): PersonalModelFeedbackWriteState => {
  if (!isCurrentReceipt(state, receipt)) return state
  return {
    ...state,
    phase: 'failed',
    result: undefined,
    failure: { kind: classifyPersonalModelFeedbackWriteFailure(error) },
  }
}

export const replacePersonalModelFeedbackSubject = (
  state: PersonalModelFeedbackWriteState,
  subjectKey: PersonalModelSubjectKey,
): PersonalModelFeedbackWriteState => ({
  subjectKey,
  generation: state.generation + 1,
  phase: 'idle',
})

export const invalidatePersonalModelFeedbackWrite = (
  state: PersonalModelFeedbackWriteState,
): PersonalModelFeedbackWriteState => ({
  subjectKey: state.subjectKey,
  generation: state.generation + 1,
  phase: 'idle',
})
