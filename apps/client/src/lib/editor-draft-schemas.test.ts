import { describe, expect, it } from 'vitest'

import { initialMealDraft, isMealDraft } from '../pages/nutrition/nutrition.model'
import { createDraft, isRecordDraft } from '../pages/records/record.model'
import { initialWorkoutDraft, isWorkoutDraft } from '../pages/workouts/workout.model'

describe('recoverable editor draft schemas', () => {
  it('accepts the three bounded editor shapes, including incomplete numeric input', () => {
    const workout = initialWorkoutDraft()
    workout.exercises[0]!.sets[0]!.load = ''
    workout.startedLocal = '2026-08-05 06:30'
    const meal = initialMealDraft()
    meal.occurredLocal = '2026-08-05 07:15'
    const record = createDraft('body.weight')
    record.value = ''
    record.occurredLocal = '2026-08-05 08:00'

    expect(isWorkoutDraft(workout)).toBe(true)
    expect(isMealDraft(meal)).toBe(true)
    expect(isRecordDraft(record)).toBe(true)
  })

  it('rejects extra photo, authorization, receipt and AI proposal fields', () => {
    expect(isWorkoutDraft({ ...initialWorkoutDraft(), accessToken: 'secret' })).toBe(false)
    expect(isMealDraft({ ...initialMealDraft(), localPhotoPath: 'tmp/photo.jpg' })).toBe(false)
    expect(isRecordDraft({ ...createDraft('body.weight'), erasureReceipt: 'secret' })).toBe(false)
    expect(isMealDraft({ ...initialMealDraft(), photoAnalysis: { candidates: [] } })).toBe(false)
  })

  it('rejects unknown metrics, invalid units and unbounded collections', () => {
    expect(isRecordDraft({ ...createDraft('body.weight'), metric: 'medical.diagnosis' })).toBe(
      false,
    )
    expect(isRecordDraft({ ...createDraft('body.weight'), unit: 'bpm' })).toBe(false)
    const workout = initialWorkoutDraft()
    workout.exercises = Array.from({ length: 31 }, () => workout.exercises[0]!)
    expect(isWorkoutDraft(workout)).toBe(false)
  })
})
