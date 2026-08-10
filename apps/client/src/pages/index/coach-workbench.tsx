import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import { buttonActivationProps } from '../../lib/accessibility'
import { planExperienceLabel } from '../../lib/plan-experience'
import type { TodayReadFailureKind, TodayReadPhase } from './today-read.model'
import { personalStateSourceUrl, type CoachSnapshot, type PersonalStateSource } from './coach.model'
import './coach-workbench.scss'

const failureCopy: Record<TodayReadFailureKind, { title: string; detail: string }> = {
  offline: {
    title: '设备暂时无法连接服务',
    detail: '未读证据不会显示为零；连接后请重试。',
  },
  refused: {
    title: '服务没有接受本次读取',
    detail: '核对登录状态后请重试；不展示原始错误。',
  },
  service: {
    title: '本周证据暂时不可用',
    detail: '保留旧快照；服务恢复后请重试。',
  },
  unknown: {
    title: '无法确认本次读取结果',
    detail: '保持未知；不会用推测生成下一步。',
  },
}

const formatCheckedAt = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))

const confidenceLabels = {
  insufficient: '证据不足',
  low: '低置信',
  moderate: '中等置信',
} as const

type PersonalStateCard = [string, string, PersonalStateSource]

const personalStateCards = (state: CoachSnapshot['personalState']): PersonalStateCard[] => {
  const { planExperience, confirmedRecovery, observedWindow, recoveryEstimate } = state

  return [
    [
      planExperience ? planExperienceLabel(planExperience.experience) : '尚未保存',
      planExperience
        ? `本人确认 · PLAN v${planExperience.planRevision} · 反思 v${planExperience.reflectionRevision}`
        : '本人确认 · 当前暂无',
      'plan',
    ],
    [
      `${confirmedRecovery?.observationCount ?? 0} 条`,
      confirmedRecovery
        ? `确认恢复记录 · 最近 ${formatCheckedAt(confirmedRecovery.latestEvidenceAt)}`
        : '确认恢复记录 · 当前未引用',
      'records',
    ],
    [
      `${observedWindow.activeDays} / 7 天`,
      `系统观察 · 恢复 ${observedWindow.measurementCount} · 训练 ${observedWindow.workoutCount} · 餐次 ${observedWindow.mealCount}`,
      'history',
    ],
    [
      recoveryEstimate.label,
      `估计 · ${confidenceLabels[recoveryEstimate.confidence]} · ${recoveryEstimate.evidenceCount} 条证据`,
      'records',
    ],
  ]
}

type CoachWorkbenchProps = {
  snapshot?: CoachSnapshot
  phase: TodayReadPhase
  failure?: TodayReadFailureKind
  loading: boolean
  onRetry: () => void
  onClose: () => void
}

export const CoachWorkbench = ({
  snapshot,
  phase,
  failure,
  loading,
  onRetry,
  onClose,
}: CoachWorkbenchProps) => {
  const plan = snapshot?.plan
  const stateCards = snapshot ? personalStateCards(snapshot.personalState) : []
  const status = failure ? failureCopy[failure] : undefined
  const openPlan = () => void Taro.navigateTo({ url: '/pages/plans/index' })
  const openAiLedger = () => {
    if (!plan) return
    void Taro.navigateTo({
      url: `/pages/ai-explanations/index?planId=${encodeURIComponent(plan.plan.id)}`,
    })
  }
  const openStateSource = (source: PersonalStateSource) => {
    if (snapshot)
      void Taro.navigateTo({ url: personalStateSourceUrl(source, snapshot.personalState) })
  }

  return (
    <View className="coach-shell">
      <View className="coach-topbar">
        <Button className="coach-back" aria-label="返回今日" {...buttonActivationProps(onClose)}>
          ‹
        </Button>
        <View className="coach-wordmark" aria-label="衡迹教练工作台">
          <Text className="coach-wordmark__cn">教练批注</Text>
          <Text className="coach-wordmark__en">EVIDENCE COACH</Text>
        </View>
        <Button
          className="coach-refresh"
          aria-label={loading ? '教练工作台正在读取' : '重新读取教练工作台'}
          {...buttonActivationProps(onRetry, loading)}
        >
          {loading ? '读取中' : '更新'}
        </Button>
      </View>

      <View className="coach-hero">
        <Text className="coach-eyebrow">THIS WEEK, IN ORDER</Text>
        <Text className="coach-title">先看事实，再决定下一步。</Text>
        <Text className="coach-lead">先核对确认记录与计划；AI 只在授权后解释。</Text>
        {snapshot ? (
          <Text className="coach-checked metric">
            证据时间 {formatCheckedAt(snapshot.personalState.generatedAt)} · {snapshot.localDate}
          </Text>
        ) : null}
      </View>

      {phase === 'refreshing' ? (
        <View className="coach-read-state coach-read-state--refreshing" role="status">
          <Text className="coach-read-state__title">正在核对最新证据</Text>
          <Text className="coach-read-state__detail">完成前保留整份旧快照，不混合数据。</Text>
        </View>
      ) : status ? (
        <View className={`coach-read-state coach-read-state--${phase}`} role="alert">
          <Text className="coach-read-state__title">{status.title}</Text>
          <Text className="coach-read-state__detail">{status.detail}</Text>
          <Button
            id="coach-read-retry"
            className="coach-read-state__action"
            {...buttonActivationProps(onRetry, loading)}
          >
            重新读取
          </Button>
        </View>
      ) : null}

      {!snapshot ? (
        <View className="coach-empty" role="status">
          <Text className="coach-empty__title">
            {loading ? '正在读取本周记录与计划' : '本周证据尚未读取'}
          </Text>
          <Text className="coach-empty__detail">可信快照前不显示零值、判断或 AI。</Text>
        </View>
      ) : (
        <View className="coach-spine">
          <View className="coach-stage coach-stage--evidence">
            <View className="coach-stage__marker" aria-hidden="true">
              记
            </View>
            <View className="coach-stage__content">
              <Text className="coach-stage__eyebrow">01 / 个人状态证据账本</Text>
              <Text className="coach-stage__title">选择卡片检查来源。</Text>
              <View className="coach-evidence-grid">
                {stateCards.map(([label, value, source]) => (
                  <View
                    className="coach-evidence"
                    key={label}
                    aria-label={`${value}；检查来源`}
                    {...buttonActivationProps(() => openStateSource(source))}
                  >
                    <Text className="coach-evidence__value metric">{label}</Text>
                    <Text className="coach-evidence__label">{value}</Text>
                  </View>
                ))}
              </View>
              <Text className="coach-stage__copy">
                快照无有效期保证；来源、时间或反思变化后更新。
              </Text>
            </View>
          </View>

          <View className="coach-stage coach-stage--plan">
            <View className="coach-stage__marker" aria-hidden="true">
              划
            </View>
            <View className="coach-stage__content">
              <Text className="coach-stage__eyebrow">02 / 用户可控计划</Text>
              <Text className="coach-stage__title">
                {plan ? plan.statusLabel : '本周还没有计划折页'}
              </Text>
              {plan ? (
                <>
                  <Text className="coach-stage__copy">
                    {plan.freshnessLabel}。只统计你与当前修订明确关联的训练。
                  </Text>
                  <View className="coach-plan-strip">
                    <View>
                      <Text className="coach-plan-strip__label">计划训练</Text>
                      <Text className="coach-plan-strip__value metric">
                        {plan.plannedSessions} 次 · {plan.plannedMinutes} 分钟
                      </Text>
                    </View>
                    <View>
                      <Text className="coach-plan-strip__label">明确关联</Text>
                      <Text className="coach-plan-strip__value metric">
                        {plan.recordedSessions} / {plan.plannedSessions}
                      </Text>
                    </View>
                    <View>
                      <Text className="coach-plan-strip__label">版本</Text>
                      <Text className="coach-plan-strip__value metric">
                        PLAN v{plan.plan.revision}
                      </Text>
                    </View>
                  </View>
                </>
              ) : (
                <Text className="coach-stage__copy">
                  服务已确认本周无计划；可建立一份可修改的确定性计划。
                </Text>
              )}
              <Button className="coach-primary-action" {...buttonActivationProps(openPlan)}>
                {plan ? '打开本周计划' : '建立本周计划'}
              </Button>
            </View>
          </View>

          <View className="coach-stage coach-stage--ai">
            <View className="coach-stage__marker" aria-hidden="true">
              AI
            </View>
            <View className="coach-stage__content">
              <Text className="coach-stage__eyebrow">03 / 可追溯 AI 边注</Text>
              <Text className="coach-stage__title">解释计划，不改写事实</Text>
              <Text className="coach-stage__copy">
                AI 边注保留模型与校验来源；不改写事实或提供医疗诊断。
              </Text>
              {plan ? (
                <Button className="coach-secondary-action" {...buttonActivationProps(openAiLedger)}>
                  查看 AI 边注档案
                </Button>
              ) : (
                <Text className="coach-ai-boundary">先建立计划，才有只读边注。</Text>
              )}
            </View>
          </View>
        </View>
      )}

      <Text className="coach-safety">本页不是医学判断、依从性评分或自动处方。</Text>
    </View>
  )
}
