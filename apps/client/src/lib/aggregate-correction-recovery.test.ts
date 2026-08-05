import { describe, expect, it } from 'vitest'
import type {
  HealthRecord,
  Meal,
  UpdateHealthRecord,
  UpdateMeal,
  UpdateWorkout,
  Workout,
} from '@myfitness/contracts'

import {
  classifyAggregateCorrectionEvidence,
  describeAggregateCorrectionFailure,
  healthRecordMatchesSubmittedCorrection,
  mealMatchesSubmittedCorrection,
  workoutMatchesSubmittedCorrection,
} from './aggregate-correction-recovery'

const healthRequest: UpdateHealthRecord = {
  metric: 'body.weight',
  value: 70.5,
  unit: 'kg',
  source: { kind: 'manual' },
  status: 'confirmed',
  occurredAt: '2026-08-05T01:00:00.000Z',
  timezone: 'Asia/Shanghai',
  expectedRevision: 2,
}

const healthRecord = {
  id: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000002',
  metric: 'body.weight',
  canonicalValue: 70.5,
  canonicalUnit: 'kg',
  displayValue: 70.5,
  displayUnit: 'kg',
  source: { kind: 'manual' },
  confidence: null,
  status: 'confirmed',
  occurredAt: '2026-08-05T01:00:00.000Z',
  timezone: 'Asia/Shanghai',
  revision: 3,
  createdAt: '2026-08-05T01:00:00.000Z',
  updatedAt: '2026-08-05T01:01:00.000Z',
} satisfies HealthRecord

const workoutRequest: UpdateWorkout = {
  title: '午间力量',
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
  startedAt: '2026-08-05T04:00:00.000Z',
  endedAt: '2026-08-05T04:45:00.000Z',
  timezone: 'Asia/Shanghai',
  painLevel: 0,
  fatigue: 3,
  note: '动作稳定',
  expectedRevision: 4,
}

const workout = {
  id: '00000000-0000-4000-8000-000000000003',
  userId: '00000000-0000-4000-8000-000000000002',
  ...workoutRequest,
  exercises: workoutRequest.exercises.map((exercise) => ({
    ...exercise,
    id: '00000000-0000-4000-8000-000000000004',
    sets: exercise.sets.map((set) => ({
      ...set,
      id: '00000000-0000-4000-8000-000000000005',
      canonicalLoadKg: 12,
    })),
  })),
  status: 'completed',
  summary: { completedSets: 1, totalSets: 1, volumeKg: 120, distanceMeters: 0, activeSeconds: 0 },
  note: workoutRequest.note ?? null,
  revision: 5,
  createdAt: '2026-08-05T04:00:00.000Z',
  updatedAt: '2026-08-05T04:46:00.000Z',
} satisfies Workout

const mealRequest: UpdateMeal = {
  mealType: 'lunch',
  title: '午餐',
  source: { kind: 'manual' },
  items: [
    {
      position: 1,
      food: {
        foodKey: 'rice',
        name: '米饭',
        category: 'staple',
        nutrientsPer100g: {
          energyKcal: 116,
          proteinG: 2.6,
          carbohydrateG: 25.9,
          fatG: 0.3,
        },
        reference: '示例目录',
      },
      serving: { amount: 1, unit: 'serving', grams: 150 },
    },
  ],
  occurredAt: '2026-08-05T04:00:00.000Z',
  timezone: 'Asia/Shanghai',
  expectedRevision: 1,
}

const meal = {
  id: '00000000-0000-4000-8000-000000000006',
  userId: '00000000-0000-4000-8000-000000000002',
  ...mealRequest,
  items: mealRequest.items.map((item) => ({
    ...item,
    id: '00000000-0000-4000-8000-000000000007',
    summary: { energyKcal: 174, proteinG: 3.9, carbohydrateG: 38.85, fatG: 0.45, fiberG: 0 },
  })),
  summary: { energyKcal: 174, proteinG: 3.9, carbohydrateG: 38.85, fatG: 0.45, fiberG: 0 },
  note: null,
  revision: 2,
  createdAt: '2026-08-05T04:00:00.000Z',
  updatedAt: '2026-08-05T04:01:00.000Z',
} satisfies Meal

describe('aggregate correction response-loss recovery', () => {
  it('requires exact-read reconciliation after ambiguous or retryable failure', () => {
    expect(describeAggregateCorrectionFailure(new Error('Failed to fetch'), '修改').authority).toBe(
      'reconcile_required',
    )
    expect(
      describeAggregateCorrectionFailure(
        Object.assign(new Error('paused'), { statusCode: 503 }),
        '修改',
      ).authority,
    ).toBe('reconcile_required')
  })

  it('terminates an explicitly refused correction attempt', () => {
    expect(
      describeAggregateCorrectionFailure(
        Object.assign(new Error('revision conflict'), { statusCode: 409 }),
        '修改',
      ).authority,
    ).toBe('terminal')
  })

  it('accepts only an advanced revision with every submitted field matched', () => {
    expect(
      classifyAggregateCorrectionEvidence(2, healthRecord, (current) =>
        healthRecordMatchesSubmittedCorrection(current, healthRequest),
      ),
    ).toBe('accepted')
    expect(
      classifyAggregateCorrectionEvidence(2, { ...healthRecord, displayValue: 71 }, (current) =>
        healthRecordMatchesSubmittedCorrection(current, healthRequest),
      ),
    ).toBe('diverged')
  })

  it('keeps an unchanged base eligible only for a later explicit save', () => {
    expect(
      classifyAggregateCorrectionEvidence(2, { ...healthRecord, revision: 2 }, () => false),
    ).toBe('unchanged')
  })

  it('compares the complete submitted workout graph while ignoring server-only evidence', () => {
    expect(workoutMatchesSubmittedCorrection(workout, workoutRequest)).toBe(true)
    expect(
      workoutMatchesSubmittedCorrection(
        { ...workout, exercises: [{ ...workout.exercises[0]!, name: '被其他修改替换' }] },
        workoutRequest,
      ),
    ).toBe(false)
  })

  it('compares meal snapshots and servings while ignoring calculated summaries', () => {
    expect(mealMatchesSubmittedCorrection(meal, mealRequest)).toBe(true)
    expect(
      mealMatchesSubmittedCorrection(
        {
          ...meal,
          items: [
            {
              ...meal.items[0]!,
              serving: { ...meal.items[0]!.serving, grams: 151 },
            },
          ],
        },
        mealRequest,
      ),
    ).toBe(false)
  })
})
