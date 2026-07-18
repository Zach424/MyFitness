import type {
  Dashboard,
  OnboardingResponse,
  PlanDecision,
  WeeklyPlanContent,
} from '@myfitness/contracts'
import { weekdays, weeklyPlanContentSchema } from '@myfitness/contracts'

type PlanningInput = {
  weekStart: string
  onboarding: OnboardingResponse
  dashboard: Dashboard
}

type PlanSession = NonNullable<WeeklyPlanContent['days'][number]['session']>
type ActivityOption = PlanSession['activities'][number]['options'][number]

const option = (
  id: string,
  title: string,
  dose: string,
  equipment: ActivityOption['equipment'] = [],
  note?: string,
): ActivityOption => ({ id, title, dose, equipment, ...(note ? { note } : {}) })

const dateAtOffset = (weekStart: string, offset: number) => {
  const date = new Date(`${weekStart}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

const evenlySelect = (values: number[], count: number) => {
  if (count >= values.length) return values
  if (count === 1) return [values[Math.floor(values.length / 2)]!]
  return Array.from({ length: count }, (_, index) => {
    const position = Math.round((index * (values.length - 1)) / (count - 1))
    return values[position]!
  })
}

const strengthDose = (experience: OnboardingResponse['goal']['experience']) => {
  if (experience === 'beginner') return '2 组 × 6–10 次，保留约 3 次余力'
  if (experience === 'intermediate') return '3 组 × 8–12 次，保留约 2–3 次余力'
  return '3 组 × 6–12 次，动作稳定后再调整负荷'
}

const compatibleOptions = (
  candidates: ActivityOption[],
  equipment: OnboardingResponse['goal']['equipment'],
  experience: OnboardingResponse['goal']['experience'],
) => {
  const allowed = new Set([...equipment, 'bodyweight'])
  const filtered = candidates.filter((candidate) =>
    candidate.equipment.every((item) => allowed.has(item)),
  )
  if (experience === 'beginner') return filtered
  const firstLoaded = filtered.findIndex((candidate) =>
    candidate.equipment.some((item) => item !== 'bodyweight'),
  )
  if (firstLoaded <= 0) return filtered
  return [
    filtered[firstLoaded]!,
    ...filtered.slice(0, firstLoaded),
    ...filtered.slice(firstLoaded + 1),
  ]
}

const strengthActivity = (
  day: string,
  role: 'squat' | 'hinge' | 'push' | 'pull' | 'core',
  candidates: ActivityOption[],
  onboarding: OnboardingResponse,
) => {
  const options = compatibleOptions(
    candidates,
    onboarding.goal.equipment,
    onboarding.goal.experience,
  )
  return {
    id: `${day}_${role}`,
    role,
    selectedOptionId: options[0]!.id,
    options,
    safetyNote: '全程保持可控；出现明显疼痛、胸部不适或眩晕时停止。',
  } as const
}

const strengthSession = (
  weekday: string,
  sequence: number,
  onboarding: OnboardingResponse,
  intensity: 'easy' | 'moderate',
  plannedMinutes: number,
): NonNullable<WeeklyPlanContent['days'][number]['session']> => {
  const dose = strengthDose(onboarding.goal.experience)
  const warmup = {
    id: `${weekday}_warmup`,
    role: 'warmup' as const,
    selectedOptionId: 'comfortable_warmup',
    options: [option('comfortable_warmup', '舒适步行与关节活动', '约 5 分钟，逐渐进入活动状态')],
  }
  const squat = strengthActivity(
    weekday,
    'squat',
    [
      option('chair_squat', '椅子深蹲', dose, ['bodyweight']),
      option('goblet_squat', '高脚杯深蹲', dose, ['dumbbells']),
      option('band_squat', '弹力带深蹲', dose, ['bands']),
      option('leg_press', '坐姿腿举', dose, ['machines']),
      option('barbell_squat', '杠铃深蹲', dose, ['barbell'], '只使用已经熟悉且能稳定控制的负荷。'),
    ],
    onboarding,
  )
  const hinge = strengthActivity(
    weekday,
    'hinge',
    [
      option('glute_bridge', '臀桥', dose, ['bodyweight']),
      option('dumbbell_rdl', '哑铃罗马尼亚硬拉', dose, ['dumbbells']),
      option('band_good_morning', '弹力带髋铰链', dose, ['bands']),
      option('leg_curl', '器械腿弯举', dose, ['machines']),
      option('barbell_rdl', '杠铃罗马尼亚硬拉', dose, ['barbell'], '只选择已经掌握的动作。'),
    ],
    onboarding,
  )
  const push = strengthActivity(
    weekday,
    'push',
    [
      option('wall_pushup', '墙面俯卧撑', dose, ['bodyweight']),
      option('incline_pushup', '斜面俯卧撑', dose, ['bodyweight']),
      option('dumbbell_floor_press', '哑铃地板卧推', dose, ['dumbbells']),
      option('band_press', '弹力带推胸', dose, ['bands']),
      option('machine_chest_press', '器械推胸', dose, ['machines']),
    ],
    onboarding,
  )
  const pull = strengthActivity(
    weekday,
    'pull',
    [
      option('prone_w_raise', '俯卧 W 形抬臂', dose, ['bodyweight']),
      option('one_arm_dumbbell_row', '单臂哑铃划船', dose, ['dumbbells']),
      option('band_row', '弹力带划船', dose, ['bands']),
      option('seated_row', '器械坐姿划船', dose, ['machines']),
      option('barbell_row', '杠铃划船', dose, ['barbell'], '只选择已经掌握的动作。'),
    ],
    onboarding,
  )
  const core = strengthActivity(
    weekday,
    'core',
    [
      option('dead_bug', '死虫式', '2 组 × 每侧 6–10 次，保持自然呼吸', ['bodyweight']),
      option('bird_dog', '鸟狗式', '2 组 × 每侧 6–10 次，动作缓慢', ['bodyweight']),
    ],
    onboarding,
  )
  const activities =
    plannedMinutes <= 25
      ? [warmup, squat, push, pull, core]
      : [warmup, squat, hinge, push, pull, core]
  return {
    kind: 'strength',
    title: `全身力量 ${sequence === 1 ? 'A' : 'B'}`,
    plannedMinutes,
    intensity,
    activities,
    note: '按可用时间完成，不为凑满组数牺牲动作质量；这是一份可调整的起步安排。',
  }
}

const cardioSession = (
  weekday: string,
  equipment: OnboardingResponse['goal']['equipment'],
  intensity: 'easy' | 'moderate',
  minutes: number,
): NonNullable<WeeklyPlanContent['days'][number]['session']> => {
  const options = [
    option('brisk_walk', '舒适快走', '以能说完整句子的节奏连续或分段完成'),
    ...(equipment.includes('cardio')
      ? [option('cardio_machine', '单车或椭圆机', '选择低冲击、能稳定交谈的节奏', ['cardio'])]
      : []),
  ]
  return {
    kind: 'cardio',
    title: '轻松心肺',
    plannedMinutes: minutes,
    intensity,
    activities: [
      {
        id: `${weekday}_cardio`,
        role: 'cardio',
        selectedOptionId: options[0]!.id,
        options,
        safetyNote: '不要用憋气或无法交谈的强度追赶分钟数。',
      },
    ],
    note: '可以拆成两段完成；任何活动都比完全不动更有价值。',
  }
}

const recoverySession = (
  weekday: string,
  minutes: number,
): NonNullable<WeeklyPlanContent['days'][number]['session']> => ({
  kind: 'recovery',
  title: '恢复活动',
  plannedMinutes: Math.min(minutes, 30),
  intensity: 'easy',
  activities: [
    {
      id: `${weekday}_mobility`,
      role: 'mobility',
      selectedOptionId: 'mobility_flow',
      options: [
        option('mobility_flow', '舒适活动与散步', '10–30 分钟，不追求拉伸疼痛'),
        option('easy_walk', '轻松散步', '按当天状态分段完成'),
      ],
    },
  ],
  note: '恢复日不是补课日；感觉变差时可以完全休息。',
})

const proteinCopy = (preferences: OnboardingResponse['goal']['dietaryPreferences']) => {
  if (preferences.includes('vegan')) return '在正餐中安排豆类、豆腐、豆浆等可接受的植物蛋白来源。'
  if (preferences.includes('vegetarian')) {
    return '在正餐中安排蛋奶、豆类或豆制品等你能接受的蛋白来源。'
  }
  if (preferences.includes('lactose_free')) {
    return '在正餐中安排鱼禽蛋、豆制品或无乳糖且适合你的蛋白来源。'
  }
  return '在正餐中安排鱼禽蛋、奶豆或其他符合你饮食习惯的蛋白来源。'
}

export const assessPlanEligibility = (onboarding: OnboardingResponse) =>
  onboarding.eligibility.status === 'eligible'
    ? ({ allowed: true } as const)
    : ({
        allowed: false,
        code: 'professional_clearance_required',
        message: '当前风险回答需要先取得专业许可；记录功能仍可继续使用。',
        riskFlags: onboarding.eligibility.riskFlags,
      } as const)

export const buildWeeklyPlanContent = ({
  weekStart,
  onboarding,
  dashboard,
}: PlanningInput): WeeklyPlanContent => {
  const sevenDay = dashboard.trends.find((trend) => trend.days === 7)!
  const readiness = dashboard.readiness.score
  const intensity = readiness === null || readiness < 60 ? 'easy' : 'moderate'
  const experienceCap = { beginner: 2, intermediate: 3, advanced: 4 }[onboarding.goal.experience]
  const recoveryCap = readiness === null || readiness < 60 ? 2 : experienceCap
  const availableIndexes = weekdays
    .map((weekday, index) => (onboarding.goal.availableDays.includes(weekday) ? index : -1))
    .filter((index) => index >= 0)
  const sessionCount = Math.min(availableIndexes.length, experienceCap, recoveryCap)
  const selectedIndexes = evenlySelect(availableIndexes, sessionCount)
  const selectedOrder = new Map(selectedIndexes.map((index, order) => [index, order]))
  const plannedMinutes = Math.max(
    15,
    Math.min(
      onboarding.goal.sessionMinutes,
      onboarding.goal.experience === 'beginner' ? 45 : 60,
      readiness !== null && readiness < 60 ? 35 : 90,
    ),
  )
  let strengthSequence = 0
  const sessionKinds =
    sessionCount <= 2
      ? Array.from({ length: sessionCount }, () => 'strength' as const)
      : sessionCount === 3
        ? (['strength', 'cardio', 'strength'] as const)
        : (['strength', 'cardio', 'strength', 'recovery'] as const)

  const days = weekdays.map((weekday, index) => {
    const order = selectedOrder.get(index)
    const kind = order === undefined ? undefined : sessionKinds[order]
    let session: WeeklyPlanContent['days'][number]['session'] = null
    if (kind === 'strength') {
      strengthSequence += 1
      session = strengthSession(weekday, strengthSequence, onboarding, intensity, plannedMinutes)
    } else if (kind === 'cardio') {
      session = cardioSession(weekday, onboarding.goal.equipment, intensity, plannedMinutes)
    } else if (kind === 'recovery') {
      session = recoverySession(weekday, plannedMinutes)
    }
    return {
      weekday,
      date: dateAtOffset(weekStart, index),
      available: onboarding.goal.availableDays.includes(weekday),
      session,
    }
  })

  const reasons: WeeklyPlanContent['reasons'] = [
    {
      code: 'schedule_respected',
      label: '按你的时间排布',
      detail: `只在你选择的 ${onboarding.goal.availableDays.length} 个可用日中安排结构化活动。`,
    },
    {
      code: 'experience_capped',
      label: '训练量有上限',
      detail: `${onboarding.goal.experience === 'beginner' ? '入门' : onboarding.goal.experience === 'intermediate' ? '进阶' : '熟练'}阶段本周最多安排 ${experienceCap} 个结构化训练日。`,
    },
    {
      code: readiness === null ? 'recovery_missing' : 'recovery_considered',
      label: readiness === null ? '恢复证据不足' : '已考虑恢复记录',
      detail:
        readiness === null
          ? '没有用空白数据生成“正常”分数，因此先采用轻松强度。'
          : `生成时的恢复摘要为 ${readiness}/100；它只用于保守调整，不是医学判断。`,
    },
    {
      code: 'public_guidance_context',
      label: '公共指南只作背景',
      detail: '计划保留力量和日常活动，但不会把一般人群建议冒充个人处方或要求一次补齐。',
    },
  ]

  return weeklyPlanContentSchema.parse({
    days,
    nutritionFocuses: [
      {
        key: 'regular_meals',
        title: '规律进餐',
        action: '优先保持日常餐次稳定，不用漏餐来补偿某一次吃得较多。',
        reason: '稳定的记录和进餐节奏比短期极端限制更容易复盘。',
        alternatives: ['时间紧时先保留一份简单正餐', '外食时仍按平常餐次记录'],
      },
      {
        key: 'food_variety',
        title: '食物多样',
        action: '每天尽量从谷薯、蔬果和蛋白来源中搭配多类食物。',
        reason: '这里只提示搭配结构，不根据不完整数据规定克数或热量。',
        alternatives: ['同类食物轮换', '用小份量增加种类'],
      },
      {
        key: 'protein_source',
        title: '可接受的蛋白来源',
        action: proteinCopy(onboarding.goal.dietaryPreferences),
        reason: '遵守你在个人资料中选择的饮食偏好，不自动替换为冲突食物。',
        alternatives: ['按偏好在同类食物中替换', '无法确认配料时先记录再补充'],
      },
      {
        key: 'hydration',
        title: '饮水提醒',
        action: '训练前后和日常分次饮水，优先选择白水或无糖饮品。',
        reason: '不根据有限记录给出强制饮水量。',
        alternatives: ['随餐饮水', '外出时携带水杯'],
      },
    ],
    reasons,
    evidence: {
      onboardingRevision: onboarding.revision,
      dashboardGeneratedAt: dashboard.generatedAt,
      readinessScore: readiness,
      recentActiveDays: sevenDay.activeDays,
      recentWorkoutCount: sevenDay.workoutCount,
      recentActiveMinutes: sevenDay.activeMinutes,
      recentMealCount: sevenDay.mealCount,
    },
  })
}

export class PlanSelectionError extends Error {}

export const applyPlanSelections = (
  content: WeeklyPlanContent,
  selections: PlanDecision['selections'],
) => {
  const requested = new Map(
    selections.map((selection) => [selection.activityId, selection.optionId]),
  )
  const seen = new Set<string>()
  const next = {
    ...content,
    days: content.days.map((day) => ({
      ...day,
      session: day.session
        ? {
            ...day.session,
            activities: day.session.activities.map((activity) => {
              const optionId = requested.get(activity.id)
              if (!optionId) return activity
              if (!activity.options.some((candidate) => candidate.id === optionId)) {
                throw new PlanSelectionError(
                  `option ${optionId} is not available for ${activity.id}`,
                )
              }
              seen.add(activity.id)
              return { ...activity, selectedOptionId: optionId }
            }),
          }
        : null,
    })),
  }
  const missing = [...requested.keys()].filter((activityId) => !seen.has(activityId))
  if (missing.length) throw new PlanSelectionError(`unknown activity ${missing[0]}`)
  return weeklyPlanContentSchema.parse(next)
}
