import { createHash } from 'node:crypto'

import {
  personalModelItemRevisionSchema,
  type OnboardingGoalRevisionSnapshot,
  type PersonalModelItemRevision,
} from '@myfitness/contracts'
import { describe, expect, it } from 'vitest'

import {
  deriveTrainingAvailability,
  trainingAvailabilityDerivationPolicyVersion,
  trainingAvailabilityEvidencePolicyVersion,
} from './personal-model-training-availability'

const userId = '11111111-1111-4111-8111-111111111111'
const goalId = '22222222-2222-4222-8222-222222222222'
const itemId = '33333333-3333-4333-8333-333333333333'
const firstRevisionId = '44444444-4444-4444-8444-444444444444'
const firstReferenceId = '55555555-5555-4555-8555-555555555555'
const nextRevisionId = '66666666-6666-4666-8666-666666666666'
const nextReferenceId = '77777777-7777-4777-8777-777777777777'
const sha256Hex = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')

const goalRevision = (
  revision = 1,
  changedAt = '2026-08-12T08:00:00.000Z',
): OnboardingGoalRevisionSnapshot => ({
  schemaVersion: 'onboarding-goal-snapshot-v1',
  goalId,
  ownerUserId: userId,
  revision,
  action: revision === 1 ? 'created' : 'updated',
  historyCoverage: 'complete',
  goal: {
    primaryGoal: 'fitness',
    experience: 'beginner',
    availableDays: revision === 1 ? ['mon', 'wed', 'fri'] : ['tue', 'thu'],
    sessionMinutes: revision === 1 ? 60 : 45,
    equipment: ['bodyweight'],
    dietaryPreferences: ['none'],
  },
  changedAt,
})

const deriveInitial = () =>
  deriveTrainingAvailability({
    goalRevision: goalRevision(),
    timezone: 'Asia/Shanghai',
    evaluatedAt: '2026-08-12T08:01:00.000Z',
    currentRevision: null,
    ids: {
      itemId,
      revisionId: firstRevisionId,
      eligibleReferenceId: firstReferenceId,
    },
    sha256Hex,
  })

describe('Personal Model training availability derivation', () => {
  it('creates one active user-confirmed constraint from the exact current goal revision', () => {
    const result = deriveInitial()
    expect(result.outcome).toBe('created')
    if (result.outcome !== 'created') throw new Error('expected a created result')

    expect(result.revision.snapshot).toMatchObject({
      id: itemId,
      userId,
      kind: 'constraint',
      subjectKey: 'training.availability',
      claim: {
        availableDays: ['mon', 'wed', 'fri'],
        sessionMinutes: 60,
        sourceGoalRevision: 1,
        durationUnit: 'minutes',
      },
      status: 'active',
      feedbackState: 'unreviewed',
      evidenceSet: {
        policyVersion: trainingAvailabilityEvidencePolicyVersion,
        includedCount: 1,
        supportingCount: 1,
        withdrawnCount: 0,
      },
    })
    expect(result.revision.snapshot.evidenceSet.references).toEqual([
      expect.objectContaining({
        id: firstReferenceId,
        aggregateId: goalId,
        aggregateRevision: 1,
        qualification: 'eligible',
        withdrawnReason: null,
      }),
    ])
    expect(result.revision.derivationFingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(trainingAvailabilityDerivationPolicyVersion).toBe('training-availability-derivation-v1')
  })

  it('returns a no-op for the same qualified source and deterministic content', () => {
    const initial = deriveInitial()
    if (initial.outcome !== 'created') throw new Error('expected a created result')

    const result = deriveTrainingAvailability({
      goalRevision: goalRevision(),
      timezone: 'Asia/Shanghai',
      evaluatedAt: '2026-08-12T09:00:00.000Z',
      currentRevision: initial.revision,
      ids: {
        itemId,
        revisionId: nextRevisionId,
        eligibleReferenceId: nextReferenceId,
      },
      sha256Hex,
    })

    expect(result).toEqual({ outcome: 'no_op', currentRevision: initial.revision })
  })

  it('keeps semantic fingerprints stable when only generated identities change', () => {
    const initial = deriveInitial()
    const repeated = deriveTrainingAvailability({
      goalRevision: goalRevision(),
      timezone: 'Asia/Shanghai',
      evaluatedAt: '2026-08-12T08:01:00.000Z',
      currentRevision: null,
      ids: {
        itemId: '12121212-1212-4212-8212-121212121212',
        revisionId: '13131313-1313-4313-8313-131313131313',
        eligibleReferenceId: '14141414-1414-4414-8414-141414141414',
      },
      sha256Hex,
    })
    if (initial.outcome !== 'created' || repeated.outcome !== 'created') {
      throw new Error('expected created results')
    }

    expect(repeated.revision.snapshot.evidenceSet.evidenceFingerprint).toBe(
      initial.revision.snapshot.evidenceSet.evidenceFingerprint,
    )
    expect(repeated.revision.derivationFingerprint).toBe(initial.revision.derivationFingerprint)
  })

  it('reconciles a non-deterministic derivation receipt without changing the source claim', () => {
    const initial = deriveInitial()
    if (initial.outcome !== 'created') throw new Error('expected a created result')

    const result = deriveTrainingAvailability({
      goalRevision: goalRevision(),
      timezone: 'Asia/Shanghai',
      evaluatedAt: '2026-08-12T09:00:00.000Z',
      currentRevision: {
        ...initial.revision,
        derivationFingerprint: 'f'.repeat(64),
      },
      ids: {
        itemId,
        revisionId: nextRevisionId,
        eligibleReferenceId: nextReferenceId,
      },
      sha256Hex,
    })

    expect(result.outcome).toBe('revised')
    if (result.outcome !== 'revised') throw new Error('expected a revised result')
    expect(result.cause).toBe('content_reconciled')
    expect(result.revision.snapshot.claim).toEqual(initial.revision.snapshot.claim)
    expect(result.revision.snapshot.evidenceSet.references).toEqual(
      initial.revision.snapshot.evidenceSet.references,
    )
    expect(result.revision.derivationFingerprint).not.toBe('f'.repeat(64))
  })

  it('revises a corrected goal with one old withdrawn context and one current source', () => {
    const initial = deriveInitial()
    if (initial.outcome !== 'created') throw new Error('expected a created result')

    const result = deriveTrainingAvailability({
      goalRevision: goalRevision(2, '2026-08-12T10:00:00.000Z'),
      timezone: 'Asia/Shanghai',
      evaluatedAt: '2026-08-12T10:01:00.000Z',
      currentRevision: initial.revision,
      ids: {
        itemId,
        revisionId: nextRevisionId,
        eligibleReferenceId: nextReferenceId,
      },
      sha256Hex,
    })

    expect(result.outcome).toBe('revised')
    if (result.outcome !== 'revised') throw new Error('expected a revised result')
    expect(result.cause).toBe('source_refreshed')
    expect(result.revision).toMatchObject({
      revision: 2,
      previousRevision: 1,
      action: 'evidence_accumulated',
      snapshot: {
        claim: {
          availableDays: ['tue', 'thu'],
          sessionMinutes: 45,
          sourceGoalRevision: 2,
        },
        evidenceSet: {
          includedCount: 1,
          supportingCount: 1,
          withdrawnCount: 1,
        },
      },
    })
    expect(result.revision.snapshot.evidenceSet.references).toEqual([
      expect.objectContaining({
        id: firstReferenceId,
        aggregateRevision: 1,
        role: 'context',
        qualification: 'withdrawn',
        withdrawnReason: 'source_corrected',
      }),
      expect.objectContaining({
        id: nextReferenceId,
        aggregateRevision: 2,
        role: 'supporting',
        qualification: 'eligible',
        withdrawnReason: null,
      }),
    ])
  })

  it('preserves a user dispute instead of silently reactivating the item', () => {
    const initial = deriveInitial()
    if (initial.outcome !== 'created') throw new Error('expected a created result')
    const disputedAt = '2026-08-12T09:00:00.000Z'
    const disputed = personalModelItemRevisionSchema.parse({
      ...initial.revision,
      id: '88888888-8888-4888-8888-888888888888',
      revision: 2,
      previousRevision: 1,
      action: 'user_disagreed',
      snapshot: {
        ...initial.revision.snapshot,
        status: 'disputed',
        feedbackState: 'disagreed',
        confidence: {
          ...initial.revision.snapshot.confidence,
          limitations: ['user_disputed'],
        },
        revision: 2,
        updatedAt: disputedAt,
      },
      derivationFingerprint: '8'.repeat(64),
      feedbackEventId: '99999999-9999-4999-8999-999999999999',
      changedAt: disputedAt,
    })

    const result = deriveTrainingAvailability({
      goalRevision: goalRevision(2, '2026-08-12T10:00:00.000Z'),
      timezone: 'Asia/Shanghai',
      evaluatedAt: '2026-08-12T10:01:00.000Z',
      currentRevision: disputed,
      ids: {
        itemId,
        revisionId: nextRevisionId,
        eligibleReferenceId: nextReferenceId,
      },
      sha256Hex,
    })

    expect(result.outcome).toBe('revised')
    if (result.outcome !== 'revised') throw new Error('expected a revised result')
    expect(result.revision.snapshot).toMatchObject({
      status: 'disputed',
      feedbackState: 'disagreed',
      confidence: { limitations: ['user_disputed'] },
    })
  })

  it('makes a materially changed claim reviewable instead of carrying old confirmation', () => {
    const initial = deriveInitial()
    if (initial.outcome !== 'created') throw new Error('expected a created result')
    const confirmedAt = '2026-08-12T09:00:00.000Z'
    const confirmed = personalModelItemRevisionSchema.parse({
      ...initial.revision,
      id: 'abababab-abab-4bab-8bab-abababababab',
      revision: 2,
      previousRevision: 1,
      action: 'user_confirmed',
      snapshot: {
        ...initial.revision.snapshot,
        feedbackState: 'confirmed',
        revision: 2,
        updatedAt: confirmedAt,
      },
      derivationFingerprint: 'b'.repeat(64),
      feedbackEventId: 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',
      changedAt: confirmedAt,
    })

    const result = deriveTrainingAvailability({
      goalRevision: goalRevision(2, '2026-08-12T10:00:00.000Z'),
      timezone: 'Asia/Shanghai',
      evaluatedAt: '2026-08-12T10:01:00.000Z',
      currentRevision: confirmed,
      ids: {
        itemId,
        revisionId: nextRevisionId,
        eligibleReferenceId: nextReferenceId,
      },
      sha256Hex,
    })

    expect(result.outcome).toBe('revised')
    if (result.outcome !== 'revised') throw new Error('expected a revised result')
    expect(result.revision.snapshot).toMatchObject({
      feedbackState: 'unreviewed',
      validFrom: '2026-08-12T10:00:00.000Z',
      validTo: null,
    })
  })

  it('keeps only temporary feedback that is still valid at evaluation time', () => {
    const initial = deriveInitial()
    if (initial.outcome !== 'created') throw new Error('expected a created result')
    const temporaryAt = '2026-08-12T09:00:00.000Z'
    const temporaryRevision = (validTo: string) =>
      personalModelItemRevisionSchema.parse({
        ...initial.revision,
        id: 'dededede-dede-4ede-8ede-dededededede',
        revision: 2,
        previousRevision: 1,
        action: 'user_marked_temporary',
        snapshot: {
          ...initial.revision.snapshot,
          feedbackState: 'temporary',
          validTo,
          revision: 2,
          updatedAt: temporaryAt,
        },
        derivationFingerprint: 'd'.repeat(64),
        feedbackEventId: 'efefefef-efef-4fef-8fef-efefefefefef',
        changedAt: temporaryAt,
      })
    const deriveRefresh = (currentRevision: PersonalModelItemRevision) =>
      deriveTrainingAvailability({
        goalRevision: goalRevision(2, '2026-08-12T10:00:00.000Z'),
        timezone: 'Asia/Shanghai',
        evaluatedAt: '2026-08-12T10:30:00.000Z',
        currentRevision,
        ids: {
          itemId,
          revisionId: nextRevisionId,
          eligibleReferenceId: nextReferenceId,
        },
        sha256Hex,
      })

    const active = deriveRefresh(temporaryRevision('2026-08-12T11:00:00.000Z'))
    const expired = deriveRefresh(temporaryRevision('2026-08-12T10:15:00.000Z'))
    if (active.outcome !== 'revised' || expired.outcome !== 'revised') {
      throw new Error('expected revised results')
    }

    expect(active.revision.snapshot).toMatchObject({
      feedbackState: 'temporary',
      validTo: '2026-08-12T11:00:00.000Z',
    })
    expect(expired.revision.snapshot).toMatchObject({
      feedbackState: 'unreviewed',
      validTo: null,
    })
  })

  it('withdraws a terminal item source without reviving it or adopting the new claim', () => {
    const initial = deriveInitial()
    if (initial.outcome !== 'created') throw new Error('expected a created result')
    const invalidatedAt = '2026-08-12T09:00:00.000Z'
    const invalidated = personalModelItemRevisionSchema.parse({
      ...initial.revision,
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
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
      feedbackEventId: null,
      changedAt: invalidatedAt,
    })

    const result = deriveTrainingAvailability({
      goalRevision: goalRevision(2, '2026-08-12T10:00:00.000Z'),
      timezone: 'Asia/Shanghai',
      evaluatedAt: '2026-08-12T10:01:00.000Z',
      currentRevision: invalidated,
      ids: {
        itemId,
        revisionId: nextRevisionId,
        eligibleReferenceId: nextReferenceId,
      },
      sha256Hex,
    })

    expect(result.outcome).toBe('revised')
    if (result.outcome !== 'revised') throw new Error('expected a revised result')
    expect(result.revision).toMatchObject({
      action: 'invalidated',
      snapshot: {
        status: 'invalidated',
        claim: { sourceGoalRevision: 1, sessionMinutes: 60 },
        evidenceSet: { includedCount: 0, withdrawnCount: 1 },
      },
    })
    expect(result.revision.snapshot.evidenceSet.references).toHaveLength(1)
    expect(result.revision.snapshot.evidenceSet.references[0]).toMatchObject({
      aggregateRevision: 1,
      qualification: 'withdrawn',
      withdrawnReason: 'source_corrected',
    })
  })

  it('rejects an evaluation that does not follow the source and current revision', () => {
    const initial = deriveInitial()
    if (initial.outcome !== 'created') throw new Error('expected a created result')

    expect(() =>
      deriveTrainingAvailability({
        goalRevision: goalRevision(),
        timezone: 'Asia/Shanghai',
        evaluatedAt: initial.revision.changedAt,
        currentRevision: initial.revision as PersonalModelItemRevision,
        ids: {
          itemId,
          revisionId: nextRevisionId,
          eligibleReferenceId: nextReferenceId,
        },
        sha256Hex,
      }),
    ).toThrow('must follow its source and predecessor')
  })

  it('rejects a fingerprint provider that does not return a strict SHA-256 digest', () => {
    expect(() =>
      deriveTrainingAvailability({
        goalRevision: goalRevision(),
        timezone: 'Asia/Shanghai',
        evaluatedAt: '2026-08-12T08:01:00.000Z',
        currentRevision: null,
        ids: {
          itemId,
          revisionId: firstRevisionId,
          eligibleReferenceId: firstReferenceId,
        },
        sha256Hex: () => 'not-a-digest',
      }),
    ).toThrow('64 lowercase hexadecimal')
  })
})
