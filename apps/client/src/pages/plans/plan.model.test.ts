import { describe, expect, it } from 'vitest'
import type { WeeklyPlan } from '@myfitness/contracts'

import { changedPlanSelections, defaultPlanWeekStart, updatePlanSelection } from './plan.model'

const plan = {
  days: [
    {
      weekday: 'mon',
      date: '2026-07-20',
      available: true,
      session: {
        kind: 'strength',
        title: '全身力量 A',
        plannedMinutes: 30,
        intensity: 'easy',
        note: '按状态调整',
        activities: [
          {
            id: 'mon_squat',
            role: 'squat',
            selectedOptionId: 'chair_squat',
            options: [
              { id: 'chair_squat', title: '椅子深蹲', dose: '2 组', equipment: [] },
              {
                id: 'goblet_squat',
                title: '高脚杯深蹲',
                dose: '2 组',
                equipment: ['dumbbells'],
              },
            ],
          },
        ],
      },
    },
  ],
} as WeeklyPlan

describe('plan page model', () => {
  it('uses next Monday when opened on Sunday', () => {
    expect(defaultPlanWeekStart(new Date('2026-07-19T09:00:00+08:00'))).toBe('2026-07-20')
    expect(defaultPlanWeekStart(new Date('2026-07-22T09:00:00+08:00'))).toBe('2026-07-20')
  })

  it('reports only changed substitutions', () => {
    const changed = updatePlanSelection(plan, 'mon_squat', 'goblet_squat')
    expect(changedPlanSelections(plan, changed)).toEqual([
      { activityId: 'mon_squat', optionId: 'goblet_squat' },
    ])
    expect(changedPlanSelections(plan, plan)).toEqual([])
  })
})
