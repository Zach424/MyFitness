import { describe, expect, it } from 'vitest'

import {
  aggregateHistoryReadFailureCopy,
  aggregateHistoryReadPhase,
  classifyAggregateHistoryReadFailure,
} from './aggregate-history-read'

describe('aggregate history read authority', () => {
  it('keeps unread, continuing, stale and ready audit evidence distinct', () => {
    expect(aggregateHistoryReadPhase({ hasSnapshot: false, busy: true, hasFailure: false })).toBe(
      'initial-loading',
    )
    expect(aggregateHistoryReadPhase({ hasSnapshot: false, busy: false, hasFailure: true })).toBe(
      'initial-error',
    )
    expect(aggregateHistoryReadPhase({ hasSnapshot: true, busy: false, hasFailure: false })).toBe(
      'ready',
    )
    expect(aggregateHistoryReadPhase({ hasSnapshot: true, busy: true, hasFailure: false })).toBe(
      'continuing',
    )
    expect(aggregateHistoryReadPhase({ hasSnapshot: true, busy: false, hasFailure: true })).toBe(
      'stale',
    )
  })

  it('classifies failures and never exposes raw transport copy', () => {
    expect(classifyAggregateHistoryReadFailure(new Error('raw network detail'))).toBe('offline')
    expect(classifyAggregateHistoryReadFailure({ statusCode: 429 })).toBe('refused')
    expect(classifyAggregateHistoryReadFailure({ statusCode: 503 })).toBe('service')
    expect(classifyAggregateHistoryReadFailure(undefined)).toBe('unknown')
    expect(aggregateHistoryReadFailureCopy('offline', '身体记录', false).detail).toContain(
      '不会把读取失败解释成没有历史',
    )
    expect(aggregateHistoryReadFailureCopy('service', '训练', true).detail).toContain(
      '旧游标暂时冻结',
    )
  })
})
