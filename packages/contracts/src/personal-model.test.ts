import { describe, expect, it } from 'vitest'

import {
  personalModelConfidenceReceiptSchema,
  personalModelDecisionInputSchema,
  personalModelEvidenceSetSchema,
  personalModelFeedbackApplicationSchema,
  personalModelFeedbackEventSchema,
  personalModelFeedbackTransitionResultSchema,
  personalModelItemRevisionSchema,
  personalModelItemSchema,
  personalModelUnknownReceiptSchema,
  weeklyCognitiveReviewEnvelopeSchema,
  weeklyCognitiveReviewHistoryPageSchema,
  weeklyCognitiveReviewRevisionSchema,
} from './personal-model'

const userId = '11111111-1111-4111-8111-111111111111'
const itemId = '22222222-2222-4222-8222-222222222222'
const observedFrom = '2026-06-15T00:00:00.000Z'
const observedThrough = '2026-08-10T00:00:00.000Z'

const uuidFor = (value: number) => `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`

const workoutReferences = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: uuidFor(100 + index),
    ownerUserId: userId,
    role: 'supporting' as const,
    evidenceKind: 'workout_revision' as const,
    aggregateId: uuidFor(200 + index),
    aggregateRevision: 1,
    sourceKind: 'manual' as const,
    qualification: 'eligible' as const,
    withdrawnReason: null,
    time: {
      kind: 'interval' as const,
      startedAt: `2026-07-${String(20 + index).padStart(2, '0')}T08:00:00.000Z`,
      endedAt: `2026-07-${String(20 + index).padStart(2, '0')}T09:00:00.000Z`,
      timezone: 'Asia/Shanghai',
    },
  }))

const evidenceSet = (
  references: ReturnType<typeof workoutReferences>,
  startAt = observedFrom,
  endAt = observedThrough,
) => ({
  policyVersion: 'recorded-workout-evidence-v1',
  ownerUserId: userId,
  asOf: endAt,
  window: { startAt, endAt, timezone: 'Asia/Shanghai' },
  includedCount: references.length,
  supportingCount: references.length,
  contradictingCount: 0,
  withdrawnCount: 0,
  evidenceFingerprint: 'a'.repeat(64),
  references,
})

const longitudinalConfidence = (count: number, completeWeeks: number) => ({
  policyVersion: 'personal-model-confidence-v1' as const,
  basis: 'longitudinal_observation' as const,
  level: 'moderate' as const,
  qualifiedEvidenceCount: count,
  distinctLocalDates: count,
  completeWeeks,
  comparedWindowCount: 2,
  stableWindowCount: 2,
  contradictingEvidenceCount: 0,
  latestEvidenceAt: '2026-07-25T09:00:00.000Z',
  limitations: [] as const,
})

const commonItem = () => ({
  contractVersion: 'personal-model-contract-v1' as const,
  id: itemId,
  userId,
  status: 'active' as const,
  validFrom: observedThrough,
  validTo: null,
  observedFrom,
  observedThrough,
  derivedAt: observedThrough,
  revision: 1,
  feedbackState: 'unreviewed' as const,
  createdAt: observedThrough,
  updatedAt: observedThrough,
})

const behaviorItem = () => {
  const references = workoutReferences(6)
  return {
    ...commonItem(),
    kind: 'behavior' as const,
    subjectKey: 'training.recorded_frequency' as const,
    claimSchemaVersion: 'recorded_training_frequency_behavior_v1' as const,
    source: 'deterministic_rule' as const,
    confidence: longitudinalConfidence(6, 8),
    evidenceSet: evidenceSet(references),
    claim: {
      observationWindow: {
        startDate: '2026-06-15',
        endDateExclusive: '2026-08-10',
        completeWeeks: 8,
        timezone: 'Asia/Shanghai',
      },
      weeklyRecordedSessionCounts: [1, 0, 1, 1, 0, 1, 1, 1],
      qualifyingWorkoutCount: 6,
      recordedWeekCount: 6,
      medianSessionsPerWeek: 1,
      minimumSessionsPerWeek: 0,
      maximumSessionsPerWeek: 1,
      frequencyUnit: 'recorded_sessions_per_week' as const,
      medianPolicyVersion: 'numeric-median-v1' as const,
    },
  }
}

const baselineItem = () => {
  const references = workoutReferences(6)
  return {
    ...commonItem(),
    kind: 'baseline' as const,
    subjectKey: 'training.recorded_session_duration' as const,
    claimSchemaVersion: 'recorded_session_duration_baseline_v1' as const,
    source: 'deterministic_rule' as const,
    confidence: longitudinalConfidence(6, 8),
    evidenceSet: evidenceSet(references),
    claim: {
      observationWindow: {
        startDate: '2026-06-15',
        endDateExclusive: '2026-08-10',
        completeWeeks: 8,
        timezone: 'Asia/Shanghai',
      },
      sampleCount: 6,
      coveredWeeks: 6,
      firstQuartileMinutes: 40,
      medianMinutes: 50,
      thirdQuartileMinutes: 60,
      durationUnit: 'minutes' as const,
      durationPolicyVersion: 'elapsed-duration-minutes-v1' as const,
      quartilePolicyVersion: 'nearest-rank-quartiles-v1' as const,
    },
  }
}

const availabilityItem = () => {
  const reference = {
    id: uuidFor(1),
    ownerUserId: userId,
    role: 'supporting' as const,
    evidenceKind: 'onboarding_goal_revision' as const,
    aggregateId: uuidFor(2),
    aggregateRevision: 3,
    sourceKind: 'user_confirmed' as const,
    qualification: 'eligible' as const,
    withdrawnReason: null,
    time: { kind: 'instant' as const, occurredAt: '2026-08-01T08:00:00.000Z' },
  }
  return {
    ...commonItem(),
    kind: 'constraint' as const,
    subjectKey: 'training.availability' as const,
    claimSchemaVersion: 'training_availability_constraint_v1' as const,
    source: 'user_confirmed' as const,
    confidence: {
      policyVersion: 'personal-model-confidence-v1' as const,
      basis: 'user_confirmed' as const,
      level: 'high' as const,
      qualifiedEvidenceCount: 1 as const,
      limitations: [] as const,
    },
    evidenceSet: {
      ...evidenceSet([reference as never]),
      policyVersion: 'onboarding-goal-evidence-v1',
      includedCount: 1,
      supportingCount: 1,
      references: [reference],
    },
    claim: {
      availableDays: ['mon', 'wed', 'fri'] as const,
      sessionMinutes: 60,
      sourceGoalRevision: 3,
      durationUnit: 'minutes' as const,
    },
  }
}

describe('personal model contract', () => {
  it('accepts the three bounded claim variants with exact kind, subject and source authority', () => {
    expect(personalModelItemSchema.parse(availabilityItem())).toMatchObject({
      kind: 'constraint',
      source: 'user_confirmed',
    })
    expect(personalModelItemSchema.parse(behaviorItem())).toMatchObject({
      kind: 'behavior',
      source: 'deterministic_rule',
    })
    expect(personalModelItemSchema.parse(baselineItem())).toMatchObject({
      kind: 'baseline',
      source: 'deterministic_rule',
    })
  })

  it('does not let behavior overwrite a user-confirmed constraint or masquerade as a goal', () => {
    const behavior = behaviorItem()
    expect(personalModelItemSchema.safeParse({ ...behavior, kind: 'constraint' }).success).toBe(
      false,
    )
    expect(personalModelItemSchema.safeParse({ ...behavior, kind: 'goal' }).success).toBe(false)
    expect(
      personalModelItemSchema.safeParse({ ...availabilityItem(), source: 'deterministic_rule' })
        .success,
    ).toBe(false)
  })

  it('rejects pattern, hypothesis and causal prose outside the first strict claim union', () => {
    const behavior = behaviorItem()
    expect(personalModelItemSchema.safeParse({ ...behavior, kind: 'hypothesis' }).success).toBe(
      false,
    )
    expect(
      personalModelItemSchema.safeParse({
        ...behavior,
        claim: { ...behavior.claim, causalExplanation: 'sleep caused performance' },
      }).success,
    ).toBe(false)
  })

  it('recomputes recorded-frequency summary relations from the weekly series', () => {
    const behavior = behaviorItem()
    expect(
      personalModelItemSchema.safeParse({
        ...behavior,
        claim: { ...behavior.claim, qualifyingWorkoutCount: 7 },
      }).success,
    ).toBe(false)
    expect(
      personalModelItemSchema.safeParse({
        ...behavior,
        claim: { ...behavior.claim, medianSessionsPerWeek: 0.5 },
      }).success,
    ).toBe(false)
    expect(
      personalModelItemSchema.safeParse({
        ...behavior,
        claim: {
          ...behavior.claim,
          observationWindow: {
            ...behavior.claim.observationWindow,
            endDateExclusive: '2026-08-09',
          },
        },
      }).success,
    ).toBe(false)
  })

  it('keeps insufficient longitudinal observations candidate and blocks eligible candidates', () => {
    const candidate = behaviorItem()
    const references = workoutReferences(4)
    const candidateInput = {
      ...candidate,
      status: 'candidate',
      observedFrom: '2026-07-13T00:00:00.000Z',
      confidence: {
        ...longitudinalConfidence(4, 4),
        level: 'insufficient',
        comparedWindowCount: 0,
        stableWindowCount: 0,
        limitations: ['limited_coverage'],
      },
      evidenceSet: evidenceSet(references, '2026-07-13T00:00:00.000Z'),
      claim: {
        ...candidate.claim,
        observationWindow: {
          ...candidate.claim.observationWindow,
          startDate: '2026-07-13',
          completeWeeks: 4,
        },
        weeklyRecordedSessionCounts: [1, 1, 1, 1],
        qualifyingWorkoutCount: 4,
        recordedWeekCount: 4,
        minimumSessionsPerWeek: 1,
        maximumSessionsPerWeek: 1,
      },
    }
    expect(personalModelItemSchema.safeParse(candidateInput).success).toBe(true)
    expect(
      personalModelItemSchema.safeParse({ ...behaviorItem(), status: 'candidate' }).success,
    ).toBe(false)
    expect(personalModelItemSchema.safeParse({ ...candidateInput, status: 'active' }).success).toBe(
      false,
    )
  })

  it('requires enough duration samples across weeks and ordered quartiles', () => {
    const baseline = baselineItem()
    expect(
      personalModelItemSchema.safeParse({
        ...baseline,
        claim: { ...baseline.claim, firstQuartileMinutes: 55 },
      }).success,
    ).toBe(false)
    expect(
      personalModelItemSchema.safeParse({
        ...baseline,
        claim: { ...baseline.claim, coveredWeeks: 3 },
      }).success,
    ).toBe(false)
  })

  it('binds availability to the exact onboarding goal revision', () => {
    const availability = availabilityItem()
    expect(
      personalModelItemSchema.safeParse({
        ...availability,
        claim: { ...availability.claim, sourceGoalRevision: 4 },
      }).success,
    ).toBe(false)
    expect(
      personalModelItemSchema.safeParse({ ...availability, status: 'candidate' }).success,
    ).toBe(false)
  })

  it('keeps a corrected goal revision as withdrawn context beside one current goal source', () => {
    const availability = availabilityItem()
    const previous = availability.evidenceSet.references[0]!
    const corrected = {
      ...availability,
      claim: { ...availability.claim, sourceGoalRevision: 4 },
      evidenceSet: {
        ...availability.evidenceSet,
        withdrawnCount: 1,
        evidenceFingerprint: 'b'.repeat(64),
        references: [
          {
            ...previous,
            role: 'context' as const,
            qualification: 'withdrawn' as const,
            withdrawnReason: 'source_corrected' as const,
          },
          {
            ...previous,
            id: uuidFor(3),
            aggregateRevision: 4,
            time: { kind: 'instant' as const, occurredAt: '2026-08-10T08:00:00.000Z' },
          },
        ],
      },
    }

    expect(personalModelItemSchema.safeParse(corrected).success).toBe(true)
    expect(
      personalModelItemSchema.safeParse({
        ...corrected,
        evidenceSet: {
          ...corrected.evidenceSet,
          references: corrected.evidenceSet.references.map((reference, index) =>
            index === 1 ? { ...reference, aggregateId: uuidFor(4) } : reference,
          ),
        },
      }).success,
    ).toBe(false)
  })

  it('checks evidence counts, owner isolation, uniqueness and withdrawal semantics', () => {
    const behavior = behaviorItem()
    expect(
      personalModelEvidenceSetSchema.safeParse({
        ...behavior.evidenceSet,
        includedCount: 5,
      }).success,
    ).toBe(false)
    expect(
      personalModelEvidenceSetSchema.safeParse({
        ...behavior.evidenceSet,
        references: behavior.evidenceSet.references.map((reference, index) =>
          index === 0 ? { ...reference, ownerUserId: uuidFor(999) } : reference,
        ),
      }).success,
    ).toBe(false)
    expect(
      personalModelEvidenceSetSchema.safeParse({
        ...behavior.evidenceSet,
        references: behavior.evidenceSet.references.map((reference, index) =>
          index === 1
            ? {
                ...reference,
                aggregateId: behavior.evidenceSet.references[0]!.aggregateId,
                aggregateRevision: behavior.evidenceSet.references[0]!.aggregateRevision,
              }
            : reference,
        ),
      }).success,
    ).toBe(false)
    expect(
      personalModelEvidenceSetSchema.safeParse({
        ...behavior.evidenceSet,
        references: behavior.evidenceSet.references.map((reference, index) =>
          index === 0
            ? { ...reference, qualification: 'withdrawn', withdrawnReason: 'source_deleted' }
            : reference,
        ),
      }).success,
    ).toBe(false)
  })

  it('keeps disputed and candidate items out of decision inputs', () => {
    const active = behaviorItem()
    expect(personalModelDecisionInputSchema.safeParse(active).success).toBe(true)

    const disputed = {
      ...active,
      status: 'disputed',
      feedbackState: 'disagreed',
      confidence: {
        ...active.confidence,
        limitations: ['user_disputed'],
      },
    }
    expect(personalModelItemSchema.safeParse(disputed).success).toBe(true)
    expect(personalModelDecisionInputSchema.safeParse(disputed).success).toBe(false)
    expect(
      personalModelDecisionInputSchema.safeParse({ ...active, status: 'candidate' }).success,
    ).toBe(false)
  })

  it('represents unknown explicitly instead of publishing an all-zero model item', () => {
    expect(
      personalModelUnknownReceiptSchema.safeParse({
        schemaVersion: 'personal-model-unknown-v1',
        kind: 'unknown',
        userId,
        subjectKey: 'training.recorded_frequency',
        reasons: ['no_eligible_evidence'],
        evidencePolicyVersion: 'recorded-workout-evidence-v1',
        evaluatedAt: observedThrough,
        window: {
          startAt: observedFrom,
          endAt: observedThrough,
          timezone: 'Asia/Shanghai',
        },
      }).success,
    ).toBe(true)

    const behavior = behaviorItem()
    expect(
      personalModelItemSchema.safeParse({
        ...behavior,
        status: 'candidate',
        claim: {
          ...behavior.claim,
          weeklyRecordedSessionCounts: Array(8).fill(0),
          qualifyingWorkoutCount: 0,
          recordedWeekCount: 0,
          medianSessionsPerWeek: 0,
          minimumSessionsPerWeek: 0,
          maximumSessionsPerWeek: 0,
        },
      }).success,
    ).toBe(false)
  })

  it('validates confidence receipt relationships and explicit insufficient limitations', () => {
    expect(
      personalModelConfidenceReceiptSchema.safeParse({
        ...longitudinalConfidence(2, 2),
        level: 'insufficient',
        distinctLocalDates: 3,
        limitations: [],
      }).success,
    ).toBe(false)
    expect(
      personalModelConfidenceReceiptSchema.safeParse({
        ...longitudinalConfidence(0, 0),
        level: 'insufficient',
        distinctLocalDates: 0,
        latestEvidenceAt: '2026-07-25T09:00:00.000Z',
        limitations: ['limited_coverage'],
      }).success,
    ).toBe(false)
    expect(
      personalModelConfidenceReceiptSchema.safeParse({
        ...longitudinalConfidence(8, 1),
        distinctLocalDates: 8,
      }).success,
    ).toBe(false)
    expect(
      personalModelItemSchema.safeParse({
        ...behaviorItem(),
        confidence: {
          ...behaviorItem().confidence,
          contradictingEvidenceCount: 1,
        },
      }).success,
    ).toBe(false)
  })

  it('binds feedback to an exact item revision without accepting confidence mutation', () => {
    const event = {
      id: uuidFor(500),
      userId,
      itemId,
      itemRevision: 3,
      choice: 'temporary_context',
      reasonCode: 'context_changed',
      note: '本月出差，训练安排只是临时变化。',
      contextValidUntil: '2026-09-01T00:00:00.000Z',
      createdAt: observedThrough,
    }
    expect(personalModelFeedbackEventSchema.safeParse(event).success).toBe(true)
    expect(
      personalModelFeedbackEventSchema.safeParse({ ...event, contextValidUntil: null }).success,
    ).toBe(false)
    expect(
      personalModelFeedbackEventSchema.safeParse({
        ...event,
        choice: 'matches_me',
      }).success,
    ).toBe(false)
    expect(
      personalModelFeedbackEventSchema.safeParse({
        ...event,
        confidenceDelta: 0.2,
      }).success,
    ).toBe(false)
    expect(
      personalModelFeedbackEventSchema.safeParse({
        ...event,
        note: '我'.repeat(301),
      }).success,
    ).toBe(false)
  })

  it('requires terminal and temporary items to expose validity boundaries', () => {
    const behavior = behaviorItem()
    expect(personalModelItemSchema.safeParse({ ...behavior, status: 'invalidated' }).success).toBe(
      false,
    )
    expect(
      personalModelItemSchema.safeParse({ ...behavior, feedbackState: 'temporary' }).success,
    ).toBe(false)
  })

  it('accepts low-confidence user disagreement without granting decision eligibility', () => {
    const item = behaviorItem()
    const references = workoutReferences(4)
    const disputedCandidate = {
      ...item,
      status: 'disputed',
      feedbackState: 'disagreed',
      observedFrom: '2026-07-13T00:00:00.000Z',
      confidence: {
        ...longitudinalConfidence(4, 4),
        level: 'insufficient',
        comparedWindowCount: 0,
        stableWindowCount: 0,
        limitations: ['limited_coverage', 'user_disputed'],
      },
      evidenceSet: evidenceSet(references, '2026-07-13T00:00:00.000Z'),
      claim: {
        ...item.claim,
        observationWindow: {
          ...item.claim.observationWindow,
          startDate: '2026-07-13',
          completeWeeks: 4,
        },
        weeklyRecordedSessionCounts: [1, 1, 1, 1],
        qualifyingWorkoutCount: 4,
        recordedWeekCount: 4,
        minimumSessionsPerWeek: 1,
        maximumSessionsPerWeek: 1,
      },
    }
    expect(personalModelItemSchema.safeParse(disputedCandidate).success).toBe(true)
    expect(personalModelDecisionInputSchema.safeParse(disputedCandidate).success).toBe(false)
  })

  it('binds immutable revision envelopes to the complete snapshot and exact predecessor', () => {
    const item = behaviorItem()
    const revision = {
      schemaVersion: 'personal-model-item-revision-v1',
      id: uuidFor(600),
      userId,
      itemId,
      revision: 1,
      previousRevision: null,
      action: 'created',
      snapshot: item,
      derivationFingerprint: 'b'.repeat(64),
      feedbackEventId: null,
      changedAt: observedThrough,
    }
    expect(personalModelItemRevisionSchema.safeParse(revision).success).toBe(true)
    expect(
      personalModelItemRevisionSchema.safeParse({ ...revision, previousRevision: 1 }).success,
    ).toBe(false)
    expect(
      personalModelItemRevisionSchema.safeParse({
        ...revision,
        itemId: uuidFor(601),
      }).success,
    ).toBe(false)
    expect(
      personalModelItemRevisionSchema.safeParse({
        ...revision,
        action: 'evidence_accumulated',
      }).success,
    ).toBe(false)
  })

  it('requires feedback to target the exact current non-terminal revision', () => {
    const item = behaviorItem()
    const event = {
      id: uuidFor(610),
      userId,
      itemId,
      itemRevision: 1,
      choice: 'disagree',
      reasonCode: 'not_representative',
      note: null,
      contextValidUntil: null,
      createdAt: '2026-08-10T00:30:00.000Z',
    }
    expect(personalModelFeedbackApplicationSchema.safeParse({ item, event }).success).toBe(true)
    expect(
      personalModelFeedbackApplicationSchema.safeParse({
        item,
        event: { ...event, itemRevision: 2 },
      }).success,
    ).toBe(false)
    expect(
      personalModelFeedbackApplicationSchema.safeParse({
        item: { ...item, status: 'invalidated', validTo: observedThrough },
        event,
      }).success,
    ).toBe(false)
  })

  it('validates revised feedback transitions and exact feedback action mapping', () => {
    const previousItem = behaviorItem()
    const event = {
      id: uuidFor(620),
      userId,
      itemId,
      itemRevision: 1,
      choice: 'disagree',
      reasonCode: 'not_representative',
      note: null,
      contextValidUntil: null,
      createdAt: '2026-08-10T00:30:00.000Z',
    }
    const snapshot = {
      ...previousItem,
      status: 'disputed',
      feedbackState: 'disagreed',
      revision: 2,
      confidence: { ...previousItem.confidence, limitations: ['user_disputed'] },
      updatedAt: '2026-08-10T01:00:00.000Z',
    }
    const revision = {
      schemaVersion: 'personal-model-item-revision-v1',
      id: uuidFor(621),
      userId,
      itemId,
      revision: 2,
      previousRevision: 1,
      action: 'user_disagreed',
      snapshot,
      derivationFingerprint: 'c'.repeat(64),
      feedbackEventId: event.id,
      changedAt: snapshot.updatedAt,
    }
    const result = {
      schemaVersion: 'personal-model-feedback-transition-v1',
      outcome: 'revised',
      event,
      previousItem,
      revision,
    }
    expect(personalModelFeedbackTransitionResultSchema.safeParse(result).success).toBe(true)
    expect(
      personalModelFeedbackTransitionResultSchema.safeParse({
        ...result,
        revision: { ...revision, action: 'user_confirmed' },
      }).success,
    ).toBe(false)
    expect(
      personalModelFeedbackTransitionResultSchema.safeParse({
        ...result,
        event: { ...event, itemRevision: 2 },
      }).success,
    ).toBe(false)
    expect(
      personalModelFeedbackTransitionResultSchema.safeParse({
        ...result,
        revision: {
          ...revision,
          snapshot: { ...snapshot, updatedAt: '2026-08-10T00:15:00.000Z' },
          changedAt: '2026-08-10T00:15:00.000Z',
        },
      }).success,
    ).toBe(false)
  })

  it('only returns feedback no-op when the exact feedback state is already current', () => {
    const currentItem = {
      ...behaviorItem(),
      status: 'disputed',
      feedbackState: 'disagreed',
      confidence: { ...behaviorItem().confidence, limitations: ['user_disputed'] },
    }
    const event = {
      id: uuidFor(630),
      userId,
      itemId,
      itemRevision: 1,
      choice: 'disagree',
      reasonCode: null,
      note: null,
      contextValidUntil: null,
      createdAt: '2026-08-10T00:30:00.000Z',
    }
    const result = {
      schemaVersion: 'personal-model-feedback-transition-v1',
      outcome: 'no_op',
      event,
      currentItem,
      reason: 'feedback_already_current',
      resultFingerprint: 'd'.repeat(64),
    }
    expect(personalModelFeedbackTransitionResultSchema.safeParse(result).success).toBe(true)
    expect(
      personalModelFeedbackTransitionResultSchema.safeParse({
        ...result,
        event: { ...event, choice: 'matches_me' },
      }).success,
    ).toBe(false)
    const temporaryEvent = {
      ...event,
      choice: 'temporary_context' as const,
      contextValidUntil: '2026-08-31T00:00:00.000Z',
    }
    expect(
      personalModelFeedbackTransitionResultSchema.safeParse({
        ...result,
        event: temporaryEvent,
        currentItem: {
          ...currentItem,
          status: 'active',
          feedbackState: 'temporary',
          validTo: '2026-08-30T00:00:00.000Z',
          confidence: behaviorItem().confidence,
        },
      }).success,
    ).toBe(false)
  })

  const reviewReference = (id: number, kind: 'behavior' | 'baseline' | 'pattern' = 'behavior') => ({
    ownerUserId: userId,
    itemId: uuidFor(id),
    itemRevision: 2,
    kind,
    status: 'active' as const,
    subjectKey:
      kind === 'baseline'
        ? 'training.recorded_session_duration'
        : kind === 'pattern'
          ? 'training.sleep_rpe_pattern'
          : 'training.recorded_frequency',
    derivedAt: '2026-08-09T12:00:00.000Z',
    evidenceFingerprint: 'e'.repeat(64),
  })

  const weeklyReview = () => ({
    schemaVersion: 'weekly-cognitive-review-v1' as const,
    id: uuidFor(700),
    reviewId: uuidFor(701),
    userId,
    weekStart: '2026-08-03',
    weekEndExclusive: '2026-08-10',
    timezone: 'Asia/Shanghai',
    observedThrough: observedThrough,
    revision: 1,
    evidenceWatermark: 'f'.repeat(64),
    modelWatermark: '1'.repeat(64),
    reviewFingerprint: '2'.repeat(64),
    content: {
      recentChanges: [reviewReference(710)],
      baselineDeviations: [reviewReference(711, 'baseline')],
      newPatterns: [],
      modelRevisions: [],
      unknowns: [],
      verificationQuestion: null,
    },
    generatedAt: observedThrough,
  })

  it('accepts only bounded structured weekly review cards and no free narrative facts', () => {
    const review = weeklyReview()
    expect(weeklyCognitiveReviewRevisionSchema.safeParse(review).success).toBe(true)
    expect(
      weeklyCognitiveReviewRevisionSchema.safeParse({
        ...review,
        content: {
          ...review.content,
          recentChanges: [
            reviewReference(710),
            reviewReference(712),
            reviewReference(713),
            reviewReference(714),
          ],
        },
      }).success,
    ).toBe(false)
    expect(
      weeklyCognitiveReviewRevisionSchema.safeParse({
        ...review,
        content: { ...review.content, narrative: '模型自由补充的事实' },
      }).success,
    ).toBe(false)
  })

  it('rejects cross-owner, future and duplicate item revisions in weekly review', () => {
    const review = weeklyReview()
    expect(
      weeklyCognitiveReviewRevisionSchema.safeParse({
        ...review,
        content: {
          ...review.content,
          recentChanges: [{ ...review.content.recentChanges[0], ownerUserId: uuidFor(799) }],
        },
      }).success,
    ).toBe(false)
    expect(
      weeklyCognitiveReviewRevisionSchema.safeParse({
        ...review,
        content: {
          ...review.content,
          recentChanges: [
            { ...review.content.recentChanges[0], derivedAt: '2026-08-10T01:00:00.000Z' },
          ],
        },
      }).success,
    ).toBe(false)
    expect(
      weeklyCognitiveReviewRevisionSchema.safeParse({
        ...review,
        content: {
          ...review.content,
          modelRevisions: [review.content.recentChanges[0]],
        },
      }).success,
    ).toBe(false)
  })

  it('requires review kind roles, Monday boundaries and at least one card', () => {
    const review = weeklyReview()
    expect(
      weeklyCognitiveReviewRevisionSchema.safeParse({ ...review, weekStart: '2026-08-04' }).success,
    ).toBe(false)
    expect(
      weeklyCognitiveReviewRevisionSchema.safeParse({
        ...review,
        content: {
          ...review.content,
          baselineDeviations: [reviewReference(711, 'behavior')],
        },
      }).success,
    ).toBe(false)
    expect(
      weeklyCognitiveReviewRevisionSchema.safeParse({
        ...review,
        content: {
          recentChanges: [],
          baselineDeviations: [],
          newPatterns: [],
          modelRevisions: [],
          unknowns: [],
          verificationQuestion: null,
        },
      }).success,
    ).toBe(false)
  })

  it('keeps current review envelopes and history pages revision-consistent', () => {
    const first = weeklyReview()
    const second = {
      ...first,
      id: uuidFor(702),
      revision: 2,
      reviewFingerprint: '3'.repeat(64),
      generatedAt: '2026-08-10T01:00:00.000Z',
    }
    expect(
      weeklyCognitiveReviewEnvelopeSchema.safeParse({
        schemaVersion: 'weekly-cognitive-review-envelope-v1',
        userId,
        weekStart: second.weekStart,
        timezone: second.timezone,
        observedThrough: second.observedThrough,
        generatedAt: second.generatedAt,
        review: second,
      }).success,
    ).toBe(true)
    expect(
      weeklyCognitiveReviewEnvelopeSchema.safeParse({
        schemaVersion: 'weekly-cognitive-review-envelope-v1',
        userId,
        weekStart: second.weekStart,
        timezone: second.timezone,
        observedThrough: second.observedThrough,
        generatedAt: second.generatedAt,
        review: null,
      }).success,
    ).toBe(true)
    expect(
      weeklyCognitiveReviewEnvelopeSchema.safeParse({
        schemaVersion: 'weekly-cognitive-review-envelope-v1',
        userId: uuidFor(799),
        weekStart: second.weekStart,
        timezone: second.timezone,
        observedThrough: second.observedThrough,
        generatedAt: second.generatedAt,
        review: second,
      }).success,
    ).toBe(false)
    const page = {
      schemaVersion: 'weekly-cognitive-review-history-page-v1',
      userId,
      reviewId: first.reviewId,
      items: [second, first],
      nextCursor: null,
    }
    expect(weeklyCognitiveReviewHistoryPageSchema.safeParse(page).success).toBe(true)
    expect(
      weeklyCognitiveReviewHistoryPageSchema.safeParse({ ...page, items: [first, second] }).success,
    ).toBe(false)
    expect(
      weeklyCognitiveReviewHistoryPageSchema.safeParse({
        ...page,
        items: [second, { ...first, reviewId: uuidFor(799) }],
      }).success,
    ).toBe(false)
  })
})
