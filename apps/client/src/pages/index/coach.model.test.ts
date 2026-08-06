import type { Dashboard, WeeklyPlanListItem } from '@myfitness/contracts'
import { describe, expect, it } from 'vitest'

import { buildCoachSnapshot, currentWeekPlan } from './coach.model'

const sevenDayTrend = {
  days: 7 as const,
  activeDays: 4,
  measurementCount: 5,
  workoutCount: 2,
  mealCount: 9,
  workoutVolumeKg: 1800,
  activeMinutes: 85,
  energyKcal: 6200,
  proteinG: 330,
}

const dashboard: Dashboard = {
  generatedAt: '2026-08-06T08:00:00.000Z',
  timezone: 'Asia/Shanghai',
  today: { date: '2026-08-06', items: [] },
  readiness: { score: 72, label: '恢复尚可', note: '测试摘要', factors: [] },
  trends: [sevenDayTrend, { ...sevenDayTrend, days: 30 }, { ...sevenDayTrend, days: 90 }],
}

const plan = {
  id: '11111111-1111-4111-8111-111111111111',
  revision: 3,
  status: 'accepted',
  freshness: { state: 'current' },
  days: [
    { date: '2026-08-03', session: { plannedMinutes: 35 } },
    { date: '2026-08-04', session: null },
    { date: '2026-08-05', session: { plannedMinutes: 45 } },
    { date: '2026-08-06', session: null },
    { date: '2026-08-07', session: { plannedMinutes: 30 } },
    { date: '2026-08-08', session: null },
    { date: '2026-08-09', session: null },
  ],
  sessionLinks: [
    { planRevision: 3, sessionDate: '2026-08-03' },
    { planRevision: 2, sessionDate: '2026-08-05' },
    { planRevision: 3, sessionDate: '2026-08-10' },
  ],
} as WeeklyPlanListItem

describe('coach workbench presentation model', () => {
  it('selects the plan that contains today instead of a future first item', () => {
    const future = {
      ...plan,
      id: '22222222-2222-4222-8222-222222222222',
      days: plan.days.map((day, index) => ({ ...day, date: `2026-08-${10 + index}` })),
    }

    expect(currentWeekPlan([future, plan], '2026-08-06')?.id).toBe(plan.id)
    expect(currentWeekPlan([future], '2026-08-06')).toBeUndefined()
  })

  it('summarizes confirmed evidence and only current-revision explicit links', () => {
    const snapshot = buildCoachSnapshot(dashboard, [plan])

    expect(snapshot.trend).toMatchObject({ activeDays: 4, workoutCount: 2, mealCount: 9 })
    expect(snapshot.plan).toMatchObject({
      plannedSessions: 3,
      recordedSessions: 1,
      plannedMinutes: 110,
      statusLabel: '已采用',
      freshnessLabel: '依据仍是当前版本',
    })
    expect(buildCoachSnapshot(dashboard, []).plan).toBeUndefined()
  })
})
