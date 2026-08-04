import { describe, expect, it } from 'vitest'

import { exerciseInsightSchema } from './insights'

describe('exercise insight contract', () => {
  it('keeps evidence windows and snapshot identity explicit', () => {
    const parsed = exerciseInsightSchema.parse({
      generatedAt: '2026-08-05T12:00:00.000Z',
      timezone: 'Asia/Shanghai',
      exerciseKey: 'goblet_squat',
      identity: {
        name: '高脚杯深蹲',
        category: 'strength',
        trackingMode: 'reps_load',
        equipment: ['dumbbells'],
        equipmentNotes: null,
      },
      windows: [7, 30, 90].map((days) => ({
        days,
        sessionCount: 1,
        completedSetCount: 2,
        totalReps: 20,
        volumeKg: 240,
        activeMinutes: 0,
        distanceKm: 0,
      })),
      series: [
        {
          workoutId: '00000000-0000-4000-8000-000000000001',
          workoutRevision: 2,
          occurredAt: '2026-08-05T10:00:00.000Z',
          localDate: '2026-08-05',
          identity: {
            name: '高脚杯深蹲',
            category: 'strength',
            trackingMode: 'reps_load',
            equipment: ['dumbbells'],
            equipmentNotes: null,
          },
          completedSetCount: 2,
          totalSetCount: 3,
          totalReps: 20,
          volumeKg: 240,
          activeMinutes: 0,
          distanceKm: 0,
        },
      ],
      hasMore: false,
    })

    expect(parsed.series[0]).toMatchObject({ completedSetCount: 2, totalSetCount: 3 })
  })

  it('rejects display names as unstable exercise keys', () => {
    const result = exerciseInsightSchema.safeParse({
      generatedAt: '2026-08-05T12:00:00.000Z',
      timezone: 'Asia/Shanghai',
      exerciseKey: '高脚杯深蹲',
      identity: null,
      windows: [],
      series: [],
      hasMore: false,
    })

    expect(result.success).toBe(false)
  })
})
