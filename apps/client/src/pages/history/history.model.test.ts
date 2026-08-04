import { describe, expect, it } from 'vitest'

import { historyCalendarTotals, historyDateLabel, historyDayLabel } from './history.model'

const calendar = {
  generatedAt: '2026-08-05T12:00:00.000Z',
  timezone: 'Asia/Shanghai',
  startDate: '2026-07-09',
  endDate: '2026-08-05',
  series: Array.from({ length: 28 }, (_, index) => ({
    localDate: new Date(Date.UTC(2026, 6, 9 + index)).toISOString().slice(0, 10),
    hasRecords: index === 27,
    healthRecordCount: index === 27 ? 2 : 0,
    workoutCount: index === 27 ? 1 : 0,
    mealCount: index === 27 ? 3 : 0,
  })),
}

describe('history calendar client model', () => {
  it('totals only current counted records and keeps missing days explicit', () => {
    expect(historyCalendarTotals(calendar)).toEqual({
      recordedDays: 1,
      healthRecordCount: 2,
      workoutCount: 1,
      mealCount: 3,
    })
    expect(historyDayLabel(calendar.series[0]!)).toContain('无记录')
    expect(historyDayLabel(calendar.series[27]!)).toContain('饮食 3 餐')
  })

  it('formats a local calendar label independently from the host timezone', () => {
    expect(historyDateLabel('2026-08-05')).toContain('8月5日')
  })
})
