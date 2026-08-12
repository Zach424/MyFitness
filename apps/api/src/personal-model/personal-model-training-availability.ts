import {
  onboardingGoalRevisionSnapshotSchema,
  personalModelItemRevisionSchema,
  type OnboardingGoalRevisionSnapshot,
  type PersonalModelItemRevision,
} from '@myfitness/contracts'

export const trainingAvailabilityDerivationPolicyVersion =
  'training-availability-derivation-v1' as const
export const trainingAvailabilityEvidencePolicyVersion = 'onboarding-goal-evidence-v1' as const

export type TrainingAvailabilityDerivationIds = {
  itemId: string
  revisionId: string
  eligibleReferenceId: string
}

export type TrainingAvailabilityDerivationInput = {
  goalRevision: OnboardingGoalRevisionSnapshot
  timezone: string
  evaluatedAt: string
  currentRevision: PersonalModelItemRevision | null
  ids: TrainingAvailabilityDerivationIds
  sha256Hex: (value: string) => string
}

export type TrainingAvailabilityDerivationResult =
  | {
      outcome: 'created'
      revision: PersonalModelItemRevision
    }
  | {
      outcome: 'revised'
      cause: 'source_refreshed' | 'content_reconciled'
      revision: PersonalModelItemRevision
    }
  | {
      outcome: 'no_op'
      currentRevision: PersonalModelItemRevision
    }

const digest = (sha256Hex: (value: string) => string, value: unknown) => {
  const fingerprint = sha256Hex(JSON.stringify(value))
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) {
    throw new TypeError('SHA-256 provider must return 64 lowercase hexadecimal characters')
  }
  return fingerprint
}

const canonicalDateTime = (value: string, name: string) => {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) throw new TypeError(`${name} must be a valid date-time`)
  return new Date(timestamp).toISOString()
}

const sameArray = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index])

type EvidenceReference = PersonalModelItemRevision['snapshot']['evidenceSet']['references'][number]

const evidenceFingerprint = (
  sha256Hex: (value: string) => string,
  ownerUserId: string,
  references: EvidenceReference[],
) =>
  digest(sha256Hex, {
    policyVersion: trainingAvailabilityEvidencePolicyVersion,
    ownerUserId,
    references: references.map((reference) => ({
      evidenceKind: reference.evidenceKind,
      aggregateId: reference.aggregateId,
      aggregateRevision: reference.aggregateRevision,
      role: reference.role,
      sourceKind: reference.sourceKind,
      qualification: reference.qualification,
      withdrawnReason: reference.withdrawnReason,
      time: reference.time,
    })),
  })

const derivationFingerprint = (
  sha256Hex: (value: string) => string,
  snapshot: PersonalModelItemRevision['snapshot'],
  nextEvidenceFingerprint: string,
) =>
  digest(sha256Hex, {
    policyVersion: trainingAvailabilityDerivationPolicyVersion,
    subjectKey: snapshot.subjectKey,
    claimSchemaVersion: snapshot.claimSchemaVersion,
    claim: snapshot.claim,
    status: snapshot.status,
    confidence: snapshot.confidence,
    feedbackState: snapshot.feedbackState,
    validFrom: snapshot.validFrom,
    validTo: snapshot.validTo,
    evidenceFingerprint: nextEvidenceFingerprint,
  })

const currentGoalReference = (
  goal: OnboardingGoalRevisionSnapshot,
  referenceId: string,
): EvidenceReference => ({
  id: referenceId,
  ownerUserId: goal.ownerUserId,
  role: 'supporting',
  evidenceKind: 'onboarding_goal_revision',
  aggregateId: goal.goalId,
  aggregateRevision: goal.revision,
  sourceKind: 'user_confirmed',
  qualification: 'eligible',
  withdrawnReason: null,
  time: { kind: 'instant', occurredAt: canonicalDateTime(goal.changedAt, 'goal changedAt') },
})

const withdrawnGoalReference = (reference: EvidenceReference): EvidenceReference => ({
  ...reference,
  role: 'context',
  qualification: 'withdrawn',
  withdrawnReason: 'source_corrected',
})

const evidenceCounts = (references: EvidenceReference[]) => {
  const eligible = references.filter((reference) => reference.qualification === 'eligible')
  return {
    includedCount: eligible.length,
    supportingCount: eligible.filter((reference) => reference.role === 'supporting').length,
    contradictingCount: eligible.filter((reference) => reference.role === 'contradicting').length,
    withdrawnCount: references.length - eligible.length,
  }
}

const assertEvaluationOrder = (
  evaluatedAt: string,
  goalChangedAt: string,
  currentChangedAt: string | null,
) => {
  const evaluated = Date.parse(evaluatedAt)
  const lowerBound = Math.max(
    Date.parse(goalChangedAt),
    currentChangedAt === null ? Number.NEGATIVE_INFINITY : Date.parse(currentChangedAt),
  )
  if (evaluated <= lowerBound) {
    throw new RangeError('training availability evaluation must follow its source and predecessor')
  }
}

const buildCreation = (
  goal: OnboardingGoalRevisionSnapshot,
  timezone: string,
  evaluatedAt: string,
  ids: TrainingAvailabilityDerivationIds,
  sha256Hex: (value: string) => string,
): PersonalModelItemRevision => {
  const reference = currentGoalReference(goal, ids.eligibleReferenceId)
  const references = [reference]
  const nextEvidenceFingerprint = evidenceFingerprint(sha256Hex, goal.ownerUserId, references)
  const snapshot = {
    contractVersion: 'personal-model-contract-v1' as const,
    id: ids.itemId,
    userId: goal.ownerUserId,
    kind: 'constraint' as const,
    subjectKey: 'training.availability' as const,
    claimSchemaVersion: 'training_availability_constraint_v1' as const,
    claim: {
      availableDays: goal.goal.availableDays,
      sessionMinutes: goal.goal.sessionMinutes,
      sourceGoalRevision: goal.revision,
      durationUnit: 'minutes' as const,
    },
    source: 'user_confirmed' as const,
    status: 'active' as const,
    confidence: {
      policyVersion: 'personal-model-confidence-v1' as const,
      basis: 'user_confirmed' as const,
      level: 'high' as const,
      qualifiedEvidenceCount: 1 as const,
      limitations: [],
    },
    evidenceSet: {
      policyVersion: trainingAvailabilityEvidencePolicyVersion,
      ownerUserId: goal.ownerUserId,
      asOf: evaluatedAt,
      window: { startAt: goal.changedAt, endAt: evaluatedAt, timezone },
      ...evidenceCounts(references),
      evidenceFingerprint: nextEvidenceFingerprint,
      references,
    },
    validFrom: goal.changedAt,
    validTo: null,
    observedFrom: goal.changedAt,
    observedThrough: evaluatedAt,
    derivedAt: evaluatedAt,
    revision: 1,
    feedbackState: 'unreviewed' as const,
    createdAt: evaluatedAt,
    updatedAt: evaluatedAt,
  }

  return personalModelItemRevisionSchema.parse({
    schemaVersion: 'personal-model-item-revision-v1',
    id: ids.revisionId,
    userId: goal.ownerUserId,
    itemId: ids.itemId,
    revision: 1,
    previousRevision: null,
    action: 'created',
    snapshot,
    derivationFingerprint: derivationFingerprint(sha256Hex, snapshot, nextEvidenceFingerprint),
    feedbackEventId: null,
    changedAt: evaluatedAt,
  })
}

export const deriveTrainingAvailability = (
  input: TrainingAvailabilityDerivationInput,
): TrainingAvailabilityDerivationResult => {
  const goal = onboardingGoalRevisionSnapshotSchema.parse(input.goalRevision)
  const evaluatedAt = canonicalDateTime(input.evaluatedAt, 'evaluatedAt')
  assertEvaluationOrder(evaluatedAt, goal.changedAt, input.currentRevision?.changedAt ?? null)

  if (input.currentRevision === null) {
    return {
      outcome: 'created',
      revision: buildCreation(goal, input.timezone, evaluatedAt, input.ids, input.sha256Hex),
    }
  }

  const current = personalModelItemRevisionSchema.parse(input.currentRevision)
  if (
    current.userId !== goal.ownerUserId ||
    current.itemId !== input.ids.itemId ||
    current.snapshot.claimSchemaVersion !== 'training_availability_constraint_v1'
  ) {
    throw new TypeError('current revision is not the owner training availability item')
  }

  const goalReferences = current.snapshot.evidenceSet.references.filter(
    (reference) => reference.evidenceKind === 'onboarding_goal_revision',
  )
  if (
    goalReferences.length === 0 ||
    goalReferences.some((reference) => reference.aggregateId !== goal.goalId)
  ) {
    throw new TypeError('training availability goal aggregate cannot change')
  }

  const eligibleReferences = goalReferences.filter(
    (reference) => reference.qualification === 'eligible',
  )
  if (eligibleReferences.length > 1) {
    throw new TypeError('training availability must have at most one eligible goal source')
  }
  const eligibleReference = eligibleReferences[0]
  const terminal =
    current.snapshot.status === 'superseded' || current.snapshot.status === 'invalidated'
  if (eligibleReference === undefined) {
    if (terminal) return { outcome: 'no_op', currentRevision: current }
    throw new TypeError('current training availability source is missing')
  }

  const sourceChanged = eligibleReference.aggregateRevision !== goal.revision
  if (
    !sourceChanged &&
    (eligibleReference.time.kind !== 'instant' ||
      Date.parse(eligibleReference.time.occurredAt) !== Date.parse(goal.changedAt))
  ) {
    throw new TypeError('current training availability source metadata is inconsistent')
  }
  if (sourceChanged && goal.revision <= eligibleReference.aggregateRevision) {
    throw new RangeError('training availability source revision must move forward')
  }

  const claimMatches =
    current.snapshot.claim.sourceGoalRevision === goal.revision &&
    current.snapshot.claim.sessionMinutes === goal.goal.sessionMinutes &&
    sameArray(current.snapshot.claim.availableDays, goal.goal.availableDays)
  const currentEvidenceFingerprint = evidenceFingerprint(
    input.sha256Hex,
    current.userId,
    current.snapshot.evidenceSet.references,
  )
  const evidenceMatches =
    current.snapshot.evidenceSet.policyVersion === trainingAvailabilityEvidencePolicyVersion &&
    current.snapshot.evidenceSet.window.timezone === input.timezone &&
    current.snapshot.evidenceSet.evidenceFingerprint === currentEvidenceFingerprint
  const derivationMatches =
    current.derivationFingerprint ===
    derivationFingerprint(input.sha256Hex, current.snapshot, currentEvidenceFingerprint)

  if (!sourceChanged && claimMatches && evidenceMatches && derivationMatches) {
    return { outcome: 'no_op', currentRevision: current }
  }

  const references = sourceChanged
    ? terminal
      ? [withdrawnGoalReference(eligibleReference)]
      : [
          withdrawnGoalReference(eligibleReference),
          currentGoalReference(goal, input.ids.eligibleReferenceId),
        ]
    : current.snapshot.evidenceSet.references
  const nextEvidenceFingerprint = evidenceFingerprint(input.sha256Hex, goal.ownerUserId, references)
  const nextClaim =
    sourceChanged && terminal
      ? current.snapshot.claim
      : {
          availableDays: goal.goal.availableDays,
          sessionMinutes: goal.goal.sessionMinutes,
          sourceGoalRevision: goal.revision,
          durationUnit: 'minutes' as const,
        }
  const temporaryFeedbackStillApplies =
    current.snapshot.feedbackState === 'temporary' &&
    current.snapshot.validTo !== null &&
    Date.parse(current.snapshot.validTo) >= Date.parse(evaluatedAt)
  const nextFeedbackState =
    sourceChanged && !terminal
      ? current.snapshot.feedbackState === 'disagreed'
        ? 'disagreed'
        : temporaryFeedbackStillApplies
          ? 'temporary'
          : 'unreviewed'
      : current.snapshot.feedbackState
  const snapshot = {
    ...current.snapshot,
    claim: nextClaim,
    evidenceSet: {
      ...current.snapshot.evidenceSet,
      policyVersion: trainingAvailabilityEvidencePolicyVersion,
      asOf: evaluatedAt,
      window: {
        startAt: current.snapshot.observedFrom,
        endAt: evaluatedAt,
        timezone: input.timezone,
      },
      ...evidenceCounts(references),
      evidenceFingerprint: nextEvidenceFingerprint,
      references,
    },
    validFrom: sourceChanged && !terminal ? goal.changedAt : current.snapshot.validFrom,
    validTo:
      sourceChanged &&
      !terminal &&
      current.snapshot.feedbackState === 'temporary' &&
      !temporaryFeedbackStillApplies
        ? null
        : current.snapshot.validTo,
    observedThrough: evaluatedAt,
    derivedAt: evaluatedAt,
    revision: current.revision + 1,
    feedbackState: nextFeedbackState,
    updatedAt: evaluatedAt,
  }
  const action = terminal ? current.snapshot.status : 'evidence_accumulated'
  const revision = personalModelItemRevisionSchema.parse({
    schemaVersion: 'personal-model-item-revision-v1',
    id: input.ids.revisionId,
    userId: current.userId,
    itemId: current.itemId,
    revision: current.revision + 1,
    previousRevision: current.revision,
    action,
    snapshot,
    derivationFingerprint: derivationFingerprint(
      input.sha256Hex,
      snapshot,
      nextEvidenceFingerprint,
    ),
    feedbackEventId: null,
    changedAt: evaluatedAt,
  })

  return {
    outcome: 'revised',
    cause: sourceChanged ? 'source_refreshed' : 'content_reconciled',
    revision,
  }
}
