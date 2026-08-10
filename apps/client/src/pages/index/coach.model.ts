import type { Dashboard, PlanFreshness, WeeklyPlanListItem } from '@myfitness/contracts'

export type CoachPlanSummary = {
  plan: WeeklyPlanListItem
  plannedSessions: number
  recordedSessions: number
  plannedMinutes: number
  statusLabel: string
  freshnessLabel: string
}

export type CoachSnapshot = {
  localDate: string
  personalState: Dashboard['personalState']
  plan?: CoachPlanSummary
}

export type PersonalStateSource = 'plan' | 'records' | 'history'

export const personalStateSourceUrl = (
  source: PersonalStateSource,
  state: Dashboard['personalState'],
) => {
  if (source !== 'plan') return `/pages/${source}/index`
  const reflection = state.planExperience
  return reflection
    ? `/pages/plan-outcome/index?planId=${encodeURIComponent(reflection.planId)}&revision=${reflection.planRevision}`
    : '/pages/plans/index'
}

const planStatusLabels: Record<WeeklyPlanListItem['status'], string> = {
  draft: '等待你的决定',
  accepted: '已采用',
  modified: '已调整',
  skipped: '本周已跳过',
}

const planFreshnessLabels: Record<PlanFreshness['state'], string> = {
  current: '依据仍是当前版本',
  evidence_changed: '近期记录已变化',
  profile_changed: '个人资料已变化',
  eligibility_blocked: '安全问答已暂停计划',
  onboarding_required: '需要先完成个人资料',
}

export const currentWeekPlan = (plans: WeeklyPlanListItem[], localDate: string) =>
  plans.find((plan) => plan.days.some((day) => day.date === localDate))

export const buildCoachSnapshot = (
  dashboard: Dashboard,
  plans: WeeklyPlanListItem[],
): CoachSnapshot => {
  const currentPlan = currentWeekPlan(plans, dashboard.today.date)
  if (!currentPlan) {
    return {
      localDate: dashboard.today.date,
      personalState: dashboard.personalState,
    }
  }

  const plannedDays = new Set(currentPlan.days.filter((day) => day.session).map((day) => day.date))
  const linkedDays = new Set(
    currentPlan.sessionLinks
      .filter(
        (link) => link.planRevision === currentPlan.revision && plannedDays.has(link.sessionDate),
      )
      .map((link) => link.sessionDate),
  )

  return {
    localDate: dashboard.today.date,
    personalState: dashboard.personalState,
    plan: {
      plan: currentPlan,
      plannedSessions: plannedDays.size,
      recordedSessions: linkedDays.size,
      plannedMinutes: currentPlan.days.reduce(
        (total, day) => total + (day.session?.plannedMinutes ?? 0),
        0,
      ),
      statusLabel: planStatusLabels[currentPlan.status],
      freshnessLabel: planFreshnessLabels[currentPlan.freshness.state],
    },
  }
}
