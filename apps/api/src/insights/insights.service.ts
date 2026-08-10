import { Injectable } from '@nestjs/common'
import type {
  Dashboard,
  ExerciseInsight,
  ExerciseInsightPoint,
  ExerciseInsightWindow,
  HealthInsight,
  HealthInsightPoint,
  HealthInsightWindow,
  HistoryCalendar,
  HistoryCalendarDay,
  MetricCode,
  NutritionInsight,
  NutritionInsightDay,
  NutritionInsightWindow,
  PersonalStateInvalidationReason,
  PersonalStateLedger,
  PlanExperienceChoice,
  RecordSource,
  SubjectiveRecoveryMetric,
  TodayEvidence,
  TrendWindow,
  UnitCode,
} from '@myfitness/contracts'
import { personalStateLedgerPolicyVersion, subjectiveRecoveryMetrics } from '@myfitness/contracts'
import { estimateSubjectiveRecoveryState } from '@myfitness/domain'

import { DatabaseService } from '../database/database.service'

type HealthRow = {
  id: string
  metric: string
  display_value: string
  display_unit: string
  canonical_value: string
  occurred_at: Date
  revision: number
  source_kind: RecordSource['kind']
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

type PlanExperienceRow = {
  plan_id: string
  plan_revision: number
  experience: PlanExperienceChoice
  revision: number
  updated_at: Date
}

export type InsightRows = {
  health: HealthRow[]
  workouts: WorkoutRow[]
  meals: MealRow[]
  planExperience: PlanExperienceRow | null
}

type ExerciseWindowRow = {
  days: number
  session_count: string
  completed_set_count: string
  total_reps: string
  volume_kg: string
  active_seconds: string
  distance_meters: string
}

type ExercisePointRow = {
  workout_id: string
  workout_revision: number
  occurred_at: Date
  name: string
  category: ExerciseInsightPoint['identity']['category']
  tracking_mode: ExerciseInsightPoint['identity']['trackingMode']
  equipment: ExerciseInsightPoint['identity']['equipment']
  equipment_notes: string | null
  completed_set_count: string
  total_set_count: string
  total_reps: string
  volume_kg: string
  active_seconds: string
  distance_meters: string
}

type NutritionDayRow = {
  local_date: string
  meal_count: string
  item_count: string
  fiber_known_item_count: string
  energy_kcal: string | null
  protein_g: string | null
  carbohydrate_g: string | null
  fat_g: string | null
  fiber_g: string | null
}

type HealthWindowRow = {
  days: number
  record_count: string
  recorded_days: string
  minimum: string | null
  maximum: string | null
  average: string | null
}

type HealthPointRow = {
  record_id: string
  record_revision: number
  occurred_at: Date
  timezone: string
  canonical_value: string
  canonical_unit: UnitCode
  display_value: string
  display_unit: UnitCode
  source_kind: HealthInsightPoint['source']['kind']
  source_metadata: Record<string, string>
}

type HistoryCalendarDayRow = {
  local_date: string
  health_record_count: string
  workout_count: string
  meal_count: string
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
const subjectiveRecoveryMetricSet = new Set<string>(subjectiveRecoveryMetrics)

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

const assertValidInsightTimezone = (timezone: string, at: Date) => {
  try {
    localDay(at, timezone)
  } catch {
    throw new Error('insight timezone must be a valid IANA timezone')
  }
}

const assertInsightPointRowOrder = (rows: Array<{ occurred_at: Date }>) => {
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index]!.occurred_at.getTime() > rows[index - 1]!.occurred_at.getTime()) {
      throw new Error('insight point rows must be ordered by occurred_at descending')
    }
  }
}

const assertUniqueInsightPointRowIds = <Row>(rows: Row[], idOf: (row: Row) => string) => {
  const seen = new Set<string>()
  rows.forEach((row) => {
    const id = idOf(row)
    if (seen.has(id)) {
      throw new Error('insight point rows must have unique aggregate ids')
    }
    seen.add(id)
  })
}

const assertHealthPointCanonicalUnitConsistency = (rows: HealthPointRow[]) => {
  const canonicalUnit = rows[0]?.canonical_unit
  if (rows.some((row) => row.canonical_unit !== canonicalUnit)) {
    throw new Error('health insight point rows must share one canonical unit')
  }
}

const shiftLocalDate = (localDate: string, days: number) => {
  const [year, month, day] = localDate.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10)
}

const expectedLocalDateSeries = (at: Date, timezone: string, length: number) => {
  const endDate = localDay(at, timezone)
  return Array.from({ length }, (_, index) => shiftLocalDate(endDate, index - length + 1))
}

const timeValue = (value: Date) => value.getTime()

const exerciseWindow = (days: 7 | 30 | 90, row?: ExerciseWindowRow): ExerciseInsightWindow => ({
  days,
  sessionCount: Number(row?.session_count ?? 0),
  completedSetCount: Number(row?.completed_set_count ?? 0),
  totalReps: Number(row?.total_reps ?? 0),
  volumeKg: round(Number(row?.volume_kg ?? 0), 2),
  activeMinutes: round(Number(row?.active_seconds ?? 0) / 60, 1),
  distanceKm: round(Number(row?.distance_meters ?? 0) / 1_000, 2),
})

const exercisePoint = (row: ExercisePointRow, timezone: string): ExerciseInsightPoint => ({
  workoutId: row.workout_id,
  workoutRevision: row.workout_revision,
  occurredAt: row.occurred_at.toISOString(),
  localDate: localDay(row.occurred_at, timezone),
  identity: {
    name: row.name,
    category: row.category,
    trackingMode: row.tracking_mode,
    equipment: row.equipment,
    equipmentNotes: row.equipment_notes,
  },
  completedSetCount: Number(row.completed_set_count),
  totalSetCount: Number(row.total_set_count),
  totalReps: Number(row.total_reps),
  volumeKg: round(Number(row.volume_kg), 2),
  activeMinutes: round(Number(row.active_seconds) / 60, 1),
  distanceKm: round(Number(row.distance_meters) / 1_000, 2),
})

export const buildExerciseInsight = (
  exerciseKey: string,
  windowRows: ExerciseWindowRow[],
  pointRows: ExercisePointRow[],
  timezone: string,
  at = new Date(),
): ExerciseInsight => {
  assertValidInsightTimezone(timezone, at)
  assertInsightPointRowOrder(pointRows)
  assertUniqueInsightPointRowIds(pointRows, (row) => row.workout_id)
  const eligiblePointRows = pointRows.filter((row) => row.occurred_at.getTime() <= at.getTime())
  const series = eligiblePointRows.slice(0, 180).map((row) => exercisePoint(row, timezone))
  return {
    generatedAt: at.toISOString(),
    timezone,
    exerciseKey,
    identity: series[0]?.identity ?? null,
    windows: ([7, 30, 90] as const).map((days) =>
      exerciseWindow(
        days,
        windowRows.find((row) => row.days === days),
      ),
    ),
    series,
    hasMore: eligiblePointRows.length > 180,
  }
}

const nullableRound = (value: string | null, precision = 2) =>
  value === null ? null : round(Number(value), precision)

const nutritionDay = (row: NutritionDayRow): NutritionInsightDay => {
  const mealCount = Number(row.meal_count)
  return {
    localDate: row.local_date,
    hasEvidence: mealCount > 0,
    mealCount,
    itemCount: Number(row.item_count),
    fiberKnownItemCount: Number(row.fiber_known_item_count),
    nutrients: {
      energyKcal: nullableRound(row.energy_kcal),
      proteinG: nullableRound(row.protein_g),
      carbohydrateG: nullableRound(row.carbohydrate_g),
      fatG: nullableRound(row.fat_g),
      fiberG: nullableRound(row.fiber_g),
    },
  }
}

const sumRecordedNutrient = (
  days: NutritionInsightDay[],
  nutrient: keyof NutritionInsightDay['nutrients'],
) => {
  const values = days.flatMap((day) => {
    const value = day.nutrients[nutrient]
    return value === null ? [] : [value]
  })
  return values.length
    ? round(
        values.reduce((total, value) => total + value, 0),
        2,
      )
    : null
}

const nutritionWindow = (
  series: NutritionInsightDay[],
  days: 7 | 30 | 90,
): NutritionInsightWindow => {
  const selected = series.slice(-days)
  const recordedDays = selected.filter((day) => day.hasEvidence).length
  return {
    days,
    recordedDays,
    missingDays: days - recordedDays,
    mealCount: selected.reduce((total, day) => total + day.mealCount, 0),
    itemCount: selected.reduce((total, day) => total + day.itemCount, 0),
    fiberKnownItemCount: selected.reduce((total, day) => total + day.fiberKnownItemCount, 0),
    nutrients: {
      energyKcal: sumRecordedNutrient(selected, 'energyKcal'),
      proteinG: sumRecordedNutrient(selected, 'proteinG'),
      carbohydrateG: sumRecordedNutrient(selected, 'carbohydrateG'),
      fatG: sumRecordedNutrient(selected, 'fatG'),
      fiberG: sumRecordedNutrient(selected, 'fiberG'),
    },
  }
}

export const buildNutritionInsight = (
  rows: NutritionDayRow[],
  timezone: string,
  at = new Date(),
): NutritionInsight => {
  const expectedDates = expectedLocalDateSeries(at, timezone, 90)
  if (
    rows.length !== expectedDates.length ||
    rows.some((row, index) => row.local_date !== expectedDates[index])
  ) {
    throw new Error('nutrition insight rows must cover the reference local-date range')
  }
  const series = rows.map(nutritionDay)
  return {
    generatedAt: at.toISOString(),
    timezone,
    windows: ([7, 30, 90] as const).map((days) => nutritionWindow(series, days)),
    series,
  }
}

const healthWindow = (days: 7 | 30 | 90, row?: HealthWindowRow): HealthInsightWindow => ({
  days,
  recordCount: Number(row?.record_count ?? 0),
  recordedDays: Number(row?.recorded_days ?? 0),
  statistics: {
    minimum: nullableRound(row?.minimum ?? null, 4),
    maximum: nullableRound(row?.maximum ?? null, 4),
    average: nullableRound(row?.average ?? null, 4),
  },
})

const healthPoint = (row: HealthPointRow, timezone: string): HealthInsightPoint => {
  const metadata = row.source_metadata ?? {}
  return {
    recordId: row.record_id,
    recordRevision: row.record_revision,
    occurredAt: row.occurred_at.toISOString(),
    localDate: localDay(row.occurred_at, timezone),
    recordTimezone: row.timezone,
    canonicalValue: Number(row.canonical_value),
    canonicalUnit: row.canonical_unit,
    displayValue: Number(row.display_value),
    displayUnit: row.display_unit,
    source: {
      kind: row.source_kind,
      ...(Object.keys(metadata).length ? { metadata } : {}),
    },
  }
}

export const buildHealthInsight = (
  metric: MetricCode,
  windowRows: HealthWindowRow[],
  pointRows: HealthPointRow[],
  timezone: string,
  at = new Date(),
): HealthInsight => {
  assertValidInsightTimezone(timezone, at)
  assertInsightPointRowOrder(pointRows)
  assertUniqueInsightPointRowIds(pointRows, (row) => row.record_id)
  const eligiblePointRows = pointRows.filter((row) => row.occurred_at.getTime() <= at.getTime())
  assertHealthPointCanonicalUnitConsistency(eligiblePointRows)
  const series = eligiblePointRows.slice(0, 180).map((row) => healthPoint(row, timezone))
  return {
    generatedAt: at.toISOString(),
    timezone,
    metric,
    canonicalUnit: series[0]?.canonicalUnit ?? null,
    windows: ([7, 30, 90] as const).map((days) =>
      healthWindow(
        days,
        windowRows.find((row) => row.days === days),
      ),
    ),
    series,
    hasMore: eligiblePointRows.length > 180,
  }
}

const historyCalendarDay = (row: HistoryCalendarDayRow): HistoryCalendarDay => {
  const healthRecordCount = Number(row.health_record_count)
  const workoutCount = Number(row.workout_count)
  const mealCount = Number(row.meal_count)
  return {
    localDate: row.local_date,
    hasRecords: healthRecordCount + workoutCount + mealCount > 0,
    healthRecordCount,
    workoutCount,
    mealCount,
  }
}

export const buildHistoryCalendar = (
  rows: HistoryCalendarDayRow[],
  timezone: string,
  at = new Date(),
): HistoryCalendar => {
  const expectedDates = expectedLocalDateSeries(at, timezone, 28)
  if (
    rows.length !== expectedDates.length ||
    rows.some((row, index) => row.local_date !== expectedDates[index])
  ) {
    throw new Error('history calendar rows must cover the reference local-date range')
  }
  const series = rows.map(historyCalendarDay)
  return {
    generatedAt: at.toISOString(),
    timezone,
    startDate: series[0]!.localDate,
    endDate: series.at(-1)!.localDate,
    series,
  }
}

export const buildDashboard = (rows: InsightRows, timezone: string, at = new Date()): Dashboard => {
  const referenceTime = at.getTime()
  const healthRows = rows.health.filter((row) => row.occurred_at.getTime() <= referenceTime)
  const workoutRows = rows.workouts.filter((row) => row.occurred_at.getTime() <= referenceTime)
  const mealRows = rows.meals.filter((row) => row.occurred_at.getTime() <= referenceTime)
  const planExperience =
    rows.planExperience && rows.planExperience.updated_at.getTime() <= referenceTime
      ? rows.planExperience
      : null
  const today = localDay(at, timezone)
  const evidence: TodayEvidence[] = [
    ...healthRows
      .filter((row) => localDay(row.occurred_at, timezone) === today)
      .map((row) => ({
        id: row.id,
        kind: recoveryMetrics.has(row.metric) ? ('recovery' as const) : ('body' as const),
        occurredAt: row.occurred_at.toISOString(),
        title: metricLabels[row.metric] ?? row.metric,
        value: displayMeasurement(row.display_value, row.display_unit),
        note: `已确认 · v${row.revision}`,
      })),
    ...workoutRows
      .filter((row) => localDay(row.occurred_at, timezone) === today)
      .map((row) => ({
        id: row.id,
        kind: 'workout' as const,
        occurredAt: row.occurred_at.toISOString(),
        title: row.title,
        value: `${Number(row.completed_sets)}/${Number(row.total_sets)} 组`,
        note: `${round(Number(row.volume_kg))} kg 训练量 · v${row.revision}`,
      })),
    ...mealRows
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

  const readiness = estimateSubjectiveRecoveryState(
    healthRows
      .filter((row) => subjectiveRecoveryMetricSet.has(row.metric))
      .map((row) => ({
        recordId: row.id,
        revision: row.revision,
        metric: row.metric as SubjectiveRecoveryMetric,
        canonicalValue: Number(row.canonical_value),
        occurredAt: row.occurred_at,
        sourceKind: row.source_kind,
      })),
    timezone,
    at,
  )

  const trends = ([7, 30, 90] as const).map((days): TrendWindow => {
    const boundary = at.getTime() - days * 86_400_000
    const health = healthRows.filter((row) => row.occurred_at.getTime() >= boundary)
    const workouts = workoutRows.filter((row) => row.occurred_at.getTime() >= boundary)
    const meals = mealRows.filter((row) => row.occurred_at.getTime() >= boundary)
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

  const freshness = (
    invalidatedBy: PersonalStateInvalidationReason[],
  ): PersonalStateLedger['observedWindow']['freshness'] => ({
    asOf: at.toISOString(),
    validUntil: null,
    invalidatedBy,
  })
  const latestRecoveryEvidence = readiness.evidence.reduce<
    (typeof readiness.evidence)[number] | null
  >(
    (latest, evidence) => (!latest || evidence.occurredAt > latest.occurredAt ? evidence : latest),
    null,
  )
  const sourceKinds = (['manual', 'device', 'imported'] as const).filter((kind) =>
    readiness.evidence.some((evidence) => evidence.sourceKind === kind),
  )
  const observed = trends[0]!
  const personalState: PersonalStateLedger = {
    policyVersion: personalStateLedgerPolicyVersion,
    generatedAt: at.toISOString(),
    confirmedRecovery: latestRecoveryEvidence
      ? {
          kind: 'confirmed_recovery_evidence',
          knowledgeClass: 'confirmed',
          authority: 'dashboard.readiness.evidence',
          observationCount: readiness.evidence.length,
          latestEvidenceAt: latestRecoveryEvidence.occurredAt,
          sourceKinds,
          freshness: freshness(['source_record_changed', 'time_advanced']),
        }
      : null,
    observedWindow: {
      kind: 'recording_window',
      knowledgeClass: 'observed',
      authority: 'dashboard.trends[days=7]',
      window: {
        startAt: new Date(at.getTime() - 7 * 86_400_000).toISOString(),
        endAt: at.toISOString(),
        days: 7,
      },
      activeDays: observed.activeDays,
      measurementCount: observed.measurementCount,
      workoutCount: observed.workoutCount,
      mealCount: observed.mealCount,
      freshness: freshness(['source_record_changed', 'time_advanced']),
    },
    recoveryEstimate: {
      kind: 'recovery_state',
      knowledgeClass: readiness.state === 'unknown' ? 'unknown' : 'estimated',
      authority: 'dashboard.readiness',
      evidencePolicyVersion: readiness.policyVersion,
      state: readiness.state,
      confidence: readiness.confidence,
      consistency: readiness.consistency,
      label: readiness.label,
      evidenceCount: readiness.evidence.length,
      freshness: freshness(['source_record_changed', 'time_advanced']),
    },
    planExperience: planExperience
      ? {
          kind: 'plan_experience',
          knowledgeClass: 'user_confirmed',
          authority: 'plan_experience_reflection',
          planId: planExperience.plan_id,
          planRevision: planExperience.plan_revision,
          experience: planExperience.experience,
          reflectionRevision: planExperience.revision,
          updatedAt: planExperience.updated_at.toISOString(),
          freshness: freshness(['plan_reflection_changed']),
        }
      : null,
  }

  return {
    generatedAt: at.toISOString(),
    timezone,
    today: { date: today, items: evidence },
    readiness,
    trends,
    personalState,
  }
}

@Injectable()
export class InsightsService {
  constructor(private readonly database: DatabaseService) {}

  async dashboard(userId: string, timezone: string, at = new Date()) {
    const since = new Date(at.getTime() - 91 * 86_400_000)
    const [health, workouts, meals, planExperience] = await Promise.all([
      this.database.query<HealthRow>(
        `
          SELECT id, metric, display_value, display_unit, canonical_value, occurred_at, revision,
            source_kind
          FROM health_records
          WHERE user_id = $1 AND deleted_at IS NULL AND status = 'confirmed'
            AND occurred_at >= $2 AND occurred_at <= $3
          ORDER BY occurred_at DESC
        `,
        [userId, since, at],
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
          WHERE w.user_id = $1 AND w.deleted_at IS NULL
            AND w.started_at >= $2 AND w.started_at <= $3
          GROUP BY w.id
          ORDER BY w.started_at DESC
        `,
        [userId, since, at],
      ),
      this.database.query<MealRow>(
        `
          SELECT m.id, m.title, m.occurred_at, m.revision,
            COUNT(i.id)::text AS item_count,
            COALESCE(SUM(i.energy_kcal_per_100g * i.canonical_grams / 100), 0)::text AS energy_kcal,
            COALESCE(SUM(i.protein_g_per_100g * i.canonical_grams / 100), 0)::text AS protein_g
          FROM nutrition_meals m
          JOIN nutrition_meal_items i ON i.meal_id = m.id
          WHERE m.user_id = $1 AND m.deleted_at IS NULL
            AND m.occurred_at >= $2 AND m.occurred_at <= $3
          GROUP BY m.id
          ORDER BY m.occurred_at DESC
        `,
        [userId, since, at],
      ),
      this.database.query<PlanExperienceRow>(
        `
          SELECT reflection.plan_id, reflection.plan_revision, reflection.experience,
            reflection.revision, reflection.updated_at
          FROM plan_experience_reflections AS reflection
          JOIN weekly_plan_revisions AS accepted
            ON accepted.plan_id = reflection.plan_id
           AND accepted.user_id = reflection.user_id
           AND accepted.revision = reflection.plan_revision
           AND accepted.action = 'accepted'
          WHERE reflection.user_id = $1
            AND reflection.updated_at <= $2
          ORDER BY reflection.updated_at DESC, reflection.id DESC
          LIMIT 1
        `,
        [userId, at],
      ),
    ])
    return buildDashboard(
      {
        health: health.rows,
        workouts: workouts.rows,
        meals: meals.rows,
        planExperience: planExperience.rows[0] ?? null,
      },
      timezone,
      at,
    )
  }

  async historyCalendar(userId: string, timezone: string, at = new Date()) {
    const days = await this.database.query<HistoryCalendarDayRow>(
      `
        WITH day_series AS (
          SELECT generate_series(
            (($3::timestamptz AT TIME ZONE $2)::date - 27)::timestamp,
            (($3::timestamptz AT TIME ZONE $2)::date)::timestamp,
            INTERVAL '1 day'
          )::date AS local_date
        ), facts AS (
          SELECT (occurred_at AT TIME ZONE $2)::date AS local_date,
            COUNT(*)::bigint AS health_record_count,
            0::bigint AS workout_count,
            0::bigint AS meal_count
          FROM health_records
          WHERE user_id = $1
            AND deleted_at IS NULL
            AND status = 'confirmed'
            AND occurred_at <= $3
            AND occurred_at >= (
              (($3::timestamptz AT TIME ZONE $2)::date - 27)::timestamp AT TIME ZONE $2
            )
          GROUP BY local_date
          UNION ALL
          SELECT (started_at AT TIME ZONE $2)::date AS local_date,
            0::bigint,
            COUNT(*)::bigint,
            0::bigint
          FROM workout_sessions
          WHERE user_id = $1
            AND deleted_at IS NULL
            AND started_at <= $3
            AND started_at >= (
              (($3::timestamptz AT TIME ZONE $2)::date - 27)::timestamp AT TIME ZONE $2
            )
          GROUP BY local_date
          UNION ALL
          SELECT (occurred_at AT TIME ZONE $2)::date AS local_date,
            0::bigint,
            0::bigint,
            COUNT(*)::bigint
          FROM nutrition_meals
          WHERE user_id = $1
            AND deleted_at IS NULL
            AND occurred_at <= $3
            AND occurred_at >= (
              (($3::timestamptz AT TIME ZONE $2)::date - 27)::timestamp AT TIME ZONE $2
            )
          GROUP BY local_date
        )
        SELECT day_series.local_date::text AS local_date,
          COALESCE(SUM(facts.health_record_count), 0)::text AS health_record_count,
          COALESCE(SUM(facts.workout_count), 0)::text AS workout_count,
          COALESCE(SUM(facts.meal_count), 0)::text AS meal_count
        FROM day_series
        LEFT JOIN facts ON facts.local_date = day_series.local_date
        GROUP BY day_series.local_date
        ORDER BY day_series.local_date
      `,
      [userId, timezone, at],
    )
    return buildHistoryCalendar(days.rows, timezone, at)
  }

  async exercise(userId: string, exerciseKey: string, timezone: string, at = new Date()) {
    const [windows, points] = await Promise.all([
      this.database.query<ExerciseWindowRow>(
        `
          WITH windows(days) AS (VALUES (7), (30), (90))
          SELECT windows.days,
            COUNT(DISTINCT w.id) FILTER (WHERE s.id IS NOT NULL)::text AS session_count,
            COUNT(s.id)::text AS completed_set_count,
            COALESCE(SUM(s.reps), 0)::text AS total_reps,
            COALESCE(SUM(s.canonical_load_kg * s.reps), 0)::text AS volume_kg,
            COALESCE(SUM(s.duration_seconds), 0)::text AS active_seconds,
            COALESCE(SUM(s.distance_meters), 0)::text AS distance_meters
          FROM windows
          LEFT JOIN workout_sessions w
            ON w.user_id = $1
            AND w.deleted_at IS NULL
            AND w.started_at <= $3
            AND w.started_at >= $3::timestamptz - make_interval(days => windows.days)
          LEFT JOIN workout_exercises e
            ON e.workout_id = w.id AND e.exercise_key = $2
          LEFT JOIN workout_sets s
            ON s.exercise_id = e.id AND s.completed = TRUE
          GROUP BY windows.days
          ORDER BY windows.days
        `,
        [userId, exerciseKey, at],
      ),
      this.database.query<ExercisePointRow>(
        `
          SELECT w.id AS workout_id, w.revision AS workout_revision,
            w.started_at AS occurred_at,
            (ARRAY_AGG(e.name ORDER BY e.position, e.id))[1] AS name,
            (ARRAY_AGG(e.category ORDER BY e.position, e.id))[1] AS category,
            (ARRAY_AGG(e.tracking_mode ORDER BY e.position, e.id))[1] AS tracking_mode,
            (JSONB_AGG(e.equipment ORDER BY e.position, e.id)->0) AS equipment,
            (ARRAY_AGG(e.equipment_notes ORDER BY e.position, e.id))[1] AS equipment_notes,
            COUNT(s.id) FILTER (WHERE s.completed)::text AS completed_set_count,
            COUNT(s.id)::text AS total_set_count,
            COALESCE(SUM(s.reps) FILTER (WHERE s.completed), 0)::text AS total_reps,
            COALESCE(
              SUM(s.canonical_load_kg * s.reps) FILTER (WHERE s.completed), 0
            )::text AS volume_kg,
            COALESCE(SUM(s.duration_seconds) FILTER (WHERE s.completed), 0)::text AS active_seconds,
            COALESCE(SUM(s.distance_meters) FILTER (WHERE s.completed), 0)::text AS distance_meters
          FROM workout_sessions w
          JOIN workout_exercises e ON e.workout_id = w.id AND e.exercise_key = $2
          JOIN workout_sets s ON s.exercise_id = e.id
          WHERE w.user_id = $1
            AND w.deleted_at IS NULL
            AND w.started_at <= $3
            AND w.started_at >= $3::timestamptz - INTERVAL '90 days'
          GROUP BY w.id
          HAVING COUNT(s.id) FILTER (WHERE s.completed) > 0
          ORDER BY w.started_at DESC, w.created_at DESC, w.id DESC
          LIMIT 181
        `,
        [userId, exerciseKey, at],
      ),
    ])

    return buildExerciseInsight(exerciseKey, windows.rows, points.rows, timezone, at)
  }

  async nutrition(userId: string, timezone: string, at = new Date()) {
    const days = await this.database.query<NutritionDayRow>(
      `
        WITH day_series AS (
          SELECT generate_series(
            (($3::timestamptz AT TIME ZONE $2)::date - 89)::timestamp,
            (($3::timestamptz AT TIME ZONE $2)::date)::timestamp,
            INTERVAL '1 day'
          )::date AS local_date
        )
        SELECT day_series.local_date::text AS local_date,
          COUNT(DISTINCT meals.id)::text AS meal_count,
          COUNT(items.id)::text AS item_count,
          COUNT(items.id) FILTER (WHERE items.fiber_g_per_100g IS NOT NULL)::text
            AS fiber_known_item_count,
          SUM(items.energy_kcal_per_100g * items.canonical_grams / 100)::text AS energy_kcal,
          SUM(items.protein_g_per_100g * items.canonical_grams / 100)::text AS protein_g,
          SUM(items.carbohydrate_g_per_100g * items.canonical_grams / 100)::text
            AS carbohydrate_g,
          SUM(items.fat_g_per_100g * items.canonical_grams / 100)::text AS fat_g,
          SUM(items.fiber_g_per_100g * items.canonical_grams / 100)::text AS fiber_g
        FROM day_series
        LEFT JOIN nutrition_meals meals
          ON meals.user_id = $1
          AND meals.deleted_at IS NULL
          AND meals.occurred_at <= $3
          AND meals.occurred_at >= (
            (($3::timestamptz AT TIME ZONE $2)::date - 89)::timestamp AT TIME ZONE $2
          )
          AND (meals.occurred_at AT TIME ZONE $2)::date = day_series.local_date
        LEFT JOIN nutrition_meal_items items ON items.meal_id = meals.id
        GROUP BY day_series.local_date
        ORDER BY day_series.local_date
      `,
      [userId, timezone, at],
    )
    return buildNutritionInsight(days.rows, timezone, at)
  }

  async health(userId: string, metric: MetricCode, timezone: string, at = new Date()) {
    const [windows, points] = await Promise.all([
      this.database.query<HealthWindowRow>(
        `
          WITH windows(days) AS (VALUES (7), (30), (90))
          SELECT windows.days,
            COUNT(records.id)::text AS record_count,
            COUNT(DISTINCT (records.occurred_at AT TIME ZONE $3)::date)::text AS recorded_days,
            MIN(records.canonical_value)::text AS minimum,
            MAX(records.canonical_value)::text AS maximum,
            AVG(records.canonical_value)::text AS average
          FROM windows
          LEFT JOIN health_records records
            ON records.user_id = $1
            AND records.metric = $2
            AND records.status = 'confirmed'
            AND records.deleted_at IS NULL
            AND records.occurred_at <= $4
            AND records.occurred_at >= $4::timestamptz - make_interval(days => windows.days)
          GROUP BY windows.days
          ORDER BY windows.days
        `,
        [userId, metric, timezone, at],
      ),
      this.database.query<HealthPointRow>(
        `
          SELECT id AS record_id, revision AS record_revision, occurred_at, timezone,
            canonical_value, canonical_unit, display_value, display_unit,
            source_kind, source_metadata
          FROM health_records
          WHERE user_id = $1
            AND metric = $2
            AND status = 'confirmed'
            AND deleted_at IS NULL
            AND occurred_at <= $3
            AND occurred_at >= $3::timestamptz - INTERVAL '90 days'
          ORDER BY occurred_at DESC, created_at DESC, id DESC
          LIMIT 181
        `,
        [userId, metric, at],
      ),
    ])
    return buildHealthInsight(metric, windows.rows, points.rows, timezone, at)
  }
}
