import { describe, expect, it } from 'vitest'

import {
  acceptPersonalModelCurrentSubjectRead,
  beginPersonalModelCurrentSubjectRead,
  createPersonalModelCurrentSubjectReadState,
  failPersonalModelCurrentSubjectRead,
  invalidatePersonalModelCurrentSubjectRead,
  personalModelCurrentSubjectReadPhase,
  replacePersonalModelCurrentSubject,
} from './personal-model-current-subject-read'

const emptyFrequency = {
  schemaVersion: 'personal-model-current-subject-view-v1' as const,
  subjectKey: 'training.recorded_frequency' as const,
  current: null,
}

describe('personal model current-subject page-memory read authority', () => {
  it('keeps unread, first loading, initial failure and successful empty distinct', () => {
    const unread = createPersonalModelCurrentSubjectReadState('training.recorded_frequency')
    expect(personalModelCurrentSubjectReadPhase(unread)).toBe('unread')

    const loading = beginPersonalModelCurrentSubjectRead(unread)
    expect(personalModelCurrentSubjectReadPhase(loading.state)).toBe('initial-loading')

    const failed = failPersonalModelCurrentSubjectRead(
      loading.state,
      loading.receipt,
      Object.assign(new Error('offline'), { errMsg: 'request:fail' }),
    )
    expect(personalModelCurrentSubjectReadPhase(failed)).toBe('initial-error')
    expect(failed.snapshot).toBeUndefined()
    expect(failed.failure).toEqual({ kind: 'offline' })

    const retry = beginPersonalModelCurrentSubjectRead(failed)
    const ready = acceptPersonalModelCurrentSubjectRead(retry.state, retry.receipt, emptyFrequency)
    expect(personalModelCurrentSubjectReadPhase(ready)).toBe('ready')
    expect(ready.snapshot?.current).toBeNull()
    expect(failPersonalModelCurrentSubjectRead(ready, retry.receipt, new Error('duplicate'))).toBe(
      ready,
    )
  })

  it('retains the whole accepted snapshot during refresh and after refresh failure', () => {
    const initial = beginPersonalModelCurrentSubjectRead(
      createPersonalModelCurrentSubjectReadState('training.recorded_frequency'),
    )
    const ready = acceptPersonalModelCurrentSubjectRead(
      initial.state,
      initial.receipt,
      emptyFrequency,
    )
    const refreshing = beginPersonalModelCurrentSubjectRead(ready)
    expect(personalModelCurrentSubjectReadPhase(refreshing.state)).toBe('refreshing')
    expect(refreshing.state.snapshot).toBe(emptyFrequency)

    const stale = failPersonalModelCurrentSubjectRead(refreshing.state, refreshing.receipt, {
      statusCode: 503,
    })
    expect(personalModelCurrentSubjectReadPhase(stale)).toBe('stale')
    expect(stale.snapshot).toBe(emptyFrequency)
    expect(stale.failure).toEqual({ kind: 'service' })
  })

  it('ignores late success and failure receipts after a newer request starts', () => {
    const first = beginPersonalModelCurrentSubjectRead(
      createPersonalModelCurrentSubjectReadState('training.recorded_frequency'),
    )
    const second = beginPersonalModelCurrentSubjectRead(first.state)

    expect(acceptPersonalModelCurrentSubjectRead(second.state, first.receipt, emptyFrequency)).toBe(
      second.state,
    )
    expect(
      failPersonalModelCurrentSubjectRead(second.state, first.receipt, new Error('late')),
    ).toBe(second.state)
    expect(personalModelCurrentSubjectReadPhase(second.state)).toBe('initial-loading')
  })

  it('invalidates the old subject receipt and clears its snapshot on subject replacement', () => {
    const initial = beginPersonalModelCurrentSubjectRead(
      createPersonalModelCurrentSubjectReadState('training.recorded_frequency'),
    )
    const ready = acceptPersonalModelCurrentSubjectRead(
      initial.state,
      initial.receipt,
      emptyFrequency,
    )
    const replaced = replacePersonalModelCurrentSubject(ready, 'training.availability')

    expect(personalModelCurrentSubjectReadPhase(replaced)).toBe('unread')
    expect(replaced.snapshot).toBeUndefined()
    expect(acceptPersonalModelCurrentSubjectRead(replaced, initial.receipt, emptyFrequency)).toBe(
      replaced,
    )
  })

  it('invalidates pending work and removes all page-memory evidence on close or unmount', () => {
    const pending = beginPersonalModelCurrentSubjectRead(
      createPersonalModelCurrentSubjectReadState('training.recorded_frequency'),
    )
    const invalidated = invalidatePersonalModelCurrentSubjectRead(pending.state)

    expect(personalModelCurrentSubjectReadPhase(invalidated)).toBe('unread')
    expect(invalidated.snapshot).toBeUndefined()
    expect(
      acceptPersonalModelCurrentSubjectRead(invalidated, pending.receipt, emptyFrequency),
    ).toBe(invalidated)
  })
})
