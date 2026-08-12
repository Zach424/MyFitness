import { createHash, randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

import { Injectable } from '@nestjs/common'
import {
  onboardingGoalRevisionSnapshotSchema,
  personalModelCurrentSubjectEnvelopeSchema,
  personalModelCurrentSubjectEnvelopeVersion,
  personalModelFeedbackEventSchema,
  personalModelFeedbackTransitionResultSchema,
  personalModelFeedbackTransitionVersion,
  personalModelFeedbackWriteRequestSchema,
  personalModelItemSchema,
  personalModelItemRevisionSchema,
  workoutSchema,
  type PersonalModelFeedbackEvent,
  type PersonalModelFeedbackTransitionResult,
  type PersonalModelFeedbackWriteRequest,
  type PersonalModelCurrentSubjectEnvelope,
  type PersonalModelItem,
  type PersonalModelItemRevision,
  type PersonalModelSubjectKey,
} from '@myfitness/contracts'
import type { PoolClient } from 'pg'

import { DatabaseService } from '../database/database.service'
import { applyPersonalModelFeedback } from './personal-model-feedback'
import {
  deriveRecordedSessionDuration,
  type RecordedSessionDurationDerivationResult,
} from './personal-model-recorded-session-duration'
import {
  deriveRecordedTrainingFrequency,
  type RecordedTrainingFrequencyDerivationResult,
} from './personal-model-recorded-training-frequency'
import {
  deriveTrainingAvailability,
  type TrainingAvailabilityDerivationResult,
} from './personal-model-training-availability'

type PersonalModelRevisionRow = {
  id: string
  user_id: string
  item_id: string
  schema_version: string
  revision: number
  previous_revision: number | null
  action: string
  snapshot: unknown
  derivation_fingerprint: string
  feedback_event_id: string | null
  changed_at: Date
}

type PersonalModelItemPointerRow = {
  current_revision: number
}

type PersonalModelCurrentSubjectRow = {
  authority_user_id: string
  current_item_id: string | null
  generation: number | null
  predecessor_item_id: string | null
  retired_at: Date | null
  revision_id: string | null
  revision_user_id: string | null
  revision_item_id: string | null
  revision_schema_version: string | null
  revision: number | null
  previous_revision: number | null
  action: string | null
  snapshot: unknown | null
  derivation_fingerprint: string | null
  feedback_event_id: string | null
  changed_at: Date | null
}

type PersonalModelFeedbackEventRow = {
  id: string
  user_id: string
  item_id: string
  item_revision: number
  choice: PersonalModelFeedbackEvent['choice']
  reason_code: PersonalModelFeedbackEvent['reasonCode']
  note: string | null
  context_valid_until: Date | null
  created_at: Date
  transition_schema_version: string
  outcome: PersonalModelFeedbackTransitionResult['outcome']
  no_op_reason: 'feedback_already_current' | null
  result_revision: number | null
  result_fingerprint: string
}

type TrainingAvailabilityProfileRow = {
  timezone: string
  revision: number
}

type TrainingAvailabilityGoalRow = {
  snapshot: unknown
}

type TrainingAvailabilityItemRow = {
  id: string
  generation: number
}

type TrainingAvailabilityPendingRequestRow = {
  affected_item_revision: number
  evidence_kind: string
  source_aggregate_id: string
  withdrawn_source_revision: number
  observed_source_revision: number
  reason: string
}

type TrainingAvailabilityEvaluationRow = {
  evaluated_at: Date
}

type RecordedTrainingFrequencyItemRow = {
  id: string
  generation: number
}

type RecordedTrainingFrequencyPendingRequestRow = {
  evidence_kind: string
  source_aggregate_id: string
  withdrawn_source_revision: number
  observed_source_revision: number
  reason: string
}

type RecordedTrainingFrequencyObservationRow = {
  evaluated_at: Date
  timezone: string
  start_date: string
  end_date_exclusive: string
  complete_weeks: number
  start_at: Date
  end_at: Date
  workouts: unknown
}

type RecordedTrainingFrequencyWorkoutRow = {
  snapshot: unknown
  localDate: string
  weekIndex: number
}

type RecordedSessionDurationItemRow = RecordedTrainingFrequencyItemRow
type RecordedSessionDurationPendingRequestRow = RecordedTrainingFrequencyPendingRequestRow
type RecordedSessionDurationObservationRow = RecordedTrainingFrequencyObservationRow
type RecordedSessionDurationWorkoutRow = RecordedTrainingFrequencyWorkoutRow

const maximumHistoryPageSize = 50
const sha256Hex = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')

const canonicalizeDateTime = (value: string): string => new Date(value).toISOString()

const normalizePersonalModelItemDateTimes = (item: PersonalModelItem): PersonalModelItem =>
  personalModelItemSchema.parse({
    ...item,
    confidence:
      item.confidence.basis === 'longitudinal_observation'
        ? {
            ...item.confidence,
            latestEvidenceAt:
              item.confidence.latestEvidenceAt === null
                ? null
                : canonicalizeDateTime(item.confidence.latestEvidenceAt),
          }
        : item.confidence,
    evidenceSet: {
      ...item.evidenceSet,
      asOf: canonicalizeDateTime(item.evidenceSet.asOf),
      window: {
        ...item.evidenceSet.window,
        startAt: canonicalizeDateTime(item.evidenceSet.window.startAt),
        endAt: canonicalizeDateTime(item.evidenceSet.window.endAt),
      },
      references: item.evidenceSet.references.map((reference) => ({
        ...reference,
        time:
          reference.time.kind === 'instant'
            ? {
                kind: 'instant' as const,
                occurredAt: canonicalizeDateTime(reference.time.occurredAt),
              }
            : {
                ...reference.time,
                startedAt: canonicalizeDateTime(reference.time.startedAt),
                endedAt: canonicalizeDateTime(reference.time.endedAt),
              },
      })),
    },
    validFrom: canonicalizeDateTime(item.validFrom),
    validTo: item.validTo === null ? null : canonicalizeDateTime(item.validTo),
    observedFrom: canonicalizeDateTime(item.observedFrom),
    observedThrough: canonicalizeDateTime(item.observedThrough),
    derivedAt: canonicalizeDateTime(item.derivedAt),
    createdAt: canonicalizeDateTime(item.createdAt),
    updatedAt: canonicalizeDateTime(item.updatedAt),
  })

const normalizeRevisionDateTimes = (
  revision: PersonalModelItemRevision,
): PersonalModelItemRevision => {
  const changedAt = canonicalizeDateTime(revision.changedAt)
  return personalModelItemRevisionSchema.parse({
    ...revision,
    snapshot: {
      ...normalizePersonalModelItemDateTimes(revision.snapshot),
      updatedAt: changedAt,
    },
    changedAt,
  })
}

const mapRevisionRow = (row: PersonalModelRevisionRow): PersonalModelItemRevision => {
  const snapshot = personalModelItemSchema.parse(row.snapshot)
  if (Date.parse(snapshot.updatedAt) !== row.changed_at.getTime()) {
    throw new Error('personal model revision time does not match its snapshot')
  }
  return personalModelItemRevisionSchema.parse({
    schemaVersion: row.schema_version,
    id: row.id,
    userId: row.user_id,
    itemId: row.item_id,
    revision: row.revision,
    previousRevision: row.previous_revision,
    action: row.action,
    snapshot,
    derivationFingerprint: row.derivation_fingerprint.trim(),
    feedbackEventId: row.feedback_event_id,
    changedAt: snapshot.updatedAt,
  })
}

const lockCurrentRevision = async (
  client: PoolClient,
  userId: string,
  itemId: string,
): Promise<{ currentRevision: number; revision: PersonalModelItemRevision }> => {
  const itemResult = await client.query<PersonalModelItemPointerRow>(
    `
      SELECT current_revision
      FROM personal_model_items
      WHERE user_id = $1 AND id = $2
      FOR UPDATE
    `,
    [userId, itemId],
  )
  const item = itemResult.rows[0]
  if (!item) throw new PersonalModelItemNotFoundError()

  const revisionResult = await client.query<PersonalModelRevisionRow>(
    `
      SELECT *
      FROM personal_model_item_revisions
      WHERE user_id = $1 AND item_id = $2 AND revision = $3
    `,
    [userId, itemId, item.current_revision],
  )
  const revision = revisionResult.rows[0]
  if (!revision) throw new Error('personal model current revision is missing')
  return { currentRevision: item.current_revision, revision: mapRevisionRow(revision) }
}

const insertEvidenceReferences = async (
  client: PoolClient,
  revision: PersonalModelItemRevision,
): Promise<void> => {
  await client.query(
    `
      INSERT INTO personal_model_evidence_refs (
        user_id, item_id, item_revision, ordinal,
        reference_id, evidence_kind, aggregate_id, aggregate_revision,
        role, source_kind, qualification, withdrawn_reason, reference
      )
      SELECT
        $1, $2, $3, evidence.ordinality::INTEGER,
        (evidence.reference ->> 'id')::UUID,
        evidence.reference ->> 'evidenceKind',
        (evidence.reference ->> 'aggregateId')::UUID,
        (evidence.reference ->> 'aggregateRevision')::INTEGER,
        evidence.reference ->> 'role',
        evidence.reference ->> 'sourceKind',
        evidence.reference ->> 'qualification',
        evidence.reference ->> 'withdrawnReason',
        evidence.reference
      FROM jsonb_array_elements($4::JSONB)
        WITH ORDINALITY AS evidence(reference, ordinality)
    `,
    [
      revision.userId,
      revision.itemId,
      revision.revision,
      JSON.stringify(revision.snapshot.evidenceSet.references),
    ],
  )

  await client.query(
    `
      INSERT INTO personal_model_source_refresh_resolutions (
        request_id, user_id, item_id, resolved_item_revision,
        withdrawn_reference_id, resolved_at
      )
      SELECT
        request.id,
        request.user_id,
        request.item_id,
        $3,
        evidence.reference_id,
        $4
      FROM personal_model_source_refresh_requests AS request
      JOIN personal_model_evidence_refs AS evidence
        ON evidence.user_id = request.user_id
       AND evidence.item_id = request.item_id
       AND evidence.item_revision = $3
       AND evidence.evidence_kind = request.evidence_kind
       AND evidence.aggregate_id = request.source_aggregate_id
       AND evidence.aggregate_revision = request.withdrawn_source_revision
       AND evidence.qualification = 'withdrawn'
       AND evidence.withdrawn_reason = request.reason
      LEFT JOIN personal_model_source_refresh_resolutions AS resolution
        ON resolution.request_id = request.id
      WHERE request.user_id = $1
        AND request.item_id = $2
        AND request.affected_item_revision < $3
        AND resolution.request_id IS NULL
      ON CONFLICT (request_id) DO NOTHING
    `,
    [revision.userId, revision.itemId, revision.revision, revision.changedAt],
  )
}

const insertRevision = async (
  client: PoolClient,
  revision: PersonalModelItemRevision,
): Promise<PersonalModelItemRevision> => {
  const result = await client.query<PersonalModelRevisionRow>(
    `
      INSERT INTO personal_model_item_revisions (
        id, user_id, item_id, subject_key, schema_version, revision,
        previous_revision, action, snapshot, derivation_fingerprint,
        feedback_event_id, changed_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9::jsonb, $10,
        $11, $12
      )
      RETURNING *
    `,
    [
      revision.id,
      revision.userId,
      revision.itemId,
      revision.snapshot.subjectKey,
      revision.schemaVersion,
      revision.revision,
      revision.previousRevision,
      revision.action,
      JSON.stringify(revision.snapshot),
      revision.derivationFingerprint,
      revision.feedbackEventId,
      revision.changedAt,
    ],
  )

  const stored = result.rows[0]
  if (!stored) throw new Error('personal model revision insert returned no row')
  await insertEvidenceReferences(client, revision)
  return mapRevisionRow(stored)
}

const retireGenerationAndInsertSuccessor = async (
  client: PoolClient,
  input: {
    userId: string
    subjectKey: PersonalModelItem['subjectKey']
    predecessorItemId: string
    predecessorGeneration: number
    predecessorRevision: number
    revision: PersonalModelItemRevision
  },
) => {
  const retired = await client.query(
    `
      UPDATE personal_model_items
      SET retired_at = $1, updated_at = $1
      WHERE user_id = $2
        AND id = $3
        AND subject_key = $4
        AND generation = $5
        AND current_revision = $6
        AND retired_at IS NULL
    `,
    [
      input.revision.changedAt,
      input.userId,
      input.predecessorItemId,
      input.subjectKey,
      input.predecessorGeneration,
      input.predecessorRevision,
    ],
  )
  if (retired.rowCount !== 1) throw new PersonalModelRevisionConflictError()

  await client.query(
    `
      INSERT INTO personal_model_items (
        id, user_id, subject_key, current_revision,
        generation, predecessor_item_id,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, 1, $4, $5, $6, $6)
    `,
    [
      input.revision.itemId,
      input.userId,
      input.subjectKey,
      input.predecessorGeneration + 1,
      input.predecessorItemId,
      input.revision.changedAt,
    ],
  )
  return insertRevision(client, input.revision)
}

const mapFeedbackEventRow = (
  row: PersonalModelFeedbackEventRow,
  contextValidUntil = row.context_valid_until?.toISOString() ?? null,
): PersonalModelFeedbackEvent =>
  personalModelFeedbackEventSchema.parse({
    id: row.id,
    userId: row.user_id,
    itemId: row.item_id,
    itemRevision: row.item_revision,
    choice: row.choice,
    reasonCode: row.reason_code,
    note: row.note,
    contextValidUntil,
    createdAt: row.created_at.toISOString(),
  })

const contextValidUntilForSnapshot = (
  row: PersonalModelFeedbackEventRow,
  item: PersonalModelItem,
): string | null => {
  if (row.choice !== 'temporary_context') return null
  if (
    row.context_valid_until === null ||
    item.validTo === null ||
    row.context_valid_until.getTime() !== Date.parse(item.validTo)
  ) {
    throw new Error('personal model temporary feedback validity does not match its result')
  }
  return item.validTo
}

const normalizeFeedbackTransitionDateTimes = (
  transition: PersonalModelFeedbackTransitionResult,
): PersonalModelFeedbackTransitionResult => {
  const event = personalModelFeedbackEventSchema.parse({
    ...transition.event,
    contextValidUntil:
      transition.event.contextValidUntil === null
        ? null
        : canonicalizeDateTime(transition.event.contextValidUntil),
    createdAt: canonicalizeDateTime(transition.event.createdAt),
  })

  if (transition.outcome === 'no_op') {
    return personalModelFeedbackTransitionResultSchema.parse({
      ...transition,
      event,
      currentItem: normalizePersonalModelItemDateTimes(transition.currentItem),
    })
  }

  return personalModelFeedbackTransitionResultSchema.parse({
    ...transition,
    event,
    previousItem: normalizePersonalModelItemDateTimes(transition.previousItem),
    revision: normalizeRevisionDateTimes(transition.revision),
  })
}

const findPersistedFeedbackTransition = async (
  client: PoolClient,
  userId: string,
  itemId: string,
  eventId: string,
): Promise<PersonalModelFeedbackTransitionResult | null> => {
  const eventResult = await client.query<PersonalModelFeedbackEventRow>(
    `
      SELECT *
      FROM personal_model_feedback_events
      WHERE id = $1 AND user_id = $2 AND item_id = $3
    `,
    [eventId, userId, itemId],
  )
  const eventRow = eventResult.rows[0]
  if (!eventRow) return null

  const targetResult = await client.query<PersonalModelRevisionRow>(
    `
      SELECT *
      FROM personal_model_item_revisions
      WHERE user_id = $1 AND item_id = $2 AND revision = $3
    `,
    [userId, itemId, eventRow.item_revision],
  )
  const targetRow = targetResult.rows[0]
  if (!targetRow) throw new Error('personal model feedback target revision is missing')

  const targetItem = mapRevisionRow(targetRow).snapshot
  if (eventRow.outcome === 'no_op') {
    const event = mapFeedbackEventRow(eventRow, contextValidUntilForSnapshot(eventRow, targetItem))
    return personalModelFeedbackTransitionResultSchema.parse({
      schemaVersion: eventRow.transition_schema_version,
      outcome: 'no_op',
      event,
      currentItem: targetItem,
      reason: eventRow.no_op_reason,
      resultFingerprint: eventRow.result_fingerprint.trim(),
    })
  }

  const revisionResult = await client.query<PersonalModelRevisionRow>(
    `
      SELECT *
      FROM personal_model_item_revisions
      WHERE user_id = $1 AND item_id = $2 AND revision = $3
    `,
    [userId, itemId, eventRow.result_revision],
  )
  const revisionRow = revisionResult.rows[0]
  if (!revisionRow) throw new Error('personal model feedback result revision is missing')
  const revision = mapRevisionRow(revisionRow)
  const event = mapFeedbackEventRow(
    eventRow,
    contextValidUntilForSnapshot(eventRow, revision.snapshot),
  )

  return personalModelFeedbackTransitionResultSchema.parse({
    schemaVersion: eventRow.transition_schema_version,
    outcome: 'revised',
    event,
    previousItem: targetItem,
    revision,
  })
}

const sameFeedbackWriteRequest = (
  transition: PersonalModelFeedbackTransitionResult,
  expectedRevision: number,
  request: PersonalModelFeedbackWriteRequest,
) =>
  transition.event.itemRevision === expectedRevision &&
  transition.event.choice === request.choice &&
  transition.event.reasonCode === request.reasonCode &&
  transition.event.note === request.note &&
  (transition.event.contextValidUntil === request.contextValidUntil ||
    (transition.event.contextValidUntil !== null &&
      request.contextValidUntil !== null &&
      Date.parse(transition.event.contextValidUntil) === Date.parse(request.contextValidUntil)))

const persistFeedbackTransition = async (
  client: PoolClient,
  userId: string,
  itemId: string,
  transition: PersonalModelFeedbackTransitionResult,
) => {
  const resultRevision = transition.outcome === 'revised' ? transition.revision.revision : null
  const resultFingerprint =
    transition.outcome === 'revised'
      ? transition.revision.derivationFingerprint
      : transition.resultFingerprint
  const noOpReason = transition.outcome === 'no_op' ? transition.reason : null
  await client.query(
    `
      INSERT INTO personal_model_feedback_events (
        id, user_id, item_id, item_revision, choice, reason_code, note,
        context_valid_until, created_at, transition_schema_version,
        outcome, no_op_reason, result_revision, result_fingerprint
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10,
        $11, $12, $13, $14
      )
    `,
    [
      transition.event.id,
      transition.event.userId,
      transition.event.itemId,
      transition.event.itemRevision,
      transition.event.choice,
      transition.event.reasonCode,
      transition.event.note,
      transition.event.contextValidUntil,
      transition.event.createdAt,
      personalModelFeedbackTransitionVersion,
      transition.outcome,
      noOpReason,
      resultRevision,
      resultFingerprint,
    ],
  )

  if (transition.outcome === 'no_op') return transition

  const stored = await insertRevision(client, transition.revision)
  const updated = await client.query(
    `
      UPDATE personal_model_items
      SET current_revision = $1, updated_at = $2
      WHERE user_id = $3 AND id = $4 AND current_revision = $5
    `,
    [stored.revision, stored.changedAt, userId, itemId, transition.event.itemRevision],
  )
  if (updated.rowCount !== 1) throw new PersonalModelRevisionConflictError()
  return transition
}

const isPostgresError = (error: unknown): error is { code: string } =>
  typeof error === 'object' && error !== null && 'code' in error

export class PersonalModelItemNotFoundError extends Error {
  constructor() {
    super('personal model item not found')
    this.name = 'PersonalModelItemNotFoundError'
  }
}

export class PersonalModelRevisionConflictError extends Error {
  constructor(message = 'personal model revision conflict') {
    super(message)
    this.name = 'PersonalModelRevisionConflictError'
  }
}

export class PersonalModelFeedbackAuthorityNotFoundError extends Error {
  constructor() {
    super('active personal model feedback authority not found')
    this.name = 'PersonalModelFeedbackAuthorityNotFoundError'
  }
}

export class PersonalModelSubjectAuthorityNotFoundError extends Error {
  constructor() {
    super('active personal model subject owner not found')
    this.name = 'PersonalModelSubjectAuthorityNotFoundError'
  }
}

export class TrainingAvailabilitySourceNotFoundError extends Error {
  constructor() {
    super('current onboarding goal source not found')
    this.name = 'TrainingAvailabilitySourceNotFoundError'
  }
}

export class RecordedTrainingFrequencyAuthorityNotFoundError extends Error {
  constructor() {
    super('recorded training frequency observation authority not found')
    this.name = 'RecordedTrainingFrequencyAuthorityNotFoundError'
  }
}

export class RecordedSessionDurationAuthorityNotFoundError extends Error {
  constructor() {
    super('recorded session duration observation authority not found')
    this.name = 'RecordedSessionDurationAuthorityNotFoundError'
  }
}

@Injectable()
export class PersonalModelRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(input: PersonalModelItemRevision): Promise<PersonalModelItemRevision> {
    const revision = personalModelItemRevisionSchema.parse(input)

    try {
      return await this.database.withTransaction(async (client) => {
        await client.query(
          `
            INSERT INTO personal_model_items (
              id, user_id, subject_key, current_revision, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            revision.itemId,
            revision.userId,
            revision.snapshot.subjectKey,
            revision.revision,
            revision.snapshot.createdAt,
            revision.changedAt,
          ],
        )
        return insertRevision(client, revision)
      })
    } catch (error) {
      if (isPostgresError(error) && error.code === '23505') {
        throw new PersonalModelRevisionConflictError(
          'personal model item identity or subject already exists',
        )
      }
      throw error
    }
  }

  async append(
    userId: string,
    itemId: string,
    expectedRevision: number,
    input: PersonalModelItemRevision,
  ): Promise<PersonalModelItemRevision> {
    const revision = personalModelItemRevisionSchema.parse(input)
    if (revision.feedbackEventId !== null) {
      throw new PersonalModelRevisionConflictError(
        'feedback revisions must use the feedback application transaction',
      )
    }
    if (
      revision.userId !== userId ||
      revision.itemId !== itemId ||
      revision.previousRevision !== expectedRevision ||
      revision.revision !== expectedRevision + 1
    ) {
      throw new PersonalModelRevisionConflictError('revision target does not match request')
    }

    return this.database.withTransaction(async (client) => {
      const locked = await lockCurrentRevision(client, userId, itemId)
      if (locked.currentRevision !== expectedRevision) {
        throw new PersonalModelRevisionConflictError(
          `personal model revision changed; current revision is ${locked.currentRevision}`,
        )
      }

      const current = locked.revision
      if (revision.snapshot.createdAt !== current.snapshot.createdAt) {
        throw new PersonalModelRevisionConflictError('item creation time cannot change')
      }
      if (Date.parse(revision.changedAt) < Date.parse(current.changedAt)) {
        throw new PersonalModelRevisionConflictError('revision time cannot move backward')
      }

      const stored = await insertRevision(client, revision)
      const updated = await client.query(
        `
          UPDATE personal_model_items
          SET current_revision = $1, updated_at = $2
          WHERE user_id = $3 AND id = $4 AND current_revision = $5
        `,
        [revision.revision, revision.changedAt, userId, itemId, expectedRevision],
      )
      if (updated.rowCount !== 1) {
        throw new PersonalModelRevisionConflictError()
      }
      return stored
    })
  }

  async applyFeedback(
    userId: string,
    itemId: string,
    input: PersonalModelFeedbackTransitionResult,
  ): Promise<PersonalModelFeedbackTransitionResult> {
    const transition = personalModelFeedbackTransitionResultSchema.parse(input)
    if (transition.event.userId !== userId || transition.event.itemId !== itemId) {
      throw new PersonalModelRevisionConflictError('feedback target does not match request')
    }

    return this.database.withTransaction(async (client) => {
      const locked = await lockCurrentRevision(client, userId, itemId)

      const persisted = await findPersistedFeedbackTransition(
        client,
        userId,
        itemId,
        transition.event.id,
      )
      if (persisted) {
        if (
          isDeepStrictEqual(
            normalizeFeedbackTransitionDateTimes(persisted),
            normalizeFeedbackTransitionDateTimes(transition),
          )
        ) {
          return transition
        }
        throw new PersonalModelRevisionConflictError('feedback event id is already in use')
      }

      const current = locked.revision
      const targetItem =
        transition.outcome === 'revised' ? transition.previousItem : transition.currentItem
      if (
        locked.currentRevision !== transition.event.itemRevision ||
        !isDeepStrictEqual(current.snapshot, targetItem)
      ) {
        throw new PersonalModelRevisionConflictError('feedback target is no longer current')
      }
      return persistFeedbackTransition(client, userId, itemId, transition)
    })
  }

  async applyFeedbackCommand(
    userId: string,
    itemId: string,
    expectedRevision: number,
    input: PersonalModelFeedbackWriteRequest,
    acceptedAt: string,
  ): Promise<PersonalModelFeedbackTransitionResult> {
    const request = personalModelFeedbackWriteRequestSchema.parse(input)
    try {
      return await this.database.withTransaction(async (client) => {
        const owner = await client.query(
          "SELECT id FROM users WHERE id = $1 AND status = 'active' FOR SHARE",
          [userId],
        )
        if (!owner.rows[0]) throw new PersonalModelFeedbackAuthorityNotFoundError()

        const locked = await lockCurrentRevision(client, userId, itemId)
        const persisted = await findPersistedFeedbackTransition(
          client,
          userId,
          itemId,
          request.eventId,
        )
        if (persisted) {
          if (sameFeedbackWriteRequest(persisted, expectedRevision, request)) return persisted
          throw new PersonalModelRevisionConflictError('feedback event id is already in use')
        }
        if (locked.currentRevision !== expectedRevision) {
          throw new PersonalModelRevisionConflictError('feedback target is no longer current')
        }
        if (
          locked.revision.snapshot.status === 'superseded' ||
          locked.revision.snapshot.status === 'invalidated'
        ) {
          throw new PersonalModelRevisionConflictError('terminal personal model item')
        }
        if (Date.parse(acceptedAt) < Date.parse(locked.revision.changedAt)) {
          throw new PersonalModelRevisionConflictError('feedback acceptance time precedes target')
        }
        if (
          request.contextValidUntil !== null &&
          Date.parse(request.contextValidUntil) <= Date.parse(acceptedAt)
        ) {
          throw new PersonalModelRevisionConflictError('temporary feedback validity has expired')
        }

        const transition = applyPersonalModelFeedback({
          current: locked.revision,
          request,
          acceptedAt,
          revisionId: randomUUID(),
          sha256Hex: (value) => createHash('sha256').update(value).digest('hex'),
        })
        return persistFeedbackTransition(client, userId, itemId, transition)
      })
    } catch (error) {
      if (isPostgresError(error) && error.code === '23505') {
        throw new PersonalModelRevisionConflictError('feedback event id is already in use')
      }
      throw error
    }
  }

  async refreshTrainingAvailability(userId: string): Promise<TrainingAvailabilityDerivationResult> {
    try {
      return await this.database.withTransaction(async (client) => {
        const owner = await client.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [userId])
        if (!owner.rows[0]) throw new TrainingAvailabilitySourceNotFoundError()

        const profileResult = await client.query<TrainingAvailabilityProfileRow>(
          `
            SELECT timezone, revision
            FROM user_profiles
            WHERE user_id = $1
            FOR SHARE
          `,
          [userId],
        )
        const profile = profileResult.rows[0]
        if (!profile) throw new TrainingAvailabilitySourceNotFoundError()

        const goalResult = await client.query<TrainingAvailabilityGoalRow>(
          `
            SELECT history.snapshot
            FROM user_goals AS goal
            JOIN user_goal_revisions AS history
              ON history.user_id = goal.user_id
             AND history.goal_id = goal.goal_id
             AND history.revision = goal.revision
            WHERE goal.user_id = $1 AND goal.revision = $2
            FOR SHARE OF goal
          `,
          [userId, profile.revision],
        )
        const goalRow = goalResult.rows[0]
        if (!goalRow) throw new TrainingAvailabilitySourceNotFoundError()
        const goalRevision = onboardingGoalRevisionSnapshotSchema.parse(goalRow.snapshot)

        const itemResult = await client.query<TrainingAvailabilityItemRow>(
          `
            SELECT id, generation
            FROM personal_model_items
            WHERE user_id = $1 AND subject_key = 'training.availability'
              AND retired_at IS NULL
          `,
          [userId],
        )
        const itemId = itemResult.rows[0]?.id ?? randomUUID()
        const current = itemResult.rows[0]
          ? (await lockCurrentRevision(client, userId, itemId)).revision
          : null

        const pendingRequests =
          current === null
            ? []
            : (
                await client.query<TrainingAvailabilityPendingRequestRow>(
                  `
                    SELECT
                      request.affected_item_revision,
                      request.evidence_kind,
                      request.source_aggregate_id,
                      request.withdrawn_source_revision,
                      request.observed_source_revision,
                      request.reason
                    FROM personal_model_source_refresh_requests AS request
                    LEFT JOIN personal_model_source_refresh_resolutions AS resolution
                      ON resolution.request_id = request.id
                    WHERE request.user_id = $1
                      AND request.item_id = $2
                      AND resolution.request_id IS NULL
                    ORDER BY request.created_at, request.id
                  `,
                  [userId, itemId],
                )
              ).rows

        const evaluationResult = await client.query<TrainingAvailabilityEvaluationRow>(
          `
            SELECT GREATEST(
              clock_timestamp(),
              $1::timestamptz + INTERVAL '1 millisecond',
              COALESCE(
                $2::timestamptz + INTERVAL '1 millisecond',
                '-infinity'::timestamptz
              )
            ) AS evaluated_at
          `,
          [goalRevision.changedAt, current?.changedAt ?? null],
        )
        const evaluatedAt = evaluationResult.rows[0]?.evaluated_at.toISOString()
        if (!evaluatedAt) throw new Error('training availability evaluation time is missing')

        const terminal =
          current?.snapshot.status === 'invalidated' || current?.snapshot.status === 'superseded'
        const currentGoalIsNovel =
          terminal &&
          !current.snapshot.evidenceSet.references.some(
            (reference) =>
              reference.evidenceKind === 'onboarding_goal_revision' &&
              reference.aggregateId === goalRevision.goalId &&
              reference.aggregateRevision === goalRevision.revision,
          )
        const startSuccessor = currentGoalIsNovel && pendingRequests.length === 0
        const derivationItemId = startSuccessor ? randomUUID() : itemId

        const result = deriveTrainingAvailability({
          goalRevision,
          timezone: profile.timezone,
          evaluatedAt,
          currentRevision: startSuccessor ? null : current,
          ids: {
            itemId: derivationItemId,
            revisionId: randomUUID(),
            eligibleReferenceId: randomUUID(),
          },
          sha256Hex,
        })

        if (result.outcome === 'no_op') {
          if (pendingRequests.length > 0) {
            throw new PersonalModelRevisionConflictError(
              'training availability has unresolved source refresh requests',
            )
          }
          return result
        }

        if (result.outcome === 'created') {
          if (startSuccessor) {
            if (!current || !itemResult.rows[0]) {
              throw new PersonalModelRevisionConflictError(
                'training availability successor predecessor is missing',
              )
            }
            const stored = await retireGenerationAndInsertSuccessor(client, {
              userId,
              subjectKey: 'training.availability',
              predecessorItemId: itemId,
              predecessorGeneration: itemResult.rows[0].generation,
              predecessorRevision: current.revision,
              revision: result.revision,
            })
            return { ...result, revision: stored }
          }
          if (current !== null || pendingRequests.length > 0) {
            throw new PersonalModelRevisionConflictError(
              'training availability creation target is no longer empty',
            )
          }
          await client.query(
            `
              INSERT INTO personal_model_items (
                id, user_id, subject_key, current_revision, created_at, updated_at
              )
              VALUES ($1, $2, 'training.availability', 1, $3, $3)
            `,
            [itemId, userId, result.revision.changedAt],
          )
          const stored = await insertRevision(client, result.revision)
          return { ...result, revision: stored }
        }

        if (current === null) {
          throw new PersonalModelRevisionConflictError(
            'training availability revision target is missing',
          )
        }

        if (result.cause === 'source_refreshed') {
          const eligibleReference = current.snapshot.evidenceSet.references.find(
            (reference) =>
              reference.evidenceKind === 'onboarding_goal_revision' &&
              reference.qualification === 'eligible',
          )
          const pendingRequest = pendingRequests.length === 1 ? pendingRequests[0] : undefined
          const exactPendingRequest =
            eligibleReference !== undefined &&
            pendingRequest !== undefined &&
            pendingRequest.affected_item_revision <= current.revision &&
            pendingRequest.evidence_kind === 'onboarding_goal_revision' &&
            pendingRequest.source_aggregate_id === eligibleReference.aggregateId &&
            pendingRequest.withdrawn_source_revision === eligibleReference.aggregateRevision &&
            pendingRequest.observed_source_revision > eligibleReference.aggregateRevision &&
            pendingRequest.observed_source_revision <= goalRevision.revision &&
            pendingRequest.reason === 'source_corrected'
          if (!exactPendingRequest) {
            throw new PersonalModelRevisionConflictError(
              'training availability source refresh request does not match the current evidence',
            )
          }
        } else if (pendingRequests.length > 0) {
          throw new PersonalModelRevisionConflictError(
            'training availability content reconciliation cannot skip source refresh requests',
          )
        }

        const stored = await insertRevision(client, result.revision)
        const updated = await client.query(
          `
            UPDATE personal_model_items
            SET current_revision = $1, updated_at = $2
            WHERE user_id = $3 AND id = $4 AND current_revision = $5
          `,
          [stored.revision, stored.changedAt, userId, itemId, current.revision],
        )
        if (updated.rowCount !== 1) throw new PersonalModelRevisionConflictError()
        return { ...result, revision: stored }
      })
    } catch (error) {
      if (isPostgresError(error) && error.code === '23505') {
        throw new PersonalModelRevisionConflictError(
          'training availability item or revision already exists',
        )
      }
      throw error
    }
  }

  async refreshRecordedTrainingFrequency(
    userId: string,
  ): Promise<RecordedTrainingFrequencyDerivationResult> {
    try {
      return await this.database.withTransaction(async (client) => {
        const owner = await client.query(
          "SELECT 1 FROM users WHERE id = $1 AND status = 'active' FOR UPDATE",
          [userId],
        )
        if (!owner.rows[0]) throw new RecordedTrainingFrequencyAuthorityNotFoundError()

        const itemResult = await client.query<RecordedTrainingFrequencyItemRow>(
          `
            SELECT id, generation
            FROM personal_model_items
            WHERE user_id = $1 AND subject_key = 'training.recorded_frequency'
              AND retired_at IS NULL
          `,
          [userId],
        )
        const itemId = itemResult.rows[0]?.id ?? randomUUID()
        const current = itemResult.rows[0]
          ? (await lockCurrentRevision(client, userId, itemId)).revision
          : null

        const pendingRequests =
          current === null
            ? []
            : (
                await client.query<RecordedTrainingFrequencyPendingRequestRow>(
                  `
                    SELECT
                      request.evidence_kind,
                      request.source_aggregate_id,
                      request.withdrawn_source_revision,
                      request.observed_source_revision,
                      request.reason
                    FROM personal_model_source_refresh_requests AS request
                    LEFT JOIN personal_model_source_refresh_resolutions AS resolution
                      ON resolution.request_id = request.id
                    WHERE request.user_id = $1
                      AND request.item_id = $2
                      AND resolution.request_id IS NULL
                    ORDER BY request.created_at, request.id
                  `,
                  [userId, itemId],
                )
              ).rows
        if (pendingRequests.some((request) => request.evidence_kind !== 'workout_revision')) {
          throw new PersonalModelRevisionConflictError(
            'recorded training frequency has a non-workout refresh request',
          )
        }

        const observationResult = await client.query<RecordedTrainingFrequencyObservationRow>(
          `
            WITH authority AS MATERIALIZED (
              SELECT
                account.created_at AS account_created_at,
                profile.timezone,
                GREATEST(
                  clock_timestamp(),
                  COALESCE(
                    $2::timestamptz + INTERVAL '1 millisecond',
                    '-infinity'::timestamptz
                  )
                ) AS evaluated_at
              FROM users AS account
              JOIN user_profiles AS profile ON profile.user_id = account.id
              WHERE account.id = $1 AND account.status = 'active'
            ), calendar AS (
              SELECT
                authority.*,
                DATE_TRUNC('week', authority.evaluated_at AT TIME ZONE authority.timezone)::date
                  AS current_week_start,
                CASE
                  WHEN authority.account_created_at =
                    DATE_TRUNC(
                      'week',
                      authority.account_created_at AT TIME ZONE authority.timezone
                    ) AT TIME ZONE authority.timezone
                  THEN DATE_TRUNC(
                    'week',
                    authority.account_created_at AT TIME ZONE authority.timezone
                  )::date
                  ELSE (
                    DATE_TRUNC(
                      'week',
                      authority.account_created_at AT TIME ZONE authority.timezone
                    ) + INTERVAL '1 week'
                  )::date
                END AS first_full_week_start
              FROM authority
            ), coverage AS (
              SELECT
                calendar.*,
                LEAST(
                  8,
                  GREATEST(0, (calendar.current_week_start - calendar.first_full_week_start) / 7)
                )::integer AS complete_weeks
              FROM calendar
            ), bounds AS (
              SELECT
                coverage.*,
                (coverage.current_week_start - coverage.complete_weeks * 7)::date AS start_date,
                CASE
                  WHEN coverage.complete_weeks = 0 THEN coverage.account_created_at
                  ELSE (
                    coverage.current_week_start - coverage.complete_weeks * 7
                  )::timestamp AT TIME ZONE coverage.timezone
                END AS start_at,
                CASE
                  WHEN coverage.complete_weeks = 0 THEN coverage.evaluated_at
                  ELSE coverage.current_week_start::timestamp AT TIME ZONE coverage.timezone
                END AS end_at
              FROM coverage
            )
            SELECT
              bounds.evaluated_at,
              bounds.timezone,
              bounds.start_date::text AS start_date,
              bounds.current_week_start::text AS end_date_exclusive,
              bounds.complete_weeks,
              bounds.start_at,
              bounds.end_at,
              COALESCE((
                SELECT JSONB_AGG(
                  JSONB_BUILD_OBJECT(
                    'snapshot', history.snapshot,
                    'localDate', (workout.started_at AT TIME ZONE bounds.timezone)::date::text,
                    'weekIndex', (
                      (workout.started_at AT TIME ZONE bounds.timezone)::date - bounds.start_date
                    ) / 7
                  )
                  ORDER BY workout.started_at, workout.created_at, workout.id
                )
                FROM workout_sessions AS workout
                JOIN workout_revisions AS history
                  ON history.user_id = workout.user_id
                 AND history.workout_id = workout.id
                 AND history.revision = workout.revision
                WHERE workout.user_id = $1
                  AND workout.deleted_at IS NULL
                  AND history.action <> 'deleted'
                  AND bounds.complete_weeks > 0
                  AND workout.started_at >= bounds.start_at
                  AND workout.started_at < bounds.end_at
              ), '[]'::jsonb) AS workouts
            FROM bounds
          `,
          [userId, current?.changedAt ?? null],
        )
        const observation = observationResult.rows[0]
        if (!observation) throw new RecordedTrainingFrequencyAuthorityNotFoundError()
        if (!Array.isArray(observation.workouts)) {
          throw new Error('recorded training frequency workout snapshot is invalid')
        }
        const workouts = (observation.workouts as RecordedTrainingFrequencyWorkoutRow[]).map(
          (row) => {
            const snapshot = workoutSchema.parse(row.snapshot)
            return {
              referenceId: randomUUID(),
              workoutId: snapshot.id,
              revision: snapshot.revision,
              sourceKind: snapshot.source.kind,
              startedAt: snapshot.startedAt,
              endedAt: snapshot.endedAt,
              timezone: snapshot.timezone,
              localDate: row.localDate,
              weekIndex: row.weekIndex,
            }
          },
        )

        const terminal =
          current?.snapshot.status === 'invalidated' || current?.snapshot.status === 'superseded'
        const currentGenerationSources = new Set(
          current?.snapshot.evidenceSet.references.map(
            (reference) => `${reference.aggregateId}:${reference.aggregateRevision}`,
          ) ?? [],
        )
        const currentWorkoutsAreNovel =
          terminal &&
          workouts.some(
            (workout) => !currentGenerationSources.has(`${workout.workoutId}:${workout.revision}`),
          )
        const startSuccessor = currentWorkoutsAreNovel && pendingRequests.length === 0
        const derivationItemId = startSuccessor ? randomUUID() : itemId

        const result = deriveRecordedTrainingFrequency({
          userId,
          evaluatedAt: observation.evaluated_at.toISOString(),
          window: {
            startDate: observation.start_date,
            endDateExclusive: observation.end_date_exclusive,
            completeWeeks: observation.complete_weeks,
            startAt: observation.start_at.toISOString(),
            endAt: observation.end_at.toISOString(),
            timezone: observation.timezone,
          },
          workouts,
          pendingWithdrawals: pendingRequests.map((request) => ({
            workoutId: request.source_aggregate_id,
            withdrawnRevision: request.withdrawn_source_revision,
            observedRevision: request.observed_source_revision,
            reason: request.reason === 'source_deleted' ? 'source_deleted' : 'source_corrected',
          })),
          currentRevision: startSuccessor ? null : current,
          ids: { itemId: derivationItemId, revisionId: randomUUID() },
          sha256Hex,
        })

        if (result.outcome === 'unknown') {
          if (current !== null || pendingRequests.length > 0) {
            throw new PersonalModelRevisionConflictError(
              'existing recorded frequency item cannot transition to Unknown in this policy version',
            )
          }
          return result
        }
        if (result.outcome === 'no_op') {
          if (pendingRequests.length > 0) {
            throw new PersonalModelRevisionConflictError(
              'recorded training frequency has unresolved source refresh requests',
            )
          }
          return result
        }
        if (result.outcome === 'created') {
          if (startSuccessor) {
            if (!current || !itemResult.rows[0]) {
              throw new PersonalModelRevisionConflictError(
                'recorded training frequency successor predecessor is missing',
              )
            }
            const stored = await retireGenerationAndInsertSuccessor(client, {
              userId,
              subjectKey: 'training.recorded_frequency',
              predecessorItemId: itemId,
              predecessorGeneration: itemResult.rows[0].generation,
              predecessorRevision: current.revision,
              revision: result.revision,
            })
            return { ...result, revision: stored }
          }
          if (current !== null || pendingRequests.length > 0) {
            throw new PersonalModelRevisionConflictError(
              'recorded training frequency creation target is no longer empty',
            )
          }
          await client.query(
            `
              INSERT INTO personal_model_items (
                id, user_id, subject_key, current_revision, created_at, updated_at
              )
              VALUES ($1, $2, 'training.recorded_frequency', 1, $3, $3)
            `,
            [itemId, userId, result.revision.changedAt],
          )
          const stored = await insertRevision(client, result.revision)
          return { ...result, revision: stored }
        }
        if (current === null) {
          throw new PersonalModelRevisionConflictError(
            'recorded training frequency revision target is missing',
          )
        }
        const stored = await insertRevision(client, result.revision)
        const updated = await client.query(
          `
            UPDATE personal_model_items
            SET current_revision = $1, updated_at = $2
            WHERE user_id = $3 AND id = $4 AND current_revision = $5
          `,
          [stored.revision, stored.changedAt, userId, itemId, current.revision],
        )
        if (updated.rowCount !== 1) throw new PersonalModelRevisionConflictError()
        return { ...result, revision: stored }
      })
    } catch (error) {
      if (isPostgresError(error) && error.code === '23505') {
        throw new PersonalModelRevisionConflictError(
          'recorded training frequency item or revision already exists',
        )
      }
      throw error
    }
  }

  async refreshRecordedSessionDuration(
    userId: string,
  ): Promise<RecordedSessionDurationDerivationResult> {
    try {
      return await this.database.withTransaction(async (client) => {
        const owner = await client.query(
          "SELECT 1 FROM users WHERE id = $1 AND status = 'active' FOR UPDATE",
          [userId],
        )
        if (!owner.rows[0]) throw new RecordedSessionDurationAuthorityNotFoundError()

        const itemResult = await client.query<RecordedSessionDurationItemRow>(
          `
            SELECT id, generation
            FROM personal_model_items
            WHERE user_id = $1 AND subject_key = 'training.recorded_session_duration'
              AND retired_at IS NULL
          `,
          [userId],
        )
        const itemId = itemResult.rows[0]?.id ?? randomUUID()
        const current = itemResult.rows[0]
          ? (await lockCurrentRevision(client, userId, itemId)).revision
          : null

        const pendingRequests =
          current === null
            ? []
            : (
                await client.query<RecordedSessionDurationPendingRequestRow>(
                  `
                    SELECT
                      request.evidence_kind,
                      request.source_aggregate_id,
                      request.withdrawn_source_revision,
                      request.observed_source_revision,
                      request.reason
                    FROM personal_model_source_refresh_requests AS request
                    LEFT JOIN personal_model_source_refresh_resolutions AS resolution
                      ON resolution.request_id = request.id
                    WHERE request.user_id = $1
                      AND request.item_id = $2
                      AND resolution.request_id IS NULL
                    ORDER BY request.created_at, request.id
                  `,
                  [userId, itemId],
                )
              ).rows
        if (pendingRequests.some((request) => request.evidence_kind !== 'workout_revision')) {
          throw new PersonalModelRevisionConflictError(
            'recorded session duration has a non-workout refresh request',
          )
        }

        const observationResult = await client.query<RecordedSessionDurationObservationRow>(
          `
            WITH authority AS MATERIALIZED (
              SELECT
                account.created_at AS account_created_at,
                profile.timezone,
                GREATEST(
                  clock_timestamp(),
                  COALESCE(
                    $2::timestamptz + INTERVAL '1 millisecond',
                    '-infinity'::timestamptz
                  )
                ) AS evaluated_at
              FROM users AS account
              JOIN user_profiles AS profile ON profile.user_id = account.id
              WHERE account.id = $1 AND account.status = 'active'
            ), calendar AS (
              SELECT
                authority.*,
                DATE_TRUNC('week', authority.evaluated_at AT TIME ZONE authority.timezone)::date
                  AS current_week_start,
                CASE
                  WHEN authority.account_created_at =
                    DATE_TRUNC(
                      'week',
                      authority.account_created_at AT TIME ZONE authority.timezone
                    ) AT TIME ZONE authority.timezone
                  THEN DATE_TRUNC(
                    'week',
                    authority.account_created_at AT TIME ZONE authority.timezone
                  )::date
                  ELSE (
                    DATE_TRUNC(
                      'week',
                      authority.account_created_at AT TIME ZONE authority.timezone
                    ) + INTERVAL '1 week'
                  )::date
                END AS first_full_week_start
              FROM authority
            ), coverage AS (
              SELECT
                calendar.*,
                LEAST(
                  8,
                  GREATEST(0, (calendar.current_week_start - calendar.first_full_week_start) / 7)
                )::integer AS complete_weeks
              FROM calendar
            ), bounds AS (
              SELECT
                coverage.*,
                (coverage.current_week_start - coverage.complete_weeks * 7)::date AS start_date,
                CASE
                  WHEN coverage.complete_weeks = 0 THEN coverage.account_created_at
                  ELSE (
                    coverage.current_week_start - coverage.complete_weeks * 7
                  )::timestamp AT TIME ZONE coverage.timezone
                END AS start_at,
                CASE
                  WHEN coverage.complete_weeks = 0 THEN coverage.evaluated_at
                  ELSE coverage.current_week_start::timestamp AT TIME ZONE coverage.timezone
                END AS end_at
              FROM coverage
            )
            SELECT
              bounds.evaluated_at,
              bounds.timezone,
              bounds.start_date::text AS start_date,
              bounds.current_week_start::text AS end_date_exclusive,
              bounds.complete_weeks,
              bounds.start_at,
              bounds.end_at,
              COALESCE((
                SELECT JSONB_AGG(
                  JSONB_BUILD_OBJECT(
                    'snapshot', history.snapshot,
                    'localDate', (workout.started_at AT TIME ZONE bounds.timezone)::date::text,
                    'weekIndex', (
                      (workout.started_at AT TIME ZONE bounds.timezone)::date - bounds.start_date
                    ) / 7
                  )
                  ORDER BY workout.started_at, workout.created_at, workout.id
                )
                FROM workout_sessions AS workout
                JOIN workout_revisions AS history
                  ON history.user_id = workout.user_id
                 AND history.workout_id = workout.id
                 AND history.revision = workout.revision
                WHERE workout.user_id = $1
                  AND workout.deleted_at IS NULL
                  AND history.action <> 'deleted'
                  AND bounds.complete_weeks > 0
                  AND workout.started_at >= bounds.start_at
                  AND workout.started_at < bounds.end_at
              ), '[]'::jsonb) AS workouts
            FROM bounds
          `,
          [userId, current?.changedAt ?? null],
        )
        const observation = observationResult.rows[0]
        if (!observation) throw new RecordedSessionDurationAuthorityNotFoundError()
        if (!Array.isArray(observation.workouts)) {
          throw new Error('recorded session duration workout snapshot is invalid')
        }
        const workouts = (observation.workouts as RecordedSessionDurationWorkoutRow[]).map(
          (row) => {
            const snapshot = workoutSchema.parse(row.snapshot)
            return {
              referenceId: randomUUID(),
              workoutId: snapshot.id,
              revision: snapshot.revision,
              sourceKind: snapshot.source.kind,
              startedAt: snapshot.startedAt,
              endedAt: snapshot.endedAt,
              timezone: snapshot.timezone,
              localDate: row.localDate,
              weekIndex: row.weekIndex,
            }
          },
        )

        const terminal =
          current?.snapshot.status === 'invalidated' || current?.snapshot.status === 'superseded'
        const currentGenerationSources = new Set(
          current?.snapshot.evidenceSet.references.map(
            (reference) => `${reference.aggregateId}:${reference.aggregateRevision}`,
          ) ?? [],
        )
        const currentWorkoutsAreNovel =
          terminal &&
          workouts.some((workout) => {
            const durationMinutes =
              (Date.parse(workout.endedAt) - Date.parse(workout.startedAt)) / 60_000
            return (
              durationMinutes > 0 &&
              durationMinutes <= 1_440 &&
              Date.parse(workout.endedAt) <= Date.parse(observation.end_at.toISOString()) &&
              !currentGenerationSources.has(`${workout.workoutId}:${workout.revision}`)
            )
          })
        const startSuccessor = currentWorkoutsAreNovel && pendingRequests.length === 0
        const derivationItemId = startSuccessor ? randomUUID() : itemId

        const result = deriveRecordedSessionDuration({
          userId,
          evaluatedAt: observation.evaluated_at.toISOString(),
          window: {
            startDate: observation.start_date,
            endDateExclusive: observation.end_date_exclusive,
            completeWeeks: observation.complete_weeks,
            startAt: observation.start_at.toISOString(),
            endAt: observation.end_at.toISOString(),
            timezone: observation.timezone,
          },
          workouts,
          pendingWithdrawals: pendingRequests.map((request) => ({
            workoutId: request.source_aggregate_id,
            withdrawnRevision: request.withdrawn_source_revision,
            observedRevision: request.observed_source_revision,
            reason: request.reason === 'source_deleted' ? 'source_deleted' : 'source_corrected',
          })),
          currentRevision: startSuccessor ? null : current,
          ids: { itemId: derivationItemId, revisionId: randomUUID() },
          sha256Hex,
        })

        if (result.outcome === 'unknown') {
          if (current !== null || pendingRequests.length > 0) {
            throw new PersonalModelRevisionConflictError(
              'existing session duration item cannot transition to Unknown in this policy version',
            )
          }
          return result
        }
        if (result.outcome === 'no_op') {
          if (pendingRequests.length > 0) {
            throw new PersonalModelRevisionConflictError(
              'recorded session duration has unresolved source refresh requests',
            )
          }
          return result
        }
        if (result.outcome === 'created') {
          if (startSuccessor) {
            if (!current || !itemResult.rows[0]) {
              throw new PersonalModelRevisionConflictError(
                'recorded session duration successor predecessor is missing',
              )
            }
            const stored = await retireGenerationAndInsertSuccessor(client, {
              userId,
              subjectKey: 'training.recorded_session_duration',
              predecessorItemId: itemId,
              predecessorGeneration: itemResult.rows[0].generation,
              predecessorRevision: current.revision,
              revision: result.revision,
            })
            return { ...result, revision: stored }
          }
          if (current !== null || pendingRequests.length > 0) {
            throw new PersonalModelRevisionConflictError(
              'recorded session duration creation target is no longer empty',
            )
          }
          await client.query(
            `
              INSERT INTO personal_model_items (
                id, user_id, subject_key, current_revision, created_at, updated_at
              )
              VALUES ($1, $2, 'training.recorded_session_duration', 1, $3, $3)
            `,
            [itemId, userId, result.revision.changedAt],
          )
          const stored = await insertRevision(client, result.revision)
          return { ...result, revision: stored }
        }
        if (current === null) {
          throw new PersonalModelRevisionConflictError(
            'recorded session duration revision target is missing',
          )
        }
        const stored = await insertRevision(client, result.revision)
        const updated = await client.query(
          `
            UPDATE personal_model_items
            SET current_revision = $1, updated_at = $2
            WHERE user_id = $3 AND id = $4 AND current_revision = $5
          `,
          [stored.revision, stored.changedAt, userId, itemId, current.revision],
        )
        if (updated.rowCount !== 1) throw new PersonalModelRevisionConflictError()
        return { ...result, revision: stored }
      })
    } catch (error) {
      if (isPostgresError(error) && error.code === '23505') {
        throw new PersonalModelRevisionConflictError(
          'recorded session duration item or revision already exists',
        )
      }
      throw error
    }
  }

  async getCurrent(userId: string, itemId: string): Promise<PersonalModelItemRevision> {
    const result = await this.database.query<PersonalModelRevisionRow>(
      `
        SELECT revision.*
        FROM personal_model_items AS item
        JOIN personal_model_item_revisions AS revision
          ON revision.user_id = item.user_id
         AND revision.item_id = item.id
         AND revision.revision = item.current_revision
        WHERE item.user_id = $1 AND item.id = $2
      `,
      [userId, itemId],
    )
    const row = result.rows[0]
    if (!row) throw new PersonalModelItemNotFoundError()
    return mapRevisionRow(row)
  }

  async getCurrentSubject(
    userId: string,
    subjectKey: PersonalModelSubjectKey,
  ): Promise<PersonalModelCurrentSubjectEnvelope> {
    const emptyEnvelope = personalModelCurrentSubjectEnvelopeSchema.parse({
      schemaVersion: personalModelCurrentSubjectEnvelopeVersion,
      ownerUserId: userId,
      subjectKey,
      current: null,
    })
    const result = await this.database.query<PersonalModelCurrentSubjectRow>(
      `
        SELECT
          account.id AS authority_user_id,
          item.id AS current_item_id,
          item.generation,
          item.predecessor_item_id,
          item.retired_at,
          revision.id AS revision_id,
          revision.user_id AS revision_user_id,
          revision.item_id AS revision_item_id,
          revision.schema_version AS revision_schema_version,
          revision.revision,
          revision.previous_revision,
          revision.action,
          revision.snapshot,
          revision.derivation_fingerprint,
          revision.feedback_event_id,
          revision.changed_at
        FROM users AS account
        LEFT JOIN personal_model_items AS item
          ON item.user_id = account.id
         AND item.subject_key = $2
         AND item.retired_at IS NULL
        LEFT JOIN personal_model_item_revisions AS revision
          ON revision.user_id = item.user_id
         AND revision.item_id = item.id
         AND revision.revision = item.current_revision
        WHERE account.id = $1
          AND account.status = 'active'
      `,
      [userId, subjectKey],
    )

    if (result.rows.length === 0) throw new PersonalModelSubjectAuthorityNotFoundError()
    if (result.rows.length !== 1) {
      throw new PersonalModelRevisionConflictError(
        'personal model current subject generation is ambiguous',
      )
    }

    const row = result.rows[0]!
    if (row.authority_user_id !== userId) {
      throw new PersonalModelRevisionConflictError('personal model subject owner mismatch')
    }
    if (row.current_item_id === null) {
      if (
        row.generation !== null ||
        row.predecessor_item_id !== null ||
        row.retired_at !== null ||
        row.revision_id !== null
      ) {
        throw new PersonalModelRevisionConflictError(
          'personal model empty subject contains generation metadata',
        )
      }
      return emptyEnvelope
    }
    if (
      row.generation === null ||
      row.retired_at !== null ||
      row.revision_id === null ||
      row.revision_user_id === null ||
      row.revision_item_id === null ||
      row.revision_schema_version === null ||
      row.revision === null ||
      row.action === null ||
      row.snapshot === null ||
      row.derivation_fingerprint === null ||
      row.changed_at === null
    ) {
      throw new PersonalModelRevisionConflictError(
        'personal model current subject generation is incomplete',
      )
    }

    const currentRevision = mapRevisionRow({
      id: row.revision_id,
      user_id: row.revision_user_id,
      item_id: row.revision_item_id,
      schema_version: row.revision_schema_version,
      revision: row.revision,
      previous_revision: row.previous_revision,
      action: row.action,
      snapshot: row.snapshot,
      derivation_fingerprint: row.derivation_fingerprint,
      feedback_event_id: row.feedback_event_id,
      changed_at: row.changed_at,
    })

    return personalModelCurrentSubjectEnvelopeSchema.parse({
      schemaVersion: personalModelCurrentSubjectEnvelopeVersion,
      ownerUserId: userId,
      subjectKey,
      current: {
        itemId: row.current_item_id,
        generation: row.generation,
        predecessorItemId: row.predecessor_item_id,
        terminal:
          currentRevision.snapshot.status === 'superseded' ||
          currentRevision.snapshot.status === 'invalidated',
        retiredAt: null,
        currentRevision,
      },
    })
  }

  async history(userId: string, itemId: string, limit = 20): Promise<PersonalModelItemRevision[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > maximumHistoryPageSize) {
      throw new RangeError(`personal model history limit must be 1-${maximumHistoryPageSize}`)
    }

    const owned = await this.database.query(
      'SELECT 1 FROM personal_model_items WHERE user_id = $1 AND id = $2',
      [userId, itemId],
    )
    if (!owned.rows[0]) throw new PersonalModelItemNotFoundError()

    const result = await this.database.query<PersonalModelRevisionRow>(
      `
        SELECT *
        FROM personal_model_item_revisions
        WHERE user_id = $1 AND item_id = $2
        ORDER BY revision DESC
        LIMIT $3
      `,
      [userId, itemId, limit],
    )
    return result.rows.map(mapRevisionRow)
  }
}
