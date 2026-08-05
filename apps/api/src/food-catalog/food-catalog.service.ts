import { createHash, randomUUID } from 'node:crypto'

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  foodCatalogVersion,
  starterFoodCatalog,
  starterFoodCatalogReference,
  type CreateFoodCatalogEntry,
  type CustomFoodCatalogEntry,
  type FoodCatalogEntryHistoryItem,
  type FoodCatalogEntryHistoryQuery,
  type FoodCatalogItem,
  type FoodServing,
  type UpdateFoodCatalogEntry,
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
  category: CustomFoodCatalogEntry['category']
  energy_kcal_per_100g: string
  protein_g_per_100g: string
  carbohydrate_g_per_100g: string
  fat_g_per_100g: string
  fiber_g_per_100g: string | null
  reference: string
  default_amount: string
  default_unit: FoodServing['unit']
  default_grams: string
  revision: number
  idempotency_key: string
  request_hash: string
  archived_at: Date | null
  created_at: Date
  updated_at: Date
}

const customKey = (id: string) => `custom:${id.replaceAll('-', '')}`

const mapCustomEntry = (row: CatalogRow): CustomFoodCatalogEntry => ({
  source: 'custom',
  id: row.id,
  userId: row.user_id,
  foodKey: customKey(row.id),
  name: row.name,
  aliases: row.aliases,
  category: row.category,
  nutrientsPer100g: {
    energyKcal: Number(row.energy_kcal_per_100g),
    proteinG: Number(row.protein_g_per_100g),
    carbohydrateG: Number(row.carbohydrate_g_per_100g),
    fatG: Number(row.fat_g_per_100g),
    ...(row.fiber_g_per_100g === null ? {} : { fiberG: Number(row.fiber_g_per_100g) }),
  },
  reference: row.reference,
  defaultServing: {
    amount: Number(row.default_amount),
    unit: row.default_unit,
    grams: Number(row.default_grams),
  },
  catalogVersion: null,
  revision: row.revision,
  editable: true,
  archivedAt: row.archived_at?.toISOString() ?? null,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
})

const starterItems: FoodCatalogItem[] = starterFoodCatalog.map((entry) => ({
  source: 'starter',
  id: `starter:${entry.foodKey}`,
  foodKey: entry.foodKey,
  name: entry.name,
  aliases: [],
  category: entry.category,
  nutrientsPer100g: { ...entry.nutrientsPer100g },
  reference: starterFoodCatalogReference,
  defaultServing: { ...entry.defaultServing },
  catalogVersion: foodCatalogVersion,
  revision: 1,
  editable: false,
  archivedAt: null,
  createdAt: null,
  updatedAt: null,
}))

const normalizedInput = (input: CreateFoodCatalogEntry | UpdateFoodCatalogEntry) => ({
  name: input.name,
  aliases: input.aliases ?? [],
  category: input.category,
  nutrientsPer100g: input.nutrientsPer100g,
  reference: input.reference,
  defaultServing: input.defaultServing,
})

const requestHash = (input: CreateFoodCatalogEntry) =>
  createHash('sha256')
    .update(JSON.stringify(normalizedInput(input)))
    .digest('hex')

const insertRevision = async (
  executor: QueryExecutor,
  entry: CustomFoodCatalogEntry,
  action: FoodCatalogEntryHistoryItem['action'],
) => {
  await executor.query(
    `INSERT INTO user_food_catalog_revisions (
       id, entry_id, user_id, action, revision, snapshot
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [randomUUID(), entry.id, entry.userId, action, entry.revision, JSON.stringify(entry)],
  )
}

@Injectable()
export class FoodCatalogService {
  constructor(private readonly database: DatabaseService) {}

  async list(userId: string) {
    const custom = await this.database.query<CatalogRow>(
      `SELECT * FROM user_food_catalog_entries
       WHERE user_id = $1 AND archived_at IS NULL
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 200`,
      [userId],
    )
    return {
      starterVersion: foodCatalogVersion,
      items: [...custom.rows.map(mapCustomEntry), ...starterItems],
    }
  }

  async create(userId: string, idempotencyKey: string, input: CreateFoodCatalogEntry) {
    const hash = requestHash(input)
    return this.database.withTransaction(async (client) => {
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId])
      const replay = await client.query<CatalogRow>(
        `SELECT * FROM user_food_catalog_entries
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
      const nutrients = value.nutrientsPer100g
      const serving = value.defaultServing
      const created = await client.query<CatalogRow>(
        `INSERT INTO user_food_catalog_entries (
           id, user_id, name, aliases, category,
           energy_kcal_per_100g, protein_g_per_100g, carbohydrate_g_per_100g,
           fat_g_per_100g, fiber_g_per_100g, reference,
           default_amount, default_unit, default_grams, idempotency_key, request_hash
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
         ) RETURNING *`,
        [
          randomUUID(),
          userId,
          value.name,
          value.aliases,
          value.category,
          nutrients.energyKcal,
          nutrients.proteinG,
          nutrients.carbohydrateG,
          nutrients.fatG,
          nutrients.fiberG ?? null,
          value.reference,
          serving.amount,
          serving.unit,
          serving.grams,
          idempotencyKey,
          hash,
        ],
      )
      const entry = mapCustomEntry(created.rows[0]!)
      await insertRevision(client, entry, 'created')
      return entry
    })
  }

  async update(userId: string, entryId: string, input: UpdateFoodCatalogEntry) {
    return this.database.withTransaction(async (client) => {
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId])
      const owned = await client.query<CatalogRow>(
        `SELECT * FROM user_food_catalog_entries
         WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [entryId, userId],
      )
      const current = owned.rows[0]
      if (!current || current.archived_at) throw new NotFoundException('food entry not found')
      if (current.revision !== input.expectedRevision) {
        throw new ConflictException(
          `food entry revision changed; current revision is ${current.revision}`,
        )
      }
      await this.assertNameAvailable(client, userId, input.name, entryId)
      const value = normalizedInput(input)
      const nutrients = value.nutrientsPer100g
      const serving = value.defaultServing
      const updated = await client.query<CatalogRow>(
        `UPDATE user_food_catalog_entries
         SET name = $1, aliases = $2, category = $3,
             energy_kcal_per_100g = $4, protein_g_per_100g = $5,
             carbohydrate_g_per_100g = $6, fat_g_per_100g = $7,
             fiber_g_per_100g = $8, reference = $9,
             default_amount = $10, default_unit = $11, default_grams = $12,
             revision = revision + 1, updated_at = NOW()
         WHERE id = $13 AND user_id = $14
         RETURNING *`,
        [
          value.name,
          value.aliases,
          value.category,
          nutrients.energyKcal,
          nutrients.proteinG,
          nutrients.carbohydrateG,
          nutrients.fatG,
          nutrients.fiberG ?? null,
          value.reference,
          serving.amount,
          serving.unit,
          serving.grams,
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
        `SELECT * FROM user_food_catalog_entries
         WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [entryId, userId],
      )
      const current = owned.rows[0]
      if (!current || current.archived_at) throw new NotFoundException('food entry not found')
      if (current.revision !== expectedRevision) {
        throw new ConflictException(
          `food entry revision changed; current revision is ${current.revision}`,
        )
      }
      const archived = await client.query<CatalogRow>(
        `UPDATE user_food_catalog_entries
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
    query: FoodCatalogEntryHistoryQuery = { limit: 20 },
  ) {
    const cursor = decodeRecordPageCursor(query.cursor, 'food definition history')
    if (cursor && cursor.id !== entryId) {
      throw new BadRequestException('food definition history cursor is invalid or expired')
    }
    const owned = await this.database.query<{ id: string }>(
      'SELECT id FROM user_food_catalog_entries WHERE id = $1 AND user_id = $2',
      [entryId, userId],
    )
    if (!owned.rows[0]) throw new NotFoundException('food entry not found')
    if (cursor) {
      const anchor = await this.database.query<{ revision: number }>(
        `SELECT revision FROM user_food_catalog_revisions
         WHERE entry_id = $1 AND user_id = $2 AND revision = $3`,
        [entryId, userId, cursor.revision],
      )
      if (!anchor.rows[0]) {
        throw new BadRequestException('food definition history cursor is invalid or expired')
      }
    }
    const revisions = await this.database.query<{
      revision: number
      action: FoodCatalogEntryHistoryItem['action']
      snapshot: CustomFoodCatalogEntry
      changed_at: Date
    }>(
      `SELECT revision, action, snapshot, changed_at
       FROM user_food_catalog_revisions
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
      `SELECT id FROM user_food_catalog_entries
       WHERE user_id = $1 AND archived_at IS NULL
         AND lower(btrim(name)) = lower(btrim($2))
         AND ($3::uuid IS NULL OR id <> $3::uuid)`,
      [userId, name, excludedId ?? null],
    )
    if (duplicate.rows[0]) throw new ConflictException('an active food already uses this name')
  }
}
