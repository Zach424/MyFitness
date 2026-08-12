import { randomUUID } from 'node:crypto'

import {
  personalModelFeedbackTransitionResultSchema,
  personalModelItemRevisionSchema,
  type PersonalModelItemRevision,
} from '@myfitness/contracts'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'

import { getRuntimeConfig } from '../config'
import { DatabaseService } from '../database/database.service'
import { runMigrations } from '../database/migrate'
import {
  PersonalModelRepository,
  TrainingAvailabilitySourceNotFoundError,
} from './personal-model.repository'

const initialChangedAt = '2026-08-12T08:00:00.000Z'

describe('training availability Personal Model executor with PostgreSQL', () => {
  const databaseUrl = getRuntimeConfig().databaseUrl
  const pool = new Pool({ connectionString: databaseUrl })
  const database = new DatabaseService()
  const repository = new PersonalModelRepository(database)
  const owners = new Set<string>()

  const createOwner = async () => {
    const userId = randomUUID()
    const goalId = randomUUID()
    owners.add(userId)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('INSERT INTO users (id) VALUES ($1)', [userId])
      await client.query(
        `
          INSERT INTO user_profiles (
            user_id, display_name, age_band, sex_for_calculations,
            height_cm, display_height, display_height_unit, unit_system,
            timezone, adult_confirmed_at, risk_status, risk_flags,
            revision, created_at, updated_at
          )
          VALUES (
            $1, 'Availability owner', '25_34', 'unspecified',
            170, 170, 'cm', 'metric',
            'Asia/Shanghai', $2, 'eligible', '{}',
            1, $2, $2
          )
        `,
        [userId, initialChangedAt],
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
        [userId, goalId, initialChangedAt],
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
      return { userId, goalId }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  const updateGoal = async (
    userId: string,
    expectedRevision: number,
    changedAt: string,
    availableDays: string[],
    sessionMinutes: number,
  ) => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `
          UPDATE user_profiles
          SET revision = revision + 1, updated_at = $3
          WHERE user_id = $1 AND revision = $2
        `,
        [userId, expectedRevision, changedAt],
      )
      await client.query(
        `
          UPDATE user_goals
          SET available_days = $3::text[], session_minutes = $4,
              revision = revision + 1, updated_at = $5
          WHERE user_id = $1 AND revision = $2
        `,
        [userId, expectedRevision, availableDays, sessionMinutes, changedAt],
      )
      await client.query(
        `
          INSERT INTO user_goal_revisions (
            user_id, goal_id, revision, previous_revision, action, history_coverage,
            primary_goal, experience, available_days, session_minutes,
            equipment, dietary_preferences, snapshot, changed_at
          )
          SELECT
            goal.user_id, goal.goal_id, goal.revision, $2, 'updated',
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
           AND predecessor.revision = $2
          WHERE goal.user_id = $1 AND goal.revision = $2 + 1
        `,
        [userId, expectedRevision],
      )
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  const disagreeWith = async (current: PersonalModelItemRevision) => {
    const eventAt = new Date(Date.parse(current.changedAt) + 1_000).toISOString()
    const eventId = randomUUID()
    return repository.applyFeedback(
      current.userId,
      current.itemId,
      personalModelFeedbackTransitionResultSchema.parse({
        schemaVersion: 'personal-model-feedback-transition-v1',
        outcome: 'revised',
        event: {
          id: eventId,
          userId: current.userId,
          itemId: current.itemId,
          itemRevision: current.revision,
          choice: 'disagree',
          reasonCode: 'not_representative',
          note: null,
          contextValidUntil: null,
          createdAt: eventAt,
        },
        previousItem: current.snapshot,
        revision: {
          schemaVersion: 'personal-model-item-revision-v1',
          id: randomUUID(),
          userId: current.userId,
          itemId: current.itemId,
          revision: current.revision + 1,
          previousRevision: current.revision,
          action: 'user_disagreed',
          snapshot: {
            ...current.snapshot,
            status: 'disputed',
            confidence: {
              ...current.snapshot.confidence,
              limitations: ['user_disputed'],
            },
            feedbackState: 'disagreed',
            revision: current.revision + 1,
            updatedAt: eventAt,
          },
          derivationFingerprint: 'd'.repeat(64),
          feedbackEventId: eventId,
          changedAt: eventAt,
        },
      }),
    )
  }

  beforeAll(async () => {
    await runMigrations(databaseUrl)
  })

  afterEach(async () => {
    const userIds = [...owners]
    if (userIds.length > 0) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds])
      owners.clear()
    }
  })

  afterAll(async () => {
    await database.onModuleDestroy()
    await pool.end()
  })

  it('fails closed when the owner has no current onboarding goal authority', async () => {
    await expect(repository.refreshTrainingAvailability(randomUUID())).rejects.toBeInstanceOf(
      TrainingAvailabilitySourceNotFoundError,
    )
  })

  it('creates one current item and returns an explicit no-op for unchanged evidence', async () => {
    const { userId, goalId } = await createOwner()
    const created = await repository.refreshTrainingAvailability(userId)
    expect(created.outcome).toBe('created')
    if (created.outcome !== 'created') throw new Error('expected a created result')
    expect(created.revision.snapshot).toMatchObject({
      claim: {
        availableDays: ['mon', 'wed', 'fri'],
        sessionMinutes: 60,
        sourceGoalRevision: 1,
      },
      status: 'active',
      feedbackState: 'unreviewed',
    })
    expect(created.revision.snapshot.evidenceSet.references[0]).toMatchObject({
      aggregateId: goalId,
      aggregateRevision: 1,
      qualification: 'eligible',
    })

    const unchanged = await repository.refreshTrainingAvailability(userId)
    expect(unchanged).toEqual({ outcome: 'no_op', currentRevision: created.revision })

    const rows = await pool.query<{
      items: string
      revisions: string
      requests: string
      resolutions: string
    }>(
      `
        SELECT
          (SELECT COUNT(*) FROM personal_model_items WHERE user_id = $1)::TEXT AS items,
          (SELECT COUNT(*) FROM personal_model_item_revisions WHERE user_id = $1)::TEXT AS revisions,
          (SELECT COUNT(*) FROM personal_model_source_refresh_requests WHERE user_id = $1)::TEXT AS requests,
          (SELECT COUNT(*) FROM personal_model_source_refresh_resolutions WHERE user_id = $1)::TEXT AS resolutions
      `,
      [userId],
    )
    expect(rows.rows[0]).toEqual({
      items: '1',
      revisions: '1',
      requests: '0',
      resolutions: '0',
    })
  })

  it('serializes concurrent refresh, withdraws the old source and resolves it exactly once', async () => {
    const { userId } = await createOwner()
    const created = await repository.refreshTrainingAvailability(userId)
    if (created.outcome !== 'created') throw new Error('expected a created result')

    await updateGoal(userId, 1, '2026-08-12T10:00:00.000Z', ['tue', 'thu'], 45)
    const results = await Promise.all([
      repository.refreshTrainingAvailability(userId),
      repository.refreshTrainingAvailability(userId),
    ])
    expect(results.map((result) => result.outcome).sort()).toEqual(['no_op', 'revised'])
    const revised = results.find((result) => result.outcome === 'revised')
    if (!revised || revised.outcome !== 'revised') throw new Error('expected a revised result')
    expect(revised.cause).toBe('source_refreshed')
    expect(revised.revision.snapshot).toMatchObject({
      claim: {
        availableDays: ['tue', 'thu'],
        sessionMinutes: 45,
        sourceGoalRevision: 2,
      },
      evidenceSet: { includedCount: 1, supportingCount: 1, withdrawnCount: 1 },
    })
    expect(revised.revision.snapshot.evidenceSet.references).toEqual([
      expect.objectContaining({
        aggregateRevision: 1,
        qualification: 'withdrawn',
        withdrawnReason: 'source_corrected',
      }),
      expect.objectContaining({
        aggregateRevision: 2,
        qualification: 'eligible',
        withdrawnReason: null,
      }),
    ])

    const receipts = await pool.query<{
      requests: string
      resolutions: string
      revision: number
    }>(
      `
        SELECT
          (SELECT COUNT(*) FROM personal_model_source_refresh_requests WHERE user_id = $1)::TEXT AS requests,
          (SELECT COUNT(*) FROM personal_model_source_refresh_resolutions WHERE user_id = $1)::TEXT AS resolutions,
          item.current_revision AS revision
        FROM personal_model_items AS item
        WHERE item.user_id = $1 AND item.subject_key = 'training.availability'
      `,
      [userId],
    )
    expect(receipts.rows[0]).toEqual({ requests: '1', resolutions: '1', revision: 2 })
  })

  it('preserves user disagreement while refreshing corrected goal evidence', async () => {
    const { userId } = await createOwner()
    const created = await repository.refreshTrainingAvailability(userId)
    if (created.outcome !== 'created') throw new Error('expected a created result')
    const feedback = await disagreeWith(created.revision)
    if (feedback.outcome !== 'revised') throw new Error('expected revised feedback')

    await updateGoal(userId, 1, '2026-08-12T10:00:00.000Z', ['sat'], 30)
    const refreshed = await repository.refreshTrainingAvailability(userId)
    expect(refreshed.outcome).toBe('revised')
    if (refreshed.outcome !== 'revised') throw new Error('expected a revised result')
    expect(refreshed.revision.snapshot).toMatchObject({
      status: 'disputed',
      feedbackState: 'disagreed',
      confidence: { limitations: ['user_disputed'] },
      claim: { availableDays: ['sat'], sessionMinutes: 30, sourceGoalRevision: 2 },
    })
    expect(refreshed.revision.revision).toBe(3)

    await pool.query('DELETE FROM users WHERE id = $1', [userId])
    owners.delete(userId)
    const remaining = await pool.query<{
      items: string
      revisions: string
      evidence: string
      requests: string
      resolutions: string
    }>(
      `
        SELECT
          (SELECT COUNT(*) FROM personal_model_items WHERE user_id = $1)::TEXT AS items,
          (SELECT COUNT(*) FROM personal_model_item_revisions WHERE user_id = $1)::TEXT AS revisions,
          (SELECT COUNT(*) FROM personal_model_evidence_refs WHERE user_id = $1)::TEXT AS evidence,
          (SELECT COUNT(*) FROM personal_model_source_refresh_requests WHERE user_id = $1)::TEXT AS requests,
          (SELECT COUNT(*) FROM personal_model_source_refresh_resolutions WHERE user_id = $1)::TEXT AS resolutions
      `,
      [userId],
    )
    expect(remaining.rows[0]).toEqual({
      items: '0',
      revisions: '0',
      evidence: '0',
      requests: '0',
      resolutions: '0',
    })
  })

  it('settles terminal source withdrawal before creating a successor generation', async () => {
    const { userId } = await createOwner()
    const initial = await repository.refreshTrainingAvailability(userId)
    if (initial.outcome !== 'created') throw new Error('expected a created result')

    const invalidatedAt = new Date(Date.parse(initial.revision.changedAt) + 1_000).toISOString()
    const terminal = personalModelItemRevisionSchema.parse({
      ...initial.revision,
      id: randomUUID(),
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
      derivationFingerprint: 'e'.repeat(64),
      changedAt: invalidatedAt,
    })
    await repository.append(userId, initial.revision.itemId, 1, terminal)

    await updateGoal(userId, 1, '2026-08-12T10:00:00.000Z', ['tue', 'thu'], 45)
    const settled = await repository.refreshTrainingAvailability(userId)
    expect(settled.outcome).toBe('revised')
    if (settled.outcome !== 'revised') throw new Error('expected settled terminal revision')
    expect(settled.revision.snapshot.status).toBe('invalidated')

    const successor = await repository.refreshTrainingAvailability(userId)
    expect(successor.outcome).toBe('created')
    if (successor.outcome !== 'created') throw new Error('expected successor generation')
    expect(successor.revision.itemId).not.toBe(initial.revision.itemId)
    expect(successor.revision.snapshot).toMatchObject({
      status: 'active',
      claim: { availableDays: ['tue', 'thu'], sessionMinutes: 45, sourceGoalRevision: 2 },
    })

    const lineage = await pool.query<{
      id: string
      generation: number
      predecessor_item_id: string | null
      retired: boolean
      status: string
    }>(
      `
        SELECT
          item.id,
          item.generation,
          item.predecessor_item_id,
          item.retired_at IS NOT NULL AS retired,
          revision.snapshot ->> 'status' AS status
        FROM personal_model_items AS item
        JOIN personal_model_item_revisions AS revision
          ON revision.user_id = item.user_id
         AND revision.item_id = item.id
         AND revision.revision = item.current_revision
        WHERE item.user_id = $1 AND item.subject_key = 'training.availability'
        ORDER BY item.generation
      `,
      [userId],
    )
    expect(lineage.rows).toEqual([
      {
        id: initial.revision.itemId,
        generation: 1,
        predecessor_item_id: null,
        retired: true,
        status: 'invalidated',
      },
      {
        id: successor.revision.itemId,
        generation: 2,
        predecessor_item_id: initial.revision.itemId,
        retired: false,
        status: 'active',
      },
    ])

    await expect(repository.getCurrent(userId, initial.revision.itemId)).resolves.toMatchObject({
      itemId: initial.revision.itemId,
      revision: 3,
      snapshot: { status: 'invalidated' },
    })
    await expect(repository.getCurrent(userId, successor.revision.itemId)).resolves.toEqual(
      successor.revision,
    )
    await expect(
      pool.query(
        `
          INSERT INTO personal_model_feedback_events (
            id, user_id, item_id, item_revision, choice,
            reason_code, note, context_valid_until, created_at,
            transition_schema_version, outcome, no_op_reason,
            result_revision, result_fingerprint
          )
          VALUES (
            $1, $2, $3, $4, 'uncertain',
            NULL, NULL, NULL, $5,
            'personal-model-feedback-transition-v1', 'no_op',
            'feedback_already_current', NULL, $6
          )
        `,
        [
          randomUUID(),
          userId,
          settled.revision.itemId,
          settled.revision.revision,
          successor.revision.changedAt,
          settled.revision.derivationFingerprint,
        ],
      ),
    ).rejects.toThrow('retired personal model generations cannot accept feedback')
  })
})
