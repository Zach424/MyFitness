import type { HistoryCalendar, HistoryCalendarDay } from '@myfitness/contracts'

export const historyCalendarTotals = (calendar: HistoryCalendar) => ({
  recordedDays: calendar.series.filter((day) => day.hasRecords).length,
  healthRecordCount: calendar.series.reduce((total, day) => total + day.healthRecordCount, 0),
  workoutCount: calendar.series.reduce((total, day) => total + day.workoutCount, 0),
  mealCount: calendar.series.reduce((total, day) => total + day.mealCount, 0),
})

const displayDate = (localDate: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('zh-CN', { ...options, timeZone: 'UTC' }).format(
    new Date(`${localDate}T12:00:00.000Z`),
  )

export const historyWeekday = (localDate: string) => displayDate(localDate, { weekday: 'narrow' })

export const historyDateLabel = (localDate: string) =>
  displayDate(localDate, { month: 'long', day: 'numeric', weekday: 'long' })

export const historyDayLabel = (day: HistoryCalendarDay) =>
  day.hasRecords
    ? `${day.localDate}，身体或恢复 ${day.healthRecordCount} 条，训练 ${day.workoutCount} 次，饮食 ${day.mealCount} 餐`
    : `${day.localDate}，无记录`
