import { describe, expect, it } from 'vitest'

import { starterFoodCatalog } from '@myfitness/contracts/nutrition.constants'

import {
  buildMealRequest,
  draftFromCatalog,
  draftFromFoodCatalogItem,
  draftsFromPhotoConfirmation,
  draftFromMeal,
  initialMealDraft,
  mealDraftSummary,
  validateMealDraft,
} from './nutrition.model'

describe('nutrition page model', () => {
  it('maps confirmed photo candidates to gram-based unsaved food drafts', () => {
    const items = draftsFromPhotoConfirmation([
      { catalogKey: 'rice_cooked', grams: 165 },
      { catalogKey: 'chicken_breast_cooked', grams: 120 },
    ])
    expect(items.map((item) => [item.food.foodKey, item.amount, item.unit])).toEqual([
      ['rice_cooked', '165', 'g'],
      ['chicken_breast_cooked', '120', 'g'],
    ])
  })

  it('builds canonical grams and a deterministic meal preview', () => {
    const draft = initialMealDraft()
    draft.items = [draftFromCatalog(starterFoodCatalog[0]), draftFromCatalog(starterFoodCatalog[1])]
    expect(mealDraftSummary(draft)).toMatchObject({
      energyKcal: 393,
      proteinG: 41.3,
      carbohydrateG: 42,
      fatG: 4.8,
    })
    expect(buildMealRequest(draft).items.map((item) => item.serving.grams)).toEqual([120, 150])
  })

  it('turns an owned definition into an independent meal draft snapshot', () => {
    const definition = {
      source: 'custom' as const,
      id: '00000000-0000-4000-8000-000000000010',
      userId: '00000000-0000-4000-8000-000000000011',
      foodKey: 'custom:00000000000040008000000000000010',
      name: '家庭炖牛肉',
      aliases: ['周末炖牛肉'],
      category: 'protein' as const,
      nutrientsPer100g: {
        energyKcal: 186,
        proteinG: 22,
        carbohydrateG: 4,
        fatG: 9,
      },
      reference: '家庭配方估算：2026-08-05',
      defaultServing: { amount: 1, unit: 'serving' as const, grams: 180 },
      catalogVersion: null,
      revision: 1,
      editable: true as const,
      archivedAt: null,
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:00:00.000Z',
    }
    const draft = draftFromFoodCatalogItem(definition)
    definition.name = '纠正后的名称'
    definition.nutrientsPer100g.energyKcal = 165
    expect(draft).toMatchObject({
      food: {
        name: '家庭炖牛肉',
        nutrientsPer100g: { energyKcal: 186 },
        reference: '家庭配方估算：2026-08-05',
      },
      amount: '1',
      unit: 'serving',
      gramsPerUnit: 180,
    })
  })

  it('rejects an empty meal and invalid portions', () => {
    const draft = initialMealDraft()
    expect(validateMealDraft(draft)).toBe('请至少添加一种食物')
    draft.items = [draftFromCatalog(starterFoodCatalog[0])]
    draft.items[0]!.amount = '0'
    expect(validateMealDraft(draft)).toContain('份量需大于 0')
  })

  it('repeats the food structure without copying note, time or identity', () => {
    const draft = initialMealDraft()
    draft.items = [draftFromCatalog(starterFoodCatalog[0])]
    const created = {
      ...buildMealRequest(draft),
      occurredAt: '2026-07-18T04:00:42.789Z',
      timezone: 'Asia/Shanghai',
      id: '00000000-0000-4000-8000-000000000001',
      userId: '00000000-0000-4000-8000-000000000002',
      items: buildMealRequest(draft).items.map((item) => ({
        ...item,
        id: '00000000-0000-4000-8000-000000000003',
        summary: {
          energyKcal: 198,
          proteinG: 37.2,
          carbohydrateG: 0,
          fatG: 4.32,
          fiberG: 0,
        },
      })),
      summary: {
        energyKcal: 198,
        proteinG: 37.2,
        carbohydrateG: 0,
        fatG: 4.32,
        fiberG: 0,
      },
      note: '昨天的备注',
      revision: 1,
      createdAt: '2026-07-18T04:00:00.000Z',
      updatedAt: '2026-07-18T04:00:00.000Z',
    }
    const correction = draftFromMeal(created)
    expect(buildMealRequest(correction, 1).occurredAt).toBe('2026-07-18T04:00:42.789Z')
    const repeated = draftFromMeal(created, true)
    expect(repeated.note).toBe('')
    expect(repeated.occurredLocal).toBe('')
    expect(repeated.items[0]?.amount).toBe('120')
  })

  it('converts an explicit local meal time into an offset instant', () => {
    const draft = initialMealDraft()
    draft.items = [draftFromCatalog(starterFoodCatalog[0])]
    draft.occurredLocal = '2026-07-18 12:30'
    draft.timezone = 'Asia/Shanghai'
    expect(buildMealRequest(draft)).toMatchObject({
      occurredAt: '2026-07-18T04:30:00.000Z',
      timezone: 'Asia/Shanghai',
    })
  })
})
