import { describe, expect, it } from 'vitest'

import { createMealSchema, favoriteFoodInputSchema, updateMealSchema } from './nutrition'

const item = {
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
} as const

const meal = {
  mealType: 'lunch',
  title: '午餐',
  source: { kind: 'manual' },
  items: [item],
  occurredAt: '2026-07-18T12:30:00+08:00',
  timezone: 'Asia/Shanghai',
} as const

describe('nutrition contracts', () => {
  it('accepts a strict meal and favorite snapshot', () => {
    expect(createMealSchema.parse(meal)).toEqual(meal)
    expect(
      favoriteFoodInputSchema.parse({ food: item.food, defaultServing: item.serving }),
    ).toEqual({ food: item.food, defaultServing: item.serving })
  })

  it('rejects duplicate positions and invalid time zones', () => {
    expect(
      createMealSchema.safeParse({
        ...meal,
        timezone: 'Shanghai-ish',
        items: [item, { ...item }],
      }).success,
    ).toBe(false)
  })

  it('requires positive portions, plausible nutrient density and revision', () => {
    expect(
      updateMealSchema.safeParse({
        ...meal,
        expectedRevision: 0,
        items: [{ ...item, serving: { ...item.serving, grams: 0 } }],
      }).success,
    ).toBe(false)
    expect(
      createMealSchema.safeParse({
        ...meal,
        items: [
          {
            ...item,
            food: {
              ...item.food,
              nutrientsPer100g: { ...item.food.nutrientsPer100g, proteinG: 101 },
            },
          },
        ],
      }).success,
    ).toBe(false)
  })
})
