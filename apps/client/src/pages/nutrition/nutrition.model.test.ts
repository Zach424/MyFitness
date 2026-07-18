import { describe, expect, it } from 'vitest'

import { starterFoodCatalog } from '@myfitness/contracts/nutrition.constants'

import {
  buildMealRequest,
  draftFromCatalog,
  draftFromMeal,
  initialMealDraft,
  mealDraftSummary,
  validateMealDraft,
} from './nutrition.model'

describe('nutrition page model', () => {
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
    const repeated = draftFromMeal(created, true)
    expect(repeated.note).toBe('')
    expect(repeated.occurredAt).toBeUndefined()
    expect(repeated.items[0]?.amount).toBe('120')
  })
})
