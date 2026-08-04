import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { HealthInsight, MetricCode } from '@myfitness/contracts'

import { buttonA11yProps } from '../../lib/accessibility'
import { ApiError, getHealthInsight, listHealthRecords } from '../../lib/api'
import {
  formatInsightValue,
  formatRecordedInsightValue,
  healthInsightChoices,
  healthInsightPoints,
  healthInsightTimezone,
  healthSourceLabels,
} from '../records/health-insight.model'
import { metricUiDefinitions, unitLabels } from '../records/record.model'
import './index.scss'

const messageOf = (error: unknown) =>
  error instanceof ApiError || error instanceof Error ? error.message : '指标观察加载失败'

const HealthInsightsPage = () => {
  const requestedMetric = useRef(Taro.getCurrentInstance().router?.params.metric ?? '')
  const [choices, setChoices] = useState<Array<{ metric: MetricCode; label: string }>>([])
  const [metric, setMetric] = useState<MetricCode>()
  const [days, setDays] = useState<7 | 30 | 90>(30)
  const [insight, setInsight] = useState<HealthInsight>()
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    let active = true
    void listHealthRecords()
      .then((result) => {
        if (!active) return
        const nextChoices = healthInsightChoices(result.items)
        setChoices(nextChoices)
        setMetric(
          nextChoices.some((choice) => choice.metric === requestedMetric.current)
            ? (requestedMetric.current as MetricCode)
            : nextChoices[0]?.metric,
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
    if (!metric) return
    let active = true
    setLoading(true)
    setFeedback('')
    setInsight(undefined)
    void getHealthInsight(metric, healthInsightTimezone())
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
  }, [metric])

  const window = insight?.windows.find((candidate) => candidate.days === days)
  const points = useMemo(() => (insight ? healthInsightPoints(insight, days) : []), [days, insight])
  const values = points.map((point) => point.canonicalValue)
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  const range = maximum - minimum
  const definition = metric ? metricUiDefinitions[metric] : undefined

  return (
    <View className="health-observation-page">
      <ScrollView className="health-observation-scroll" scrollY enhanced showScrollbar={false}>
        <View className="health-observation-shell" aria-label="身体与恢复单指标观察">
          <View className="health-observation-topbar">
            <Button
              {...buttonA11yProps}
              className="health-observation-back"
              aria-label="返回身体与恢复记录"
              onClick={() => void Taro.navigateBack()}
            >
              ←
            </Button>
            <View className="health-observation-wordmark">
              <Text>衡迹</Text>
              <Text className="health-observation-wordmark__en">METRIC OBSERVATION</Text>
            </View>
            <Text className="health-observation-proof">仅已确认</Text>
          </View>

          <View className="health-observation-intro">
            <Text className="health-observation-eyebrow">ONE METRIC · ONE CANONICAL UNIT</Text>
            <Text className="health-observation-title">只看同一个指标，保留每次记录时的尺度。</Text>
            <Text className="health-observation-lead">
              统计统一到该指标的标准单位，明细仍显示你当时填写的数值、单位、来源与版本。修改或删除后重新计算；这里不判断改善、达标或健康风险。
            </Text>
          </View>

          <View className="health-observation-card">
            {choices.length ? (
              <>
                <Text className="health-observation-caption">选择指标</Text>
                <ScrollView
                  className="health-observation-choices"
                  scrollX
                  enhanced
                  showScrollbar={false}
                >
                  <View className="health-observation-choice-row">
                    {choices.map((choice) => (
                      <Button
                        {...buttonA11yProps}
                        className={`health-observation-choice ${metric === choice.metric ? 'health-observation-choice--active' : ''}`}
                        key={choice.metric}
                        aria-pressed={metric === choice.metric}
                        onClick={() => setMetric(choice.metric)}
                      >
                        {choice.label}
                      </Button>
                    ))}
                  </View>
                </ScrollView>
                <View className="health-observation-windows" aria-label="观察时间范围">
                  {([7, 30, 90] as const).map((windowDays) => (
                    <Button
                      {...buttonA11yProps}
                      className={`health-observation-window ${days === windowDays ? 'health-observation-window--active' : ''}`}
                      key={windowDays}
                      aria-pressed={days === windowDays}
                      onClick={() => setDays(windowDays)}
                    >
                      {windowDays} 天
                    </Button>
                  ))}
                </View>

                {loading ? (
                  <View className="health-observation-empty">正在按指标重算当前证据…</View>
                ) : feedback ? (
                  <View className="health-observation-error" role="status">
                    {feedback}
                  </View>
                ) : insight && window && definition ? (
                  <>
                    <View className="health-observation-heading">
                      <View>
                        <Text className="health-observation-eyebrow">EXACT METRIC</Text>
                        <Text className="health-observation-name">{definition.label}</Text>
                      </View>
                      <Text className="health-observation-key metric">{insight.metric}</Text>
                    </View>
                    <View className="health-observation-summary">
                      <View aria-label={`已确认记录 ${window.recordCount}`}>
                        <Text className="health-observation-value metric">
                          {window.recordCount}
                        </Text>
                        <Text>已确认记录</Text>
                      </View>
                      <View aria-label={`记录日期 ${window.recordedDays}`}>
                        <Text className="health-observation-value metric">
                          {window.recordedDays}
                        </Text>
                        <Text>记录日期</Text>
                      </View>
                      <View>
                        <Text className="health-observation-value metric">
                          {window.statistics.average === null || !insight.canonicalUnit
                            ? '—'
                            : formatInsightValue(window.statistics.average, insight.canonicalUnit)}
                        </Text>
                        <Text>已记录值平均 · 非目标</Text>
                      </View>
                    </View>

                    {points.length && insight.canonicalUnit ? (
                      <View className="health-calibration-sheet">
                        <View className="health-calibration-heading">
                          <View>
                            <Text className="health-observation-eyebrow">CALIBRATION STRIP</Text>
                            <Text className="health-calibration-title">
                              {days} 天 · 标准单位 {unitLabels[insight.canonicalUnit]}
                            </Text>
                          </View>
                          <Text className="health-calibration-timezone">{insight.timezone}</Text>
                        </View>
                        <View
                          className="health-calibration-plot"
                          aria-label={`${definition.label}标准单位记录带`}
                        >
                          {points.map((point) => {
                            const height = range
                              ? 20 + ((point.canonicalValue - minimum) / range) * 70
                              : 55
                            return (
                              <View className="health-calibration-mark" key={point.recordId}>
                                <Text className="metric">{point.canonicalValue}</Text>
                                <View className="health-calibration-track">
                                  <View
                                    className="health-calibration-stem"
                                    style={{ height: `${height}px` }}
                                  />
                                </View>
                                <Text>{point.localDate.slice(5)}</Text>
                              </View>
                            )
                          })}
                        </View>
                        <Text className="health-calibration-note">
                          高低只表示这个指标的数值位置；不同指标、不同单位不会放在同一条记录带上。
                        </Text>
                      </View>
                    ) : (
                      <View className="health-observation-empty">
                        这个时间范围内还没有已确认记录。
                      </View>
                    )}

                    <View className="health-observation-ledger">
                      <Text className="health-observation-caption">最近证据</Text>
                      {insight.series.slice(0, 7).map((point) => (
                        <View className="health-observation-point" key={point.recordId}>
                          <View className="health-observation-point__heading">
                            <Text className="metric">{point.localDate}</Text>
                            <Text>记录 v{point.recordRevision}</Text>
                          </View>
                          <Text className="health-observation-point__value">
                            {formatRecordedInsightValue(point)}
                            {point.displayUnit === point.canonicalUnit
                              ? ''
                              : ` · 标准 ${formatInsightValue(point.canonicalValue, point.canonicalUnit)}`}
                          </Text>
                          <Text>
                            {healthSourceLabels[point.source.kind]} · 发生时区{' '}
                            {point.recordTimezone}
                          </Text>
                        </View>
                      ))}
                    </View>
                    {insight.hasMore ? (
                      <Text className="health-observation-bounded">
                        明细保留最近 180 条；窗口统计仍按完整当前证据计算。
                      </Text>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : feedback ? (
              <View className="health-observation-error" role="status">
                {feedback}
              </View>
            ) : (
              <View className="health-observation-empty">
                保存一条已确认的身体或恢复记录后，这里会按精确指标显示 7 / 30 / 90 天观察。AI
                候选不会进入统计。
              </View>
            )}
          </View>

          <Text className="health-observation-safety">
            主观恢复分数和身体测量只反映你的记录，不构成诊断。出现明显不适或异常症状时，请寻求专业帮助。
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}

export default HealthInsightsPage
