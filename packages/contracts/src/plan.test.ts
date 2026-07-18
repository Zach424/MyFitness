import { describe, expect, it } from 'vitest'

import { generateWeeklyPlanSchema, planDecisionSchema } from './plan'

describe('weekly plan contract', () => {
  it('accepts Monday generation and explicit decisions', () => {
    expect(generateWeeklyPlanSchema.parse({ weekStart: '2026-07-20' })).toEqual({
      weekStart: '2026-07-20',
    })
    expect(
      planDecisionSchema.parse({
        decision: 'modified',
        expectedRevision: 1,
        selections: [{ activityId: 'mon_squat', optionId: 'chair_squat' }],
      }),
    ).toMatchObject({ decision: 'modified' })
  })

  it('rejects non-Monday weeks and ambiguous decision payloads', () => {
    expect(generateWeeklyPlanSchema.safeParse({ weekStart: '2026-07-21' }).success).toBe(false)
    expect(
      planDecisionSchema.safeParse({
        decision: 'accepted',
        expectedRevision: 1,
        selections: [{ activityId: 'mon_squat', optionId: 'chair_squat' }],
      }).success,
    ).toBe(false)
    expect(
      planDecisionSchema.safeParse({
        decision: 'modified',
        expectedRevision: 1,
        selections: [],
      }).success,
    ).toBe(false)
  })
})
