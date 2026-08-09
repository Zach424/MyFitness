import type {
  PlanOutcomeRecoveryObservation,
  PlanOutcomeReview,
  PlanWorkoutLink,
  WeeklyPlan,
} from '@myfitness/contracts'
import { planOutcomeReviewPolicyVersion, planOutcomeReviewSchema } from '@myfitness/contracts'

type BuildPlanOutcomeReviewInput = {
  baseline: WeeklyPlan
  adopted: WeeklyPlan
  adoptedAt: string
  observedThrough: string
  linkedWorkouts: PlanWorkoutLink[]
  recoveryObservations: PlanOutcomeRecoveryObservation[]
  recoveryObservationTotal: number
}

const selectedOption = (
  activity: NonNullable<WeeklyPlan['days'][number]['session']>['activities'][number],
) =>
  activity.options.find((option) => option.id === activity.selectedOptionId) ?? activity.options[0]!

export const buildPlanOutcomeReview = ({
  baseline,
  adopted,
  adoptedAt,
  observedThrough,
  linkedWorkouts,
  recoveryObservations,
  recoveryObservationTotal,
}: BuildPlanOutcomeReviewInput): PlanOutcomeReview => {
  const adoptedAtMs = Date.parse(adoptedAt)
  const scheduledEndAt = new Date(adoptedAtMs + 7 * 24 * 60 * 60 * 1_000).toISOString()
  const observedThroughMs = Math.min(
    Math.max(Date.parse(observedThrough), adoptedAtMs),
    Date.parse(scheduledEndAt),
  )
  const boundedObservedThrough = new Date(observedThroughMs).toISOString()
  const baselineActivities = new Map(
    baseline.days.flatMap((day) =>
      (day.session?.activities ?? []).map((activity) => [activity.id, { day, activity }] as const),
    ),
  )
  const adjustments = adopted.days.flatMap((day) =>
    (day.session?.activities ?? []).flatMap((activity) => {
      const before = baselineActivities.get(activity.id)
      if (!before || before.activity.selectedOptionId === activity.selectedOptionId) return []
      const beforeOption = selectedOption(before.activity)
      const adoptedOption = selectedOption(activity)
      return [
        {
          sessionDate: day.date,
          activityId: activity.id,
          role: activity.role,
          before: { id: beforeOption.id, title: beforeOption.title },
          adopted: { id: adoptedOption.id, title: adoptedOption.title },
        },
      ]
    }),
  )
  const windowLinks = linkedWorkouts.filter((link) => {
    const occurredAt = Date.parse(link.workoutStartedAt)
    return (
      link.planId === adopted.id &&
      link.planRevision === adopted.revision &&
      occurredAt >= adoptedAtMs &&
      occurredAt <= observedThroughMs
    )
  })
  const windowRecovery = recoveryObservations
    .filter((observation) => {
      const occurredAt = Date.parse(observation.occurredAt)
      return occurredAt >= adoptedAtMs && occurredAt <= observedThroughMs
    })
    .slice(0, 100)
  const hasFollowUp = windowLinks.length > 0 || recoveryObservationTotal > 0

  return planOutcomeReviewSchema.parse({
    policyVersion: planOutcomeReviewPolicyVersion,
    planId: adopted.id,
    planRevision: adopted.revision,
    adoptedAt,
    observationWindow: {
      scheduledEndAt,
      observedThrough: boundedObservedThrough,
      state: observedThroughMs === Date.parse(scheduledEndAt) ? 'closed' : 'open',
    },
    planningEvidence: {
      onboardingRevision: adopted.evidence.onboardingRevision,
      dashboardGeneratedAt: adopted.evidence.dashboardGeneratedAt,
      readinessScore: adopted.evidence.readinessScore,
      evidencePolicyVersion: adopted.evidence.evidencePolicyVersion,
      evidenceFingerprint: adopted.evidence.evidenceFingerprint,
      recoveryState: adopted.evidence.recoveryState ?? null,
    },
    adjustments,
    plannedSessionCount: adopted.days.filter((day) => day.session).length,
    linkedWorkouts: windowLinks,
    recoveryObservations: windowRecovery,
    recoveryObservationTotal,
    followUpState: hasFollowUp ? 'observed' : 'unknown',
    limitations: [
      '训练仅来自你仍保留的明确计划关联；未关联不代表没有训练或没有执行计划。',
      '恢复记录与训练发生在采用之后，只说明时间先后，不能单独证明计划造成了变化。',
      '缺少记录时结果保持 Unknown；本回看不会自动评分、改写身体状态或调整下一份计划。',
      ...(adopted.evidence.recoveryState
        ? []
        : ['这份旧计划没有保存底层恢复状态证据，只能追溯到当时的计划摘要。']),
    ],
  })
}
