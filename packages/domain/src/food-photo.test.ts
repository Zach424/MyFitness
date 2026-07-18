import { describe, expect, it } from 'vitest'

import { validateFoodPhotoCandidates, validateFoodPhotoConfirmation } from './food-photo'

const content = {
  summary: '仅生成待确认候选。',
  safetyStatus: 'safe' as const,
  needsManualEntry: false,
  candidates: [
    {
      catalogKey: 'rice_cooked',
      label: '熟米饭',
      confidence: 'medium' as const,
      portionRange: { minGrams: 100, maxGrams: 240 },
      visualBasis: '可见白色颗粒状主食。',
    },
  ],
}

describe('food photo validation', () => {
  it('accepts catalog-bound candidates and selected grams inside the estimate', () => {
    const result = validateFoodPhotoCandidates(content)
    expect(result.valid).toBe(true)
    expect(
      validateFoodPhotoConfirmation(content, {
        items: [{ catalogKey: 'rice_cooked', grams: 160 }],
      }),
    ).toBe(true)
  })

  it('rejects invented foods, labels and extreme portions', () => {
    expect(
      validateFoodPhotoCandidates({
        ...content,
        candidates: [{ ...content.candidates[0], catalogKey: 'invented_food' }],
      }).valid,
    ).toBe(false)
    expect(
      validateFoodPhotoCandidates({
        ...content,
        candidates: [{ ...content.candidates[0], label: 'AI 自定义米饭' }],
      }).valid,
    ).toBe(false)
    expect(
      validateFoodPhotoCandidates({
        ...content,
        candidates: [
          { ...content.candidates[0], portionRange: { minGrams: 100, maxGrams: 1_000 } },
        ],
      }).valid,
    ).toBe(false)
  })

  it('rejects confirmations outside the displayed range', () => {
    expect(
      validateFoodPhotoConfirmation(content, {
        items: [{ catalogKey: 'rice_cooked', grams: 300 }],
      }),
    ).toBe(false)
    expect(
      validateFoodPhotoConfirmation(content, { items: [{ catalogKey: 'banana', grams: 100 }] }),
    ).toBe(false)
  })
})
