import { isDeepStrictEqual } from 'node:util'

import { Injectable } from '@nestjs/common'
import {
  personalModelFeedbackEventSchema,
  personalModelFeedbackTransitionResultSchema,
  personalModelFeedbackTransitionVersion,
  personalModelItemSchema,
  personalModelItemRevisionSchema,
  type PersonalModelFeedbackEvent,
  type PersonalModelFeedbackTransitionResult,
  type PersonalModelItem,
  type PersonalModelItemRevision,
} from '@myfitness/contracts'
import type { PoolClient } from 'pg'

import { DatabaseService } from '../database/database.service'

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

const maximumHistoryPageSize = 50

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
    })
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
