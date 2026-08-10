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

    const earlierReference = historyCalendarSchema.safeParse({
      generatedAt: '2026-08-04T12:00:00.000Z',
      timezone: 'Asia/Shanghai',
      startDate: '2026-07-09',
      endDate: '2026-08-05',
      series: days,
    })
    expect(earlierReference.success).toBe(false)
    if (!earlierReference.success) {
      expect(earlierReference.error.issues).toContainEqual(
        expect.objectContaining({ path: ['series', 0, 'localDate'] }),
      )
    }

    const missingAndRepeatedDate = historyCalendarSchema.safeParse({
      generatedAt: '2026-08-05T12:00:00.000Z',
      timezone: 'Asia/Shanghai',
      startDate: '2026-07-09',
      endDate: '2026-08-05',
      series: days.map((day, index) =>
        index === 12 ? { ...day, localDate: days[13]!.localDate } : day,
      ),
    })
    expect(missingAndRepeatedDate.success).toBe(false)
    if (!missingAndRepeatedDate.success) {
      expect(missingAndRepeatedDate.error.issues).toContainEqual(
        expect.objectContaining({ path: ['series', 12, 'localDate'] }),
      )
    }
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
    const futurePoint = exerciseInsightSchema.safeParse({
      ...parsed,
      series: [{ ...parsed.series[0]!, occurredAt: '2026-08-05T13:00:00.000Z' }],
    })
    expect(futurePoint.success).toBe(false)
    if (!futurePoint.success) {
      expect(futurePoint.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'insight point cannot occur after generatedAt',
          path: ['series', 0, 'occurredAt'],
        }),
      )
    }
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
    localDate: new Date(Date.UTC(2026, 6, 2 + index)).toISOString().slice(0, 10),
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

    const futureDate = nutritionInsightSchema.safeParse({
      ...parsed,
      series: parsed.series.map((day, index) =>
        index === 89 ? { ...day, localDate: '2026-09-30' } : day,
      ),
    })
    expect(futureDate.success).toBe(false)
    if (!futureDate.success) {
      expect(futureDate.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'nutrition series must cover 90 consecutive reference local dates',
          path: ['series', 89, 'localDate'],
        }),
      )
    }

    const inventedWindow = nutritionInsightSchema.safeParse({
      ...parsed,
      windows: parsed.windows.map((window, index) =>
        index === 0 ? { ...window, mealCount: window.mealCount + 1 } : window,
      ),
    })
    expect(inventedWindow.success).toBe(false)
    if (!inventedWindow.success) {
      expect(inventedWindow.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'nutrition windows must be derived from the accepted date series',
          path: ['windows', 0],
        }),
      )
    }
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
    const futurePoint = healthInsightSchema.safeParse({
      ...parsed,
      series: [{ ...parsed.series[0]!, occurredAt: '2026-08-05T13:00:00.000Z' }],
    })
    expect(futurePoint.success).toBe(false)
    if (!futurePoint.success) {
      expect(futurePoint.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'insight point cannot occur after generatedAt',
          path: ['series', 0, 'occurredAt'],
        }),
      )
    }
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
