import { describe, expect, it } from 'vitest'

import {
  exerciseInsightSchema,
  healthInsightSchema,
  historyCalendarSchema,
  nutritionInsightSchema,
} from './insights'

describe('history calendar contract', () => {
  const days = Array.from({ length: 28 }, (_, index) => {
    const localDate = new Date(Date.UTC(2026, 6, 9 + index)).toISOString().slice(0, 10)
    return {
      localDate,
      hasRecords: index === 27,
      healthRecordCount: index === 27 ? 2 : 0,
      workoutCount: 0,
      mealCount: index === 27 ? 1 : 0,
    }
  })

  it('keeps exactly 28 ascending current-record days and explicit empty dates', () => {
    const parsed = historyCalendarSchema.parse({
      generatedAt: '2026-08-05T12:00:00.000Z',
      timezone: 'Asia/Shanghai',
      startDate: '2026-07-09',
      endDate: '2026-08-05',
      series: days,
    })

    expect(parsed.series).toHaveLength(28)
    expect(parsed.series[0]).toMatchObject({ hasRecords: false, healthRecordCount: 0 })
    expect(parsed.series[27]).toMatchObject({
      hasRecords: true,
      healthRecordCount: 2,
      mealCount: 1,
    })
  })

  it('rejects a zero-count day marked as recorded and mismatched range labels', () => {
    expect(
      historyCalendarSchema.safeParse({
        generatedAt: '2026-08-05T12:00:00.000Z',
        timezone: 'Asia/Shanghai',
        startDate: '2026-07-10',
        endDate: '2026-08-05',
        series: days.map((day, index) => (index === 0 ? { ...day, hasRecords: true } : day)),
      }).success,
    ).toBe(false)
  })
})

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

describe('nutrition insight contract', () => {
  const missingDay = (index: number) => ({
    localDate: `2026-07-${String(index + 1).padStart(2, '0')}`,
    hasEvidence: false,
    mealCount: 0,
    itemCount: 0,
    fiberKnownItemCount: 0,
    nutrients: {
      energyKcal: null,
      proteinG: null,
      carbohydrateG: null,
      fatG: null,
      fiberG: null,
    },
  })

  it('keeps missing intake evidence nullable and fiber coverage explicit', () => {
    const series = Array.from({ length: 90 }, (_, index) => missingDay(index))
    series[89] = {
      localDate: '2026-09-29',
      hasEvidence: true,
      mealCount: 2,
      itemCount: 3,
      fiberKnownItemCount: 2,
      nutrients: {
        energyKcal: 860,
        proteinG: 54,
        carbohydrateG: 95,
        fatG: 24,
        fiberG: 9,
      },
    }
    const parsed = nutritionInsightSchema.parse({
      generatedAt: '2026-09-29T12:00:00.000Z',
      timezone: 'Asia/Shanghai',
      windows: [7, 30, 90].map((days) => ({
        days,
        recordedDays: 1,
        missingDays: days - 1,
        mealCount: 2,
        itemCount: 3,
        fiberKnownItemCount: 2,
        nutrients: {
          energyKcal: 860,
          proteinG: 54,
          carbohydrateG: 95,
          fatG: 24,
          fiberG: 9,
        },
      })),
      series,
    })

    expect(parsed.series[0]?.nutrients.energyKcal).toBeNull()
    expect(parsed.series[89]).toMatchObject({ fiberKnownItemCount: 2, itemCount: 3 })
  })

  it('rejects zero-filled missing days and invented fiber totals', () => {
    const series = Array.from({ length: 90 }, (_, index) => missingDay(index))
    series[0] = {
      ...series[0]!,
      nutrients: { ...series[0]!.nutrients, energyKcal: 0, fiberG: 0 },
    }
    const result = nutritionInsightSchema.safeParse({
      generatedAt: '2026-09-29T12:00:00.000Z',
      timezone: 'Asia/Shanghai',
      windows: [],
      series,
    })

    expect(result.success).toBe(false)
  })
})

describe('health insight contract', () => {
  it('keeps canonical statistics and recorded display provenance separate', () => {
    const parsed = healthInsightSchema.parse({
      generatedAt: '2026-08-05T12:00:00.000Z',
      timezone: 'Asia/Shanghai',
      metric: 'body.weight',
      canonicalUnit: 'kg',
      windows: [7, 30, 90].map((days) => ({
        days,
        recordCount: 1,
        recordedDays: 1,
        statistics: { minimum: 70, maximum: 70, average: 70 },
      })),
      series: [
        {
          recordId: '00000000-0000-4000-8000-000000000001',
          recordRevision: 2,
          occurredAt: '2026-08-05T10:00:00.000Z',
          localDate: '2026-08-05',
          recordTimezone: 'America/New_York',
          canonicalValue: 70,
          canonicalUnit: 'kg',
          displayValue: 154.32,
          displayUnit: 'lb',
          source: { kind: 'device', metadata: { deviceName: 'Local test scale' } },
        },
      ],
      hasMore: false,
    })

    expect(parsed.series[0]).toMatchObject({ canonicalUnit: 'kg', displayUnit: 'lb' })
  })

  it('rejects invented statistics for an empty metric', () => {
    const result = healthInsightSchema.safeParse({
      generatedAt: '2026-08-05T12:00:00.000Z',
      timezone: 'Asia/Shanghai',
      metric: 'recovery.energy',
      canonicalUnit: null,
      windows: [7, 30, 90].map((days) => ({
        days,
        recordCount: 0,
        recordedDays: 0,
        statistics: { minimum: 0, maximum: null, average: null },
      })),
      series: [],
      hasMore: false,
    })

    expect(result.success).toBe(false)
  })
})
