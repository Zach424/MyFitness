import type { PlanDecision, PlanFreshness, WeeklyPlan } from '@myfitness/contracts'

const localDate = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export const defaultPlanWeekStart = (now = new Date()) => {
  const date = new Date(now)
  date.setHours(12, 0, 0, 0)
  const weekday = date.getDay()
  date.setDate(date.getDate() + (weekday === 0 ? 1 : 1 - weekday))
  return localDate(date)
}

export const updatePlanSelection = (plan: WeeklyPlan, activityId: string, optionId: string) => ({
  ...plan,
  days: plan.days.map((day) => ({
    ...day,
    session: day.session
      ? {
          ...day.session,
          activities: day.session.activities.map((activity) =>
            activity.id === activityId ? { ...activity, selectedOptionId: optionId } : activity,
          ),
        }
      : null,
  })),
})

const selectionsOf = (plan: WeeklyPlan) =>
  new Map(
    plan.days.flatMap((day) =>
      (day.session?.activities ?? []).map((activity) => [activity.id, activity.selectedOptionId]),
    ),
  )

export const changedPlanSelections = (
  saved: WeeklyPlan,
  draft: WeeklyPlan,
): PlanDecision['selections'] => {
  const original = selectionsOf(saved)
  return draft.days.flatMap((day) =>
    (day.session?.activities ?? [])
      .filter((activity) => original.get(activity.id) !== activity.selectedOptionId)
      .map((activity) => ({ activityId: activity.id, optionId: activity.selectedOptionId })),
  )
}

export const currentPlanFreshness = (
  plan: WeeklyPlan,
  checkedAt = new Date().toISOString(),
): PlanFreshness => ({
  state: 'current',
  checkedAt,
  planOnboardingRevision: plan.evidence.onboardingRevision,
  currentOnboardingRevision: plan.evidence.onboardingRevision,
  evidencePolicyVersion: plan.evidence.evidencePolicyVersion,
  planEvidenceFingerprint: plan.evidence.evidenceFingerprint,
  currentEvidenceFingerprint: plan.evidence.evidenceFingerprint,
  canAcceptOrModify: true,
  canExplainWithAi: true,
  canSkip: true,
  recommendedAction: 'none',
})

export const planFreshnessProjectionKey = (freshness: PlanFreshness | undefined) => {
  if (!freshness) return 'missing'
  const evidenceFingerprint =
    'currentEvidenceFingerprint' in freshness ? freshness.currentEvidenceFingerprint : 'n/a'
  const changeReason = 'changeReason' in freshness ? freshness.changeReason : 'n/a'
  return [
    freshness.state,
    freshness.currentOnboardingRevision,
    evidenceFingerprint,
    changeReason,
  ].join(':')
}

export const planFreshnessNotice = (freshness: PlanFreshness) => {
  if (freshness.state === 'current') return null
  if (freshness.state === 'evidence_changed') {
    const title = {
      recovery_added: '新的恢复记录改变了本周安排边界',
      recovery_expired: '生成时的恢复摘要已超出当前窗口',
      recovery_threshold_crossed: '近期恢复摘要跨过了保守安排边界',
    }[freshness.changeReason]
    return {
      eyebrow: 'EVIDENCE SHIFT',
      title,
      body: '这是近期记录的规则摘要，不是医学判断。采用、替换动作和 AI 边注已冻结；你仍可跳过本周，或按最新记录安全重排。',
      actionLabel: '按最新记录重排本周',
    }
  }
  if (freshness.state === 'profile_changed') {
    return {
      eyebrow: 'MISALIGNED FOLD',
      title: '个人资料已变化，这份折页不再是当前版本',
      body: `计划依据资料 v${freshness.planOnboardingRevision}；当前资料为 v${freshness.currentOnboardingRevision}。采用、替换动作和 AI 边注已冻结，请按最新资料重新生成。`,
      actionLabel: '按最新资料重排本周',
    }
  }
  if (freshness.state === 'eligibility_blocked') {
    return {
      eyebrow: 'SAFETY HOLD',
      title: '当前安全问答已暂停这份计划',
      body: '采用、替换动作和 AI 边注已冻结；你仍可以把本周标记为暂不采用。请先检查个人资料，并在需要时取得专业许可。',
      actionLabel: '检查安全资料',
    }
  }
  return {
    eyebrow: 'PROFILE REQUIRED',
    title: '当前账号缺少完整的计划资料',
    body: '采用、替换动作和 AI 边注已冻结；历史计划仍保留。完成个人资料与安全问答后，再生成新的本周折页。',
    actionLabel: '完成个人资料',
  }
}
