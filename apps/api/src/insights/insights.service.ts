import { Injectable } from '@nestjs/common'
import type { Dashboard, TodayEvidence, TrendWindow } from '@myfitness/contracts'

import { DatabaseService } from '../database/database.service'

type HealthRow = {
  id: string
  metric: string
  display_value: string
  display_unit: string
  canonical_value: string
  occurred_at: Date
  revision: number
}

type WorkoutRow = {
  id: string
  title: string
  occurred_at: Date
  completed_sets: string
  total_sets: string
  volume_kg: string
  active_seconds: string
  revision: number
}

type MealRow = {
  id: string
  title: string
  occurred_at: Date
  energy_kcal: string
  protein_g: string
  item_count: string
  revision: number
}

export type InsightRows = {
  health: HealthRow[]
  workouts: WorkoutRow[]
  meals: MealRow[]
}

const metricLabels: Record<string, string> = {
  'body.weight': '体重',
  'body.waist': '腰围',
  'body.body_fat': '体脂估计',
  'body.resting_heart_rate': '静息心率',
  'recovery.sleep_duration': '睡眠时长',
  'recovery.sleep_quality': '睡眠质量',
  'recovery.soreness': '酸痛感',
  'recovery.energy': '精力',
  'recovery.stress': '压力',
}

const recoveryMetrics = new Set([
  'recovery.sleep_duration',
  'recovery.sleep_quality',
  'recovery.soreness',
  'recovery.energy',
  'recovery.stress',
])
const readinessMetrics = [
  'recovery.energy',
  'recovery.sleep_quality',
  'recovery.stress',
  'recovery.soreness',
]

const displayUnitLabels: Record<string, string> = {
  score_1_5: '/5',
}

const displayMeasurement = (value: string, unit: string) =>
  `${Number(value)} ${displayUnitLabels[unit] ?? unit}`

const round = (value: number, precision = 1) => {
  const factor = 10 ** precision
  return Math.round((value + Number.EPSILON) * factor) / factor
}

const localDay = (date: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

const timeValue = (value: Date) => value.getTime()

export const buildDashboard = (rows: InsightRows, timezone: string, at = new Date()): Dashboard => {
  const today = localDay(at, timezone)
  const evidence: TodayEvidence[] = [
    ...rows.health
      .filter((row) => localDay(row.occurred_at, timezone) === today)
      .map((row) => ({
        id: row.id,
        kind: recoveryMetrics.has(row.metric) ? ('recovery' as const) : ('body' as const),
        occurredAt: row.occurred_at.toISOString(),
        title: metricLabels[row.metric] ?? row.metric,
        value: displayMeasurement(row.display_value, row.display_unit),
        note: `已确认 · v${row.revision}`,
      })),
    ...rows.workouts
      .filter((row) => localDay(row.occurred_at, timezone) === today)
      .map((row) => ({
        id: row.id,
        kind: 'workout' as const,
        occurredAt: row.occurred_at.toISOString(),
        title: row.title,
        value: `${Number(row.completed_sets)}/${Number(row.total_sets)} 组`,
        note: `${round(Number(row.volume_kg))} kg 训练量 · v${row.revision}`,
      })),
    ...rows.meals
      .filter((row) => localDay(row.occurred_at, timezone) === today)
      .map((row) => ({
        id: row.id,
        kind: 'nutrition' as const,
        occurredAt: row.occurred_at.toISOString(),
        title: row.title,
        value: `${Math.round(Number(row.energy_kcal))} kcal`,
        note: `${Number(row.item_count)} 种食物 · P ${round(Number(row.protein_g))} g · v${row.revision}`,
      })),
  ].sort((a, b) => timeValue(new Date(a.occurredAt)) - timeValue(new Date(b.occurredAt)))

  const recentBoundary = at.getTime() - 3 * 86_400_000
  const latest = new Map<string, HealthRow>()
  for (const row of rows.health) {
    if (row.occurred_at.getTime() < recentBoundary || !readinessMetrics.includes(row.metric))
      continue
    if (!latest.has(row.metric)) latest.set(row.metric, row)
  }
  const factors = [...latest.entries()].map(([metric, row]) => ({
    label: metricLabels[metric] ?? metric,
    value: displayMeasurement(row.display_value, row.display_unit),
  }))
  const normalizedScores = [...latest.entries()].map(([metric, row]) => {
    const value = Number(row.canonical_value)
    return metric === 'recovery.stress' || metric === 'recovery.soreness' ? 6 - value : value
  })
  const readinessScore = normalizedScores.length
    ? Math.round(
        (normalizedScores.reduce((sum, value) => sum + value, 0) / normalizedScores.length / 5) *
          100,
      )
    : null
  const readiness =
    readinessScore === null
      ? {
          score: null,
          label: '等待恢复记录',
          note: '近 3 天还没有足够的精力、睡眠、压力或酸痛记录；先记录，再判断。',
          factors,
        }
      : {
          score: readinessScore,
          label:
            readinessScore >= 80
              ? '恢复信号较稳'
              : readinessScore >= 60
                ? '恢复尚可'
                : '建议保守安排',
          note: `根据近 3 天 ${normalizedScores.length} 项主观记录做等权整理；这是记录摘要，不是医学评分。`,
          factors,
        }

  const trends = ([7, 30, 90] as const).map((days): TrendWindow => {
    const boundary = at.getTime() - days * 86_400_000
    const health = rows.health.filter((row) => row.occurred_at.getTime() >= boundary)
    const workouts = rows.workouts.filter((row) => row.occurred_at.getTime() >= boundary)
    const meals = rows.meals.filter((row) => row.occurred_at.getTime() >= boundary)
    const activeDays = new Set([
      ...health.map((row) => localDay(row.occurred_at, timezone)),
      ...workouts.map((row) => localDay(row.occurred_at, timezone)),
      ...meals.map((row) => localDay(row.occurred_at, timezone)),
    ]).size
    return {
      days,
      activeDays,
      measurementCount: health.length,
      workoutCount: workouts.length,
      mealCount: meals.length,
      workoutVolumeKg: round(workouts.reduce((sum, row) => sum + Number(row.volume_kg), 0)),
      activeMinutes: round(workouts.reduce((sum, row) => sum + Number(row.active_seconds), 0) / 60),
      energyKcal: round(meals.reduce((sum, row) => sum + Number(row.energy_kcal), 0)),
      proteinG: round(meals.reduce((sum, row) => sum + Number(row.protein_g), 0)),
    }
  })

  return {
    generatedAt: at.toISOString(),
    timezone,
    today: { date: today, items: evidence },
    readiness,
    trends,
  }
}

@Injectable()
export class InsightsService {
  constructor(private readonly database: DatabaseService) {}

  async dashboard(userId: string, timezone: string, at = new Date()) {
    const since = new Date(at.getTime() - 91 * 86_400_000)
    const [health, workouts, meals] = await Promise.all([
      this.database.query<HealthRow>(
        `
          SELECT id, metric, display_value, display_unit, canonical_value, occurred_at, revision
          FROM health_records
          WHERE user_id = $1 AND deleted_at IS NULL AND status = 'confirmed' AND occurred_at >= $2
          ORDER BY occurred_at DESC
        `,
        [userId, since],
      ),
      this.database.query<WorkoutRow>(
        `
          SELECT w.id, w.title, w.started_at AS occurred_at, w.revision,
            COUNT(s.id) FILTER (WHERE s.completed)::text AS completed_sets,
            COUNT(s.id)::text AS total_sets,
            COALESCE(SUM(s.canonical_load_kg * s.reps) FILTER (WHERE s.completed), 0)::text AS volume_kg,
            COALESCE(SUM(s.duration_seconds) FILTER (WHERE s.completed), 0)::text AS active_seconds
          FROM workout_sessions w
          JOIN workout_exercises e ON e.workout_id = w.id
          JOIN workout_sets s ON s.exercise_id = e.id
          WHERE w.user_id = $1 AND w.deleted_at IS NULL AND w.started_at >= $2
          GROUP BY w.id
          ORDER BY w.started_at DESC
        `,
        [userId, since],
      ),
      this.database.query<MealRow>(
        `
          SELECT m.id, m.title, m.occurred_at, m.revision,
            COUNT(i.id)::text AS item_count,
            COALESCE(SUM(i.energy_kcal_per_100g * i.canonical_grams / 100), 0)::text AS energy_kcal,
            COALESCE(SUM(i.protein_g_per_100g * i.canonical_grams / 100), 0)::text AS protein_g
          FROM nutrition_meals m
          JOIN nutrition_meal_items i ON i.meal_id = m.id
          WHERE m.user_id = $1 AND m.deleted_at IS NULL AND m.occurred_at >= $2
          GROUP BY m.id
          ORDER BY m.occurred_at DESC
        `,
        [userId, since],
      ),
    ])
    return buildDashboard(
      { health: health.rows, workouts: workouts.rows, meals: meals.rows },
      timezone,
      at,
    )
  }
}
