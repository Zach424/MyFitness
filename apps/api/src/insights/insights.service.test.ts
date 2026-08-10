import { describe, expect, it } from 'vitest'
import { dashboardSchema } from '@myfitness/contracts'

import {
  buildDashboard,
  buildExerciseInsight,
  buildHealthInsight,
  buildHistoryCalendar,
  buildNutritionInsight,
  type InsightRows,
} from './insights.service'

describe('history calendar projection', () => {
  it('keeps 28 ascending local days and derives recorded state only from counts', () => {
    const rows = Array.from({ length: 28 }, (_, index) => ({
      local_date: new Date(Date.UTC(2026, 6, 9 + index)).toISOString().slice(0, 10),
      health_record_count: index === 27 ? '2' : '0',
      workout_count: index === 26 ? '1' : '0',
      meal_count: '0',
    }))

    const calendar = buildHistoryCalendar(
      rows,
      'Asia/Shanghai',
      new Date('2026-08-05T12:00:00.000Z'),
    )

    expect(calendar).toMatchObject({ startDate: '2026-07-09', endDate: '2026-08-05' })
    expect(calendar.series[0]).toMatchObject({ hasRecords: false })
    expect(calendar.series[26]).toMatchObject({ hasRecords: true, workoutCount: 1 })
    expect(calendar.series[27]).toMatchObject({ hasRecords: true, healthRecordCount: 2 })
  })
})

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
          source_kind: 'manual',
        },
        {
          id: '00000000-0000-4000-8000-000000000002',
          metric: 'recovery.stress',
          display_value: '2',
          display_unit: 'score_1_5',
          canonical_value: '2',
          occurred_at: new Date('2026-07-17T12:00:00.000Z'),
          revision: 1,
          source_kind: 'manual',
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
      planExperience: {
        plan_id: '00000000-0000-4000-8000-000000000005',
        plan_revision: 3,
        experience: 'about_right',
        revision: 2,
        updated_at: new Date('2026-07-18T11:00:00.000Z'),
      },
    } as InsightRows

    const dashboard = buildDashboard(rows, 'Asia/Shanghai', at)
    expect(dashboard.today.date).toBe('2026-07-18')
    expect(dashboard.today.items.map((item) => item.kind)).toEqual([
      'recovery',
      'nutrition',
      'workout',
    ])
    expect(dashboard.readiness).toMatchObject({
      state: 'current_only',
      score: 75,
      confidence: 'low',
      consistency: 'aligned',
    })
    expect(dashboard.readiness.factors[0]).toMatchObject({
      metric: 'recovery.energy',
      recentScore: 75,
    })
    expect(dashboard.trends[0]).toMatchObject({
      days: 7,
      activeDays: 2,
      measurementCount: 2,
      workoutCount: 1,
      mealCount: 1,
      workoutVolumeKg: 360,
      energyKcal: 393,
    })
    expect(dashboard.personalState).toMatchObject({
      policyVersion: 'personal-state-ledger-v1',
      confirmedRecovery: {
        knowledgeClass: 'confirmed',
        observationCount: 2,
        latestEvidenceAt: '2026-07-18T00:00:00.000Z',
        sourceKinds: ['manual'],
      },
      observedWindow: {
        knowledgeClass: 'observed',
        activeDays: 2,
        measurementCount: 2,
        workoutCount: 1,
        mealCount: 1,
      },
      recoveryEstimate: {
        knowledgeClass: 'estimated',
        state: 'current_only',
        confidence: 'low',
        evidenceCount: 2,
      },
      planExperience: {
        knowledgeClass: 'user_confirmed',
        planRevision: 3,
        experience: 'about_right',
        reflectionRevision: 2,
      },
    })
    expect(dashboardSchema.parse(dashboard)).toEqual(dashboard)
    expect(
      dashboardSchema.safeParse({
        ...dashboard,
        personalState: {
          ...dashboard.personalState,
          recoveryEstimate: {
            ...dashboard.personalState.recoveryEstimate,
            knowledgeClass: 'unknown',
          },
        },
      }).success,
    ).toBe(false)
    expect(
      dashboardSchema.safeParse({
        ...dashboard,
        personalState: {
          ...dashboard.personalState,
          planExperience: {
            ...dashboard.personalState.planExperience!,
            updatedAt: '2026-07-18T13:00:00.000Z',
          },
        },
      }).success,
    ).toBe(false)
  })

  it('does not invent readiness when recovery evidence is absent', () => {
    const dashboard = buildDashboard(
      { health: [], workouts: [], meals: [], planExperience: null },
      'Asia/Shanghai',
      new Date('2026-07-18T12:00:00.000Z'),
    )
    expect(dashboard.readiness.score).toBeNull()
    expect(dashboard.readiness).toMatchObject({
      state: 'unknown',
      confidence: 'insufficient',
      consistency: 'unknown',
    })
    expect(dashboard.today.items).toEqual([])
    expect(dashboard.personalState).toMatchObject({
      confirmedRecovery: null,
      recoveryEstimate: { knowledgeClass: 'unknown', evidenceCount: 0 },
      planExperience: null,
    })
    expect(dashboardSchema.parse(dashboard)).toEqual(dashboard)
  })
})

describe('exercise insight projection', () => {
  it('maps bounded completed-set rows without replacing snapshot history', () => {
    const at = new Date('2026-08-05T12:00:00.000Z')
    const points = Array.from({ length: 181 }, (_, index) => ({
      workout_id: `00000000-0000-4000-${String(8_000 + index).padStart(4, '0')}-000000000001`,
      workout_revision: index === 0 ? 2 : 1,
      occurred_at: new Date(at.getTime() - index * 3_600_000),
      name: index === 0 ? '纠正后的名称' : '历史名称',
      category: 'strength' as const,
      tracking_mode: 'reps_load' as const,
      equipment: ['dumbbells' as const],
      equipment_notes: null,
      completed_set_count: '2',
      total_set_count: '3',
      total_reps: '20',
      volume_kg: '240.126',
      active_seconds: '0',
      distance_meters: '0',
    }))
    const insight = buildExerciseInsight(
      'goblet_squat',
      [
        {
          days: 7,
          session_count: '2',
          completed_set_count: '4',
          total_reps: '40',
          volume_kg: '480.252',
          active_seconds: '0',
          distance_meters: '0',
        },
      ],
      points,
      'Asia/Shanghai',
      at,
    )

    expect(insight.identity?.name).toBe('纠正后的名称')
    expect(insight.windows[0]).toMatchObject({ days: 7, sessionCount: 2, volumeKg: 480.25 })
    expect(insight.windows[1]).toMatchObject({ days: 30, sessionCount: 0 })
    expect(insight.series).toHaveLength(180)
    expect(insight.series[0]).toMatchObject({
      localDate: '2026-08-05',
      workoutRevision: 2,
      completedSetCount: 2,
      totalSetCount: 3,
      volumeKg: 240.13,
    })
    expect(insight.hasMore).toBe(true)
  })
})

describe('nutrition insight projection', () => {
  it('fills 90 local days without turning missing records into zero intake', () => {
    const rows = Array.from({ length: 90 }, (_, index) => ({
      local_date: new Date(Date.UTC(2026, 4, 8 + index)).toISOString().slice(0, 10),
      meal_count: '0',
      item_count: '0',
      fiber_known_item_count: '0',
      energy_kcal: null,
      protein_g: null,
      carbohydrate_g: null,
      fat_g: null,
      fiber_g: null,
    }))
    rows[84] = {
      ...rows[84]!,
      meal_count: '1',
      item_count: '2',
      fiber_known_item_count: '1',
      energy_kcal: '420.126',
      protein_g: '32.555',
      carbohydrate_g: '48',
      fat_g: '11',
      fiber_g: '4.499',
    }
    rows[89] = {
      ...rows[89]!,
      meal_count: '2',
      item_count: '3',
      fiber_known_item_count: '0',
      energy_kcal: '800',
      protein_g: '50',
      carbohydrate_g: '90',
      fat_g: '25',
      fiber_g: null,
    }

    const insight = buildNutritionInsight(
      rows,
      'Asia/Shanghai',
      new Date('2026-08-05T12:00:00.000Z'),
    )

    expect(insight.series).toHaveLength(90)
    expect(insight.series[0]).toMatchObject({
      localDate: '2026-05-08',
      hasEvidence: false,
      nutrients: { energyKcal: null, fiberG: null },
    })
    expect(insight.windows[0]).toMatchObject({
      days: 7,
      recordedDays: 2,
      missingDays: 5,
      mealCount: 3,
      itemCount: 5,
      fiberKnownItemCount: 1,
      nutrients: { energyKcal: 1220.13, fiberG: 4.5 },
    })
    expect(insight.windows[1]).toMatchObject({ days: 30, recordedDays: 2 })
  })
})

describe('health insight projection', () => {
  it('keeps canonical statistics and recorded display units with bounded points', () => {
    const at = new Date('2026-08-05T12:00:00.000Z')
    const points = Array.from({ length: 181 }, (_, index) => ({
      record_id: `00000000-0000-4000-${String(8_000 + index).padStart(4, '0')}-000000000001`,
      record_revision: index === 0 ? 2 : 1,
      occurred_at: new Date(at.getTime() - index * 3_600_000),
      timezone: 'America/New_York',
      canonical_value: index === 0 ? '70' : '69',
      canonical_unit: 'kg' as const,
      display_value: index === 0 ? '154.3235835' : '69',
      display_unit: index === 0 ? ('lb' as const) : ('kg' as const),
      source_kind: 'device' as const,
      source_metadata: { deviceName: 'Local scale' },
    }))
    const insight = buildHealthInsight(
      'body.weight',
      [
        {
          days: 7,
          record_count: '2',
          recorded_days: '2',
          minimum: '69',
          maximum: '70',
          average: '69.5',
        },
      ],
      points,
      'Asia/Shanghai',
      at,
    )

    expect(insight.canonicalUnit).toBe('kg')
    expect(insight.windows[0]).toMatchObject({ recordCount: 2, statistics: { average: 69.5 } })
    expect(insight.windows[1]).toMatchObject({ recordCount: 0, statistics: { average: null } })
    expect(insight.series).toHaveLength(180)
    expect(insight.series[0]).toMatchObject({
      localDate: '2026-08-05',
      recordRevision: 2,
      displayUnit: 'lb',
      recordTimezone: 'America/New_York',
      source: { kind: 'device', metadata: { deviceName: 'Local scale' } },
    })
    expect(insight.hasMore).toBe(true)
  })
})
