import { randomUUID } from 'node:crypto'

import {
  personalModelItemRevisionSchema,
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
    changedAt,
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
      'feedback revisions cannot persist before feedback events are available',
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
    const remaining = await pool.query<{ item_count: string; revision_count: string }>(
      `
      SELECT
        (SELECT COUNT(*) FROM personal_model_items WHERE user_id = $1)::TEXT AS item_count,
        (
          SELECT COUNT(*)
          FROM personal_model_item_revisions
          WHERE user_id = $1 OR item_id = $2
        )::TEXT AS revision_count
    `,
      [userId, itemId],
    )
    expect(remaining.rows[0]).toEqual({ item_count: '0', revision_count: '0' })
  })
})
