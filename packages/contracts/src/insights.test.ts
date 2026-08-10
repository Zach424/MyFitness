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
    const impossibleWindowCounts = exerciseInsightSchema.safeParse({
      ...parsed,
      windows: parsed.windows.map((window, index) =>
        index === 0 ? { ...window, sessionCount: 3, completedSetCount: 2 } : window,
      ),
    })
    expect(impossibleWindowCounts.success).toBe(false)
    if (!impossibleWindowCounts.success) {
      expect(impossibleWindowCounts.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'sessionCount cannot exceed completedSetCount',
          path: ['windows', 0, 'sessionCount'],
        }),
      )
    }
    const impossiblePointCounts = exerciseInsightSchema.safeParse({
      ...parsed,
      series: [{ ...parsed.series[0]!, completedSetCount: 4, totalSetCount: 3 }],
    })
    expect(impossiblePointCounts.success).toBe(false)
    if (!impossiblePointCounts.success) {
      expect(impossiblePointCounts.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'completedSetCount cannot exceed totalSetCount',
          path: ['series', 0, 'completedSetCount'],
        }),
      )
    }
    expect(
      exerciseInsightSchema.safeParse({
        ...parsed,
        series: [{ ...parsed.series[0]!, completedSetCount: 0 }],
      }).success,
    ).toBe(false)
    const duplicateEquipmentIdentity = {
      ...parsed.series[0]!.identity,
      equipment: ['dumbbells', 'dumbbells'] as const,
    }
    const duplicateEquipment = exerciseInsightSchema.safeParse({
      ...parsed,
      identity: duplicateEquipmentIdentity,
      series: [{ ...parsed.series[0]!, identity: duplicateEquipmentIdentity }],
    })
    expect(duplicateEquipment.success).toBe(false)
    if (!duplicateEquipment.success) {
      expect(duplicateEquipment.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'exercise insight equipment must not contain duplicates',
          path: ['identity', 'equipment'],
        }),
      )
    }
    const missingOtherNotesIdentity = {
      ...parsed.series[0]!.identity,
      equipment: ['other'] as const,
      equipmentNotes: null,
    }
    const missingOtherNotes = exerciseInsightSchema.safeParse({
      ...parsed,
      identity: missingOtherNotesIdentity,
      series: [{ ...parsed.series[0]!, identity: missingOtherNotesIdentity }],
    })
    expect(missingOtherNotes.success).toBe(false)
    if (!missingOtherNotes.success) {
      expect(missingOtherNotes.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'equipmentNotes is required when equipment contains other',
          path: ['identity', 'equipmentNotes'],
        }),
      )
    }
    const unsupportedHasMore = exerciseInsightSchema.safeParse({ ...parsed, hasMore: true })
    expect(unsupportedHasMore.success).toBe(false)
    if (!unsupportedHasMore.success) {
      expect(unsupportedHasMore.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'hasMore requires a full 180-point public prefix',
          path: ['hasMore'],
        }),
      )
    }
    const fullSeries = Array.from({ length: 180 }, (_, index) => ({
      ...parsed.series[0]!,
      workoutId: `00000000-0000-4000-${String(8_000 + index).padStart(4, '0')}-000000000001`,
    }))
    expect(
      exerciseInsightSchema.safeParse({ ...parsed, series: fullSeries, hasMore: true }).success,
    ).toBe(true)
    const staleIdentity = exerciseInsightSchema.safeParse({
      ...parsed,
      identity: { ...parsed.identity!, name: '旧动作名称' },
    })
    expect(staleIdentity.success).toBe(false)
    if (!staleIdentity.success) {
      expect(staleIdentity.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'exercise identity must match the latest insight point',
          path: ['identity'],
        }),
      )
    }
    const identityWithoutSeries = exerciseInsightSchema.safeParse({ ...parsed, series: [] })
    expect(identityWithoutSeries.success).toBe(false)
    if (!identityWithoutSeries.success) {
      expect(identityWithoutSeries.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'exercise identity must match the latest insight point',
          path: ['identity'],
        }),
      )
    }
    expect(exerciseInsightSchema.safeParse({ ...parsed, identity: null, series: [] }).success).toBe(
      true,
    )
    const swappedWindows = exerciseInsightSchema.safeParse({
      ...parsed,
      windows: [parsed.windows[1]!, parsed.windows[0]!, parsed.windows[2]!],
    })
    expect(swappedWindows.success).toBe(false)
    if (!swappedWindows.success) {
      expect(swappedWindows.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'insight windows must use the fixed 7/30/90 order',
          path: ['windows', 0, 'days'],
        }),
      )
    }
    const wrongLocalDate = exerciseInsightSchema.safeParse({
      ...parsed,
      series: [{ ...parsed.series[0]!, localDate: '2026-08-04' }],
    })
    expect(wrongLocalDate.success).toBe(false)
    if (!wrongLocalDate.success) {
      expect(wrongLocalDate.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'insight point localDate must match occurredAt in the response timezone',
          path: ['series', 0, 'localDate'],
        }),
      )
    }
    const invalidTimezone = exerciseInsightSchema.safeParse({
      ...parsed,
      timezone: 'Invalid/Timezone',
      series: [],
    })
    expect(invalidTimezone.success).toBe(false)
    if (!invalidTimezone.success) {
      expect(invalidTimezone.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'timezone must resolve insight point local dates',
          path: ['timezone'],
        }),
      )
    }
    const ascendingSeries = exerciseInsightSchema.safeParse({
      ...parsed,
      series: [
        {
          ...parsed.series[0]!,
          workoutId: '00000000-0000-4000-8000-000000000002',
          occurredAt: '2026-08-05T09:00:00.000Z',
        },
        parsed.series[0]!,
      ],
    })
    expect(ascendingSeries.success).toBe(false)
    if (!ascendingSeries.success) {
      expect(ascendingSeries.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'insight points must be ordered by occurredAt descending',
          path: ['series', 1, 'occurredAt'],
        }),
      )
    }
    const duplicateWorkout = exerciseInsightSchema.safeParse({
      ...parsed,
      series: [parsed.series[0]!, { ...parsed.series[0]!, occurredAt: '2026-08-05T09:00:00.000Z' }],
    })
    expect(duplicateWorkout.success).toBe(false)
    if (!duplicateWorkout.success) {
      expect(duplicateWorkout.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'insight points must have unique aggregate identities',
          path: ['series', 1, 'workoutId'],
        }),
      )
    }
    expect(
      exerciseInsightSchema.safeParse({
        ...parsed,
        series: [
          parsed.series[0]!,
          {
            ...parsed.series[0]!,
            workoutId: '00000000-0000-4000-8000-000000000002',
          },
        ],
      }).success,
    ).toBe(true)
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
          metric: 'body.weight',
          recordRevision: 2,
          occurredAt: '2026-08-05T10:00:00.000Z',
          localDate: '2026-08-05',
          recordTimezone: 'America/New_York',
          canonicalValue: 70,
          canonicalUnit: 'kg',
          displayValue: 154.3236,
          displayUnit: 'lb',
          source: { kind: 'device', metadata: { deviceName: 'Local test scale' } },
        },
      ],
      hasMore: false,
    })

    expect(parsed.series[0]).toMatchObject({ canonicalUnit: 'kg', displayUnit: 'lb' })
    const wrongPointMetric = healthInsightSchema.safeParse({
      ...parsed,
      series: [{ ...parsed.series[0]!, metric: 'recovery.energy' }],
    })
    expect(wrongPointMetric.success).toBe(false)
    if (!wrongPointMetric.success) {
      expect(wrongPointMetric.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'health insight point metric must match the requested metric',
          path: ['series', 0, 'metric'],
        }),
      )
    }
    const invalidRecordTimezone = healthInsightSchema.safeParse({
      ...parsed,
      series: [{ ...parsed.series[0]!, recordTimezone: 'Invalid/Timezone' }],
    })
    expect(invalidRecordTimezone.success).toBe(false)
    if (!invalidRecordTimezone.success) {
      expect(invalidRecordTimezone.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'recordTimezone must be a valid IANA time zone',
          path: ['series', 0, 'recordTimezone'],
        }),
      )
    }
    const aiEstimateSource = healthInsightSchema.safeParse({
      ...parsed,
      series: [
        {
          ...parsed.series[0]!,
          source: {
            kind: 'ai_estimate',
            metadata: { modelVersion: 'fixture', promptVersion: 'fixture' },
          },
        },
      ],
    })
    expect(aiEstimateSource.success).toBe(false)
    if (!aiEstimateSource.success) {
      expect(aiEstimateSource.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'health insight points require confirmed non-AI sources',
          path: ['series', 0, 'source', 'kind'],
        }),
      )
    }
    const wrongMetricCanonicalUnit = healthInsightSchema.safeParse({
      ...parsed,
      canonicalUnit: 'cm',
      series: [
        {
          ...parsed.series[0]!,
          canonicalUnit: 'cm',
          displayUnit: 'cm',
        },
      ],
    })
    expect(wrongMetricCanonicalUnit.success).toBe(false)
    if (!wrongMetricCanonicalUnit.success) {
      expect(wrongMetricCanonicalUnit.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'health insight canonicalUnit must match the metric definition',
          path: ['series', 0, 'canonicalUnit'],
        }),
      )
    }
    const wrongMetricDisplayUnit = healthInsightSchema.safeParse({
      ...parsed,
      series: [{ ...parsed.series[0]!, displayUnit: 'hour' }],
    })
    expect(wrongMetricDisplayUnit.success).toBe(false)
    if (!wrongMetricDisplayUnit.success) {
      expect(wrongMetricDisplayUnit.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'health insight displayUnit must be allowed for the metric',
          path: ['series', 0, 'displayUnit'],
        }),
      )
    }
    const inconsistentConversion = healthInsightSchema.safeParse({
      ...parsed,
      series: [{ ...parsed.series[0]!, canonicalValue: 160, displayValue: 160 }],
    })
    expect(inconsistentConversion.success).toBe(false)
    if (!inconsistentConversion.success) {
      expect(inconsistentConversion.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'health insight values must match the persisted unit conversion',
          path: ['series', 0, 'canonicalValue'],
        }),
      )
    }
    const missingRecordedDay = healthInsightSchema.safeParse({
      ...parsed,
      windows: parsed.windows.map((window, index) =>
        index === 0 ? { ...window, recordedDays: 0 } : window,
      ),
    })
    expect(missingRecordedDay.success).toBe(false)
    if (!missingRecordedDay.success) {
      expect(missingRecordedDay.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'recorded windows require a recorded day',
          path: ['windows', 0],
        }),
      )
    }
    const invertedStatistics = healthInsightSchema.safeParse({
      ...parsed,
      windows: parsed.windows.map((window, index) =>
        index === 0 ? { ...window, statistics: { minimum: 70, average: 69, maximum: 72 } } : window,
      ),
    })
    expect(invertedStatistics.success).toBe(false)
    if (!invertedStatistics.success) {
      expect(invertedStatistics.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'health statistics must satisfy minimum <= average <= maximum',
          path: ['windows', 0, 'statistics'],
        }),
      )
    }
    const unsupportedHasMore = healthInsightSchema.safeParse({ ...parsed, hasMore: true })
    expect(unsupportedHasMore.success).toBe(false)
    if (!unsupportedHasMore.success) {
      expect(unsupportedHasMore.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'hasMore requires a full 180-point public prefix',
          path: ['hasMore'],
        }),
      )
      expect(unsupportedHasMore.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'hasMore must match the 90-day health record count',
          path: ['hasMore'],
        }),
      )
    }
    const missingPublicPoint = healthInsightSchema.safeParse({
      ...parsed,
      windows: parsed.windows.map((window, index) =>
        index === 2 ? { ...window, recordCount: 2 } : window,
      ),
    })
    expect(missingPublicPoint.success).toBe(false)
    if (!missingPublicPoint.success) {
      expect(missingPublicPoint.error.issues).toContainEqual(
        expect.objectContaining({
          message: '90-day recordCount must match the public health point prefix',
          path: ['windows', 2, 'recordCount'],
        }),
      )
    }
    const staleCanonicalUnit = healthInsightSchema.safeParse({
      ...parsed,
      canonicalUnit: 'cm',
    })
    expect(staleCanonicalUnit.success).toBe(false)
    if (!staleCanonicalUnit.success) {
      expect(staleCanonicalUnit.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'canonicalUnit must match the latest health insight point',
          path: ['canonicalUnit'],
        }),
      )
    }
    const mixedCanonicalUnits = healthInsightSchema.safeParse({
      ...parsed,
      series: [
        parsed.series[0]!,
        {
          ...parsed.series[0]!,
          recordId: '00000000-0000-4000-8000-000000000002',
          occurredAt: '2026-08-05T09:00:00.000Z',
          canonicalUnit: 'cm' as const,
        },
      ],
    })
    expect(mixedCanonicalUnits.success).toBe(false)
    if (!mixedCanonicalUnits.success) {
      expect(mixedCanonicalUnits.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'health insight points must share one canonicalUnit',
          path: ['series', 1, 'canonicalUnit'],
        }),
      )
    }
    const canonicalUnitWithoutSeries = healthInsightSchema.safeParse({ ...parsed, series: [] })
    expect(canonicalUnitWithoutSeries.success).toBe(false)
    if (!canonicalUnitWithoutSeries.success) {
      expect(canonicalUnitWithoutSeries.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'canonicalUnit must match the latest health insight point',
          path: ['canonicalUnit'],
        }),
      )
    }
    expect(
      healthInsightSchema.safeParse({
        ...parsed,
        canonicalUnit: null,
        windows: parsed.windows.map((window) => ({
          ...window,
          recordCount: 0,
          recordedDays: 0,
          statistics: { minimum: null, maximum: null, average: null },
        })),
        series: [],
      }).success,
    ).toBe(true)
    const repeatedWindow = healthInsightSchema.safeParse({
      ...parsed,
      windows: parsed.windows.map((window, index) =>
        index === 2 ? { ...window, days: 30 as const } : window,
      ),
    })
    expect(repeatedWindow.success).toBe(false)
    if (!repeatedWindow.success) {
      expect(repeatedWindow.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'insight windows must use the fixed 7/30/90 order',
          path: ['windows', 2, 'days'],
        }),
      )
    }
    const recordTimezoneDate = healthInsightSchema.safeParse({
      ...parsed,
      series: [
        {
          ...parsed.series[0]!,
          occurredAt: '2026-08-05T02:00:00.000Z',
          localDate: '2026-08-04',
        },
      ],
    })
    expect(recordTimezoneDate.success).toBe(false)
    if (!recordTimezoneDate.success) {
      expect(recordTimezoneDate.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'insight point localDate must match occurredAt in the response timezone',
          path: ['series', 0, 'localDate'],
        }),
      )
    }
    const ascendingSeries = healthInsightSchema.safeParse({
      ...parsed,
      series: [
        {
          ...parsed.series[0]!,
          recordId: '00000000-0000-4000-8000-000000000002',
          occurredAt: '2026-08-05T09:00:00.000Z',
        },
        parsed.series[0]!,
      ],
    })
    expect(ascendingSeries.success).toBe(false)
    if (!ascendingSeries.success) {
      expect(ascendingSeries.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'insight points must be ordered by occurredAt descending',
          path: ['series', 1, 'occurredAt'],
        }),
      )
    }
    const duplicateRecord = healthInsightSchema.safeParse({
      ...parsed,
      series: [parsed.series[0]!, { ...parsed.series[0]!, occurredAt: '2026-08-05T09:00:00.000Z' }],
    })
    expect(duplicateRecord.success).toBe(false)
    if (!duplicateRecord.success) {
      expect(duplicateRecord.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'insight points must have unique aggregate identities',
          path: ['series', 1, 'recordId'],
        }),
      )
    }
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
