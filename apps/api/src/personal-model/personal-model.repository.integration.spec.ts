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
const initialGoalChangedAt = '2026-08-09T08:00:00.000Z'
const initialWorkoutStartedAt = '2026-08-08T08:00:00.000Z'
const initialWorkoutEndedAt = '2026-08-08T09:00:00.000Z'

const createdRevisionFor = (
  userId: string,
  itemId: string,
  goalId: string,
): PersonalModelItemRevision => {
  const evidenceId = randomUUID()
  const reference = {
    id: evidenceId,
    ownerUserId: userId,
    role: 'supporting' as const,
    evidenceKind: 'onboarding_goal_revision' as const,
    aggregateId: goalId,
    aggregateRevision: 1,
    sourceKind: 'user_confirmed' as const,
    qualification: 'eligible' as const,
    withdrawnReason: null,
    time: { kind: 'instant' as const, occurredAt: initialGoalChangedAt },
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
      sourceGoalRevision: 1,
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

const createdWorkoutRevisionFor = (
  userId: string,
  itemId: string,
  workoutId: string,
): PersonalModelItemRevision => {
  const reference = {
    id: randomUUID(),
    ownerUserId: userId,
    role: 'supporting' as const,
    evidenceKind: 'workout_revision' as const,
    aggregateId: workoutId,
    aggregateRevision: 1,
    sourceKind: 'manual' as const,
    qualification: 'eligible' as const,
    withdrawnReason: null,
    time: {
      kind: 'interval' as const,
      startedAt: initialWorkoutStartedAt,
      endedAt: initialWorkoutEndedAt,
      timezone: 'Asia/Shanghai',
    },
  }
  const snapshot = {
    contractVersion: 'personal-model-contract-v1' as const,
    id: itemId,
    userId,
    kind: 'behavior' as const,
    subjectKey: 'training.recorded_frequency' as const,
    claimSchemaVersion: 'recorded_training_frequency_behavior_v1' as const,
    claim: {
      observationWindow: {
        startDate: '2026-08-03',
        endDateExclusive: '2026-08-10',
        completeWeeks: 1,
        timezone: 'Asia/Shanghai',
      },
      weeklyRecordedSessionCounts: [1],
      qualifyingWorkoutCount: 1,
      recordedWeekCount: 1,
      medianSessionsPerWeek: 1,
      minimumSessionsPerWeek: 1,
      maximumSessionsPerWeek: 1,
      frequencyUnit: 'recorded_sessions_per_week' as const,
      medianPolicyVersion: 'numeric-median-v1' as const,
    },
    source: 'deterministic_rule' as const,
    status: 'candidate' as const,
    confidence: {
      policyVersion: 'personal-model-confidence-v1' as const,
      basis: 'longitudinal_observation' as const,
      level: 'low' as const,
      qualifiedEvidenceCount: 1,
      distinctLocalDates: 1,
      completeWeeks: 1,
      comparedWindowCount: 1,
      stableWindowCount: 0,
      contradictingEvidenceCount: 0,
      latestEvidenceAt: initialWorkoutEndedAt,
      limitations: ['limited_coverage'] as const,
    },
    evidenceSet: {
      policyVersion: 'recorded-workout-evidence-v1',
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
      evidenceFingerprint: 'c'.repeat(64),
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
    derivationFingerprint: 'd'.repeat(64),
    feedbackEventId: null,
    changedAt: observedThrough,
  })
}

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
  const workoutUserId = randomUUID()
  const itemId = randomUUID()
  const goalId = randomUUID()
  const workoutItemId = randomUUID()
  const workoutId = randomUUID()
  let current = createdRevisionFor(userId, itemId, goalId)

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
    await pool.query('INSERT INTO users (id) VALUES ($1), ($2), ($3)', [
      userId,
      otherUserId,
      workoutUserId,
    ])
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `
          INSERT INTO user_profiles (
            user_id, display_name, age_band, sex_for_calculations,
            height_cm, display_height, display_height_unit, unit_system,
            timezone, adult_confirmed_at, risk_status, risk_flags,
            revision, created_at, updated_at
          )
          VALUES (
            $1, 'Source owner', '25_34', 'unspecified',
            170, 170, 'cm', 'metric',
            'Asia/Shanghai', $2, 'eligible', '{}',
            1, $2, $2
          )
        `,
        [userId, initialGoalChangedAt],
      )
      await client.query(
        `
          INSERT INTO user_goals (
            user_id, primary_goal, experience, available_days,
            session_minutes, equipment, dietary_preferences,
            created_at, updated_at, goal_id, revision
          )
          VALUES (
            $1, 'fitness', 'beginner', ARRAY['mon', 'wed', 'fri'],
            60, ARRAY['bodyweight'], ARRAY['none'],
            $3, $3, $2, 1
          )
        `,
        [userId, goalId, initialGoalChangedAt],
      )
      await client.query(
        `
          INSERT INTO user_goal_revisions (
            user_id, goal_id, revision, previous_revision, action, history_coverage,
            primary_goal, experience, available_days, session_minutes,
            equipment, dietary_preferences, snapshot, changed_at
          )
          SELECT
            user_id, goal_id, revision, NULL, 'created', 'complete',
            primary_goal, experience, available_days, session_minutes,
            equipment, dietary_preferences,
            build_user_goal_revision_snapshot_v1(
              user_id, goal_id, revision, 'created', 'complete',
              primary_goal, experience, available_days, session_minutes,
              equipment, dietary_preferences, updated_at
            ),
            updated_at
          FROM user_goals
          WHERE user_id = $1
        `,
        [userId],
      )
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    await pool.query(
      `
        INSERT INTO workout_sessions (
          id, user_id, title, status, source_kind, source_metadata,
          started_at, ended_at, timezone, pain_level, fatigue, note,
          revision, idempotency_key, request_hash, created_at, updated_at
        )
        VALUES (
          $1, $2, 'Source workout', 'completed', 'manual', '{}',
          $3, $4, 'Asia/Shanghai', 0, 2, NULL,
          1, 'source-workout-idempotency', $5, $3, $3
        )
      `,
      [workoutId, workoutUserId, initialWorkoutStartedAt, initialWorkoutEndedAt, '0'.repeat(64)],
    )
    await pool.query(
      `
        INSERT INTO workout_revisions (
          id, workout_id, user_id, action, revision, snapshot, changed_at
        )
        VALUES ($1, $2, $3, 'created', 1, $4::JSONB, $5)
      `,
      [
        randomUUID(),
        workoutId,
        workoutUserId,
        JSON.stringify({
          id: workoutId,
          userId: workoutUserId,
          revision: 1,
          source: { kind: 'manual' },
          startedAt: initialWorkoutStartedAt,
          endedAt: initialWorkoutEndedAt,
          timezone: 'Asia/Shanghai',
        }),
        initialWorkoutStartedAt,
      ],
    )
  })

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [
      [userId, otherUserId, workoutUserId],
    ])
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

  it('projects exact ordered evidence and rejects late mutation of a revision ledger', async () => {
    const reference = current.snapshot.evidenceSet.references[0]!
    const projected = await pool.query<{
      ordinal: number
      reference_id: string
      qualification: string
      reference: unknown
    }>(
      `
        SELECT ordinal, reference_id, qualification, reference
        FROM personal_model_evidence_refs
        WHERE user_id = $1 AND item_id = $2 AND item_revision = $3
        ORDER BY ordinal
      `,
      [userId, itemId, current.revision],
    )
    expect(projected.rows).toEqual([
      {
        ordinal: 1,
        reference_id: reference.id,
        qualification: 'eligible',
        reference,
      },
    ])

    await expect(
      pool.query(
        `
          UPDATE personal_model_evidence_refs
          SET reference = reference
          WHERE user_id = $1 AND item_id = $2 AND item_revision = $3 AND ordinal = 1
        `,
        [userId, itemId, current.revision],
      ),
    ).rejects.toMatchObject({ code: 'P0001' })
    await expect(
      pool.query(
        `
          DELETE FROM personal_model_evidence_refs
          WHERE user_id = $1 AND item_id = $2 AND item_revision = $3 AND ordinal = 1
        `,
        [userId, itemId, current.revision],
      ),
    ).rejects.toMatchObject({ code: 'P0001' })

    const extraReference = {
      ...reference,
      id: randomUUID(),
      aggregateId: randomUUID(),
    }
    await expect(
      pool.query(
        `
          INSERT INTO personal_model_evidence_refs (
            user_id, item_id, item_revision, ordinal,
            reference_id, evidence_kind, aggregate_id, aggregate_revision,
            role, source_kind, qualification, withdrawn_reason, reference
          )
          VALUES (
            $1, $2, $3, 2,
            $4, $5, $6, $7,
            $8, $9, $10, $11, $12::JSONB
          )
        `,
        [
          userId,
          itemId,
          current.revision,
          extraReference.id,
          extraReference.evidenceKind,
          extraReference.aggregateId,
          extraReference.aggregateRevision,
          extraReference.role,
          extraReference.sourceKind,
          extraReference.qualification,
          extraReference.withdrawnReason,
          JSON.stringify(extraReference),
        ],
      ),
    ).rejects.toMatchObject({ code: '23503' })
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

  it('builds an exact feedback transition in the locked transaction and replays the receipt', async () => {
    const commandUserId = randomUUID()
    const commandItemId = randomUUID()
    const commandWorkoutId = randomUUID()
    const commandCurrent = createdWorkoutRevisionFor(commandUserId, commandItemId, commandWorkoutId)
    await pool.query('INSERT INTO users (id) VALUES ($1)', [commandUserId])
    await pool.query(
      `
        INSERT INTO workout_sessions (
          id, user_id, title, status, source_kind, source_metadata,
          started_at, ended_at, timezone, pain_level, fatigue, note,
          revision, idempotency_key, request_hash, created_at, updated_at
        )
        VALUES (
          $1, $2, 'Feedback source workout', 'completed', 'manual', '{}',
          $3, $4, 'Asia/Shanghai', 0, 2, NULL,
          1, $5, $6, $3, $3
        )
      `,
      [
        commandWorkoutId,
        commandUserId,
        initialWorkoutStartedAt,
        initialWorkoutEndedAt,
        `feedback-command-${randomUUID()}`,
        '9'.repeat(64),
      ],
    )
    await pool.query(
      `
        INSERT INTO workout_revisions (
          id, workout_id, user_id, action, revision, snapshot, changed_at
        )
        VALUES ($1, $2, $3, 'created', 1, $4::JSONB, $5)
      `,
      [
        randomUUID(),
        commandWorkoutId,
        commandUserId,
        JSON.stringify({
          id: commandWorkoutId,
          userId: commandUserId,
          revision: 1,
          source: { kind: 'manual' },
          startedAt: initialWorkoutStartedAt,
          endedAt: initialWorkoutEndedAt,
          timezone: 'Asia/Shanghai',
        }),
        initialWorkoutStartedAt,
      ],
    )
    await repository.create(commandCurrent)
    const eventId = randomUUID()
    const request = {
      schemaVersion: 'personal-model-feedback-write-request-v1' as const,
      eventId,
      choice: 'matches_me' as const,
      reasonCode: null,
      note: null,
      contextValidUntil: null,
    }
    const expectedRevision = commandCurrent.revision
    const acceptedAt = '2026-08-12T08:00:00.000Z'
    try {
      const results = await Promise.all([
        repository.applyFeedbackCommand(
          commandUserId,
          commandItemId,
          expectedRevision,
          request,
          acceptedAt,
        ),
        repository.applyFeedbackCommand(
          commandUserId,
          commandItemId,
          expectedRevision,
          request,
          acceptedAt,
        ),
      ])

      expect(results[0]).toEqual(results[1])
      expect(results[0]).toMatchObject({
        outcome: 'revised',
        event: { id: eventId, itemRevision: expectedRevision, choice: 'matches_me' },
        revision: { revision: expectedRevision + 1, previousRevision: expectedRevision },
      })
      expect((await repository.getCurrent(commandUserId, commandItemId)).revision).toBe(
        expectedRevision + 1,
      )
      const stored = await pool.query<{ event_count: string; revision_count: string }>(
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
      expect(stored.rows[0]).toEqual({ event_count: '1', revision_count: '1' })
      await expect(
        repository.applyFeedbackCommand(
          commandUserId,
          commandItemId,
          expectedRevision,
          { ...request, choice: 'uncertain' },
          acceptedAt,
        ),
      ).rejects.toThrow('feedback event id is already in use')
    } finally {
      await pool.query('DELETE FROM users WHERE id = $1', [commandUserId])
    }
  })

  it('rejects feedback when owner authority has become inactive', async () => {
    await pool.query("UPDATE users SET status = 'deletion_pending' WHERE id = $1", [otherUserId])
    try {
      await expect(
        repository.applyFeedbackCommand(
          otherUserId,
          itemId,
          current.revision,
          {
            schemaVersion: 'personal-model-feedback-write-request-v1',
            eventId: randomUUID(),
            choice: 'uncertain',
            reasonCode: null,
            note: null,
            contextValidUntil: null,
          },
          '2026-08-12T08:30:00.000Z',
        ),
      ).rejects.toThrow('active personal model feedback authority not found')
    } finally {
      await pool.query("UPDATE users SET status = 'active' WHERE id = $1", [otherUserId])
    }
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

  it('queues an exact goal-source refresh and requires the next revision to withdraw it', async () => {
    const correctedAt = '2026-08-10T09:00:00.000Z'
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `
          UPDATE user_profiles
          SET revision = 2, updated_at = $2
          WHERE user_id = $1 AND revision = 1
        `,
        [userId, correctedAt],
      )
      await client.query(
        `
          UPDATE user_goals
          SET available_days = ARRAY['tue', 'thu'], session_minutes = 45,
              revision = 2, updated_at = $2
          WHERE user_id = $1 AND revision = 1
        `,
        [userId, correctedAt],
      )
      await client.query(
        `
          INSERT INTO user_goal_revisions (
            user_id, goal_id, revision, previous_revision, action, history_coverage,
            primary_goal, experience, available_days, session_minutes,
            equipment, dietary_preferences, snapshot, changed_at
          )
          SELECT
            goal.user_id, goal.goal_id, goal.revision, 1, 'updated',
            predecessor.history_coverage,
            goal.primary_goal, goal.experience, goal.available_days, goal.session_minutes,
            goal.equipment, goal.dietary_preferences,
            build_user_goal_revision_snapshot_v1(
              goal.user_id, goal.goal_id, goal.revision, 'updated',
              predecessor.history_coverage,
              goal.primary_goal, goal.experience, goal.available_days,
              goal.session_minutes, goal.equipment, goal.dietary_preferences,
              goal.updated_at
            ),
            goal.updated_at
          FROM user_goals AS goal
          JOIN user_goal_revisions AS predecessor
            ON predecessor.user_id = goal.user_id
           AND predecessor.goal_id = goal.goal_id
           AND predecessor.revision = 1
          WHERE goal.user_id = $1
        `,
        [userId],
      )
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }

    const pending = await pool.query<{
      reason: string
      withdrawn_source_revision: number
      observed_source_revision: number
      affected_item_revision: number
    }>(
      `
        SELECT reason, withdrawn_source_revision, observed_source_revision,
               affected_item_revision
        FROM personal_model_source_refresh_requests
        WHERE user_id = $1 AND item_id = $2
      `,
      [userId, itemId],
    )
    expect(pending.rows).toEqual([
      {
        reason: 'source_corrected',
        withdrawn_source_revision: 1,
        observed_source_revision: 2,
        affected_item_revision: current.revision,
      },
    ])

    const omitted = nextRevision(current, '2026-08-10T09:30:00.000Z', '9'.repeat(64))
    await expect(
      repository.append(userId, itemId, current.revision, omitted),
    ).rejects.toMatchObject({ code: 'P0001' })

    const changedAt = '2026-08-10T10:00:00.000Z'
    const previousReference = current.snapshot.evidenceSet.references[0]!
    const withdrawnReference = {
      ...previousReference,
      role: 'context' as const,
      qualification: 'withdrawn' as const,
      withdrawnReason: 'source_corrected' as const,
    }
    const replacementReference = {
      ...previousReference,
      id: randomUUID(),
      aggregateRevision: 2,
      time: { kind: 'instant' as const, occurredAt: correctedAt },
    }
    const corrected = personalModelItemRevisionSchema.parse({
      ...current,
      id: randomUUID(),
      revision: current.revision + 1,
      previousRevision: current.revision,
      action: 'evidence_accumulated',
      snapshot: {
        ...current.snapshot,
        claim: {
          ...current.snapshot.claim,
          availableDays: ['tue', 'thu'],
          sessionMinutes: 45,
          sourceGoalRevision: 2,
        },
        evidenceSet: {
          ...current.snapshot.evidenceSet,
          asOf: changedAt,
          window: { ...current.snapshot.evidenceSet.window, endAt: changedAt },
          withdrawnCount: 1,
          evidenceFingerprint: '9'.repeat(64),
          references: [withdrawnReference, replacementReference],
        },
        observedThrough: changedAt,
        derivedAt: changedAt,
        revision: current.revision + 1,
        updatedAt: changedAt,
      },
      derivationFingerprint: 'a'.repeat(64),
      feedbackEventId: null,
      changedAt,
    })

    current = await repository.append(userId, itemId, current.revision, corrected)
    const receipt = await pool.query<{
      resolved_item_revision: number
      withdrawn_reference_id: string
      reason: string
    }>(
      `
        SELECT resolution.resolved_item_revision, resolution.withdrawn_reference_id,
               request.reason
        FROM personal_model_source_refresh_resolutions AS resolution
        JOIN personal_model_source_refresh_requests AS request
          ON request.id = resolution.request_id
        WHERE resolution.user_id = $1 AND resolution.item_id = $2
      `,
      [userId, itemId],
    )
    expect(receipt.rows).toEqual([
      {
        resolved_item_revision: current.revision,
        withdrawn_reference_id: withdrawnReference.id,
        reason: 'source_corrected',
      },
    ])

    const bindings = await pool.query<{
      onboarding_goal_id: string | null
      onboarding_goal_revision: number | null
      workout_id: string | null
      workout_revision: number | null
    }>(
      `
        SELECT onboarding_goal_id, onboarding_goal_revision, workout_id, workout_revision
        FROM personal_model_evidence_refs
        WHERE user_id = $1 AND item_id = $2 AND item_revision = $3
        ORDER BY ordinal
      `,
      [userId, itemId, current.revision],
    )
    expect(bindings.rows).toEqual([
      {
        onboarding_goal_id: goalId,
        onboarding_goal_revision: 1,
        workout_id: null,
        workout_revision: null,
      },
      {
        onboarding_goal_id: goalId,
        onboarding_goal_revision: 2,
        workout_id: null,
        workout_revision: null,
      },
    ])

    await expect(
      pool.query(
        'UPDATE personal_model_source_refresh_requests SET created_at = created_at WHERE user_id = $1 AND item_id = $2',
        [userId, itemId],
      ),
    ).rejects.toMatchObject({ code: 'P0001' })
    await expect(
      pool.query(
        'DELETE FROM personal_model_source_refresh_resolutions WHERE user_id = $1 AND item_id = $2',
        [userId, itemId],
      ),
    ).rejects.toMatchObject({ code: 'P0001' })
  })

  it('binds workout sources and closes correction and deletion refresh requests', async () => {
    const missingSource = createdWorkoutRevisionFor(workoutUserId, randomUUID(), randomUUID())
    await expect(repository.create(missingSource)).rejects.toMatchObject({ code: '23503' })

    const mismatchedSource = createdWorkoutRevisionFor(workoutUserId, randomUUID(), workoutId)
    const mismatchedReference = mismatchedSource.snapshot.evidenceSet.references[0]!
    await expect(
      repository.create({
        ...mismatchedSource,
        snapshot: {
          ...mismatchedSource.snapshot,
          evidenceSet: {
            ...mismatchedSource.snapshot.evidenceSet,
            references: [
              {
                ...mismatchedReference,
                time: { ...mismatchedReference.time, timezone: 'UTC' },
              },
            ],
          },
        },
      }),
    ).rejects.toMatchObject({ code: 'P0001' })

    let workoutCurrent = createdWorkoutRevisionFor(workoutUserId, workoutItemId, workoutId)
    workoutCurrent = await repository.create(workoutCurrent)
    const initialBinding = await pool.query<{
      workout_id: string
      workout_revision: number
      onboarding_goal_id: string | null
    }>(
      `
        SELECT workout_id, workout_revision, onboarding_goal_id
        FROM personal_model_evidence_refs
        WHERE user_id = $1 AND item_id = $2 AND item_revision = 1
      `,
      [workoutUserId, workoutItemId],
    )
    expect(initialBinding.rows).toEqual([
      { workout_id: workoutId, workout_revision: 1, onboarding_goal_id: null },
    ])

    const correctedAt = '2026-08-10T10:30:00.000Z'
    const correctedStartedAt = '2026-08-08T08:15:00.000Z'
    const correctedEndedAt = '2026-08-08T09:15:00.000Z'
    const correctedClient = await pool.connect()
    try {
      await correctedClient.query('BEGIN')
      await correctedClient.query(
        `
          UPDATE workout_sessions
          SET started_at = $3, ended_at = $4, revision = 2, updated_at = $5
          WHERE id = $1 AND user_id = $2 AND revision = 1
        `,
        [workoutId, workoutUserId, correctedStartedAt, correctedEndedAt, correctedAt],
      )
      await correctedClient.query(
        `
          INSERT INTO workout_revisions (
            id, workout_id, user_id, action, revision, snapshot, changed_at
          )
          VALUES ($1, $2, $3, 'updated', 2, $4::JSONB, $5)
        `,
        [
          randomUUID(),
          workoutId,
          workoutUserId,
          JSON.stringify({
            id: workoutId,
            userId: workoutUserId,
            revision: 2,
            source: { kind: 'manual' },
            startedAt: correctedStartedAt,
            endedAt: correctedEndedAt,
            timezone: 'Asia/Shanghai',
          }),
          correctedAt,
        ],
      )
      await correctedClient.query('COMMIT')
    } catch (error) {
      await correctedClient.query('ROLLBACK')
      throw error
    } finally {
      correctedClient.release()
    }

    const initialReference = workoutCurrent.snapshot.evidenceSet.references[0]!
    const correctedReference = {
      ...initialReference,
      id: randomUUID(),
      aggregateRevision: 2,
      time: {
        kind: 'interval' as const,
        startedAt: correctedStartedAt,
        endedAt: correctedEndedAt,
        timezone: 'Asia/Shanghai',
      },
    }
    const correctedRevision = personalModelItemRevisionSchema.parse({
      ...workoutCurrent,
      id: randomUUID(),
      revision: 2,
      previousRevision: 1,
      action: 'evidence_accumulated',
      snapshot: {
        ...workoutCurrent.snapshot,
        confidence: {
          ...workoutCurrent.snapshot.confidence,
          latestEvidenceAt: correctedEndedAt,
        },
        evidenceSet: {
          ...workoutCurrent.snapshot.evidenceSet,
          asOf: correctedAt,
          window: { ...workoutCurrent.snapshot.evidenceSet.window, endAt: correctedAt },
          withdrawnCount: 1,
          evidenceFingerprint: 'e'.repeat(64),
          references: [
            {
              ...initialReference,
              role: 'context',
              qualification: 'withdrawn',
              withdrawnReason: 'source_corrected',
            },
            correctedReference,
          ],
        },
        observedThrough: correctedAt,
        derivedAt: correctedAt,
        revision: 2,
        updatedAt: correctedAt,
      },
      derivationFingerprint: 'f'.repeat(64),
      feedbackEventId: null,
      changedAt: correctedAt,
    })
    workoutCurrent = await repository.append(workoutUserId, workoutItemId, 1, correctedRevision)

    const deletedAt = '2026-08-10T11:00:00.000Z'
    const deletedClient = await pool.connect()
    try {
      await deletedClient.query('BEGIN')
      await deletedClient.query(
        `
          UPDATE workout_sessions
          SET deleted_at = $3, revision = 3, updated_at = $3
          WHERE id = $1 AND user_id = $2 AND revision = 2
        `,
        [workoutId, workoutUserId, deletedAt],
      )
      await deletedClient.query(
        `
          INSERT INTO workout_revisions (
            id, workout_id, user_id, action, revision, snapshot, changed_at
          )
          VALUES ($1, $2, $3, 'deleted', 3, $4::JSONB, $5)
        `,
        [
          randomUUID(),
          workoutId,
          workoutUserId,
          JSON.stringify({
            id: workoutId,
            userId: workoutUserId,
            revision: 3,
            source: { kind: 'manual' },
            startedAt: correctedStartedAt,
            endedAt: correctedEndedAt,
            timezone: 'Asia/Shanghai',
          }),
          deletedAt,
        ],
      )
      await deletedClient.query('COMMIT')
    } catch (error) {
      await deletedClient.query('ROLLBACK')
      throw error
    } finally {
      deletedClient.release()
    }

    const invalidatedRevision = personalModelItemRevisionSchema.parse({
      ...workoutCurrent,
      id: randomUUID(),
      revision: 3,
      previousRevision: 2,
      action: 'invalidated',
      snapshot: {
        ...workoutCurrent.snapshot,
        status: 'invalidated',
        confidence: {
          policyVersion: 'personal-model-confidence-v1',
          basis: 'longitudinal_observation',
          level: 'insufficient',
          qualifiedEvidenceCount: 0,
          distinctLocalDates: 0,
          completeWeeks: 1,
          comparedWindowCount: 0,
          stableWindowCount: 0,
          contradictingEvidenceCount: 0,
          latestEvidenceAt: null,
          limitations: ['limited_coverage', 'source_withdrawn'],
        },
        evidenceSet: {
          ...workoutCurrent.snapshot.evidenceSet,
          asOf: deletedAt,
          window: { ...workoutCurrent.snapshot.evidenceSet.window, endAt: deletedAt },
          includedCount: 0,
          supportingCount: 0,
          withdrawnCount: 1,
          evidenceFingerprint: '1'.repeat(64),
          references: [
            {
              ...correctedReference,
              role: 'context',
              qualification: 'withdrawn',
              withdrawnReason: 'source_deleted',
            },
          ],
        },
        validTo: deletedAt,
        observedThrough: deletedAt,
        derivedAt: deletedAt,
        revision: 3,
        updatedAt: deletedAt,
      },
      derivationFingerprint: '2'.repeat(64),
      feedbackEventId: null,
      changedAt: deletedAt,
    })
    workoutCurrent = await repository.append(workoutUserId, workoutItemId, 2, invalidatedRevision)
    expect(workoutCurrent.snapshot.status).toBe('invalidated')

    const refreshes = await pool.query<{
      reason: string
      observed_source_revision: number
      resolved_item_revision: number
    }>(
      `
        SELECT request.reason, request.observed_source_revision,
               resolution.resolved_item_revision
        FROM personal_model_source_refresh_requests AS request
        JOIN personal_model_source_refresh_resolutions AS resolution
          ON resolution.request_id = request.id
        WHERE request.user_id = $1 AND request.item_id = $2
        ORDER BY request.observed_source_revision
      `,
      [workoutUserId, workoutItemId],
    )
    expect(refreshes.rows).toEqual([
      { reason: 'source_corrected', observed_source_revision: 2, resolved_item_revision: 2 },
      { reason: 'source_deleted', observed_source_revision: 3, resolved_item_revision: 3 },
    ])

    await pool.query('DELETE FROM users WHERE id = $1', [workoutUserId])
    const remaining = await pool.query<{
      evidence_count: string
      request_count: string
      resolution_count: string
    }>(
      `
        SELECT
          (SELECT COUNT(*) FROM personal_model_evidence_refs WHERE user_id = $1)::TEXT
            AS evidence_count,
          (SELECT COUNT(*) FROM personal_model_source_refresh_requests WHERE user_id = $1)::TEXT
            AS request_count,
          (SELECT COUNT(*) FROM personal_model_source_refresh_resolutions WHERE user_id = $1)::TEXT
            AS resolution_count
      `,
      [workoutUserId],
    )
    expect(remaining.rows[0]).toEqual({
      evidence_count: '0',
      request_count: '0',
      resolution_count: '0',
    })
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

    const unpublished = nextRevision(current, '2026-08-10T12:00:00.000Z', 'f'.repeat(64))
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
    const projectedHistory = await pool.query<{
      revision_count: string
      evidence_count: string
    }>(
      `
        SELECT
          (
            SELECT COUNT(*)
            FROM personal_model_item_revisions
            WHERE user_id = $1 AND item_id = $2
          )::TEXT AS revision_count,
          (
            SELECT COUNT(*)
            FROM personal_model_evidence_refs
            WHERE user_id = $1 AND item_id = $2
          )::TEXT AS evidence_count
      `,
      [userId, itemId],
    )
    expect(projectedHistory.rows[0]).toEqual({
      revision_count: String(current.revision),
      evidence_count: String(current.revision + 1),
    })

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
      evidence_count: string
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
        )::TEXT AS feedback_count,
        (
          SELECT COUNT(*)
          FROM personal_model_evidence_refs
          WHERE user_id = $1 OR item_id = $2
        )::TEXT AS evidence_count
    `,
      [userId, itemId],
    )
    expect(remaining.rows[0]).toEqual({
      item_count: '0',
      revision_count: '0',
      feedback_count: '0',
      evidence_count: '0',
    })
  })
})
