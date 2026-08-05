import { describe, expect, it } from 'vitest'

import type { FoodPhotoAnalysis } from '@myfitness/contracts'

import { buildFoodPhotoConfirmation, reviewDraftFromAnalysis } from './food-photo-workflow.model'

const readyAnalysis = {
  status: 'ready',
  content: {
    summary: '校样候选',
    safetyStatus: 'safe',
    needsManualEntry: false,
    candidates: [
      {
        catalogKey: 'rice_cooked',
        label: '熟米饭',
        confidence: 'medium',
        portionRange: { minGrams: 100, maxGrams: 220 },
        visualBasis: '碗中主食',
      },
      {
        catalogKey: 'chicken_breast_cooked',
        label: '熟鸡胸肉',
        confidence: 'low',
        portionRange: { minGrams: 80, maxGrams: 160 },
        visualBasis: '切片蛋白质食物',
      },
    ],
  },
} satisfies Pick<FoodPhotoAnalysis, 'status' | 'content'>

describe('food photo workflow model', () => {
  it('starts with displayed candidates selected at midpoint grams', () => {
    expect(reviewDraftFromAnalysis(readyAnalysis)).toEqual({
      selected: ['rice_cooked', 'chicken_breast_cooked'],
      grams: { rice_cooked: '160', chicken_breast_cooked: '120' },
    })
  })

  it('builds only explicitly selected catalog-bound integer grams', () => {
    expect(
      buildFoodPhotoConfirmation(readyAnalysis, {
        selected: ['rice_cooked'],
        grams: { rice_cooked: '165' },
      }),
    ).toEqual({ items: [{ catalogKey: 'rice_cooked', grams: 165 }] })
  })

  it('rejects an empty selection and grams outside the displayed range', () => {
    expect(() => buildFoodPhotoConfirmation(readyAnalysis, { selected: [], grams: {} })).toThrow(
      '至少选择一个候选',
    )
    expect(() =>
      buildFoodPhotoConfirmation(readyAnalysis, {
        selected: ['rice_cooked'],
        grams: { rice_cooked: '221' },
      }),
    ).toThrow('显示的区间内')
  })

  it('rejects failed analysis state instead of inventing a visual fallback', () => {
    expect(() =>
      buildFoodPhotoConfirmation(
        { status: 'failed', content: null },
        { selected: ['rice_cooked'], grams: { rice_cooked: '160' } },
      ),
    ).toThrow('不可确认')
  })
})
