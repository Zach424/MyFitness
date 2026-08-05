import { describe, expect, it } from 'vitest'

import {
  classifyPrivateInventoryReadFailure,
  privateInventoryReadFailureCopy,
  privateInventoryReadPhase,
} from './private-inventory-read'

describe('private photo inventory read authority', () => {
  it('keeps unknown, accepted and retained phases distinct from item count', () => {
    expect(privateInventoryReadPhase({ hasSnapshot: false, busy: true, hasFailure: false })).toBe(
      'initial-loading',
    )
    expect(privateInventoryReadPhase({ hasSnapshot: false, busy: false, hasFailure: true })).toBe(
      'initial-error',
    )
    expect(privateInventoryReadPhase({ hasSnapshot: true, busy: false, hasFailure: false })).toBe(
      'ready',
    )
    expect(privateInventoryReadPhase({ hasSnapshot: true, busy: true, hasFailure: false })).toBe(
      'refreshing',
    )
    expect(privateInventoryReadPhase({ hasSnapshot: true, busy: false, hasFailure: true })).toBe(
      'stale',
    )
  })

  it('classifies bounded failure families without leaking backend messages', () => {
    expect(classifyPrivateInventoryReadFailure(new Error('secret upstream detail'))).toBe('offline')
    expect(classifyPrivateInventoryReadFailure({ statusCode: 403 })).toBe('refused')
    expect(classifyPrivateInventoryReadFailure({ statusCode: 503 })).toBe('service')
    expect(classifyPrivateInventoryReadFailure(undefined)).toBe('unknown')

    for (const subject of ['food-proof', 'progress-photo'] as const) {
      const copy = privateInventoryReadFailureCopy('offline', subject, false)
      expect(copy.detail).not.toContain('secret upstream detail')
      expect(copy.detail).toContain('不会')
    }
  })
})
