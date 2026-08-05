import { describe, expect, it } from 'vitest'

import {
  classifyObservationReadFailure,
  observationReadFailureCopy,
  observationReadPhase,
} from './observation-read'

describe('long-term observation read authority', () => {
  it('keeps unread, ready and retained projections distinct from evidence count', () => {
    expect(observationReadPhase({ hasSnapshot: false, busy: true, hasFailure: false })).toBe(
      'initial-loading',
    )
    expect(observationReadPhase({ hasSnapshot: false, busy: false, hasFailure: true })).toBe(
      'initial-error',
    )
    expect(observationReadPhase({ hasSnapshot: true, busy: false, hasFailure: false })).toBe(
      'ready',
    )
    expect(observationReadPhase({ hasSnapshot: true, busy: true, hasFailure: false })).toBe(
      'refreshing',
    )
    expect(observationReadPhase({ hasSnapshot: true, busy: false, hasFailure: true })).toBe('stale')
  })

  it('maps failure families to bounded product copy', () => {
    expect(classifyObservationReadFailure(new Error('Failed to fetch'))).toBe('offline')
    expect(classifyObservationReadFailure({ statusCode: 403 })).toBe('refused')
    expect(classifyObservationReadFailure({ statusCode: 503 })).toBe('service')
    expect(classifyObservationReadFailure(undefined)).toBe('unknown')
    expect(observationReadFailureCopy('service', 'nutrition', false)).toEqual({
      eyebrow: 'SERVICE PAUSED / 服务暂不可用',
      title: '营养观察暂时无法读取',
      detail: '服务暂时没有返回观察证据；这里不会显示没有记录或零值。',
    })
  })
})
