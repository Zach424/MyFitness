import { describe, expect, it } from 'vitest'
import type { NutritionInsight, NutritionInsightDay } from '@myfitness/contracts'

import {
  nutritionEvidenceLevel,
  nutritionInsightDays,
  recordedDayAverage,
} from './nutrition-insight.model'

const missingDay = (localDate: string): NutritionInsightDay => ({
  localDate,
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

describe('nutrition insight view model', () => {
  it('keeps missing and unknown-fiber days distinct from numeric zero', () => {
    const missing = missingDay('2026-08-04')
    const unknownFiber: NutritionInsightDay = {
      ...missingDay('2026-08-05'),
      hasEvidence: true,
      mealCount: 1,
      itemCount: 1,
      nutrients: {
        energyKcal: 400,
        proteinG: 20,
        carbohydrateG: 50,
        fatG: 12,
        fiberG: null,
      },
    }

    expect(nutritionEvidenceLevel(missing, 'energyKcal', 400)).toBe('missing')
    expect(nutritionEvidenceLevel(unknownFiber, 'fiberG', 10)).toBe('unknown')
    expect(nutritionEvidenceLevel(unknownFiber, 'energyKcal', 400)).toBe(4)
  })

  it('slices complete local-day windows and averages only recorded days', () => {
    const insight = {
      generatedAt: '2026-08-05T12:00:00.000Z',
      timezone: 'Asia/Shanghai',
      series: Array.from({ length: 90 }, (_, index) =>
        missingDay(`day-${String(index + 1).padStart(2, '0')}`),
      ),
      windows: [],
    } as unknown as NutritionInsight
    const window = {
      days: 7,
      recordedDays: 2,
      missingDays: 5,
      mealCount: 3,
      itemCount: 4,
      fiberKnownItemCount: 2,
      nutrients: {
        energyKcal: 900,
        proteinG: 60,
        carbohydrateG: 100,
        fatG: 30,
        fiberG: 10,
      },
    } as const

    expect(nutritionInsightDays(insight, 7)).toHaveLength(7)
    expect(recordedDayAverage(window, 'energyKcal')).toBe(450)
  })
})
