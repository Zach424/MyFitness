import type { PlanDecision, WeeklyPlan } from '@myfitness/contracts'

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
