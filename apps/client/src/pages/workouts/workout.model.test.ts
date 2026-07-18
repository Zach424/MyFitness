import { describe, expect, it } from 'vitest'

import {
  buildWorkoutRequest,
  createExerciseDraft,
  initialWorkoutDraft,
  validateWorkoutDraft,
  workoutDraftSummary,
} from './workout.model'
import { exerciseCatalog } from '@myfitness/contracts/workout.constants'

describe('workout page model', () => {
  it('builds ordered completed strength sets', () => {
    const draft = initialWorkoutDraft()
    const request = buildWorkoutRequest(draft)
    expect(request.status).toBe('completed')
    expect(request.exercises[0]?.sets).toHaveLength(3)
    expect(request.exercises[0]?.sets[0]).toMatchObject({ reps: 10, load: 12, loadUnit: 'kg' })
  })

  it('maps cardio minutes and kilometers into canonical request fields', () => {
    const draft = initialWorkoutDraft()
    draft.exercises = [createExerciseDraft(exerciseCatalog[6])]
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
})
