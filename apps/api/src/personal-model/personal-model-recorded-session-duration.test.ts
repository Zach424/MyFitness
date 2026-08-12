import { createHash } from 'node:crypto'

import {
  personalModelItemRevisionSchema,
  type PersonalModelItemRevision,
} from '@myfitness/contracts'
import { describe, expect, it } from 'vitest'

import {
  deriveRecordedSessionDuration,
  type RecordedSessionDurationDerivationInput,
  type RecordedSessionDurationWorkout,
} from './personal-model-recorded-session-duration'

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
  durationMinutes: number,
  revision = 1,
): RecordedSessionDurationWorkout => {
  const localDay = 13 + weekIndex * 7 + (index % 3)
  const localDate = new Date(Date.UTC(2026, 6, localDay)).toISOString().slice(0, 10)
  const startedAt = Date.parse(`${localDate}T02:00:00.000Z`)
  return {
    referenceId: uuidFor(100 + index),
    workoutId: uuidFor(200 + index),
    revision,
    sourceKind: index % 2 === 0 ? 'manual' : 'imported',
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date(startedAt + durationMinutes * 60_000).toISOString(),
    timezone: 'Asia/Shanghai',
    localDate,
    weekIndex,
  }
}

const workouts = () => [
  workout(0, 0, 20),
  workout(1, 0, 30),
  workout(2, 1, 40),
  workout(3, 2, 50),
  workout(4, 2, 60),
  workout(5, 3, 90),
]

const derive = (overrides: Partial<RecordedSessionDurationDerivationInput> = {}) =>
  deriveRecordedSessionDuration({
    userId,
    evaluatedAt: '2026-08-12T08:00:00.000Z',
    window,
    workouts: workouts(),
    pendingWithdrawals: [],
    currentRevision: null,
    ids: { itemId, revisionId: uuidFor(1) },
    sha256Hex,
    ...overrides,
  })

const withFeedback = (
  current: PersonalModelItemRevision,
  feedbackState: 'confirmed' | 'disagreed',
  changedAt: string,
) =>
  personalModelItemRevisionSchema.parse({
    ...current,
    id: uuidFor(20),
    revision: current.revision + 1,
    previousRevision: current.revision,
    action: feedbackState === 'confirmed' ? 'user_confirmed' : 'user_disagreed',
    snapshot: {
      ...current.snapshot,
      status: feedbackState === 'disagreed' ? 'disputed' : current.snapshot.status,
      feedbackState,
      confidence:
        feedbackState === 'disagreed'
          ? {
              ...current.snapshot.confidence,
              limitations: [...current.snapshot.confidence.limitations, 'user_disputed'],
            }
          : current.snapshot.confidence,
      revision: current.revision + 1,
      updatedAt: changedAt,
    },
    derivationFingerprint: 'f'.repeat(64),
    feedbackEventId: uuidFor(21),
    changedAt,
  })

describe('recorded session duration Personal Model derivation', () => {
  it('returns explicit Unknown for incomplete coverage and no qualifying duration evidence', () => {
    const incomplete = derive({
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
    expect(incomplete.outcome).toBe('unknown')
    if (incomplete.outcome !== 'unknown') throw new Error('expected Unknown')
    expect(incomplete.receipt.reasons).toEqual(['insufficient_coverage'])

    const noEvidence = derive({
      workouts: [workout(0, 0, 0), workout(1, 1, 1_441)],
    })
    expect(noEvidence.outcome).toBe('unknown')
    if (noEvidence.outcome !== 'unknown') throw new Error('expected Unknown')
    expect(noEvidence.receipt).toMatchObject({
      subjectKey: 'training.recorded_session_duration',
      reasons: ['no_eligible_evidence'],
    })

    const crossesBoundary = derive({
      workouts: [
        {
          ...workout(0, 3, 60),
          startedAt: '2026-08-09T15:30:00.000Z',
          endedAt: '2026-08-09T16:30:00.000Z',
          localDate: '2026-08-09',
          weekIndex: 3,
        },
      ],
    })
    expect(crossesBoundary.outcome).toBe('unknown')
    if (crossesBoundary.outcome !== 'unknown') throw new Error('expected Unknown')
    expect(crossesBoundary.receipt.reasons).toEqual(['no_eligible_evidence'])
  })

  it('creates an active elapsed-duration baseline with fixed median and nearest-rank quartiles', () => {
    const result = derive()
    expect(result.outcome).toBe('created')
    if (result.outcome !== 'created') throw new Error('expected created')
    expect(result.revision.snapshot).toMatchObject({
      kind: 'baseline',
      subjectKey: 'training.recorded_session_duration',
      status: 'active',
      claim: {
        sampleCount: 6,
        coveredWeeks: 4,
        firstQuartileMinutes: 30,
        medianMinutes: 45,
        thirdQuartileMinutes: 60,
        durationUnit: 'minutes',
        durationPolicyVersion: 'elapsed-duration-minutes-v1',
        quartilePolicyVersion: 'nearest-rank-quartiles-v1',
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

  it('keeps positive but insufficient samples as a non-decision candidate', () => {
    const result = derive({ workouts: [workout(0, 0, 15), workout(1, 1, 25)] })
    if (result.outcome !== 'created') throw new Error('expected created')
    expect(result.revision.snapshot).toMatchObject({
      status: 'candidate',
      claim: {
        sampleCount: 2,
        coveredWeeks: 2,
        firstQuartileMinutes: 15,
        medianMinutes: 20,
        thirdQuartileMinutes: 25,
      },
      confidence: { level: 'low', limitations: ['limited_coverage', 'single_window'] },
    })
  })

  it('uses elapsed instants across a daylight-saving offset change', () => {
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
          ...workout(0, 1, 60),
          startedAt: '2026-03-08T06:30:00.000Z',
          endedAt: '2026-03-08T07:30:00.000Z',
          timezone: 'America/New_York',
          localDate: '2026-03-08',
          weekIndex: 0,
        },
      ],
    })
    if (result.outcome !== 'created') throw new Error('expected created')
    expect(result.revision.snapshot).toMatchObject({
      claim: { sampleCount: 1, medianMinutes: 60 },
      evidenceSet: { window: { timezone: 'America/New_York' } },
    })
  })

  it('returns a deterministic no-op when only generated identities and evaluation time change', () => {
    const initial = derive()
    if (initial.outcome !== 'created') throw new Error('expected created')
    const repeated = derive({
      evaluatedAt: '2026-08-12T09:00:00.000Z',
      currentRevision: initial.revision,
      ids: { itemId, revisionId: uuidFor(2) },
      workouts: workouts().map((entry, index) => ({
        ...entry,
        referenceId: uuidFor(500 + index),
      })),
    })
    expect(repeated).toEqual({ outcome: 'no_op', currentRevision: initial.revision })
  })

  it('withdraws a corrected source and resets confirmation on the revised duration claim', () => {
    const initial = derive()
    if (initial.outcome !== 'created') throw new Error('expected created')
    const confirmed = withFeedback(initial.revision, 'confirmed', '2026-08-12T08:30:00.000Z')
    const corrected = {
      ...workout(0, 0, 120, 2),
      workoutId: workout(0, 0, 20).workoutId,
      referenceId: uuidFor(400),
    }
    const result = derive({
      evaluatedAt: '2026-08-12T09:00:00.000Z',
      currentRevision: confirmed,
      ids: { itemId, revisionId: uuidFor(22) },
      workouts: [corrected, ...workouts().slice(1)],
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
    expect(result.revision.snapshot).toMatchObject({
      feedbackState: 'unreviewed',
      claim: { firstQuartileMinutes: 40, medianMinutes: 55, thirdQuartileMinutes: 90 },
      evidenceSet: { includedCount: 6, withdrawnCount: 1 },
    })
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

  it('preserves explicit disagreement across source refresh', () => {
    const initial = derive()
    if (initial.outcome !== 'created') throw new Error('expected created')
    const disputed = withFeedback(initial.revision, 'disagreed', '2026-08-12T08:30:00.000Z')
    const corrected = {
      ...workout(0, 0, 120, 2),
      workoutId: workout(0, 0, 20).workoutId,
      referenceId: uuidFor(401),
    }
    const result = derive({
      evaluatedAt: '2026-08-12T09:00:00.000Z',
      currentRevision: disputed,
      ids: { itemId, revisionId: uuidFor(23) },
      workouts: [corrected, ...workouts().slice(1)],
      pendingWithdrawals: [
        {
          workoutId: corrected.workoutId,
          withdrawnRevision: 1,
          observedRevision: 2,
          reason: 'source_corrected',
        },
      ],
    })
    if (result.outcome !== 'revised') throw new Error('expected revised')
    expect(result.revision.snapshot).toMatchObject({
      status: 'disputed',
      feedbackState: 'disagreed',
      confidence: { limitations: ['single_window', 'user_disputed'] },
    })
  })

  it('invalidates when all durations become ineligible and never revives a terminal item', () => {
    const initial = derive({ workouts: [workout(0, 0, 45)] })
    if (initial.outcome !== 'created') throw new Error('expected created')
    const invalidated = derive({
      evaluatedAt: '2026-08-12T09:00:00.000Z',
      currentRevision: initial.revision,
      ids: { itemId, revisionId: uuidFor(30) },
      workouts: [],
      pendingWithdrawals: [
        {
          workoutId: workout(0, 0, 45).workoutId,
          withdrawnRevision: 1,
          observedRevision: 2,
          reason: 'source_deleted',
        },
      ],
    })
    if (invalidated.outcome !== 'revised') throw new Error('expected invalidated')
    expect(invalidated.unknownReceipt?.reasons).toEqual(['no_eligible_evidence'])
    expect(invalidated.revision).toMatchObject({
      action: 'invalidated',
      snapshot: { status: 'invalidated', evidenceSet: { includedCount: 0, withdrawnCount: 1 } },
    })

    const terminal = derive({
      evaluatedAt: '2026-08-12T10:00:00.000Z',
      currentRevision: invalidated.revision,
      ids: { itemId, revisionId: uuidFor(31) },
      workouts: [workout(2, 1, 60)],
      pendingWithdrawals: [],
    })
    expect(terminal).toEqual({ outcome: 'no_op', currentRevision: invalidated.revision })
  })

  it('rejects invalid positions, duplicate current sources and false withdrawal obligations', () => {
    expect(() => derive({ workouts: [{ ...workout(0, 0, 45), weekIndex: 2 }] })).toThrow(
      'outside its exact complete-week position',
    )
    expect(() => derive({ workouts: [workout(0, 0, 45), workout(0, 0, 45)] })).toThrow(
      'workout evidence revisions must be unique',
    )
    expect(() =>
      derive({
        pendingWithdrawals: [
          {
            workoutId: workout(0, 0, 45).workoutId,
            withdrawnRevision: 2,
            observedRevision: 2,
            reason: 'source_corrected',
          },
        ],
      }),
    ).toThrow('must move source revisions forward')
  })
})
