import type {
  CreateWorkout,
  UpdateWorkout,
  Workout,
  WorkoutExerciseInput,
} from '@myfitness/contracts'
import { exerciseCatalog } from '@myfitness/contracts/workout.constants'

export type ExerciseCatalogItem = (typeof exerciseCatalog)[number]

export type WorkoutSetDraft = {
  reps: string
  load: string
  durationMinutes: string
  distanceKm: string
  rpe: string
  completed: boolean
}

export type WorkoutExerciseDraft = {
  exerciseKey: string
  name: string
  category: WorkoutExerciseInput['category']
  sets: WorkoutSetDraft[]
}

export type WorkoutDraft = {
  title: string
  loadUnit: 'kg' | 'lb'
  exercises: WorkoutExerciseDraft[]
  painLevel: number
  fatigue: number
  note: string
  startedAt?: string
  endedAt?: string
}

export const exerciseMode = (exercise: Pick<WorkoutExerciseDraft, 'exerciseKey' | 'category'>) => {
  if (exercise.exerciseKey === 'plank' || exercise.category === 'mobility') return 'timed'
  if (exercise.category === 'cardio') return 'cardio'
  return 'strength'
}

const createSetDraft = (exercise: Pick<WorkoutExerciseDraft, 'exerciseKey' | 'category'>) => {
  const mode = exerciseMode(exercise)
  return {
    reps: mode === 'strength' ? '10' : '',
    load: mode === 'strength' ? (exercise.exerciseKey === 'push_up' ? '0' : '12') : '',
    durationMinutes: mode === 'strength' ? '' : mode === 'cardio' ? '20' : '1',
    distanceKm: mode === 'cardio' ? '3' : '',
    rpe: '7',
    completed: true,
  }
}

export const createExerciseDraft = (item: ExerciseCatalogItem): WorkoutExerciseDraft => {
  const base = {
    exerciseKey: item.key,
    name: item.name,
    category: item.category,
  }
  const set = createSetDraft(base)
  return {
    ...base,
    sets:
      item.category === 'strength' && item.key !== 'plank'
        ? [{ ...set }, { ...set }, { ...set }]
        : [set],
  }
}

export const initialWorkoutDraft = (): WorkoutDraft => ({
  title: '全身训练 A',
  loadUnit: 'kg',
  exercises: [createExerciseDraft(exerciseCatalog[0])],
  painLevel: 0,
  fatigue: 3,
  note: '',
})

const finite = (value: string) => value.trim() !== '' && Number.isFinite(Number(value))

export const validateWorkoutDraft = (draft: WorkoutDraft) => {
  if (!draft.title.trim()) return '请填写训练名称'
  if (!draft.exercises.length) return '请至少添加一个动作'
  for (const exercise of draft.exercises) {
    if (!exercise.sets.length) return `${exercise.name}至少需要一组`
    const mode = exerciseMode(exercise)
    for (const set of exercise.sets) {
      if (!finite(set.rpe) || Number(set.rpe) < 1 || Number(set.rpe) > 10) {
        return `${exercise.name}的 RPE 需在 1–10 之间`
      }
      if (mode === 'strength') {
        if (!finite(set.reps) || !Number.isInteger(Number(set.reps)) || Number(set.reps) < 1) {
          return `${exercise.name}的次数需为正整数`
        }
        if (!finite(set.load) || Number(set.load) < 0) return `${exercise.name}的负重不能小于 0`
      } else if (!finite(set.durationMinutes) || Number(set.durationMinutes) <= 0) {
        return `${exercise.name}的时长需大于 0`
      }
      if (
        mode === 'cardio' &&
        set.distanceKm &&
        (!finite(set.distanceKm) || Number(set.distanceKm) <= 0)
      ) {
        return `${exercise.name}的距离需大于 0`
      }
    }
  }
  return ''
}

const timezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
  } catch {
    return 'Asia/Shanghai'
  }
}

const exerciseRequest = (
  exercise: WorkoutExerciseDraft,
  exerciseIndex: number,
  loadUnit: 'kg' | 'lb',
): WorkoutExerciseInput => {
  const mode = exerciseMode(exercise)
  return {
    position: exerciseIndex + 1,
    exerciseKey: exercise.exerciseKey,
    name: exercise.name,
    category: exercise.category,
    sets: exercise.sets.map((set, setIndex) => ({
      position: setIndex + 1,
      kind: 'working',
      ...(mode === 'strength'
        ? { reps: Number(set.reps), load: Number(set.load), loadUnit }
        : { durationSeconds: Math.round(Number(set.durationMinutes) * 60) }),
      ...(mode === 'cardio' && set.distanceKm
        ? { distanceMeters: Number(set.distanceKm) * 1_000 }
        : {}),
      rpe: Number(set.rpe),
      completed: set.completed,
    })),
  }
}

export function buildWorkoutRequest(draft: WorkoutDraft): CreateWorkout
export function buildWorkoutRequest(draft: WorkoutDraft, expectedRevision: number): UpdateWorkout
export function buildWorkoutRequest(
  draft: WorkoutDraft,
  expectedRevision?: number,
): CreateWorkout | UpdateWorkout {
  const error = validateWorkoutDraft(draft)
  if (error) throw new Error(error)
  const endedAt = draft.endedAt ?? new Date().toISOString()
  const startedAt =
    draft.startedAt ?? new Date(new Date(endedAt).getTime() - 45 * 60 * 1_000).toISOString()
  const exercises = draft.exercises.map((exercise, index) =>
    exerciseRequest(exercise, index, draft.loadUnit),
  )
  return {
    title: draft.title.trim(),
    status: exercises.every((exercise) => exercise.sets.every((set) => set.completed))
      ? 'completed'
      : 'partial',
    source: { kind: 'manual' },
    exercises,
    startedAt,
    endedAt,
    timezone: timezone(),
    painLevel: draft.painLevel,
    fatigue: draft.fatigue,
    ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
  }
}

export const draftFromWorkout = (workout: Workout, repeat = false): WorkoutDraft => ({
  title: workout.title,
  loadUnit:
    workout.exercises.flatMap((exercise) => exercise.sets).find((set) => set.loadUnit)?.loadUnit ??
    'kg',
  exercises: workout.exercises.map((exercise) => ({
    exerciseKey: exercise.exerciseKey,
    name: exercise.name,
    category: exercise.category,
    sets: exercise.sets.map((set) => ({
      reps: set.reps === undefined ? '' : String(set.reps),
      load: set.load === undefined ? '' : String(set.load),
      durationMinutes: set.durationSeconds === undefined ? '' : String(set.durationSeconds / 60),
      distanceKm: set.distanceMeters === undefined ? '' : String(set.distanceMeters / 1_000),
      rpe: set.rpe === undefined ? '7' : String(set.rpe),
      completed: repeat ? false : set.completed,
    })),
  })),
  painLevel: repeat ? 0 : workout.painLevel,
  fatigue: repeat ? 3 : workout.fatigue,
  note: repeat ? '' : (workout.note ?? ''),
  ...(repeat ? {} : { startedAt: workout.startedAt, endedAt: workout.endedAt }),
})

export const workoutDraftSummary = (draft: WorkoutDraft) => {
  let completedSets = 0
  let totalSets = 0
  let volumeKg = 0
  let activeMinutes = 0
  for (const exercise of draft.exercises) {
    const mode = exerciseMode(exercise)
    for (const set of exercise.sets) {
      totalSets += 1
      if (!set.completed) continue
      completedSets += 1
      if (mode === 'strength' && finite(set.reps) && finite(set.load)) {
        const kg = Number(set.load) * (draft.loadUnit === 'lb' ? 0.45359237 : 1)
        volumeKg += Number(set.reps) * kg
      }
      if (mode !== 'strength' && finite(set.durationMinutes)) {
        activeMinutes += Number(set.durationMinutes)
      }
    }
  }
  return {
    completedSets,
    totalSets,
    volumeKg: Math.round(volumeKg),
    activeMinutes: Math.round(activeMinutes),
  }
}
