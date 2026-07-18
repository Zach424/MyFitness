import { createHash, randomUUID } from 'node:crypto'

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type {
  CreateWorkout,
  UpdateWorkout,
  Workout,
  WorkoutExerciseInput,
  WorkoutHistoryItem,
} from '@myfitness/contracts'
import { calculateWorkout } from '@myfitness/domain'
import type { QueryResult, QueryResultRow } from 'pg'

import { DatabaseService } from '../database/database.service'

type QueryExecutor = {
  query<T extends QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>>
}

type SessionRow = {
  id: string
  user_id: string
  title: string
  status: Workout['status']
  source_kind: Workout['source']['kind']
  source_metadata: Record<string, string>
  started_at: Date
  ended_at: Date
  timezone: string
  pain_level: number
  fatigue: number
  note: string | null
  revision: number
  request_hash: string
  deleted_at: Date | null
  created_at: Date
  updated_at: Date
}

type ExerciseRow = {
  id: string
  workout_id: string
  position: number
  exercise_key: string
  name: string
  category: Workout['exercises'][number]['category']
  notes: string | null
}

type SetRow = {
  id: string
  exercise_id: string
  position: number
  kind: Workout['exercises'][number]['sets'][number]['kind']
  reps: number | null
  display_load: string | null
  display_load_unit: Workout['exercises'][number]['sets'][number]['loadUnit'] | null
  canonical_load_kg: string | null
  duration_seconds: number | null
  distance_meters: string | null
  rpe: string | null
  completed: boolean
}

const mapWorkout = (session: SessionRow, exercises: Workout['exercises']): Workout => ({
  id: session.id,
  userId: session.user_id,
  title: session.title,
  status: session.status,
  source: {
    kind: session.source_kind,
    ...(Object.keys(session.source_metadata ?? {}).length
      ? { metadata: session.source_metadata }
      : {}),
  },
  exercises,
  summary: calculateWorkout(exercises).summary,
  startedAt: session.started_at.toISOString(),
  endedAt: session.ended_at.toISOString(),
  timezone: session.timezone,
  painLevel: session.pain_level,
  fatigue: session.fatigue,
  note: session.note,
  revision: session.revision,
  createdAt: session.created_at.toISOString(),
  updatedAt: session.updated_at.toISOString(),
})

const loadWorkouts = async (executor: QueryExecutor, sessions: SessionRow[]) => {
  if (!sessions.length) return []
  const ids = sessions.map((session) => session.id)
  const exercises = await executor.query<ExerciseRow>(
    `SELECT * FROM workout_exercises WHERE workout_id = ANY($1::uuid[]) ORDER BY position`,
    [ids],
  )
  const sets = await executor.query<SetRow>(
    `
      SELECT workout_sets.*
      FROM workout_sets
      JOIN workout_exercises ON workout_exercises.id = workout_sets.exercise_id
      WHERE workout_exercises.workout_id = ANY($1::uuid[])
      ORDER BY workout_exercises.position, workout_sets.position
    `,
    [ids],
  )
  const setsByExercise = new Map<string, SetRow[]>()
  for (const set of sets.rows) {
    const current = setsByExercise.get(set.exercise_id) ?? []
    current.push(set)
    setsByExercise.set(set.exercise_id, current)
  }
  const exercisesByWorkout = new Map<string, Workout['exercises']>()
  for (const exercise of exercises.rows) {
    const current = exercisesByWorkout.get(exercise.workout_id) ?? []
    current.push({
      id: exercise.id,
      position: exercise.position,
      exerciseKey: exercise.exercise_key,
      name: exercise.name,
      category: exercise.category,
      ...(exercise.notes ? { notes: exercise.notes } : {}),
      sets: (setsByExercise.get(exercise.id) ?? []).map((set) => ({
        id: set.id,
        position: set.position,
        kind: set.kind,
        ...(set.reps === null ? {} : { reps: set.reps }),
        ...(set.display_load === null ? {} : { load: Number(set.display_load) }),
        ...(set.display_load_unit === null ? {} : { loadUnit: set.display_load_unit }),
        canonicalLoadKg: set.canonical_load_kg === null ? null : Number(set.canonical_load_kg),
        ...(set.duration_seconds === null ? {} : { durationSeconds: set.duration_seconds }),
        ...(set.distance_meters === null ? {} : { distanceMeters: Number(set.distance_meters) }),
        ...(set.rpe === null ? {} : { rpe: Number(set.rpe) }),
        completed: set.completed,
      })),
    })
    exercisesByWorkout.set(exercise.workout_id, current)
  }

  return sessions.map((session) => mapWorkout(session, exercisesByWorkout.get(session.id) ?? []))
}

const insertGraph = async (
  executor: QueryExecutor,
  workoutId: string,
  exercises: WorkoutExerciseInput[],
) => {
  const normalized = calculateWorkout(exercises).exercises
  const result: Workout['exercises'] = []
  for (const exercise of normalized) {
    const exerciseId = randomUUID()
    await executor.query(
      `
        INSERT INTO workout_exercises (
          id, workout_id, position, exercise_key, name, category, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        exerciseId,
        workoutId,
        exercise.position,
        exercise.exerciseKey,
        exercise.name,
        exercise.category,
        exercise.notes ?? null,
      ],
    )
    const responseSets: Workout['exercises'][number]['sets'] = []
    for (const set of exercise.sets) {
      const setId = randomUUID()
      await executor.query(
        `
          INSERT INTO workout_sets (
            id, exercise_id, position, kind, reps,
            display_load, display_load_unit, canonical_load_kg,
            duration_seconds, distance_meters, rpe, completed
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `,
        [
          setId,
          exerciseId,
          set.position,
          set.kind,
          set.reps ?? null,
          set.load ?? null,
          set.loadUnit ?? null,
          set.canonicalLoadKg,
          set.durationSeconds ?? null,
          set.distanceMeters ?? null,
          set.rpe ?? null,
          set.completed,
        ],
      )
      responseSets.push({ id: setId, ...set })
    }
    result.push({ id: exerciseId, ...exercise, sets: responseSets })
  }
  return result
}

const insertRevision = async (
  executor: QueryExecutor,
  workout: Workout,
  action: WorkoutHistoryItem['action'],
) => {
  await executor.query(
    `
      INSERT INTO workout_revisions (id, workout_id, user_id, action, revision, snapshot)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [randomUUID(), workout.id, workout.userId, action, workout.revision, JSON.stringify(workout)],
  )
}

@Injectable()
export class WorkoutsService {
  constructor(private readonly database: DatabaseService) {}

  async create(userId: string, idempotencyKey: string, input: CreateWorkout) {
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex')
    return this.database.withTransaction(async (client) => {
      const result = await client.query<SessionRow>(
        `
          INSERT INTO workout_sessions (
            id, user_id, title, status, source_kind, source_metadata,
            started_at, ended_at, timezone, pain_level, fatigue, note,
            idempotency_key, request_hash
          ) VALUES (
            $1, $2, $3, $4, $5, $6::jsonb,
            $7, $8, $9, $10, $11, $12, $13, $14
          )
          ON CONFLICT (user_id, idempotency_key) DO NOTHING
          RETURNING *
        `,
        [
          randomUUID(),
          userId,
          input.title,
          input.status,
          input.source.kind,
          JSON.stringify(input.source.metadata ?? {}),
          input.startedAt,
          input.endedAt,
          input.timezone,
          input.painLevel,
          input.fatigue,
          input.note ?? null,
          idempotencyKey,
          requestHash,
        ],
      )
      const created = result.rows[0]
      if (created) {
        const exercises = await insertGraph(client, created.id, input.exercises)
        const workout = mapWorkout(created, exercises)
        await insertRevision(client, workout, 'created')
        return workout
      }

      const existing = await client.query<SessionRow>(
        'SELECT * FROM workout_sessions WHERE user_id = $1 AND idempotency_key = $2',
        [userId, idempotencyKey],
      )
      const row = existing.rows[0]
      if (!row) throw new ConflictException('idempotency conflict could not be resolved')
      if (row.request_hash !== requestHash) {
        throw new ConflictException('idempotency key was already used for a different request')
      }
      if (row.deleted_at) throw new ConflictException('idempotent workout was already deleted')
      return (await loadWorkouts(client, [row]))[0]!
    })
  }

  async list(userId: string) {
    const sessions = await this.database.query<SessionRow>(
      `
        SELECT * FROM workout_sessions
        WHERE user_id = $1 AND deleted_at IS NULL
        ORDER BY started_at DESC, created_at DESC
        LIMIT 50
      `,
      [userId],
    )
    return { items: await loadWorkouts(this.database, sessions.rows) }
  }

  async update(userId: string, workoutId: string, input: UpdateWorkout) {
    return this.database.withTransaction(async (client) => {
      const result = await client.query<SessionRow>(
        `
          UPDATE workout_sessions
          SET title = $1, status = $2, source_kind = $3, source_metadata = $4::jsonb,
              started_at = $5, ended_at = $6, timezone = $7,
              pain_level = $8, fatigue = $9, note = $10,
              revision = revision + 1, updated_at = NOW()
          WHERE id = $11 AND user_id = $12 AND deleted_at IS NULL AND revision = $13
          RETURNING *
        `,
        [
          input.title,
          input.status,
          input.source.kind,
          JSON.stringify(input.source.metadata ?? {}),
          input.startedAt,
          input.endedAt,
          input.timezone,
          input.painLevel,
          input.fatigue,
          input.note ?? null,
          workoutId,
          userId,
          input.expectedRevision,
        ],
      )
      const updated = result.rows[0]
      if (!updated) await this.throwMutationFailure(client, userId, workoutId)
      await client.query('DELETE FROM workout_exercises WHERE workout_id = $1', [workoutId])
      const exercises = await insertGraph(client, workoutId, input.exercises)
      const workout = mapWorkout(updated!, exercises)
      await insertRevision(client, workout, 'updated')
      return workout
    })
  }

  async remove(userId: string, workoutId: string, expectedRevision: number) {
    return this.database.withTransaction(async (client) => {
      const result = await client.query<SessionRow>(
        `
          UPDATE workout_sessions
          SET deleted_at = NOW(), revision = revision + 1, updated_at = NOW()
          WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL AND revision = $3
          RETURNING *
        `,
        [workoutId, userId, expectedRevision],
      )
      const deleted = result.rows[0]
      if (!deleted) await this.throwMutationFailure(client, userId, workoutId)
      const workout = (await loadWorkouts(client, [deleted!]))[0]!
      await insertRevision(client, workout, 'deleted')
    })
  }

  async history(userId: string, workoutId: string) {
    const owned = await this.database.query<{ id: string }>(
      'SELECT id FROM workout_sessions WHERE id = $1 AND user_id = $2',
      [workoutId, userId],
    )
    if (!owned.rows[0]) throw new NotFoundException('workout not found')

    const revisions = await this.database.query<{
      action: WorkoutHistoryItem['action']
      snapshot: Workout
      changed_at: Date
    }>(
      `
        SELECT action, snapshot, changed_at
        FROM workout_revisions
        WHERE workout_id = $1 AND user_id = $2
        ORDER BY revision DESC
      `,
      [workoutId, userId],
    )
    return {
      workoutId,
      items: revisions.rows.map((revision) => ({
        ...revision.snapshot,
        action: revision.action,
        changedAt: revision.changed_at.toISOString(),
      })),
    }
  }

  private async throwMutationFailure(executor: QueryExecutor, userId: string, workoutId: string) {
    const existing = await executor.query<{ revision: number; deleted_at: Date | null }>(
      'SELECT revision, deleted_at FROM workout_sessions WHERE id = $1 AND user_id = $2',
      [workoutId, userId],
    )
    const row = existing.rows[0]
    if (!row || row.deleted_at) throw new NotFoundException('workout not found')
    throw new ConflictException(`workout revision changed; current revision is ${row.revision}`)
  }
}
