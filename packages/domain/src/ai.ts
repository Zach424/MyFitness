import type { AiExplanationContent, AiPlanContext, WeeklyPlan } from '@myfitness/contracts'
import {
  aiExplanationContentSchema,
  aiExplanationEvidenceKeys,
  aiPlanContextSchema,
} from '@myfitness/contracts'

const unsafeCopyPatterns = [
  /诊断|治疗|治愈|处方|患者|疾病|病症/u,
  /保证|必须|惩罚|燃脂|快速减重/u,
  /热量缺口|卡路里|千卡|kcal/iu,
  /\d+(?:\.\d+)?\s*(?:kg|公斤|斤|克蛋白|g\s*蛋白)/iu,
  /BMI/iu,
]

const contentText = (content: AiExplanationContent) =>
  [
    content.headline,
    content.overview,
    ...content.highlights.flatMap((highlight) => [highlight.title, highlight.detail]),
    content.nextStep,
  ].join('\n')

const numbersIn = (value: string) =>
  [...value.matchAll(/(?<![\d.])\d+(?:\.\d+)?(?![\d.])/g)].map((match) => Number(match[0]))

const allowedNumbers = (context: AiPlanContext) => {
  const values = new Set<number>([
    context.planRevision,
    context.sessions.length,
    ...context.sessions.map((session) => session.plannedMinutes),
    context.evidence.onboardingRevision,
    context.evidence.recentActiveDays,
    context.evidence.recentWorkoutCount,
    context.evidence.recentActiveMinutes,
    context.evidence.recentMealCount,
  ])
  if (context.evidence.readinessScore !== null) values.add(context.evidence.readinessScore)
  return values
}

export const buildAiPlanContext = (plan: WeeklyPlan): AiPlanContext =>
  aiPlanContextSchema.parse({
    planId: plan.id,
    planRevision: plan.revision,
    weekStart: plan.weekStart,
    status: plan.status,
    sessions: plan.days.flatMap((day) =>
      day.session
        ? [
            {
              date: day.date,
              title: day.session.title,
              kind: day.session.kind,
              plannedMinutes: day.session.plannedMinutes,
              intensity: day.session.intensity,
              activities: day.session.activities.map((activity) => {
                const selected = activity.options.find(
                  (option) => option.id === activity.selectedOptionId,
                )
                return selected?.title ?? activity.options[0]!.title
              }),
            },
          ]
        : [],
    ),
    nutritionFocuses: plan.nutritionFocuses.map(({ title, action }) => ({ title, action })),
    reasons: plan.reasons,
    evidence: plan.evidence,
    evidenceKeys: aiExplanationEvidenceKeys,
  })

export const validateAiExplanation = (
  candidate: unknown,
  context: AiPlanContext,
): { valid: true; content: AiExplanationContent } | { valid: false; reasons: string[] } => {
  const parsed = aiExplanationContentSchema.safeParse(candidate)
  if (!parsed.success) return { valid: false, reasons: ['schema_invalid'] }

  const reasons: string[] = []
  const text = contentText(parsed.data)
  if (unsafeCopyPatterns.some((pattern) => pattern.test(text))) reasons.push('unsafe_copy')

  const permittedKeys = new Set(context.evidenceKeys)
  if (
    parsed.data.highlights.some((highlight) =>
      highlight.evidenceKeys.some((key) => !permittedKeys.has(key)),
    )
  ) {
    reasons.push('unknown_evidence')
  }

  const permittedNumbers = allowedNumbers(context)
  if (numbersIn(text).some((value) => !permittedNumbers.has(value))) {
    reasons.push('unsupported_number')
  }

  return reasons.length ? { valid: false, reasons } : { valid: true, content: parsed.data }
}

export const buildDeterministicAiFallback = (context: AiPlanContext): AiExplanationContent => {
  const recoveryCopy =
    context.evidence.readinessScore === null
      ? '恢复依据不足，所以原计划保持轻松，并给变化留出空间。'
      : '原计划已经把最近的恢复摘要作为保守调整依据，而不是医学判断。'
  const activityCopy =
    context.sessions.length === 0
      ? '这一周没有安排结构化训练，先检查可用时间和个人资料是否仍符合实际。'
      : '训练被放在已确认的可用日，动作仍可在计划列出的选项中替换。'

  return aiExplanationContentSchema.parse({
    headline: '先按现有节奏观察一周',
    overview: '这份说明只整理计划已经使用的依据；没有新增训练量，也没有改变任何动作。',
    highlights: [
      {
        title: '安排来自已确认时间',
        detail: activityCopy,
        evidenceKeys: ['plan_schedule', 'plan_experience'],
      },
      {
        title: '恢复信息只用于保守调整',
        detail: recoveryCopy,
        evidenceKeys: ['plan_recovery', 'recent_activity'],
      },
      {
        title: '饮食关注点保持定性',
        detail: '继续从规律、食物多样性、饮水和适合自身偏好的选择开始。',
        evidenceKeys: ['nutrition_focus', 'recent_meals'],
      },
    ],
    nextStep: '先检查计划是否符合这一周的真实时间；需要时替换动作，再决定是否采用。',
  })
}
