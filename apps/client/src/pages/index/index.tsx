import { useCallback, useRef, useState } from 'react'
import { Button, ScrollView, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import type { Dashboard, TodayEvidence, WeeklyPlanListItem } from '@myfitness/contracts'

import { buttonA11yProps, buttonActivationProps, deferH5Focus } from '../../lib/accessibility'
import { getDashboard, listWeeklyPlans } from '../../lib/api'
import { todayPlanReconciliation } from '../plans/plan.model'
import { CoachWorkbench } from './coach-workbench'
import { buildCoachSnapshot } from './coach.model'
import { MeHub } from './me-hub'
import {
  classifyTodayReadFailure,
  todayReadPhase,
  type TodayReadFailureKind,
} from './today-read.model'
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
const openHistory = () => void Taro.navigateTo({ url: '/pages/history/index' })

const openQuickAction = (key: (typeof quickActions)[number]['key']) => {
  if (key === 'body' || key === 'recovery') openRecords()
  else if (key === 'workout') openWorkouts()
  else openNutrition()
}

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

const readFailureCopy = (
  kind: TodayReadFailureKind,
  hasSnapshot: boolean,
): { eyebrow: string; title: string; detail: string } => {
  if (kind === 'offline') {
    return {
      eyebrow: 'OFFLINE / 连接未完成',
      title: hasSnapshot ? '更新没有完成，上次证据仍在' : '还没有读取到今日证据',
      detail: hasSnapshot
        ? '设备暂时无法连接服务。下面继续显示上次成功读取的已确认记录，不会把它们改成新状态。'
        : '设备暂时无法连接服务。页面不会把未知状态显示成零条记录。',
    }
  }
  if (kind === 'refused') {
    return {
      eyebrow: 'READ REFUSED / 读取被拒绝',
      title: hasSnapshot ? '服务拒绝了本次更新' : '服务没有接受本次读取',
      detail: hasSnapshot
        ? '下面保留上次成功读取的证据；请稍后手动重试，不会自动轮询。'
        : '今日证据仍是未知状态；请稍后手动重试，页面不会用空数据代替。',
    }
  }
  if (kind === 'service') {
    return {
      eyebrow: 'SERVICE PAUSED / 服务暂不可用',
      title: hasSnapshot ? '本次更新暂未完成' : '今日证据暂时无法读取',
      detail: hasSnapshot
        ? '下面保留上次成功读取的证据；服务恢复后可手动重试。'
        : '服务暂时没有返回证据；页面不会把这次失败解释成没有记录。',
    }
  }
  return {
    eyebrow: 'READ UNKNOWN / 结果未知',
    title: hasSnapshot ? '无法确认本次更新结果' : '无法确认今日证据状态',
    detail: hasSnapshot
      ? '下面保留上次成功读取的证据；需要手动重试后才能确认更新。'
      : '页面尚未取得可信快照，也不会显示推测的零值。',
  }
}

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
  const [plans, setPlans] = useState<WeeklyPlanListItem[]>([])
  const [activeView, setActiveView] = useState<'today' | 'coach' | 'me'>('today')
  const [trendDays, setTrendDays] = useState<7 | 30 | 90>(7)
  const [readFailure, setReadFailure] = useState<TodayReadFailureKind>()
  const [loading, setLoading] = useState(true)
  const dashboardRef = useRef<Dashboard>()
  const loadingRef = useRef(false)

  const readToday = useCallback(async () => {
    if (loadingRef.current) return
    const hadSnapshot = Boolean(dashboardRef.current)
    loadingRef.current = true
    setLoading(true)
    setReadFailure(undefined)
    try {
      const [nextDashboard, nextPlans] = await Promise.all([
        getDashboard(timezone()),
        listWeeklyPlans(),
      ])
      dashboardRef.current = nextDashboard
      setDashboard(nextDashboard)
      setPlans(nextPlans.items)
    } catch (error) {
      setReadFailure(classifyTodayReadFailure(error))
      if (!hadSnapshot) deferH5Focus('today-read-retry', 80)
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [])

  useDidShow(() => void readToday())

  const hasSnapshot = Boolean(dashboard)
  const readPhase = todayReadPhase({
    hasSnapshot,
    busy: loading,
    hasFailure: Boolean(readFailure),
  })
  const failureCopy = readFailure ? readFailureCopy(readFailure, hasSnapshot) : undefined
  const coachSnapshot = dashboard ? buildCoachSnapshot(dashboard, plans) : undefined

  const readiness = dashboard?.readiness ?? {
    score: null,
    label: loading ? '正在整理记录' : readFailure ? '今日证据尚未读取' : '等待恢复记录',
    note: loading
      ? '正在读取已确认的身体、恢复、训练与饮食记录。'
      : readFailure
        ? '证据读取完成后才会显示今日记录、恢复摘要与趋势。'
        : '先完成一条记录，今日页会在这里整理真实证据。',
    factors: [],
  }
  const rail = dashboard?.today.items ?? []
  const planReconciliation = dashboard
    ? todayPlanReconciliation(plans, dashboard.today.date)
    : undefined
  const trend = dashboard?.trends.find((item) => item.days === trendDays)
  const activeTicks = readiness.score === null ? 0 : Math.ceil(readiness.score / 20)

  const activateNavigation = (key: (typeof navItems)[number]['key']) => {
    if (key === 'today') setActiveView('today')
    else if (key === 'coach') setActiveView('coach')
    else if (key === 'me') setActiveView('me')
    else if (key === 'record') openRecords()
    else if (key === 'plan') openPlans()
  }

  return (
    <View className="today-page">
      <ScrollView className="today-scroll" scrollY enhanced showScrollbar={false}>
        {activeView === 'coach' ? (
          <CoachWorkbench
            snapshot={coachSnapshot}
            phase={readPhase}
            failure={readFailure}
            loading={loading}
            onRetry={() => void readToday()}
            onClose={() => setActiveView('today')}
          />
        ) : null}
        {activeView === 'me' ? <MeHub onClose={() => setActiveView('today')} /> : null}
        <View
          className="today-shell"
          style={activeView !== 'today' ? { display: 'none' } : undefined}
        >
          <View className="topbar">
            <View className="wordmark" aria-label="衡迹 MyFitness">
              <Text className="wordmark__cn">衡迹</Text>
              <Text className="wordmark__en">DAILY NOTE</Text>
            </View>
            <View className="topbar__actions">
              <Button
                id="today-refresh"
                className="today-refresh"
                aria-label={loading ? '今日证据正在读取' : '手动更新今日证据'}
                {...buttonActivationProps(() => void readToday(), loading)}
              >
                {loading ? (hasSnapshot ? '正在更新' : '正在读取') : '更新证据'}
              </Button>
              <Button
                {...buttonA11yProps}
                className="profile-mark"
                aria-label="建立或更新个人资料"
                onClick={() => void Taro.navigateTo({ url: '/pages/onboarding/index' })}
              >
                陈
              </Button>
            </View>
          </View>

          <View className="desktop-grid">
            <View className="desktop-grid__main">
              <View className="hero">
                <Text className="eyebrow">{dateLabel(dashboard?.today.date)}</Text>
                <Text className="hero__greeting">今天的真实记录</Text>
                <Text className="hero__title">
                  {hasSnapshot
                    ? rail.length
                      ? '已经发生的，清楚可见'
                      : '从第一条证据开始'
                    : readPhase === 'initial-loading'
                      ? '正在读取今日证据'
                      : '今日证据尚未读取'}
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

              {readPhase === 'refreshing' ? (
                <View className="today-read-state today-read-state--refreshing" role="status">
                  <Text className="today-read-state__eyebrow">REFRESHING / 保留已有证据</Text>
                  <Text className="today-read-state__title">正在核对最新记录</Text>
                  <Text className="today-read-state__detail">
                    更新完成前，下面继续显示上次成功读取的已确认记录。
                  </Text>
                </View>
              ) : failureCopy ? (
                <View className={`today-read-state today-read-state--${readPhase}`} role="status">
                  <Text className="today-read-state__eyebrow">{failureCopy.eyebrow}</Text>
                  <Text className="today-read-state__title">{failureCopy.title}</Text>
                  <Text className="today-read-state__detail">{failureCopy.detail}</Text>
                  <Button
                    id="today-read-retry"
                    className="today-read-state__retry"
                    aria-label="重新读取今日证据"
                    {...buttonActivationProps(() => void readToday(), loading)}
                  >
                    重新读取
                  </Button>
                </View>
              ) : null}

              {planReconciliation?.day.session ? (
                <View
                  className={`today-plan-card today-plan-card--${planReconciliation.state}`}
                  aria-label={`今日计划训练，${planReconciliation.state === 'recorded' ? '已明确关联实际训练' : '尚未关联实际训练'}`}
                >
                  <View className="today-plan-card__heading">
                    <View>
                      <Text className="eyebrow">PLANNED ↔ RECORDED</Text>
                      <Text className="today-plan-card__title">
                        {planReconciliation.day.session.title}
                      </Text>
                    </View>
                    <Text className="today-plan-card__state">
                      {planReconciliation.state === 'recorded' ? '已记录' : '待记录'}
                    </Text>
                  </View>
                  <Text className="today-plan-card__meta metric">
                    PLAN v{planReconciliation.plan.revision} ·{' '}
                    {planReconciliation.day.session.plannedMinutes} MIN
                  </Text>
                  {planReconciliation.link ? (
                    <Text className="today-plan-card__actual">
                      实际：{planReconciliation.link.workoutTitle} ·{' '}
                      {planReconciliation.link.workoutStatus === 'completed'
                        ? '全部完成'
                        : '部分完成'}
                      {' · '}WORKOUT v{planReconciliation.link.currentWorkoutRevision}
                    </Text>
                  ) : (
                    <Text className="today-plan-card__actual">
                      只有你在计划页主动选择训练记录后，这里才会显示“已记录”。
                    </Text>
                  )}
                  <Button
                    {...buttonA11yProps}
                    className="today-plan-card__action"
                    onClick={openPlans}
                  >
                    {planReconciliation.state === 'recorded' ? '查看关联' : '去选择实际记录'}
                  </Button>
                </View>
              ) : null}

              <View className="section rhythm-card">
                <View className="section-heading">
                  <View>
                    <Text className="section-heading__eyebrow">CONFIRMED EVIDENCE</Text>
                    <Text className="section-heading__title">今日节律</Text>
                  </View>
                  <View className="completion">
                    <Text className="completion__value metric">
                      {hasSnapshot ? rail.length : '—'}
                    </Text>
                    <Text className="completion__label">条记录</Text>
                  </View>
                </View>

                {!hasSnapshot ? (
                  <View className="today-empty today-empty--unknown" role="status">
                    <Text className="today-empty__title">
                      {readPhase === 'initial-loading'
                        ? '正在读取已确认记录'
                        : '记录数量仍是未知状态'}
                    </Text>
                    <Text className="today-empty__body">
                      {readPhase === 'initial-loading'
                        ? '读取完成后才会显示今日节律与记录数量。'
                        : '读取失败不等于今天没有记录；请使用上方重新读取。'}
                    </Text>
                  </View>
                ) : rail.length ? (
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
              </View>
            </View>

            <View className="desktop-grid__aside">
              <View className="section reason-card trend-card">
                <Text className="section-heading__eyebrow">RECORDED TREND</Text>
                <Text className="reason-card__title">记录趋势</Text>
                <Text className="reason-card__body">
                  只汇总已确认、未删除的数据；这些是观察窗口，不是目标或处方。
                </Text>
                <Button {...buttonA11yProps} className="text-action" onClick={openHistory}>
                  打开 28 天历史日历 →
                </Button>
                <View className="trend-tabs">
                  {([7, 30, 90] as const).map((days) => (
                    <Button
                      className={`trend-tab ${trendDays === days ? 'trend-tab--active' : ''}`}
                      aria-pressed={trendDays === days}
                      key={days}
                      {...buttonActivationProps(() => setTrendDays(days), !hasSnapshot)}
                    >
                      {days} 天
                    </Button>
                  ))}
                </View>
                <View className="evidence-list">
                  {[
                    ['有记录天数', hasSnapshot ? `${trend?.activeDays ?? 0} 天` : '—'],
                    ['身体/恢复', hasSnapshot ? `${trend?.measurementCount ?? 0} 条` : '—'],
                    [
                      '训练',
                      hasSnapshot
                        ? `${trend?.workoutCount ?? 0} 次 · ${trend?.workoutVolumeKg ?? 0} kg`
                        : '—',
                    ],
                    [
                      '饮食',
                      hasSnapshot
                        ? `${trend?.mealCount ?? 0} 餐 · ${Math.round(trend?.energyKcal ?? 0)} kcal`
                        : '—',
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
                      {...buttonActivationProps(() => openQuickAction(action.key))}
                      className="quick-action"
                      key={action.key}
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
            {...buttonActivationProps(() => activateNavigation(item.key))}
            className={`nav-item ${item.key === activeView ? 'nav-item--active' : ''}`}
            key={item.key}
            aria-current={item.key === activeView ? 'page' : undefined}
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
