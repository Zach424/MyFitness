import { Injectable } from '@nestjs/common'
import {
  personalModelItemRevisionSchema,
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

type LockedPersonalModelItemRow = {
  current_revision: number
} & PersonalModelRevisionRow

const maximumHistoryPageSize = 50

const mapRevisionRow = (row: PersonalModelRevisionRow): PersonalModelItemRevision =>
  personalModelItemRevisionSchema.parse({
    schemaVersion: row.schema_version,
    id: row.id,
    userId: row.user_id,
    itemId: row.item_id,
    revision: row.revision,
    previousRevision: row.previous_revision,
    action: row.action,
    snapshot: row.snapshot,
    derivationFingerprint: row.derivation_fingerprint.trim(),
    feedbackEventId: row.feedback_event_id,
    changedAt: row.changed_at.toISOString(),
  })

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
  return mapRevisionRow(stored)
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
        'feedback revisions cannot persist before feedback events are available',
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
      const locked = await client.query<LockedPersonalModelItemRow>(
        `
          SELECT
            item.current_revision,
            revision.id,
            revision.user_id,
            revision.item_id,
            revision.schema_version,
            revision.revision,
            revision.previous_revision,
            revision.action,
            revision.snapshot,
            revision.derivation_fingerprint,
            revision.feedback_event_id,
            revision.changed_at
          FROM personal_model_items AS item
          JOIN personal_model_item_revisions AS revision
            ON revision.user_id = item.user_id
           AND revision.item_id = item.id
           AND revision.revision = item.current_revision
          WHERE item.user_id = $1 AND item.id = $2
          FOR UPDATE OF item
        `,
        [userId, itemId],
      )
      const currentRow = locked.rows[0]
      if (!currentRow) throw new PersonalModelItemNotFoundError()
      if (currentRow.current_revision !== expectedRevision) {
        throw new PersonalModelRevisionConflictError(
          `personal model revision changed; current revision is ${currentRow.current_revision}`,
        )
      }

      const current = mapRevisionRow(currentRow)
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
