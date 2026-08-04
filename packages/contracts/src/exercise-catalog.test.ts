import { describe, expect, it } from 'vitest'

import {
  createExerciseCatalogEntrySchema,
  exerciseCatalogItemSchema,
  exerciseCatalogVersion,
  starterExerciseCatalog,
} from './exercise-catalog'

const customInput = {
  name: '壶铃摆动',
  aliases: ['Kettlebell Swing'],
  category: 'strength',
  trackingMode: 'reps_load',
  equipment: ['kettlebell'],
} as const

describe('exercise catalog contracts', () => {
  it('accepts explicit custom tracking and equipment semantics', () => {
    expect(createExerciseCatalogEntrySchema.parse(customInput)).toMatchObject({
      trackingMode: 'reps_load',
      equipment: ['kettlebell'],
    })
  })

  it('rejects duplicate labels, equipment and unnamed other equipment', () => {
    expect(
      createExerciseCatalogEntrySchema.safeParse({
        ...customInput,
        aliases: [customInput.name],
      }).success,
    ).toBe(false)
    expect(
      createExerciseCatalogEntrySchema.safeParse({
        ...customInput,
        equipment: ['kettlebell', 'kettlebell'],
      }).success,
    ).toBe(false)
    expect(
      createExerciseCatalogEntrySchema.safeParse({ ...customInput, equipment: ['other'] }).success,
    ).toBe(false)
  })

  it('keeps every starter definition tied to one version and an explicit mode/equipment set', () => {
    for (const entry of starterExerciseCatalog) {
      expect(
        exerciseCatalogItemSchema.parse({
          source: 'starter',
          id: `starter:${entry.key}`,
          ...entry,
          equipmentNotes: null,
          catalogVersion: exerciseCatalogVersion,
          revision: 1,
          editable: false,
          archivedAt: null,
          createdAt: null,
          updatedAt: null,
        }),
      ).toBeTruthy()
    }
  })
})
