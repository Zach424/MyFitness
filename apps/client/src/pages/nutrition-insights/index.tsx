import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { NutritionInsight } from '@myfitness/contracts'

import {
  ObservationReadState,
  ObservationReadToolbar,
} from '../../components/observation-read-state'
import { buttonA11yProps, deferH5Focus } from '../../lib/accessibility'
import { getNutritionInsight } from '../../lib/api'
import {
  classifyObservationReadFailure,
  observationReadFailureCopy,
  observationReadPhase,
  type ObservationReadFailureKind,
} from '../../lib/observation-read'
import {
  nutritionEvidenceLevel,
  nutritionInsightDays,
  nutritionInsightMetricLabels,
  nutritionInsightTimezone,
  nutritionInsightValue,
  recordedDayAverage,
  type NutritionInsightMetric,
} from '../nutrition/nutrition-insight.model'
import './index.scss'

const metrics: NutritionInsightMetric[] = [
  'energyKcal',
  'proteinG',
  'carbohydrateG',
  'fatG',
  'fiberG',
]

const shortMetricLabels: Record<NutritionInsightMetric, string> = {
  energyKcal: '能量',
  proteinG: '蛋白质',
  carbohydrateG: '碳水',
  fatG: '脂肪',
  fiberG: '纤维',
}

const displayValue = (value: number | null) => {
  if (value === null) return '—'
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '')
}

const NutritionInsightsPage = () => {
  const [days, setDays] = useState<7 | 30 | 90>(30)
  const [metric, setMetric] = useState<NutritionInsightMetric>('energyKcal')
  const [insight, setInsight] = useState<NutritionInsight>()
  const [loading, setLoading] = useState(true)
  const [hasReadSnapshot, setHasReadSnapshot] = useState(false)
  const [readFailure, setReadFailure] = useState<ObservationReadFailureKind>()
  const readInFlight = useRef(false)
  const pageActive = useRef(true)

  const loadObservationAuthority = async () => {
    if (readInFlight.current) return
    const hadSnapshot = hasReadSnapshot
    readInFlight.current = true
    setLoading(true)
    setReadFailure(undefined)
    try {
      const result = await getNutritionInsight(nutritionInsightTimezone())
      if (!pageActive.current) return
      setInsight(result)
      setHasReadSnapshot(true)
      if (!hadSnapshot) deferH5Focus('nutrition-observation-back', 350)
    } catch (error) {
      if (!pageActive.current) return
      setReadFailure(classifyObservationReadFailure(error))
      deferH5Focus('nutrition-observation-read-retry', hadSnapshot ? 80 : 500)
    } finally {
      readInFlight.current = false
      if (pageActive.current) setLoading(false)
    }
  }

  useEffect(() => {
    pageActive.current = true
    void loadObservationAuthority()
    return () => {
      pageActive.current = false
    }
  }, [])

  const readPhase = observationReadPhase({
    hasSnapshot: hasReadSnapshot,
    busy: loading,
    hasFailure: Boolean(readFailure),
  })
  const readAuthorityReady = readPhase === 'ready'
  const readFailurePresentation = readFailure
    ? observationReadFailureCopy(readFailure, 'nutrition', hasReadSnapshot)
    : undefined

  const window = insight?.windows.find((candidate) => candidate.days === days)
  const points = useMemo(
    () => (insight ? nutritionInsightDays(insight, days) : []),
    [days, insight],
  )
  const maximum = Math.max(
    0,
    ...points.flatMap((point) => {
      const value = nutritionInsightValue(point, metric)
      return value === null ? [] : [value]
    }),
  )
  const average = window ? recordedDayAverage(window, metric) : null
  const recentDays = points.slice(-7).reverse()

  return (
    <View className="nutrition-observation-page">
      <ScrollView className="nutrition-observation-scroll" scrollY enhanced showScrollbar={false}>
        <View className="nutrition-observation-shell" aria-label="每日营养记录趋势">
          <View className="nutrition-observation-topbar">
            <Button
              {...buttonA11yProps}
              id="nutrition-observation-back"
              className="nutrition-observation-back"
              aria-label="返回餐食记录"
              onClick={() => void Taro.navigateBack()}
            >
              ←
            </Button>
            <View className="nutrition-observation-wordmark">
              <Text>衡迹</Text>
              <Text className="nutrition-observation-wordmark__en">NUTRITION OBSERVATION</Text>
            </View>
            <Text className="nutrition-observation-proof">当前餐次</Text>
          </View>

          <View className="nutrition-observation-intro">
            <Text className="nutrition-observation-eyebrow">
              LOCAL DAYS · EVIDENCE, NOT TARGETS
            </Text>
            <Text className="nutrition-observation-title">
              看见记录留下的形状，也看见没有记录的空白。
            </Text>
            <Text className="nutrition-observation-lead">
              每格是一个本地自然日。餐次更正或删除后会重新计算；空白只表示没有记录，不代表零摄入。这里不设目标、不判定达标，也不评价食物好坏。
            </Text>
          </View>

          <ObservationReadToolbar
            label="仅复核当前餐次投影；本地时间窗与营养项不会发起写入。"
            buttonId="nutrition-observation-refresh"
            buttonLabel="更新每日营养观察"
            busy={loading}
            disabled={!hasReadSnapshot || !readAuthorityReady}
            onRefresh={() => void loadObservationAuthority()}
          />

          <ObservationReadState
            phase={readPhase}
            subject="nutrition"
            presentation={readFailurePresentation}
            retainedLabel={`LOCAL DAYS ${hasReadSnapshot ? (insight?.series.length ?? 0) : '—'}`}
            retryId="nutrition-observation-read-retry"
            retryLabel="重新核对每日营养观察"
            onRetry={() => void loadObservationAuthority()}
          />

          <View className="nutrition-observation-card">
            <View className="nutrition-observation-windows" aria-label="观察时间范围">
              {([7, 30, 90] as const).map((windowDays) => (
                <Button
                  {...buttonA11yProps}
                  className={`nutrition-observation-window ${days === windowDays ? 'nutrition-observation-window--active' : ''}`}
                  key={windowDays}
                  aria-pressed={days === windowDays}
                  onClick={() => setDays(windowDays)}
                >
                  {windowDays} 天
                </Button>
              ))}
            </View>

            {loading && !hasReadSnapshot ? (
              <View className="nutrition-observation-empty">正在按本地日期整理餐次证据…</View>
            ) : insight && window ? (
              <>
                <View className="nutrition-observation-summary">
                  <View aria-label={`有记录日 ${window.recordedDays}`}>
                    <Text className="nutrition-observation-value metric">
                      {window.recordedDays}
                    </Text>
                    <Text>有记录日</Text>
                  </View>
                  <View aria-label={`无记录日 ${window.missingDays}`}>
                    <Text className="nutrition-observation-value metric">{window.missingDays}</Text>
                    <Text>无记录日</Text>
                  </View>
                  <View aria-label={`已保存餐次 ${window.mealCount}`}>
                    <Text className="nutrition-observation-value metric">{window.mealCount}</Text>
                    <Text>已保存餐次</Text>
                  </View>
                  <View
                    aria-label={`仅已记录日均 ${displayValue(average)} ${nutritionInsightMetricLabels[metric]}`}
                  >
                    <Text className="nutrition-observation-value metric">
                      {displayValue(average)}
                    </Text>
                    <Text>仅已记录日均 · {nutritionInsightMetricLabels[metric]}</Text>
                  </View>
                </View>

                <View className="nutrition-observation-metrics" aria-label="选择观察指标">
                  {metrics.map((candidate) => (
                    <Button
                      {...buttonA11yProps}
                      className={`nutrition-observation-metric ${metric === candidate ? 'nutrition-observation-metric--active' : ''}`}
                      key={candidate}
                      aria-pressed={metric === candidate}
                      onClick={() => setMetric(candidate)}
                    >
                      {shortMetricLabels[candidate]}
                    </Button>
                  ))}
                </View>

                <View className="nutrition-evidence-sheet">
                  <View className="nutrition-evidence-heading">
                    <View>
                      <Text className="nutrition-observation-eyebrow">EVIDENCE RIBBON</Text>
                      <Text className="nutrition-evidence-title">
                        {days} 天 · {nutritionInsightMetricLabels[metric]}
                      </Text>
                    </View>
                    <Text className="nutrition-evidence-timezone">{insight.timezone}</Text>
                  </View>
                  <View className="nutrition-evidence-grid">
                    {points.map((point) => {
                      const level = nutritionEvidenceLevel(point, metric, maximum)
                      const value = nutritionInsightValue(point, metric)
                      return (
                        <View
                          className={`nutrition-evidence-day nutrition-evidence-day--${level}`}
                          key={point.localDate}
                          aria-label={
                            point.hasEvidence
                              ? `${point.localDate}，${point.mealCount}餐，${shortMetricLabels[metric]}${displayValue(value)}`
                              : `${point.localDate}，没有餐次记录`
                          }
                        >
                          <Text>{point.localDate.slice(8)}</Text>
                        </View>
                      )
                    })}
                  </View>
                  <View className="nutrition-evidence-legend">
                    <Text>斜纹：无记录</Text>
                    <Text>圆点：该营养项未标注</Text>
                    <Text>颜色深浅：当期相对记录量</Text>
                  </View>
                </View>

                <View className="nutrition-observation-coverage">
                  <Text className="nutrition-observation-eyebrow">LABEL COVERAGE</Text>
                  <Text>
                    纤维有标注 {window.fiberKnownItemCount}/{window.itemCount}{' '}
                    个食物条目。未标注部分不会按 0 g 计入。
                  </Text>
                </View>

                <View className="nutrition-observation-ledger">
                  <Text className="nutrition-observation-eyebrow">RECENT LOCAL DAYS</Text>
                  {recentDays.map((point) => (
                    <View className="nutrition-observation-day-row" key={point.localDate}>
                      <Text className="metric">{point.localDate}</Text>
                      {point.hasEvidence ? (
                        <Text>
                          {point.mealCount} 餐 · {displayValue(point.nutrients.energyKcal)} kcal · P{' '}
                          {displayValue(point.nutrients.proteinG)} · C{' '}
                          {displayValue(point.nutrients.carbohydrateG)} · F{' '}
                          {displayValue(point.nutrients.fatG)}
                        </Text>
                      ) : (
                        <Text className="nutrition-observation-missing-copy">
                          无记录，不等于零摄入
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              </>
            ) : !hasReadSnapshot ? (
              <View className="nutrition-observation-empty">
                营养观察尚未核对；读取成功后才会区分有记录日与无记录日。
              </View>
            ) : null}
          </View>

          <Text className="nutrition-observation-safety">
            本页仅整理你保存的餐次快照，不推断完整摄入、营养状态或疾病风险。需要治疗性饮食建议时，请咨询具备资质的专业人员。
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}

export default NutritionInsightsPage
