import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Checkbox, ScrollView, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import type {
  AiExplanation,
  PlanDecision,
  PlanFreshness,
  PlanWorkoutLink,
  WeeklyPlan,
  WeeklyPlanHistoryItem,
  WeeklyPlanListItem,
  Workout,
} from '@myfitness/contracts'
import { aiPlanConsentVersion } from '@myfitness/contracts/ai.constants'

import {
  buttonActivationProps,
  buttonA11yProps,
  checkboxA11yProps,
  keyboardActivationProps,
} from '../../lib/accessibility'
import {
  ApiError,
  decideWeeklyPlan,
  generateAiExplanation,
  generateWeeklyPlan,
  getAiExplanationHistory,
  getAiExplanationRequestStatus,
  getWeeklyPlanHistory,
  linkPlanWorkout,
  listWeeklyPlans,
  listWorkouts,
  unlinkPlanWorkout,
} from '../../lib/api'
import {
  describeWorkbenchFailure,
  type WorkbenchOperation,
  type WorkbenchRecovery,
} from '../../lib/workbench-recovery'
import {
  changedPlanSelections,
  currentPlanFreshness,
  defaultPlanWeekStart,
  planFreshnessNotice,
  planFreshnessProjectionKey,
  updatePlanSelection,
} from './plan.model'
import './index.scss'

type PlanActivity = NonNullable<WeeklyPlan['days'][number]['session']>['activities'][number]
type PlanDecisionKind = PlanDecision['decision']
type PlanSelections = PlanDecision['selections']

type PendingPlanGeneration = {
  weekStart: string
  basePlan?: Pick<WeeklyPlan, 'id' | 'revision'>
}

type PendingPlanDecision = {
  decision: PlanDecisionKind
  basePlan: WeeklyPlan
  selections: PlanSelections
}

type PendingSessionLinkWrite =
  | {
      kind: 'link'
      planId: string
      planRevision: number
      sessionDate: string
      workoutId: string
      workoutRevision: number
    }
  | {
      kind: 'unlink'
      planId: string
      linkId: string
      linkRevision: number
      sessionDate: string
    }

type PendingAiExplanationWrite = {
  planId: string
  planRevision: number
  idempotencyKey: string
}

const weekdayLabels: Record<WeeklyPlan['days'][number]['weekday'], string> = {
  mon: '一',
  tue: '二',
  wed: '三',
  thu: '四',
  fri: '五',
  sat: '六',
  sun: '日',
}

const statusLabels: Record<WeeklyPlan['status'], string> = {
  draft: '待决定',
  accepted: '已采用',
  modified: '已调整',
  skipped: '本周跳过',
}

const historyLabels: Record<WeeklyPlanHistoryItem['action'], string> = {
  generated: '生成初稿',
  accepted: '采用计划',
  modified: '保存替代动作',
  skipped: '本周暂不采用',
}

const intensityLabels = { easy: '轻松', moderate: '中等' } as const
const sessionKindLabels = { strength: '力量', cardio: '心肺', recovery: '恢复' } as const
const equipmentLabels: Record<string, string> = {
  bodyweight: '自重',
  dumbbells: '哑铃',
  barbell: '杠铃',
  machines: '器械',
  bands: '弹力带',
  cardio: '心肺器械',
}

const evidenceLabels: Record<string, string> = {
  plan_schedule: '可用时间',
  plan_experience: '训练经验',
  plan_recovery: '恢复依据',
  recent_activity: '近期活动',
  recent_workouts: '训练记录',
  recent_meals: '饮食记录',
  nutrition_focus: '饮食关注点',
}

const aiSourceLabels: Record<AiExplanation['source'], string> = {
  model: 'AI 解释',
  fixture: '本地演示解释',
  fallback: '确定性安全说明',
}

const requestKey = () =>
  `weekly-plan-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`

const aiRequestKey = () =>
  `ai-explanation-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`

const messageOf = (error: unknown) =>
  error instanceof ApiError || error instanceof Error ? error.message : '操作失败，请稍后重试'

const decisionOperation = (decision: PlanDecisionKind): WorkbenchOperation =>
  decision === 'accepted' ? 'plan_accept' : decision === 'modified' ? 'plan_modify' : 'plan_skip'

const planContainsSelections = (plan: WeeklyPlan, selections: PlanSelections) =>
  selections.every((selection) =>
    plan.days.some((day) =>
      day.session?.activities.some(
        (activity) =>
          activity.id === selection.activityId && activity.selectedOptionId === selection.optionId,
      ),
    ),
  )

const terminalPlanRecovery = (
  operation: WorkbenchOperation,
  message: string,
  actionLabel: string,
  preserves: WorkbenchRecovery['preserves'] = 'none',
): WorkbenchRecovery => ({
  operation,
  authority: 'terminal',
  failureKind: 'unexpected',
  eyebrow: 'AUTHORITATIVE STATE / 以服务端为准',
  message,
  actionLabel,
  preserves,
})

const shortDate = (value: string) => `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}`

const weekLabel = (weekStart: string) => {
  const start = new Date(`${weekStart}T12:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const format = (date: Date) => `${date.getMonth() + 1} 月 ${date.getDate()} 日`
  return `${format(start)}—${format(end)}`
}

const historyTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))

const ActivityCard = ({
  activity,
  disabled,
  onSelect,
}: {
  activity: PlanActivity
  disabled: boolean
  onSelect: (optionId: string) => void
}) => {
  const selected =
    activity.options.find((option) => option.id === activity.selectedOptionId) ??
    activity.options[0]!
  return (
    <View className="plan-activity">
      <View className="plan-activity__head">
        <View>
          <Text className="plan-activity__role">{activity.role.toUpperCase()}</Text>
          <Text className="plan-activity__title">{selected.title}</Text>
        </View>
        <Text className="plan-activity__dose metric">{selected.dose}</Text>
      </View>
      {selected.equipment.length ? (
        <Text className="plan-activity__equipment">
          {selected.equipment.map((item) => equipmentLabels[item] ?? item).join(' · ')}
        </Text>
      ) : null}
      {selected.note ? <Text className="plan-activity__note">{selected.note}</Text> : null}
      {activity.options.length > 1 ? (
        <View className="substitution-row" aria-label={`${selected.title}的替代动作`}>
          {activity.options.map((candidate) => (
            <Button
              {...buttonA11yProps}
              className={`substitution ${candidate.id === activity.selectedOptionId ? 'substitution--selected' : ''}`}
              aria-pressed={candidate.id === activity.selectedOptionId}
              aria-disabled={disabled}
              disabled={disabled}
              key={candidate.id}
              onClick={() => onSelect(candidate.id)}
            >
              {candidate.title}
            </Button>
          ))}
        </View>
      ) : null}
      {activity.safetyNote ? (
        <Text className="plan-activity__safety">{activity.safetyNote}</Text>
      ) : null}
    </View>
  )
}

const PlansPage = () => {
  const [savedPlan, setSavedPlan] = useState<WeeklyPlan>()
  const [draftPlan, setDraftPlan] = useState<WeeklyPlan>()
  const [freshness, setFreshness] = useState<PlanFreshness>()
  const [sessionLinks, setSessionLinks] = useState<PlanWorkoutLink[]>([])
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [history, setHistory] = useState<WeeklyPlanHistoryItem[]>([])
  const [historyNextCursor, setHistoryNextCursor] = useState<string | null>(null)
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false)
  const [aiHistory, setAiHistory] = useState<AiExplanation[]>([])
  const [aiConsent, setAiConsent] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [planRecovery, setPlanRecovery] = useState<WorkbenchRecovery>()
  const [aiRecovery, setAiRecovery] = useState<WorkbenchRecovery>()
  const pendingKey = useRef('')
  const pendingAiKey = useRef('')
  const pendingAiExplanation = useRef<PendingAiExplanationWrite>()
  const pendingGeneration = useRef<PendingPlanGeneration>()
  const pendingDecision = useRef<PendingPlanDecision>()
  const pendingSessionLink = useRef<PendingSessionLinkWrite>()
  const divergentProjection = useRef<WeeklyPlanListItem>()
  const savedPlanRef = useRef<WeeklyPlan>()
  const freshnessRef = useRef<PlanFreshness>()
  const historyGenerationRef = useRef(0)
  const refreshInFlight = useRef(false)
  const lastProjectionCheck = useRef(0)
  const projectionRefreshRef = useRef<(announce?: boolean, force?: boolean) => Promise<void>>(
    async () => undefined,
  )

  const setCurrentPlan = (
    plan: WeeklyPlan,
    nextFreshness: PlanFreshness = currentPlanFreshness(plan),
    nextSessionLinks: PlanWorkoutLink[] = [],
  ) => {
    savedPlanRef.current = plan
    freshnessRef.current = nextFreshness
    setSavedPlan(plan)
    setDraftPlan(plan)
    setFreshness(nextFreshness)
    setSessionLinks(nextSessionLinks)
    setAiConsent(false)
    setSelectedDate(
      plan.days.find((day) => day.session)?.date ??
        plan.days.find((day) => day.available)?.date ??
        plan.days[0]!.date,
    )
  }

  const applyProjectedPlan = (projected: WeeklyPlanListItem) => {
    const { freshness: nextFreshness, sessionLinks: nextSessionLinks, ...plan } = projected
    setCurrentPlan(plan, nextFreshness, nextSessionLinks)
    return plan
  }

  const resetPlanRecovery = () => {
    setPlanRecovery(undefined)
    pendingGeneration.current = undefined
    pendingDecision.current = undefined
    pendingSessionLink.current = undefined
    divergentProjection.current = undefined
  }

  const confirmPlan = async (
    plan: WeeklyPlan,
    message: string,
    nextFreshness: PlanFreshness = currentPlanFreshness(plan),
    nextSessionLinks: PlanWorkoutLink[] = [],
  ) => {
    setCurrentPlan(plan, nextFreshness, nextSessionLinks)
    try {
      await refreshPlanHistory(plan)
      setFeedback(message)
    } catch {
      setFeedback(`${message} 版本历史暂未刷新，可稍后使用“检查版本”重读。`)
    }
  }

  const refreshPlanHistory = async (plan: WeeklyPlan) => {
    const generation = ++historyGenerationRef.current
    const [planHistory, explanationHistory] = await Promise.all([
      getWeeklyPlanHistory(plan.id, { limit: 10 }),
      getAiExplanationHistory(plan.id),
    ])
    if (generation !== historyGenerationRef.current) return
    setHistory(planHistory.items)
    setHistoryNextCursor(planHistory.nextCursor)
    setAiHistory(explanationHistory)
  }

  const loadOlderPlanHistory = async () => {
    if (!savedPlan || !historyNextCursor || historyLoadingMore) return
    const generation = historyGenerationRef.current
    setHistoryLoadingMore(true)
    try {
      const page = await getWeeklyPlanHistory(savedPlan.id, {
        limit: 10,
        cursor: historyNextCursor,
      })
      if (generation !== historyGenerationRef.current) return
      setHistory((current) => [...current, ...page.items])
      setHistoryNextCursor(page.nextCursor)
    } catch (error) {
      setFeedback(messageOf(error))
    } finally {
      setHistoryLoadingMore(false)
    }
  }

  const refreshPlanProjection = async (announce = false, force = false) => {
    const current = savedPlanRef.current
    if (!current || refreshInFlight.current) return
    if (!force && Date.now() - lastProjectionCheck.current < 1_500) return
    refreshInFlight.current = true
    setRefreshing(true)
    try {
      const [plans, workoutList] = await Promise.all([listWeeklyPlans(), listWorkouts()])
      setWorkouts(workoutList.items)
      lastProjectionCheck.current = Date.now()
      const projected = plans.items.find((item) => item.id === current.id) ?? plans.items[0]
      if (!projected) return
      const { freshness: nextFreshness, sessionLinks: nextSessionLinks, ...plan } = projected
      const previousFreshness = freshnessRef.current
      const planChanged = plan.id !== current.id || plan.revision !== current.revision
      const freshnessChanged =
        planFreshnessProjectionKey(previousFreshness) !== planFreshnessProjectionKey(nextFreshness)

      if (planChanged || freshnessChanged) {
        setCurrentPlan(plan, nextFreshness, nextSessionLinks)
        if (planChanged) await refreshPlanHistory(plan)
      } else {
        freshnessRef.current = nextFreshness
        setFreshness(nextFreshness)
        setSessionLinks(nextSessionLinks)
      }

      if (previousFreshness?.state === 'current' && nextFreshness.state !== 'current') {
        setFeedback('检测到计划依据已变化；页面已冻结旧版本的采用、替换和 AI 解释操作。')
      } else if (announce) {
        setFeedback(
          nextFreshness.state === 'current'
            ? '已向服务端复核：这份计划仍是当前版本。'
            : '已向服务端复核：请先按页面提示处理这份旧计划。',
        )
      }
    } catch (error) {
      if (announce) setFeedback(messageOf(error))
    } finally {
      refreshInFlight.current = false
      setRefreshing(false)
    }
  }

  projectionRefreshRef.current = refreshPlanProjection

  useDidShow(() => {
    void projectionRefreshRef.current()
  })

  useEffect(() => {
    void (async () => {
      try {
        const [plans, workoutList] = await Promise.all([listWeeklyPlans(), listWorkouts()])
        setWorkouts(workoutList.items)
        const latest = plans.items[0]
        if (latest) {
          const { freshness: initialFreshness, sessionLinks: initialLinks, ...plan } = latest
          lastProjectionCheck.current = Date.now()
          setCurrentPlan(plan, initialFreshness, initialLinks)
          await refreshPlanHistory(plan)
        }
      } catch (error) {
        setFeedback(messageOf(error))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (process.env.TARO_ENV !== 'h5' || typeof window === 'undefined') return undefined
    const checkWhenVisible = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        void projectionRefreshRef.current()
      }
    }
    window.addEventListener('focus', checkWhenVisible)
    document.addEventListener('visibilitychange', checkWhenVisible)
    return () => {
      window.removeEventListener('focus', checkWhenVisible)
      document.removeEventListener('visibilitychange', checkWhenVisible)
    }
  }, [])

  const selectedDay = draftPlan?.days.find((day) => day.date === selectedDate)
  const selectedSessionLinks = sessionLinks.filter((link) => link.sessionDate === selectedDate)
  const selectedCurrentLink = selectedSessionLinks.find(
    (link) => link.planRevision === savedPlan?.revision,
  )
  const selectedPreviousLink = selectedSessionLinks.find(
    (link) => link.planRevision !== savedPlan?.revision,
  )
  const selections = useMemo(
    () => (savedPlan && draftPlan ? changedPlanSelections(savedPlan, draftPlan) : []),
    [savedPlan, draftPlan],
  )
  const dirty = selections.length > 0
  const planActionable = freshness?.canAcceptOrModify ?? false
  const aiActionable = freshness?.canExplainWithAi ?? false
  const planWriteBlocked = saving || Boolean(planRecovery)
  const freshnessNotice = freshness ? planFreshnessNotice(freshness) : null
  const toggleAiConsent = () => {
    if (aiActionable && !aiRecovery) setAiConsent((value) => !value)
  }

  const generate = async () => {
    setSaving(true)
    setFeedback('')
    const weekStart = defaultPlanWeekStart()
    if (!pendingGeneration.current) {
      pendingGeneration.current = {
        weekStart,
        ...(savedPlan?.weekStart === weekStart
          ? { basePlan: { id: savedPlan.id, revision: savedPlan.revision } }
          : {}),
      }
    }
    if (!pendingKey.current) pendingKey.current = requestKey()
    try {
      const plan = await generateWeeklyPlan({ weekStart }, pendingKey.current)
      pendingKey.current = ''
      resetPlanRecovery()
      await confirmPlan(plan, '周计划初稿已生成。先看依据和替代动作，再决定是否采用。')
    } catch (error) {
      setPlanRecovery(describeWorkbenchFailure('plan_generate', error))
    } finally {
      setSaving(false)
    }
  }

  const decide = async (decision: PlanDecisionKind) => {
    if (!savedPlan) return
    setSaving(true)
    setFeedback('')
    const submittedSelections = decision === 'modified' ? selections : []
    pendingDecision.current = {
      decision,
      basePlan: savedPlan,
      selections: submittedSelections,
    }
    try {
      const plan = await decideWeeklyPlan(savedPlan.id, {
        decision,
        expectedRevision: savedPlan.revision,
        selections: submittedSelections,
        note:
          decision === 'modified'
            ? '用户在计划页选择替代动作'
            : decision === 'skipped'
              ? '用户选择本周暂不采用'
              : '用户确认采用当前计划',
      })
      resetPlanRecovery()
      await confirmPlan(
        plan,
        decision === 'modified'
          ? '替代动作已保存，新版本已进入历史。'
          : decision === 'accepted'
            ? '计划已采用。训练记录仍以实际完成情况为准。'
            : '本周已标记为暂不采用，记录功能不受影响。',
        decision === 'skipped' && freshness ? freshness : currentPlanFreshness(plan),
        sessionLinks,
      )
    } catch (error) {
      setPlanRecovery(describeWorkbenchFailure(decisionOperation(decision), error))
    } finally {
      setSaving(false)
    }
  }

  const reconcilePlanWrite = async () => {
    const generation = pendingGeneration.current
    const decision = pendingDecision.current
    if (!generation && !decision) return
    const operation = generation ? 'plan_generate' : decisionOperation(decision!.decision)
    setSaving(true)
    setFeedback('')
    try {
      const plans = await listWeeklyPlans()
      if (generation) {
        const projected = plans.items.find((item) => item.weekStart === generation.weekStart)
        if (!projected) {
          pendingKey.current = ''
          pendingGeneration.current = undefined
          setPlanRecovery(
            terminalPlanRecovery(
              operation,
              '服务端没有这一周的新计划，因此没有成功证据。原请求不会自动重放；请返回后重新发起生成。',
              '返回重新生成',
            ),
          )
          return
        }
        const base = generation.basePlan
        if (base && projected.id !== base.id) {
          divergentProjection.current = projected
          setPlanRecovery(
            terminalPlanRecovery(
              operation,
              '服务端当前周计划已经由另一份权威版本占用。页面不会覆盖它，请先载入当前版本再决定下一步。',
              '载入服务端当前计划',
            ),
          )
          return
        }
        const plan = applyProjectedPlan(projected)
        pendingKey.current = ''
        resetPlanRecovery()
        await confirmPlan(
          plan,
          base && projected.revision === base.revision
            ? `核对完成：服务端仍是 v${projected.revision}，本次生成没有产生重复版本。`
            : `核对完成：服务端已有 v${projected.revision} 周计划，页面未重复生成。`,
          projected.freshness,
          projected.sessionLinks,
        )
        return
      }

      const pending = decision!
      const projected = plans.items.find((item) => item.id === pending.basePlan.id)
      if (!projected) {
        setPlanRecovery(
          terminalPlanRecovery(
            operation,
            '服务端已找不到原计划，无法确认这次决定。页面保留可见草稿，但不会自动重放。',
            '结束本次核对',
            pending.decision === 'modified' ? 'decision_input' : 'none',
          ),
        )
        return
      }
      const exactNextRevision = projected.revision === pending.basePlan.revision + 1
      const exactDecision = projected.status === pending.decision
      const exactSelections =
        pending.decision !== 'modified' || planContainsSelections(projected, pending.selections)
      if (exactNextRevision && exactDecision && exactSelections) {
        const plan = applyProjectedPlan(projected)
        resetPlanRecovery()
        await confirmPlan(
          plan,
          `核对完成：服务端 v${projected.revision} 已记录${
            pending.decision === 'accepted'
              ? '采用决定'
              : pending.decision === 'modified'
                ? '替代动作'
                : '本周跳过决定'
          }，页面未重复提交。`,
          projected.freshness,
          projected.sessionLinks,
        )
        return
      }
      if (projected.revision === pending.basePlan.revision) {
        resetPlanRecovery()
        setFeedback(
          `核对完成：服务端仍是 v${projected.revision}，没有本次决定的成功证据。页面未自动重放；请重新明确确认。`,
        )
        return
      }
      divergentProjection.current = projected
      setPlanRecovery(
        terminalPlanRecovery(
          operation,
          `服务端当前是 v${projected.revision}（${statusLabels[projected.status]}），与本次预期的 v${pending.basePlan.revision + 1} 不一致。页面不会覆盖并发更新。`,
          '载入服务端当前计划',
          pending.decision === 'modified' ? 'decision_input' : 'none',
        ),
      )
    } catch (error) {
      setPlanRecovery(describeWorkbenchFailure(operation, error))
    } finally {
      setSaving(false)
    }
  }

  const reconcileSessionLinkWrite = async () => {
    const pending = pendingSessionLink.current
    if (!pending) return
    const operation: WorkbenchOperation = pending.kind === 'link' ? 'plan_link' : 'plan_unlink'
    setSaving(true)
    setFeedback('')
    try {
      const plans = await listWeeklyPlans()
      const projected = plans.items.find((item) => item.id === pending.planId)
      if (!projected) {
        setPlanRecovery(
          terminalPlanRecovery(
            operation,
            '服务端当前计划列表中已没有原计划，无法确认这次关联操作。页面不会自动重放。',
            '结束本次核对',
            'link_intent',
          ),
        )
        return
      }

      if (pending.kind === 'link') {
        const exact = projected.sessionLinks.find(
          (link) =>
            link.planRevision === pending.planRevision &&
            link.sessionDate === pending.sessionDate &&
            link.workoutId === pending.workoutId &&
            link.workoutRevision === pending.workoutRevision,
        )
        if (exact) {
          applyProjectedPlan(projected)
          setSelectedDate(pending.sessionDate)
          resetPlanRecovery()
          setFeedback(
            `核对完成：${exact.workoutTitle} 已与 ${shortDate(exact.sessionDate)} 的计划 v${exact.planRevision} 精确关联；页面未重复提交。`,
          )
          return
        }
        const activeLinks = plans.items.flatMap((plan) => plan.sessionLinks)
        const conflicting = activeLinks.find(
          (link) =>
            link.workoutId === pending.workoutId ||
            (link.planId === pending.planId &&
              link.planRevision === pending.planRevision &&
              link.sessionDate === pending.sessionDate),
        )
        if (conflicting) {
          applyProjectedPlan(projected)
          setSelectedDate(pending.sessionDate)
          setPlanRecovery(
            terminalPlanRecovery(
              operation,
              `服务端已有另一条活动关联：${conflicting.workoutTitle}，计划 v${conflicting.planRevision}。页面已加载当前关联，不会覆盖或重复提交。`,
              '结束本次核对',
              'link_intent',
            ),
          )
          return
        }
        resetPlanRecovery()
        setFeedback(
          '核对完成：服务端没有这条精确关联的成功证据。页面未自动重放；如仍需要，请重新选择训练记录。',
        )
        return
      }

      const targetStillActive = plans.items.some((plan) =>
        plan.sessionLinks.some((link) => link.id === pending.linkId),
      )
      applyProjectedPlan(projected)
      setSelectedDate(pending.sessionDate)
      resetPlanRecovery()
      setFeedback(
        targetStillActive
          ? `核对完成：目标关联仍以 v${pending.linkRevision} 活动，未发现本次解除成功证据。页面未自动重放；如仍需要，请重新明确解除。`
          : '核对完成：目标关联已不再活动，页面已移除它；关闭历史仍保留，但当前列表不能证明具体关闭原因。',
      )
    } catch (error) {
      setPlanRecovery(describeWorkbenchFailure(operation, error))
    } finally {
      setSaving(false)
    }
  }

  const handlePlanRecoveryAction = async () => {
    if (!planRecovery) return
    if (planRecovery.authority !== 'terminal') {
      if (planRecovery.operation === 'plan_link' || planRecovery.operation === 'plan_unlink') {
        await reconcileSessionLinkWrite()
      } else {
        await reconcilePlanWrite()
      }
      return
    }
    const projected = divergentProjection.current
    pendingKey.current = ''
    resetPlanRecovery()
    if (projected) {
      const plan = applyProjectedPlan(projected)
      await confirmPlan(
        plan,
        `已载入服务端当前 v${projected.revision}；请重新检查后再作决定。`,
        projected.freshness,
        projected.sessionLinks,
      )
      return
    }
    setFeedback('本次未确认操作已经结束；如仍需要，请重新发起。')
  }

  const selectOption = (activityId: string, optionId: string) => {
    if (!planActionable || planRecovery) return
    setDraftPlan((current) =>
      current ? updatePlanSelection(current, activityId, optionId) : current,
    )
    setFeedback('')
  }

  const linkWorkout = async (workout: Workout) => {
    if (!savedPlan || !selectedDay?.session || planRecovery) return
    setSaving(true)
    setFeedback('')
    pendingSessionLink.current = {
      kind: 'link',
      planId: savedPlan.id,
      planRevision: savedPlan.revision,
      sessionDate: selectedDay.date,
      workoutId: workout.id,
      workoutRevision: workout.revision,
    }
    try {
      const link = await linkPlanWorkout(savedPlan.id, {
        expectedPlanRevision: savedPlan.revision,
        sessionDate: selectedDay.date,
        workoutId: workout.id,
        expectedWorkoutRevision: workout.revision,
      })
      resetPlanRecovery()
      setSessionLinks((current) => [link, ...current.filter((item) => item.id !== link.id)])
      await refreshPlanProjection(false, true)
      setFeedback('已按你的选择关联实际训练；计划和训练原版本都未被改写。')
    } catch (error) {
      setPlanRecovery(describeWorkbenchFailure('plan_link', error))
    } finally {
      setSaving(false)
    }
  }

  const unlinkWorkout = async (link: PlanWorkoutLink) => {
    if (!savedPlan || planRecovery) return
    setSaving(true)
    setFeedback('')
    pendingSessionLink.current = {
      kind: 'unlink',
      planId: savedPlan.id,
      linkId: link.id,
      linkRevision: link.revision,
      sessionDate: link.sessionDate,
    }
    try {
      await unlinkPlanWorkout(savedPlan.id, link.id, link.revision)
      resetPlanRecovery()
      setSessionLinks((current) => current.filter((item) => item.id !== link.id))
      await refreshPlanProjection(false, true)
      setFeedback('关联已解除；关闭时间仍保留在导出与审计记录中。')
    } catch (error) {
      setPlanRecovery(describeWorkbenchFailure('plan_unlink', error))
    } finally {
      setSaving(false)
    }
  }

  const finishAiExplanation = (explanation: AiExplanation, recovered = false) => {
    pendingAiKey.current = ''
    pendingAiExplanation.current = undefined
    setAiRecovery(undefined)
    setAiHistory((current) => [
      explanation,
      ...current.filter((item) => item.id !== explanation.id),
    ])
    setAiConsent(false)
    const isCurrentRevision = savedPlanRef.current?.revision === explanation.planRevision
    setFeedback(
      recovered
        ? isCurrentRevision
          ? `核对完成：原请求已生成计划 v${explanation.planRevision} 的边注；页面没有再次调用模型。`
          : `核对完成：原请求属于计划 v${explanation.planRevision}，已归入历史；当前版本没有被旧边注覆盖。`
        : explanation.source === 'model'
          ? 'AI 边注已生成；它只解释当前版本，没有修改计划。'
          : explanation.source === 'fixture'
            ? '本地演示边注已生成；接入生产模型后来源会明确标注。'
            : '模型结果不可用，已显示通过安全规则的确定性说明。',
    )
  }

  const generateExplanation = async () => {
    if (!savedPlan || !aiConsent || !aiActionable || aiRecovery) return
    setAiLoading(true)
    setFeedback('')
    if (!pendingAiKey.current) pendingAiKey.current = aiRequestKey()
    pendingAiExplanation.current = {
      planId: savedPlan.id,
      planRevision: savedPlan.revision,
      idempotencyKey: pendingAiKey.current,
    }
    try {
      const explanation = await generateAiExplanation(
        savedPlan.id,
        {
          expectedPlanRevision: savedPlan.revision,
          consent: {
            purpose: 'ai_plan_explanation',
            version: aiPlanConsentVersion,
            accepted: true,
          },
        },
        pendingAiKey.current,
      )
      finishAiExplanation(explanation)
    } catch (error) {
      setAiRecovery(describeWorkbenchFailure('plan_explain', error))
    } finally {
      setAiLoading(false)
    }
  }

  const reconcileAiExplanation = async () => {
    const pending = pendingAiExplanation.current
    if (!pending || !aiRecovery) return
    if (aiRecovery.authority === 'terminal') {
      pendingAiKey.current = ''
      pendingAiExplanation.current = undefined
      setAiRecovery(undefined)
      setAiConsent(false)
      setFeedback('本次 AI 解释尝试已经结束；如仍需要，请重新授权并发起。')
      return
    }

    setAiLoading(true)
    setFeedback('')
    try {
      const status = await getAiExplanationRequestStatus(pending.planId, pending.idempotencyKey)
      if (status.status === 'pending') {
        setAiRecovery({
          operation: 'plan_explain',
          authority: 'reconcile_required',
          failureKind: 'unexpected',
          eyebrow: 'RUN PENDING / 原请求仍在收敛',
          message: `服务端已确认计划 v${status.planRevision} 的原请求存在，但尚未形成可展示结果。页面不会重放模型调用；可稍后再次读取同一请求。`,
          actionLabel: '再次核对原请求',
          preserves: 'explanation_intent',
        })
        return
      }

      const explanation = status.explanation
      if (
        explanation.planId !== pending.planId ||
        explanation.planRevision !== pending.planRevision
      ) {
        setAiRecovery(
          terminalPlanRecovery(
            'plan_explain',
            '服务端返回的解释与原请求绑定的计划版本不一致，页面已拒绝展示，也不会重放模型调用。',
            '结束本次核对',
            'explanation_intent',
          ),
        )
        return
      }
      finishAiExplanation(explanation, true)
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 404) {
        setAiRecovery(
          terminalPlanRecovery(
            'plan_explain',
            `服务端不存在计划 v${pending.planRevision} 的这次原请求，因此没有成功证据。页面不会补发模型调用。`,
            '结束本次核对',
            'explanation_intent',
          ),
        )
      } else {
        setAiRecovery(describeWorkbenchFailure('plan_explain', error))
      }
    } finally {
      setAiLoading(false)
    }
  }

  const currentExplanation = aiActionable
    ? aiHistory.find((item) => item.planRevision === draftPlan?.revision)
    : undefined
  const pendingLinkIntent = pendingSessionLink.current
  const pendingLinkIntentCopy =
    pendingLinkIntent?.kind === 'link'
      ? `待核对：${
          workouts.find((workout) => workout.id === pendingLinkIntent.workoutId)?.title ??
          '所选训练'
        } ↔ ${shortDate(pendingLinkIntent.sessionDate)} 计划 v${pendingLinkIntent.planRevision}；核对前不会再次提交。`
      : pendingLinkIntent?.kind === 'unlink'
        ? `待核对：解除 ${shortDate(pendingLinkIntent.sessionDate)} 的 ${
            sessionLinks.find((link) => link.id === pendingLinkIntent.linkId)?.workoutTitle ??
            '所选训练'
          } 的活动关联；核对前不会再次提交。`
        : ''

  return (
    <View className="plans-page">
      <ScrollView className="plans-scroll" scrollY enhanced showScrollbar={false}>
        <View className="plans-shell">
          <View className="plans-topbar">
            <Button
              {...buttonA11yProps}
              className="plans-back"
              aria-label="返回今日"
              onClick={() => void Taro.navigateBack()}
            >
              ‹
            </Button>
            <View className="plans-wordmark">
              <Text>衡迹</Text>
              <Text className="plans-wordmark__en">WEEK FOLD</Text>
            </View>
            <Text className="plans-version metric">
              {draftPlan ? `v${draftPlan.revision}` : '—'}
            </Text>
          </View>

          <View className="plans-intro">
            <Text className="plans-eyebrow">DETERMINISTIC WEEK</Text>
            <Text className="plans-title">这一周，先留出余地</Text>
            <Text className="plans-lead">
              计划只使用你确认的时间、器材、经验和近况。它可以被采用、替换或跳过，不是自动生效的处方。
            </Text>
          </View>

          {feedback ? (
            <View className="plans-feedback" role="status">
              <Text>{feedback}</Text>
              <Button
                {...buttonA11yProps}
                className="plans-feedback__close"
                onClick={() => setFeedback('')}
              >
                关闭
              </Button>
            </View>
          ) : null}

          {planRecovery ? (
            <View className="plan-recovery" role="alert">
              <View className="plan-recovery__marker" aria-hidden="true">
                <Text className="metric">WRITE ?</Text>
                <Text>→</Text>
                <Text className="metric">READ</Text>
              </View>
              <View className="plan-recovery__body">
                <View>
                  <Text className="plans-eyebrow">{planRecovery.eyebrow}</Text>
                  <Text className="plan-recovery__title">先确认权威状态</Text>
                  <Text className="plan-recovery__copy">{planRecovery.message}</Text>
                  {planRecovery.preserves === 'decision_input' ? (
                    <Text className="plan-recovery__preserved">
                      当前替代动作选择仍留在本页；核对完成前不会再次提交。
                    </Text>
                  ) : planRecovery.preserves === 'link_intent' && pendingLinkIntentCopy ? (
                    <Text className="plan-recovery__preserved">{pendingLinkIntentCopy}</Text>
                  ) : null}
                </View>
                <Button
                  className="plan-recovery__action"
                  disabled={saving}
                  {...buttonActivationProps(() => void handlePlanRecoveryAction(), saving)}
                >
                  {saving ? '核对中…' : planRecovery.actionLabel}
                </Button>
              </View>
            </View>
          ) : null}

          {loading ? (
            <View className="plan-empty" role="status">
              <Text className="plan-empty__title">正在读取周计划</Text>
              <Text className="plan-empty__body">只读取当前账户已经确认的资料与记录。</Text>
            </View>
          ) : !draftPlan ? (
            <View className="plan-empty">
              <Text className="plan-empty__eyebrow">NO WEEK YET</Text>
              <Text className="plan-empty__title">先生成一份可审核的初稿</Text>
              <Text className="plan-empty__body">
                系统会读取个人资料和近 7
                天记录。风险问答未通过时不会生成；没有恢复记录时只安排轻松强度。
              </Text>
              <View className="plan-empty__actions">
                <Button
                  className="plan-primary"
                  disabled={planWriteBlocked}
                  {...buttonActivationProps(() => void generate(), planWriteBlocked)}
                >
                  {saving ? '正在生成…' : `生成 ${weekLabel(defaultPlanWeekStart())} 初稿`}
                </Button>
                <Button
                  {...buttonA11yProps}
                  className="plan-secondary"
                  onClick={() => void Taro.navigateTo({ url: '/pages/onboarding/index' })}
                >
                  检查个人资料
                </Button>
              </View>
            </View>
          ) : (
            <>
              <View className="plan-summary">
                <View>
                  <Text className="plans-eyebrow">{weekLabel(draftPlan.weekStart)}</Text>
                  <Text className="plan-summary__title">本周折页</Text>
                </View>
                <View className="plan-summary__states">
                  <Text className={`plan-state plan-state--${draftPlan.status}`}>
                    {statusLabels[draftPlan.status]}
                  </Text>
                  <Button
                    className="plan-refresh"
                    disabled={refreshing || planWriteBlocked}
                    {...buttonActivationProps(
                      () => void refreshPlanProjection(true, true),
                      refreshing || planWriteBlocked,
                    )}
                  >
                    {refreshing ? '复核中…' : '检查版本'}
                  </Button>
                </View>
              </View>

              {freshnessNotice && freshness ? (
                <View className={`plan-freshness plan-freshness--${freshness.state}`} role="alert">
                  <View className="plan-freshness__seam" aria-hidden="true">
                    {freshness.state === 'evidence_changed' ? (
                      <>
                        <Text className="metric">PLAN EVIDENCE</Text>
                        <Text>→</Text>
                        <Text className="metric">CURRENT RECORDS</Text>
                      </>
                    ) : (
                      <>
                        <Text className="metric">PLAN v{freshness.planOnboardingRevision}</Text>
                        <Text>→</Text>
                        <Text className="metric">
                          PROFILE{' '}
                          {freshness.currentOnboardingRevision
                            ? `v${freshness.currentOnboardingRevision}`
                            : '—'}
                        </Text>
                      </>
                    )}
                  </View>
                  <View className="plan-freshness__body">
                    <View>
                      <Text className="plans-eyebrow">{freshnessNotice.eyebrow}</Text>
                      <Text className="plan-freshness__title">{freshnessNotice.title}</Text>
                      <Text className="plan-freshness__copy">{freshnessNotice.body}</Text>
                    </View>
                    <Button
                      className="plan-freshness__action"
                      disabled={planWriteBlocked}
                      {...buttonActivationProps(() => {
                        if (freshness.recommendedAction === 'regenerate') void generate()
                        else void Taro.navigateTo({ url: '/pages/onboarding/index' })
                      }, planWriteBlocked)}
                    >
                      {saving ? '处理中…' : freshnessNotice.actionLabel}
                    </Button>
                  </View>
                </View>
              ) : null}

              <View className="week-fold" role="tablist" aria-label="选择计划日期">
                {draftPlan.days.map((day) => {
                  const recorded = sessionLinks.some(
                    (link) =>
                      link.sessionDate === day.date && link.planRevision === draftPlan.revision,
                  )
                  return (
                    <Button
                      className={`week-fold__day ${selectedDate === day.date ? 'week-fold__day--selected' : ''} ${day.session ? 'week-fold__day--planned' : ''} ${recorded ? 'week-fold__day--recorded' : ''}`}
                      aria-label={`${weekdayLabels[day.weekday]} ${shortDate(day.date)}${recorded ? '，已明确关联训练记录' : day.session ? '，有计划训练' : '，无计划训练'}`}
                      aria-selected={selectedDate === day.date}
                      disabled={Boolean(planRecovery)}
                      key={day.date}
                      {...buttonActivationProps(
                        () => setSelectedDate(day.date),
                        Boolean(planRecovery),
                      )}
                    >
                      <Text className="week-fold__weekday">{weekdayLabels[day.weekday]}</Text>
                      <Text className="week-fold__date metric">{shortDate(day.date)}</Text>
                      <Text className="week-fold__mark" aria-hidden="true">
                        {recorded ? '✓' : day.session ? '●' : '·'}
                      </Text>
                    </Button>
                  )
                })}
              </View>

              <View className="plans-grid">
                <View className="plans-grid__main">
                  <View className="day-sheet">
                    {selectedDay?.session ? (
                      <>
                        <View className="day-sheet__heading">
                          <View>
                            <Text className="plans-eyebrow">
                              {sessionKindLabels[selectedDay.session.kind]} ·{' '}
                              {intensityLabels[selectedDay.session.intensity]}
                            </Text>
                            <Text className="day-sheet__title">{selectedDay.session.title}</Text>
                          </View>
                          <Text className="day-sheet__minutes metric">
                            {selectedDay.session.plannedMinutes} MIN
                          </Text>
                        </View>
                        <Text className="day-sheet__note">{selectedDay.session.note}</Text>
                        <View className="activity-list">
                          {selectedDay.session.activities.map((activity) => (
                            <ActivityCard
                              activity={activity}
                              disabled={!planActionable || Boolean(planRecovery)}
                              key={activity.id}
                              onSelect={(optionId) => selectOption(activity.id, optionId)}
                            />
                          ))}
                        </View>
                        <View className="session-link-card">
                          <View className="session-link-card__heading">
                            <View>
                              <Text className="plans-eyebrow">PLANNED ↔ RECORDED</Text>
                              <Text className="session-link-card__title">实际训练关联</Text>
                            </View>
                            <Text className="session-link-card__state">
                              {selectedCurrentLink
                                ? '已记录'
                                : selectedPreviousLink
                                  ? '旧版关联'
                                  : '未关联'}
                            </Text>
                          </View>
                          {selectedCurrentLink ? (
                            <View className="session-link-card__linked">
                              <Text className="session-link-card__workout">
                                {selectedCurrentLink.workoutTitle}
                              </Text>
                              <Text className="session-link-card__meta metric">
                                PLAN v{selectedCurrentLink.planRevision} ↔ WORKOUT v
                                {selectedCurrentLink.workoutRevision}
                                {selectedCurrentLink.currentWorkoutRevision !==
                                selectedCurrentLink.workoutRevision
                                  ? ` · 当前训练 v${selectedCurrentLink.currentWorkoutRevision}`
                                  : ''}
                              </Text>
                              <Text className="session-link-card__copy">
                                这是你的明确选择，不是根据标题、日期或时长推测的完成情况。
                              </Text>
                              <Button
                                className="session-link-card__unlink"
                                disabled={planWriteBlocked}
                                {...buttonActivationProps(
                                  () => void unlinkWorkout(selectedCurrentLink),
                                  planWriteBlocked,
                                )}
                              >
                                解除关联
                              </Button>
                            </View>
                          ) : selectedPreviousLink ? (
                            <View className="session-link-card__linked">
                              <Text className="session-link-card__workout">
                                {selectedPreviousLink.workoutTitle}
                              </Text>
                              <Text className="session-link-card__copy">
                                这条记录绑定计划 v{selectedPreviousLink.planRevision}；当前是 v
                                {savedPlan?.revision}，系统不会自动迁移历史关联。
                              </Text>
                              <Button
                                className="session-link-card__unlink"
                                disabled={planWriteBlocked}
                                {...buttonActivationProps(
                                  () => void unlinkWorkout(selectedPreviousLink),
                                  planWriteBlocked,
                                )}
                              >
                                解除旧版关联
                              </Button>
                            </View>
                          ) : savedPlan?.status === 'accepted' && freshness?.state === 'current' ? (
                            <View>
                              <Text className="session-link-card__copy">
                                选择一条真实训练记录建立关联；系统不会预选或自动匹配。
                              </Text>
                              {workouts.length ? (
                                <View className="session-link-options">
                                  {workouts.slice(0, 5).map((workout) => (
                                    <Button
                                      className="session-link-option"
                                      disabled={planWriteBlocked}
                                      key={workout.id}
                                      {...buttonActivationProps(
                                        () => void linkWorkout(workout),
                                        planWriteBlocked,
                                      )}
                                    >
                                      <Text>{workout.title}</Text>
                                      <Text className="metric">
                                        {workout.status === 'completed' ? '全部完成' : '部分完成'} ·
                                        v{workout.revision}
                                      </Text>
                                    </Button>
                                  ))}
                                </View>
                              ) : (
                                <Button
                                  className="session-link-card__open-workouts"
                                  disabled={planWriteBlocked}
                                  {...buttonActivationProps(
                                    () => void Taro.navigateTo({ url: '/pages/workouts/index' }),
                                    planWriteBlocked,
                                  )}
                                >
                                  先记录一次训练
                                </Button>
                              )}
                            </View>
                          ) : (
                            <Text className="session-link-card__copy">
                              先采用当前且依据未变化的计划，再由你选择实际训练记录。
                            </Text>
                          )}
                        </View>
                      </>
                    ) : (
                      <View className="day-rest" role="status">
                        <Text className="plans-eyebrow">
                          {selectedDay?.available ? 'OPEN DAY' : 'NOT AVAILABLE'}
                        </Text>
                        <Text className="day-rest__title">不安排结构化训练</Text>
                        <Text className="day-rest__body">
                          {selectedDay?.available
                            ? '这一天留给恢复、散步或临时变化，不需要补做其他天的内容。'
                            : '个人资料中没有把这一天列为可训练日，因此计划保持空白。'}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View className="decision-bar">
                    <View>
                      <Text className="decision-bar__title">
                        {!planActionable
                          ? '这份旧计划只保留查看与“暂不采用”'
                          : dirty
                            ? `${selections.length} 项替代动作尚未保存`
                            : '先确认，再让计划生效'}
                      </Text>
                      <Text className="decision-bar__hint">
                        {planActionable
                          ? '每次决定都会留下独立版本。'
                          : '服务端复核通过前，不会提交采用或替换决定。'}
                      </Text>
                    </View>
                    <View className="decision-bar__actions">
                      <Button
                        className="plan-primary"
                        disabled={
                          planWriteBlocked ||
                          !planActionable ||
                          (!dirty && savedPlan?.status === 'accepted')
                        }
                        {...buttonActivationProps(
                          () => void decide(dirty ? 'modified' : 'accepted'),
                          planWriteBlocked ||
                            !planActionable ||
                            (!dirty && savedPlan?.status === 'accepted'),
                        )}
                      >
                        {saving
                          ? '正在保存…'
                          : dirty
                            ? '保存替代动作'
                            : savedPlan?.status === 'accepted'
                              ? '计划已采用'
                              : savedPlan?.status === 'modified'
                                ? '采用调整后计划'
                                : '采用这份计划'}
                      </Button>
                      <Button
                        className="plan-secondary"
                        disabled={planWriteBlocked || savedPlan?.status === 'skipped'}
                        {...buttonActivationProps(
                          () => void decide('skipped'),
                          planWriteBlocked || savedPlan?.status === 'skipped',
                        )}
                      >
                        {savedPlan?.status === 'skipped' ? '本周已跳过' : '本周暂不采用'}
                      </Button>
                    </View>
                  </View>
                </View>

                <View className="plans-grid__aside">
                  <View className="plan-aside-card">
                    <Text className="plans-eyebrow">WHY THIS WEEK</Text>
                    <Text className="plan-aside-card__title">生成依据</Text>
                    <View className="reason-list">
                      {draftPlan.reasons.map((reason) => (
                        <View className="reason-item" key={reason.code}>
                          <Text className="reason-item__label">{reason.label}</Text>
                          <Text className="reason-item__detail">{reason.detail}</Text>
                        </View>
                      ))}
                    </View>
                    <View className="evidence-strip">
                      <View className="evidence-strip__item">
                        <Text className="evidence-strip__label">近 7 天活跃</Text>
                        <Text className="evidence-strip__value metric">
                          {draftPlan.evidence.recentActiveDays} 天
                        </Text>
                      </View>
                      <View className="evidence-strip__item">
                        <Text className="evidence-strip__label">训练记录</Text>
                        <Text className="evidence-strip__value metric">
                          {draftPlan.evidence.recentWorkoutCount} 次
                        </Text>
                      </View>
                      <View className="evidence-strip__item">
                        <Text className="evidence-strip__label">恢复摘要</Text>
                        <Text className="evidence-strip__value metric">
                          {draftPlan.evidence.readinessScore ?? '—'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View className="plan-aside-card nutrition-focus-card">
                    <Text className="plans-eyebrow">FOOD FOCUS</Text>
                    <Text className="plan-aside-card__title">本周饮食关注点</Text>
                    <Text className="plan-aside-card__lead">
                      不计算热量缺口，也不把演示食物库当作处方。
                    </Text>
                    <View className="nutrition-focus-list">
                      {draftPlan.nutritionFocuses.map((focus) => (
                        <View className="nutrition-focus" key={focus.key}>
                          <Text className="nutrition-focus__title">{focus.title}</Text>
                          <Text className="nutrition-focus__action">{focus.action}</Text>
                          <Text className="nutrition-focus__alternatives">
                            可选做法：{focus.alternatives.join('；')}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  <View className="plan-aside-card ai-margin-card">
                    <View className="ai-margin-card__heading">
                      <View>
                        <Text className="plans-eyebrow">AI MARGIN NOTE</Text>
                        <Text className="plan-aside-card__title">计划边注</Text>
                      </View>
                      {currentExplanation ? (
                        <Text className={`ai-source ai-source--${currentExplanation.source}`}>
                          {aiSourceLabels[currentExplanation.source]}
                        </Text>
                      ) : null}
                    </View>

                    {aiRecovery ? (
                      <View className="ai-run-recovery" role="alert">
                        <Text className="ai-run-recovery__route metric">
                          ORIGINAL REQUEST → STATUS
                        </Text>
                        <Text className="plans-eyebrow">{aiRecovery.eyebrow}</Text>
                        <Text className="ai-run-recovery__title">只读取刚才那次运行</Text>
                        <Text className="ai-run-recovery__copy">{aiRecovery.message}</Text>
                        {pendingAiExplanation.current ? (
                          <Text className="ai-run-recovery__trace">
                            保留目标：计划 v{pendingAiExplanation.current.planRevision}
                            ；核对不会创建新授权、模型调用或计划版本。
                          </Text>
                        ) : null}
                        <Button
                          className="ai-run-recovery__action"
                          disabled={aiLoading}
                          {...buttonActivationProps(() => void reconcileAiExplanation(), aiLoading)}
                        >
                          {aiLoading ? '正在读取原请求…' : aiRecovery.actionLabel}
                        </Button>
                      </View>
                    ) : null}

                    {currentExplanation ? (
                      <View className="ai-note">
                        <Text className="ai-note__headline">
                          {currentExplanation.content.headline}
                        </Text>
                        <Text className="ai-note__overview">
                          {currentExplanation.content.overview}
                        </Text>
                        <View className="ai-note__highlights">
                          {currentExplanation.content.highlights.map((highlight, index) => (
                            <View
                              className="ai-note__highlight"
                              key={`${highlight.title}-${index}`}
                            >
                              <Text className="ai-note__highlight-title">{highlight.title}</Text>
                              <Text className="ai-note__highlight-detail">{highlight.detail}</Text>
                              <View className="ai-evidence-tags" aria-label="这条边注使用的依据">
                                {highlight.evidenceKeys.map((key) => (
                                  <Text className="ai-evidence-tag" key={key}>
                                    {evidenceLabels[key] ?? key}
                                  </Text>
                                ))}
                              </View>
                            </View>
                          ))}
                        </View>
                        <View className="ai-note__next">
                          <Text className="plans-eyebrow">NEXT REVIEW</Text>
                          <Text>{currentExplanation.content.nextStep}</Text>
                        </View>
                        <Text className="ai-note__safety">{currentExplanation.safetyNote}</Text>
                        <Text className="ai-note__trace metric">
                          PLAN V{currentExplanation.planRevision} ·{' '}
                          {currentExplanation.promptVersion.toUpperCase()}
                        </Text>
                      </View>
                    ) : (
                      <View className="ai-note-empty">
                        {aiHistory.length ? (
                          <Text className="ai-note-empty__stale">
                            计划版本已变化，旧边注不会继续显示为当前解释。
                          </Text>
                        ) : null}
                        <Text className="plan-aside-card__lead">
                          只发送当前计划的精简摘要，不含姓名、用户编号或未选动作。AI
                          只做解释，不能改动计划。
                        </Text>
                        {aiRecovery ? (
                          <Text className="ai-note-empty__recovery-hint">
                            本次授权已经绑定到上方原请求；核对结束前不会要求再次授权或发起新运行。
                          </Text>
                        ) : (
                          <>
                            <Button
                              {...checkboxA11yProps}
                              {...keyboardActivationProps(toggleAiConsent, !aiActionable)}
                              className={`ai-consent ${aiConsent ? 'ai-consent--checked' : ''}`}
                              disabled={!aiActionable}
                              aria-checked={aiConsent}
                              aria-disabled={!aiActionable}
                              aria-label="同意本次 AI 计划解释数据处理"
                              onClick={toggleAiConsent}
                            >
                              <Checkbox
                                checked={aiConsent}
                                value="ai-plan-explanation"
                                aria-hidden
                              />
                              <Text>
                                我同意本次将精简计划摘要发送给配置的 AI 服务，并记录本次授权版本。
                              </Text>
                            </Button>
                            <Button
                              {...buttonA11yProps}
                              className="ai-generate"
                              disabled={
                                !aiConsent ||
                                aiLoading ||
                                !aiActionable ||
                                draftPlan.status === 'skipped'
                              }
                              aria-disabled={
                                !aiConsent ||
                                aiLoading ||
                                !aiActionable ||
                                draftPlan.status === 'skipped'
                              }
                              onClick={() => void generateExplanation()}
                            >
                              {aiLoading ? '正在生成边注…' : '生成解释边注'}
                            </Button>
                            <Text className="ai-note-empty__hint">
                              本地默认使用演示 provider；生产模型、失败回退和版本来源会分别标注。
                            </Text>
                          </>
                        )}
                      </View>
                    )}
                  </View>

                  <View className="plan-aside-card history-card">
                    <Text className="plans-eyebrow">VERSION TRACE</Text>
                    <Text className="plan-aside-card__title">决定历史</Text>
                    <View className="plan-history-list">
                      {history.map((item) => (
                        <View className="plan-history" key={`${item.revision}-${item.changedAt}`}>
                          <View>
                            <Text className="plan-history__action">
                              {historyLabels[item.action]}
                            </Text>
                            <Text className="plan-history__time">
                              {historyTime(item.changedAt)}
                            </Text>
                          </View>
                          <Text className="plan-history__revision metric">v{item.revision}</Text>
                        </View>
                      ))}
                      {historyNextCursor ? (
                        <Button
                          {...buttonA11yProps}
                          className="record-page-more"
                          disabled={historyLoadingMore}
                          onClick={() => void loadOlderPlanHistory()}
                        >
                          {historyLoadingMore ? '正在载入…' : '继续载入更早决定'}
                        </Button>
                      ) : history.length ? (
                        <Text className="record-page-end">已载入全部决定版本</Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              </View>
            </>
          )}

          <Text className="plans-safety">
            计划是确定性生活方式安排，不是医疗诊断。出现明显疼痛、胸部不适、晕厥感或其他异常时停止活动并寻求专业帮助。
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}

export default PlansPage
