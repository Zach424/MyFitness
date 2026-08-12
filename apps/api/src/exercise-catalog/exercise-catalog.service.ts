import { createHash, randomUUID } from 'node:crypto'

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  exerciseCatalogVersion,
  starterExerciseCatalog,
  type CreateExerciseCatalogEntry,
  type CustomExerciseCatalogEntry,
  type ExerciseCatalogEntryHistoryItem,
  type ExerciseCatalogEntryHistoryQuery,
  type ExerciseCatalogItem,
  type ExerciseEquipment,
  type ExerciseMuscleMapping,
  type ExerciseTrackingMode,
  type UpdateExerciseCatalogEntry,
} from '@myfitness/contracts'
import type { QueryResult, QueryResultRow } from 'pg'

import { DatabaseService } from '../database/database.service'
import { decodeRecordPageCursor, encodeRecordPageCursor } from '../pagination/record-page-cursor'

type QueryExecutor = {
  query<T extends QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>>
}

type CatalogRow = QueryResultRow & {
  id: string
  user_id: string
  name: string
  aliases: string[]
  category: CustomExerciseCatalogEntry['category']
  tracking_mode: ExerciseTrackingMode
  equipment: ExerciseEquipment[]
  equipment_notes: string | null
  muscle_model_version: 'ilens-muscle-model-v1' | null
  muscle_mapping_source: 'user_confirmed' | null
  primary_muscles: ExerciseMuscleMapping['primaryMuscles']
  secondary_muscles: ExerciseMuscleMapping['secondaryMuscles']
  revision: number
  idempotency_key: string
  request_hash: string
  archived_at: Date | null
  created_at: Date
  updated_at: Date
}

const customKey = (id: string) => `custom_${id.replaceAll('-', '')}`

const unmappedMuscles = (): ExerciseMuscleMapping => ({
  status: 'unmapped',
  modelVersion: null,
  source: null,
  primaryMuscles: [],
  secondaryMuscles: [],
})

const mapMuscles = (row: CatalogRow): ExerciseMuscleMapping =>
  row.muscle_model_version === null
    ? unmappedMuscles()
    : {
        status: 'mapped',
        modelVersion: row.muscle_model_version,
        source: row.muscle_mapping_source!,
        primaryMuscles: row.primary_muscles,
        secondaryMuscles: row.secondary_muscles,
      }

const mapCustomEntry = (row: CatalogRow): CustomExerciseCatalogEntry => ({
  source: 'custom',
  id: row.id,
  userId: row.user_id,
  key: customKey(row.id),
  name: row.name,
  aliases: row.aliases,
  category: row.category,
  trackingMode: row.tracking_mode,
  equipment: row.equipment,
  equipmentNotes: row.equipment_notes,
  muscleMapping: mapMuscles(row),
  catalogVersion: null,
  revision: row.revision,
  editable: true,
  archivedAt: row.archived_at?.toISOString() ?? null,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
})

const starterItems: ExerciseCatalogItem[] = starterExerciseCatalog.map((entry) => ({
  source: 'starter',
  id: `starter:${entry.key}`,
  key: entry.key,
  name: entry.name,
  aliases: [...entry.aliases],
  category: entry.category,
  trackingMode: entry.trackingMode,
  equipment: [...entry.equipment],
  equipmentNotes: null,
  muscleMapping:
    entry.muscleMapping.status === 'mapped'
      ? {
          ...entry.muscleMapping,
          primaryMuscles: [...entry.muscleMapping.primaryMuscles],
          secondaryMuscles: [...entry.muscleMapping.secondaryMuscles],
        }
      : unmappedMuscles(),
  catalogVersion: exerciseCatalogVersion,
  revision: 1,
  editable: false,
  archivedAt: null,
  createdAt: null,
  updatedAt: null,
}))

const mappedInputFromRow = (row: CatalogRow) =>
  row.muscle_model_version === null
    ? null
    : {
        modelVersion: row.muscle_model_version,
        primaryMuscles: row.primary_muscles,
        secondaryMuscles: row.secondary_muscles,
      }

const normalizedInput = (
  input: CreateExerciseCatalogEntry | UpdateExerciseCatalogEntry,
  existingMuscleMapping: ReturnType<typeof mappedInputFromRow> = null,
) => ({
  name: input.name,
  aliases: input.aliases ?? [],
  category: input.category,
  trackingMode: input.trackingMode,
  equipment: input.equipment,
  equipmentNotes: input.equipmentNotes ?? null,
  muscleMapping: input.muscleMapping === undefined ? existingMuscleMapping : input.muscleMapping,
})

const requestHash = (input: CreateExerciseCatalogEntry) =>
  createHash('sha256')
    .update(JSON.stringify(normalizedInput(input)))
    .digest('hex')

const insertRevision = async (
  executor: QueryExecutor,
  entry: CustomExerciseCatalogEntry,
  action: ExerciseCatalogEntryHistoryItem['action'],
) => {
  await executor.query(
    `INSERT INTO user_exercise_catalog_revisions (
       id, entry_id, user_id, action, revision, snapshot
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [randomUUID(), entry.id, entry.userId, action, entry.revision, JSON.stringify(entry)],
  )
}

@Injectable()
export class ExerciseCatalogService {
  constructor(private readonly database: DatabaseService) {}

  async list(userId: string) {
    const custom = await this.database.query<CatalogRow>(
      `SELECT * FROM user_exercise_catalog_entries
       WHERE user_id = $1 AND archived_at IS NULL
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 200`,
      [userId],
    )
    return {
      starterVersion: exerciseCatalogVersion,
      items: [...custom.rows.map(mapCustomEntry), ...starterItems],
    }
  }

  async create(userId: string, idempotencyKey: string, input: CreateExerciseCatalogEntry) {
    const hash = requestHash(input)
    return this.database.withTransaction(async (client) => {
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId])
      const replay = await client.query<CatalogRow>(
        `SELECT * FROM user_exercise_catalog_entries
         WHERE user_id = $1 AND idempotency_key = $2`,
        [userId, idempotencyKey],
      )
      if (replay.rows[0]) {
        if (replay.rows[0].request_hash !== hash) {
          throw new ConflictException('idempotency key was already used for a different request')
        }
        return mapCustomEntry(replay.rows[0])
      }
      await this.assertNameAvailable(client, userId, input.name)
      const value = normalizedInput(input)
      const created = await client.query<CatalogRow>(
        `INSERT INTO user_exercise_catalog_entries (
           id, user_id, name, aliases, category, tracking_mode, equipment,
           equipment_notes, muscle_model_version, muscle_mapping_source,
           primary_muscles, secondary_muscles, idempotency_key, request_hash
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          randomUUID(),
          userId,
          value.name,
          value.aliases,
          value.category,
          value.trackingMode,
          value.equipment,
          value.equipmentNotes,
          value.muscleMapping?.modelVersion ?? null,
          value.muscleMapping ? 'user_confirmed' : null,
          value.muscleMapping?.primaryMuscles ?? [],
          value.muscleMapping?.secondaryMuscles ?? [],
          idempotencyKey,
          hash,
        ],
      )
      const entry = mapCustomEntry(created.rows[0]!)
      await insertRevision(client, entry, 'created')
      return entry
    })
  }

  async update(userId: string, entryId: string, input: UpdateExerciseCatalogEntry) {
    return this.database.withTransaction(async (client) => {
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId])
      const owned = await client.query<CatalogRow>(
        `SELECT * FROM user_exercise_catalog_entries
         WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [entryId, userId],
      )
      const current = owned.rows[0]
      if (!current || current.archived_at) throw new NotFoundException('exercise entry not found')
      if (current.revision !== input.expectedRevision) {
        throw new ConflictException(
          `exercise entry revision changed; current revision is ${current.revision}`,
        )
      }
      await this.assertNameAvailable(client, userId, input.name, entryId)
      const value = normalizedInput(input, mappedInputFromRow(current))
      const updated = await client.query<CatalogRow>(
        `UPDATE user_exercise_catalog_entries
         SET name = $1, aliases = $2, category = $3, tracking_mode = $4,
             equipment = $5, equipment_notes = $6,
             muscle_model_version = $7, muscle_mapping_source = $8,
             primary_muscles = $9, secondary_muscles = $10,
             revision = revision + 1, updated_at = NOW()
         WHERE id = $11 AND user_id = $12
         RETURNING *`,
        [
          value.name,
          value.aliases,
          value.category,
          value.trackingMode,
          value.equipment,
          value.equipmentNotes,
          value.muscleMapping?.modelVersion ?? null,
          value.muscleMapping ? 'user_confirmed' : null,
          value.muscleMapping?.primaryMuscles ?? [],
          value.muscleMapping?.secondaryMuscles ?? [],
          entryId,
          userId,
        ],
      )
      const entry = mapCustomEntry(updated.rows[0]!)
      await insertRevision(client, entry, 'updated')
      return entry
    })
  }

  async archive(userId: string, entryId: string, expectedRevision: number) {
    return this.database.withTransaction(async (client) => {
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId])
      const owned = await client.query<CatalogRow>(
        `SELECT * FROM user_exercise_catalog_entries
         WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [entryId, userId],
      )
      const current = owned.rows[0]
      if (!current || current.archived_at) throw new NotFoundException('exercise entry not found')
      if (current.revision !== expectedRevision) {
        throw new ConflictException(
          `exercise entry revision changed; current revision is ${current.revision}`,
        )
      }
      const archived = await client.query<CatalogRow>(
        `UPDATE user_exercise_catalog_entries
         SET archived_at = NOW(), revision = revision + 1, updated_at = NOW()
         WHERE id = $1 AND user_id = $2
         RETURNING *`,
        [entryId, userId],
      )
      const entry = mapCustomEntry(archived.rows[0]!)
      await insertRevision(client, entry, 'archived')
      return entry
    })
  }

  async history(
    userId: string,
    entryId: string,
    query: ExerciseCatalogEntryHistoryQuery = { limit: 20 },
  ) {
    const cursor = decodeRecordPageCursor(query.cursor, 'exercise definition history')
    if (cursor && cursor.id !== entryId) {
      throw new BadRequestException('exercise definition history cursor is invalid or expired')
    }
    const owned = await this.database.query<{ id: string }>(
      'SELECT id FROM user_exercise_catalog_entries WHERE id = $1 AND user_id = $2',
      [entryId, userId],
    )
    if (!owned.rows[0]) throw new NotFoundException('exercise entry not found')
    if (cursor) {
      const anchor = await this.database.query<{ revision: number }>(
        `SELECT revision FROM user_exercise_catalog_revisions
         WHERE entry_id = $1 AND user_id = $2 AND revision = $3`,
        [entryId, userId, cursor.revision],
      )
      if (!anchor.rows[0]) {
        throw new BadRequestException('exercise definition history cursor is invalid or expired')
      }
    }
    const revisions = await this.database.query<{
      revision: number
      action: ExerciseCatalogEntryHistoryItem['action']
      snapshot: CustomExerciseCatalogEntry
      changed_at: Date
    }>(
      `SELECT revision, action, snapshot, changed_at
       FROM user_exercise_catalog_revisions
       WHERE entry_id = $1 AND user_id = $2
         AND ($3::integer IS NULL OR revision < $3)
       ORDER BY revision DESC
       LIMIT $4`,
      [entryId, userId, cursor?.revision ?? null, query.limit + 1],
    )
    const hasMore = revisions.rows.length > query.limit
    const rows = revisions.rows.slice(0, query.limit)
    const items = rows.map((row) => ({
      ...row.snapshot,
      action: row.action,
      changedAt: row.changed_at.toISOString(),
    }))
    const last = rows.at(-1)
    return {
      entryId,
      items,
      nextCursor:
        hasMore && last ? encodeRecordPageCursor({ id: entryId, revision: last.revision }) : null,
    }
  }

  private async assertNameAvailable(
    executor: QueryExecutor,
    userId: string,
    name: string,
    excludedId?: string,
  ) {
    const duplicate = await executor.query<{ id: string }>(
      `SELECT id FROM user_exercise_catalog_entries
       WHERE user_id = $1 AND archived_at IS NULL
         AND lower(btrim(name)) = lower(btrim($2))
         AND ($3::uuid IS NULL OR id <> $3::uuid)`,
      [userId, name, excludedId ?? null],
    )
    if (duplicate.rows[0]) throw new ConflictException('an active exercise already uses this name')
  }
}
