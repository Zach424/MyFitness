import { describe, expect, it } from 'vitest'

import { classifyRegisterReadFailure, registerReadPhase } from './register-read'

describe('owner definition register read authority', () => {
  it('keeps unread, ready and retained phases distinct from entry count', () => {
    expect(registerReadPhase({ hasSnapshot: false, busy: true, hasFailure: false })).toBe(
      'initial-loading',
    )
    expect(registerReadPhase({ hasSnapshot: false, busy: false, hasFailure: true })).toBe(
      'initial-error',
    )
    expect(registerReadPhase({ hasSnapshot: true, busy: false, hasFailure: false })).toBe('ready')
    expect(registerReadPhase({ hasSnapshot: true, busy: true, hasFailure: false })).toBe(
      'refreshing',
    )
    expect(registerReadPhase({ hasSnapshot: true, busy: false, hasFailure: true })).toBe('stale')
  })

  it('classifies transport and status families without returning raw messages', () => {
    expect(classifyRegisterReadFailure(new Error('Failed to fetch'))).toBe('offline')
    expect(classifyRegisterReadFailure({ statusCode: 429 })).toBe('refused')
    expect(classifyRegisterReadFailure({ statusCode: 503 })).toBe('service')
    expect(classifyRegisterReadFailure(undefined)).toBe('unknown')
  })
})
