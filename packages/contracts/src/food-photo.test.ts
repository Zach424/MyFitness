import { describe, expect, it } from 'vitest'

import {
  confirmFoodPhotoCandidateSchema,
  foodPhotoAnalysisSchema,
  foodPhotoCandidateContentSchema,
  foodPhotoConsentVersion,
} from './food-photo'

const content = {
  summary: '照片仅用于生成待确认候选。',
  safetyStatus: 'safe' as const,
  needsManualEntry: false,
  candidates: [
    {
      catalogKey: 'rice_cooked',
      label: '熟米饭',
      confidence: 'medium' as const,
      portionRange: { minGrams: 120, maxGrams: 200 },
      visualBasis: '碗中可见白色颗粒状主食。',
    },
  ],
}

describe('food photo contracts', () => {
  it('accepts bounded catalog candidate content', () => {
    expect(foodPhotoCandidateContentSchema.parse(content).candidates).toHaveLength(1)
  })

  it('rejects invalid portion ranges and duplicate confirmations', () => {
    expect(() =>
      foodPhotoCandidateContentSchema.parse({
        ...content,
        candidates: [{ ...content.candidates[0], portionRange: { minGrams: 200, maxGrams: 100 } }],
      }),
    ).toThrow()
    expect(() =>
      confirmFoodPhotoCandidateSchema.parse({
        items: [
          { catalogKey: 'rice_cooked', grams: 150 },
          { catalogKey: 'rice_cooked', grams: 180 },
        ],
      }),
    ).toThrow()
  })

  it('requires ready analysis provenance and retained private media', () => {
    expect(() =>
      foodPhotoAnalysisSchema.parse({
        id: '7f568918-1141-4cc4-ae9e-f700c5239608',
        status: 'ready',
        previewPath: null,
        content,
        source: 'fixture',
        provider: 'fixture',
        model: 'fixture-food-photo-v1',
        promptVersion: 'food-photo-candidates-v1',
        validatorVersion: 'food-photo-catalog-safety-v1',
        failureCode: null,
        mediaDeleted: false,
        createdAt: '2026-07-19T08:00:00.000Z',
        expiresAt: '2026-07-20T08:00:00.000Z',
      }),
    ).toThrow()
    expect(foodPhotoConsentVersion).toContain('2026-07-19')
  })

  it('makes pending deletion explicit without claiming that media is already gone', () => {
    expect(
      foodPhotoAnalysisSchema.parse({
        id: '7f568918-1141-4cc4-ae9e-f700c5239608',
        status: 'failed',
        previewPath: null,
        content: null,
        source: null,
        provider: null,
        model: null,
        promptVersion: 'food-photo-candidates-v1',
        validatorVersion: 'food-photo-catalog-safety-v1',
        failureCode: 'provider_unavailable',
        mediaDeleted: false,
        mediaDeletionStatus: 'pending',
        createdAt: '2026-07-19T08:00:00.000Z',
        expiresAt: '2026-07-20T08:00:00.000Z',
      }),
    ).toMatchObject({ mediaDeleted: false, mediaDeletionStatus: 'pending' })
  })
})
