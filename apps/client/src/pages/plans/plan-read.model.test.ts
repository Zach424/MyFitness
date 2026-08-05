import { describe, expect, it } from 'vitest'

import { classifyPlanReadFailure, planReadPhase } from './plan-read.model'

describe('Week Fold read authority model', () => {
  it('does not treat an initial read failure as an authoritative empty week', () => {
    expect(planReadPhase({ hasSnapshot: false, busy: true, hasFailure: false })).toBe(
      'initial-loading',
    )
    expect(planReadPhase({ hasSnapshot: false, busy: false, hasFailure: true })).toBe(
      'initial-error',
    )
    expect(planReadPhase({ hasSnapshot: true, busy: false, hasFailure: false })).toBe('ready')
  })

  it('marks an accepted plan snapshot as refreshing or stale without discarding it', () => {
    expect(planReadPhase({ hasSnapshot: true, busy: true, hasFailure: false })).toBe('refreshing')
    expect(planReadPhase({ hasSnapshot: true, busy: false, hasFailure: true })).toBe('stale')
  })

  it('classifies transport, refusal, outage, and unknown read failures', () => {
    expect(classifyPlanReadFailure(new Error('network failed'))).toBe('offline')
    expect(classifyPlanReadFailure({ errMsg: 'request:fail' })).toBe('offline')
    expect(classifyPlanReadFailure({ statusCode: 403 })).toBe('refused')
    expect(classifyPlanReadFailure({ statusCode: 503 })).toBe('service')
    expect(classifyPlanReadFailure({ statusCode: 302 })).toBe('unknown')
  })
})
