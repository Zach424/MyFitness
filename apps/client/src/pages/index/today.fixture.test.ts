import { describe, expect, it } from 'vitest'

import { todayFixture } from './today.fixture'

describe('today fixture', () => {
  it('keeps completion totals consistent with rail items', () => {
    expect(todayFixture.completion.total).toBe(todayFixture.rail.length)
    expect(todayFixture.completion.completed).toBeLessThanOrEqual(todayFixture.completion.total)
  })

  it('marks estimates with an explicit confirmation action', () => {
    const estimates = todayFixture.rail.filter((item) => item.status === 'estimated')

    expect(estimates.length).toBeGreaterThan(0)
    estimates.forEach((item) => {
      expect(item.action).toMatch(/确认/)
      expect(item.note).toMatch(/估计值/)
    })
  })

  it('does not present the training plan as already confirmed', () => {
    const training = todayFixture.rail.find((item) => item.id === 'training')
    expect(training?.status).toBe('planned')
  })
})
