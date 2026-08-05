import { useEffect, useMemo, useState } from 'react'
import { Button, ScrollView, Text, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import type { AiExplanation, WeeklyPlanListItem } from '@myfitness/contracts'

import { buttonActivationProps, deferH5Focus } from '../../lib/accessibility'
import { ApiError, getAiExplanationHistory, listWeeklyPlans } from '../../lib/api'
import {
  aiExplanationHistoryPageSize,
  aiExplanationLedgerState,
  nextAiExplanationHistoryCount,
  type AiExplanationLedgerState,
} from './ai-explanations.model'
import './index.scss'

const sourceLabels: Record<AiExplanation['source'], string> = {
  model: 'AI 模型解释',
  fixture: '本地演示解释',
  fallback: '确定性安全回退',
}

const failureLabels: Record<NonNullable<AiExplanation['failureCode']>, string> = {
  provider_unavailable: '解释服务不可用，已使用确定性说明',
  provider_timeout: '解释服务超时，已使用确定性说明',
  provider_refusal: '服务拒绝生成，已使用确定性说明',
  provider_error: '解释服务失败，已使用确定性说明',
  invalid_output: '输出格式无效，已使用确定性说明',
  safety_validation_failed: '输出未通过安全校验，已使用确定性说明',
}

const messageOf = (error: unknown) =>
  error instanceof ApiError || error instanceof Error ? error.message : '读取解释档案失败'

const historyTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))

const stateLabel = (state: AiExplanationLedgerState) =>
  state === 'current'
    ? 'CURRENT / 当前可用'
    : state === 'frozen'
      ? 'FROZEN / 当前版本已冻结'
      : 'HISTORY / 历史版本'

const AiExplanationsPage = () => {
  const router = useRouter()
  const planId = typeof router.params.planId === 'string' ? router.params.planId : ''
  const [plan, setPlan] = useState<WeeklyPlanListItem>()
  const [items, setItems] = useState<AiExplanation[]>([])
  const [visibleCount, setVisibleCount] = useState(aiExplanationHistoryPageSize)
  const [expandedId, setExpandedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    deferH5Focus('ai-history-back', 350)
    let active = true
    if (!planId) {
      setFeedback('没有可读取的计划档案，请从本周计划进入。')
      setLoading(false)
      return () => {
        active = false
      }
    }
    void Promise.all([listWeeklyPlans(), getAiExplanationHistory(planId)])
      .then(([plans, history]) => {
        if (!active) return
        const ownedPlan = plans.items.find((item) => item.id === planId)
        if (!ownedPlan) throw new Error('当前账户找不到这份计划')
        setPlan(ownedPlan)
        setItems(history)
        setVisibleCount(aiExplanationHistoryPageSize)
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
  }, [planId])

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount])

  return (
    <View className="ai-history-page">
      <ScrollView className="ai-history-scroll" scrollY enhanced showScrollbar={false}>
        <View className="ai-history-shell">
          <View className="ai-history-topbar">
            <Button
              id="ai-history-back"
              className="ai-history-back"
              aria-label="返回本周计划"
              {...buttonActivationProps(() => void Taro.navigateBack())}
            >
              ‹
            </Button>
            <View className="ai-history-wordmark">
              <Text>衡迹</Text>
              <Text className="ai-history-wordmark__en">RUN LEDGER</Text>
            </View>
            <Text className="ai-history-count metric">{items.length || '—'}</Text>
          </View>

          <View className="ai-history-intro">
            <Text className="ai-history-eyebrow">IMMUTABLE EXPLANATION TRACE</Text>
            <Text className="ai-history-title">解释运行档案</Text>
            <Text className="ai-history-lead">
              这里读取已完成的边注运行，不会重新调用模型。当前、冻结和历史版本分别标记；任何边注都不能修改计划或确认健康事实。
            </Text>
          </View>

          {feedback ? (
            <View className="ai-history-feedback" role="alert">
              <Text>{feedback}</Text>
            </View>
          ) : null}

          {loading ? (
            <View className="ai-history-empty" role="status">
              <Text className="ai-history-empty__title">正在读取解释运行</Text>
              <Text className="ai-history-empty__copy">只读取当前账户拥有的已完成记录。</Text>
            </View>
          ) : !plan || !items.length ? (
            <View className="ai-history-empty">
              <Text className="ai-history-empty__title">还没有可展示的解释运行</Text>
              <Text className="ai-history-empty__copy">
                返回本周计划后，可在明确授权下生成一条只读边注。
              </Text>
            </View>
          ) : (
            <View className="ai-run-ledger" role="list" aria-label="AI 解释运行档案">
              {visibleItems.map((item) => {
                const state = aiExplanationLedgerState(
                  item.planRevision,
                  plan.revision,
                  plan.freshness.canExplainWithAi,
                )
                const expanded = expandedId === item.id
                return (
                  <View
                    className={`ai-run-ledger__item ai-run-ledger__item--${state}`}
                    role="listitem"
                    key={item.id}
                  >
                    <View className="ai-run-ledger__heading">
                      <View>
                        <Text className={`ai-run-ledger__state ai-run-ledger__state--${state}`}>
                          {stateLabel(state)}
                        </Text>
                        <Text className="ai-run-ledger__headline">{item.content.headline}</Text>
                      </View>
                      <Text className="ai-run-ledger__revision metric">
                        PLAN V{item.planRevision}
                      </Text>
                    </View>

                    <View className="ai-run-ledger__provenance">
                      <View>
                        <Text className="ai-run-ledger__label">运行来源</Text>
                        <Text className="ai-run-ledger__value">{sourceLabels[item.source]}</Text>
                      </View>
                      <View>
                        <Text className="ai-run-ledger__label">完成时间</Text>
                        <Text className="ai-run-ledger__value metric">
                          {historyTime(item.createdAt)}
                        </Text>
                      </View>
                      <View>
                        <Text className="ai-run-ledger__label">提示词版本</Text>
                        <Text className="ai-run-ledger__value metric">{item.promptVersion}</Text>
                      </View>
                      <View>
                        <Text className="ai-run-ledger__label">安全校验器</Text>
                        <Text className="ai-run-ledger__value metric">{item.validatorVersion}</Text>
                      </View>
                    </View>

                    <Text
                      className={`ai-run-ledger__outcome ${item.failureCode ? 'ai-run-ledger__outcome--fallback' : ''}`}
                    >
                      {item.failureCode
                        ? failureLabels[item.failureCode]
                        : '运行完成，未记录失败或安全回退代码'}
                    </Text>

                    {state !== 'current' ? (
                      <Text className="ai-run-ledger__boundary">
                        {state === 'frozen'
                          ? '这条边注与计划版本相同，但当前资料或安全状态已变化，只作为历史保留。'
                          : `这条边注属于计划 v${item.planRevision}，不会作为当前 v${plan.revision} 的解释。`}
                      </Text>
                    ) : null}

                    <Button
                      className="ai-run-ledger__toggle"
                      aria-expanded={expanded}
                      aria-label={`${expanded ? '收起' : '查看'}计划 v${item.planRevision} ${state === 'current' ? '当前' : '历史'}边注`}
                      {...buttonActivationProps(() =>
                        setExpandedId((current) => (current === item.id ? '' : item.id)),
                      )}
                    >
                      {expanded ? '收起边注' : '查看只读边注'}
                    </Button>

                    {expanded ? (
                      <View className="ai-run-ledger__content">
                        <Text className="ai-run-ledger__overview">{item.content.overview}</Text>
                        {item.content.highlights.map((highlight, index) => (
                          <View className="ai-run-ledger__highlight" key={`${item.id}-${index}`}>
                            <Text className="ai-run-ledger__highlight-title">
                              {highlight.title}
                            </Text>
                            <Text className="ai-run-ledger__highlight-copy">
                              {highlight.detail}
                            </Text>
                          </View>
                        ))}
                        <Text className="ai-run-ledger__next">
                          下次复核：{item.content.nextStep}
                        </Text>
                        <Text className="ai-run-ledger__safety">{item.safetyNote}</Text>
                      </View>
                    ) : null}
                  </View>
                )
              })}

              {visibleCount < items.length ? (
                <Button
                  className="ai-history-more"
                  {...buttonActivationProps(() =>
                    setVisibleCount((count) => nextAiExplanationHistoryCount(count, items.length)),
                  )}
                >
                  继续显示更早运行
                </Button>
              ) : (
                <Text className="ai-history-end">已显示本次读取的全部解释运行</Text>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  )
}

export default AiExplanationsPage
