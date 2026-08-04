import { describe, expect, it } from 'vitest'

import {
  buildExerciseCatalogRequest,
  buildWorkoutRequest,
  createExerciseDraft,
  filterExerciseCatalog,
  initialExerciseCatalogDraft,
  initialWorkoutDraft,
  validateExerciseCatalogDraft,
  validateWorkoutDraft,
  workoutDraftSummary,
} from './workout.model'
import { starterExerciseCatalog } from '@myfitness/contracts/exercise-catalog.constants'

describe('workout page model', () => {
  it('builds ordered completed strength sets', () => {
    const draft = initialWorkoutDraft()
    const request = buildWorkoutRequest(draft)
    expect(request).not.toHaveProperty('status')
    expect(request.exercises[0]?.sets).toHaveLength(3)
    expect(request.exercises[0]).toMatchObject({
      trackingMode: 'reps_load',
      equipment: ['dumbbells'],
    })
    expect(request.exercises[0]?.sets[0]).toMatchObject({ reps: 10, load: 12, loadUnit: 'kg' })
  })

  it('maps cardio minutes and kilometers into canonical request fields', () => {
    const draft = initialWorkoutDraft()
    draft.exercises = [createExerciseDraft(starterExerciseCatalog[6])]
    const request = buildWorkoutRequest(draft, 2)
    expect(request.expectedRevision).toBe(2)
    expect(request.exercises[0]?.sets[0]).toMatchObject({
      durationSeconds: 1200,
      distanceMeters: 3000,
    })
  })

  it('validates RPE and previews completed volume only', () => {
    const draft = initialWorkoutDraft()
    draft.exercises[0]!.sets[0]!.completed = false
    draft.exercises[0]!.sets[1]!.rpe = '11'
    expect(validateWorkoutDraft(draft)).toContain('RPE')
    draft.exercises[0]!.sets[1]!.rpe = '8'
    expect(workoutDraftSummary(draft)).toMatchObject({
      completedSets: 2,
      totalSets: 3,
      volumeKg: 240,
    })
  })

  it('searches aliases and equipment while building explicit custom definitions', () => {
    const custom = {
      source: 'custom' as const,
      id: '2a7746d1-bf16-4d41-b390-f47e4ae7a956',
      userId: 'f7ef4bea-b32b-496a-9104-49def6acc492',
      key: 'custom_2a7746d1bf164d41b390f47e4ae7a956',
      name: '壶铃摆动',
      aliases: ['Kettlebell Swing'],
      category: 'strength' as const,
      trackingMode: 'reps_load' as const,
      equipment: ['kettlebell' as const],
      equipmentNotes: null,
      catalogVersion: null,
      revision: 1,
      editable: true as const,
      archivedAt: null,
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:00:00.000Z',
    }
    expect(filterExerciseCatalog([custom], 'swing')).toEqual([custom])
    expect(filterExerciseCatalog([custom], 'kettlebell')).toEqual([custom])

    const draft = initialExerciseCatalogDraft()
    draft.name = custom.name
    draft.aliases = 'Kettlebell Swing，KB Swing'
    draft.equipment = ['kettlebell']
    expect(buildExerciseCatalogRequest(draft)).toMatchObject({
      aliases: ['Kettlebell Swing', 'KB Swing'],
      equipment: ['kettlebell'],
    })
    draft.equipment = ['other']
    expect(validateExerciseCatalogDraft(draft)).toContain('具体器械')
  })
})
