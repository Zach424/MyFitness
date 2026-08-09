import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import type { PlanOutcomeReview } from '@myfitness/contracts'

import { buttonActivationProps, deferH5Focus } from '../../lib/accessibility'
import { getWeeklyPlanOutcome } from '../../lib/api'
import './index.scss'

type Phase = 'loading' | 'ready' | 'failed' | 'invalid'

const metric = {
  'recovery.energy': '精力',
  'recovery.sleep_quality': '睡眠',
  'recovery.stress': '压力',
  'recovery.soreness': '酸痛',
} as const

const date = (value: string) => `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}`
const time = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))

const stepsFor = (review: PlanOutcomeReview) => {
  const recovery = review.recoveryObservations
    .slice(0, 3)
    .map(
      (item) =>
        `${metric[item.metric]} ${item.canonicalValue}/5 · ${item.recordId.slice(0, 8)} v${item.revision}`,
    )
    .join('；')
  const workouts = review.linkedWorkouts
    .map(
      (item) =>
        `${item.workoutTitle} · PLAN v${item.planRevision} ↔ WORKOUT v${item.workoutRevision}`,
    )
    .join('；')
  return [
    [
      '生成依据',
      !review.planningEvidence.recoveryState ||
      review.planningEvidence.recoveryState.state === 'unknown'
        ? '恢复状态 Unknown'
        : review.planningEvidence.recoveryState.label,
      `SCORE ${review.planningEvidence.readinessScore ?? '—'} · ${review.planningEvidence.recoveryState?.evidence.length ?? 0} REFS`,
    ],
    [
      '你的决定',
      `采用 v${review.planRevision} · ${review.adjustments.length} 项替代`,
      review.adjustments.length
        ? review.adjustments
            .map((item) => `${date(item.sessionDate)} ${item.before.title} → ${item.adopted.title}`)
            .join('；')
        : '按生成版本采用，没有保存替代。',
    ],
    [
      '后续确认',
      `${review.linkedWorkouts.length} 条训练关联 · ${review.recoveryObservationTotal} 条恢复记录`,
      review.followUpState === 'unknown'
        ? '当前没有仍确认的来源；缺失不等于“无效果”。'
        : `训练：${workouts || '无'}；恢复：${recovery || '无'}${review.recoveryObservationTotal > 3 ? `；另有 ${review.recoveryObservationTotal - 3} 条` : ''}`,
    ],
  ]
}

const PlanOutcomePage = () => {
  const params = useRouter().params
  const planId = typeof params.planId === 'string' ? params.planId : ''
  const rawRevision = typeof params.revision === 'string' ? params.revision : ''
  const revision = /^\d+$/.test(rawRevision) ? Number(rawRevision) : 0
  const valid = Boolean(planId && Number.isSafeInteger(revision) && revision > 0)
  const generation = useRef(0)
  const [phase, setPhase] = useState<Phase>(valid ? 'loading' : 'invalid')
  const [review, setReview] = useState<PlanOutcomeReview>()

  const read = useCallback(async () => {
    if (!valid) return
    const request = ++generation.current
    setPhase('loading')
    setReview(undefined)
    try {
      const next = await getWeeklyPlanOutcome(planId, revision)
      if (request !== generation.current) return
      setReview(next)
      setPhase('ready')
    } catch {
      if (request !== generation.current) return
      setPhase('failed')
      deferH5Focus('plan-outcome-retry', 80)
    }
  }, [planId, revision, valid])

  useEffect(() => {
    deferH5Focus('plan-outcome-back', 350)
    if (valid) void read()
    return () => {
      ++generation.current
    }
  }, [read, valid])

  const readText =
    phase === 'invalid'
      ? ['没有可核对的计划版本', '请从本周计划的“采用后回看”进入。']
      : phase === 'failed'
        ? ['回看尚未确认', '成功读取前不会用空记录代替。']
        : ['正在核对确认事实', `只读取当前账户的 PLAN v${revision}。`]

  return (
    <View className="review-page">
      <View className="review-shell">
        <View className="review-bar">
          <Button
            id="plan-outcome-back"
            className="review-back"
            aria-label="返回本周计划"
            {...buttonActivationProps(() => void Taro.navigateBack())}
          >
            ‹
          </Button>
          <Text className="review-mark metric">衡迹 / PLAN v{revision || '—'}</Text>
        </View>
        <View className="review-intro">
          <Text className="review-label">CONFIRMED FOLLOW-UP</Text>
          <Text className="review-title">采用以后，留下了哪些记录</Text>
          <Text className="review-copy">按版本重算；区分确认、撤销和缺失，不判断计划效果。</Text>
        </View>

        {phase === 'ready' && review ? (
          <View className="review-sheet">
            <View className="review-head">
              <Text className="review-sheet__title">PLAN v{review.planRevision}</Text>
              <Text className={`review-state review-state--${review.followUpState}`}>
                {review.followUpState === 'observed' ? '已有确认记录' : 'Unknown'}
              </Text>
            </View>
            <Text className="review-window metric">
              {time(review.adoptedAt)} → {time(review.observationWindow.observedThrough)} ·{' '}
              {review.observationWindow.state === 'open' ? 'OPEN' : 'CLOSED'}
            </Text>
            <View className="review-rail" aria-label="计划结果证据链">
              {stepsFor(review).map(([label, title, copy], index) => (
                <View
                  className={`review-step ${index === 2 ? 'review-step--last' : ''}`}
                  key={label}
                >
                  <Text className="review-step__no metric">0{index + 1}</Text>
                  <View>
                    <Text className="review-label">{label}</Text>
                    <Text className="review-step__title">{title}</Text>
                    <Text className="review-copy">{copy}</Text>
                  </View>
                </View>
              ))}
            </View>
            {review.withdrawnEvidence.workoutLinkCount ||
            review.withdrawnEvidence.recoveryRecordCount ? (
              <Text className="review-withdrawn">
                已排除：{review.withdrawnEvidence.workoutLinkCount} 条已解除关联 ·{' '}
                {review.withdrawnEvidence.recoveryRecordCount} 条已删除恢复记录；撤销项不再算证据。
              </Text>
            ) : null}
            <Text className="review-boundary">
              时间先后不能证明因果或效果；不会评分依从性或自动调整计划。
            </Text>
          </View>
        ) : (
          <View
            className={`review-read ${phase !== 'loading' ? 'review-read--failed' : ''}`}
            role={phase === 'loading' ? 'status' : 'alert'}
          >
            <Text className="review-read__title">{readText[0]}</Text>
            <Text className="review-copy">{readText[1]}</Text>
            {phase === 'failed' ? (
              <Button
                id="plan-outcome-retry"
                className="review-retry"
                {...buttonActivationProps(() => void read())}
              >
                重试核对 v{revision}
              </Button>
            ) : null}
          </View>
        )}
        <Text className="review-safety">一般生活方式安排，不是医疗诊断或治疗建议。</Text>
      </View>
    </View>
  )
}

export default PlanOutcomePage
