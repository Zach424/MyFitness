import { describe, expect, it } from 'vitest'

import {
  createFoodCatalogEntrySchema,
  foodCatalogItemSchema,
  foodCatalogVersion,
  starterFoodCatalog,
  starterFoodCatalogReference,
} from './index'

const customInput = {
  name: '家庭炖牛肉',
  aliases: ['周末炖牛肉'],
  category: 'protein',
  nutrientsPer100g: {
    energyKcal: 186,
    proteinG: 22,
    carbohydrateG: 4,
    fatG: 9,
    fiberG: 0.8,
  },
  reference: '家庭配方估算：成品总重 1200g，2026-08-05',
  defaultServing: { amount: 1, unit: 'serving', grams: 180 },
} as const

describe('food catalog contracts', () => {
  it('accepts an explicit nutrition basis and reusable serving', () => {
    expect(createFoodCatalogEntrySchema.parse(customInput)).toMatchObject({
      reference: customInput.reference,
      defaultServing: { grams: 180 },
    })
  })

  it('rejects duplicate labels, missing references and invalid nutrients', () => {
    expect(
      createFoodCatalogEntrySchema.safeParse({ ...customInput, aliases: [customInput.name] })
        .success,
    ).toBe(false)
    expect(createFoodCatalogEntrySchema.safeParse({ ...customInput, reference: '' }).success).toBe(
      false,
    )
    expect(
      createFoodCatalogEntrySchema.safeParse({
        ...customInput,
        nutrientsPer100g: { ...customInput.nutrientsPer100g, proteinG: 120 },
      }).success,
    ).toBe(false)
  })

  it('normalizes every starter food into one immutable catalog version', () => {
    for (const entry of starterFoodCatalog) {
      expect(
        foodCatalogItemSchema.parse({
          source: 'starter',
          id: `starter:${entry.foodKey}`,
          ...entry,
          aliases: [],
          reference: starterFoodCatalogReference,
          catalogVersion: foodCatalogVersion,
          revision: 1,
          editable: false,
          archivedAt: null,
          createdAt: null,
          updatedAt: null,
        }),
      ).toBeTruthy()
    }
  })
})
