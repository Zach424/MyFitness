import { describe, expect, it } from 'vitest'

import { classifyTodayReadFailure, todayReadPhase } from './today-read.model'

describe('Today read resilience model', () => {
  it('keeps unknown initial state distinct from an empty successful snapshot', () => {
    expect(todayReadPhase({ hasSnapshot: false, busy: true, hasFailure: false })).toBe(
      'initial-loading',
    )
    expect(todayReadPhase({ hasSnapshot: false, busy: false, hasFailure: true })).toBe(
      'initial-error',
    )
    expect(todayReadPhase({ hasSnapshot: true, busy: false, hasFailure: false })).toBe('ready')
  })

  it('retains a loaded snapshot while refreshing or after refresh failure', () => {
    expect(todayReadPhase({ hasSnapshot: true, busy: true, hasFailure: false })).toBe('refreshing')
    expect(todayReadPhase({ hasSnapshot: true, busy: false, hasFailure: true })).toBe('stale')
  })

  it('separates offline transport, server refusal, service outage, and unknown failures', () => {
    expect(classifyTodayReadFailure(new Error('network failed'))).toBe('offline')
    expect(classifyTodayReadFailure({ errMsg: 'request:fail' })).toBe('offline')
    expect(classifyTodayReadFailure({ statusCode: 429 })).toBe('refused')
    expect(classifyTodayReadFailure({ statusCode: 503 })).toBe('service')
    expect(classifyTodayReadFailure({ statusCode: 302 })).toBe('unknown')
  })
})
