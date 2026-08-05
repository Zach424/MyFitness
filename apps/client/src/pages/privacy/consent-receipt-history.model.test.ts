import { describe, expect, it } from 'vitest'

import {
  consentReceiptHistoryFailurePresentation,
  consentReceiptHistoryReadPhase,
} from './consent-receipt-history.model'

describe('consent receipt history read authority', () => {
  it('keeps collapsed, unknown, accepted and in-flight snapshots distinct', () => {
    expect(
      consentReceiptHistoryReadPhase({
        opened: false,
        hasSnapshot: false,
        busy: false,
        operation: 'initial',
        hasFailure: false,
      }),
    ).toBe('collapsed')
    expect(
      consentReceiptHistoryReadPhase({
        opened: true,
        hasSnapshot: false,
        busy: true,
        operation: 'initial',
        hasFailure: false,
      }),
    ).toBe('initial-loading')
    expect(
      consentReceiptHistoryReadPhase({
        opened: true,
        hasSnapshot: true,
        busy: true,
        operation: 'refresh',
        hasFailure: false,
      }),
    ).toBe('refreshing')
    expect(
      consentReceiptHistoryReadPhase({
        opened: true,
        hasSnapshot: true,
        busy: true,
        operation: 'continuation',
        hasFailure: false,
      }),
    ).toBe('continuing')
    expect(
      consentReceiptHistoryReadPhase({
        opened: true,
        hasSnapshot: true,
        busy: false,
        operation: 'refresh',
        hasFailure: false,
      }),
    ).toBe('ready')
  })

  it('never presents a failed first read as an accepted empty history', () => {
    expect(
      consentReceiptHistoryReadPhase({
        opened: true,
        hasSnapshot: false,
        busy: false,
        operation: 'initial',
        hasFailure: true,
      }),
    ).toBe('initial-error')
    const presentation = consentReceiptHistoryFailurePresentation({
      kind: 'offline',
      operation: 'initial',
      acceptedCount: null,
    })
    expect(presentation.detail).toContain('未知状态')
    expect(presentation.detail).toContain('不会显示为空历史')
  })

  it('uses product-owned copy for all failure families and freezes accepted cursors', () => {
    const kinds = ['offline', 'refused', 'service', 'unknown'] as const
    const presentations = kinds.map((kind) =>
      consentReceiptHistoryFailurePresentation({
        kind,
        operation: 'continuation',
        acceptedCount: 10,
      }),
    )
    expect(new Set(presentations.map(({ eyebrow }) => eyebrow)).size).toBe(4)
    for (const presentation of presentations) {
      expect(presentation.detail).toContain('10 份')
      expect(presentation.detail).toContain('游标没有前进')
      expect(JSON.stringify(presentation)).not.toContain('raw-backend-message')
    }
    expect(
      consentReceiptHistoryReadPhase({
        opened: true,
        hasSnapshot: true,
        busy: false,
        operation: 'continuation',
        hasFailure: true,
      }),
    ).toBe('retained-stale')
  })
})
