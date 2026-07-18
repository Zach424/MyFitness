import { describe, expect, it } from 'vitest'

import { calculateWorkout, normalizeLoadKg } from './workout'

describe('workout calculations', () => {
  it('normalizes pounds to kilograms', () => {
    expect(normalizeLoadKg(100, 'lb')).toBe(45.3592)
  })

  it('counts only completed set evidence in totals', () => {
    const result = calculateWorkout([
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
            load: 20,
            loadUnit: 'kg',
            completed: true,
          },
          {
            position: 2,
            kind: 'working',
            reps: 10,
            load: 20,
            loadUnit: 'kg',
            completed: false,
          },
        ],
      },
      {
        position: 2,
        exerciseKey: 'running',
        name: '跑步',
        category: 'cardio',
        sets: [
          {
            position: 1,
            kind: 'working',
            durationSeconds: 600,
            distanceMeters: 2_000,
            completed: true,
          },
        ],
      },
    ])

    expect(result.summary).toEqual({
      completedSets: 2,
      totalSets: 3,
      volumeKg: 200,
      distanceMeters: 2_000,
      activeSeconds: 600,
    })
  })
})
