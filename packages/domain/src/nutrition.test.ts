import { describe, expect, it } from 'vitest'

import { calculateMeal, calculateServingNutrition } from './nutrition'

describe('nutrition calculations', () => {
  it('scales a per-100g snapshot by canonical grams', () => {
    expect(
      calculateServingNutrition(
        { energyKcal: 130, proteinG: 2.7, carbohydrateG: 28, fatG: 0.3, fiberG: 0.4 },
        150,
      ),
    ).toEqual({
      energyKcal: 195,
      proteinG: 4.05,
      carbohydrateG: 42,
      fatG: 0.45,
      fiberG: 0.6,
    })
  })

  it('sums item snapshots without deriving label energy from macros', () => {
    const result = calculateMeal([
      {
        position: 1,
        food: {
          foodKey: 'rice_cooked',
          name: '熟米饭',
          category: 'staple',
          nutrientsPer100g: {
            energyKcal: 130,
            proteinG: 2.7,
            carbohydrateG: 28,
            fatG: 0.3,
            fiberG: 0.4,
          },
        },
        serving: { amount: 150, unit: 'g', grams: 150 },
      },
      {
        position: 2,
        food: {
          foodKey: 'chicken_breast_cooked',
          name: '熟鸡胸肉',
          category: 'protein',
          nutrientsPer100g: {
            energyKcal: 165,
            proteinG: 31,
            carbohydrateG: 0,
            fatG: 3.6,
            fiberG: 0,
          },
        },
        serving: { amount: 120, unit: 'g', grams: 120 },
      },
    ])
    expect(result.summary).toEqual({
      energyKcal: 393,
      proteinG: 41.25,
      carbohydrateG: 42,
      fatG: 4.77,
      fiberG: 0.6,
    })
  })
})
