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

  it('rejects reversed time and duplicate positions', () => {
    expect(
      createWorkoutSchema.safeParse({
        ...workout,
        endedAt: '2026-07-18T17:00:00+08:00',
        exercises: [...workout.exercises, workout.exercises[0]],
      }).success,
    ).toBe(false)
  })
})
