import { describe, expect, it } from 'vitest'

import { personalStateLedgerSchema } from './personal-state'

const freshness = {
  asOf: '2026-08-10T08:00:00.000Z',
  validUntil: null,
  invalidatedBy: ['source_record_changed', 'time_advanced'],
} as const

const ledger = {
  policyVersion: 'personal-state-ledger-v1',
  generatedAt: '2026-08-10T08:00:00.000Z',
  confirmedRecovery: null,
  observedWindow: {
    kind: 'recording_window',
    knowledgeClass: 'observed',
    authority: 'dashboard.trends[days=7]',
    window: {
      startAt: '2026-08-03T08:00:00.000Z',
      endAt: '2026-08-10T08:00:00.000Z',
      days: 7,
    },
    activeDays: 0,
    measurementCount: 0,
    workoutCount: 0,
    mealCount: 0,
    freshness,
  },
  recoveryEstimate: {
    kind: 'recovery_state',
    knowledgeClass: 'unknown',
    authority: 'dashboard.readiness',
    evidencePolicyVersion: 'subjective-recovery-state-v1',
    state: 'unknown',
    confidence: 'insufficient',
    consistency: 'unknown',
    label: '主观恢复证据不足',
    evidenceCount: 0,
    freshness,
  },
  planExperience: null,
} as const

describe('personal state ledger contract', () => {
  it('keeps an unknown estimate distinct from confirmed absence and observations', () => {
    const parsed = personalStateLedgerSchema.parse(ledger)
    expect(parsed.confirmedRecovery).toBeNull()
    expect(parsed.observedWindow).toMatchObject({ knowledgeClass: 'observed', activeDays: 0 })
    expect(parsed.recoveryEstimate).toMatchObject({
      knowledgeClass: 'unknown',
      confidence: 'insufficient',
    })
  })

  it('rejects estimated knowledge without an estimated recovery state', () => {
    expect(
      personalStateLedgerSchema.safeParse({
        ...ledger,
        recoveryEstimate: { ...ledger.recoveryEstimate, knowledgeClass: 'estimated' },
      }).success,
    ).toBe(false)
    expect(
      personalStateLedgerSchema.safeParse({
        ...ledger,
        recoveryEstimate: {
          ...ledger.recoveryEstimate,
          freshness: { ...freshness, invalidatedBy: ['plan_reflection_changed'] },
        },
      }).success,
    ).toBe(false)
  })
})
