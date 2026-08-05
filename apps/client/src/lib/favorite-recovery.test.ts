import { describe, expect, it } from 'vitest'
import type { FavoriteFood, FavoriteFoodInput } from '@myfitness/contracts'

import {
  classifyFavoriteEvidence,
  describeFavoriteFailure,
  favoriteMatchesSubmitted,
} from './favorite-recovery'

const submitted: FavoriteFoodInput = {
  food: {
    foodKey: 'chicken_cooked',
    name: '熟鸡胸肉',
    category: 'protein',
    nutrientsPer100g: {
      energyKcal: 165,
      proteinG: 31,
      carbohydrateG: 0,
      fatG: 3.6,
    },
    reference: '示例目录',
  },
  defaultServing: { amount: 1, unit: 'serving', grams: 120 },
}

const favorite: FavoriteFood = {
  ...submitted,
  createdAt: '2026-08-05T01:00:00.000Z',
}

describe('meal favorite response-loss recovery', () => {
  it('requires current-list reconciliation for network and retryable failures', () => {
    expect(describeFavoriteFailure('save', new Error('Failed to fetch'), '鸡胸肉').authority).toBe(
      'reconcile_required',
    )
    expect(
      describeFavoriteFailure(
        'remove',
        Object.assign(new Error('paused'), { statusCode: 503 }),
        '鸡胸肉',
      ).authority,
    ).toBe('reconcile_required')
  })

  it('terminates an explicitly refused mutation', () => {
    expect(
      describeFavoriteFailure(
        'save',
        Object.assign(new Error('invalid'), { statusCode: 400 }),
        '鸡胸肉',
      ).authority,
    ).toBe('terminal')
  })

  it('accepts saved evidence only when the complete snapshot and serving match', () => {
    expect(favoriteMatchesSubmitted(favorite, submitted)).toBe(true)
    expect(
      favoriteMatchesSubmitted(
        { ...favorite, defaultServing: { ...favorite.defaultServing, grams: 121 } },
        submitted,
      ),
    ).toBe(false)
  })

  it('classifies a matching saved favorite as applied', () => {
    expect(classifyFavoriteEvidence('save', submitted.food.foodKey, [favorite], submitted)).toBe(
      'applied',
    )
  })

  it('keeps an absent save and present removal eligible only for a new explicit toggle', () => {
    expect(classifyFavoriteEvidence('save', submitted.food.foodKey, [], submitted)).toBe(
      'not_applied',
    )
    expect(classifyFavoriteEvidence('remove', submitted.food.foodKey, [favorite])).toBe(
      'not_applied',
    )
  })

  it('accepts removal only from exact current-list absence and detects divergent save content', () => {
    expect(classifyFavoriteEvidence('remove', submitted.food.foodKey, [])).toBe('applied')
    expect(
      classifyFavoriteEvidence(
        'save',
        submitted.food.foodKey,
        [{ ...favorite, food: { ...favorite.food, name: '另一份快照' } }],
        submitted,
      ),
    ).toBe('diverged')
  })
})
