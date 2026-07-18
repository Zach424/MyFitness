import * as z from 'zod'

import {
  exerciseCategories,
  loadUnits,
  workoutRevisionActions,
  workoutSetKinds,
  workoutSourceKinds,
  workoutStatuses,
} from './workout.constants'

export * from './workout.constants'

export const workoutStatusSchema = z.enum(workoutStatuses)
export const exerciseCategorySchema = z.enum(exerciseCategories)
export const workoutSetKindSchema = z.enum(workoutSetKinds)
export const loadUnitSchema = z.enum(loadUnits)
export const workoutSourceKindSchema = z.enum(workoutSourceKinds)
export const workoutRevisionActionSchema = z.enum(workoutRevisionActions)

export const workoutSourceSchema = z
  .object({
    kind: workoutSourceKindSchema,
    metadata: z
      .object({
        provider: z.string().trim().min(1).max(80).optional(),
        externalId: z.string().trim().min(1).max(160).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

export const workoutSetInputSchema = z
  .object({
    position: z.number().int().min(1).max(100),
    kind: workoutSetKindSchema,
    reps: z.number().int().min(1).max(1_000).optional(),
    load: z.number().finite().min(0).max(1_000).optional(),
    loadUnit: loadUnitSchema.optional(),
    durationSeconds: z.number().int().min(1).max(86_400).optional(),
    distanceMeters: z.number().finite().min(1).max(500_000).optional(),
    rpe: z.number().finite().min(1).max(10).optional(),
    completed: z.boolean(),
  })
  .strict()
  .superRefine((set, ctx) => {
    if (
      set.reps === undefined &&
      set.durationSeconds === undefined &&
      set.distanceMeters === undefined
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'a set requires reps, durationSeconds or distanceMeters',
        path: ['reps'],
      })
    }
    if ((set.load === undefined) !== (set.loadUnit === undefined)) {
      ctx.addIssue({
        code: 'custom',
        message: 'load and loadUnit must be provided together',
        path: ['loadUnit'],
      })
    }
    if (set.load !== undefined && set.reps === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'loaded sets require reps',
        path: ['reps'],
      })
    }
  })

export const workoutExerciseInputSchema = z
  .object({
    position: z.number().int().min(1).max(50),
    exerciseKey: z
      .string()
      .trim()
      .regex(/^[a-z0-9_]{2,80}$/),
    name: z.string().trim().min(1).max(80),
    category: exerciseCategorySchema,
    notes: z.string().trim().max(300).optional(),
    sets: z.array(workoutSetInputSchema).min(1).max(50),
  })
  .strict()

export const workoutBaseSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    status: workoutStatusSchema,
    source: workoutSourceSchema,
    exercises: z.array(workoutExerciseInputSchema).min(1).max(30),
    startedAt: z.string().datetime({ offset: true }),
    endedAt: z.string().datetime({ offset: true }),
    timezone: z.string().trim().min(1).max(64),
    painLevel: z.number().int().min(0).max(10),
    fatigue: z.number().int().min(1).max(5),
    note: z.string().trim().max(500).optional(),
  })
  .strict()

const isValidIanaTimezone = (timezone: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format()
    return true
  } catch {
    return false
  }
}

const validateWorkout = (workout: z.infer<typeof workoutBaseSchema>, ctx: z.RefinementCtx) => {
  if (!isValidIanaTimezone(workout.timezone)) {
    ctx.addIssue({
      code: 'custom',
      message: 'timezone must be a valid IANA time zone',
      path: ['timezone'],
    })
  }
  if (new Date(workout.endedAt).getTime() < new Date(workout.startedAt).getTime()) {
    ctx.addIssue({
      code: 'custom',
      message: 'endedAt must not be before startedAt',
      path: ['endedAt'],
    })
  }
  const positions = workout.exercises.map((exercise) => exercise.position)
  if (new Set(positions).size !== positions.length) {
    ctx.addIssue({
      code: 'custom',
      message: 'exercise positions must be unique',
      path: ['exercises'],
    })
  }
  workout.exercises.forEach((exercise, exerciseIndex) => {
    const setPositions = exercise.sets.map((set) => set.position)
    if (new Set(setPositions).size !== setPositions.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'set positions must be unique within an exercise',
        path: ['exercises', exerciseIndex, 'sets'],
      })
    }
  })
}

export const createWorkoutSchema = workoutBaseSchema.superRefine(validateWorkout)
export const updateWorkoutBaseSchema = workoutBaseSchema.extend({
  expectedRevision: z.number().int().positive(),
})
export const updateWorkoutSchema = updateWorkoutBaseSchema.superRefine(validateWorkout)

export const workoutSetSchema = workoutSetInputSchema.safeExtend({
  id: z.string().uuid(),
  canonicalLoadKg: z.number().finite().min(0).nullable(),
})

export const workoutExerciseSchema = workoutExerciseInputSchema.safeExtend({
  id: z.string().uuid(),
  sets: z.array(workoutSetSchema),
})

export const workoutSummarySchema = z
  .object({
    completedSets: z.number().int().min(0),
    totalSets: z.number().int().positive(),
    volumeKg: z.number().finite().min(0),
    distanceMeters: z.number().finite().min(0),
    activeSeconds: z.number().int().min(0),
  })
  .strict()

export const workoutSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    title: z.string(),
    status: workoutStatusSchema,
    source: workoutSourceSchema,
    exercises: z.array(workoutExerciseSchema),
    summary: workoutSummarySchema,
    startedAt: z.string().datetime({ offset: true }),
    endedAt: z.string().datetime({ offset: true }),
    timezone: z.string(),
    painLevel: z.number().int().min(0).max(10),
    fatigue: z.number().int().min(1).max(5),
    note: z.string().nullable(),
    revision: z.number().int().positive(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()

export const workoutListSchema = z.object({ items: z.array(workoutSchema) }).strict()
export const workoutHistoryItemSchema = workoutSchema.extend({
  action: workoutRevisionActionSchema,
  changedAt: z.string().datetime({ offset: true }),
})
export const workoutHistorySchema = z
  .object({ workoutId: z.string().uuid(), items: z.array(workoutHistoryItemSchema) })
  .strict()

export const workoutIdSchema = z.string().uuid()

export type WorkoutSetInput = z.infer<typeof workoutSetInputSchema>
export type WorkoutExerciseInput = z.infer<typeof workoutExerciseInputSchema>
export type CreateWorkout = z.infer<typeof createWorkoutSchema>
export type UpdateWorkout = z.infer<typeof updateWorkoutSchema>
export type Workout = z.infer<typeof workoutSchema>
export type WorkoutHistoryItem = z.infer<typeof workoutHistoryItemSchema>
