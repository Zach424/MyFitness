import { weekdays } from './onboarding.constants'
import {
  personalModelConfidenceLevels,
  personalModelConfidenceLimitations,
  personalModelCurrentSubjectViewVersion,
  personalModelFeedbackStates,
  personalModelMaximumObservationWeeks,
  personalModelMaximumWorkoutEvidenceCount,
  personalModelStatuses,
  personalModelSubjectKeys,
} from './personal-model.constants'
import type { PersonalModelCurrentSubjectView } from './personal-model'

type JsonRecord = Record<string, unknown>

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const offsetDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
const localDatePattern = /^\d{4}-\d{2}-\d{2}$/

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasExactKeys = (value: JsonRecord, keys: readonly string[]) => {
  const actual = Object.keys(value)
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}

const isOneOf = <T extends string>(value: unknown, values: readonly T[]): value is T =>
  typeof value === 'string' && values.includes(value as T)

const isIntegerBetween = (value: unknown, minimum: number, maximum: number) =>
  typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum

const isFiniteBetween = (value: unknown, minimum: number, maximum: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum

const isOffsetDateTime = (value: unknown): value is string =>
  typeof value === 'string' &&
  offsetDateTimePattern.test(value) &&
  Number.isFinite(Date.parse(value))

const isLocalDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !localDatePattern.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}

const isIanaTimezone = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.trim() !== value || value.length < 1 || value.length > 64)
    return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0)
    return true
  } catch {
    return false
  }
}

const median = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

const isObservationWindow = (value: unknown) => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['startDate', 'endDateExclusive', 'completeWeeks', 'timezone']) ||
    !isLocalDate(value.startDate) ||
    !isLocalDate(value.endDateExclusive) ||
    !isIntegerBetween(value.completeWeeks, 1, personalModelMaximumObservationWeeks) ||
    !isIanaTimezone(value.timezone)
  )
    return false
  return (
    (Date.parse(`${value.endDateExclusive}T00:00:00.000Z`) -
      Date.parse(`${value.startDate}T00:00:00.000Z`)) /
      86_400_000 ===
    (value.completeWeeks as number) * 7
  )
}

const isAvailabilityClaim = (value: unknown) => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'availableDays',
      'sessionMinutes',
      'sourceGoalRevision',
      'durationUnit',
    ]) ||
    !Array.isArray(value.availableDays) ||
    value.availableDays.length < 1 ||
    value.availableDays.length > 7 ||
    !value.availableDays.every((day) => isOneOf(day, weekdays)) ||
    new Set(value.availableDays).size !== value.availableDays.length
  )
    return false
  return (
    isIntegerBetween(value.sessionMinutes, 15, 180) &&
    isIntegerBetween(value.sourceGoalRevision, 1, Number.MAX_SAFE_INTEGER) &&
    value.durationUnit === 'minutes'
  )
}

const isFrequencyClaim = (value: unknown) => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'observationWindow',
      'weeklyRecordedSessionCounts',
      'qualifyingWorkoutCount',
      'recordedWeekCount',
      'medianSessionsPerWeek',
      'minimumSessionsPerWeek',
      'maximumSessionsPerWeek',
      'frequencyUnit',
      'medianPolicyVersion',
    ]) ||
    !isObservationWindow(value.observationWindow) ||
    !Array.isArray(value.weeklyRecordedSessionCounts) ||
    value.weeklyRecordedSessionCounts.length < 1 ||
    value.weeklyRecordedSessionCounts.length > personalModelMaximumObservationWeeks ||
    !value.weeklyRecordedSessionCounts.every((count) => isIntegerBetween(count, 0, 100)) ||
    !isRecord(value.observationWindow)
  )
    return false
  const counts = value.weeklyRecordedSessionCounts as number[]
  return (
    counts.length === value.observationWindow.completeWeeks &&
    isIntegerBetween(value.qualifyingWorkoutCount, 1, personalModelMaximumWorkoutEvidenceCount) &&
    value.qualifyingWorkoutCount === counts.reduce((total, count) => total + count, 0) &&
    isIntegerBetween(value.recordedWeekCount, 1, personalModelMaximumObservationWeeks) &&
    value.recordedWeekCount === counts.filter((count) => count > 0).length &&
    isFiniteBetween(value.medianSessionsPerWeek, 0, 100) &&
    value.medianSessionsPerWeek === median(counts) &&
    isIntegerBetween(value.minimumSessionsPerWeek, 0, 100) &&
    value.minimumSessionsPerWeek === Math.min(...counts) &&
    isIntegerBetween(value.maximumSessionsPerWeek, 0, 100) &&
    value.maximumSessionsPerWeek === Math.max(...counts) &&
    value.frequencyUnit === 'recorded_sessions_per_week' &&
    value.medianPolicyVersion === 'numeric-median-v1'
  )
}

const isDurationClaim = (value: unknown) => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'observationWindow',
      'sampleCount',
      'coveredWeeks',
      'firstQuartileMinutes',
      'medianMinutes',
      'thirdQuartileMinutes',
      'durationUnit',
      'durationPolicyVersion',
      'quartilePolicyVersion',
    ]) ||
    !isObservationWindow(value.observationWindow) ||
    !isRecord(value.observationWindow)
  )
    return false
  return (
    isIntegerBetween(value.sampleCount, 1, personalModelMaximumWorkoutEvidenceCount) &&
    isIntegerBetween(value.coveredWeeks, 1, personalModelMaximumObservationWeeks) &&
    (value.coveredWeeks as number) <= (value.observationWindow.completeWeeks as number) &&
    isFiniteBetween(value.firstQuartileMinutes, Number.MIN_VALUE, 1_440) &&
    isFiniteBetween(value.medianMinutes, Number.MIN_VALUE, 1_440) &&
    isFiniteBetween(value.thirdQuartileMinutes, Number.MIN_VALUE, 1_440) &&
    (value.firstQuartileMinutes as number) <= (value.medianMinutes as number) &&
    (value.medianMinutes as number) <= (value.thirdQuartileMinutes as number) &&
    value.durationUnit === 'minutes' &&
    value.durationPolicyVersion === 'elapsed-duration-minutes-v1' &&
    value.quartilePolicyVersion === 'nearest-rank-quartiles-v1'
  )
}

const isConfidence = (value: unknown) => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['level', 'limitations']) ||
    !isOneOf(value.level, personalModelConfidenceLevels) ||
    !Array.isArray(value.limitations) ||
    value.limitations.length > personalModelConfidenceLimitations.length ||
    !value.limitations.every((limitation) =>
      isOneOf(limitation, personalModelConfidenceLimitations),
    )
  )
    return false
  return new Set(value.limitations).size === value.limitations.length
}

const isEvidence = (value: unknown) => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'asOf',
      'window',
      'qualifiedCount',
      'supportingCount',
      'contradictingCount',
      'withdrawnCount',
    ]) ||
    !isOffsetDateTime(value.asOf) ||
    !isRecord(value.window) ||
    !hasExactKeys(value.window, ['startAt', 'endAt', 'timezone']) ||
    !isOffsetDateTime(value.window.startAt) ||
    !isOffsetDateTime(value.window.endAt) ||
    !isIanaTimezone(value.window.timezone)
  )
    return false
  const counts = [
    value.qualifiedCount,
    value.supportingCount,
    value.contradictingCount,
    value.withdrawnCount,
  ]
  return (
    counts.every((count) => isIntegerBetween(count, 0, personalModelMaximumWorkoutEvidenceCount)) &&
    Date.parse(value.window.endAt) > Date.parse(value.window.startAt) &&
    Date.parse(value.asOf) >= Date.parse(value.window.endAt) &&
    (value.supportingCount as number) + (value.contradictingCount as number) <=
      (value.qualifiedCount as number)
  )
}

const currentKeys = [
  'itemId',
  'generation',
  'revision',
  'status',
  'feedbackState',
  'terminal',
  'confidence',
  'evidence',
  'validFrom',
  'validTo',
  'observedFrom',
  'observedThrough',
  'derivedAt',
  'updatedAt',
  'kind',
  'claimSchemaVersion',
  'source',
  'claim',
] as const

const isCurrent = (subjectKey: string, value: unknown) => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, currentKeys) ||
    typeof value.itemId !== 'string' ||
    !uuidPattern.test(value.itemId) ||
    !isIntegerBetween(value.generation, 1, Number.MAX_SAFE_INTEGER) ||
    !isIntegerBetween(value.revision, 1, Number.MAX_SAFE_INTEGER) ||
    !isOneOf(value.status, personalModelStatuses) ||
    !isOneOf(value.feedbackState, personalModelFeedbackStates) ||
    typeof value.terminal !== 'boolean' ||
    !isConfidence(value.confidence) ||
    !isEvidence(value.evidence) ||
    !isOffsetDateTime(value.validFrom) ||
    !(value.validTo === null || isOffsetDateTime(value.validTo)) ||
    !isOffsetDateTime(value.observedFrom) ||
    !isOffsetDateTime(value.observedThrough) ||
    !isOffsetDateTime(value.derivedAt) ||
    !isOffsetDateTime(value.updatedAt) ||
    !isRecord(value.confidence) ||
    !isRecord(value.evidence) ||
    !isRecord(value.evidence.window)
  )
    return false

  const terminal = value.status === 'superseded' || value.status === 'invalidated'
  if (
    value.terminal !== terminal ||
    (terminal && value.validTo === null) ||
    Date.parse(value.observedThrough) < Date.parse(value.observedFrom) ||
    value.observedFrom !== value.evidence.window.startAt ||
    value.observedThrough !== value.evidence.window.endAt ||
    value.derivedAt !== value.evidence.asOf ||
    Date.parse(value.updatedAt) < Date.parse(value.derivedAt) ||
    (value.status === 'active' &&
      !['moderate', 'high'].includes(value.confidence.level as string)) ||
    (value.status === 'candidate' &&
      !['insufficient', 'low'].includes(value.confidence.level as string)) ||
    (value.status === 'disputed' &&
      !(value.confidence.limitations as unknown[]).includes('user_disputed'))
  )
    return false

  if (value.claimSchemaVersion === 'training_availability_constraint_v1') {
    return (
      subjectKey === 'training.availability' &&
      value.kind === 'constraint' &&
      value.source === 'user_confirmed' &&
      isAvailabilityClaim(value.claim)
    )
  }
  if (value.claimSchemaVersion === 'recorded_training_frequency_behavior_v1') {
    return (
      subjectKey === 'training.recorded_frequency' &&
      value.kind === 'behavior' &&
      value.source === 'deterministic_rule' &&
      isFrequencyClaim(value.claim)
    )
  }
  if (value.claimSchemaVersion === 'recorded_session_duration_baseline_v1') {
    return (
      subjectKey === 'training.recorded_session_duration' &&
      value.kind === 'baseline' &&
      value.source === 'deterministic_rule' &&
      isDurationClaim(value.claim)
    )
  }
  return false
}

export const isPersonalModelCurrentSubjectView = (
  value: unknown,
): value is PersonalModelCurrentSubjectView => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['schemaVersion', 'subjectKey', 'current']) ||
    value.schemaVersion !== personalModelCurrentSubjectViewVersion ||
    !isOneOf(value.subjectKey, personalModelSubjectKeys)
  )
    return false
  return value.current === null || isCurrent(value.subjectKey, value.current)
}
