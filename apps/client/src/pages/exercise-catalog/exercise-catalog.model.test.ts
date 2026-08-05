import { describe, expect, it } from 'vitest'

import {
  buildExerciseCatalogRequest,
  exerciseCatalogDraftFromItem,
  initialExerciseCatalogDraft,
  validateExerciseCatalogDraft,
} from './exercise-catalog.model'

describe('owned exercise catalog model', () => {
  it('builds an explicit reusable definition from aliases and equipment', () => {
    const draft = initialExerciseCatalogDraft()
    draft.name = '壶铃摆动'
    draft.aliases = 'Kettlebell Swing，KB Swing'
    draft.equipment = ['kettlebell']

    expect(buildExerciseCatalogRequest(draft)).toMatchObject({
      name: '壶铃摆动',
      aliases: ['Kettlebell Swing', 'KB Swing'],
      category: 'strength',
      trackingMode: 'reps_load',
      equipment: ['kettlebell'],
    })
  })

  it('requires notes for other equipment and rejects duplicate labels', () => {
    const draft = initialExerciseCatalogDraft()
    draft.name = '地雷管推举'
    draft.equipment = ['other']
    expect(validateExerciseCatalogDraft(draft)).toContain('具体器械')

    draft.equipmentNotes = '固定地雷管装置'
    draft.aliases = '地雷管推举'
    expect(validateExerciseCatalogDraft(draft)).toContain('不能重复')
  })

  it('copies a saved snapshot into an independent correction draft', () => {
    const entry = {
      source: 'custom' as const,
      id: '2a7746d1-bf16-4d41-b390-f47e4ae7a956',
      userId: 'f7ef4bea-b32b-496a-9104-49def6acc492',
      key: 'custom_2a7746d1bf164d41b390f47e4ae7a956',
      name: '壶铃摆动',
      aliases: ['KB Swing'],
      category: 'strength' as const,
      trackingMode: 'reps_load' as const,
      equipment: ['kettlebell' as const],
      equipmentNotes: null,
      catalogVersion: null,
      revision: 2,
      editable: true as const,
      archivedAt: null,
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T01:00:00.000Z',
    }
    const draft = exerciseCatalogDraftFromItem(entry)
    draft.equipment.push('bench')
    expect(entry.equipment).toEqual(['kettlebell'])
    expect(draft).toMatchObject({ aliases: 'KB Swing', equipment: ['kettlebell', 'bench'] })
  })
})
