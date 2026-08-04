import { useMemo, useState } from 'react'
import { Button, ScrollView, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import type { HistoryCalendar } from '@myfitness/contracts'

import { buttonA11yProps } from '../../lib/accessibility'
import { backfillNavigationUrl } from '../../lib/backfill-intent'
import { getHistoryCalendar } from '../../lib/api'
import { detectedTimeZone } from '../../lib/occurrence-time'
import {
  historyCalendarTotals,
  historyDateLabel,
  historyDayLabel,
  historyWeekday,
} from './history.model'
import './index.scss'

const dayNumber = (localDate: string) => String(Number(localDate.slice(-2)))

const HistoryPage = () => {
  const [calendar, setCalendar] = useState<HistoryCalendar>()
  const [selectedDate, setSelectedDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState('')

  const load = async () => {
    setLoading(true)
    setFeedback('')
    try {
      const result = await getHistoryCalendar(detectedTimeZone())
      setCalendar(result)
      setSelectedDate((current) =>
        result.series.some((day) => day.localDate === current) ? current : result.endDate,
      )
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '历史日历暂时无法读取，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    void load()
  })

  const totals = useMemo(
    () =>
      calendar
        ? historyCalendarTotals(calendar)
        : { recordedDays: 0, healthRecordCount: 0, workoutCount: 0, mealCount: 0 },
    [calendar],
  )
  const selected =
    calendar?.series.find((day) => day.localDate === selectedDate) ?? calendar?.series.at(-1)
  const weekdayHeadings = calendar?.series.slice(0, 7).map((day) => historyWeekday(day.localDate))

  const openBackfill = (page: 'records' | 'workouts' | 'nutrition') => {
    if (!selected || !calendar) return
    void Taro.navigateTo({
      url: backfillNavigationUrl(page, {
        localDate: selected.localDate,
        timezone: calendar.timezone,
      }),
    })
  }

  return (
    <View className="history-page">
      <ScrollView className="history-scroll" scrollY enhanced showScrollbar={false}>
        <View className="history-shell">
          <View className="history-topbar">
            <Button
              {...buttonA11yProps}
              className="history-back"
              aria-label="返回今天"
              onClick={() => void Taro.navigateBack()}
            >
              ←
            </Button>
            <View className="history-brand" aria-label="衡迹历史日历">
              <Text className="history-brand__cn">衡迹</Text>
              <Text className="history-brand__en">HISTORY LEDGER</Text>
            </View>
            <Text className="history-range">28D</Text>
          </View>

          <View className="history-hero">
            <Text className="history-eyebrow">RECORDED DAYS · OPEN DAYS</Text>
            <Text className="history-title">有记录的日子与空白，都清楚。</Text>
            <Text className="history-lead">
              只读取当前、未删除的记录。空白日代表“没有记录”，不代表零活动、零摄入或未完成。
            </Text>
          </View>

          {feedback ? (
            <View className="history-feedback" role="status">
              <Text>{feedback}</Text>
              <Button {...buttonA11yProps} className="history-retry" onClick={() => void load()}>
                重试
              </Button>
            </View>
          ) : null}

          <View className="history-layout">
            <View className="history-sheet">
              <View className="history-sheet__heading">
                <View>
                  <Text className="history-eyebrow">28-DAY EVIDENCE MAP</Text>
                  <Text className="history-panel-title">近 28 天记录地图</Text>
                </View>
                <Text className="history-zone">{calendar?.timezone ?? detectedTimeZone()}</Text>
              </View>

              {loading && !calendar ? (
                <View className="history-loading" role="status">
                  正在按本地日期整理记录…
                </View>
              ) : calendar ? (
                <>
                  <View className="history-weekdays" aria-hidden="true">
                    {weekdayHeadings?.map((label, index) => (
                      <Text key={`${label}-${index}`}>{label}</Text>
                    ))}
                  </View>
                  <View className="history-grid" aria-label="近 28 天记录日历">
                    {calendar.series.map((day) => (
                      <Button
                        {...buttonA11yProps}
                        className={`history-day ${day.hasRecords ? 'history-day--recorded' : ''} ${
                          selected?.localDate === day.localDate ? 'history-day--selected' : ''
                        }`}
                        key={day.localDate}
                        aria-label={historyDayLabel(day)}
                        aria-pressed={selected?.localDate === day.localDate}
                        onClick={() => setSelectedDate(day.localDate)}
                      >
                        <Text className="history-day__number">{dayNumber(day.localDate)}</Text>
                        <View className="history-day__marks" aria-hidden="true">
                          <Text className={day.healthRecordCount ? 'history-mark--body' : ''}>
                            {day.healthRecordCount ? '身' : '·'}
                          </Text>
                          <Text className={day.workoutCount ? 'history-mark--workout' : ''}>
                            {day.workoutCount ? '训' : '·'}
                          </Text>
                          <Text className={day.mealCount ? 'history-mark--meal' : ''}>
                            {day.mealCount ? '餐' : '·'}
                          </Text>
                        </View>
                      </Button>
                    ))}
                  </View>
                  <View className="history-legend" aria-label="日历标记图例">
                    <Text>身 身体/恢复</Text>
                    <Text>训 训练</Text>
                    <Text>餐 饮食</Text>
                    <Text>· 无该类记录</Text>
                  </View>
                </>
              ) : (
                <View className="history-loading">暂无可显示的日历。</View>
              )}
            </View>

            <View className="history-aside">
              <View className="history-summary">
                <Text className="history-eyebrow">CURRENT RECORD COUNTS</Text>
                <Text className="history-panel-title">这 28 天留下的证据</Text>
                <View className="history-totals">
                  {[
                    ['有记录日', `${totals.recordedDays} / 28`],
                    ['身体/恢复', `${totals.healthRecordCount} 条`],
                    ['训练', `${totals.workoutCount} 次`],
                    ['饮食', `${totals.mealCount} 餐`],
                  ].map(([label, value]) => (
                    <View className="history-total" key={label}>
                      <Text>{label}</Text>
                      <Text className="history-total__value">{value}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {selected ? (
                <View className="history-selected" aria-label="选中日期记录与回填入口">
                  <Text className="history-eyebrow">SELECTED LOCAL DAY</Text>
                  <Text className="history-selected__date">
                    {historyDateLabel(selected.localDate)}
                  </Text>
                  <Text className="history-selected__body">
                    {selected.hasRecords
                      ? `当前有身体/恢复 ${selected.healthRecordCount} 条、训练 ${selected.workoutCount} 次、饮食 ${selected.mealCount} 餐。`
                      : '这一天没有已确认记录；这只是证据空白，不是行为结论。'}
                  </Text>
                  <Text className="history-selected__hint">
                    回填只带入日期与时区，你必须再补充真实时分才能保存。
                  </Text>
                  <View className="history-actions">
                    <Button
                      {...buttonA11yProps}
                      className="history-action history-action--primary"
                      onClick={() => openBackfill('records')}
                    >
                      补记身体/恢复
                    </Button>
                    <Button
                      {...buttonA11yProps}
                      className="history-action"
                      onClick={() => openBackfill('workouts')}
                    >
                      补记训练
                    </Button>
                    <Button
                      {...buttonA11yProps}
                      className="history-action"
                      onClick={() => openBackfill('nutrition')}
                    >
                      补记饮食
                    </Button>
                  </View>
                </View>
              ) : null}
            </View>
          </View>

          <Text className="history-safety">
            HISTORY IS EVIDENCE, NOT A SCORE · 历史日历不计算打卡、连续天数或达标率。
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}

export default HistoryPage
