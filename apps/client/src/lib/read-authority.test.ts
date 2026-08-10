import { describe, expect, it } from 'vitest'

import { classifyReadFailure, snapshotReadPhase } from './read-authority'

describe('shared read authority', () => {
  it('keeps transport and HTTP failure classes distinct', () => {
    expect(classifyReadFailure(new Error('Failed to fetch'))).toBe('offline')
    expect(classifyReadFailure({ errMsg: 'request:fail' })).toBe('offline')
    expect(classifyReadFailure({ statusCode: 429 })).toBe('refused')
    expect(classifyReadFailure({ statusCode: 503 })).toBe('service')
    expect(classifyReadFailure({ statusCode: 302 })).toBe('unknown')
    expect(classifyReadFailure(undefined)).toBe('unknown')
  })

  it('keeps first-read and retained-snapshot phases distinct', () => {
    expect(snapshotReadPhase({ hasSnapshot: false, busy: true, hasFailure: false })).toBe(
      'initial-loading',
    )
    expect(snapshotReadPhase({ hasSnapshot: true, busy: true, hasFailure: false })).toBe(
      'refreshing',
    )
    expect(snapshotReadPhase({ hasSnapshot: false, busy: false, hasFailure: true })).toBe(
      'initial-error',
    )
    expect(snapshotReadPhase({ hasSnapshot: true, busy: false, hasFailure: true })).toBe('stale')
    expect(snapshotReadPhase({ hasSnapshot: true, busy: false, hasFailure: false })).toBe('ready')
    expect(snapshotReadPhase({ hasSnapshot: false, busy: false, hasFailure: false })).toBe(
      'initial-loading',
    )
  })
})
