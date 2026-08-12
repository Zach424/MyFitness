import { describe, expect, it } from 'vitest'

import { createWorkoutSchema, updateWorkoutSchema } from './workout'

const workout = {
  title: '全身 A',
  status: 'completed',
  source: { kind: 'manual' },
  exercises: [
    {
      position: 1,
      exerciseKey: 'goblet_squat',
      name: '高脚杯深蹲',
      category: 'strength',
      trackingMode: 'reps_load',
      equipment: ['dumbbells'],
      sets: [
        {
          position: 1,
          kind: 'working',
          reps: 10,
          load: 12,
          loadUnit: 'kg',
          rpe: 7,
          completed: true,
        },
      ],
    },
  ],
  startedAt: '2026-07-18T18:00:00+08:00',
  endedAt: '2026-07-18T18:45:00+08:00',
  timezone: 'Asia/Shanghai',
  painLevel: 0,
  fatigue: 3,
}

describe('workout contracts', () => {
  it('accepts a structured completed session and optimistic update', () => {
    expect(createWorkoutSchema.parse(workout).exercises[0]?.sets[0]?.reps).toBe(10)
    expect(updateWorkoutSchema.parse({ ...workout, expectedRevision: 2 }).expectedRevision).toBe(2)
  })

  it('accepts requests without the deprecated client status hint', () => {
    const { status: _status, ...serverAuthoritativeWorkout } = workout
    const parsed = createWorkoutSchema.parse(serverAuthoritativeWorkout)

    expect(parsed).not.toHaveProperty('status')
    expect(parsed.exercises[0]?.sets[0]?.completed).toBe(true)
  })

  it('requires a performance measure and paired load unit', () => {
    const missingMeasure = structuredClone(workout)
    missingMeasure.exercises[0]!.sets[0] = {
      position: 1,
      kind: 'working',
      completed: true,
    } as (typeof missingMeasure.exercises)[number]['sets'][number]
    expect(createWorkoutSchema.safeParse(missingMeasure).success).toBe(false)

    const missingUnit = structuredClone(workout)
    delete (missingUnit.exercises[0]!.sets[0] as { loadUnit?: string }).loadUnit
    expect(createWorkoutSchema.safeParse(missingUnit).success).toBe(false)
  })

  it('rejects reversed time, duplicate positions and duplicate exercise identities', () => {
    expect(
      createWorkoutSchema.safeParse({
        ...workout,
        endedAt: '2026-07-18T17:00:00+08:00',
        exercises: [...workout.exercises, workout.exercises[0]],
      }).success,
    ).toBe(false)

    const duplicateKey = structuredClone(workout)
    duplicateKey.exercises.push({
      ...structuredClone(workout.exercises[0]!),
      position: 2,
    })
    expect(createWorkoutSchema.safeParse(duplicateKey).success).toBe(false)
  })

  it('rejects future session bounds', () => {
    expect(
      createWorkoutSchema.safeParse({
        ...workout,
        startedAt: '2100-01-01T18:00:00+08:00',
        endedAt: '2100-01-01T18:45:00+08:00',
      }).success,
    ).toBe(false)
  })

  it('requires details for other equipment and rejects duplicate equipment snapshots', () => {
    const unnamed = structuredClone(workout)
    unnamed.exercises[0]!.equipment = ['other'] as never
    expect(createWorkoutSchema.safeParse(unnamed).success).toBe(false)

    const duplicate = structuredClone(workout)
    duplicate.exercises[0]!.equipment = ['dumbbells', 'dumbbells'] as never
    expect(createWorkoutSchema.safeParse(duplicate).success).toBe(false)
  })

  it('accepts an exact selection-time muscle snapshot and rejects aggregate drift', () => {
    const mapped = structuredClone(workout)
    Object.assign(mapped.exercises[0]!, {
      muscleMapping: {
        status: 'mapped',
        modelVersion: 'ilens-muscle-model-v1',
        source: 'starter_catalog',
        primaryMuscles: ['gluteus_maximus', 'quadriceps'],
        secondaryMuscles: ['hamstrings'],
      },
    })
    expect(createWorkoutSchema.parse(mapped).exercises[0]?.muscleMapping).toMatchObject({
      status: 'mapped',
      primaryMuscles: ['gluteus_maximus', 'quadriceps'],
    })

    const aggregate = structuredClone(mapped)
    ;(
      aggregate.exercises[0] as unknown as { muscleMapping: { primaryMuscles: string[] } }
    ).muscleMapping.primaryMuscles = ['core_global']
    expect(createWorkoutSchema.safeParse(aggregate).success).toBe(false)
  })
})
