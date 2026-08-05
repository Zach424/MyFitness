import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, ScrollView, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import type { HistoryCalendar } from '@myfitness/contracts'

import { buttonA11yProps, buttonActivationProps, deferH5Focus } from '../../lib/accessibility'
import { backfillNavigationUrl } from '../../lib/backfill-intent'
import { getHistoryCalendar } from '../../lib/api'
import { detectedTimeZone } from '../../lib/occurrence-time'
import { registerReadPhase } from '../../lib/register-read'
import {
  classifyHistoryCalendarReadFailure,
  historyCalendarReadFailureCopy,
  historyCalendarTotals,
  historyDateLabel,
  historyDayLabel,
  historyWeekday,
  type HistoryCalendarReadFailureKind,
} from './history.model'
import './index.scss'

const dayNumber = (localDate: string) => String(Number(localDate.slice(-2)))

const HistoryPage = () => {
  const [calendar, setCalendar] = useState<HistoryCalendar>()
  const [selectedDate, setSelectedDate] = useState('')
  const [reading, setReading] = useState(true)
  const [readFailure, setReadFailure] = useState<HistoryCalendarReadFailureKind>()
  const calendarRef = useRef<HistoryCalendar>()
  const readInFlight = useRef(false)
  const pageActive = useRef(true)

  const load = async () => {
    if (readInFlight.current) return
    const hadSnapshot = Boolean(calendarRef.current)
    readInFlight.current = true
    setReading(true)
    setReadFailure(undefined)
    try {
      const result = await getHistoryCalendar(detectedTimeZone())
      if (!pageActive.current) return
      calendarRef.current = result
      setCalendar(result)
      setSelectedDate((current) =>
        result.series.some((day) => day.localDate === current) ? current : result.endDate,
      )
      if (!hadSnapshot) deferH5Focus('history-back', 350)
    } catch (error) {
      if (!pageActive.current) return
      setReadFailure(classifyHistoryCalendarReadFailure(error))
      deferH5Focus('history-calendar-read-retry', hadSnapshot ? 80 : 500)
    } finally {
      readInFlight.current = false
      if (pageActive.current) setReading(false)
    }
  }

  useEffect(
    () => () => {
      pageActive.current = false
    },
    [],
  )

  useDidShow(() => {
    pageActive.current = true
    void load()
  })

  const totals = useMemo(() => (calendar ? historyCalendarTotals(calendar) : undefined), [calendar])
  const readPhase = registerReadPhase({
    hasSnapshot: Boolean(calendar),
    busy: reading,
    hasFailure: Boolean(readFailure),
  })
  const readAuthorityReady = readPhase === 'ready'
  const readFailurePresentation = readFailure
    ? historyCalendarReadFailureCopy(readFailure, Boolean(calendar))
    : undefined
  const selected =
    calendar?.series.find((day) => day.localDate === selectedDate) ?? calendar?.series.at(-1)
  const weekdayHeadings = calendar?.series.slice(0, 7).map((day) => historyWeekday(day.localDate))

  const openBackfill = (page: 'records' | 'workouts' | 'nutrition') => {
    if (!readAuthorityReady || !selected || !calendar) return
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
              id="history-back"
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

          <View className="history-authority-toolbar">
            <Text>
              {calendar
                ? `已接受 ${calendar.startDate} — ${calendar.endDate} · ${calendar.timezone}`
                : '日期范围、时区与记录数量必须由服务成功返回后才能使用。'}
            </Text>
            <Button
              {...buttonActivationProps(() => void load(), !calendar || !readAuthorityReady)}
              id="history-calendar-refresh"
              className="history-authority-refresh"
              aria-label="更新 28 天历史日历"
            >
              {reading ? '核对中…' : '更新日历'}
            </Button>
          </View>

          {readPhase === 'initial-loading' ? (
            <View
              className="history-authority-state history-authority-state--checking"
              role="status"
            >
              <Text className="history-authority-state__eyebrow">
                CHECKING RANGE / 尚未建立结论
              </Text>
              <Text className="history-authority-state__title">正在核对 28 天历史日历</Text>
              <Text className="history-authority-state__copy">
                成功响应前，日期范围、空白日与记录数量都保持未知。
              </Text>
            </View>
          ) : readPhase === 'refreshing' ? (
            <View
              className="history-authority-state history-authority-state--checking"
              role="status"
            >
              <Text className="history-authority-state__eyebrow">
                CHECKING CURRENT / 保留上次日历
              </Text>
              <Text className="history-authority-state__title">正在复核当前历史日历</Text>
              <Text className="history-authority-state__copy">
                下方继续显示上次成功读取的证据；完成前，日期选择和三类回填入口保持冻结。
              </Text>
              <Text className="history-authority-state__retained">
                {calendar?.startDate} — {calendar?.endDate} · {calendar?.timezone}
              </Text>
            </View>
          ) : readFailurePresentation ? (
            <View className="history-authority-state" role="status">
              <Text className="history-authority-state__eyebrow">
                {readFailurePresentation.eyebrow}
              </Text>
              <Text className="history-authority-state__title">
                {readFailurePresentation.title}
              </Text>
              <Text className="history-authority-state__copy">
                {readFailurePresentation.detail}
              </Text>
              {calendar ? (
                <Text className="history-authority-state__retained">
                  保留 {calendar.startDate} — {calendar.endDate} · {calendar.timezone}
                </Text>
              ) : null}
              <Button
                {...buttonActivationProps(() => void load())}
                id="history-calendar-read-retry"
                className="history-authority-retry"
                aria-label="重新核对 28 天历史日历"
              >
                重新核对
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
                <Text className="history-zone">{calendar?.timezone ?? '时区待核对'}</Text>
              </View>

              {calendar ? (
                <>
                  <View className="history-weekdays" aria-hidden="true">
                    {weekdayHeadings?.map((label, index) => (
                      <Text key={`${label}-${index}`}>{label}</Text>
                    ))}
                  </View>
                  <View className="history-grid" aria-label="近 28 天记录日历">
                    {calendar.series.map((day) => (
                      <Button
                        {...buttonActivationProps(
                          () => setSelectedDate(day.localDate),
                          !readAuthorityReady,
                        )}
                        disabled={!readAuthorityReady}
                        className={`history-day ${day.hasRecords ? 'history-day--recorded' : ''} ${
                          selected?.localDate === day.localDate ? 'history-day--selected' : ''
                        }`}
                        key={day.localDate}
                        aria-label={historyDayLabel(day)}
                        aria-pressed={selected?.localDate === day.localDate}
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
                <View className="history-unverified">
                  <Text className="history-eyebrow">UNVERIFIED CALENDAR</Text>
                  <Text className="history-unverified__title">日历范围尚未核对</Text>
                  <Text className="history-unverified__copy">
                    这里不会把读取失败解释成 28 个空白日。核对成功后才会显示日期与证据标记。
                  </Text>
                </View>
              )}
            </View>

            <View className="history-aside">
              <View className="history-summary">
                <Text className="history-eyebrow">CURRENT RECORD COUNTS</Text>
                <Text className="history-panel-title">这 28 天留下的证据</Text>
                <View className="history-totals">
                  {[
                    ['有记录日', totals ? `${totals.recordedDays} / 28` : '—'],
                    ['身体/恢复', totals ? `${totals.healthRecordCount} 条` : '—'],
                    ['训练', totals ? `${totals.workoutCount} 次` : '—'],
                    ['饮食', totals ? `${totals.mealCount} 餐` : '—'],
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
                      {...buttonActivationProps(() => openBackfill('records'), !readAuthorityReady)}
                      disabled={!readAuthorityReady}
                      className="history-action history-action--primary"
                    >
                      补记身体/恢复
                    </Button>
                    <Button
                      {...buttonActivationProps(
                        () => openBackfill('workouts'),
                        !readAuthorityReady,
                      )}
                      disabled={!readAuthorityReady}
                      className="history-action"
                    >
                      补记训练
                    </Button>
                    <Button
                      {...buttonActivationProps(
                        () => openBackfill('nutrition'),
                        !readAuthorityReady,
                      )}
                      disabled={!readAuthorityReady}
                      className="history-action"
                    >
                      补记饮食
                    </Button>
                  </View>
                </View>
              ) : (
                <View className="history-selected history-selected--unknown">
                  <Text className="history-eyebrow">SELECTED LOCAL DAY</Text>
                  <Text className="history-selected__date">日期待核对</Text>
                  <Text className="history-selected__body">
                    服务返回可信的 28 天范围后，才能选择一天并带入回填入口。
                  </Text>
                </View>
              )}
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
