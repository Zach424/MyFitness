import { describe, expect, it } from 'vitest'

import { personalModelCurrentSubjectViewSchema } from './personal-model'
import { isPersonalModelCurrentSubjectView } from './personal-model-current-subject.runtime'

const frequencyView = () => ({
  schemaVersion: 'personal-model-current-subject-view-v1',
  subjectKey: 'training.recorded_frequency',
  current: {
    itemId: '6f3c5de9-9856-46f4-b419-54329d6aee1c',
    generation: 2,
    revision: 3,
    status: 'active',
    feedbackState: 'unreviewed',
    terminal: false,
    confidence: { level: 'moderate', limitations: ['single_window'] },
    evidence: {
      asOf: '2026-07-28T16:00:00.000Z',
      window: {
        startAt: '2026-06-30T16:00:00.000Z',
        endAt: '2026-07-28T16:00:00.000Z',
        timezone: 'Asia/Shanghai',
      },
      qualifiedCount: 8,
      supportingCount: 7,
      contradictingCount: 1,
      withdrawnCount: 0,
    },
    validFrom: '2026-07-28T16:00:00.000Z',
    validTo: null,
    observedFrom: '2026-06-30T16:00:00.000Z',
    observedThrough: '2026-07-28T16:00:00.000Z',
    derivedAt: '2026-07-28T16:00:00.000Z',
    updatedAt: '2026-07-28T16:00:00.000Z',
    kind: 'behavior',
    claimSchemaVersion: 'recorded_training_frequency_behavior_v1',
    source: 'deterministic_rule',
    claim: {
      observationWindow: {
        startDate: '2026-07-01',
        endDateExclusive: '2026-07-29',
        completeWeeks: 4,
        timezone: 'Asia/Shanghai',
      },
      weeklyRecordedSessionCounts: [2, 3, 1, 2],
      qualifyingWorkoutCount: 8,
      recordedWeekCount: 4,
      medianSessionsPerWeek: 2,
      minimumSessionsPerWeek: 1,
      maximumSessionsPerWeek: 3,
      frequencyUnit: 'recorded_sessions_per_week',
      medianPolicyVersion: 'numeric-median-v1',
    },
  },
})

const availabilityView = () => ({
  ...frequencyView(),
  subjectKey: 'training.availability',
  current: {
    ...frequencyView().current,
    kind: 'constraint',
    claimSchemaVersion: 'training_availability_constraint_v1',
    source: 'user_confirmed',
    confidence: { level: 'high', limitations: [] },
    evidence: {
      ...frequencyView().current.evidence,
      qualifiedCount: 1,
      supportingCount: 1,
      contradictingCount: 0,
    },
    claim: {
      availableDays: ['mon', 'wed', 'fri'],
      sessionMinutes: 60,
      sourceGoalRevision: 3,
      durationUnit: 'minutes',
    },
  },
})

const durationView = () => ({
  ...frequencyView(),
  subjectKey: 'training.recorded_session_duration',
  current: {
    ...frequencyView().current,
    kind: 'baseline',
    claimSchemaVersion: 'recorded_session_duration_baseline_v1',
    claim: {
      observationWindow: {
        startDate: '2026-07-01',
        endDateExclusive: '2026-07-29',
        completeWeeks: 4,
        timezone: 'Asia/Shanghai',
      },
      sampleCount: 8,
      coveredWeeks: 4,
      firstQuartileMinutes: 40,
      medianMinutes: 50,
      thirdQuartileMinutes: 60,
      durationUnit: 'minutes',
      durationPolicyVersion: 'elapsed-duration-minutes-v1',
      quartilePolicyVersion: 'nearest-rank-quartiles-v1',
    },
  },
})

const agreesWithZod = (value: unknown) =>
  expect(isPersonalModelCurrentSubjectView(value)).toBe(
    personalModelCurrentSubjectViewSchema.safeParse(value).success,
  )

describe('personal model current-subject lightweight runtime', () => {
  it('agrees with the authoritative schema for empty and all three full views', () => {
    agreesWithZod({
      schemaVersion: 'personal-model-current-subject-view-v1',
      subjectKey: 'training.recorded_frequency',
      current: null,
    })
    agreesWithZod(frequencyView())
    agreesWithZod(availabilityView())
    agreesWithZod(durationView())
  })

  it.each([
    null,
    { ...frequencyView(), ownerUserId: '3a6ba5b6-d4eb-4d32-b721-d42e6523e361' },
    { ...frequencyView(), schemaVersion: 'personal-model-current-subject-view-v2' },
    { ...frequencyView(), subjectKey: 'training.recorded_session_duration' },
    { ...frequencyView(), current: { ...frequencyView().current, terminal: true } },
    {
      ...frequencyView(),
      current: {
        ...frequencyView().current,
        confidence: { level: 'moderate', limitations: ['single_window', 'single_window'] },
      },
    },
    {
      ...frequencyView(),
      current: {
        ...frequencyView().current,
        evidence: { ...frequencyView().current.evidence, supportingCount: 9 },
      },
    },
    {
      ...frequencyView(),
      current: {
        ...frequencyView().current,
        claim: { ...frequencyView().current.claim, qualifyingWorkoutCount: 7 },
      },
    },
    {
      ...frequencyView(),
      current: {
        ...frequencyView().current,
        claim: {
          ...frequencyView().current.claim,
          observationWindow: {
            ...frequencyView().current.claim.observationWindow,
            timezone: 'Invalid/Timezone',
          },
        },
      },
    },
    {
      ...availabilityView(),
      current: {
        ...availabilityView().current,
        claim: { ...availabilityView().current.claim, availableDays: ['mon', 'mon'] },
      },
    },
    {
      ...durationView(),
      current: {
        ...durationView().current,
        claim: {
          ...durationView().current.claim,
          firstQuartileMinutes: 55,
          medianMinutes: 50,
        },
      },
    },
  ])('agrees with the authoritative schema when rejecting invalid case %#', (value) => {
    agreesWithZod(value)
    expect(isPersonalModelCurrentSubjectView(value)).toBe(false)
  })
})
