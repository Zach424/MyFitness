import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildWorkoutRequest,
  createExerciseDraft,
  filterExerciseCatalog,
  draftFromWorkout,
  initialWorkoutDraft,
  validateWorkoutDraft,
  workoutDraftSummary,
} from './workout.model'
import { starterExerciseCatalog } from '@myfitness/contracts/exercise-catalog.constants'

describe('workout page model', () => {
  afterEach(() => vi.useRealTimers())

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

  it('converts explicit local session bounds and rejects reversed times', () => {
    const draft = initialWorkoutDraft()
    draft.timezone = 'Asia/Shanghai'
    draft.startedLocal = '2026-07-18 18:00'
    draft.endedLocal = '2026-07-18 18:45'
    expect(buildWorkoutRequest(draft)).toMatchObject({
      startedAt: '2026-07-18T10:00:00.000Z',
      endedAt: '2026-07-18T10:45:00.000Z',
      timezone: 'Asia/Shanghai',
    })
    draft.endedLocal = '2026-07-18 17:59'
    expect(validateWorkoutDraft(draft)).toContain('不能早于')
  })

  it('derives bounded session endpoints when occurrence fields are incomplete', () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-07-18T12:00:00.000Z')

    const onlyStart = initialWorkoutDraft()
    onlyStart.timezone = 'Asia/Shanghai'
    onlyStart.startedLocal = '2026-07-18 18:00'
    expect(buildWorkoutRequest(onlyStart)).toMatchObject({
      startedAt: '2026-07-18T10:00:00.000Z',
      endedAt: '2026-07-18T10:45:00.000Z',
    })

    const recentStart = initialWorkoutDraft()
    recentStart.timezone = 'Asia/Shanghai'
    recentStart.startedLocal = '2026-07-18 19:45'
    expect(buildWorkoutRequest(recentStart)).toMatchObject({
      startedAt: '2026-07-18T11:45:00.000Z',
      endedAt: '2026-07-18T12:00:00.000Z',
    })

    const onlyEnd = initialWorkoutDraft()
    onlyEnd.timezone = 'Asia/Shanghai'
    onlyEnd.endedLocal = '2026-07-18 19:30'
    expect(buildWorkoutRequest(onlyEnd)).toMatchObject({
      startedAt: '2026-07-18T10:45:00.000Z',
      endedAt: '2026-07-18T11:30:00.000Z',
    })

    expect(buildWorkoutRequest(initialWorkoutDraft())).toMatchObject({
      startedAt: '2026-07-18T11:15:00.000Z',
      endedAt: '2026-07-18T12:00:00.000Z',
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

  it('searches aliases and equipment in the active picker', () => {
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
  })

  it('binds corrections to a revision but keeps repeats independent', () => {
    const request = buildWorkoutRequest(initialWorkoutDraft())
    const workout = {
      ...request,
      id: '00000000-0000-4000-8000-000000000021',
      userId: '00000000-0000-4000-8000-000000000022',
      status: 'completed' as const,
      exercises: request.exercises.map((exercise, exerciseIndex) => ({
        ...exercise,
        id: `00000000-0000-4000-8000-00000000003${exerciseIndex}`,
        sets: exercise.sets.map((set, setIndex) => ({
          ...set,
          id: `00000000-0000-4000-8000-00000000004${setIndex}`,
          canonicalLoadKg: set.load ?? null,
        })),
      })),
      summary: {
        completedSets: 3,
        totalSets: 3,
        volumeKg: 360,
        distanceMeters: 0,
        activeSeconds: 0,
      },
      note: request.note ?? null,
      revision: 4,
      createdAt: '2026-07-18T10:00:00.000Z',
      updatedAt: '2026-07-18T10:45:00.000Z',
    }

    expect(draftFromWorkout(workout).correction).toEqual({
      aggregateId: workout.id,
      baseRevision: 4,
    })
    expect(draftFromWorkout(workout, true).correction).toBeUndefined()
  })
})
