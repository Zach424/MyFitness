import type {
  PortableExportWorkoutRevisionSnapshotExercise,
  PortableExportWorkoutRevisionSnapshotLayerReceipt,
  PortableExportWorkoutRevisionSnapshotLayerRevision,
  PortableExportWorkoutRevisionSnapshotLayerSession,
  PortableExportWorkoutRevisionSnapshotLayerWorkout,
  PortableExportWorkoutRevisionSnapshotValue,
  PortableExportWorkoutSetLayerSnapshotExercise,
} from './portable-export-database-snapshot'
import {
  portableExportJsonAsyncArray,
  type PortableExportJsonAsyncArray,
} from './portable-export-json-stream'

export type PortableExportWorkoutJsonSourceSession = {
  workouts: PortableExportJsonAsyncArray<Record<string, unknown>>
  receipt: Promise<PortableExportWorkoutRevisionSnapshotLayerReceipt>
  complete: () => Promise<void>
  cancel: (error: unknown) => Promise<void>
}

const replaceArrayPlaceholder = (
  target: Record<string, unknown>,
  key: string,
  values: AsyncIterable<Record<string, unknown>>,
) => {
  if (!Array.isArray(target[key])) {
    throw new Error(`portable export workout JSON source requires a ${key} placeholder`)
  }
  target[key] = portableExportJsonAsyncArray(values)
}

const wrapExistingIterable = (
  target: Record<string, unknown>,
  key: string,
  expected: AsyncIterable<Record<string, unknown>>,
  values: AsyncIterable<Record<string, unknown>>,
) => {
  if (target[key] !== expected) {
    throw new Error(`portable export workout JSON source lost its ${key} field`)
  }
  target[key] = portableExportJsonAsyncArray(values)
}

async function* snapshotExerciseJsonValues(
  exercises: AsyncIterable<PortableExportWorkoutRevisionSnapshotExercise>,
): AsyncGenerator<Record<string, unknown>> {
  for await (const exercise of exercises) {
    wrapExistingIterable(exercise, 'sets', exercise.sets, exercise.sets)
    yield exercise
  }
}

const adaptSnapshot = (snapshot: PortableExportWorkoutRevisionSnapshotValue) => {
  const exercises = snapshot.exercises
  wrapExistingIterable(snapshot, 'exercises', exercises, snapshotExerciseJsonValues(exercises))
}

async function* revisionJsonValues(
  history: AsyncIterable<PortableExportWorkoutRevisionSnapshotLayerRevision>,
): AsyncGenerator<Record<string, unknown>> {
  for await (const revision of history) {
    adaptSnapshot(revision.snapshot)
    yield revision
  }
}

async function* currentExerciseJsonValues(
  exercises: AsyncIterable<PortableExportWorkoutSetLayerSnapshotExercise>,
): AsyncGenerator<Record<string, unknown>> {
  for await (const exercise of exercises) {
    replaceArrayPlaceholder(exercise.header, 'sets', exercise.sets)
    yield exercise.header
  }
}

async function* workoutJsonValues(
  workouts: AsyncIterable<PortableExportWorkoutRevisionSnapshotLayerWorkout>,
): AsyncGenerator<Record<string, unknown>> {
  for await (const workout of workouts) {
    replaceArrayPlaceholder(workout.header, 'history', revisionJsonValues(workout.history))
    replaceArrayPlaceholder(
      workout.header,
      'exercises',
      currentExerciseJsonValues(workout.exercises),
    )
    yield workout.header
  }
}

export const createPortableExportWorkoutJsonArray = (
  workouts: AsyncIterable<PortableExportWorkoutRevisionSnapshotLayerWorkout>,
): PortableExportJsonAsyncArray<Record<string, unknown>> =>
  portableExportJsonAsyncArray(workoutJsonValues(workouts))

export const createPortableExportWorkoutJsonSource = (
  session: PortableExportWorkoutRevisionSnapshotLayerSession,
): PortableExportWorkoutJsonSourceSession => ({
  workouts: createPortableExportWorkoutJsonArray(session.workouts),
  receipt: session.receipt,
  complete: session.complete,
  cancel: session.cancel,
})
