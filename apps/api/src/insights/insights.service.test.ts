import { describe, expect, it } from 'vitest'

import { buildDashboard, type InsightRows } from './insights.service'

describe('dashboard aggregation', () => {
  it('builds local-day evidence, readiness and bounded trends', () => {
    const at = new Date('2026-07-18T12:00:00.000Z')
    const rows = {
      health: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          metric: 'recovery.energy',
          display_value: '4',
          display_unit: 'score_1_5',
          canonical_value: '4',
          occurred_at: new Date('2026-07-18T00:00:00.000Z'),
          revision: 1,
        },
        {
          id: '00000000-0000-4000-8000-000000000002',
          metric: 'recovery.stress',
          display_value: '2',
          display_unit: 'score_1_5',
          canonical_value: '2',
          occurred_at: new Date('2026-07-17T12:00:00.000Z'),
          revision: 1,
        },
      ],
      workouts: [
        {
          id: '00000000-0000-4000-8000-000000000003',
          title: '全身 A',
          occurred_at: new Date('2026-07-18T10:00:00.000Z'),
          completed_sets: '3',
          total_sets: '3',
          volume_kg: '360',
          active_seconds: '0',
          revision: 1,
        },
      ],
      meals: [
        {
          id: '00000000-0000-4000-8000-000000000004',
          title: '午餐',
          occurred_at: new Date('2026-07-18T04:30:00.000Z'),
          energy_kcal: '393',
          protein_g: '41.25',
          item_count: '2',
          revision: 1,
        },
      ],
    } as InsightRows

    const dashboard = buildDashboard(rows, 'Asia/Shanghai', at)
    expect(dashboard.today.date).toBe('2026-07-18')
    expect(dashboard.today.items.map((item) => item.kind)).toEqual([
      'recovery',
      'nutrition',
      'workout',
    ])
    expect(dashboard.readiness).toMatchObject({ score: 80, label: '恢复信号较稳' })
    expect(dashboard.readiness.factors[0]).toMatchObject({ value: '4 /5' })
    expect(dashboard.trends[0]).toMatchObject({
      days: 7,
      activeDays: 2,
      measurementCount: 2,
      workoutCount: 1,
      mealCount: 1,
      workoutVolumeKg: 360,
      energyKcal: 393,
    })
  })

  it('does not invent readiness when recovery evidence is absent', () => {
    const dashboard = buildDashboard(
      { health: [], workouts: [], meals: [] },
      'Asia/Shanghai',
      new Date('2026-07-18T12:00:00.000Z'),
    )
    expect(dashboard.readiness.score).toBeNull()
    expect(dashboard.today.items).toEqual([])
  })
})
