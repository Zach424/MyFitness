import { useEffect, useState } from 'react'
import { Button, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { Dashboard, TodayEvidence } from '@myfitness/contracts'

import { buttonA11yProps } from '../../lib/accessibility'
import { getDashboard } from '../../lib/api'
import './index.scss'

const quickActions = [
  { key: 'body', glyph: '体', label: '身体' },
  { key: 'workout', glyph: '训', label: '训练' },
  { key: 'meal', glyph: '餐', label: '饮食' },
  { key: 'recovery', glyph: '恢', label: '恢复' },
] as const

const navItems = [
  { key: 'today', glyph: '今', label: '今天' },
  { key: 'record', glyph: '记', label: '记录' },
  { key: 'plan', glyph: '划', label: '计划' },
  { key: 'coach', glyph: '问', label: '教练' },
  { key: 'me', glyph: '我', label: '我的' },
] as const

const categoryLabels: Record<TodayEvidence['kind'], string> = {
  body: '身体',
  recovery: '恢复',
  workout: '训练',
  nutrition: '饮食',
}

const openRecords = () => void Taro.navigateTo({ url: '/pages/records/index' })
const openWorkouts = () => void Taro.navigateTo({ url: '/pages/workouts/index' })
const openNutrition = () => void Taro.navigateTo({ url: '/pages/nutrition/index' })
const openPlans = () => void Taro.navigateTo({ url: '/pages/plans/index' })

const timezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
  } catch {
    return 'Asia/Shanghai'
  }
}

const dateLabel = (value?: string) => {
  const date = value ? new Date(`${value}T12:00:00`) : new Date()
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(date)
}

const displayTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(
    new Date(value),
  )

const RailEntry = ({ item }: { item: TodayEvidence }) => (
  <View className="rail-entry rail-entry--confirmed">
    <View className="rail-entry__time metric">{displayTime(item.occurredAt)}</View>
    <View className="rail-entry__marker" aria-hidden="true">
      <View className="rail-entry__dot" />
    </View>
    <View className="rail-entry__content">
      <View className="rail-entry__heading">
        <Text className="rail-entry__category">{categoryLabels[item.kind]}</Text>
        <Text className="status status--confirmed">已确认</Text>
      </View>
      <View className="rail-entry__main">
        <Text className="rail-entry__title">{item.title}</Text>
        <Text className="rail-entry__value metric">{item.value}</Text>
      </View>
      <Text className="rail-entry__note">{item.note}</Text>
    </View>
  </View>
)

const IndexPage = () => {
  const [dashboard, setDashboard] = useState<Dashboard>()
  const [trendDays, setTrendDays] = useState<7 | 30 | 90>(7)
  const [feedback, setFeedback] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      try {
        setDashboard(await getDashboard(timezone()))
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : '今日数据暂时无法读取，请稍后重试。')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const readiness = dashboard?.readiness ?? {
    score: null,
    label: loading ? '正在整理记录' : '等待恢复记录',
    note: loading
      ? '正在读取已确认的身体、恢复、训练与饮食记录。'
      : '先完成一条记录，今日页会在这里整理真实证据。',
    factors: [],
  }
  const rail = dashboard?.today.items ?? []
  const trend = dashboard?.trends.find((item) => item.days === trendDays)
  const activeTicks = readiness.score === null ? 0 : Math.ceil(readiness.score / 20)

  return (
    <View className="today-page">
      <ScrollView className="today-scroll" scrollY enhanced showScrollbar={false}>
        <View className="today-shell">
          <View className="topbar">
            <View className="wordmark" aria-label="衡迹 MyFitness">
              <Text className="wordmark__cn">衡迹</Text>
              <Text className="wordmark__en">DAILY NOTE</Text>
            </View>
            <Button
              {...buttonA11yProps}
              className="profile-mark"
              aria-label="建立或更新个人资料"
              onClick={() => void Taro.navigateTo({ url: '/pages/onboarding/index' })}
            >
              陈
            </Button>
          </View>

          <View className="desktop-grid">
            <View className="desktop-grid__main">
              <View className="hero">
                <Text className="eyebrow">{dateLabel(dashboard?.today.date)}</Text>
                <Text className="hero__greeting">今天的真实记录</Text>
                <Text className="hero__title">
                  {rail.length ? '已经发生的，清楚可见' : '从第一条证据开始'}
                </Text>
                <Text className="hero__body">{readiness.note}</Text>
                <View className="readiness">
                  <View className="readiness__score metric">{readiness.score ?? '—'}</View>
                  <View className="readiness__copy">
                    <Text className="readiness__label">{readiness.label}</Text>
                    <Text className="readiness__hint">
                      {readiness.score === null
                        ? '没有恢复证据时不生成分数'
                        : '根据近 3 天已确认恢复记录等权整理'}
                    </Text>
                  </View>
                  <View className="readiness__ticks" aria-hidden="true">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <View
                        key={`readiness-${index}`}
                        className={`readiness__tick ${index < activeTicks ? 'readiness__tick--active' : ''}`}
                      />
                    ))}
                  </View>
                </View>
              </View>

              <View className="section rhythm-card">
                <View className="section-heading">
                  <View>
                    <Text className="section-heading__eyebrow">CONFIRMED EVIDENCE</Text>
                    <Text className="section-heading__title">今日节律</Text>
                  </View>
                  <View className="completion">
                    <Text className="completion__value metric">{rail.length}</Text>
                    <Text className="completion__label">条记录</Text>
                  </View>
                </View>

                {rail.length ? (
                  <View className="rail" aria-label="今日已确认记录">
                    {rail.map((item) => (
                      <RailEntry item={item} key={`${item.kind}-${item.id}`} />
                    ))}
                  </View>
                ) : (
                  <View className="today-empty" role="status">
                    <Text className="today-empty__title">今天还没有已确认记录</Text>
                    <Text className="today-empty__body">
                      从下方快速记录身体、训练、饮食或恢复。
                    </Text>
                  </View>
                )}

                {feedback ? (
                  <View className="inline-feedback" role="status">
                    <Text>{feedback}</Text>
                    <Button
                      {...buttonA11yProps}
                      className="inline-feedback__close"
                      onClick={() => setFeedback('')}
                    >
                      关闭
                    </Button>
                  </View>
                ) : null}
              </View>
            </View>

            <View className="desktop-grid__aside">
              <View className="section reason-card trend-card">
                <Text className="section-heading__eyebrow">RECORDED TREND</Text>
                <Text className="reason-card__title">记录趋势</Text>
                <Text className="reason-card__body">
                  只汇总已确认、未删除的数据；这些是观察窗口，不是目标或处方。
                </Text>
                <View className="trend-tabs">
                  {([7, 30, 90] as const).map((days) => (
                    <Button
                      {...buttonA11yProps}
                      className={`trend-tab ${trendDays === days ? 'trend-tab--active' : ''}`}
                      aria-pressed={trendDays === days}
                      key={days}
                      onClick={() => setTrendDays(days)}
                    >
                      {days} 天
                    </Button>
                  ))}
                </View>
                <View className="evidence-list">
                  {[
                    ['有记录天数', `${trend?.activeDays ?? 0} 天`],
                    ['身体/恢复', `${trend?.measurementCount ?? 0} 条`],
                    ['训练', `${trend?.workoutCount ?? 0} 次 · ${trend?.workoutVolumeKg ?? 0} kg`],
                    [
                      '饮食',
                      `${trend?.mealCount ?? 0} 餐 · ${Math.round(trend?.energyKcal ?? 0)} kcal`,
                    ],
                  ].map(([label, value]) => (
                    <View className="evidence" key={label}>
                      <Text className="evidence__label">{label}</Text>
                      <Text className="evidence__value metric">{value}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View className="section quick-card">
                <View className="quick-card__heading">
                  <Text className="section-heading__title">快速记录</Text>
                  <Text className="quick-card__hint">保存后会回到今日证据</Text>
                </View>
                <View className="quick-grid">
                  {quickActions.map((action) => (
                    <Button
                      {...buttonA11yProps}
                      className="quick-action"
                      key={action.key}
                      onClick={() => {
                        if (action.key === 'body' || action.key === 'recovery') openRecords()
                        else if (action.key === 'workout') openWorkouts()
                        else if (action.key === 'meal') openNutrition()
                      }}
                    >
                      <Text className="quick-action__glyph" aria-hidden="true">
                        {action.glyph}
                      </Text>
                      <Text>{action.label}</Text>
                    </Button>
                  ))}
                </View>
              </View>
            </View>
          </View>

          <Text className="safety-note">
            恢复分数和趋势是确定性记录摘要，不是医疗诊断或 AI 建议。
          </Text>
        </View>
      </ScrollView>

      <View className="bottom-nav" role="navigation" aria-label="主要导航">
        {navItems.map((item) => (
          <Button
            {...buttonA11yProps}
            className={`nav-item ${item.key === 'today' ? 'nav-item--active' : ''}`}
            key={item.key}
            aria-current={item.key === 'today' ? 'page' : undefined}
            onClick={() => {
              if (item.key === 'me') {
                void Taro.navigateTo({ url: '/pages/privacy/index' })
              } else if (item.key === 'record') {
                openRecords()
              } else if (item.key === 'plan') {
                openPlans()
              } else if (item.key !== 'today') {
                setFeedback(`${item.label}模块将在后续迭代接入。`)
              }
            }}
          >
            <Text className="nav-item__glyph" aria-hidden="true">
              {item.glyph}
            </Text>
            <Text>{item.label}</Text>
          </Button>
        ))}
      </View>
    </View>
  )
}

export default IndexPage
