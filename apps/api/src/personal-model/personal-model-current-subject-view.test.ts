import type { PersonalModelCurrentSubjectEnvelope } from '@myfitness/contracts'
import { describe, expect, it, vi } from 'vitest'

import {
  PersonalModelCurrentSubjectUnavailableError,
  PersonalModelCurrentSubjectViewService,
  projectPersonalModelCurrentSubjectView,
} from './personal-model-current-subject-view'
import {
  PersonalModelRevisionConflictError,
  PersonalModelSubjectAuthorityNotFoundError,
  type PersonalModelRepository,
} from './personal-model.repository'

const userId = '11111111-1111-4111-8111-111111111111'
const itemId = '22222222-2222-4222-8222-222222222222'
const revisionId = '33333333-3333-4333-8333-333333333333'
const referenceId = '44444444-4444-4444-8444-444444444444'
const goalId = '55555555-5555-4555-8555-555555555555'
const sourceAt = '2026-08-12T08:00:00.000Z'
const changedAt = '2026-08-12T08:01:00.000Z'

const envelope = (): PersonalModelCurrentSubjectEnvelope => ({
  schemaVersion: 'personal-model-current-subject-envelope-v1',
  ownerUserId: userId,
  subjectKey: 'training.availability',
  current: {
    itemId,
    generation: 1,
    predecessorItemId: null,
    terminal: false,
    retiredAt: null,
    currentRevision: {
      schemaVersion: 'personal-model-item-revision-v1',
      id: revisionId,
      userId,
      itemId,
      revision: 1,
      previousRevision: null,
      action: 'created',
      snapshot: {
        contractVersion: 'personal-model-contract-v1',
        id: itemId,
        userId,
        kind: 'constraint',
        subjectKey: 'training.availability',
        claimSchemaVersion: 'training_availability_constraint_v1',
        claim: {
          availableDays: ['mon', 'wed', 'fri'],
          sessionMinutes: 60,
          sourceGoalRevision: 1,
          durationUnit: 'minutes',
        },
        source: 'user_confirmed',
        status: 'active',
        confidence: {
          policyVersion: 'personal-model-confidence-v1',
          basis: 'user_confirmed',
          level: 'high',
          qualifiedEvidenceCount: 1,
          limitations: [],
        },
        evidenceSet: {
          policyVersion: 'onboarding-goal-evidence-v1',
          ownerUserId: userId,
          asOf: changedAt,
          window: {
            startAt: sourceAt,
            endAt: changedAt,
            timezone: 'Asia/Shanghai',
          },
          includedCount: 1,
          supportingCount: 1,
          contradictingCount: 0,
          withdrawnCount: 0,
          evidenceFingerprint: 'a'.repeat(64),
          references: [
            {
              id: referenceId,
              ownerUserId: userId,
              role: 'supporting',
              evidenceKind: 'onboarding_goal_revision',
              aggregateId: goalId,
              aggregateRevision: 1,
              sourceKind: 'user_confirmed',
              qualification: 'eligible',
              withdrawnReason: null,
              time: { kind: 'instant', occurredAt: sourceAt },
            },
          ],
        },
        validFrom: changedAt,
        validTo: null,
        observedFrom: sourceAt,
        observedThrough: changedAt,
        derivedAt: changedAt,
        revision: 1,
        feedbackState: 'unreviewed',
        createdAt: changedAt,
        updatedAt: changedAt,
      },
      derivationFingerprint: 'b'.repeat(64),
      feedbackEventId: null,
      changedAt,
    },
  },
})

describe('personal model current subject visible projection', () => {
  it('keeps the explainable claim and counts while removing internal ownership and evidence detail', () => {
    const view = projectPersonalModelCurrentSubjectView(envelope())

    expect(view).toEqual({
      schemaVersion: 'personal-model-current-subject-view-v1',
      subjectKey: 'training.availability',
      current: {
        itemId,
        generation: 1,
        revision: 1,
        kind: 'constraint',
        claimSchemaVersion: 'training_availability_constraint_v1',
        claim: {
          availableDays: ['mon', 'wed', 'fri'],
          sessionMinutes: 60,
          sourceGoalRevision: 1,
          durationUnit: 'minutes',
        },
        source: 'user_confirmed',
        status: 'active',
        feedbackState: 'unreviewed',
        terminal: false,
        confidence: { level: 'high', limitations: [] },
        evidence: {
          asOf: changedAt,
          window: { startAt: sourceAt, endAt: changedAt, timezone: 'Asia/Shanghai' },
          qualifiedCount: 1,
          supportingCount: 1,
          contradictingCount: 0,
          withdrawnCount: 0,
        },
        validFrom: changedAt,
        validTo: null,
        observedFrom: sourceAt,
        observedThrough: changedAt,
        derivedAt: changedAt,
        updatedAt: changedAt,
      },
    })
    const serialized = JSON.stringify(view)
    expect(serialized).not.toContain(userId)
    expect(serialized).not.toContain(revisionId)
    expect(serialized).not.toContain(referenceId)
    expect(serialized).not.toContain(goalId)
    expect(serialized).not.toContain('Fingerprint')
    expect(serialized).not.toContain('predecessorItemId')
  })

  it('preserves an explicit empty subject without adding owner metadata', () => {
    expect(
      projectPersonalModelCurrentSubjectView({
        schemaVersion: 'personal-model-current-subject-envelope-v1',
        ownerUserId: userId,
        subjectKey: 'training.recorded_frequency',
        current: null,
      }),
    ).toEqual({
      schemaVersion: 'personal-model-current-subject-view-v1',
      subjectKey: 'training.recorded_frequency',
      current: null,
    })
  })

  it('maps missing and inactive owner authority to one non-enumerating application error', async () => {
    const getCurrentSubject = vi
      .fn()
      .mockRejectedValue(new PersonalModelSubjectAuthorityNotFoundError())
    const service = new PersonalModelCurrentSubjectViewService({
      getCurrentSubject,
    } as unknown as PersonalModelRepository)

    await expect(service.read(userId, 'training.availability')).rejects.toEqual(
      new PersonalModelCurrentSubjectUnavailableError(),
    )
  })

  it('does not hide data integrity conflicts as an authorization result', async () => {
    const conflict = new PersonalModelRevisionConflictError('ambiguous current subject')
    const service = new PersonalModelCurrentSubjectViewService({
      getCurrentSubject: vi.fn().mockRejectedValue(conflict),
    } as unknown as PersonalModelRepository)

    await expect(service.read(userId, 'training.availability')).rejects.toBe(conflict)
  })
})
