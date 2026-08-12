import {
  personalModelItemRevisionSchema,
  personalModelUnknownReceiptSchema,
  type PersonalModelEvidenceReference,
  type PersonalModelItemRevision,
  type PersonalModelUnknownReceipt,
} from '@myfitness/contracts'

export const recordedTrainingFrequencyDerivationPolicyVersion =
  'recorded-training-frequency-derivation-v1' as const
export const recordedTrainingFrequencyEvidencePolicyVersion =
  'recorded-workout-evidence-v1' as const

export type RecordedTrainingFrequencyWindow = {
  startDate: string
  endDateExclusive: string
  completeWeeks: number
  startAt: string
  endAt: string
  timezone: string
}

export type RecordedTrainingFrequencyWorkout = {
  referenceId: string
  workoutId: string
  revision: number
  sourceKind: 'manual' | 'imported'
  startedAt: string
  endedAt: string
  timezone: string
  localDate: string
  weekIndex: number
}

export type RecordedTrainingFrequencyPendingWithdrawal = {
  workoutId: string
  withdrawnRevision: number
  observedRevision: number
  reason: 'source_corrected' | 'source_deleted'
}

export type RecordedTrainingFrequencyDerivationInput = {
  userId: string
  evaluatedAt: string
  window: RecordedTrainingFrequencyWindow
  workouts: RecordedTrainingFrequencyWorkout[]
  pendingWithdrawals: RecordedTrainingFrequencyPendingWithdrawal[]
  currentRevision: PersonalModelItemRevision | null
  ids: { itemId: string; revisionId: string }
  sha256Hex: (value: string) => string
}

export type RecordedTrainingFrequencyDerivationResult =
  | { outcome: 'unknown'; receipt: PersonalModelUnknownReceipt }
  | { outcome: 'created'; revision: PersonalModelItemRevision }
  | {
      outcome: 'revised'
      cause: 'evidence_refreshed' | 'content_reconciled'
      revision: PersonalModelItemRevision
      unknownReceipt?: PersonalModelUnknownReceipt
    }
  | { outcome: 'no_op'; currentRevision: PersonalModelItemRevision }

type WorkoutReference = Extract<
  PersonalModelEvidenceReference,
  { evidenceKind: 'workout_revision' }
>

const localDatePattern = /^\d{4}-\d{2}-\d{2}$/

const digest = (sha256Hex: (value: string) => string, value: unknown) => {
  const fingerprint = sha256Hex(JSON.stringify(value))
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) {
    throw new TypeError('SHA-256 provider must return 64 lowercase hexadecimal characters')
  }
  return fingerprint
}

const instant = (value: string, name: string) => {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new TypeError(`${name} must be a valid date-time`)
  return new Date(parsed).toISOString()
}

const localDate = (value: string, name: string) => {
  if (
    !localDatePattern.test(value) ||
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value
  ) {
    throw new TypeError(`${name} must be a real local date`)
  }
  return value
}

const median = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!
}

const sameValue = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)

const localDateAt = (value: string, timezone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    calendar: 'gregory',
    numberingSystem: 'latn',
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

const validateWindow = (window: RecordedTrainingFrequencyWindow) => {
  const startDate = localDate(window.startDate, 'window startDate')
  const endDateExclusive = localDate(window.endDateExclusive, 'window endDateExclusive')
  if (
    !Number.isInteger(window.completeWeeks) ||
    window.completeWeeks < 0 ||
    window.completeWeeks > 8
  ) {
    throw new RangeError('completeWeeks must be between zero and eight')
  }
  const days =
    (Date.parse(`${endDateExclusive}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) /
    86_400_000
  if (days !== window.completeWeeks * 7) {
    throw new RangeError('frequency window must contain exact complete local weeks')
  }
  const startAt = instant(window.startAt, 'window startAt')
  const endAt = instant(window.endAt, 'window endAt')
  if (Date.parse(endAt) <= Date.parse(startAt)) {
    throw new RangeError('frequency window must end after it starts')
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: window.timezone }).format(0)
  } catch {
    throw new TypeError('frequency window timezone must be a valid IANA timezone')
  }
  if (
    window.completeWeeks > 0 &&
    (localDateAt(startAt, window.timezone) !== startDate ||
      localDateAt(endAt, window.timezone) !== endDateExclusive)
  ) {
    throw new RangeError('frequency instants must match their local-date boundaries')
  }
  return { ...window, startDate, endDateExclusive, startAt, endAt }
}

const workoutReference = (
  userId: string,
  workout: RecordedTrainingFrequencyWorkout,
  id: string,
): WorkoutReference => ({
  id,
  ownerUserId: userId,
  role: 'supporting',
  evidenceKind: 'workout_revision',
  aggregateId: workout.workoutId,
  aggregateRevision: workout.revision,
  sourceKind: workout.sourceKind,
  qualification: 'eligible',
  withdrawnReason: null,
  time: {
    kind: 'interval',
    startedAt: instant(workout.startedAt, 'workout startedAt'),
    endedAt: instant(workout.endedAt, 'workout endedAt'),
    timezone: workout.timezone,
  },
})

const withdraw = (
  reference: WorkoutReference,
  reason: 'source_corrected' | 'source_deleted' | 'policy_changed',
): WorkoutReference => ({
  ...reference,
  role: 'context',
  qualification: 'withdrawn',
  withdrawnReason: reason,
})

const evidenceFingerprint = (
  sha256Hex: (value: string) => string,
  userId: string,
  references: WorkoutReference[],
) =>
  digest(sha256Hex, {
    policyVersion: recordedTrainingFrequencyEvidencePolicyVersion,
    userId,
    references: references.map(({ id: _id, ...reference }) => reference),
  })

const derivationFingerprint = (
  sha256Hex: (value: string) => string,
  snapshot: PersonalModelItemRevision['snapshot'],
) =>
  digest(sha256Hex, {
    policyVersion: recordedTrainingFrequencyDerivationPolicyVersion,
    subjectKey: snapshot.subjectKey,
    claim: snapshot.claim,
    status: snapshot.status,
    confidence: snapshot.confidence,
    feedbackState: snapshot.feedbackState,
    validFrom: snapshot.validFrom,
    validTo: snapshot.validTo,
    evidenceFingerprint: snapshot.evidenceSet.evidenceFingerprint,
  })

const unknownReceipt = (
  input: RecordedTrainingFrequencyDerivationInput,
  window: ReturnType<typeof validateWindow>,
  evaluatedAt: string,
): PersonalModelUnknownReceipt =>
  personalModelUnknownReceiptSchema.parse({
    schemaVersion: 'personal-model-unknown-v1',
    kind: 'unknown',
    userId: input.userId,
    subjectKey: 'training.recorded_frequency',
    reasons: [window.completeWeeks === 0 ? 'insufficient_coverage' : 'no_eligible_evidence'],
    evidencePolicyVersion: recordedTrainingFrequencyEvidencePolicyVersion,
    evaluatedAt,
    window: { startAt: window.startAt, endAt: window.endAt, timezone: window.timezone },
  })

export const deriveRecordedTrainingFrequency = (
  input: RecordedTrainingFrequencyDerivationInput,
): RecordedTrainingFrequencyDerivationResult => {
  const evaluatedAt = instant(input.evaluatedAt, 'evaluatedAt')
  const window = validateWindow(input.window)
  if (Date.parse(evaluatedAt) < Date.parse(window.endAt)) {
    throw new RangeError('evaluation cannot precede the complete observation window')
  }
  if (
    input.currentRevision &&
    Date.parse(evaluatedAt) <= Date.parse(input.currentRevision.changedAt)
  ) {
    throw new RangeError('evaluation must follow the current model revision')
  }

  const current = input.currentRevision
    ? personalModelItemRevisionSchema.parse(input.currentRevision)
    : null
  if (
    current &&
    (current.userId !== input.userId ||
      current.itemId !== input.ids.itemId ||
      current.snapshot.claimSchemaVersion !== 'recorded_training_frequency_behavior_v1')
  ) {
    throw new TypeError('current revision is not the owner recorded training frequency item')
  }

  const seenSources = new Set<string>()
  const seenWorkouts = new Set<string>()
  const workouts = input.workouts.map((workout) => {
    const workoutLocalDate = localDate(workout.localDate, 'workout localDate')
    const localDayOffset =
      (Date.parse(`${workoutLocalDate}T00:00:00.000Z`) -
        Date.parse(`${window.startDate}T00:00:00.000Z`)) /
      86_400_000
    if (
      !Number.isInteger(workout.revision) ||
      workout.revision < 1 ||
      !Number.isInteger(workout.weekIndex) ||
      workout.weekIndex < 0 ||
      workout.weekIndex >= window.completeWeeks ||
      localDateAt(workout.startedAt, window.timezone) !== workoutLocalDate ||
      localDayOffset < 0 ||
      localDayOffset >= window.completeWeeks * 7 ||
      Math.floor(localDayOffset / 7) !== workout.weekIndex ||
      Date.parse(workout.startedAt) < Date.parse(window.startAt) ||
      Date.parse(workout.startedAt) >= Date.parse(window.endAt)
    ) {
      throw new RangeError('workout evidence is outside its exact complete-week position')
    }
    const key = `${workout.workoutId}:${workout.revision}`
    if (seenSources.has(key)) throw new TypeError('workout evidence revisions must be unique')
    if (seenWorkouts.has(workout.workoutId)) {
      throw new TypeError('frequency evidence must contain one current revision per workout')
    }
    seenSources.add(key)
    seenWorkouts.add(workout.workoutId)
    return workout
  })

  const currentReferences =
    current?.snapshot.evidenceSet.references.filter(
      (reference): reference is WorkoutReference => reference.evidenceKind === 'workout_revision',
    ) ?? []
  const exactCurrent = new Map(
    currentReferences
      .filter((reference) => reference.qualification === 'eligible')
      .map((reference) => [`${reference.aggregateId}:${reference.aggregateRevision}`, reference]),
  )
  const pending = new Map(
    input.pendingWithdrawals.map((withdrawal) => [
      `${withdrawal.workoutId}:${withdrawal.withdrawnRevision}`,
      withdrawal,
    ]),
  )
  if (pending.size !== input.pendingWithdrawals.length) {
    throw new TypeError('pending workout withdrawals must be unique')
  }
  if (
    input.pendingWithdrawals.some(
      (withdrawal) => withdrawal.observedRevision <= withdrawal.withdrawnRevision,
    )
  ) {
    throw new RangeError('pending workout withdrawals must move source revisions forward')
  }

  const currentTerminal =
    current?.snapshot.status === 'invalidated' || current?.snapshot.status === 'superseded'
  if (currentTerminal) {
    if (pending.size === 0) return { outcome: 'no_op', currentRevision: current }

    const references = currentReferences.map((reference) => {
      if (reference.qualification === 'withdrawn') return reference
      const key = `${reference.aggregateId}:${reference.aggregateRevision}`
      const obligation = pending.get(key)
      if (!obligation) return reference
      pending.delete(key)
      return withdraw(reference, obligation.reason)
    })
    if (pending.size > 0) {
      throw new TypeError('terminal frequency behavior has unmatched source withdrawals')
    }
    const nextEvidenceFingerprint = evidenceFingerprint(input.sha256Hex, input.userId, references)
    const eligible = references.filter((reference) => reference.qualification === 'eligible')
    const snapshot = {
      ...current.snapshot,
      confidence: {
        ...current.snapshot.confidence,
        limitations: [
          ...current.snapshot.confidence.limitations,
          ...(current.snapshot.confidence.limitations.includes('source_withdrawn')
            ? []
            : (['source_withdrawn'] as const)),
        ],
      },
      evidenceSet: {
        ...current.snapshot.evidenceSet,
        policyVersion: recordedTrainingFrequencyEvidencePolicyVersion,
        asOf: evaluatedAt,
        window: { startAt: window.startAt, endAt: window.endAt, timezone: window.timezone },
        includedCount: eligible.length,
        supportingCount: eligible.filter((reference) => reference.role === 'supporting').length,
        contradictingCount: eligible.filter((reference) => reference.role === 'contradicting')
          .length,
        withdrawnCount: references.length - eligible.length,
        evidenceFingerprint: nextEvidenceFingerprint,
        references,
      },
      observedFrom: window.startAt,
      observedThrough: window.endAt,
      derivedAt: evaluatedAt,
      revision: current.revision + 1,
      updatedAt: evaluatedAt,
    }
    const revision = personalModelItemRevisionSchema.parse({
      schemaVersion: 'personal-model-item-revision-v1',
      id: input.ids.revisionId,
      userId: input.userId,
      itemId: input.ids.itemId,
      revision: current.revision + 1,
      previousRevision: current.revision,
      action: current.snapshot.status,
      snapshot,
      derivationFingerprint: derivationFingerprint(input.sha256Hex, snapshot),
      feedbackEventId: null,
      changedAt: evaluatedAt,
    })
    return { outcome: 'revised', cause: 'evidence_refreshed', revision }
  }

  if (window.completeWeeks === 0 || workouts.length === 0) {
    const receipt = unknownReceipt(input, window, evaluatedAt)
    if (current === null) return { outcome: 'unknown', receipt }

    const references = currentReferences.map((reference) => {
      if (reference.qualification === 'withdrawn') return reference
      const key = `${reference.aggregateId}:${reference.aggregateRevision}`
      const obligation = pending.get(key)
      if (obligation) pending.delete(key)
      return withdraw(reference, obligation?.reason ?? 'policy_changed')
    })
    if (pending.size > 0) {
      throw new TypeError('pending workout withdrawal does not match current eligible evidence')
    }
    const nextEvidenceFingerprint = evidenceFingerprint(input.sha256Hex, input.userId, references)
    const keepDispute = current.snapshot.feedbackState === 'disagreed'
    const snapshot = {
      ...current.snapshot,
      status: 'invalidated' as const,
      confidence: {
        policyVersion: 'personal-model-confidence-v1' as const,
        basis: 'longitudinal_observation' as const,
        level: 'insufficient' as const,
        qualifiedEvidenceCount: 0,
        distinctLocalDates: 0,
        completeWeeks: window.completeWeeks,
        comparedWindowCount: 0,
        stableWindowCount: 0,
        contradictingEvidenceCount: 0,
        latestEvidenceAt: null,
        limitations: [
          'limited_coverage' as const,
          'source_withdrawn' as const,
          ...(keepDispute ? (['user_disputed'] as const) : []),
        ],
      },
      evidenceSet: {
        policyVersion: recordedTrainingFrequencyEvidencePolicyVersion,
        ownerUserId: input.userId,
        asOf: evaluatedAt,
        window: { startAt: window.startAt, endAt: window.endAt, timezone: window.timezone },
        includedCount: 0,
        supportingCount: 0,
        contradictingCount: 0,
        withdrawnCount: references.length,
        evidenceFingerprint: nextEvidenceFingerprint,
        references,
      },
      validTo: evaluatedAt,
      observedFrom: window.startAt,
      observedThrough: window.endAt,
      derivedAt: evaluatedAt,
      revision: current.revision + 1,
      updatedAt: evaluatedAt,
    }
    const revision = personalModelItemRevisionSchema.parse({
      schemaVersion: 'personal-model-item-revision-v1',
      id: input.ids.revisionId,
      userId: input.userId,
      itemId: input.ids.itemId,
      revision: current.revision + 1,
      previousRevision: current.revision,
      action: 'invalidated',
      snapshot,
      derivationFingerprint: derivationFingerprint(input.sha256Hex, snapshot),
      feedbackEventId: null,
      changedAt: evaluatedAt,
    })
    return { outcome: 'revised', cause: 'evidence_refreshed', revision, unknownReceipt: receipt }
  }

  const sameWindow =
    current?.snapshot.claimSchemaVersion === 'recorded_training_frequency_behavior_v1' &&
    sameValue(current.snapshot.claim.observationWindow, {
      startDate: window.startDate,
      endDateExclusive: window.endDateExclusive,
      completeWeeks: window.completeWeeks,
      timezone: window.timezone,
    })
  const references: WorkoutReference[] = sameWindow
    ? currentReferences.filter((reference) => reference.qualification === 'withdrawn')
    : []

  for (const reference of exactCurrent.values()) {
    const key = `${reference.aggregateId}:${reference.aggregateRevision}`
    if (seenSources.has(key)) continue
    const obligation = pending.get(key)
    references.push(withdraw(reference, obligation?.reason ?? 'policy_changed'))
    if (obligation) pending.delete(key)
  }
  if (pending.size > 0) {
    throw new TypeError('pending workout withdrawal does not match current eligible evidence')
  }
  for (const workout of workouts) {
    const key = `${workout.workoutId}:${workout.revision}`
    references.push(
      workoutReference(input.userId, workout, exactCurrent.get(key)?.id ?? workout.referenceId),
    )
  }
  if (references.length > 800) throw new RangeError('frequency evidence exceeds 800 references')

  const weeklyCounts = Array.from({ length: window.completeWeeks }, () => 0)
  for (const workout of workouts) weeklyCounts[workout.weekIndex]! += 1
  if (weeklyCounts.some((count) => count > 100)) {
    throw new RangeError('a complete week cannot contain more than 100 recorded sessions')
  }
  const claim = {
    observationWindow: {
      startDate: window.startDate,
      endDateExclusive: window.endDateExclusive,
      completeWeeks: window.completeWeeks,
      timezone: window.timezone,
    },
    weeklyRecordedSessionCounts: weeklyCounts,
    qualifyingWorkoutCount: workouts.length,
    recordedWeekCount: weeklyCounts.filter((count) => count > 0).length,
    medianSessionsPerWeek: median(weeklyCounts),
    minimumSessionsPerWeek: Math.min(...weeklyCounts),
    maximumSessionsPerWeek: Math.max(...weeklyCounts),
    frequencyUnit: 'recorded_sessions_per_week' as const,
    medianPolicyVersion: 'numeric-median-v1' as const,
  }
  const nextEvidenceFingerprint = evidenceFingerprint(input.sha256Hex, input.userId, references)
  const evidenceMatches =
    current !== null &&
    current.snapshot.evidenceSet.policyVersion === recordedTrainingFrequencyEvidencePolicyVersion &&
    current.snapshot.evidenceSet.window.timezone === window.timezone &&
    current.snapshot.evidenceSet.window.startAt === window.startAt &&
    current.snapshot.evidenceSet.window.endAt === window.endAt &&
    current.snapshot.evidenceSet.evidenceFingerprint === nextEvidenceFingerprint
  const claimMatches =
    current?.snapshot.claimSchemaVersion === 'recorded_training_frequency_behavior_v1' &&
    sameValue(current.snapshot.claim, claim)
  if (
    current &&
    claimMatches &&
    evidenceMatches &&
    current.derivationFingerprint === derivationFingerprint(input.sha256Hex, current.snapshot)
  ) {
    return { outcome: 'no_op', currentRevision: current }
  }

  const active = window.completeWeeks >= 4 && workouts.length >= 6
  const semanticChanged = !claimMatches || !evidenceMatches
  const preserveDispute = semanticChanged && current?.snapshot.feedbackState === 'disagreed'
  const preserveTemporary =
    semanticChanged &&
    current?.snapshot.feedbackState === 'temporary' &&
    current.snapshot.validTo !== null &&
    Date.parse(current.snapshot.validTo) >= Date.parse(evaluatedAt)
  const feedbackState = semanticChanged
    ? preserveDispute
      ? 'disagreed'
      : preserveTemporary
        ? 'temporary'
        : 'unreviewed'
    : (current?.snapshot.feedbackState ?? 'unreviewed')
  const status = preserveDispute
    ? ('disputed' as const)
    : active
      ? ('active' as const)
      : ('candidate' as const)
  const limitations = [
    ...(active ? [] : (['limited_coverage'] as const)),
    'single_window' as const,
    ...(preserveDispute ? (['user_disputed'] as const) : []),
  ]
  const latestEvidenceAt = workouts.reduce(
    (latest, workout) =>
      Date.parse(workout.endedAt) > Date.parse(latest) ? workout.endedAt : latest,
    workouts[0]!.endedAt,
  )
  const evidenceSet = {
    policyVersion: recordedTrainingFrequencyEvidencePolicyVersion,
    ownerUserId: input.userId,
    asOf: evaluatedAt,
    window: { startAt: window.startAt, endAt: window.endAt, timezone: window.timezone },
    includedCount: workouts.length,
    supportingCount: workouts.length,
    contradictingCount: 0,
    withdrawnCount: references.length - workouts.length,
    evidenceFingerprint: nextEvidenceFingerprint,
    references,
  }
  const snapshot = {
    contractVersion: 'personal-model-contract-v1' as const,
    id: input.ids.itemId,
    userId: input.userId,
    kind: 'behavior' as const,
    subjectKey: 'training.recorded_frequency' as const,
    claimSchemaVersion: 'recorded_training_frequency_behavior_v1' as const,
    claim,
    source: 'deterministic_rule' as const,
    status,
    confidence: {
      policyVersion: 'personal-model-confidence-v1' as const,
      basis: 'longitudinal_observation' as const,
      level: active ? ('moderate' as const) : ('low' as const),
      qualifiedEvidenceCount: workouts.length,
      distinctLocalDates: new Set(workouts.map((workout) => workout.localDate)).size,
      completeWeeks: window.completeWeeks,
      comparedWindowCount: 0,
      stableWindowCount: 0,
      contradictingEvidenceCount: 0,
      latestEvidenceAt: instant(latestEvidenceAt, 'latest evidence'),
      limitations,
    },
    evidenceSet,
    validFrom: window.endAt,
    validTo: feedbackState === 'temporary' ? (current?.snapshot.validTo ?? null) : null,
    observedFrom: window.startAt,
    observedThrough: window.endAt,
    derivedAt: evaluatedAt,
    revision: current ? current.revision + 1 : 1,
    feedbackState,
    createdAt: current?.snapshot.createdAt ?? evaluatedAt,
    updatedAt: evaluatedAt,
  }
  const revision = personalModelItemRevisionSchema.parse({
    schemaVersion: 'personal-model-item-revision-v1',
    id: input.ids.revisionId,
    userId: input.userId,
    itemId: input.ids.itemId,
    revision: snapshot.revision,
    previousRevision: current?.revision ?? null,
    action: current ? 'evidence_accumulated' : 'created',
    snapshot,
    derivationFingerprint: derivationFingerprint(input.sha256Hex, snapshot),
    feedbackEventId: null,
    changedAt: evaluatedAt,
  })

  return current
    ? {
        outcome: 'revised',
        cause: semanticChanged ? 'evidence_refreshed' : 'content_reconciled',
        revision,
      }
    : { outcome: 'created', revision }
}
