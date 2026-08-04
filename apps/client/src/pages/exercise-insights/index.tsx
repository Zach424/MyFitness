import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { ExerciseInsight } from '@myfitness/contracts'

import { buttonA11yProps } from '../../lib/accessibility'
import { ApiError, getExerciseInsight, listWorkouts } from '../../lib/api'
import {
  exerciseInsightChoices,
  exerciseInsightMetric,
  exerciseInsightMetricLabel,
  exerciseInsightPoints,
  insightTimezone,
  type ExerciseInsightChoice,
} from '../workouts/exercise-insight.model'
import './index.scss'

const messageOf = (error: unknown) =>
  error instanceof ApiError || error instanceof Error ? error.message : '动作趋势加载失败'

const displayValue = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '')

const ExerciseInsightsPage = () => {
  const requestedKey = useRef(Taro.getCurrentInstance().router?.params.exerciseKey ?? '')
  const [choices, setChoices] = useState<ExerciseInsightChoice[]>([])
  const [exerciseKey, setExerciseKey] = useState('')
  const [days, setDays] = useState<7 | 30 | 90>(30)
  const [insight, setInsight] = useState<ExerciseInsight>()
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    let active = true
    void listWorkouts()
      .then((result) => {
        if (!active) return
        const nextChoices = exerciseInsightChoices(result.items)
        setChoices(nextChoices)
        setExerciseKey(
          nextChoices.some((choice) => choice.key === requestedKey.current)
            ? requestedKey.current
            : (nextChoices[0]?.key ?? ''),
        )
        if (!nextChoices.length) setLoading(false)
      })
      .catch((error: unknown) => {
        if (active) {
          setFeedback(messageOf(error))
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!exerciseKey) return
    let active = true
    setLoading(true)
    setFeedback('')
    setInsight(undefined)
    void getExerciseInsight(exerciseKey, insightTimezone())
      .then((result) => {
        if (active) setInsight(result)
      })
      .catch((error: unknown) => {
        if (active) setFeedback(messageOf(error))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [exerciseKey])

  const window = insight?.windows.find((candidate) => candidate.days === days)
  const metric = exerciseInsightMetric(insight?.identity?.trackingMode ?? null)
  const points = useMemo(
    () => (insight ? exerciseInsightPoints(insight, days) : []),
    [days, insight],
  )
  const maximum = Math.max(0, ...points.map((point) => point[metric]))

  return (
    <View className="exercise-observation-page">
      <ScrollView className="exercise-observation-scroll" scrollY enhanced showScrollbar={false}>
        <View className="exercise-observation-shell" aria-label="单动作历史与趋势">
          <View className="exercise-observation-topbar">
            <Button
              {...buttonA11yProps}
              className="exercise-observation-back"
              aria-label="返回训练记录"
              onClick={() => void Taro.navigateBack()}
            >
              ←
            </Button>
            <View className="exercise-observation-wordmark">
              <Text>衡迹</Text>
              <Text className="exercise-observation-wordmark__en">EXERCISE OBSERVATION</Text>
            </View>
            <Text className="exercise-observation-proof">仅完成组</Text>
          </View>

          <View className="exercise-observation-intro">
            <Text className="exercise-observation-eyebrow">STABLE ID · CORRECTION SAFE</Text>
            <Text className="exercise-observation-title">看清一个动作，怎样被你真实完成。</Text>
            <Text className="exercise-observation-lead">
              按动作身份分别观察，不按同名合并。编辑或删除训练后重新计算；这里只呈现记录趋势，不评价动作质量，也不自动建议加量。
            </Text>
          </View>

          <View className="exercise-observation-card">
            {choices.length ? (
              <>
                <Text className="exercise-observation-caption">选择动作</Text>
                <ScrollView
                  className="exercise-observation-choices"
                  scrollX
                  enhanced
                  showScrollbar={false}
                >
                  <View className="exercise-observation-choice-row">
                    {choices.map((choice) => (
                      <Button
                        {...buttonA11yProps}
                        className={`exercise-observation-choice ${exerciseKey === choice.key ? 'exercise-observation-choice--active' : ''}`}
                        key={choice.key}
                        aria-pressed={exerciseKey === choice.key}
                        onClick={() => setExerciseKey(choice.key)}
                      >
                        {choice.label}
                      </Button>
                    ))}
                  </View>
                </ScrollView>

                <View className="exercise-observation-windows" aria-label="观察时间范围">
                  {([7, 30, 90] as const).map((windowDays) => (
                    <Button
                      {...buttonA11yProps}
                      className={`exercise-observation-window ${days === windowDays ? 'exercise-observation-window--active' : ''}`}
                      key={windowDays}
                      aria-pressed={days === windowDays}
                      onClick={() => setDays(windowDays)}
                    >
                      {windowDays} 天
                    </Button>
                  ))}
                </View>

                {loading ? (
                  <View className="exercise-observation-empty">正在重算完成组证据…</View>
                ) : feedback ? (
                  <View className="exercise-observation-error" role="status">
                    {feedback}
                  </View>
                ) : insight?.identity && window ? (
                  <>
                    <View className="exercise-observation-heading">
                      <View>
                        <Text className="exercise-observation-eyebrow">LATEST SNAPSHOT</Text>
                        <Text className="exercise-observation-name">{insight.identity.name}</Text>
                      </View>
                      <Text className="exercise-observation-key metric">{insight.exerciseKey}</Text>
                    </View>

                    <View className="exercise-observation-summary">
                      <View>
                        <Text className="exercise-observation-value metric">
                          {window.sessionCount}
                        </Text>
                        <Text>有完成组的训练</Text>
                      </View>
                      <View>
                        <Text className="exercise-observation-value metric">
                          {window.completedSetCount}
                        </Text>
                        <Text>完成组</Text>
                      </View>
                      <View>
                        <Text className="exercise-observation-value metric">
                          {displayValue(window[metric])}
                        </Text>
                        <Text>{exerciseInsightMetricLabel[metric]}</Text>
                      </View>
                    </View>

                    {points.length ? (
                      <View className="exercise-observation-trend">
                        <View
                          className="exercise-observation-plot"
                          aria-label="最近单次完成量柱状图"
                        >
                          {points.map((point) => {
                            const value = point[metric]
                            const height = maximum
                              ? Math.max(8, Math.round((value / maximum) * 100))
                              : 8
                            return (
                              <View className="exercise-observation-column" key={point.workoutId}>
                                <View
                                  className="exercise-observation-bar-shell"
                                  aria-label={`${point.localDate} ${exerciseInsightMetricLabel[metric]} ${displayValue(value)}`}
                                >
                                  <View
                                    className="exercise-observation-bar"
                                    style={{ height: `${height}%` }}
                                  />
                                </View>
                                <Text>{point.localDate.slice(5)}</Text>
                              </View>
                            )
                          })}
                        </View>
                        <Text className="exercise-observation-chart-note">
                          每根柱只比较“{exerciseInsightMetricLabel[metric]}”，避免混合单位。
                        </Text>
                      </View>
                    ) : null}

                    <View className="exercise-observation-ledger">
                      <Text className="exercise-observation-caption">最近证据</Text>
                      {insight.series.slice(0, 6).map((point) => (
                        <View className="exercise-observation-point" key={point.workoutId}>
                          <View className="exercise-observation-point__heading">
                            <Text className="metric">{point.localDate}</Text>
                            <Text>训练 v{point.workoutRevision}</Text>
                          </View>
                          <Text>
                            完成 {point.completedSetCount}/{point.totalSetCount} 组 · 次数{' '}
                            {point.totalReps} · 训练量 {displayValue(point.volumeKg)} kg · 时长{' '}
                            {displayValue(point.activeMinutes)} min · 距离{' '}
                            {displayValue(point.distanceKm)} km
                          </Text>
                        </View>
                      ))}
                    </View>
                    {insight.hasMore ? (
                      <Text className="exercise-observation-bounded">
                        明细保留最近 180 次；7/30/90 天汇总仍按完整窗口证据计算。
                      </Text>
                    ) : null}
                  </>
                ) : (
                  <View className="exercise-observation-empty">
                    这个动作还没有已完成组。未完成组会保留在训练记录中，但不会被当作趋势证据。
                  </View>
                )}
              </>
            ) : feedback ? (
              <View className="exercise-observation-error" role="status">
                {feedback}
              </View>
            ) : (
              <View className="exercise-observation-empty">
                保存含有已完成组的训练后，这里会按动作身份显示 7 / 30 / 90 天观察。
              </View>
            )}
          </View>

          <Text className="exercise-observation-safety">
            趋势只反映记录证据；明显疼痛、胸部不适或晕厥时应停止训练并寻求专业帮助。
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}

export default ExerciseInsightsPage
