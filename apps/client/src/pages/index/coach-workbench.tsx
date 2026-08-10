import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import { buttonActivationProps } from '../../lib/accessibility'
import { planExperienceLabel } from '../../lib/plan-experience'
import type { TodayReadFailureKind, TodayReadPhase } from './today-read.model'
import type { CoachSnapshot } from './coach.model'
import './coach-workbench.scss'

const failureCopy: Record<TodayReadFailureKind, { title: string; detail: string }> = {
  offline: {
    title: '设备暂时无法连接服务',
    detail: '工作台不会把未读取的本周证据显示成零；恢复连接后请手动重试。',
  },
  refused: {
    title: '服务没有接受本次读取',
    detail: '请检查当前登录状态后手动重试；页面不会展示原始服务消息。',
  },
  service: {
    title: '本周证据暂时不可用',
    detail: '服务恢复后请手动重试；已有快照会继续保留并明确标记为旧数据。',
  },
  unknown: {
    title: '无法确认本次读取结果',
    detail: '当前状态仍是未知，不会用推测的数据生成总结或下一步。',
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

const personalStateCards = (state: CoachSnapshot['personalState']) => {
  const { planExperience, confirmedRecovery, observedWindow, recoveryEstimate } = state

  return [
    [
      planExperience ? planExperienceLabel(planExperience.experience) : '尚未保存',
      planExperience
        ? `本人确认 · PLAN v${planExperience.planRevision} · 反思 v${planExperience.reflectionRevision}`
        : '本人确认 · 当前暂无',
    ],
    [
      `${confirmedRecovery?.observationCount ?? 0} 条`,
      confirmedRecovery
        ? `确认恢复记录 · 最近 ${formatCheckedAt(confirmedRecovery.latestEvidenceAt)}`
        : '确认恢复记录 · 当前未引用',
    ],
    [
      `${observedWindow.activeDays} / 7 天`,
      `系统观察 · 恢复 ${observedWindow.measurementCount} · 训练 ${observedWindow.workoutCount} · 餐次 ${observedWindow.mealCount}`,
    ],
    [
      recoveryEstimate.label,
      `估计 · ${confidenceLabels[recoveryEstimate.confidence]} · ${recoveryEstimate.evidenceCount} 条证据`,
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
        <Text className="coach-lead">
          工作台按“已确认记录、当前计划、AI 边注”的顺序整理信息。前两段是确定性摘要；AI
          只在你明确授权后提供说明。
        </Text>
        {snapshot ? (
          <Text className="coach-checked metric">
            证据时间 {formatCheckedAt(snapshot.generatedAt)} · {snapshot.localDate}
          </Text>
        ) : null}
      </View>

      {phase === 'refreshing' ? (
        <View className="coach-read-state coach-read-state--refreshing" role="status">
          <Text className="coach-read-state__title">正在核对最新证据</Text>
          <Text className="coach-read-state__detail">
            完成前继续显示上次成功读取的整份快照，不混合新旧数据。
          </Text>
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
          <Text className="coach-empty__detail">
            可信快照完成前，不显示零值、计划判断或 AI 入口。
          </Text>
        </View>
      ) : (
        <View className="coach-spine">
          <View className="coach-stage coach-stage--evidence">
            <View className="coach-stage__marker" aria-hidden="true">
              记
            </View>
            <View className="coach-stage__content">
              <Text className="coach-stage__eyebrow">01 / 个人状态证据账本</Text>
              <Text className="coach-stage__title">系统知道什么，也说明为什么。</Text>
              <View className="coach-evidence-grid">
                {stateCards.map(([label, value]) => (
                  <View className="coach-evidence" key={label}>
                    <Text className="coach-evidence__value metric">{label}</Text>
                    <Text className="coach-evidence__label">{value}</Text>
                  </View>
                ))}
              </View>
              <Text className="coach-stage__copy">
                快照无保证有效期；记录、时间或反思变化后请更新。
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
                    {plan.freshnessLabel}
                    。只有你明确关联的训练才计入“已记录”，不会从相似时间或名称推断完成。
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
                  这表示服务已确认当前周没有计划，不是读取失败。可以先检查资料，再生成一份可修改的确定性计划。
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
                AI
                边注显示提示词、模型与安全校验来源；输出不能修改计划或确认健康数据，也不提供医疗诊断。
              </Text>
              {plan ? (
                <Button className="coach-secondary-action" {...buttonActivationProps(openAiLedger)}>
                  查看 AI 边注档案
                </Button>
              ) : (
                <Text className="coach-ai-boundary">
                  先建立周计划，才会出现对应的只读边注档案。
                </Text>
              )}
            </View>
          </View>
        </View>
      )}

      <Text className="coach-safety">
        本页总结来自已确认记录和显式计划关联，不是医学判断、依从性评分或自动处方。
      </Text>
    </View>
  )
}
