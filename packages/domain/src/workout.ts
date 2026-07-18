import type { WorkoutExerciseInput } from '@myfitness/contracts'

const round = (value: number, precision = 4) => {
  const factor = 10 ** precision
  return Math.round((value + Number.EPSILON) * factor) / factor
}

export const normalizeLoadKg = (load: number, unit: 'kg' | 'lb') =>
  round(unit === 'kg' ? load : load * 0.45359237)

export const calculateWorkout = (exercises: WorkoutExerciseInput[]) => {
  let completedSets = 0
  let totalSets = 0
  let volumeKg = 0
  let distanceMeters = 0
  let activeSeconds = 0

  const normalizedExercises = exercises.map((exercise) => ({
    ...exercise,
    sets: exercise.sets.map((set) => {
      totalSets += 1
      const canonicalLoadKg =
        set.load === undefined || set.loadUnit === undefined
          ? null
          : normalizeLoadKg(set.load, set.loadUnit)

      if (set.completed) {
        completedSets += 1
        if (canonicalLoadKg !== null && set.reps !== undefined) {
          volumeKg += canonicalLoadKg * set.reps
        }
        distanceMeters += set.distanceMeters ?? 0
        activeSeconds += set.durationSeconds ?? 0
      }

      return { ...set, canonicalLoadKg }
    }),
  }))

  return {
    exercises: normalizedExercises,
    summary: {
      completedSets,
      totalSets,
      volumeKg: round(volumeKg, 2),
      distanceMeters: round(distanceMeters, 2),
      activeSeconds,
    },
  }
}
