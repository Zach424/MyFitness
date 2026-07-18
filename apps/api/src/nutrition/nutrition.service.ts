import { createHash, randomUUID } from 'node:crypto'

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type {
  CreateMeal,
  FavoriteFood,
  FavoriteFoodInput,
  FoodServing,
  FoodSnapshot,
  Meal,
  MealHistoryItem,
  MealItemInput,
  UpdateMeal,
} from '@myfitness/contracts'
import { calculateMeal } from '@myfitness/domain'
import type { QueryResult, QueryResultRow } from 'pg'

import { DatabaseService } from '../database/database.service'

type QueryExecutor = {
  query<T extends QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>>
}

type MealRow = {
  id: string
  user_id: string
  meal_type: Meal['mealType']
  title: string
  source_kind: Meal['source']['kind']
  source_metadata: Record<string, string>
  occurred_at: Date
  timezone: string
  note: string | null
  revision: number
  request_hash: string
  deleted_at: Date | null
  created_at: Date
  updated_at: Date
}

type FoodRow = {
  food_key: string
  food_name: string
  food_category: FoodSnapshot['category']
  energy_kcal_per_100g: string
  protein_g_per_100g: string
  carbohydrate_g_per_100g: string
  fat_g_per_100g: string
  fiber_g_per_100g: string | null
  reference: string | null
}

type ItemRow = FoodRow & {
  id: string
  meal_id: string
  position: number
  display_amount: string
  display_unit: FoodServing['unit']
  canonical_grams: string
}

type FavoriteRow = FoodRow & {
  default_amount: string
  default_unit: FoodServing['unit']
  default_grams: string
  created_at: Date
}

const foodFromRow = (row: FoodRow): FoodSnapshot => ({
  foodKey: row.food_key,
  name: row.food_name,
  category: row.food_category,
  nutrientsPer100g: {
    energyKcal: Number(row.energy_kcal_per_100g),
    proteinG: Number(row.protein_g_per_100g),
    carbohydrateG: Number(row.carbohydrate_g_per_100g),
    fatG: Number(row.fat_g_per_100g),
    ...(row.fiber_g_per_100g === null ? {} : { fiberG: Number(row.fiber_g_per_100g) }),
  },
  ...(row.reference ? { reference: row.reference } : {}),
})

const servingFromItemRow = (row: ItemRow): FoodServing => ({
  amount: Number(row.display_amount),
  unit: row.display_unit,
  grams: Number(row.canonical_grams),
})

const mapMeal = (row: MealRow, rawItems: Array<MealItemInput & { id: string }>): Meal => {
  const calculated = calculateMeal(rawItems)
  return {
    id: row.id,
    userId: row.user_id,
    mealType: row.meal_type,
    title: row.title,
    source: {
      kind: row.source_kind,
      ...(Object.keys(row.source_metadata ?? {}).length ? { metadata: row.source_metadata } : {}),
    },
    items: calculated.items.map((item, index) => ({ ...item, id: rawItems[index]!.id })),
    summary: calculated.summary,
    occurredAt: row.occurred_at.toISOString(),
    timezone: row.timezone,
    note: row.note,
    revision: row.revision,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

const loadMeals = async (executor: QueryExecutor, meals: MealRow[]) => {
  if (!meals.length) return []
  const ids = meals.map((meal) => meal.id)
  const items = await executor.query<ItemRow>(
    `SELECT * FROM nutrition_meal_items WHERE meal_id = ANY($1::uuid[]) ORDER BY position`,
    [ids],
  )
  const byMeal = new Map<string, Array<MealItemInput & { id: string }>>()
  for (const row of items.rows) {
    const current = byMeal.get(row.meal_id) ?? []
    current.push({
      id: row.id,
      position: row.position,
      food: foodFromRow(row),
      serving: servingFromItemRow(row),
    })
    byMeal.set(row.meal_id, current)
  }
  return meals.map((meal) => mapMeal(meal, byMeal.get(meal.id) ?? []))
}

const insertItems = async (executor: QueryExecutor, mealId: string, items: MealItemInput[]) => {
  const result: Array<MealItemInput & { id: string }> = []
  for (const item of items) {
    const id = randomUUID()
    const nutrients = item.food.nutrientsPer100g
    await executor.query(
      `
        INSERT INTO nutrition_meal_items (
          id, meal_id, position, food_key, food_name, food_category,
          energy_kcal_per_100g, protein_g_per_100g, carbohydrate_g_per_100g,
          fat_g_per_100g, fiber_g_per_100g, reference,
          display_amount, display_unit, canonical_grams
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12, $13, $14, $15
        )
      `,
      [
        id,
        mealId,
        item.position,
        item.food.foodKey,
        item.food.name,
        item.food.category,
        nutrients.energyKcal,
        nutrients.proteinG,
        nutrients.carbohydrateG,
        nutrients.fatG,
        nutrients.fiberG ?? null,
        item.food.reference ?? null,
        item.serving.amount,
        item.serving.unit,
        item.serving.grams,
      ],
    )
    result.push({ id, ...item })
  }
  return result
}

const insertRevision = async (
  executor: QueryExecutor,
  meal: Meal,
  action: MealHistoryItem['action'],
) => {
  await executor.query(
    `
      INSERT INTO nutrition_meal_revisions (id, meal_id, user_id, action, revision, snapshot)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [randomUUID(), meal.id, meal.userId, action, meal.revision, JSON.stringify(meal)],
  )
}

const favoriteFromRow = (row: FavoriteRow): FavoriteFood => ({
  food: foodFromRow(row),
  defaultServing: {
    amount: Number(row.default_amount),
    unit: row.default_unit,
    grams: Number(row.default_grams),
  },
  createdAt: row.created_at.toISOString(),
})

@Injectable()
export class NutritionService {
  constructor(private readonly database: DatabaseService) {}

  async create(userId: string, idempotencyKey: string, input: CreateMeal) {
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex')
    return this.database.withTransaction(async (client) => {
      const result = await client.query<MealRow>(
        `
          INSERT INTO nutrition_meals (
            id, user_id, meal_type, title, source_kind, source_metadata,
            occurred_at, timezone, note, idempotency_key, request_hash
          ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11)
          ON CONFLICT (user_id, idempotency_key) DO NOTHING
          RETURNING *
        `,
        [
          randomUUID(),
          userId,
          input.mealType,
          input.title,
          input.source.kind,
          JSON.stringify(input.source.metadata ?? {}),
          input.occurredAt,
          input.timezone,
          input.note ?? null,
          idempotencyKey,
          requestHash,
        ],
      )
      const created = result.rows[0]
      if (created) {
        const items = await insertItems(client, created.id, input.items)
        const meal = mapMeal(created, items)
        await insertRevision(client, meal, 'created')
        return meal
      }

      const existing = await client.query<MealRow>(
        'SELECT * FROM nutrition_meals WHERE user_id = $1 AND idempotency_key = $2',
        [userId, idempotencyKey],
      )
      const row = existing.rows[0]
      if (!row) throw new ConflictException('idempotency conflict could not be resolved')
      if (row.request_hash !== requestHash) {
        throw new ConflictException('idempotency key was already used for a different request')
      }
      if (row.deleted_at) throw new ConflictException('idempotent meal was already deleted')
      return (await loadMeals(client, [row]))[0]!
    })
  }

  async list(userId: string) {
    const meals = await this.database.query<MealRow>(
      `
        SELECT * FROM nutrition_meals
        WHERE user_id = $1 AND deleted_at IS NULL
        ORDER BY occurred_at DESC, created_at DESC
        LIMIT 50
      `,
      [userId],
    )
    return { items: await loadMeals(this.database, meals.rows) }
  }

  async update(userId: string, mealId: string, input: UpdateMeal) {
    return this.database.withTransaction(async (client) => {
      const result = await client.query<MealRow>(
        `
          UPDATE nutrition_meals
          SET meal_type = $1, title = $2, source_kind = $3, source_metadata = $4::jsonb,
              occurred_at = $5, timezone = $6, note = $7,
              revision = revision + 1, updated_at = NOW()
          WHERE id = $8 AND user_id = $9 AND deleted_at IS NULL AND revision = $10
          RETURNING *
        `,
        [
          input.mealType,
          input.title,
          input.source.kind,
          JSON.stringify(input.source.metadata ?? {}),
          input.occurredAt,
          input.timezone,
          input.note ?? null,
          mealId,
          userId,
          input.expectedRevision,
        ],
      )
      const updated = result.rows[0]
      if (!updated) await this.throwMutationFailure(client, userId, mealId)
      await client.query('DELETE FROM nutrition_meal_items WHERE meal_id = $1', [mealId])
      const items = await insertItems(client, mealId, input.items)
      const meal = mapMeal(updated!, items)
      await insertRevision(client, meal, 'updated')
      return meal
    })
  }

  async remove(userId: string, mealId: string, expectedRevision: number) {
    return this.database.withTransaction(async (client) => {
      const result = await client.query<MealRow>(
        `
          UPDATE nutrition_meals
          SET deleted_at = NOW(), revision = revision + 1, updated_at = NOW()
          WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL AND revision = $3
          RETURNING *
        `,
        [mealId, userId, expectedRevision],
      )
      const deleted = result.rows[0]
      if (!deleted) await this.throwMutationFailure(client, userId, mealId)
      const meal = (await loadMeals(client, [deleted!]))[0]!
      await insertRevision(client, meal, 'deleted')
    })
  }

  async history(userId: string, mealId: string) {
    const owned = await this.database.query<{ id: string }>(
      'SELECT id FROM nutrition_meals WHERE id = $1 AND user_id = $2',
      [mealId, userId],
    )
    if (!owned.rows[0]) throw new NotFoundException('meal not found')
    const revisions = await this.database.query<{
      action: MealHistoryItem['action']
      snapshot: Meal
      changed_at: Date
    }>(
      `
        SELECT action, snapshot, changed_at
        FROM nutrition_meal_revisions
        WHERE meal_id = $1 AND user_id = $2
        ORDER BY revision DESC
      `,
      [mealId, userId],
    )
    return {
      mealId,
      items: revisions.rows.map((revision) => ({
        ...revision.snapshot,
        action: revision.action,
        changedAt: revision.changed_at.toISOString(),
      })),
    }
  }

  async listFavorites(userId: string) {
    const rows = await this.database.query<FavoriteRow>(
      'SELECT * FROM nutrition_favorites WHERE user_id = $1 ORDER BY updated_at DESC',
      [userId],
    )
    return { items: rows.rows.map(favoriteFromRow) }
  }

  async saveFavorite(userId: string, input: FavoriteFoodInput) {
    const nutrients = input.food.nutrientsPer100g
    const result = await this.database.query<FavoriteRow>(
      `
        INSERT INTO nutrition_favorites (
          user_id, food_key, food_name, food_category,
          energy_kcal_per_100g, protein_g_per_100g, carbohydrate_g_per_100g,
          fat_g_per_100g, fiber_g_per_100g, reference,
          default_amount, default_unit, default_grams
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (user_id, food_key) DO UPDATE SET
          food_name = EXCLUDED.food_name,
          food_category = EXCLUDED.food_category,
          energy_kcal_per_100g = EXCLUDED.energy_kcal_per_100g,
          protein_g_per_100g = EXCLUDED.protein_g_per_100g,
          carbohydrate_g_per_100g = EXCLUDED.carbohydrate_g_per_100g,
          fat_g_per_100g = EXCLUDED.fat_g_per_100g,
          fiber_g_per_100g = EXCLUDED.fiber_g_per_100g,
          reference = EXCLUDED.reference,
          default_amount = EXCLUDED.default_amount,
          default_unit = EXCLUDED.default_unit,
          default_grams = EXCLUDED.default_grams,
          updated_at = NOW()
        RETURNING *
      `,
      [
        userId,
        input.food.foodKey,
        input.food.name,
        input.food.category,
        nutrients.energyKcal,
        nutrients.proteinG,
        nutrients.carbohydrateG,
        nutrients.fatG,
        nutrients.fiberG ?? null,
        input.food.reference ?? null,
        input.defaultServing.amount,
        input.defaultServing.unit,
        input.defaultServing.grams,
      ],
    )
    return favoriteFromRow(result.rows[0]!)
  }

  async removeFavorite(userId: string, foodKey: string) {
    await this.database.query(
      'DELETE FROM nutrition_favorites WHERE user_id = $1 AND food_key = $2',
      [userId, foodKey],
    )
  }

  private async throwMutationFailure(executor: QueryExecutor, userId: string, mealId: string) {
    const existing = await executor.query<{ revision: number; deleted_at: Date | null }>(
      'SELECT revision, deleted_at FROM nutrition_meals WHERE id = $1 AND user_id = $2',
      [mealId, userId],
    )
    const row = existing.rows[0]
    if (!row || row.deleted_at) throw new NotFoundException('meal not found')
    throw new ConflictException(`meal revision changed; current revision is ${row.revision}`)
  }
}
