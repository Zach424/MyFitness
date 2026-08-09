import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import type {
  PlanExperienceChoice,
  PlanExperienceReflection,
  PlanOutcomeReview,
} from '@myfitness/contracts'

import { buttonActivationProps, deferH5Focus } from '../../lib/accessibility'
import {
  deletePlanExperienceReflection,
  getPlanExperienceReflection,
  getWeeklyPlanOutcome,
  writePlanExperienceReflection,
} from '../../lib/api'
import './index.scss'

type Phase = 'loading' | 'ready' | 'failed' | 'invalid'
type ReflectionPhase = 'loading' | 'ready' | 'failed'

const experienceChoices: Array<[PlanExperienceChoice, string]> = [
  ['easier_than_expected', '比预期轻松'],
  ['about_right', '安排合适'],
  ['not_right_for_me', '不适合我'],
  ['not_sure_yet', '还不能判断'],
]

const metric = {
  'recovery.energy': '精力',
  'recovery.sleep_quality': '睡眠',
  'recovery.stress': '压力',
  'recovery.soreness': '酸痛',
} as const

const date = (value: string) => `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}`
const time = (value: string) => `${date(value)} ${value.slice(11, 16)}`

const factsFor = (review: PlanOutcomeReview) => {
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
    `01 生成 · ${!review.planningEvidence.recoveryState || review.planningEvidence.recoveryState.state === 'unknown' ? '恢复 Unknown' : review.planningEvidence.recoveryState.label} · SCORE ${review.planningEvidence.readinessScore ?? '—'}`,
    `02 采用 v${review.planRevision} · ${review.adjustments.length ? review.adjustments.map((item) => `${date(item.sessionDate)} ${item.before.title}→${item.adopted.title}`).join('；') : '原版'}`,
    `03 确认 · ${review.followUpState === 'unknown' ? '无确认来源；缺失不等于无效果' : `${workouts || '无训练'}；${recovery || '无恢复'}${review.recoveryObservationTotal > 3 ? `；另 ${review.recoveryObservationTotal - 3} 条` : ''}`}`,
  ]
}

const PlanOutcomePage = () => {
  const params = useRouter().params
  const planId = typeof params.planId === 'string' ? params.planId : ''
  const rawRevision = typeof params.revision === 'string' ? params.revision : ''
  const revision = /^\d+$/.test(rawRevision) ? Number(rawRevision) : 0
  const valid = Boolean(planId && Number.isSafeInteger(revision) && revision > 0)
  const generation = useRef(0)
  const reflectionGeneration = useRef(0)
  const [phase, setPhase] = useState<Phase>(valid ? 'loading' : 'invalid')
  const [review, setReview] = useState<PlanOutcomeReview>()
  const [reflectionPhase, setReflectionPhase] = useState<ReflectionPhase>('loading')
  const [reflection, setReflection] = useState<PlanExperienceReflection | null>(null)
  const [reflectionBusy, setReflectionBusy] = useState(false)

  const read = useCallback(() => {
    if (!valid) return
    const request = ++generation.current
    setPhase('loading')
    setReview(undefined)
    void getWeeklyPlanOutcome(planId, revision)
      .then((next) => {
        if (request !== generation.current) return
        setReview(next)
        setPhase('ready')
      })
      .catch(() => {
        if (request !== generation.current) return
        setPhase('failed')
        deferH5Focus('plan-outcome-retry', 80)
      })
  }, [planId, revision, valid])

  const readReflection = useCallback(() => {
    if (!valid) return
    const request = ++reflectionGeneration.current
    setReflectionPhase('loading')
    void getPlanExperienceReflection(planId, revision)
      .then((next) => {
        if (request !== reflectionGeneration.current) return
        setReflection(next)
        setReflectionPhase('ready')
      })
      .catch(() => {
        if (request !== reflectionGeneration.current) return
        setReflectionPhase('failed')
        deferH5Focus('plan-reflection-retry', 80)
      })
  }, [planId, revision, valid])

  useEffect(() => {
    deferH5Focus('plan-outcome-back', 350)
    if (valid) {
      void read()
      void readReflection()
    }
    return () => {
      ++generation.current
      ++reflectionGeneration.current
    }
  }, [read, readReflection, valid])

  const saveReflection = (experience: PlanExperienceChoice) => {
    if (reflectionBusy || experience === reflection?.experience) return
    const request = ++reflectionGeneration.current
    setReflectionBusy(true)
    void writePlanExperienceReflection(planId, revision, {
      experience,
      expectedRevision: reflection?.revision ?? 0,
    })
      .then((saved) => {
        if (request !== reflectionGeneration.current) return
        setReflection(saved)
      })
      .catch(() => {
        if (request !== reflectionGeneration.current) return
        setReflectionPhase('failed')
        deferH5Focus('plan-reflection-retry', 80)
      })
      .finally(() => {
        if (request === reflectionGeneration.current) setReflectionBusy(false)
      })
  }

  const removeReflection = () => {
    if (!reflection || reflectionBusy) return
    void Taro.showModal({
      title: '删除反思？',
      content: '计划证据不会改变。',
      confirmText: '删除',
    }).then((decision) => {
      if (!decision.confirm) return
      const request = ++reflectionGeneration.current
      setReflectionBusy(true)
      return deletePlanExperienceReflection(planId, revision, reflection.revision)
        .then(() => {
          if (request !== reflectionGeneration.current) return
          setReflection(null)
        })
        .catch(() => {
          if (request !== reflectionGeneration.current) return
          setReflectionPhase('failed')
          deferH5Focus('plan-reflection-retry', 80)
        })
        .finally(() => {
          if (request === reflectionGeneration.current) setReflectionBusy(false)
        })
    })
  }

  const readText =
    phase === 'invalid'
      ? ['计划版本无效', '请从本周计划进入。']
      : phase === 'failed'
        ? ['读取失败', '不会用空记录代替。']
        : ['正在读取', `核对 PLAN v${revision}。`]
  const back = () =>
    Taro.getCurrentPages().length > 1
      ? Taro.navigateBack()
      : Taro.redirectTo({ url: '/pages/plans/index' })

  return (
    <View className="review-page">
      <View className="review-shell">
        <View className="review-bar">
          <Button
            id="plan-outcome-back"
            className="review-back"
            aria-label="返回本周计划"
            {...buttonActivationProps(() => void back())}
          >
            ‹
          </Button>
          <Text className="review-mark metric">PLAN v{revision || '—'}</Text>
        </View>
        <View className="review-intro">
          <Text className="review-title">采用后记录</Text>
          <Text className="review-copy">按版本重算；缺失不代表无效果。</Text>
        </View>

        {phase === 'ready' && review ? (
          <>
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
              <View className="review-facts" aria-label="证据链">
                {factsFor(review).map((fact) => (
                  <Text className="review-fact metric" key={fact}>
                    {fact}
                  </Text>
                ))}
              </View>
              {review.withdrawnEvidence.workoutLinkCount ||
              review.withdrawnEvidence.recoveryRecordCount ? (
                <Text className="review-withdrawn">
                  已排除撤销项：训练 {review.withdrawnEvidence.workoutLinkCount} · 恢复{' '}
                  {review.withdrawnEvidence.recoveryRecordCount}
                </Text>
              ) : null}
              <Text className="review-boundary">只呈现记录，不推断因果、评分或自动调计划。</Text>
            </View>
            <View className="reflection-card">
              <Text className="review-sheet__title">本人确认体验</Text>
              <Text className="review-copy">点选即保存；与系统证据分开。</Text>
              {reflectionPhase === 'loading' ? (
                <View className="review-copy" role="status">
                  <Text>正在读取…</Text>
                </View>
              ) : reflectionPhase === 'failed' ? (
                <View className="review-copy" role="alert">
                  <Text>读取失败；不会显示成未填写。</Text>
                  <Button
                    id="plan-reflection-retry"
                    className="review-retry"
                    {...buttonActivationProps(() => void readReflection())}
                  >
                    重试读取
                  </Button>
                </View>
              ) : (
                <>
                  {reflection ? (
                    <Text className="review-window metric">
                      本人确认 ·{' '}
                      {experienceChoices.find(([value]) => value === reflection.experience)?.[1]} ·
                      v{reflection.revision}
                    </Text>
                  ) : null}
                  <View className="reflection-options" aria-label="体验">
                    {experienceChoices.map(([value, label]) => (
                      <Button
                        className={`reflection-option ${reflection?.experience === value ? 'reflection-option--selected' : ''}`}
                        key={value}
                        aria-pressed={reflection?.experience === value}
                        {...buttonActivationProps(
                          () => void saveReflection(value),
                          reflectionBusy || reflection?.experience === value,
                        )}
                      >
                        {label}
                      </Button>
                    ))}
                  </View>
                  {reflection ? (
                    <Button
                      className="reflection-remove"
                      {...buttonActivationProps(() => void removeReflection(), reflectionBusy)}
                    >
                      删除反思
                    </Button>
                  ) : null}
                </>
              )}
            </View>
          </>
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
        <Text className="review-safety">非医疗建议。</Text>
      </View>
    </View>
  )
}

export default PlanOutcomePage
