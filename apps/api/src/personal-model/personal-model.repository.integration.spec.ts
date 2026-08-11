import { randomUUID } from 'node:crypto'

import {
  personalModelFeedbackTransitionResultSchema,
  personalModelItemRevisionSchema,
  type PersonalModelFeedbackEvent,
  type PersonalModelFeedbackTransitionResult,
  type PersonalModelItemRevision,
} from '@myfitness/contracts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'

import { getRuntimeConfig } from '../config'
import { DatabaseService } from '../database/database.service'
import { runMigrations } from '../database/migrate'
import {
  PersonalModelItemNotFoundError,
  PersonalModelRepository,
  PersonalModelRevisionConflictError,
} from './personal-model.repository'

const observedFrom = '2026-08-03T00:00:00.000Z'
const observedThrough = '2026-08-10T00:00:00.000Z'

const createdRevisionFor = (userId: string, itemId: string): PersonalModelItemRevision => {
  const evidenceId = randomUUID()
  const goalId = randomUUID()
  const reference = {
    id: evidenceId,
    ownerUserId: userId,
    role: 'supporting' as const,
    evidenceKind: 'onboarding_goal_revision' as const,
    aggregateId: goalId,
    aggregateRevision: 3,
    sourceKind: 'user_confirmed' as const,
    qualification: 'eligible' as const,
    withdrawnReason: null,
    time: { kind: 'instant' as const, occurredAt: '2026-08-09T08:00:00.000Z' },
  }
  const snapshot = {
    contractVersion: 'personal-model-contract-v1' as const,
    id: itemId,
    userId,
    kind: 'constraint' as const,
    subjectKey: 'training.availability' as const,
    claimSchemaVersion: 'training_availability_constraint_v1' as const,
    claim: {
      availableDays: ['mon', 'wed', 'fri'] as const,
      sessionMinutes: 60,
      sourceGoalRevision: 3,
      durationUnit: 'minutes' as const,
    },
    source: 'user_confirmed' as const,
    status: 'active' as const,
    confidence: {
      policyVersion: 'personal-model-confidence-v1' as const,
      basis: 'user_confirmed' as const,
      level: 'high' as const,
      qualifiedEvidenceCount: 1 as const,
      limitations: [] as const,
    },
    evidenceSet: {
      policyVersion: 'onboarding-goal-evidence-v1',
      ownerUserId: userId,
      asOf: observedThrough,
      window: {
        startAt: observedFrom,
        endAt: observedThrough,
        timezone: 'Asia/Shanghai',
      },
      includedCount: 1,
      supportingCount: 1,
      contradictingCount: 0,
      withdrawnCount: 0,
      evidenceFingerprint: 'a'.repeat(64),
      references: [reference],
    },
    validFrom: observedThrough,
    validTo: null,
    observedFrom,
    observedThrough,
    derivedAt: observedThrough,
    revision: 1,
    feedbackState: 'unreviewed' as const,
    createdAt: observedThrough,
    updatedAt: observedThrough,
  }

  return personalModelItemRevisionSchema.parse({
    schemaVersion: 'personal-model-item-revision-v1',
    id: randomUUID(),
    userId,
    itemId,
    revision: 1,
    previousRevision: null,
    action: 'created',
    snapshot,
    derivationFingerprint: 'b'.repeat(64),
    feedbackEventId: null,
    changedAt: observedThrough,
  })
}

const nextRevision = (
  current: PersonalModelItemRevision,
  changedAt: string,
  fingerprint: string,
): PersonalModelItemRevision =>
  personalModelItemRevisionSchema.parse({
    ...current,
    id: randomUUID(),
    revision: current.revision + 1,
    previousRevision: current.revision,
    action: 'evidence_accumulated',
    snapshot: {
      ...current.snapshot,
      revision: current.revision + 1,
      updatedAt: changedAt,
    },
    derivationFingerprint: fingerprint,
    feedbackEventId: null,
    changedAt,
  })

const revisedFeedbackFor = (
  current: PersonalModelItemRevision,
  choice: PersonalModelFeedbackEvent['choice'],
  eventId: string,
  createdAt: string,
  fingerprint: string,
  contextValidUntil: string | null = null,
): PersonalModelFeedbackTransitionResult => {
  const action = {
    matches_me: 'user_confirmed',
    temporary_context: 'user_marked_temporary',
    disagree: 'user_disagreed',
    uncertain: 'user_uncertain',
  }[choice] as PersonalModelItemRevision['action']
  const feedbackState = {
    matches_me: 'confirmed',
    temporary_context: 'temporary',
    disagree: 'disagreed',
    uncertain: 'uncertain',
  }[choice] as PersonalModelItemRevision['snapshot']['feedbackState']
  const event = {
    id: eventId,
    userId: current.userId,
    itemId: current.itemId,
    itemRevision: current.revision,
    choice,
    reasonCode: null,
    note: null,
    contextValidUntil,
    createdAt,
  }

  return personalModelFeedbackTransitionResultSchema.parse({
    schemaVersion: 'personal-model-feedback-transition-v1',
    outcome: 'revised',
    event,
    previousItem: current.snapshot,
    revision: {
      schemaVersion: 'personal-model-item-revision-v1',
      id: randomUUID(),
      userId: current.userId,
      itemId: current.itemId,
      revision: current.revision + 1,
      previousRevision: current.revision,
      action,
      snapshot: {
        ...current.snapshot,
        status: choice === 'disagree' ? 'disputed' : current.snapshot.status,
        feedbackState,
        validTo: choice === 'temporary_context' ? contextValidUntil : current.snapshot.validTo,
        revision: current.revision + 1,
        updatedAt: createdAt,
      },
      derivationFingerprint: fingerprint,
      feedbackEventId: eventId,
      changedAt: createdAt,
    },
  })
}

const noOpFeedbackFor = (
  current: PersonalModelItemRevision,
  choice: PersonalModelFeedbackEvent['choice'],
  eventId: string,
  createdAt: string,
  fingerprint: string,
): PersonalModelFeedbackTransitionResult =>
  personalModelFeedbackTransitionResultSchema.parse({
    schemaVersion: 'personal-model-feedback-transition-v1',
    outcome: 'no_op',
    event: {
      id: eventId,
      userId: current.userId,
      itemId: current.itemId,
      itemRevision: current.revision,
      choice,
      reasonCode: null,
      note: null,
      contextValidUntil: choice === 'temporary_context' ? current.snapshot.validTo : null,
      createdAt,
    },
    currentItem: current.snapshot,
    reason: 'feedback_already_current',
    resultFingerprint: fingerprint,
  })

describe('PersonalModelRepository with PostgreSQL', () => {
  const databaseUrl = getRuntimeConfig().databaseUrl
  const pool = new Pool({ connectionString: databaseUrl })
  const database = new DatabaseService()
  const repository = new PersonalModelRepository(database)
  const userId = randomUUID()
  const otherUserId = randomUUID()
  const itemId = randomUUID()
  let current = createdRevisionFor(userId, itemId)

  const insertRawRevision = (
    revision: PersonalModelItemRevision,
    ownerUserId = revision.userId,
    snapshot: unknown = revision.snapshot,
  ) =>
    pool.query(
      `
        INSERT INTO personal_model_item_revisions (
          id, user_id, item_id, subject_key, schema_version, revision,
          previous_revision, action, snapshot, derivation_fingerprint,
          feedback_event_id, changed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12)
      `,
      [
        revision.id,
        ownerUserId,
        revision.itemId,
        revision.snapshot.subjectKey,
        revision.schemaVersion,
        revision.revision,
        revision.previousRevision,
        revision.action,
        JSON.stringify(snapshot),
        revision.derivationFingerprint,
        revision.feedbackEventId,
        revision.changedAt,
      ],
    )

  beforeAll(async () => {
    await runMigrations(databaseUrl)
    await pool.query('INSERT INTO users (id) VALUES ($1), ($2)', [userId, otherUserId])
  })

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[userId, otherUserId]])
    await database.onModuleDestroy()
    await pool.end()
  })

  it('creates one complete current snapshot and immutable first revision', async () => {
    const stored = await repository.create(current)
    expect(stored).toEqual(current)
    await expect(repository.getCurrent(userId, itemId)).resolves.toEqual(current)
    await expect(repository.history(userId, itemId)).resolves.toEqual([current])

    const item = await pool.query<{
      current_revision: number
      subject_key: string
    }>(
      'SELECT current_revision, subject_key FROM personal_model_items WHERE user_id = $1 AND id = $2',
      [userId, itemId],
    )
    expect(item.rows[0]).toEqual({
      current_revision: 1,
      subject_key: 'training.availability',
    })
  })

  it('advances exactly one revision and fails closed for stale or other-owner access', async () => {
    const second = nextRevision(current, '2026-08-10T01:00:00.000Z', 'c'.repeat(64))
    current = await repository.append(userId, itemId, 1, second)
    expect(current).toEqual(second)
    expect((await repository.history(userId, itemId)).map((item) => item.revision)).toEqual([2, 1])

    const stale = nextRevision(second, '2026-08-10T02:00:00.000Z', 'd'.repeat(64))
    await expect(repository.append(userId, itemId, 1, stale)).rejects.toBeInstanceOf(
      PersonalModelRevisionConflictError,
    )
    await expect(repository.getCurrent(otherUserId, itemId)).rejects.toBeInstanceOf(
      PersonalModelItemNotFoundError,
    )
    await expect(repository.history(otherUserId, itemId)).rejects.toBeInstanceOf(
      PersonalModelItemNotFoundError,
    )

    const feedbackRevision = personalModelItemRevisionSchema.parse({
      ...stale,
      action: 'user_confirmed',
      feedbackEventId: randomUUID(),
      snapshot: { ...stale.snapshot, feedbackState: 'confirmed' },
    })
    await expect(repository.append(userId, itemId, 2, feedbackRevision)).rejects.toThrow(
      'feedback revisions must use the feedback application transaction',
    )
  })

  it('serializes concurrent writers so only one expected revision can win', async () => {
    const firstCandidate = nextRevision(current, '2026-08-10T02:00:00.000Z', 'd'.repeat(64))
    const secondCandidate = nextRevision(current, '2026-08-10T02:01:00.000Z', 'e'.repeat(64))
    const outcomes = await Promise.allSettled([
      repository.append(userId, itemId, 2, firstCandidate),
      repository.append(userId, itemId, 2, secondCandidate),
    ])

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1)
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected')
    expect(rejected).toMatchObject({ reason: expect.any(PersonalModelRevisionConflictError) })
    current = await repository.getCurrent(userId, itemId)
    expect(current.revision).toBe(3)
    expect((await repository.history(userId, itemId)).map((item) => item.revision)).toEqual([
      3, 2, 1,
    ])
  })

  it('persists one feedback event and its revised result atomically', async () => {
    const eventId = randomUUID()
    const transition = revisedFeedbackFor(
      current,
      'matches_me',
      eventId,
      '2026-08-10T04:00:00.000Z',
      '1'.repeat(64),
    )

    await expect(repository.applyFeedback(userId, itemId, transition)).resolves.toEqual(transition)
    current = await repository.getCurrent(userId, itemId)
    expect(current).toEqual(transition.outcome === 'revised' ? transition.revision : null)

    const stored = await pool.query<{
      outcome: string
      item_revision: number
      result_revision: number
      revision_action: string
      result_fingerprint: string
    }>(
      `
        SELECT outcome, item_revision, result_revision, revision_action, result_fingerprint
        FROM personal_model_feedback_events
        WHERE id = $1 AND user_id = $2 AND item_id = $3
      `,
      [eventId, userId, itemId],
    )
    expect(stored.rows[0]).toEqual({
      outcome: 'revised',
      item_revision: 3,
      result_revision: 4,
      revision_action: 'user_confirmed',
      result_fingerprint: '1'.repeat(64),
    })
    expect((await repository.history(userId, itemId)).map((item) => item.revision)).toEqual([
      4, 3, 2, 1,
    ])
  })

  it('persists no-op feedback without a revision and safely replays the same event', async () => {
    const transition = noOpFeedbackFor(
      current,
      'matches_me',
      randomUUID(),
      '2026-08-10T05:00:00.000Z',
      '2'.repeat(64),
    )
    await expect(repository.applyFeedback(userId, itemId, transition)).resolves.toEqual(transition)
    await expect(repository.applyFeedback(userId, itemId, transition)).resolves.toEqual(transition)

    expect((await repository.getCurrent(userId, itemId)).revision).toBe(4)
    expect((await repository.history(userId, itemId)).map((item) => item.revision)).toEqual([
      4, 3, 2, 1,
    ])
    const stored = await pool.query<{
      count: string
      outcome: string
      result_revision: number | null
    }>(
      `
        SELECT COUNT(*) OVER ()::TEXT AS count, outcome, result_revision
        FROM personal_model_feedback_events
        WHERE id = $1
      `,
      [transition.event.id],
    )
    expect(stored.rows[0]).toEqual({ count: '1', outcome: 'no_op', result_revision: null })
  })

  it('converges concurrent duplicate feedback and rejects event identity reuse', async () => {
    const eventId = randomUUID()
    const transition = revisedFeedbackFor(
      current,
      'uncertain',
      eventId,
      '2026-08-10T06:00:00.000Z',
      '3'.repeat(64),
    )
    const results = await Promise.all([
      repository.applyFeedback(userId, itemId, transition),
      repository.applyFeedback(userId, itemId, transition),
    ])
    expect(results).toEqual([transition, transition])
    current = await repository.getCurrent(userId, itemId)
    expect(current.revision).toBe(5)

    const linked = await pool.query<{ event_count: string; revision_count: string }>(
      `
        SELECT
          (SELECT COUNT(*) FROM personal_model_feedback_events WHERE id = $1)::TEXT AS event_count,
          (
            SELECT COUNT(*)
            FROM personal_model_item_revisions
            WHERE feedback_event_id = $1
          )::TEXT AS revision_count
      `,
      [eventId],
    )
    expect(linked.rows[0]).toEqual({ event_count: '1', revision_count: '1' })

    const reused = noOpFeedbackFor(
      current,
      'uncertain',
      eventId,
      '2026-08-10T06:30:00.000Z',
      '4'.repeat(64),
    )
    await expect(repository.applyFeedback(userId, itemId, reused)).rejects.toThrow(
      'feedback event id is already in use',
    )
  })

  it('fails stale and cross-owner feedback before storing an event', async () => {
    const history = await repository.history(userId, itemId)
    const staleCurrent = history.find((revision) => revision.revision === 4)
    expect(staleCurrent).toBeDefined()
    const stale = revisedFeedbackFor(
      staleCurrent!,
      'uncertain',
      randomUUID(),
      '2026-08-10T07:00:00.000Z',
      '5'.repeat(64),
    )
    await expect(repository.applyFeedback(userId, itemId, stale)).rejects.toThrow(
      'feedback target is no longer current',
    )
    await expect(repository.applyFeedback(otherUserId, itemId, stale)).rejects.toThrow(
      'feedback target does not match request',
    )
    const stored = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::TEXT AS count FROM personal_model_feedback_events WHERE id = $1',
      [stale.event.id],
    )
    expect(stored.rows[0]?.count).toBe('0')
  })

  it('compares offset timestamps semantically and preserves the stored representation', async () => {
    const transition = revisedFeedbackFor(
      current,
      'temporary_context',
      randomUUID(),
      '2026-08-10T16:00:00.000+08:00',
      '8'.repeat(64),
      '2026-08-20T16:00:00.000+08:00',
    )

    const first = await repository.applyFeedback(userId, itemId, transition)
    const replay = await repository.applyFeedback(userId, itemId, transition)
    expect(first.event.createdAt).toBe('2026-08-10T16:00:00.000+08:00')
    expect(first.event.contextValidUntil).toBe('2026-08-20T16:00:00.000+08:00')
    expect(replay).toEqual(first)
    if (first.outcome !== 'revised') throw new Error('expected revised transition')
    expect(first.revision.changedAt).toBe('2026-08-10T16:00:00.000+08:00')
    expect(first.revision.snapshot.updatedAt).toBe('2026-08-10T16:00:00.000+08:00')
    expect(first.revision.snapshot.validTo).toBe('2026-08-20T16:00:00.000+08:00')

    current = await repository.getCurrent(userId, itemId)
    expect(current).toEqual(first.revision)
  })

  it('rejects direct event mutation and incomplete or false no-op outcomes', async () => {
    const event = await pool.query<{ id: string }>(
      'SELECT id FROM personal_model_feedback_events WHERE user_id = $1 ORDER BY created_at LIMIT 1',
      [userId],
    )
    const eventId = event.rows[0]?.id
    expect(eventId).toBeDefined()
    await expect(
      pool.query('UPDATE personal_model_feedback_events SET note = note WHERE id = $1', [eventId]),
    ).rejects.toMatchObject({ code: 'P0001' })
    await expect(
      pool.query('DELETE FROM personal_model_feedback_events WHERE id = $1', [eventId]),
    ).rejects.toMatchObject({ code: 'P0001' })

    await expect(
      pool.query(
        `
          INSERT INTO personal_model_feedback_events (
            id, user_id, item_id, item_revision, choice, reason_code, note,
            context_valid_until, created_at, transition_schema_version,
            outcome, no_op_reason, result_revision, result_fingerprint
          )
          VALUES (
            $1, $2, $3, $4, 'matches_me', NULL, NULL,
            NULL, $5, 'personal-model-feedback-transition-v1',
            'revised', NULL, $6, $7
          )
        `,
        [
          randomUUID(),
          userId,
          itemId,
          current.revision,
          '2026-08-10T08:00:00.000Z',
          current.revision + 1,
          '6'.repeat(64),
        ],
      ),
    ).rejects.toMatchObject({ code: '23503' })

    await expect(
      pool.query(
        `
          INSERT INTO personal_model_feedback_events (
            id, user_id, item_id, item_revision, choice, reason_code, note,
            context_valid_until, created_at, transition_schema_version,
            outcome, no_op_reason, result_revision, result_fingerprint
          )
          VALUES (
            $1, $2, $3, $4, 'uncertain', NULL, NULL,
            NULL, $5, 'personal-model-feedback-transition-v1',
            'no_op', 'feedback_already_current', NULL, $6
          )
        `,
        [
          randomUUID(),
          userId,
          itemId,
          current.revision,
          '2026-08-10T08:00:00.000Z',
          '7'.repeat(64),
        ],
      ),
    ).rejects.toMatchObject({ code: 'P0001' })
  })

  it('rejects revision mutation, unpublished revisions and cross-owner rows in PostgreSQL', async () => {
    await expect(
      pool.query('UPDATE personal_model_item_revisions SET snapshot = snapshot WHERE id = $1', [
        current.id,
      ]),
    ).rejects.toMatchObject({ code: 'P0001' })
    await expect(
      pool.query('DELETE FROM personal_model_item_revisions WHERE id = $1', [current.id]),
    ).rejects.toMatchObject({ code: 'P0001' })

    const unpublished = nextRevision(current, '2026-08-10T03:00:00.000Z', 'f'.repeat(64))
    await expect(insertRawRevision(unpublished)).rejects.toMatchObject({ code: 'P0001' })

    const crossOwnerSnapshot = {
      ...unpublished.snapshot,
      userId: otherUserId,
      evidenceSet: {
        ...unpublished.snapshot.evidenceSet,
        ownerUserId: otherUserId,
        references: unpublished.snapshot.evidenceSet.references.map((reference) => ({
          ...reference,
          ownerUserId: otherUserId,
        })),
      },
    }
    await expect(
      insertRawRevision({ ...unpublished, id: randomUUID() }, otherUserId, crossOwnerSnapshot),
    ).rejects.toMatchObject({ code: '23503' })
  })

  it('blocks direct physical item deletion but cascades all history with account deletion', async () => {
    await expect(
      pool.query('DELETE FROM personal_model_items WHERE user_id = $1 AND id = $2', [
        userId,
        itemId,
      ]),
    ).rejects.toMatchObject({ code: 'P0001' })

    await pool.query('DELETE FROM users WHERE id = $1', [userId])
    const remaining = await pool.query<{
      item_count: string
      revision_count: string
      feedback_count: string
    }>(
      `
      SELECT
        (SELECT COUNT(*) FROM personal_model_items WHERE user_id = $1)::TEXT AS item_count,
        (
          SELECT COUNT(*)
          FROM personal_model_item_revisions
          WHERE user_id = $1 OR item_id = $2
        )::TEXT AS revision_count,
        (
          SELECT COUNT(*)
          FROM personal_model_feedback_events
          WHERE user_id = $1 OR item_id = $2
        )::TEXT AS feedback_count
    `,
      [userId, itemId],
    )
    expect(remaining.rows[0]).toEqual({
      item_count: '0',
      revision_count: '0',
      feedback_count: '0',
    })
  })
})
