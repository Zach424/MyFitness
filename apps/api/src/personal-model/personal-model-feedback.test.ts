import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import type { PersonalModelItemRevision } from '@myfitness/contracts'

import {
  applyPersonalModelFeedback,
  projectPersonalModelFeedbackWriteResponse,
} from './personal-model-feedback'

const userId = '11111111-1111-4111-8111-111111111111'
const itemId = '22222222-2222-4222-8222-222222222222'
const revisionId = '33333333-3333-4333-8333-333333333333'
const eventId = '44444444-4444-4444-8444-444444444444'
const acceptedAt = '2026-08-12T08:00:00.000Z'

const currentRevision = (): PersonalModelItemRevision => ({
  schemaVersion: 'personal-model-item-revision-v1',
  id: '55555555-5555-4555-8555-555555555555',
  userId,
  itemId,
  revision: 1,
  previousRevision: null,
  action: 'created',
  snapshot: {
    contractVersion: 'personal-model-contract-v1',
    id: itemId,
    userId,
    kind: 'behavior',
    subjectKey: 'training.recorded_frequency',
    claimSchemaVersion: 'recorded_training_frequency_behavior_v1',
    claim: {
      observationWindow: {
        startDate: '2026-07-06',
        endDateExclusive: '2026-08-10',
        completeWeeks: 5,
        timezone: 'Asia/Shanghai',
      },
      weeklyRecordedSessionCounts: [3, 3, 3, 3, 3],
      qualifyingWorkoutCount: 15,
      recordedWeekCount: 5,
      medianSessionsPerWeek: 3,
      minimumSessionsPerWeek: 3,
      maximumSessionsPerWeek: 3,
      frequencyUnit: 'recorded_sessions_per_week',
      medianPolicyVersion: 'numeric-median-v1',
    },
    source: 'deterministic_rule',
    status: 'active',
    confidence: {
      policyVersion: 'personal-model-confidence-v1',
      basis: 'longitudinal_observation',
      level: 'moderate',
      qualifiedEvidenceCount: 15,
      distinctLocalDates: 15,
      completeWeeks: 5,
      comparedWindowCount: 5,
      stableWindowCount: 5,
      contradictingEvidenceCount: 0,
      latestEvidenceAt: '2026-08-09T08:00:00.000Z',
      limitations: ['single_window'],
    },
    evidenceSet: {
      policyVersion: 'recorded-workout-evidence-v1',
      ownerUserId: userId,
      asOf: '2026-08-10T16:00:00.000Z',
      window: {
        startAt: '2026-07-06T16:00:00.000Z',
        endAt: '2026-08-10T16:00:00.000Z',
        timezone: 'Asia/Shanghai',
      },
      includedCount: 15,
      supportingCount: 15,
      contradictingCount: 0,
      withdrawnCount: 0,
      evidenceFingerprint: 'a'.repeat(64),
      references: Array.from({ length: 15 }, (_, index) => ({
        id: `60000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
        ownerUserId: userId,
        role: 'supporting' as const,
        evidenceKind: 'workout_revision' as const,
        aggregateId: `70000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
        aggregateRevision: 1,
        sourceKind: 'manual' as const,
        qualification: 'eligible' as const,
        withdrawnReason: null,
        time: {
          kind: 'interval' as const,
          startedAt: '2026-08-09T07:00:00.000Z',
          endedAt: '2026-08-09T08:00:00.000Z',
          timezone: 'Asia/Shanghai',
        },
      })),
    },
    validFrom: '2026-08-10T16:00:00.000Z',
    validTo: null,
    observedFrom: '2026-07-06T16:00:00.000Z',
    observedThrough: '2026-08-10T16:00:00.000Z',
    derivedAt: '2026-08-10T16:00:00.000Z',
    revision: 1,
    feedbackState: 'unreviewed',
    createdAt: '2026-08-10T16:00:00.000Z',
    updatedAt: '2026-08-10T16:00:00.000Z',
  },
  derivationFingerprint: 'b'.repeat(64),
  feedbackEventId: null,
  changedAt: '2026-08-10T16:00:00.000Z',
})

const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex')

describe('personal model feedback application', () => {
  it.each([
    ['matches_me', 'confirmed', 'user_confirmed', 'active'],
    ['temporary_context', 'temporary', 'user_marked_temporary', 'active'],
    ['disagree', 'disagreed', 'user_disagreed', 'disputed'],
    ['uncertain', 'uncertain', 'user_uncertain', 'active'],
  ] as const)('maps %s to one exact next revision', (choice, state, action, status) => {
    const transition = applyPersonalModelFeedback({
      current: currentRevision(),
      request: {
        schemaVersion: 'personal-model-feedback-write-request-v1',
        eventId,
        choice,
        reasonCode: null,
        note: null,
        contextValidUntil: choice === 'temporary_context' ? '2026-08-20T08:00:00.000Z' : null,
      },
      acceptedAt,
      revisionId,
      sha256Hex,
    })

    expect(transition.outcome).toBe('revised')
    if (transition.outcome !== 'revised') throw new Error('expected revised feedback')
    expect(transition.revision).toMatchObject({
      revision: 2,
      previousRevision: 1,
      action,
      feedbackEventId: eventId,
      snapshot: { feedbackState: state, status },
    })
  })

  it('returns a no-op receipt without creating a fake revision', () => {
    const current = currentRevision()
    current.snapshot.feedbackState = 'confirmed'
    const transition = applyPersonalModelFeedback({
      current,
      request: {
        schemaVersion: 'personal-model-feedback-write-request-v1',
        eventId,
        choice: 'matches_me',
        reasonCode: null,
        note: null,
        contextValidUntil: null,
      },
      acceptedAt,
      revisionId,
      sha256Hex,
    })

    expect(projectPersonalModelFeedbackWriteResponse(transition)).toEqual({
      schemaVersion: 'personal-model-feedback-write-response-v1',
      outcome: 'no_op',
      eventId,
      itemId,
      targetRevision: 1,
      currentRevision: 1,
      choice: 'matches_me',
      feedbackState: 'confirmed',
      status: 'active',
      validTo: null,
      acceptedAt,
      noOpReason: 'feedback_already_current',
    })
  })

  it('removes disagreement-only state when the user recalibrates a disputed item', () => {
    const current = currentRevision()
    current.snapshot.status = 'disputed'
    current.snapshot.feedbackState = 'disagreed'
    current.snapshot.confidence.limitations = ['single_window', 'user_disputed']
    const transition = applyPersonalModelFeedback({
      current,
      request: {
        schemaVersion: 'personal-model-feedback-write-request-v1',
        eventId,
        choice: 'uncertain',
        reasonCode: null,
        note: null,
        contextValidUntil: null,
      },
      acceptedAt,
      revisionId,
      sha256Hex,
    })

    if (transition.outcome !== 'revised') throw new Error('expected revised feedback')
    expect(transition.revision.snapshot.status).toBe('active')
    expect(transition.revision.snapshot.confidence.limitations).toEqual(['single_window'])
  })
})
