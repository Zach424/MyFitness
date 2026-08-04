import type {
  CreateExerciseCatalogEntry,
  CreateWorkout,
  ExerciseCatalogItem,
  ExerciseEquipment,
  ExerciseTrackingMode,
  UpdateWorkout,
  Workout,
  WorkoutExerciseInput,
} from '@myfitness/contracts'
import {
  exerciseEquipmentOptions,
  starterExerciseCatalog,
} from '@myfitness/contracts/exercise-catalog.constants'

import {
  detectedTimeZone,
  formatZonedOccurrence,
  isBoundedOccurrenceInstant,
  occurrenceValidationMessage,
  preservedOccurrenceInstant,
  preservedOccurrenceValidationMessage,
} from '../../lib/occurrence-time'

export type DraftCatalogItem = Pick<
  ExerciseCatalogItem,
  'key' | 'name' | 'category' | 'trackingMode'
> & {
  equipment: readonly ExerciseEquipment[]
  equipmentNotes?: string | null
}

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
  trackingMode: ExerciseTrackingMode
  equipment: ExerciseEquipment[]
  equipmentNotes: string
  sets: WorkoutSetDraft[]
}

export type WorkoutDraft = {
  title: string
  loadUnit: 'kg' | 'lb'
  exercises: WorkoutExerciseDraft[]
  painLevel: number
  fatigue: number
  note: string
  startedLocal: string
  endedLocal: string
  timezone: string
  startedOffsetMinutes?: number
  endedOffsetMinutes?: number
  originalStartedAt?: string
  originalEndedAt?: string
}

const legacyTrackingMode = (
  exercise: Pick<WorkoutExerciseDraft, 'exerciseKey' | 'category'>,
): ExerciseTrackingMode => {
  if (exercise.exerciseKey === 'plank' || exercise.category === 'mobility') return 'duration'
  if (exercise.category === 'cardio') return 'duration_distance'
  return 'reps_load'
}

export const exerciseMode = (
  exercise: Pick<WorkoutExerciseDraft, 'exerciseKey' | 'category' | 'trackingMode'>,
) => {
  const trackingMode = exercise.trackingMode ?? legacyTrackingMode(exercise)
  if (trackingMode === 'duration') return 'timed'
  if (trackingMode === 'duration_distance') return 'cardio'
  return 'strength'
}

const createSetDraft = (
  exercise: Pick<WorkoutExerciseDraft, 'exerciseKey' | 'category' | 'trackingMode'>,
) => {
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

export const createExerciseDraft = (item: DraftCatalogItem): WorkoutExerciseDraft => {
  const base = {
    exerciseKey: item.key,
    name: item.name,
    category: item.category,
    trackingMode: item.trackingMode,
    equipment: [...item.equipment],
    equipmentNotes: item.equipmentNotes ?? '',
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
  exercises: [createExerciseDraft(starterExerciseCatalog[0])],
  painLevel: 0,
  fatigue: 3,
  note: '',
  startedLocal: '',
  endedLocal: '',
  timezone: detectedTimeZone(),
})

const isDraftObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const hasOnlyDraftKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).every((key) => keys.includes(key))
const draftString = (value: unknown, max: number) =>
  typeof value === 'string' && value.length <= max
const draftNumber = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
const workoutCategories = ['strength', 'cardio', 'mobility'] as const
const workoutTrackingModes = ['reps_load', 'duration', 'duration_distance'] as const

const isWorkoutSetDraft = (value: unknown) =>
  isDraftObject(value) &&
  hasOnlyDraftKeys(value, ['reps', 'load', 'durationMinutes', 'distanceKm', 'rpe', 'completed']) &&
  draftString(value.reps, 32) &&
  draftString(value.load, 32) &&
  draftString(value.durationMinutes, 32) &&
  draftString(value.distanceKm, 32) &&
  draftString(value.rpe, 32) &&
  typeof value.completed === 'boolean'

const isWorkoutExerciseDraft = (value: unknown) =>
  isDraftObject(value) &&
  hasOnlyDraftKeys(value, [
    'exerciseKey',
    'name',
    'category',
    'trackingMode',
    'equipment',
    'equipmentNotes',
    'sets',
  ]) &&
  draftString(value.exerciseKey, 128) &&
  draftString(value.name, 200) &&
  workoutCategories.includes(value.category as (typeof workoutCategories)[number]) &&
  workoutTrackingModes.includes(value.trackingMode as (typeof workoutTrackingModes)[number]) &&
  Array.isArray(value.equipment) &&
  value.equipment.length <= exerciseEquipmentOptions.length &&
  value.equipment.every((item) =>
    exerciseEquipmentOptions.includes(item as (typeof exerciseEquipmentOptions)[number]),
  ) &&
  draftString(value.equipmentNotes, 300) &&
  Array.isArray(value.sets) &&
  value.sets.length <= 50 &&
  value.sets.every(isWorkoutSetDraft)

export const isWorkoutDraft = (value: unknown): value is WorkoutDraft =>
  isDraftObject(value) &&
  hasOnlyDraftKeys(value, [
    'title',
    'loadUnit',
    'exercises',
    'painLevel',
    'fatigue',
    'note',
    'startedLocal',
    'endedLocal',
    'timezone',
    'startedOffsetMinutes',
    'endedOffsetMinutes',
    'originalStartedAt',
    'originalEndedAt',
  ]) &&
  draftString(value.title, 120) &&
  (value.loadUnit === 'kg' || value.loadUnit === 'lb') &&
  Array.isArray(value.exercises) &&
  value.exercises.length <= 30 &&
  value.exercises.every(isWorkoutExerciseDraft) &&
  draftNumber(value.painLevel, 0, 10) &&
  draftNumber(value.fatigue, 1, 5) &&
  draftString(value.note, 2_000) &&
  draftString(value.startedLocal, 16) &&
  draftString(value.endedLocal, 16) &&
  draftString(value.timezone, 64) &&
  (value.startedOffsetMinutes === undefined ||
    (draftNumber(value.startedOffsetMinutes, -1_080, 1_080) &&
      Number.isInteger(value.startedOffsetMinutes))) &&
  (value.endedOffsetMinutes === undefined ||
    (draftNumber(value.endedOffsetMinutes, -1_080, 1_080) &&
      Number.isInteger(value.endedOffsetMinutes))) &&
  isBoundedOccurrenceInstant(value.originalStartedAt) &&
  isBoundedOccurrenceInstant(value.originalEndedAt)

const finite = (value: string) => value.trim() !== '' && Number.isFinite(Number(value))

export const validateWorkoutDraft = (draft: WorkoutDraft) => {
  if (!draft.title.trim()) return '请填写训练名称'
  const startedError = occurrenceValidationMessage(
    draft.startedLocal,
    draft.timezone,
    draft.startedOffsetMinutes,
  )
  if (startedError) return `开始时间：${startedError}`
  const preservedStartError = preservedOccurrenceValidationMessage(
    draft.originalStartedAt,
    draft.startedLocal,
    draft.timezone,
    draft.startedOffsetMinutes,
  )
  if (preservedStartError) return `开始时间：${preservedStartError}`
  const endedError = occurrenceValidationMessage(
    draft.endedLocal,
    draft.timezone,
    draft.endedOffsetMinutes,
  )
  if (endedError) return `结束时间：${endedError}`
  const preservedEndError = preservedOccurrenceValidationMessage(
    draft.originalEndedAt,
    draft.endedLocal,
    draft.timezone,
    draft.endedOffsetMinutes,
  )
  if (preservedEndError) return `结束时间：${preservedEndError}`
  if (draft.startedLocal && draft.endedLocal) {
    const startedAt = preservedOccurrenceInstant(
      draft.originalStartedAt,
      draft.startedLocal,
      draft.timezone,
      draft.startedOffsetMinutes,
    )
    const endedAt = preservedOccurrenceInstant(
      draft.originalEndedAt,
      draft.endedLocal,
      draft.timezone,
      draft.endedOffsetMinutes,
    )
    if (Date.parse(endedAt) < Date.parse(startedAt)) return '结束时间不能早于开始时间'
  }
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
    trackingMode: exercise.trackingMode,
    equipment: exercise.equipment,
    ...(exercise.equipmentNotes ? { equipmentNotes: exercise.equipmentNotes } : {}),
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
  const now = Date.now()
  const explicitStartedAt =
    draft.originalStartedAt || draft.startedLocal
      ? preservedOccurrenceInstant(
          draft.originalStartedAt,
          draft.startedLocal,
          draft.timezone,
          draft.startedOffsetMinutes,
          now,
        )
      : undefined
  const explicitEndedAt =
    draft.originalEndedAt || draft.endedLocal
      ? preservedOccurrenceInstant(
          draft.originalEndedAt,
          draft.endedLocal,
          draft.timezone,
          draft.endedOffsetMinutes,
          now,
        )
      : undefined
  const defaultDuration = 45 * 60 * 1_000
  const endedAt =
    explicitEndedAt ??
    new Date(
      explicitStartedAt ? Math.min(Date.parse(explicitStartedAt) + defaultDuration, now) : now,
    ).toISOString()
  const startedAt =
    explicitStartedAt ?? new Date(Date.parse(endedAt) - defaultDuration).toISOString()
  if (Date.parse(endedAt) < Date.parse(startedAt)) throw new Error('结束时间不能早于开始时间')
  const exercises = draft.exercises.map((exercise, index) =>
    exerciseRequest(exercise, index, draft.loadUnit),
  )
  return {
    title: draft.title.trim(),
    source: { kind: 'manual' },
    exercises,
    startedAt,
    endedAt,
    timezone: draft.timezone,
    painLevel: draft.painLevel,
    fatigue: draft.fatigue,
    ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
  }
}

export const draftFromWorkout = (workout: Workout, repeat = false): WorkoutDraft => {
  const started = repeat ? null : formatZonedOccurrence(workout.startedAt, workout.timezone)
  const ended = repeat ? null : formatZonedOccurrence(workout.endedAt, workout.timezone)
  return {
    title: workout.title,
    loadUnit:
      workout.exercises.flatMap((exercise) => exercise.sets).find((set) => set.loadUnit)
        ?.loadUnit ?? 'kg',
    exercises: workout.exercises.map((exercise) => ({
      exerciseKey: exercise.exerciseKey,
      name: exercise.name,
      category: exercise.category,
      trackingMode: exercise.trackingMode ?? legacyTrackingMode(exercise),
      equipment: exercise.equipment ?? [],
      equipmentNotes: exercise.equipmentNotes ?? '',
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
    startedLocal: started?.local ?? '',
    endedLocal: ended?.local ?? '',
    timezone: repeat ? detectedTimeZone() : workout.timezone,
    ...(started ? { startedOffsetMinutes: started.offsetMinutes } : {}),
    ...(ended ? { endedOffsetMinutes: ended.offsetMinutes } : {}),
    ...(started ? { originalStartedAt: workout.startedAt } : {}),
    ...(ended ? { originalEndedAt: workout.endedAt } : {}),
  }
}

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

const searchableCatalogText = (item: ExerciseCatalogItem) =>
  [item.name, ...item.aliases, ...item.equipment, item.equipmentNotes ?? '']
    .join(' ')
    .toLocaleLowerCase()

export const filterExerciseCatalog = (items: ExerciseCatalogItem[], query: string) => {
  const exact = query.trim().toLocaleLowerCase()
  if (!exact) return items
  return items.filter((item) => searchableCatalogText(item).includes(exact))
}

export type ExerciseCatalogDraft = {
  name: string
  aliases: string
  category: CreateExerciseCatalogEntry['category']
  trackingMode: ExerciseTrackingMode
  equipment: ExerciseEquipment[]
  equipmentNotes: string
}

export const initialExerciseCatalogDraft = (): ExerciseCatalogDraft => ({
  name: '',
  aliases: '',
  category: 'strength',
  trackingMode: 'reps_load',
  equipment: ['bodyweight'],
  equipmentNotes: '',
})

export const exerciseCatalogDraftFromItem = (item: ExerciseCatalogItem): ExerciseCatalogDraft => ({
  name: item.name,
  aliases: item.aliases.join('，'),
  category: item.category,
  trackingMode: item.trackingMode,
  equipment: [...item.equipment],
  equipmentNotes: item.equipmentNotes ?? '',
})

export const validateExerciseCatalogDraft = (draft: ExerciseCatalogDraft) => {
  if (!draft.name.trim()) return '请填写动作名称'
  if (!draft.equipment.length) return '请至少明确一种器械；徒手请选择“自重”'
  if (draft.equipment.includes('other') && !draft.equipmentNotes.trim()) {
    return '选择“其他器械”时请写明具体器械'
  }
  const aliases = draft.aliases
    .split(/[，,]/)
    .map((value) => value.trim())
    .filter(Boolean)
  const labels = [draft.name.trim(), ...aliases].map((value) => value.toLocaleLowerCase())
  if (new Set(labels).size !== labels.length) return '动作名称和别名不能重复'
  return ''
}

export const buildExerciseCatalogRequest = (
  draft: ExerciseCatalogDraft,
): CreateExerciseCatalogEntry => {
  const error = validateExerciseCatalogDraft(draft)
  if (error) throw new Error(error)
  const aliases = draft.aliases
    .split(/[，,]/)
    .map((value) => value.trim())
    .filter(Boolean)
  return {
    name: draft.name.trim(),
    ...(aliases.length ? { aliases } : {}),
    category: draft.category,
    trackingMode: draft.trackingMode,
    equipment: draft.equipment,
    ...(draft.equipmentNotes.trim() ? { equipmentNotes: draft.equipmentNotes.trim() } : {}),
  }
}
