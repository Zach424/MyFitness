import type { HistoryCalendar, HistoryCalendarDay } from '@myfitness/contracts'
import type { ReadFailureKind } from '../../lib/read-authority'

export { classifyReadFailure as classifyHistoryCalendarReadFailure } from '../../lib/read-authority'

export type HistoryCalendarReadFailureKind = ReadFailureKind

export const historyCalendarReadFailureCopy = (
  kind: HistoryCalendarReadFailureKind,
  hasSnapshot: boolean,
) => {
  if (kind === 'offline')
    return {
      eyebrow: 'OFFLINE / 连接未完成',
      title: hasSnapshot ? '历史日历复核没有完成' : '历史日历还没有读取',
      detail: hasSnapshot
        ? '上次成功读取的 28 天证据地图仍在下方；重新核对前，日期选择和三类回填入口均已冻结。'
        : '当前无法确认账户的 28 天日历；页面不会用空白日或零计数替代服务结果。',
    }
  if (kind === 'refused')
    return {
      eyebrow: 'READ REFUSED / 读取被拒绝',
      title: '服务没有接受本次历史日历核对',
      detail: hasSnapshot
        ? '旧日历继续只读保留；重新核对成功前，不能改变选中日期或发起回填。'
        : '日期范围与记录数量仍是未知状态；只有成功响应才能建立空白或有记录的结论。',
    }
  if (kind === 'service')
    return {
      eyebrow: 'SERVICE PAUSED / 服务暂不可用',
      title: '历史日历暂时无法读取',
      detail: hasSnapshot
        ? '下方保留上次日历用于查看，日期选择和三类回填入口保持冻结。'
        : '服务暂时没有返回日历证据；这里不会显示“没有记录”或零计数。',
    }
  return {
    eyebrow: 'READ UNKNOWN / 结果未知',
    title: '无法确认当前历史日历',
    detail: hasSnapshot
      ? '旧日历继续只读保留；重新核对前不会把它描述为当前结果，也不会从它发起回填。'
      : '页面尚未取得可信日历，也不会推断账户在这 28 天里没有记录。',
  }
}

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
