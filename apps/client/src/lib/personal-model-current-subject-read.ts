import type { PersonalModelCurrentSubjectView, PersonalModelSubjectKey } from '@myfitness/contracts'

import {
  classifyReadFailure,
  snapshotReadPhase,
  type ReadFailureKind,
  type SnapshotReadPhase,
} from './read-authority'

export type PersonalModelCurrentSubjectReadPhase = 'unread' | SnapshotReadPhase

export type PersonalModelCurrentSubjectReadFailure = {
  kind: ReadFailureKind
}

export type PersonalModelCurrentSubjectReadState = {
  subjectKey: PersonalModelSubjectKey
  generation: number
  started: boolean
  busy: boolean
  snapshot?: PersonalModelCurrentSubjectView
  failure?: PersonalModelCurrentSubjectReadFailure
}

export type PersonalModelCurrentSubjectReadReceipt = {
  subjectKey: PersonalModelSubjectKey
  generation: number
}

export const createPersonalModelCurrentSubjectReadState = (
  subjectKey: PersonalModelSubjectKey,
): PersonalModelCurrentSubjectReadState => ({
  subjectKey,
  generation: 0,
  started: false,
  busy: false,
})

export const personalModelCurrentSubjectReadPhase = (
  state: PersonalModelCurrentSubjectReadState,
): PersonalModelCurrentSubjectReadPhase => {
  if (!state.started) return 'unread'
  return snapshotReadPhase({
    hasSnapshot: state.snapshot !== undefined,
    busy: state.busy,
    hasFailure: state.failure !== undefined,
  })
}

export const beginPersonalModelCurrentSubjectRead = (
  state: PersonalModelCurrentSubjectReadState,
): {
  state: PersonalModelCurrentSubjectReadState
  receipt: PersonalModelCurrentSubjectReadReceipt
} => {
  const generation = state.generation + 1
  return {
    state: {
      ...state,
      generation,
      started: true,
      busy: true,
      failure: undefined,
    },
    receipt: { subjectKey: state.subjectKey, generation },
  }
}

const isCurrentReceipt = (
  state: PersonalModelCurrentSubjectReadState,
  receipt: PersonalModelCurrentSubjectReadReceipt,
) =>
  state.started &&
  state.busy &&
  state.subjectKey === receipt.subjectKey &&
  state.generation === receipt.generation

export const acceptPersonalModelCurrentSubjectRead = (
  state: PersonalModelCurrentSubjectReadState,
  receipt: PersonalModelCurrentSubjectReadReceipt,
  snapshot: PersonalModelCurrentSubjectView,
): PersonalModelCurrentSubjectReadState => {
  if (!isCurrentReceipt(state, receipt) || snapshot.subjectKey !== state.subjectKey) return state
  return { ...state, busy: false, snapshot, failure: undefined }
}

export const failPersonalModelCurrentSubjectRead = (
  state: PersonalModelCurrentSubjectReadState,
  receipt: PersonalModelCurrentSubjectReadReceipt,
  error: unknown,
): PersonalModelCurrentSubjectReadState => {
  if (!isCurrentReceipt(state, receipt)) return state
  return { ...state, busy: false, failure: { kind: classifyReadFailure(error) } }
}

export const replacePersonalModelCurrentSubject = (
  state: PersonalModelCurrentSubjectReadState,
  subjectKey: PersonalModelSubjectKey,
): PersonalModelCurrentSubjectReadState => ({
  subjectKey,
  generation: state.generation + 1,
  started: false,
  busy: false,
})

export const invalidatePersonalModelCurrentSubjectRead = (
  state: PersonalModelCurrentSubjectReadState,
): PersonalModelCurrentSubjectReadState => ({
  ...state,
  generation: state.generation + 1,
  started: false,
  busy: false,
  snapshot: undefined,
  failure: undefined,
})
