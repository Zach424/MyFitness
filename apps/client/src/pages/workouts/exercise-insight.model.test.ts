import { describe, expect, it } from 'vitest'
import type { ExerciseInsight, Workout } from '@myfitness/contracts'

import {
  exerciseInsightChoices,
  exerciseInsightMetric,
  exerciseInsightPoints,
} from './exercise-insight.model'

const workout = (exerciseKey: string, name: string, startedAt: string) =>
  ({
    id: crypto.randomUUID(),
    userId: '00000000-0000-4000-8000-000000000001',
    title: '训练',
    status: 'completed',
    source: { kind: 'manual' },
    exercises: [
      {
        id: crypto.randomUUID(),
        position: 1,
        exerciseKey,
        name,
        category: 'strength',
        trackingMode: 'reps_load',
        equipment: ['dumbbells'],
        sets: [
          {
            id: crypto.randomUUID(),
            position: 1,
            kind: 'working',
            reps: 10,
            load: 10,
            loadUnit: 'kg',
            canonicalLoadKg: 10,
            rpe: 7,
            completed: true,
          },
        ],
      },
    ],
    summary: {
      completedSets: 1,
      totalSets: 1,
      volumeKg: 100,
      distanceMeters: 0,
      activeSeconds: 0,
    },
    startedAt,
    endedAt: startedAt,
    timezone: 'Asia/Shanghai',
    painLevel: 0,
    fatigue: 3,
    note: null,
    revision: 1,
    createdAt: startedAt,
    updatedAt: startedAt,
  }) as Workout

describe('exercise insight view model', () => {
  it('deduplicates only by stable key and disambiguates equal display names', () => {
    const latest = workout('left_lunge', '弓步', '2026-08-05T10:00:00.000Z')
    const olderSnapshot = workout('left_lunge', '旧弓步名', '2026-08-01T10:00:00.000Z')
    const different = workout('right_lunge', '弓步', '2026-08-04T10:00:00.000Z')
    const choices = exerciseInsightChoices([latest, different, olderSnapshot])

    expect(choices).toHaveLength(2)
    expect(choices.map((choice) => choice.key)).toEqual(['left_lunge', 'right_lunge'])
    expect(choices.every((choice) => choice.label.startsWith('弓步 · '))).toBe(true)
  })

  it('chooses one-unit charts and bounds points by the selected window', () => {
    expect(exerciseInsightMetric('reps_load')).toBe('volumeKg')
    expect(exerciseInsightMetric('duration')).toBe('activeMinutes')
    expect(exerciseInsightMetric('duration_distance')).toBe('distanceKm')

    const template = {
      workoutRevision: 1,
      identity: {
        name: '跑步',
        category: 'cardio' as const,
        trackingMode: 'duration_distance' as const,
        equipment: ['open_space' as const],
        equipmentNotes: null,
      },
      completedSetCount: 1,
      totalSetCount: 1,
      totalReps: 0,
      volumeKg: 0,
      activeMinutes: 20,
      distanceKm: 3,
    }
    const insight = {
      generatedAt: '2026-08-05T12:00:00.000Z',
      timezone: 'Asia/Shanghai',
      exerciseKey: 'running',
      identity: template.identity,
      windows: [],
      series: [
        {
          ...template,
          workoutId: '00000000-0000-4000-8000-000000000001',
          occurredAt: '2026-08-04T12:00:00.000Z',
          localDate: '2026-08-04',
        },
        {
          ...template,
          workoutId: '00000000-0000-4000-8000-000000000002',
          occurredAt: '2026-07-20T12:00:00.000Z',
          localDate: '2026-07-20',
        },
      ],
      hasMore: false,
    } as ExerciseInsight

    expect(exerciseInsightPoints(insight, 7).map((point) => point.localDate)).toEqual([
      '2026-08-04',
    ])
    expect(exerciseInsightPoints(insight, 30).map((point) => point.localDate)).toEqual([
      '2026-07-20',
      '2026-08-04',
    ])
  })
})
