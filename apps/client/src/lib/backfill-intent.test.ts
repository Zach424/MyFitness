import { describe, expect, it } from 'vitest'

import { backfillNavigationUrl, parseBackfillIntent } from './backfill-intent'

const now = Date.parse('2026-08-05T12:00:00.000Z')

describe('history backfill intent', () => {
  it('accepts a bounded past local date and produces an encoded route', () => {
    const intent = parseBackfillIntent({ date: '2026-08-01', timezone: 'Asia%2FShanghai' }, now)
    expect(intent).toEqual({ localDate: '2026-08-01', timezone: 'Asia/Shanghai' })
    expect(backfillNavigationUrl('records', intent!)).toBe(
      '/pages/records/index?date=2026-08-01&timezone=Asia%2FShanghai',
    )
    expect(backfillNavigationUrl('workouts', intent!)).toBe(
      '/pages/workouts/index?date=2026-08-01&timezone=Asia%2FShanghai',
    )
    expect(backfillNavigationUrl('nutrition', intent!)).toBe(
      '/pages/nutrition/index?date=2026-08-01&timezone=Asia%2FShanghai',
    )
  })

  it('rejects future, over-90-day, invalid-calendar and invalid-timezone input', () => {
    expect(parseBackfillIntent({ date: '2026-08-06', timezone: 'Asia/Shanghai' }, now)).toBeNull()
    expect(parseBackfillIntent({ date: '2026-05-06', timezone: 'Asia/Shanghai' }, now)).toBeNull()
    expect(parseBackfillIntent({ date: '2026-02-30', timezone: 'Asia/Shanghai' }, now)).toBeNull()
    expect(parseBackfillIntent({ date: '2026-08-01', timezone: 'Not/A_Zone' }, now)).toBeNull()
  })
})
