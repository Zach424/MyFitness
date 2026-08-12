import { createHash } from 'node:crypto'

import {
  personalModelItemRevisionSchema,
  type PersonalModelItemRevision,
} from '@myfitness/contracts'
import { describe, expect, it } from 'vitest'

import {
  deriveRecordedTrainingFrequency,
  type RecordedTrainingFrequencyDerivationInput,
  type RecordedTrainingFrequencyWorkout,
} from './personal-model-recorded-training-frequency'

const userId = '11111111-1111-4111-8111-111111111111'
const itemId = '22222222-2222-4222-8222-222222222222'
const sha256Hex = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')
const uuidFor = (value: number) => `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`

const window = {
  startDate: '2026-07-13',
  endDateExclusive: '2026-08-10',
  completeWeeks: 4,
  startAt: '2026-07-12T16:00:00.000Z',
  endAt: '2026-08-09T16:00:00.000Z',
  timezone: 'Asia/Shanghai',
}

const workout = (
  index: number,
  weekIndex: number,
  revision = 1,
): RecordedTrainingFrequencyWorkout => {
  const localDay = 13 + weekIndex * 7 + (index % 3)
  const localDate = new Date(Date.UTC(2026, 6, localDay)).toISOString().slice(0, 10)
  return {
    referenceId: uuidFor(100 + index),
    workoutId: uuidFor(200 + index),
    revision,
    sourceKind: index % 2 === 0 ? 'manual' : 'imported',
    startedAt: `${localDate}T02:00:00.000Z`,
    endedAt: `${localDate}T03:00:00.000Z`,
    timezone: 'Asia/Shanghai',
    localDate,
    weekIndex,
  }
}

const ids = { itemId, revisionId: uuidFor(1) }
const derive = (overrides: Partial<RecordedTrainingFrequencyDerivationInput> = {}) =>
  deriveRecordedTrainingFrequency({
    userId,
    evaluatedAt: '2026-08-12T08:00:00.000Z',
    window,
    workouts: [
      workout(0, 0),
      workout(1, 0),
      workout(2, 1),
      workout(3, 2),
      workout(4, 2),
      workout(5, 3),
    ],
    pendingWithdrawals: [],
    currentRevision: null,
    ids,
    sha256Hex,
    ...overrides,
  })

describe('recorded training frequency Personal Model derivation', () => {
  it('returns coverage Unknown before one complete local week exists', () => {
    const result = derive({
      window: {
        startDate: '2026-08-09',
        endDateExclusive: '2026-08-09',
        completeWeeks: 0,
        startAt: '2026-08-09T08:00:00.000Z',
        endAt: '2026-08-12T08:00:00.000Z',
        timezone: 'Asia/Shanghai',
      },
      workouts: [],
    })
    expect(result.outcome).toBe('unknown')
    if (result.outcome !== 'unknown') throw new Error('expected Unknown')
    expect(result.receipt.reasons).toEqual(['insufficient_coverage'])
  })

  it('returns evidence Unknown instead of encoding a zero-behavior item', () => {
    const result = derive({ workouts: [] })
    expect(result.outcome).toBe('unknown')
    if (result.outcome !== 'unknown') throw new Error('expected Unknown')
    expect(result.receipt).toMatchObject({
      subjectKey: 'training.recorded_frequency',
      reasons: ['no_eligible_evidence'],
    })
  })

  it('creates an active four-week behavior from six current workout revisions', () => {
    const result = derive()
    expect(result.outcome).toBe('created')
    if (result.outcome !== 'created') throw new Error('expected created')
    expect(result.revision.snapshot).toMatchObject({
      kind: 'behavior',
      subjectKey: 'training.recorded_frequency',
      status: 'active',
      claim: {
        weeklyRecordedSessionCounts: [2, 1, 2, 1],
        qualifyingWorkoutCount: 6,
        recordedWeekCount: 4,
        medianSessionsPerWeek: 1.5,
        minimumSessionsPerWeek: 1,
        maximumSessionsPerWeek: 2,
      },
      confidence: {
        level: 'moderate',
        qualifiedEvidenceCount: 6,
        completeWeeks: 4,
        limitations: ['single_window'],
      },
      evidenceSet: { includedCount: 6, supportingCount: 6, withdrawnCount: 0 },
    })
  })

  it('keeps positive but insufficient observations as non-decision candidate', () => {
    const result = derive({ workouts: [workout(0, 0), workout(1, 1)] })
    if (result.outcome !== 'created') throw new Error('expected created')
    expect(result.revision.snapshot).toMatchObject({
      status: 'candidate',
      confidence: { level: 'low', limitations: ['limited_coverage', 'single_window'] },
      claim: { weeklyRecordedSessionCounts: [1, 1, 0, 0] },
    })
  })

  it('accepts exact local weeks across a daylight-saving offset change', () => {
    const result = derive({
      evaluatedAt: '2026-03-16T05:00:00.000Z',
      window: {
        startDate: '2026-03-02',
        endDateExclusive: '2026-03-16',
        completeWeeks: 2,
        startAt: '2026-03-02T05:00:00.000Z',
        endAt: '2026-03-16T04:00:00.000Z',
        timezone: 'America/New_York',
      },
      workouts: [
        {
          ...workout(0, 1),
          startedAt: '2026-03-09T14:00:00.000Z',
          endedAt: '2026-03-09T15:00:00.000Z',
          timezone: 'America/New_York',
          localDate: '2026-03-09',
          weekIndex: 1,
        },
      ],
    })
    if (result.outcome !== 'created') throw new Error('expected created')
    expect(result.revision.snapshot).toMatchObject({
      claim: { weeklyRecordedSessionCounts: [0, 1] },
      evidenceSet: {
        window: {
          startAt: '2026-03-02T05:00:00.000Z',
          endAt: '2026-03-16T04:00:00.000Z',
          timezone: 'America/New_York',
        },
      },
    })
  })

  it('returns a deterministic no-op when only generated identities and evaluation time change', () => {
    const initial = derive()
    if (initial.outcome !== 'created') throw new Error('expected created')
    const repeated = derive({
      evaluatedAt: '2026-08-12T09:00:00.000Z',
      currentRevision: initial.revision,
      ids: { itemId, revisionId: uuidFor(2) },
      workouts: [
        workout(0, 0),
        workout(1, 0),
        workout(2, 1),
        workout(3, 2),
        workout(4, 2),
        workout(5, 3),
      ].map((entry, index) => ({ ...entry, referenceId: uuidFor(500 + index) })),
    })
    expect(repeated).toEqual({ outcome: 'no_op', currentRevision: initial.revision })
  })

  it('withdraws a corrected workout revision and resets confirmation on the new claim', () => {
    const initial = derive()
    if (initial.outcome !== 'created') throw new Error('expected created')
    const confirmedAt = '2026-08-12T08:30:00.000Z'
    const confirmed = personalModelItemRevisionSchema.parse({
      ...initial.revision,
      id: uuidFor(20),
      revision: 2,
      previousRevision: 1,
      action: 'user_confirmed',
      snapshot: {
        ...initial.revision.snapshot,
        feedbackState: 'confirmed',
        revision: 2,
        updatedAt: confirmedAt,
      },
      derivationFingerprint: 'f'.repeat(64),
      feedbackEventId: uuidFor(21),
      changedAt: confirmedAt,
    })
    const corrected = {
      ...workout(0, 0, 2),
      workoutId: workout(0, 0).workoutId,
      referenceId: uuidFor(400),
    }
    const result = derive({
      evaluatedAt: '2026-08-12T09:00:00.000Z',
      currentRevision: confirmed,
      ids: { itemId, revisionId: uuidFor(22) },
      workouts: [
        corrected,
        workout(1, 0),
        workout(2, 1),
        workout(3, 2),
        workout(4, 2),
        workout(5, 3),
      ],
      pendingWithdrawals: [
        {
          workoutId: corrected.workoutId,
          withdrawnRevision: 1,
          observedRevision: 2,
          reason: 'source_corrected',
        },
      ],
    })
    expect(result.outcome).toBe('revised')
    if (result.outcome !== 'revised') throw new Error('expected revised')
    expect(result.revision.snapshot.feedbackState).toBe('unreviewed')
    expect(result.revision.snapshot.evidenceSet.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          aggregateId: corrected.workoutId,
          aggregateRevision: 1,
          qualification: 'withdrawn',
          withdrawnReason: 'source_corrected',
        }),
        expect.objectContaining({
          aggregateId: corrected.workoutId,
          aggregateRevision: 2,
          qualification: 'eligible',
        }),
      ]),
    )
  })

  it('preserves explicit user disagreement across evidence refresh', () => {
    const initial = derive()
    if (initial.outcome !== 'created') throw new Error('expected created')
    const disputedAt = '2026-08-12T08:30:00.000Z'
    const disputed: PersonalModelItemRevision = personalModelItemRevisionSchema.parse({
      ...initial.revision,
      id: uuidFor(30),
      revision: 2,
      previousRevision: 1,
      action: 'user_disagreed',
      snapshot: {
        ...initial.revision.snapshot,
        status: 'disputed',
        feedbackState: 'disagreed',
        confidence: { ...initial.revision.snapshot.confidence, limitations: ['user_disputed'] },
        revision: 2,
        updatedAt: disputedAt,
      },
      derivationFingerprint: 'd'.repeat(64),
      feedbackEventId: uuidFor(31),
      changedAt: disputedAt,
    })
    const result = derive({
      evaluatedAt: '2026-08-12T09:00:00.000Z',
      currentRevision: disputed,
      ids: { itemId, revisionId: uuidFor(32) },
      workouts: [
        workout(0, 0),
        workout(1, 0),
        workout(2, 1),
        workout(3, 2),
        workout(4, 3),
        workout(5, 3),
      ],
    })
    if (result.outcome !== 'revised') throw new Error('expected revised')
    expect(result.revision.snapshot).toMatchObject({
      status: 'disputed',
      feedbackState: 'disagreed',
      confidence: { limitations: ['single_window', 'user_disputed'] },
    })
  })

  it('rejects caller-supplied week positions that disagree with local dates', () => {
    expect(() => derive({ workouts: [{ ...workout(0, 0), weekIndex: 1 }] })).toThrow(
      'exact complete-week position',
    )
  })

  it('invalidates the current behavior when no eligible workouts remain', () => {
    const initial = derive({ workouts: [workout(0, 0)] })
    if (initial.outcome !== 'created') throw new Error('expected created')
    const source = workout(0, 0)
    const result = derive({
      evaluatedAt: '2026-08-12T09:00:00.000Z',
      currentRevision: initial.revision,
      ids: { itemId, revisionId: uuidFor(40) },
      workouts: [],
      pendingWithdrawals: [
        {
          workoutId: source.workoutId,
          withdrawnRevision: 1,
          observedRevision: 2,
          reason: 'source_deleted',
        },
      ],
    })
    expect(result.outcome).toBe('revised')
    if (result.outcome !== 'revised') throw new Error('expected revised')
    expect(result.unknownReceipt?.reasons).toEqual(['no_eligible_evidence'])
    expect(result.revision).toMatchObject({
      action: 'invalidated',
      snapshot: {
        status: 'invalidated',
        validTo: '2026-08-12T09:00:00.000Z',
        evidenceSet: { includedCount: 0, withdrawnCount: 1 },
      },
    })

    const later = derive({
      evaluatedAt: '2026-08-12T10:00:00.000Z',
      currentRevision: result.revision,
      ids: { itemId, revisionId: uuidFor(41) },
      workouts: [workout(10, 3)],
    })
    expect(later).toEqual({ outcome: 'no_op', currentRevision: result.revision })
  })

  it('consumes a delayed source withdrawal without reviving a terminal behavior', () => {
    const initial = derive({ workouts: [workout(0, 0)] })
    if (initial.outcome !== 'created') throw new Error('expected created')
    const invalidatedAt = '2026-08-12T08:30:00.000Z'
    const terminal = personalModelItemRevisionSchema.parse({
      ...initial.revision,
      id: uuidFor(50),
      revision: 2,
      previousRevision: 1,
      action: 'invalidated',
      snapshot: {
        ...initial.revision.snapshot,
        status: 'invalidated',
        validTo: invalidatedAt,
        revision: 2,
        updatedAt: invalidatedAt,
      },
      derivationFingerprint: 'a'.repeat(64),
      changedAt: invalidatedAt,
    })
    const source = workout(0, 0)
    const result = derive({
      evaluatedAt: '2026-08-12T09:00:00.000Z',
      currentRevision: terminal,
      ids: { itemId, revisionId: uuidFor(51) },
      workouts: [],
      pendingWithdrawals: [
        {
          workoutId: source.workoutId,
          withdrawnRevision: 1,
          observedRevision: 2,
          reason: 'source_deleted',
        },
      ],
    })
    expect(result.outcome).toBe('revised')
    if (result.outcome !== 'revised') throw new Error('expected revised')
    expect(result.revision).toMatchObject({
      action: 'invalidated',
      snapshot: {
        status: 'invalidated',
        validTo: invalidatedAt,
        evidenceSet: { includedCount: 0, withdrawnCount: 1 },
      },
    })
    expect(result.revision.snapshot.evidenceSet.references[0]).toMatchObject({
      qualification: 'withdrawn',
      withdrawnReason: 'source_deleted',
    })
  })

  it('rejects unmatched or non-forward source withdrawal obligations', () => {
    const initial = derive()
    if (initial.outcome !== 'created') throw new Error('expected created')
    expect(() =>
      derive({
        evaluatedAt: '2026-08-12T09:00:00.000Z',
        currentRevision: initial.revision,
        pendingWithdrawals: [
          {
            workoutId: uuidFor(999),
            withdrawnRevision: 2,
            observedRevision: 1,
            reason: 'source_corrected',
          },
        ],
      }),
    ).toThrow('move source revisions forward')
  })
})
