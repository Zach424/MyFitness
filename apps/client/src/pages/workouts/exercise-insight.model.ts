import type {
  ExerciseInsight,
  ExerciseInsightPoint,
  ExerciseTrackingMode,
  Workout,
} from '@myfitness/contracts'

export type ExerciseInsightChoice = {
  key: string
  name: string
  label: string
  trackingMode: ExerciseTrackingMode | null
}

export type ExerciseInsightMetric = 'volumeKg' | 'activeMinutes' | 'distanceKm'

export const insightTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
  } catch {
    return 'Asia/Shanghai'
  }
}

export const exerciseInsightChoices = (workouts: Workout[]): ExerciseInsightChoice[] => {
  const snapshots = new Map<string, Omit<ExerciseInsightChoice, 'label'>>()
  for (const workout of workouts) {
    for (const exercise of workout.exercises) {
      if (!snapshots.has(exercise.exerciseKey)) {
        snapshots.set(exercise.exerciseKey, {
          key: exercise.exerciseKey,
          name: exercise.name,
          trackingMode: exercise.trackingMode ?? null,
        })
      }
    }
  }
  const duplicateNames = new Map<string, number>()
  for (const snapshot of snapshots.values()) {
    const name = snapshot.name.toLocaleLowerCase()
    duplicateNames.set(name, (duplicateNames.get(name) ?? 0) + 1)
  }
  return [...snapshots.values()].map((snapshot) => ({
    ...snapshot,
    label:
      duplicateNames.get(snapshot.name.toLocaleLowerCase()) === 1
        ? snapshot.name
        : `${snapshot.name} · ${snapshot.key.slice(-6)}`,
  }))
}

export const exerciseInsightMetric = (
  trackingMode: ExerciseTrackingMode | null,
): ExerciseInsightMetric => {
  if (trackingMode === 'duration_distance') return 'distanceKm'
  if (trackingMode === 'duration') return 'activeMinutes'
  return 'volumeKg'
}

export const exerciseInsightMetricLabel: Record<ExerciseInsightMetric, string> = {
  volumeKg: '完成训练量 kg',
  activeMinutes: '完成时长 min',
  distanceKm: '完成距离 km',
}

export const exerciseInsightPoints = (
  insight: ExerciseInsight,
  days: 7 | 30 | 90,
  limit = 12,
): ExerciseInsightPoint[] => {
  const boundary = new Date(insight.generatedAt).getTime() - days * 86_400_000
  return insight.series
    .filter((point) => new Date(point.occurredAt).getTime() >= boundary)
    .slice(0, limit)
    .reverse()
}
