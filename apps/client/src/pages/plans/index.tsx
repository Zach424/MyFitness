import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Checkbox, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import {
  aiPlanConsentVersion,
  type AiExplanation,
  type WeeklyPlan,
  type WeeklyPlanHistoryItem,
} from '@myfitness/contracts'

import { buttonA11yProps, checkboxA11yProps } from '../../lib/accessibility'
import {
  ApiError,
  decideWeeklyPlan,
  generateAiExplanation,
  generateWeeklyPlan,
  getAiExplanationHistory,
  getWeeklyPlanHistory,
  listWeeklyPlans,
} from '../../lib/api'
import { changedPlanSelections, defaultPlanWeekStart, updatePlanSelection } from './plan.model'
import './index.scss'

type PlanActivity = NonNullable<WeeklyPlan['days'][number]['session']>['activities'][number]

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
  onSelect,
}: {
  activity: PlanActivity
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
  const [history, setHistory] = useState<WeeklyPlanHistoryItem[]>([])
  const [aiHistory, setAiHistory] = useState<AiExplanation[]>([])
  const [aiConsent, setAiConsent] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const pendingKey = useRef('')
  const pendingAiKey = useRef('')

  const setCurrentPlan = (plan: WeeklyPlan) => {
    setSavedPlan(plan)
    setDraftPlan(plan)
    setSelectedDate(
      plan.days.find((day) => day.session)?.date ??
        plan.days.find((day) => day.available)?.date ??
        plan.days[0]!.date,
    )
  }

  const refreshPlanHistory = async (plan: WeeklyPlan) => {
    const [planHistory, explanationHistory] = await Promise.all([
      getWeeklyPlanHistory(plan.id),
      getAiExplanationHistory(plan.id),
    ])
    setHistory(planHistory)
    setAiHistory(explanationHistory)
  }

  useEffect(() => {
    void (async () => {
      try {
        const plans = await listWeeklyPlans()
        const latest = plans.items[0]
        if (latest) {
          setCurrentPlan(latest)
          await refreshPlanHistory(latest)
        }
      } catch (error) {
        setFeedback(messageOf(error))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const selectedDay = draftPlan?.days.find((day) => day.date === selectedDate)
  const selections = useMemo(
    () => (savedPlan && draftPlan ? changedPlanSelections(savedPlan, draftPlan) : []),
    [savedPlan, draftPlan],
  )
  const dirty = selections.length > 0

  const generate = async () => {
    setSaving(true)
    setFeedback('')
    if (!pendingKey.current) pendingKey.current = requestKey()
    try {
      const plan = await generateWeeklyPlan(
        { weekStart: defaultPlanWeekStart() },
        pendingKey.current,
      )
      pendingKey.current = ''
      setCurrentPlan(plan)
      await refreshPlanHistory(plan)
      setFeedback('周计划初稿已生成。先看依据和替代动作，再决定是否采用。')
    } catch (error) {
      setFeedback(messageOf(error))
    } finally {
      setSaving(false)
    }
  }

  const decide = async (decision: 'accepted' | 'modified' | 'skipped') => {
    if (!savedPlan) return
    setSaving(true)
    setFeedback('')
    try {
      const plan = await decideWeeklyPlan(savedPlan.id, {
        decision,
        expectedRevision: savedPlan.revision,
        selections: decision === 'modified' ? selections : [],
        note:
          decision === 'modified'
            ? '用户在计划页选择替代动作'
            : decision === 'skipped'
              ? '用户选择本周暂不采用'
              : '用户确认采用当前计划',
      })
      setCurrentPlan(plan)
      await refreshPlanHistory(plan)
      setFeedback(
        decision === 'modified'
          ? '替代动作已保存，新版本已进入历史。'
          : decision === 'accepted'
            ? '计划已采用。训练记录仍以实际完成情况为准。'
            : '本周已标记为暂不采用，记录功能不受影响。',
      )
    } catch (error) {
      setFeedback(messageOf(error))
    } finally {
      setSaving(false)
    }
  }

  const selectOption = (activityId: string, optionId: string) => {
    setDraftPlan((current) =>
      current ? updatePlanSelection(current, activityId, optionId) : current,
    )
    setFeedback('')
  }

  const generateExplanation = async () => {
    if (!savedPlan || !aiConsent) return
    setAiLoading(true)
    setFeedback('')
    if (!pendingAiKey.current) pendingAiKey.current = aiRequestKey()
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
      pendingAiKey.current = ''
      setAiHistory((current) => [
        explanation,
        ...current.filter((item) => item.id !== explanation.id),
      ])
      setAiConsent(false)
      setFeedback(
        explanation.source === 'model'
          ? 'AI 边注已生成；它只解释当前版本，没有修改计划。'
          : explanation.source === 'fixture'
            ? '本地演示边注已生成；接入生产模型后来源会明确标注。'
            : '模型结果不可用，已显示通过安全规则的确定性说明。',
      )
    } catch (error) {
      setFeedback(messageOf(error))
    } finally {
      setAiLoading(false)
    }
  }

  const currentExplanation = aiHistory.find((item) => item.planRevision === draftPlan?.revision)

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
                  {...buttonA11yProps}
                  className="plan-primary"
                  disabled={saving}
                  onClick={() => void generate()}
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
                <Text className={`plan-state plan-state--${draftPlan.status}`}>
                  {statusLabels[draftPlan.status]}
                </Text>
              </View>

              <View className="week-fold" role="tablist" aria-label="选择计划日期">
                {draftPlan.days.map((day) => (
                  <Button
                    {...buttonA11yProps}
                    className={`week-fold__day ${selectedDate === day.date ? 'week-fold__day--selected' : ''} ${day.session ? 'week-fold__day--planned' : ''}`}
                    aria-selected={selectedDate === day.date}
                    key={day.date}
                    onClick={() => setSelectedDate(day.date)}
                  >
                    <Text className="week-fold__weekday">{weekdayLabels[day.weekday]}</Text>
                    <Text className="week-fold__date metric">{shortDate(day.date)}</Text>
                    <Text className="week-fold__mark" aria-hidden="true">
                      {day.session ? '●' : '·'}
                    </Text>
                  </Button>
                ))}
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
                              key={activity.id}
                              onSelect={(optionId) => selectOption(activity.id, optionId)}
                            />
                          ))}
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
                        {dirty ? `${selections.length} 项替代动作尚未保存` : '先确认，再让计划生效'}
                      </Text>
                      <Text className="decision-bar__hint">每次决定都会留下独立版本。</Text>
                    </View>
                    <View className="decision-bar__actions">
                      <Button
                        {...buttonA11yProps}
                        className="plan-primary"
                        disabled={saving || (!dirty && savedPlan?.status === 'accepted')}
                        onClick={() => void decide(dirty ? 'modified' : 'accepted')}
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
                        {...buttonA11yProps}
                        className="plan-secondary"
                        disabled={saving || savedPlan?.status === 'skipped'}
                        onClick={() => void decide('skipped')}
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
                        <View
                          {...checkboxA11yProps}
                          className={`ai-consent ${aiConsent ? 'ai-consent--checked' : ''}`}
                          aria-checked={aiConsent}
                          aria-label="同意本次 AI 计划解释数据处理"
                          onClick={() => setAiConsent((value) => !value)}
                        >
                          <Checkbox checked={aiConsent} value="ai-plan-explanation" aria-hidden />
                          <Text>
                            我同意本次将精简计划摘要发送给配置的 AI 服务，并记录本次授权版本。
                          </Text>
                        </View>
                        <Button
                          {...buttonA11yProps}
                          className="ai-generate"
                          disabled={!aiConsent || aiLoading || draftPlan.status === 'skipped'}
                          aria-disabled={!aiConsent || aiLoading || draftPlan.status === 'skipped'}
                          onClick={() => void generateExplanation()}
                        >
                          {aiLoading ? '正在生成边注…' : '生成解释边注'}
                        </Button>
                        <Text className="ai-note-empty__hint">
                          本地默认使用演示 provider；生产模型、失败回退和版本来源会分别标注。
                        </Text>
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
