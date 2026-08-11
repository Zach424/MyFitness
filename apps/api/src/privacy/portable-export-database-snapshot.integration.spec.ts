import { createHash, randomUUID } from 'node:crypto'

import { mealSchema, privacyExportSchema, privacyExportSchemaVersion } from '@myfitness/contracts'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getRuntimeConfig } from '../config'
import { DatabaseService } from '../database/database.service'
import { runMigrations } from '../database/migrate'
import { serializePortableExport } from './portable-export-artifact'
import {
  PortableExportDatabaseSnapshotService,
  PortableExportNutritionMealRevisionSnapshotNotDecomposableError,
  type PortableExportNutritionMealLayerSnapshotMeal,
  PortableExportSnapshotPayloadTooLargeError,
  PortableExportWorkoutRevisionSnapshotNotDecomposableError,
  portableExportExerciseCatalogEntryPageQuery,
  portableExportFoodCatalogEntryPageQuery,
  portableExportNutritionMealItemPageQuery,
  portableExportNutritionMealRevisionHeaderPageQuery,
  portableExportSnapshotMaximumPayloadBytes,
  portableExportWorkoutExerciseHeaderPageQuery,
  portableExportWorkoutHeaderPageQuery,
  portableExportWorkoutRevisionHeaderPageQuery,
  portableExportWorkoutSetPageQuery,
} from './portable-export-database-snapshot'
import {
  createPortableExportConsentHealthCatalogJsonSource,
  createPortableExportConsentHealthCatalogWorkoutJsonSource,
  createPortableExportConsentHealthExerciseCatalogJsonSource,
} from './portable-export-exercise-catalog-json-source'
import {
  createPortableExportJsonStream,
  portableExportJsonAsyncArray,
} from './portable-export-json-stream'
import { createPortableExportNutritionMealJsonSource } from './portable-export-nutrition-meal-json-source'
import { createPortableExportWorkoutJsonSource } from './portable-export-workout-json-source'

describe('portable export bounded PostgreSQL snapshot', () => {
  const config = getRuntimeConfig()
  const pool = new Pool({ connectionString: config.databaseUrl })
  const database = new DatabaseService()
  const snapshots = new PortableExportDatabaseSnapshotService(database)
  const users = new Set<string>()

  const createUser = async (status: 'active' | 'disabled' = 'active') => {
    const id = randomUUID()
    users.add(id)
    await pool.query('INSERT INTO users (id, status) VALUES ($1, $2)', [id, status])
    return id
  }

  const createRecord = async (
    userId: string,
    occurredAt: string,
    value: number,
    createdAt = occurredAt,
    sourceMetadata: Record<string, string> = {},
  ) => {
    const id = randomUUID()
    await pool.query(
      `INSERT INTO health_records (
         id, user_id, metric, canonical_value, canonical_unit,
         display_value, display_unit, source_kind, source_metadata,
         confidence, status, occurred_at, timezone, idempotency_key, request_hash,
         created_at, updated_at
       ) VALUES (
         $1, $2, 'body.weight', $3, 'kg', $3, 'kg', 'manual', $7::jsonb,
         NULL, 'confirmed', $4::timestamptz, 'Asia/Shanghai', $5, repeat('a', 64),
         $6::timestamptz, $6::timestamptz
       )`,
      [
        id,
        userId,
        value,
        occurredAt,
        `snapshot-${randomUUID()}`,
        createdAt,
        JSON.stringify(sourceMetadata),
      ],
    )
    return id
  }

  const createRevision = async (
    userId: string,
    recordId: string,
    changedAt: string,
    revision = 1,
    sourceMetadata: Record<string, string> = {},
  ) => {
    const id = randomUUID()
    const result = await pool.query(
      `INSERT INTO health_record_revisions (
         id, record_id, user_id, action, revision, metric,
         canonical_value, canonical_unit, display_value, display_unit,
         source_kind, source_metadata, confidence, status,
         occurred_at, timezone, created_at, updated_at, changed_at
       )
       SELECT $1, record.id, record.user_id, 'created', $2, record.metric,
              record.canonical_value, record.canonical_unit,
              record.display_value, record.display_unit,
              record.source_kind, $3::jsonb, record.confidence, record.status,
              record.occurred_at, record.timezone, record.created_at, record.updated_at,
              $4::timestamptz
       FROM health_records AS record
       WHERE record.id = $5 AND record.user_id = $6`,
      [id, revision, JSON.stringify(sourceMetadata), changedAt, recordId, userId],
    )
    if (result.rowCount !== 1) throw new Error('revision fixture record was not found')
    return id
  }

  const createConsentEvent = async (userId: string, acceptedAt: string, purpose = 'privacy') => {
    const id = randomUUID()
    await pool.query(
      `INSERT INTO consent_events (id, user_id, purpose, version, accepted_at)
       VALUES ($1, $2, $3, $4, $5::timestamptz)`,
      [id, userId, purpose, `snapshot-${randomUUID()}`.slice(0, 40), acceptedAt],
    )
    return id
  }

  const createExerciseCatalogEntry = async (
    userId: string,
    createdAt: string,
    options: {
      id?: string
      name?: string
      revision?: number
      archivedAt?: string | null
    } = {},
  ) => {
    const id = options.id ?? randomUUID()
    await pool.query(
      `INSERT INTO user_exercise_catalog_entries (
         id, user_id, name, aliases, category, tracking_mode, equipment,
         equipment_notes, revision, idempotency_key, request_hash,
         archived_at, created_at, updated_at
       ) VALUES (
         $1, $2, $3, ARRAY['fixture alias']::text[], 'strength', 'reps_load',
         ARRAY['bodyweight']::text[], NULL, $4, $5, repeat('e', 64),
         $6::timestamptz, $7::timestamptz, $7::timestamptz
       )`,
      [
        id,
        userId,
        options.name ?? `Catalog ${id.slice(0, 8)}`,
        options.revision ?? 1,
        `catalog-export-${randomUUID()}`,
        options.archivedAt ?? null,
        createdAt,
      ],
    )
    return id
  }

  const createExerciseCatalogRevision = async (
    userId: string,
    entryId: string,
    revision: number,
    changedAt: string,
    action: 'created' | 'updated' | 'archived' = 'created',
  ) => {
    const id = randomUUID()
    const entry = await pool.query<{
      name: string
      archived_at: Date | null
      created_at: Date
      updated_at: Date
    }>(
      `SELECT name, archived_at, created_at, updated_at
       FROM user_exercise_catalog_entries WHERE id = $1 AND user_id = $2`,
      [entryId, userId],
    )
    const row = entry.rows[0]
    if (!row) throw new Error('exercise catalog fixture entry was not found')
    const snapshot = {
      source: 'custom',
      id: entryId,
      userId,
      key: `custom_${entryId.replaceAll('-', '')}`,
      name: row.name,
      aliases: ['fixture alias'],
      category: 'strength',
      trackingMode: 'reps_load',
      equipment: ['bodyweight'],
      equipmentNotes: null,
      catalogVersion: null,
      revision,
      editable: true,
      archivedAt: row.archived_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }
    await pool.query(
      `INSERT INTO user_exercise_catalog_revisions (
         id, entry_id, user_id, action, revision, snapshot, changed_at
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz)`,
      [id, entryId, userId, action, revision, JSON.stringify(snapshot), changedAt],
    )
    return id
  }

  const createFoodCatalogEntry = async (
    userId: string,
    createdAt: string,
    options: {
      id?: string
      name?: string
      revision?: number
      archivedAt?: string | null
    } = {},
  ) => {
    const id = options.id ?? randomUUID()
    await pool.query(
      `INSERT INTO user_food_catalog_entries (
         id, user_id, name, aliases, category,
         energy_kcal_per_100g, protein_g_per_100g, carbohydrate_g_per_100g,
         fat_g_per_100g, fiber_g_per_100g, reference,
         default_amount, default_unit, default_grams, revision,
         idempotency_key, request_hash, archived_at, created_at, updated_at
       ) VALUES (
         $1, $2, $3, ARRAY['fixture alias']::text[], 'staple',
         372, 13.5, 58.7, 7, 10.1, 'fixture nutrition reference',
         50, 'g', 50, $4, $5, repeat('f', 64),
         $6::timestamptz, $7::timestamptz, $7::timestamptz
       )`,
      [
        id,
        userId,
        options.name ?? `Food ${id.slice(0, 8)}`,
        options.revision ?? 1,
        `food-export-${randomUUID()}`,
        options.archivedAt ?? null,
        createdAt,
      ],
    )
    return id
  }

  const createFoodCatalogRevision = async (
    userId: string,
    entryId: string,
    revision: number,
    changedAt: string,
    action: 'created' | 'updated' | 'archived' = 'created',
  ) => {
    const id = randomUUID()
    const entry = await pool.query<{
      name: string
      archived_at: Date | null
      created_at: Date
      updated_at: Date
    }>(
      `SELECT name, archived_at, created_at, updated_at
       FROM user_food_catalog_entries WHERE id = $1 AND user_id = $2`,
      [entryId, userId],
    )
    const row = entry.rows[0]
    if (!row) throw new Error('food catalog fixture entry was not found')
    const snapshot = {
      source: 'custom',
      id: entryId,
      userId,
      key: `custom_${entryId.replaceAll('-', '')}`,
      name: row.name,
      aliases: ['fixture alias'],
      category: 'staple',
      energyKcalPer100g: 372,
      proteinGPer100g: 13.5,
      carbohydrateGPer100g: 58.7,
      fatGPer100g: 7,
      fiberGPer100g: 10.1,
      reference: 'fixture nutrition reference',
      defaultAmount: 50,
      defaultUnit: 'g',
      defaultGrams: 50,
      revision,
      editable: true,
      archivedAt: row.archived_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }
    await pool.query(
      `INSERT INTO user_food_catalog_revisions (
         id, entry_id, user_id, action, revision, snapshot, changed_at
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz)`,
      [id, entryId, userId, action, revision, JSON.stringify(snapshot), changedAt],
    )
    return id
  }

  const createWorkout = async (
    userId: string,
    startedAt: string,
    createdAt = startedAt,
    options: { id?: string; deletedAt?: string | null; title?: string } = {},
  ) => {
    const id = options.id ?? randomUUID()
    await pool.query(
      `INSERT INTO workout_sessions (
         id, user_id, title, status, source_kind, source_metadata, started_at, ended_at,
         timezone, pain_level, fatigue, note, revision, idempotency_key, request_hash,
         deleted_at, created_at, updated_at
       ) VALUES (
         $1, $2, $3, 'completed', 'manual', '{"fixture":"workout-header"}'::jsonb,
         $4::timestamptz, $4::timestamptz, 'Asia/Shanghai', 0, 3, 'header only', 1,
         $5, repeat('b', 64), $6::timestamptz, $7::timestamptz, $7::timestamptz
       )`,
      [
        id,
        userId,
        options.title ?? `Workout ${id.slice(0, 8)}`,
        startedAt,
        `workout-header-${randomUUID()}`,
        options.deletedAt ?? null,
        createdAt,
      ],
    )
    return id
  }

  const createWorkoutExercise = async (
    workoutId: string,
    position: number,
    options: { id?: string; name?: string } = {},
  ) => {
    const id = options.id ?? randomUUID()
    await pool.query(
      `INSERT INTO workout_exercises (
         id, workout_id, position, exercise_key, name, category, notes,
         tracking_mode, equipment, equipment_notes
       ) VALUES (
         $1, $2, $3, $4, $5, 'strength', $6,
         'reps_load', ARRAY['bodyweight']::text[], NULL
       )`,
      [
        id,
        workoutId,
        position,
        `fixture_${id.replaceAll('-', '')}`,
        options.name ?? `Exercise ${position}`,
        `exercise position ${position}`,
      ],
    )
    return id
  }

  const createWorkoutSet = async (exerciseId: string, position: number) => {
    const id = randomUUID()
    await pool.query(
      `INSERT INTO workout_sets (
         id, exercise_id, position, kind, reps, display_load, display_load_unit,
         canonical_load_kg, duration_seconds, distance_meters, rpe, completed
       ) VALUES (
         $1, $2, $3, 'working', 10, 20, 'kg', 20, NULL, NULL, 7, true
       )`,
      [id, exerciseId, position],
    )
    return id
  }

  const createWorkoutRevision = async (
    userId: string,
    workoutId: string,
    revision: number,
    changedAt: string,
    action: 'created' | 'updated' | 'deleted' = revision === 1 ? 'created' : 'updated',
    snapshot: Record<string, unknown> = {
      id: workoutId,
      revision,
      fixture: 'immutable',
    },
  ) => {
    const id = randomUUID()
    await pool.query(
      `INSERT INTO workout_revisions (
         id, workout_id, user_id, action, revision, snapshot, changed_at
       ) VALUES (
         $1, $2, $3, $4, $5::integer,
         $7::jsonb,
         $6::timestamptz
       )`,
      [id, workoutId, userId, action, revision, changedAt, JSON.stringify(snapshot)],
    )
    return id
  }

  const workoutRevisionSnapshot = (
    userId: string,
    workoutId: string,
    revision: number,
    exercises: Array<Record<string, unknown>>,
    extra: Record<string, unknown> = {},
  ) => ({
    id: workoutId,
    userId,
    title: `Snapshot ${revision}`,
    status: 'completed',
    source: { kind: 'manual' },
    exercises,
    summary: {
      completedSets: exercises.length,
      totalSets: exercises.length,
      volumeKg: 0,
      distanceMeters: 0,
      activeSeconds: 0,
    },
    startedAt: '2026-08-11T02:10:00.000Z',
    endedAt: '2026-08-11T02:20:00.000Z',
    timezone: 'Asia/Shanghai',
    painLevel: 0,
    fatigue: 3,
    note: null,
    revision,
    createdAt: '2026-08-11T02:10:00.000Z',
    updatedAt: '2026-08-11T02:20:00.000Z',
    ...extra,
  })

  const createNutritionMealBoundaryFixture = async (
    userId: string,
    revisionCount = 4,
    itemCount = 30,
  ) => {
    const mealId = randomUUID()
    const secretMarker = `meal-shape-${randomUUID()}`
    const occurredAt = '2026-08-11T02:30:00.000Z'
    const createdAt = '2026-08-11T02:31:00.000Z'
    const items = Array.from({ length: itemCount }, (_, index) => ({
      id: randomUUID(),
      position: index + 1,
      food: {
        foodKey: `boundary_${String(index + 1).padStart(2, '0')}_${'x'.repeat(100)}`.slice(0, 100),
        name: `${secretMarker}-${index + 1}-${'n'.repeat(100)}`.slice(0, 100),
        category: 'custom' as const,
        nutrientsPer100g: {
          energyKcal: 1_000,
          proteinG: 100,
          carbohydrateG: 100,
          fatG: 100,
          fiberG: 100,
        },
        reference: 'r'.repeat(200),
      },
      serving: { amount: 10_000, unit: 'serving' as const, grams: 10_000 },
      summary: {
        energyKcal: 100_000,
        proteinG: 10_000,
        carbohydrateG: 10_000,
        fatG: 10_000,
        fiberG: 10_000,
      },
    }))

    await pool.query(
      `INSERT INTO nutrition_meals (
         id, user_id, meal_type, title, source_kind, source_metadata, occurred_at, timezone,
         note, revision, idempotency_key, request_hash, created_at, updated_at
       ) VALUES (
         $1, $2, 'dinner', $3, 'manual', $4::jsonb, $5::timestamptz, 'Asia/Shanghai',
         $6, $7, $8, repeat('m', 64), $9::timestamptz, $9::timestamptz
       )`,
      [
        mealId,
        userId,
        `${secretMarker}-${'t'.repeat(80)}`.slice(0, 80),
        JSON.stringify({ provider: 'p'.repeat(80), externalId: 'e'.repeat(160) }),
        occurredAt,
        'o'.repeat(500),
        revisionCount,
        `meal-shape-${randomUUID()}`,
        createdAt,
      ],
    )

    for (const item of items) {
      await pool.query(
        `INSERT INTO nutrition_meal_items (
           id, meal_id, position, food_key, food_name, food_category,
           energy_kcal_per_100g, protein_g_per_100g, carbohydrate_g_per_100g,
           fat_g_per_100g, fiber_g_per_100g, reference,
           display_amount, display_unit, canonical_grams
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           $7, $8, $9, $10, $11, $12,
           $13, $14, $15
         )`,
        [
          item.id,
          mealId,
          item.position,
          item.food.foodKey,
          item.food.name,
          item.food.category,
          item.food.nutrientsPer100g.energyKcal,
          item.food.nutrientsPer100g.proteinG,
          item.food.nutrientsPer100g.carbohydrateG,
          item.food.nutrientsPer100g.fatG,
          item.food.nutrientsPer100g.fiberG,
          item.food.reference,
          item.serving.amount,
          item.serving.unit,
          item.serving.grams,
        ],
      )
    }

    for (let revision = 1; revision <= revisionCount; revision += 1) {
      const snapshot = mealSchema.parse({
        id: mealId,
        userId,
        mealType: 'dinner',
        title: `${secretMarker}-${'t'.repeat(80)}`.slice(0, 80),
        source: {
          kind: 'manual',
          metadata: { provider: 'p'.repeat(80), externalId: 'e'.repeat(160) },
        },
        items,
        summary: {
          energyKcal: 3_000_000,
          proteinG: 300_000,
          carbohydrateG: 300_000,
          fatG: 300_000,
          fiberG: 300_000,
        },
        occurredAt,
        timezone: 'Asia/Shanghai',
        note: 'o'.repeat(500),
        revision,
        createdAt,
        updatedAt: `2026-08-11T02:${String(31 + revision).padStart(2, '0')}:00.000Z`,
      })
      await pool.query(
        `INSERT INTO nutrition_meal_revisions (
           id, meal_id, user_id, action, revision, snapshot, changed_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz
         )`,
        [
          randomUUID(),
          mealId,
          userId,
          revision === 1 ? 'created' : 'updated',
          revision,
          JSON.stringify(snapshot),
          `2026-08-11T03:${String(revision).padStart(2, '0')}:00.000Z`,
        ],
      )
    }

    return { mealId, secretMarker, firstItemId: items[0]?.id }
  }

  const materializeNutritionMeals = async (
    meals: AsyncIterable<PortableExportNutritionMealLayerSnapshotMeal>,
  ) => {
    const values: Array<Record<string, unknown>> = []
    for await (const meal of meals) {
      const value = { ...meal.header }
      const items: Array<Record<string, unknown>> = []
      for await (const item of meal.items) items.push(item)
      value.items = items
      const history: Array<Record<string, unknown>> = []
      for await (const revision of meal.history) {
        const snapshot = { ...revision.snapshot }
        const snapshotItems: Array<Record<string, unknown>> = []
        for await (const item of revision.snapshot.items) snapshotItems.push(item)
        snapshot.items = snapshotItems
        history.push({ ...revision, snapshot })
      }
      value.history = history
      values.push(value)
    }
    return values
  }

  beforeAll(async () => {
    await runMigrations(config.databaseUrl)
  })

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[...users]])
    await database.onModuleDestroy()
    await pool.end()
  })

  it('audits an unbounded meal history without aggregating its sensitive snapshots', async () => {
    const userId = await createUser()
    const otherUserId = await createUser()
    const { mealId, secretMarker } = await createNutritionMealBoundaryFixture(userId)

    const receipt = await snapshots.inspectNutritionMealShape(userId, mealId)

    expect(receipt).toMatchObject({
      schemaVersion: 'myfitness-portable-export-nutrition-meal-shape/v1',
      mealRevision: 4,
      currentItemCount: 30,
      revisionCount: 4,
      maximumRevisionItemCount: 30,
      revisionSnapshotsHaveItemArrays: true,
      historyAggregateExceedsPayloadBoundary: true,
    })
    expect(receipt.headerBytes).toBeLessThan(portableExportSnapshotMaximumPayloadBytes)
    expect(receipt.currentItemPayloadBytes).toBeLessThan(portableExportSnapshotMaximumPayloadBytes)
    expect(receipt.maximumCurrentItemBytes).toBeLessThan(portableExportSnapshotMaximumPayloadBytes)
    expect(receipt.revisionPayloadBytes).toBeGreaterThan(portableExportSnapshotMaximumPayloadBytes)
    expect(receipt.maximumRevisionPayloadBytes).toBeLessThan(
      portableExportSnapshotMaximumPayloadBytes,
    )
    expect(JSON.stringify(receipt)).not.toContain(secretMarker)
    expect(JSON.stringify(receipt)).not.toContain(userId)
    expect(JSON.stringify(receipt)).not.toContain(mealId)
    await expect(snapshots.inspectNutritionMealShape(otherUserId, mealId)).rejects.toThrowError(
      'nutrition meal not found',
    )

    const definition = await pool.query<{ index_definition: string; predicate: string | null }>(
      `SELECT pg_get_indexdef(indexrelid) AS index_definition,
              pg_get_expr(indpred, indrelid) AS predicate
       FROM pg_index
       WHERE indexrelid = 'nutrition_meals_user_export_idx'::regclass`,
    )
    expect(definition.rows).toEqual([
      expect.objectContaining({
        index_definition: expect.stringContaining('(user_id, occurred_at, created_at, id)'),
        predicate: null,
      }),
    ])

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SET LOCAL enable_seqscan = off')
      const plan = await client.query<{ 'QUERY PLAN': unknown }>(
        `EXPLAIN (FORMAT JSON, COSTS OFF)
         SELECT id, occurred_at, created_at
         FROM nutrition_meals
         WHERE user_id = $1
         ORDER BY occurred_at, created_at, id`,
        [userId],
      )
      expect(JSON.stringify(plan.rows[0]?.['QUERY PLAN'])).toContain(
        'nutrition_meals_user_export_idx',
      )
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }
  })

  it('streams complete meals in stable owner order with byte-compatible revision snapshots', async () => {
    const userId = await createUser()
    const otherUserId = await createUser()
    const firstMealId = (await createNutritionMealBoundaryFixture(userId, 2, 2)).mealId
    const secondMealId = (await createNutritionMealBoundaryFixture(userId, 2, 2)).mealId
    await createNutritionMealBoundaryFixture(otherUserId, 2, 2)
    const expectedStableIds = [firstMealId, secondMealId].sort()

    const stable = snapshots.createNutritionMealLayerSnapshot(userId, { batchRows: 1 })
    const stableIterator = stable.meals[Symbol.asyncIterator]()
    const first = await stableIterator.next()
    if (first.done) throw new Error('nutrition meal fixture was not returned')
    const firstValues = await materializeNutritionMeals(
      (async function* () {
        yield first.value
      })(),
    )
    const concurrentMealId = (await createNutritionMealBoundaryFixture(userId, 2, 2)).mealId
    const remainingValues = await materializeNutritionMeals({
      [Symbol.asyncIterator]: () => stableIterator,
    })
    const stableValues = [...firstValues, ...remainingValues]

    expect(stableValues.map((meal) => meal.id)).toEqual(expectedStableIds)
    expect(stableValues.map((meal) => meal.id)).not.toContain(concurrentMealId)
    for (const meal of stableValues) {
      expect((meal.items as Array<Record<string, unknown>>).map((item) => item.position)).toEqual([
        1, 2,
      ])
      expect(
        (meal.history as Array<Record<string, unknown>>).map((revision) => revision.revision),
      ).toEqual([1, 2])
      for (const revision of meal.history as Array<Record<string, unknown>>) {
        expect(
          (
            (revision.snapshot as Record<string, unknown>).items as Array<Record<string, unknown>>
          ).map((item) => item.position),
        ).toEqual([1, 2])
      }
    }
    await stable.complete()
    await expect(stable.receipt).resolves.toEqual({
      batchRows: 1,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      meals: { batchCount: 2, rowCount: 2 },
      mealItems: { batchCount: 4, rowCount: 4 },
      mealRevisions: { batchCount: 4, rowCount: 4 },
      mealRevisionSnapshotRoots: { batchCount: 4, rowCount: 4 },
      mealRevisionSnapshotItems: { batchCount: 8, rowCount: 8 },
    })

    const planClient = await pool.connect()
    try {
      await planClient.query('BEGIN')
      await planClient.query('SET LOCAL enable_seqscan = off')
      const itemPlan = await planClient.query<{ 'QUERY PLAN': unknown }>(
        `EXPLAIN (FORMAT JSON, COSTS OFF) ${portableExportNutritionMealItemPageQuery}`,
        [userId, firstMealId, null, 2, portableExportSnapshotMaximumPayloadBytes],
      )
      expect(JSON.stringify(itemPlan.rows[0]?.['QUERY PLAN'])).toContain(
        'nutrition_meal_items_meal_id_position_key',
      )
      const revisionPlan = await planClient.query<{ 'QUERY PLAN': unknown }>(
        `EXPLAIN (FORMAT JSON, COSTS OFF) ${portableExportNutritionMealRevisionHeaderPageQuery}`,
        [userId, firstMealId, null, 2, portableExportSnapshotMaximumPayloadBytes],
      )
      expect(JSON.stringify(revisionPlan.rows[0]?.['QUERY PLAN'])).toMatch(
        /nutrition_meal_revisions_(user_meal_idx|meal_id_revision_key)/,
      )
    } finally {
      await planClient.query('ROLLBACK')
      planClient.release()
    }

    const eager = await pool.query<{ payload: Record<string, unknown> }>(
      `SELECT (
         to_jsonb(meal) || jsonb_build_object(
           'items', COALESCE((
             SELECT jsonb_agg(to_jsonb(item) - 'meal_id' ORDER BY item.position)
             FROM nutrition_meal_items AS item WHERE item.meal_id = meal.id
           ), '[]'::jsonb),
           'history', COALESCE((
             SELECT jsonb_agg(
               (to_jsonb(history) - 'user_id' - 'meal_id') ORDER BY history.revision
             )
             FROM nutrition_meal_revisions AS history WHERE history.meal_id = meal.id
           ), '[]'::jsonb)
         )
       ) AS payload
       FROM (
         SELECT id, meal_type, title, source_kind, source_metadata, occurred_at, timezone,
                note, revision, deleted_at, created_at, updated_at
         FROM nutrition_meals WHERE user_id = $1 ORDER BY occurred_at, created_at, id
       ) AS meal`,
      [userId],
    )
    const complete = snapshots.createNutritionMealLayerSnapshot(userId, { batchRows: 2 })
    const completeValues = await materializeNutritionMeals(complete.meals)
    await complete.complete()

    expect(JSON.stringify(completeValues)).toBe(
      JSON.stringify(eager.rows.map((row) => row.payload)),
    )
    expect(completeValues.map((meal) => meal.id)).toEqual(
      [...expectedStableIds, concurrentMealId].sort(),
    )
    await expect(complete.receipt).resolves.toMatchObject({
      meals: { rowCount: 3 },
      mealItems: { rowCount: 6 },
      mealRevisions: { rowCount: 6 },
      mealRevisionSnapshotRoots: { rowCount: 6 },
      mealRevisionSnapshotItems: { rowCount: 12 },
    })
  })

  it('cancels a meal root from an active immutable snapshot item', async () => {
    const userId = await createUser()
    await createNutritionMealBoundaryFixture(userId, 2, 2)
    const session = snapshots.createNutritionMealLayerSnapshot(userId, { batchRows: 1 })
    const meals = session.meals[Symbol.asyncIterator]()
    const meal = await meals.next()
    if (meal.done) throw new Error('nutrition meal cancellation fixture was not returned')
    for await (const _ of meal.value.items) {
      // Reach history in the required JSON field order.
    }
    const history = meal.value.history[Symbol.asyncIterator]()
    const revision = await history.next()
    if (revision.done) throw new Error('nutrition meal revision fixture was not returned')
    const snapshotItems = revision.value.snapshot.items[Symbol.asyncIterator]()
    await expect(snapshotItems.next()).resolves.toMatchObject({ done: false })
    const cancellation = new Error('nutrition meal snapshot cancelled by lease owner')
    const receiptFailure = session.receipt.catch((error: unknown) => error)

    await session.cancel(cancellation)

    expect(await receiptFailure).toBe(cancellation)
    await expect(snapshotItems.next()).resolves.toEqual({ done: true, value: undefined })
    await expect(history.next()).resolves.toEqual({ done: true, value: undefined })
    await expect(meals.next()).rejects.toBe(cancellation)
  })

  it('rejects meal history before current items complete', async () => {
    const userId = await createUser()
    await createNutritionMealBoundaryFixture(userId, 1, 2)
    const session = snapshots.createNutritionMealLayerSnapshot(userId, { batchRows: 1 })
    const meals = session.meals[Symbol.asyncIterator]()
    const meal = await meals.next()
    if (meal.done) throw new Error('nutrition meal order fixture was not returned')
    const receiptFailure = session.receipt.catch((error: unknown) => error)
    let historyFailure: unknown

    try {
      await meal.value.history[Symbol.asyncIterator]().next()
    } catch (error) {
      historyFailure = error
    }

    expect(historyFailure).toMatchObject({
      message: 'portable export nutrition meal items must complete before history',
    })
    expect(await receiptFailure).toBe(historyFailure)
  })

  it('fails closed for a non-array immutable meal snapshot', async () => {
    const userId = await createUser()
    const { mealId } = await createNutritionMealBoundaryFixture(userId, 1, 1)
    await pool.query(
      `UPDATE nutrition_meal_revisions
       SET snapshot = jsonb_set(snapshot, '{items}', '{}'::jsonb)
       WHERE meal_id = $1 AND revision = 1`,
      [mealId],
    )
    const session = snapshots.createNutritionMealLayerSnapshot(userId, { batchRows: 1 })
    const receiptFailure = session.receipt.catch((error: unknown) => error)
    let streamFailure: unknown

    try {
      for await (const meal of session.meals) {
        for await (const _ of meal.items) {
          // Reach the immutable revision.
        }
        for await (const _ of meal.history) {
          // The invalid root must fail before revision content is exposed.
        }
      }
    } catch (error) {
      streamFailure = error
    }

    expect(streamFailure).toBeInstanceOf(
      PortableExportNutritionMealRevisionSnapshotNotDecomposableError,
    )
    expect(streamFailure).toMatchObject({
      code: 'portable_export_nutrition_meal_revision_snapshot_not_decomposable',
    })
    expect(await receiptFailure).toBe(streamFailure)
  })

  it('withholds an oversized immutable meal snapshot item inside PostgreSQL', async () => {
    const userId = await createUser()
    const { mealId } = await createNutritionMealBoundaryFixture(userId, 1, 1)
    const secretMarker = `meal-snapshot-item-must-not-cross-${randomUUID()}`
    await pool.query(
      `UPDATE nutrition_meal_revisions
       SET snapshot = jsonb_set(
         snapshot,
         '{items,0,secret}',
         to_jsonb($2::text),
         true
       )
       WHERE meal_id = $1 AND revision = 1`,
      [mealId, `${secretMarker}-${'z'.repeat(8_192)}`],
    )
    const session = snapshots.createNutritionMealLayerSnapshot(userId, {
      batchRows: 1,
      maximumPayloadBytes: 4_096,
    })
    const receiptFailure = session.receipt.catch((error: unknown) => error)
    let streamFailure: unknown

    try {
      for await (const meal of session.meals) {
        for await (const _ of meal.items) {
          // Reach history in field order.
        }
        for await (const revision of meal.history) {
          for await (const _ of revision.snapshot.items) {
            // Oversized content must never be yielded.
          }
        }
      }
    } catch (error) {
      streamFailure = error
    }

    expect(streamFailure).toBeInstanceOf(PortableExportSnapshotPayloadTooLargeError)
    expect(streamFailure).toMatchObject({
      code: 'portable_export_snapshot_payload_too_large',
      maximumBytes: 4_096,
    })
    expect(JSON.stringify(streamFailure)).not.toContain(secretMarker)
    expect(await receiptFailure).toBe(streamFailure)
  })

  it('serializes the complete lazy nutrition meals array byte-for-byte in PostgreSQL JSONB field order', async () => {
    const userId = await createUser()
    await createNutritionMealBoundaryFixture(userId, 2, 2)
    const direct = await pool.query<{ payload: Record<string, unknown> }>(
      `SELECT (
         to_jsonb(meal) || jsonb_build_object(
           'items', COALESCE((
             SELECT jsonb_agg(to_jsonb(item) - 'meal_id' ORDER BY item.position)
             FROM nutrition_meal_items AS item WHERE item.meal_id = meal.id
           ), '[]'::jsonb),
           'history', COALESCE((
             SELECT jsonb_agg(
               (to_jsonb(history) - 'user_id' - 'meal_id') ORDER BY history.revision
             )
             FROM nutrition_meal_revisions AS history WHERE history.meal_id = meal.id
           ), '[]'::jsonb)
         )
       ) AS payload
       FROM (
         SELECT id, meal_type, title, source_kind, source_metadata, occurred_at, timezone,
                note, revision, deleted_at, created_at, updated_at
         FROM nutrition_meals WHERE user_id = $1 ORDER BY occurred_at, created_at, id
       ) AS meal`,
      [userId],
    )
    const eager = privacyExportSchema.parse({
      schemaVersion: privacyExportSchemaVersion,
      generatedAt: '2026-08-11T03:30:00.000Z',
      accountId: userId,
      data: {
        account: { id: userId, status: 'active' },
        identities: [],
        profile: null,
        goal: null,
        consentEvents: [],
        healthRecords: [],
        healthRecordRevisions: [],
        exerciseCatalog: [],
        foodCatalog: [],
        workouts: [],
        nutritionMeals: direct.rows.map((row) => row.payload),
        nutritionFavorites: [],
        weeklyPlans: [],
        aiExplanationRuns: [],
        foodPhotoAnalyses: [],
        progressPhotos: [],
      },
    })
    const expected = serializePortableExport(eager, Number.MAX_SAFE_INTEGER)
    const layer = snapshots.createNutritionMealLayerSnapshot(userId, { batchRows: 1 })
    const mealSource = createPortableExportNutritionMealJsonSource(layer)
    const json = createPortableExportJsonStream(
      {
        ...eager,
        data: { ...eager.data, nutritionMeals: mealSource.nutritionMeals as never },
      },
      { chunkBytes: 31, lifecycle: mealSource },
    )
    let layerSettled = false
    void layer.receipt.finally(() => {
      layerSettled = true
    })
    const chunks: Buffer[] = []

    for await (const chunk of json.bytes) {
      expect(chunk.length).toBeLessThanOrEqual(31)
      chunks.push(Buffer.from(chunk))
    }

    expect(Buffer.concat(chunks)).toEqual(expected)
    expect(layerSettled).toBe(true)
    await expect(layer.receipt).resolves.toMatchObject({
      batchRows: 1,
      meals: { batchCount: 1, rowCount: 1 },
      mealItems: { batchCount: 2, rowCount: 2 },
      mealRevisions: { batchCount: 2, rowCount: 2 },
      mealRevisionSnapshotRoots: { batchCount: 2, rowCount: 2 },
      mealRevisionSnapshotItems: { batchCount: 4, rowCount: 4 },
    })
    await expect(json.receipt).resolves.toEqual({
      schemaVersion: privacyExportSchemaVersion,
      chunkBytes: 31,
      byteLength: expected.length,
      sha256: createHash('sha256').update(expected).digest('hex'),
    })
  })

  it('cancels the nutrition meal transaction from an active immutable snapshot item', async () => {
    const userId = await createUser()
    const { firstItemId } = await createNutritionMealBoundaryFixture(userId, 1, 2)
    if (firstItemId === undefined) throw new Error('nutrition meal item fixture was not created')
    const eager = privacyExportSchema.parse({
      schemaVersion: privacyExportSchemaVersion,
      generatedAt: '2026-08-11T03:40:00.000Z',
      accountId: userId,
      data: {
        account: { id: userId, status: 'active' },
        identities: [],
        profile: null,
        goal: null,
        consentEvents: [],
        healthRecords: [],
        healthRecordRevisions: [],
        exerciseCatalog: [],
        foodCatalog: [],
        workouts: [],
        nutritionMeals: [],
        nutritionFavorites: [],
        weeklyPlans: [],
        aiExplanationRuns: [],
        foodPhotoAnalyses: [],
        progressPhotos: [],
      },
    })
    const layer = snapshots.createNutritionMealLayerSnapshot(userId, { batchRows: 1 })
    const mealSource = createPortableExportNutritionMealJsonSource(layer)
    const json = createPortableExportJsonStream(
      {
        ...eager,
        data: { ...eager.data, nutritionMeals: mealSource.nutritionMeals as never },
      },
      { chunkBytes: 1, lifecycle: mealSource },
    )
    const iterator = json.bytes[Symbol.asyncIterator]()
    let prefix = ''
    while (prefix.split(firstItemId).length - 1 < 2) {
      const next = await iterator.next()
      if (next.done) throw new Error('immutable nutrition meal item fixture was not reached')
      prefix += next.value.toString('utf8')
    }
    const jsonFailure = json.receipt.catch((error: unknown) => error)
    const layerFailure = layer.receipt.catch((error: unknown) => error)
    let returnFailure: unknown

    try {
      await iterator.return?.()
    } catch (error) {
      returnFailure = error
    }

    expect(await layerFailure).toBe(returnFailure)
    expect(await jsonFailure).toBe(returnFailure)
    expect(returnFailure).toMatchObject({
      message: 'portable export nutrition meal revision snapshot items did not complete',
    })
  })

  it('keeps one owner snapshot stable across keyset pages without timestamp round-trips', async () => {
    const userId = await createUser()
    const otherUserId = await createUser()
    const occurredAt = [
      '2026-08-11T01:00:00.000001Z',
      '2026-08-11T01:00:00.000002Z',
      '2026-08-11T01:00:00.000003Z',
      '2026-08-11T01:00:00.000004Z',
      '2026-08-11T01:00:00.000005Z',
    ]
    const originalIds: string[] = []
    for (let index = 0; index < occurredAt.length; index += 1) {
      originalIds.push(await createRecord(userId, occurredAt[index]!, 70 + index))
    }
    await createRecord(otherUserId, '2026-08-11T01:00:00.000003Z', 999)

    const session = snapshots.createHealthRecordSnapshot(userId, { batchRows: 2 })
    const iterator = session.rows[Symbol.asyncIterator]()
    const first = await iterator.next()
    expect(first).toMatchObject({ done: false, value: { id: originalIds[0] } })

    const concurrentId = await createRecord(userId, '2026-08-11T01:00:00.0000035Z', 88)
    await pool.query(
      'UPDATE health_records SET canonical_value = 123, display_value = 123 WHERE id = $1',
      [originalIds[3]],
    )

    const rows = [first.value!]
    while (true) {
      const next = await iterator.next()
      if (next.done) break
      rows.push(next.value)
    }

    expect(rows.map((row) => row.id)).toEqual(originalIds)
    expect(rows[3]?.canonical_value).toBe(73)
    expect(rows.some((row) => row.id === concurrentId)).toBe(false)
    await expect(session.receipt).resolves.toEqual({
      batchRows: 2,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      batchCount: 3,
      rowCount: 5,
    })
  })

  it('streams owner workout headers in total order, including soft-deleted rows, from one stable snapshot', async () => {
    const userId = await createUser()
    const otherUserId = await createUser()
    const tiedIds = [randomUUID(), randomUUID()].sort()
    const orderedWorkouts: Array<{
      id: string
      startedAt: string
      createdAt: string
      deletedAt?: string
    }> = [
      {
        id: randomUUID(),
        startedAt: '2026-08-11T01:14:00.000001Z',
        createdAt: '2026-08-11T01:19:00.000001Z',
      },
      {
        id: randomUUID(),
        startedAt: '2026-08-11T01:15:00.000001Z',
        createdAt: '2026-08-11T01:15:00.000001Z',
      },
      {
        id: tiedIds[0]!,
        startedAt: '2026-08-11T01:15:00.000001Z',
        createdAt: '2026-08-11T01:15:00.000002Z',
        deletedAt: '2026-08-11T01:20:00.000001Z',
      },
      {
        id: tiedIds[1]!,
        startedAt: '2026-08-11T01:15:00.000001Z',
        createdAt: '2026-08-11T01:15:00.000002Z',
      },
    ]

    for (const workout of [...orderedWorkouts].reverse()) {
      await createWorkout(userId, workout.startedAt, workout.createdAt, {
        id: workout.id,
        deletedAt: workout.deletedAt ?? null,
      })
    }
    await createWorkout(otherUserId, orderedWorkouts[0]!.startedAt, orderedWorkouts[0]!.createdAt)

    const session = snapshots.createWorkoutHeaderSnapshot(userId, { batchRows: 2 })
    const iterator = session.rows[Symbol.asyncIterator]()
    const first = await iterator.next()
    expect(first).toMatchObject({ done: false })

    const concurrentId = await createWorkout(
      userId,
      '2026-08-11T01:16:00.000001Z',
      '2026-08-11T01:16:00.000002Z',
    )
    const rows = first.done ? [] : [first.value]
    for await (const row of { [Symbol.asyncIterator]: () => iterator }) rows.push(row)

    expect(rows.map((row) => row.id)).toEqual(orderedWorkouts.map((workout) => workout.id))
    expect(rows.map((row) => row.id)).not.toContain(concurrentId)
    expect(rows.filter((row) => row.deleted_at !== null)).toHaveLength(1)
    expect(Object.keys(rows[0]!).sort()).toEqual(
      [
        'id',
        'title',
        'status',
        'source_kind',
        'source_metadata',
        'started_at',
        'ended_at',
        'timezone',
        'pain_level',
        'fatigue',
        'note',
        'revision',
        'deleted_at',
        'created_at',
        'updated_at',
      ].sort(),
    )
    expect(rows[0]).not.toHaveProperty('exercises')
    expect(rows[0]).not.toHaveProperty('history')
    await expect(session.receipt).resolves.toEqual({
      batchRows: 2,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      batchCount: 2,
      rowCount: 4,
    })
  })

  it('uses the non-partial owner export index for the actual workout header page query', async () => {
    const userId = await createUser()
    await createWorkout(userId, '2026-08-11T01:25:00.000001Z')
    const definition = await pool.query<{ index_definition: string; predicate: string | null }>(
      `SELECT pg_get_indexdef(indexrelid) AS index_definition,
              pg_get_expr(indpred, indrelid) AS predicate
       FROM pg_index
       WHERE indexrelid = 'workout_sessions_user_export_idx'::regclass`,
    )
    expect(definition.rows).toEqual([
      expect.objectContaining({
        index_definition: expect.stringContaining('(user_id, started_at, created_at, id)'),
        predicate: null,
      }),
    ])

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SET LOCAL enable_seqscan = off')
      const plan = await client.query<{ 'QUERY PLAN': unknown }>(
        `EXPLAIN (FORMAT JSON, COSTS OFF) ${portableExportWorkoutHeaderPageQuery}`,
        [userId, null, 2, portableExportSnapshotMaximumPayloadBytes],
      )
      expect(JSON.stringify(plan.rows[0]?.['QUERY PLAN'])).toContain(
        'workout_sessions_user_export_idx',
      )
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }
  })

  it('propagates workout header cancellation without exposing a second row', async () => {
    const userId = await createUser()
    await createWorkout(userId, '2026-08-11T01:35:00.000001Z')
    await createWorkout(userId, '2026-08-11T01:35:00.000002Z')
    const abort = new AbortController()
    const session = snapshots.createWorkoutHeaderSnapshot(userId, {
      batchRows: 1,
      signal: abort.signal,
    })
    const iterator = session.rows[Symbol.asyncIterator]()
    await expect(iterator.next()).resolves.toMatchObject({ done: false })
    const cancellation = new Error('workout header snapshot cancelled by lease owner')
    const receiptFailure = session.receipt.catch((error: unknown) => error)

    abort.abort(cancellation)
    let streamFailure: unknown
    try {
      await iterator.next()
    } catch (error) {
      streamFailure = error
    }

    expect(streamFailure).toBe(cancellation)
    expect(await receiptFailure).toBe(cancellation)
  })

  it('keeps workout headers and ordered exercise headers in one root-owned snapshot', async () => {
    const userId = await createUser()
    const otherUserId = await createUser()
    const firstWorkoutId = await createWorkout(
      userId,
      '2026-08-11T01:36:00.000001Z',
      '2026-08-11T01:36:00.000002Z',
      { deletedAt: '2026-08-11T01:39:00.000001Z' },
    )
    const secondWorkoutId = await createWorkout(
      userId,
      '2026-08-11T01:37:00.000001Z',
      '2026-08-11T01:37:00.000002Z',
    )
    const otherWorkoutId = await createWorkout(otherUserId, '2026-08-11T01:38:00.000001Z')
    const firstWorkoutExerciseIds = [
      await createWorkoutExercise(firstWorkoutId, 2),
      await createWorkoutExercise(firstWorkoutId, 1),
    ]
    const secondWorkoutExerciseId = await createWorkoutExercise(secondWorkoutId, 1)
    await createWorkoutExercise(otherWorkoutId, 1)

    const session = snapshots.createWorkoutExerciseLayerSnapshot(userId, { batchRows: 1 })
    const workouts = session.workouts[Symbol.asyncIterator]()
    const firstWorkout = await workouts.next()
    expect(firstWorkout).toMatchObject({ done: false, value: { header: { id: firstWorkoutId } } })
    expect(firstWorkout.value!.header.deleted_at).not.toBeNull()

    const firstExercises = firstWorkout.value!.exercises[Symbol.asyncIterator]()
    const firstExercise = await firstExercises.next()
    expect(firstExercise).toMatchObject({ done: false, value: { position: 1 } })

    const concurrentFirstExerciseId = await createWorkoutExercise(firstWorkoutId, 3)
    const concurrentSecondExerciseId = await createWorkoutExercise(secondWorkoutId, 2)
    const firstExerciseRows = firstExercise.done ? [] : [firstExercise.value]
    for await (const exercise of { [Symbol.asyncIterator]: () => firstExercises }) {
      firstExerciseRows.push(exercise)
    }

    const secondWorkout = await workouts.next()
    expect(secondWorkout).toMatchObject({ done: false, value: { header: { id: secondWorkoutId } } })
    const secondExerciseRows: Array<Record<string, unknown>> = []
    for await (const exercise of secondWorkout.value!.exercises) secondExerciseRows.push(exercise)
    await expect(workouts.next()).resolves.toEqual({ done: true, value: undefined })

    expect(firstExerciseRows.map((exercise) => exercise.id)).toEqual(
      [...firstWorkoutExerciseIds].reverse(),
    )
    expect(firstExerciseRows.map((exercise) => exercise.position)).toEqual([1, 2])
    expect(firstExerciseRows.map((exercise) => exercise.id)).not.toContain(
      concurrentFirstExerciseId,
    )
    expect(secondExerciseRows.map((exercise) => exercise.id)).toEqual([secondWorkoutExerciseId])
    expect(secondExerciseRows.map((exercise) => exercise.id)).not.toContain(
      concurrentSecondExerciseId,
    )
    expect(Object.keys(firstExerciseRows[0]!).sort()).toEqual(
      [
        'id',
        'position',
        'exercise_key',
        'name',
        'category',
        'notes',
        'tracking_mode',
        'equipment',
        'equipment_notes',
      ].sort(),
    )
    expect(firstExerciseRows[0]).not.toHaveProperty('sets')

    let receiptSettled = false
    void session.receipt.then(
      () => {
        receiptSettled = true
      },
      () => {
        receiptSettled = true
      },
    )
    await Promise.resolve()
    expect(receiptSettled).toBe(false)

    await session.complete()
    await expect(session.receipt).resolves.toEqual({
      batchRows: 1,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      workoutHeaders: { batchCount: 2, rowCount: 2 },
      workoutExercises: { batchCount: 3, rowCount: 3 },
    })
  })

  it('uses the workout position index for the actual exercise header page query', async () => {
    const userId = await createUser()
    const workoutId = await createWorkout(userId, '2026-08-11T01:40:00.000001Z')
    await createWorkoutExercise(workoutId, 1)
    const definition = await pool.query<{ index_definition: string; predicate: string | null }>(
      `SELECT pg_get_indexdef(indexrelid) AS index_definition,
              pg_get_expr(indpred, indrelid) AS predicate
       FROM pg_index
       WHERE indexrelid = 'workout_exercises_workout_id_position_key'::regclass`,
    )
    expect(definition.rows).toEqual([
      expect.objectContaining({
        index_definition: expect.stringContaining('(workout_id, "position")'),
        predicate: null,
      }),
    ])

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SET LOCAL enable_seqscan = off')
      const plan = await client.query<{ 'QUERY PLAN': unknown }>(
        `EXPLAIN (FORMAT JSON, COSTS OFF) ${portableExportWorkoutExerciseHeaderPageQuery}`,
        [userId, workoutId, null, 2, portableExportSnapshotMaximumPayloadBytes],
      )
      expect(JSON.stringify(plan.rows[0]?.['QUERY PLAN'])).toContain(
        'workout_exercises_workout_id_position_key',
      )
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }
  })

  it('closes an active exercise child before cancelling its root snapshot', async () => {
    const userId = await createUser()
    const workoutId = await createWorkout(userId, '2026-08-11T01:45:00.000001Z')
    await createWorkoutExercise(workoutId, 1)
    await createWorkoutExercise(workoutId, 2)
    const session = snapshots.createWorkoutExerciseLayerSnapshot(userId, { batchRows: 1 })
    const workouts = session.workouts[Symbol.asyncIterator]()
    const workout = await workouts.next()
    const exercises = workout.value!.exercises[Symbol.asyncIterator]()
    await expect(exercises.next()).resolves.toMatchObject({ done: false })
    const cancellation = new Error('workout exercise root cancelled by lease owner')
    const receiptFailure = session.receipt.catch((error: unknown) => error)

    await session.cancel(cancellation)

    expect(await receiptFailure).toBe(cancellation)
    await expect(exercises.next()).resolves.toEqual({ done: true, value: undefined })
    await expect(workouts.next()).rejects.toBe(cancellation)
  })

  it('keeps workout, exercise and set rows in one stable owner snapshot', async () => {
    const userId = await createUser()
    const otherUserId = await createUser()
    const workoutId = await createWorkout(
      userId,
      '2026-08-11T01:46:00.000001Z',
      '2026-08-11T01:46:00.000002Z',
      { deletedAt: '2026-08-11T01:49:00.000001Z' },
    )
    const otherWorkoutId = await createWorkout(otherUserId, '2026-08-11T01:47:00.000001Z')
    const secondExerciseId = await createWorkoutExercise(workoutId, 2)
    const firstExerciseId = await createWorkoutExercise(workoutId, 1)
    const otherExerciseId = await createWorkoutExercise(otherWorkoutId, 1)
    const firstExerciseSetIds = [
      await createWorkoutSet(firstExerciseId, 2),
      await createWorkoutSet(firstExerciseId, 1),
    ]
    const secondExerciseSetId = await createWorkoutSet(secondExerciseId, 1)
    await createWorkoutSet(otherExerciseId, 1)

    const session = snapshots.createWorkoutSetLayerSnapshot(userId, { batchRows: 1 })
    const workouts = session.workouts[Symbol.asyncIterator]()
    const workout = await workouts.next()
    expect(workout).toMatchObject({ done: false, value: { header: { id: workoutId } } })
    expect(workout.value!.header.deleted_at).not.toBeNull()
    const exercises = workout.value!.exercises[Symbol.asyncIterator]()
    const firstExercise = await exercises.next()
    expect(firstExercise).toMatchObject({
      done: false,
      value: { header: { id: firstExerciseId, position: 1 } },
    })
    const firstSets = firstExercise.value!.sets[Symbol.asyncIterator]()
    const firstSet = await firstSets.next()
    expect(firstSet).toMatchObject({ done: false, value: { position: 1 } })

    const concurrentFirstSetId = await createWorkoutSet(firstExerciseId, 3)
    const concurrentSecondSetId = await createWorkoutSet(secondExerciseId, 2)
    const firstSetRows = firstSet.done ? [] : [firstSet.value]
    for await (const set of { [Symbol.asyncIterator]: () => firstSets }) firstSetRows.push(set)

    const secondExercise = await exercises.next()
    expect(secondExercise).toMatchObject({
      done: false,
      value: { header: { id: secondExerciseId, position: 2 } },
    })
    const secondSetRows: Array<Record<string, unknown>> = []
    for await (const set of secondExercise.value!.sets) secondSetRows.push(set)
    await expect(exercises.next()).resolves.toEqual({ done: true, value: undefined })
    await expect(workouts.next()).resolves.toEqual({ done: true, value: undefined })

    expect(firstSetRows.map((set) => set.id)).toEqual([...firstExerciseSetIds].reverse())
    expect(firstSetRows.map((set) => set.position)).toEqual([1, 2])
    expect(firstSetRows.map((set) => set.id)).not.toContain(concurrentFirstSetId)
    expect(secondSetRows.map((set) => set.id)).toEqual([secondExerciseSetId])
    expect(secondSetRows.map((set) => set.id)).not.toContain(concurrentSecondSetId)
    expect(Object.keys(firstSetRows[0]!).sort()).toEqual(
      [
        'id',
        'position',
        'kind',
        'reps',
        'display_load',
        'display_load_unit',
        'canonical_load_kg',
        'duration_seconds',
        'distance_meters',
        'rpe',
        'completed',
      ].sort(),
    )
    expect(firstSetRows[0]).not.toHaveProperty('exercise_id')

    let receiptSettled = false
    void session.receipt.then(
      () => {
        receiptSettled = true
      },
      () => {
        receiptSettled = true
      },
    )
    await Promise.resolve()
    expect(receiptSettled).toBe(false)

    await session.complete()
    await expect(session.receipt).resolves.toEqual({
      batchRows: 1,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      workoutHeaders: { batchCount: 1, rowCount: 1 },
      workoutExercises: { batchCount: 2, rowCount: 2 },
      workoutSets: { batchCount: 3, rowCount: 3 },
    })
  })

  it('uses the exercise position index for the actual workout set page query', async () => {
    const userId = await createUser()
    const workoutId = await createWorkout(userId, '2026-08-11T01:50:00.000001Z')
    const exerciseId = await createWorkoutExercise(workoutId, 1)
    await createWorkoutSet(exerciseId, 1)
    const definition = await pool.query<{ index_definition: string; predicate: string | null }>(
      `SELECT pg_get_indexdef(indexrelid) AS index_definition,
              pg_get_expr(indpred, indrelid) AS predicate
       FROM pg_index
       WHERE indexrelid = 'workout_sets_exercise_id_position_key'::regclass`,
    )
    expect(definition.rows).toEqual([
      expect.objectContaining({
        index_definition: expect.stringContaining('(exercise_id, "position")'),
        predicate: null,
      }),
    ])

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SET LOCAL enable_seqscan = off')
      const plan = await client.query<{ 'QUERY PLAN': unknown }>(
        `EXPLAIN (FORMAT JSON, COSTS OFF) ${portableExportWorkoutSetPageQuery}`,
        [userId, workoutId, exerciseId, null, 2, portableExportSnapshotMaximumPayloadBytes],
      )
      expect(JSON.stringify(plan.rows[0]?.['QUERY PLAN'])).toContain(
        'workout_sets_exercise_id_position_key',
      )
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }
  })

  it('closes an active set before cancelling its exercise and workout parents', async () => {
    const userId = await createUser()
    const workoutId = await createWorkout(userId, '2026-08-11T01:55:00.000001Z')
    const exerciseId = await createWorkoutExercise(workoutId, 1)
    await createWorkoutSet(exerciseId, 1)
    await createWorkoutSet(exerciseId, 2)
    const session = snapshots.createWorkoutSetLayerSnapshot(userId, { batchRows: 1 })
    const workouts = session.workouts[Symbol.asyncIterator]()
    const workout = await workouts.next()
    const exercises = workout.value!.exercises[Symbol.asyncIterator]()
    const exercise = await exercises.next()
    const sets = exercise.value!.sets[Symbol.asyncIterator]()
    await expect(sets.next()).resolves.toMatchObject({ done: false })
    const cancellation = new Error('workout set root cancelled by lease owner')
    const receiptFailure = session.receipt.catch((error: unknown) => error)

    await session.cancel(cancellation)

    expect(await receiptFailure).toBe(cancellation)
    await expect(sets.next()).resolves.toEqual({ done: true, value: undefined })
    await expect(exercises.next()).resolves.toEqual({ done: true, value: undefined })
    await expect(workouts.next()).rejects.toBe(cancellation)
  })

  it('keeps workout relation rows and revision headers in one stable owner snapshot', async () => {
    const userId = await createUser()
    const otherUserId = await createUser()
    const workoutId = await createWorkout(
      userId,
      '2026-08-11T01:56:00.000001Z',
      '2026-08-11T01:56:00.000002Z',
      { deletedAt: '2026-08-11T01:59:00.000001Z' },
    )
    const otherWorkoutId = await createWorkout(otherUserId, '2026-08-11T01:57:00.000001Z')
    const exerciseId = await createWorkoutExercise(workoutId, 1)
    const setId = await createWorkoutSet(exerciseId, 1)
    const revisionIds = [
      await createWorkoutRevision(userId, workoutId, 2, '2026-08-11T01:58:00.000002Z'),
      await createWorkoutRevision(userId, workoutId, 1, '2026-08-11T01:58:00.000001Z'),
    ]
    await createWorkoutRevision(otherUserId, otherWorkoutId, 1, '2026-08-11T01:58:00.000001Z')

    const session = snapshots.createWorkoutRevisionHeaderLayerSnapshot(userId, { batchRows: 1 })
    const workouts = session.workouts[Symbol.asyncIterator]()
    const workout = await workouts.next()
    expect(workout).toMatchObject({ done: false, value: { header: { id: workoutId } } })
    expect(workout.value!.header.deleted_at).not.toBeNull()
    const exercises = workout.value!.exercises[Symbol.asyncIterator]()
    const exercise = await exercises.next()
    expect(exercise).toMatchObject({
      done: false,
      value: { header: { id: exerciseId, position: 1 } },
    })
    const setRows: Array<Record<string, unknown>> = []
    for await (const set of exercise.value!.sets) setRows.push(set)
    await expect(exercises.next()).resolves.toEqual({ done: true, value: undefined })
    expect(setRows.map((set) => set.id)).toEqual([setId])

    const history = workout.value!.history[Symbol.asyncIterator]()
    const firstRevision = await history.next()
    expect(firstRevision).toMatchObject({
      done: false,
      value: { id: revisionIds[1], action: 'created', revision: 1 },
    })
    const concurrentRevisionId = await createWorkoutRevision(
      userId,
      workoutId,
      3,
      '2026-08-11T01:58:00.000003Z',
    )
    const historyRows = firstRevision.done ? [] : [firstRevision.value]
    for await (const revision of { [Symbol.asyncIterator]: () => history }) {
      historyRows.push(revision)
    }
    await expect(workouts.next()).resolves.toEqual({ done: true, value: undefined })

    expect(historyRows.map((revision) => revision.id)).toEqual([...revisionIds].reverse())
    expect(historyRows.map((revision) => revision.revision)).toEqual([1, 2])
    expect(historyRows.map((revision) => revision.id)).not.toContain(concurrentRevisionId)
    expect(Object.keys(historyRows[0]!).sort()).toEqual(
      ['id', 'action', 'revision', 'changed_at'].sort(),
    )
    expect(historyRows[0]).not.toHaveProperty('snapshot')
    expect(historyRows[0]).not.toHaveProperty('workout_id')
    expect(historyRows[0]).not.toHaveProperty('user_id')

    let receiptSettled = false
    void session.receipt.then(
      () => {
        receiptSettled = true
      },
      () => {
        receiptSettled = true
      },
    )
    await Promise.resolve()
    expect(receiptSettled).toBe(false)

    await session.complete()
    await expect(session.receipt).resolves.toEqual({
      batchRows: 1,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      workoutHeaders: { batchCount: 1, rowCount: 1 },
      workoutExercises: { batchCount: 1, rowCount: 1 },
      workoutSets: { batchCount: 1, rowCount: 1 },
      workoutRevisions: { batchCount: 2, rowCount: 2 },
    })
  })

  it('uses an existing workout revision index for the actual revision header page query', async () => {
    const userId = await createUser()
    const workoutId = await createWorkout(userId, '2026-08-11T02:01:00.000001Z')
    await createWorkoutRevision(userId, workoutId, 1, '2026-08-11T02:02:00.000001Z')
    const definitions = await pool.query<{
      index_name: string
      index_definition: string
      predicate: string | null
    }>(
      `SELECT indexrelid::regclass::text AS index_name,
              pg_get_indexdef(indexrelid) AS index_definition,
              pg_get_expr(indpred, indrelid) AS predicate
       FROM pg_index
       WHERE indexrelid IN (
         'workout_revisions_workout_id_revision_key'::regclass,
         'workout_revisions_user_workout_idx'::regclass
       )
       ORDER BY index_name`,
    )
    expect(definitions.rows).toEqual([
      expect.objectContaining({
        index_name: 'workout_revisions_user_workout_idx',
        index_definition: expect.stringContaining('(user_id, workout_id, revision DESC)'),
        predicate: null,
      }),
      expect.objectContaining({
        index_name: 'workout_revisions_workout_id_revision_key',
        index_definition: expect.stringContaining('(workout_id, revision)'),
        predicate: null,
      }),
    ])

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SET LOCAL enable_seqscan = off')
      const plan = await client.query<{ 'QUERY PLAN': unknown }>(
        `EXPLAIN (FORMAT JSON, COSTS OFF) ${portableExportWorkoutRevisionHeaderPageQuery}`,
        [userId, workoutId, null, 2, portableExportSnapshotMaximumPayloadBytes],
      )
      expect(JSON.stringify(plan.rows[0]?.['QUERY PLAN'])).toMatch(
        /workout_revisions_(user_workout_idx|workout_id_revision_key)/,
      )
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }
  })

  it('closes an active revision header before cancelling its workout root', async () => {
    const userId = await createUser()
    const workoutId = await createWorkout(userId, '2026-08-11T02:05:00.000001Z')
    await createWorkoutRevision(userId, workoutId, 1, '2026-08-11T02:06:00.000001Z')
    await createWorkoutRevision(userId, workoutId, 2, '2026-08-11T02:06:00.000002Z')
    const session = snapshots.createWorkoutRevisionHeaderLayerSnapshot(userId, { batchRows: 1 })
    const workouts = session.workouts[Symbol.asyncIterator]()
    const workout = await workouts.next()
    for await (const _ of workout.value!.exercises) {
      // Reach the required relation boundary before history.
    }
    const history = workout.value!.history[Symbol.asyncIterator]()
    await expect(history.next()).resolves.toMatchObject({ done: false })
    const cancellation = new Error('workout revision root cancelled by lease owner')
    const receiptFailure = session.receipt.catch((error: unknown) => error)

    await session.cancel(cancellation)

    expect(await receiptFailure).toBe(cancellation)
    await expect(history.next()).resolves.toEqual({ done: true, value: undefined })
    await expect(workouts.next()).rejects.toBe(cancellation)
  })

  it('reports an extended workout revision snapshot shape without returning its content', async () => {
    const userId = await createUser()
    const workoutId = await createWorkout(userId, '2026-08-11T02:10:00.000001Z')
    const secretMarker = `snapshot-content-${randomUUID()}`
    const snapshot = workoutRevisionSnapshot(userId, workoutId, 1, [
      {
        id: randomUUID(),
        position: 1,
        exerciseKey: 'fixture_strength',
        name: secretMarker,
        category: 'strength',
        trackingMode: 'reps_load',
        equipment: ['bodyweight'],
        sets: [
          {
            id: randomUUID(),
            position: 1,
            kind: 'working',
            reps: 10,
            canonicalLoadKg: null,
            completed: true,
          },
        ],
      },
      {
        id: randomUUID(),
        position: 2,
        exerciseKey: 'fixture_cardio',
        name: 'Cardio fixture',
        category: 'cardio',
        trackingMode: 'duration_distance',
        equipment: [],
        sets: [
          {
            id: randomUUID(),
            position: 1,
            kind: 'working',
            durationSeconds: 60,
            canonicalLoadKg: null,
            completed: true,
          },
        ],
      },
    ])
    const revisionId = await createWorkoutRevision(
      userId,
      workoutId,
      1,
      '2026-08-11T02:20:00.000001Z',
      'created',
      snapshot,
    )

    const receipt = await snapshots.inspectWorkoutRevisionSnapshotShape(
      userId,
      workoutId,
      revisionId,
    )

    expect(receipt).toMatchObject({
      schemaVersion: 'myfitness-portable-export-workout-revision-snapshot-shape/v1',
      revision: 1,
      compatibility: 'extended',
      exerciseCount: 2,
      setCount: 2,
      legacyExerciseCount: 0,
      extendedExerciseCount: 2,
      exerciseStorageOrderMatchesPosition: true,
      setStorageOrderMatchesPosition: true,
      decomposable: true,
    })
    expect(receipt.rootHeaderBytes).toBeGreaterThan(0)
    expect(receipt.maximumExerciseHeaderBytes).toBeGreaterThan(0)
    expect(receipt.maximumSetBytes).toBeGreaterThan(0)
    expect(JSON.stringify(receipt)).not.toContain(secretMarker)
    expect(JSON.stringify(receipt)).not.toContain(workoutId)
    expect(JSON.stringify(receipt)).not.toContain(revisionId)
  })

  it('preserves immutable JSON ordinality when legacy snapshot positions are stored in reverse', async () => {
    const userId = await createUser()
    const otherUserId = await createUser()
    const workoutId = await createWorkout(userId, '2026-08-11T02:25:00.000001Z')
    const snapshot = workoutRevisionSnapshot(userId, workoutId, 1, [
      {
        id: randomUUID(),
        position: 2,
        exerciseKey: 'legacy_second',
        name: 'Stored first',
        category: 'strength',
        sets: [
          {
            id: randomUUID(),
            position: 2,
            kind: 'working',
            reps: 8,
            canonicalLoadKg: null,
            completed: true,
          },
          {
            id: randomUUID(),
            position: 1,
            kind: 'warmup',
            reps: 10,
            canonicalLoadKg: null,
            completed: true,
          },
        ],
      },
      {
        id: randomUUID(),
        position: 1,
        exerciseKey: 'legacy_first',
        name: 'Stored second',
        category: 'strength',
        sets: [
          {
            id: randomUUID(),
            position: 1,
            kind: 'working',
            reps: 10,
            canonicalLoadKg: null,
            completed: true,
          },
        ],
      },
    ])
    const revisionId = await createWorkoutRevision(
      userId,
      workoutId,
      1,
      '2026-08-11T02:30:00.000001Z',
      'created',
      snapshot,
    )

    const receipt = await snapshots.inspectWorkoutRevisionSnapshotShape(
      userId,
      workoutId,
      revisionId,
    )

    expect(receipt).toMatchObject({
      compatibility: 'legacy',
      exerciseCount: 2,
      setCount: 3,
      legacyExerciseCount: 2,
      extendedExerciseCount: 0,
      exerciseStorageOrderMatchesPosition: false,
      setStorageOrderMatchesPosition: false,
      decomposable: true,
    })
    await expect(
      snapshots.inspectWorkoutRevisionSnapshotShape(otherUserId, workoutId, revisionId),
    ).rejects.toThrowError('workout revision snapshot not found')
  })

  it('fails the decomposition receipt for unknown, oversized or ambiguous child shapes', async () => {
    const userId = await createUser()
    const workoutId = await createWorkout(userId, '2026-08-11T02:35:00.000001Z')
    const legacyExercise = {
      id: randomUUID(),
      position: 1,
      exerciseKey: 'legacy_fixture',
      name: 'Legacy fixture',
      category: 'strength',
      sets: [
        {
          id: randomUUID(),
          position: 1,
          kind: 'working',
          reps: 10,
          canonicalLoadKg: null,
          completed: true,
        },
      ],
    }
    const extendedExercise = {
      id: randomUUID(),
      position: 2,
      exerciseKey: 'extended_fixture',
      name: 'Extended fixture',
      category: 'strength',
      trackingMode: 'reps_load',
      equipment: [],
      sets: [
        {
          id: randomUUID(),
          position: 1,
          kind: 'working',
          reps: 10,
          canonicalLoadKg: null,
          completed: true,
        },
      ],
    }
    const unknownSnapshot = workoutRevisionSnapshot(
      userId,
      workoutId,
      1,
      [legacyExercise, extendedExercise],
      { unknownFutureField: true },
    )
    const unknownRevisionId = await createWorkoutRevision(
      userId,
      workoutId,
      1,
      '2026-08-11T02:40:00.000001Z',
      'created',
      unknownSnapshot,
    )
    const oversizedSnapshot = workoutRevisionSnapshot(userId, workoutId, 2, [
      {
        ...extendedExercise,
        id: randomUUID(),
        notes: 'x'.repeat(portableExportSnapshotMaximumPayloadBytes + 1),
      },
    ])
    const oversizedRevisionId = await createWorkoutRevision(
      userId,
      workoutId,
      2,
      '2026-08-11T02:40:00.000002Z',
      'updated',
      oversizedSnapshot,
    )
    const duplicateExerciseId = randomUUID()
    const duplicateExerciseSnapshot = workoutRevisionSnapshot(userId, workoutId, 3, [
      { ...legacyExercise, id: duplicateExerciseId, position: 1 },
      { ...extendedExercise, id: duplicateExerciseId, position: 2 },
    ])
    const duplicateExerciseRevisionId = await createWorkoutRevision(
      userId,
      workoutId,
      3,
      '2026-08-11T02:40:00.000003Z',
      'updated',
      duplicateExerciseSnapshot,
    )
    const duplicateSetId = randomUUID()
    const duplicateSetSnapshot = workoutRevisionSnapshot(userId, workoutId, 4, [
      {
        ...legacyExercise,
        id: randomUUID(),
        sets: [
          { ...legacyExercise.sets[0], id: duplicateSetId, position: 1 },
          { ...legacyExercise.sets[0], id: duplicateSetId, position: 2 },
        ],
      },
    ])
    const duplicateSetRevisionId = await createWorkoutRevision(
      userId,
      workoutId,
      4,
      '2026-08-11T02:40:00.000004Z',
      'updated',
      duplicateSetSnapshot,
    )

    const unknown = await snapshots.inspectWorkoutRevisionSnapshotShape(
      userId,
      workoutId,
      unknownRevisionId,
    )
    const oversized = await snapshots.inspectWorkoutRevisionSnapshotShape(
      userId,
      workoutId,
      oversizedRevisionId,
    )
    const duplicateExercise = await snapshots.inspectWorkoutRevisionSnapshotShape(
      userId,
      workoutId,
      duplicateExerciseRevisionId,
    )
    const duplicateSet = await snapshots.inspectWorkoutRevisionSnapshotShape(
      userId,
      workoutId,
      duplicateSetRevisionId,
    )

    expect(unknown).toMatchObject({ compatibility: 'mixed', decomposable: false })
    expect(oversized.maximumExerciseHeaderBytes).toBeGreaterThan(
      portableExportSnapshotMaximumPayloadBytes,
    )
    expect(oversized.decomposable).toBe(false)
    expect(duplicateExercise.decomposable).toBe(false)
    expect(duplicateSet.decomposable).toBe(false)
  })

  it('rebuilds one immutable revision snapshot byte-for-byte in JSON ordinality', async () => {
    const userId = await createUser()
    const otherUserId = await createUser()
    const workoutId = await createWorkout(userId, '2026-08-11T02:45:00.000001Z')
    const storedFirstExerciseId = randomUUID()
    const storedSecondExerciseId = randomUUID()
    const storedFirstSetIds = [randomUUID(), randomUUID()]
    const storedSecondSetId = randomUUID()
    const snapshot = workoutRevisionSnapshot(userId, workoutId, 1, [
      {
        id: storedFirstExerciseId,
        position: 2,
        exerciseKey: 'stored_second',
        name: 'Stored first',
        category: 'strength',
        sets: [
          {
            id: storedFirstSetIds[0],
            position: 2,
            kind: 'working',
            reps: 8,
            canonicalLoadKg: null,
            completed: true,
          },
          {
            id: storedFirstSetIds[1],
            position: 1,
            kind: 'warmup',
            reps: 10,
            canonicalLoadKg: null,
            completed: true,
          },
        ],
      },
      {
        id: storedSecondExerciseId,
        position: 1,
        exerciseKey: 'stored_first',
        name: 'Stored second',
        category: 'strength',
        trackingMode: 'reps_load',
        equipment: [],
        sets: [
          {
            id: storedSecondSetId,
            position: 1,
            kind: 'working',
            reps: 10,
            canonicalLoadKg: null,
            completed: true,
          },
        ],
      },
    ])
    const revisionId = await createWorkoutRevision(
      userId,
      workoutId,
      1,
      '2026-08-11T02:50:00.000001Z',
      'created',
      snapshot,
    )
    const direct = await pool.query<{ snapshot: Record<string, unknown> }>(
      'SELECT snapshot FROM workout_revisions WHERE id = $1',
      [revisionId],
    )
    const session = snapshots.createWorkoutRevisionSnapshot(userId, workoutId, revisionId, {
      batchRows: 1,
    })
    const materialized: Array<Record<string, unknown>> = []

    for await (const revisionSnapshot of session.snapshots) {
      const root = { ...revisionSnapshot, exercises: [] as Array<Record<string, unknown>> }
      for await (const exercise of revisionSnapshot.exercises) {
        const exerciseValue = { ...exercise, sets: [] as Array<Record<string, unknown>> }
        for await (const set of exercise.sets) exerciseValue.sets.push(set)
        root.exercises.push(exerciseValue)
      }
      materialized.push(root)
    }
    await session.complete()

    expect(JSON.stringify(materialized[0])).toBe(JSON.stringify(direct.rows[0]!.snapshot))
    const materializedExercises = materialized[0]!.exercises as Array<Record<string, unknown>>
    expect(materializedExercises.map((exercise) => exercise.id)).toEqual([
      storedFirstExerciseId,
      storedSecondExerciseId,
    ])
    expect(
      (materializedExercises[0]!.sets as Array<Record<string, unknown>>).map((set) => set.id),
    ).toEqual(storedFirstSetIds)
    await expect(session.receipt).resolves.toMatchObject({
      batchRows: 1,
      shape: {
        compatibility: 'mixed',
        exerciseStorageOrderMatchesPosition: false,
        setStorageOrderMatchesPosition: false,
        decomposable: true,
      },
      snapshotRoots: { batchCount: 1, rowCount: 1 },
      snapshotExercises: { batchCount: 2, rowCount: 2 },
      snapshotSets: { batchCount: 3, rowCount: 3 },
    })

    const crossOwner = snapshots.createWorkoutRevisionSnapshot(otherUserId, workoutId, revisionId)
    const crossOwnerReceipt = crossOwner.receipt.catch((error: unknown) => error)
    let crossOwnerError: unknown
    try {
      await crossOwner.snapshots[Symbol.asyncIterator]().next()
    } catch (error) {
      crossOwnerError = error
    }
    expect(crossOwnerError).toMatchObject({ message: 'workout revision snapshot not found' })
    expect(await crossOwnerReceipt).toBe(crossOwnerError)
  })

  it('streams complete workout revision history byte-for-byte after the current relation graph', async () => {
    const userId = await createUser()
    const workoutId = await createWorkout(userId, '2026-08-11T02:52:00.000001Z')
    const currentExerciseId = await createWorkoutExercise(workoutId, 1)
    await createWorkoutSet(currentExerciseId, 1)
    const snapshotsByRevision = [
      workoutRevisionSnapshot(userId, workoutId, 1, [
        {
          id: randomUUID(),
          position: 2,
          exerciseKey: 'stored_first',
          name: '第一版存储首项',
          category: 'strength',
          sets: [
            {
              id: randomUUID(),
              position: 2,
              kind: 'working',
              reps: 8,
              canonicalLoadKg: null,
              completed: true,
            },
            {
              id: randomUUID(),
              position: 1,
              kind: 'warmup',
              reps: 10,
              canonicalLoadKg: null,
              completed: true,
            },
          ],
        },
      ]),
      workoutRevisionSnapshot(userId, workoutId, 2, [
        {
          id: randomUUID(),
          position: 1,
          exerciseKey: 'stored_second',
          name: '第二版',
          category: 'strength',
          trackingMode: 'reps_load',
          equipment: [],
          sets: [
            {
              id: randomUUID(),
              position: 1,
              kind: 'working',
              reps: 12,
              canonicalLoadKg: null,
              completed: true,
            },
          ],
        },
      ]),
    ]
    await createWorkoutRevision(
      userId,
      workoutId,
      1,
      '2026-08-11T02:53:00.000001Z',
      'created',
      snapshotsByRevision[0],
    )
    await createWorkoutRevision(
      userId,
      workoutId,
      2,
      '2026-08-11T02:53:00.000002Z',
      'updated',
      snapshotsByRevision[1],
    )
    const direct = await pool.query<{ payload: Record<string, unknown> }>(
      `SELECT to_jsonb(history) - 'user_id' - 'workout_id' AS payload
       FROM workout_revisions AS history
       WHERE history.user_id = $1 AND history.workout_id = $2
       ORDER BY history.revision`,
      [userId, workoutId],
    )
    const session = snapshots.createWorkoutRevisionSnapshotLayerSnapshot(userId, { batchRows: 1 })
    const materializedHistory: Array<Record<string, unknown>> = []

    for await (const workout of session.workouts) {
      for await (const exercise of workout.exercises) {
        for await (const _ of exercise.sets) {
          // Current relations must reach EOF before immutable history starts.
        }
      }
      for await (const revision of workout.history) {
        const snapshot = { ...revision.snapshot, exercises: [] as Array<Record<string, unknown>> }
        for await (const exercise of revision.snapshot.exercises) {
          const exerciseValue = { ...exercise, sets: [] as Array<Record<string, unknown>> }
          for await (const set of exercise.sets) exerciseValue.sets.push(set)
          snapshot.exercises.push(exerciseValue)
        }
        materializedHistory.push({ ...revision, snapshot })
      }
    }
    await session.complete()

    expect(materializedHistory).toHaveLength(2)
    expect(JSON.stringify(materializedHistory)).toBe(
      JSON.stringify(direct.rows.map((row) => row.payload)),
    )
    expect(
      (
        (materializedHistory[0]!.snapshot as Record<string, unknown>).exercises as Array<
          Record<string, unknown>
        >
      )[0]!.position,
    ).toBe(2)
    await expect(session.receipt).resolves.toMatchObject({
      batchRows: 1,
      workoutHeaders: { rowCount: 1 },
      workoutExercises: { rowCount: 1 },
      workoutSets: { rowCount: 1 },
      workoutRevisions: { batchCount: 2, rowCount: 2 },
      workoutRevisionSnapshotRoots: { batchCount: 2, rowCount: 2 },
      workoutRevisionSnapshotExercises: { batchCount: 2, rowCount: 2 },
      workoutRevisionSnapshotSets: { batchCount: 3, rowCount: 3 },
    })
  })

  it('serializes the complete lazy workouts array byte-for-byte in PostgreSQL JSONB field order', async () => {
    const userId = await createUser()
    const workoutId = await createWorkout(userId, '2026-08-11T02:53:30.000001Z')
    const currentExerciseId = await createWorkoutExercise(workoutId, 1, {
      name: '当前动作',
    })
    await createWorkoutSet(currentExerciseId, 1)
    const revisionSnapshots = [
      workoutRevisionSnapshot(userId, workoutId, 1, [
        {
          id: randomUUID(),
          position: 2,
          exerciseKey: 'history_first',
          name: '历史首项',
          category: 'strength',
          sets: [
            {
              id: randomUUID(),
              position: 2,
              kind: 'working',
              reps: 8,
              canonicalLoadKg: null,
              completed: true,
            },
            {
              id: randomUUID(),
              position: 1,
              kind: 'warmup',
              reps: 10,
              canonicalLoadKg: null,
              completed: true,
            },
          ],
        },
      ]),
      workoutRevisionSnapshot(userId, workoutId, 2, [
        {
          id: randomUUID(),
          position: 1,
          exerciseKey: 'history_second',
          name: '历史第二版',
          category: 'strength',
          trackingMode: 'reps_load',
          equipment: [],
          sets: [
            {
              id: randomUUID(),
              position: 1,
              kind: 'working',
              reps: 12,
              canonicalLoadKg: null,
              completed: true,
            },
          ],
        },
      ]),
    ]
    await createWorkoutRevision(
      userId,
      workoutId,
      1,
      '2026-08-11T02:53:40.000001Z',
      'created',
      revisionSnapshots[0],
    )
    await createWorkoutRevision(
      userId,
      workoutId,
      2,
      '2026-08-11T02:53:40.000002Z',
      'updated',
      revisionSnapshots[1],
    )
    const direct = await pool.query<{ payload: Record<string, unknown> }>(
      `SELECT (
         to_jsonb(workout) || jsonb_build_object(
           'exercises', COALESCE((
             SELECT jsonb_agg(
               (to_jsonb(exercise) - 'workout_id') || jsonb_build_object(
                 'sets', COALESCE((
                   SELECT jsonb_agg(to_jsonb(set_row) - 'exercise_id' ORDER BY set_row.position)
                   FROM workout_sets AS set_row WHERE set_row.exercise_id = exercise.id
                 ), '[]'::jsonb)
               ) ORDER BY exercise.position
             ) FROM workout_exercises AS exercise WHERE exercise.workout_id = workout.id
           ), '[]'::jsonb),
           'history', COALESCE((
             SELECT jsonb_agg((to_jsonb(history) - 'user_id' - 'workout_id') ORDER BY history.revision)
             FROM workout_revisions AS history WHERE history.workout_id = workout.id
           ), '[]'::jsonb)
         )
       ) AS payload
       FROM (
         SELECT id, title, status, source_kind, source_metadata, started_at, ended_at,
                timezone, pain_level, fatigue, note, revision, deleted_at, created_at, updated_at
         FROM workout_sessions WHERE user_id = $1 ORDER BY started_at, created_at, id
       ) AS workout`,
      [userId],
    )
    const eager = privacyExportSchema.parse({
      schemaVersion: privacyExportSchemaVersion,
      generatedAt: '2026-08-11T02:54:00.000Z',
      accountId: userId,
      data: {
        account: { id: userId, status: 'active' },
        identities: [],
        profile: null,
        goal: null,
        consentEvents: [],
        healthRecords: [],
        healthRecordRevisions: [],
        exerciseCatalog: [],
        foodCatalog: [],
        workouts: direct.rows.map((row) => row.payload),
        nutritionMeals: [],
        nutritionFavorites: [],
        weeklyPlans: [],
        aiExplanationRuns: [],
        foodPhotoAnalyses: [],
        progressPhotos: [],
      },
    })
    const expected = serializePortableExport(eager, Number.MAX_SAFE_INTEGER)
    const layer = snapshots.createWorkoutRevisionSnapshotJsonLayerSnapshot(userId, {
      batchRows: 1,
    })
    const workoutSource = createPortableExportWorkoutJsonSource(layer)
    const json = createPortableExportJsonStream(
      {
        ...eager,
        data: { ...eager.data, workouts: workoutSource.workouts as never },
      },
      { chunkBytes: 37, lifecycle: workoutSource },
    )
    let layerSettled = false
    void layer.receipt.finally(() => {
      layerSettled = true
    })
    const chunks: Buffer[] = []

    for await (const chunk of json.bytes) {
      expect(chunk.length).toBeLessThanOrEqual(37)
      chunks.push(Buffer.from(chunk))
    }

    expect(Buffer.concat(chunks)).toEqual(expected)
    expect(layerSettled).toBe(true)
    await expect(layer.receipt).resolves.toMatchObject({
      batchRows: 1,
      workoutHeaders: { batchCount: 1, rowCount: 1 },
      workoutExercises: { batchCount: 1, rowCount: 1 },
      workoutSets: { batchCount: 1, rowCount: 1 },
      workoutRevisions: { batchCount: 2, rowCount: 2 },
      workoutRevisionSnapshotRoots: { batchCount: 2, rowCount: 2 },
      workoutRevisionSnapshotExercises: { batchCount: 2, rowCount: 2 },
      workoutRevisionSnapshotSets: { batchCount: 3, rowCount: 3 },
    })
    await expect(json.receipt).resolves.toEqual({
      schemaVersion: privacyExportSchemaVersion,
      chunkBytes: 37,
      byteLength: expected.length,
      sha256: createHash('sha256').update(expected).digest('hex'),
    })
  })

  it('cancels the JSON-ordered workout transaction from an active immutable set', async () => {
    const userId = await createUser()
    const workoutId = await createWorkout(userId, '2026-08-11T02:54:10.000001Z')
    const firstSetId = randomUUID()
    const snapshot = workoutRevisionSnapshot(userId, workoutId, 1, [
      {
        id: randomUUID(),
        position: 1,
        exerciseKey: 'json_cancel',
        name: 'JSON cancellation fixture',
        category: 'strength',
        sets: [
          {
            id: firstSetId,
            position: 1,
            kind: 'working',
            reps: 10,
            canonicalLoadKg: null,
            completed: true,
          },
          {
            id: randomUUID(),
            position: 2,
            kind: 'working',
            reps: 8,
            canonicalLoadKg: null,
            completed: true,
          },
        ],
      },
    ])
    await createWorkoutRevision(
      userId,
      workoutId,
      1,
      '2026-08-11T02:54:20.000001Z',
      'created',
      snapshot,
    )
    const eager = privacyExportSchema.parse({
      schemaVersion: privacyExportSchemaVersion,
      generatedAt: '2026-08-11T02:54:30.000Z',
      accountId: userId,
      data: {
        account: { id: userId },
        identities: [],
        profile: null,
        goal: null,
        consentEvents: [],
        healthRecords: [],
        healthRecordRevisions: [],
        exerciseCatalog: [],
        foodCatalog: [],
        workouts: [],
        nutritionMeals: [],
        nutritionFavorites: [],
        weeklyPlans: [],
        aiExplanationRuns: [],
        foodPhotoAnalyses: [],
        progressPhotos: [],
      },
    })
    const layer = snapshots.createWorkoutRevisionSnapshotJsonLayerSnapshot(userId, {
      batchRows: 1,
    })
    const workoutSource = createPortableExportWorkoutJsonSource(layer)
    const json = createPortableExportJsonStream(
      {
        ...eager,
        data: { ...eager.data, workouts: workoutSource.workouts as never },
      },
      { chunkBytes: 1, lifecycle: workoutSource },
    )
    const iterator = json.bytes[Symbol.asyncIterator]()
    let prefix = ''
    while (!prefix.includes(firstSetId)) {
      const next = await iterator.next()
      if (next.done) throw new Error('snapshot set fixture was not reached')
      prefix += next.value.toString('utf8')
    }
    const jsonFailure = json.receipt.catch((error: unknown) => error)
    const layerFailure = layer.receipt.catch((error: unknown) => error)
    let returnFailure: unknown

    try {
      await iterator.return?.()
    } catch (error) {
      returnFailure = error
    }

    expect(await layerFailure).toBe(returnFailure)
    expect(await jsonFailure).toBe(returnFailure)
    expect(returnFailure).toMatchObject({
      message: 'portable export workout revision snapshot sets did not complete',
    })
  })

  it('fails the combined history before emitting an unknown revision snapshot', async () => {
    const userId = await createUser()
    const workoutId = await createWorkout(userId, '2026-08-11T02:54:00.000001Z')
    const secretMarker = `combined-unknown-${randomUUID()}`
    const snapshot = workoutRevisionSnapshot(userId, workoutId, 1, [], {
      unknownFutureField: secretMarker,
    })
    await createWorkoutRevision(
      userId,
      workoutId,
      1,
      '2026-08-11T02:54:30.000001Z',
      'created',
      snapshot,
    )
    const session = snapshots.createWorkoutRevisionSnapshotLayerSnapshot(userId)
    const workouts = session.workouts[Symbol.asyncIterator]()
    const workout = await workouts.next()
    for await (const _ of workout.value!.exercises) {
      // Reach history without exposing immutable snapshot content.
    }
    const receiptFailure = session.receipt.catch((error: unknown) => error)
    let historyFailure: unknown

    try {
      await workout.value!.history[Symbol.asyncIterator]().next()
    } catch (error) {
      historyFailure = error
    }

    expect(historyFailure).toBeInstanceOf(PortableExportWorkoutRevisionSnapshotNotDecomposableError)
    expect(String(historyFailure)).not.toContain(secretMarker)
    expect(await receiptFailure).toBe(historyFailure)
  })

  it('fails closed before emitting content for an unknown revision snapshot shape', async () => {
    const userId = await createUser()
    const workoutId = await createWorkout(userId, '2026-08-11T02:55:00.000001Z')
    const secretMarker = `unknown-snapshot-${randomUUID()}`
    const snapshot = workoutRevisionSnapshot(
      userId,
      workoutId,
      1,
      [
        {
          id: randomUUID(),
          position: 1,
          exerciseKey: 'unknown_shape',
          name: secretMarker,
          category: 'strength',
          sets: [
            {
              id: randomUUID(),
              position: 1,
              kind: 'working',
              reps: 10,
              canonicalLoadKg: null,
              completed: true,
            },
          ],
        },
      ],
      { unknownFutureField: secretMarker },
    )
    const revisionId = await createWorkoutRevision(
      userId,
      workoutId,
      1,
      '2026-08-11T03:00:00.000001Z',
      'created',
      snapshot,
    )
    const session = snapshots.createWorkoutRevisionSnapshot(userId, workoutId, revisionId)
    const receiptFailure = session.receipt.catch((error: unknown) => error)
    let streamFailure: unknown

    try {
      await session.snapshots[Symbol.asyncIterator]().next()
    } catch (error) {
      streamFailure = error
    }

    expect(streamFailure).toBeInstanceOf(PortableExportWorkoutRevisionSnapshotNotDecomposableError)
    expect(String(streamFailure)).not.toContain(secretMarker)
    expect(await receiptFailure).toBe(streamFailure)
  })

  it('closes an active immutable snapshot set before its exercise and root', async () => {
    const userId = await createUser()
    const workoutId = await createWorkout(userId, '2026-08-11T03:05:00.000001Z')
    const snapshot = workoutRevisionSnapshot(userId, workoutId, 1, [
      {
        id: randomUUID(),
        position: 1,
        exerciseKey: 'cancel_snapshot',
        name: 'Cancellation fixture',
        category: 'strength',
        sets: [
          {
            id: randomUUID(),
            position: 1,
            kind: 'working',
            reps: 10,
            canonicalLoadKg: null,
            completed: true,
          },
          {
            id: randomUUID(),
            position: 2,
            kind: 'working',
            reps: 8,
            canonicalLoadKg: null,
            completed: true,
          },
        ],
      },
    ])
    const revisionId = await createWorkoutRevision(
      userId,
      workoutId,
      1,
      '2026-08-11T03:10:00.000001Z',
      'created',
      snapshot,
    )
    const session = snapshots.createWorkoutRevisionSnapshot(userId, workoutId, revisionId, {
      batchRows: 1,
    })
    const snapshotRows = session.snapshots[Symbol.asyncIterator]()
    const root = await snapshotRows.next()
    const exercises = root.value!.exercises[Symbol.asyncIterator]()
    const exercise = await exercises.next()
    const sets = exercise.value!.sets[Symbol.asyncIterator]()
    await expect(sets.next()).resolves.toMatchObject({ done: false })
    const cancellation = new Error('immutable snapshot cancelled by lease owner')
    const receiptFailure = session.receipt.catch((error: unknown) => error)

    await session.cancel(cancellation)

    expect(await receiptFailure).toBe(cancellation)
    await expect(sets.next()).resolves.toEqual({ done: true, value: undefined })
    await expect(exercises.next()).resolves.toEqual({ done: true, value: undefined })
    await expect(snapshotRows.next()).rejects.toBe(cancellation)
  })

  it('streams one owner revision history across microsecond pages into byte-compatible v4 JSON', async () => {
    const userId = await createUser()
    const otherUserId = await createUser()
    const changedAt = [
      '2026-08-11T01:30:00.000001Z',
      '2026-08-11T01:30:00.000002Z',
      '2026-08-11T01:30:00.000003Z',
      '2026-08-11T01:30:00.000003Z',
      '2026-08-11T01:30:00.000005Z',
    ]
    const originalRevisions: Array<{ changedAt: string; id: string; revision: number }> = []
    for (let index = 0; index < changedAt.length; index += 1) {
      const recordId = await createRecord(userId, changedAt[index]!, 80 + index)
      const revision = index < 4 ? 1 : 2
      originalRevisions.push({
        changedAt: changedAt[index]!,
        id: await createRevision(userId, recordId, changedAt[index]!, revision),
        revision,
      })
    }
    const expectedOriginalIds = [...originalRevisions]
      .sort(
        (left, right) =>
          left.changedAt.localeCompare(right.changedAt) ||
          left.revision - right.revision ||
          left.id.localeCompare(right.id),
      )
      .map((revision) => revision.id)
    const otherRecordId = await createRecord(otherUserId, changedAt[2]!, 999)
    await createRevision(otherUserId, otherRecordId, changedAt[2]!)
    const index = await pool.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = 'health_record_revisions_user_export_idx'`,
    )
    expect(index.rows[0]?.indexdef).toContain('(user_id, changed_at, revision, id)')

    const stable = snapshots.createHealthRecordRevisionSnapshot(userId, { batchRows: 2 })
    const iterator = stable.rows[Symbol.asyncIterator]()
    const first = await iterator.next()
    expect(first).toMatchObject({ done: false, value: { id: expectedOriginalIds[0] } })

    const concurrentRecordId = await createRecord(userId, '2026-08-11T01:30:00.0000035Z', 88)
    const concurrentRevisionId = await createRevision(
      userId,
      concurrentRecordId,
      '2026-08-11T01:30:00.0000035Z',
    )
    const stableRows = [first.value!]
    while (true) {
      const next = await iterator.next()
      if (next.done) break
      stableRows.push(next.value)
    }

    expect(stableRows.map((row) => row.id)).toEqual(expectedOriginalIds)
    expect(stableRows.some((row) => row.id === concurrentRevisionId)).toBe(false)
    await expect(stable.receipt).resolves.toEqual({
      batchRows: 2,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      batchCount: 3,
      rowCount: 5,
    })

    const eagerSnapshot = snapshots.createHealthRecordRevisionSnapshot(userId, { batchRows: 2 })
    const eagerRows: Array<Record<string, unknown>> = []
    for await (const row of eagerSnapshot.rows) eagerRows.push(row)
    await expect(eagerSnapshot.receipt).resolves.toEqual({
      batchRows: 2,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      batchCount: 3,
      rowCount: 6,
    })
    const eagerPayload = privacyExportSchema.parse({
      schemaVersion: privacyExportSchemaVersion,
      generatedAt: '2026-08-11T01:45:00.000Z',
      accountId: userId,
      data: {
        account: { id: userId, status: 'active' },
        identities: [],
        profile: null,
        goal: null,
        consentEvents: [],
        healthRecords: [],
        healthRecordRevisions: eagerRows,
        exerciseCatalog: [],
        foodCatalog: [],
        workouts: [],
        nutritionMeals: [],
        nutritionFavorites: [],
        weeklyPlans: [],
        aiExplanationRuns: [],
        foodPhotoAnalyses: [],
        progressPhotos: [],
      },
    })
    const expected = serializePortableExport(eagerPayload, Number.MAX_SAFE_INTEGER)

    const lazySnapshot = snapshots.createHealthRecordRevisionSnapshot(userId, { batchRows: 2 })
    const json = createPortableExportJsonStream(
      {
        ...eagerPayload,
        data: {
          ...eagerPayload.data,
          healthRecordRevisions: portableExportJsonAsyncArray(lazySnapshot.rows),
        },
      },
      { chunkBytes: 41 },
    )
    const chunks: Buffer[] = []
    for await (const chunk of json.bytes) {
      expect(chunk.length).toBeLessThanOrEqual(41)
      chunks.push(Buffer.from(chunk))
    }

    expect(Buffer.concat(chunks)).toEqual(expected)
    await expect(lazySnapshot.receipt).resolves.toEqual({
      batchRows: 2,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      batchCount: 3,
      rowCount: 6,
    })
    await expect(json.receipt).resolves.toEqual({
      schemaVersion: privacyExportSchemaVersion,
      chunkBytes: 41,
      byteLength: expected.length,
      sha256: createHash('sha256').update(expected).digest('hex'),
    })
  })

  it('keeps current health facts and revisions in one root-committed database snapshot', async () => {
    const userId = await createUser()
    const firstRecordId = await createRecord(userId, '2026-08-11T01:50:00.000001Z', 70)
    const secondRecordId = await createRecord(userId, '2026-08-11T01:50:00.000002Z', 71)
    const firstRevisionId = await createRevision(
      userId,
      firstRecordId,
      '2026-08-11T01:55:00.000001Z',
    )
    const secondRevisionId = await createRevision(
      userId,
      secondRecordId,
      '2026-08-11T01:55:00.000002Z',
    )
    const stable = snapshots.createHealthHistorySnapshot(userId, { batchRows: 1 })
    const stableRecords: Array<Record<string, unknown>> = []
    const stableRevisions: Array<Record<string, unknown>> = []

    for await (const row of stable.healthRecords) stableRecords.push(row)
    const concurrentRecordId = await createRecord(userId, '2026-08-11T01:50:00.000003Z', 72)
    const concurrentRevisionId = await createRevision(
      userId,
      concurrentRecordId,
      '2026-08-11T01:55:00.000003Z',
    )
    for await (const row of stable.healthRecordRevisions) stableRevisions.push(row)
    let receiptSettled = false
    void stable.receipt.finally(() => {
      receiptSettled = true
    })

    expect(stableRecords.map((row) => row.id)).toEqual([firstRecordId, secondRecordId])
    expect(stableRevisions.map((row) => row.id)).toEqual([firstRevisionId, secondRevisionId])
    expect(stableRevisions.some((row) => row.id === concurrentRevisionId)).toBe(false)
    expect(receiptSettled).toBe(false)

    await stable.complete()

    await expect(stable.receipt).resolves.toEqual({
      batchRows: 1,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      healthRecords: { batchCount: 2, rowCount: 2 },
      healthRecordRevisions: { batchCount: 2, rowCount: 2 },
    })

    const eager = snapshots.createHealthHistorySnapshot(userId, { batchRows: 2 })
    const eagerRecords: Array<Record<string, unknown>> = []
    const eagerRevisions: Array<Record<string, unknown>> = []
    for await (const row of eager.healthRecords) eagerRecords.push(row)
    for await (const row of eager.healthRecordRevisions) eagerRevisions.push(row)
    await eager.complete()
    const eagerPayload = privacyExportSchema.parse({
      schemaVersion: privacyExportSchemaVersion,
      generatedAt: '2026-08-11T01:59:00.000Z',
      accountId: userId,
      data: {
        account: { id: userId, status: 'active' },
        identities: [],
        profile: null,
        goal: null,
        consentEvents: [],
        healthRecords: eagerRecords,
        healthRecordRevisions: eagerRevisions,
        exerciseCatalog: [],
        foodCatalog: [],
        workouts: [],
        nutritionMeals: [],
        nutritionFavorites: [],
        weeklyPlans: [],
        aiExplanationRuns: [],
        foodPhotoAnalyses: [],
        progressPhotos: [],
      },
    })
    expect(eagerRecords.map((row) => row.id)).toContain(concurrentRecordId)
    expect(eagerRevisions.map((row) => row.id)).toContain(concurrentRevisionId)
    const expected = serializePortableExport(eagerPayload, Number.MAX_SAFE_INTEGER)

    const lazy = snapshots.createHealthHistorySnapshot(userId, { batchRows: 2 })
    const json = createPortableExportJsonStream(
      {
        ...eagerPayload,
        data: {
          ...eagerPayload.data,
          healthRecords: portableExportJsonAsyncArray(lazy.healthRecords),
          healthRecordRevisions: portableExportJsonAsyncArray(lazy.healthRecordRevisions),
        },
      },
      { chunkBytes: 43, lifecycle: lazy },
    )
    const chunks: Buffer[] = []
    for await (const chunk of json.bytes) chunks.push(Buffer.from(chunk))

    expect(Buffer.concat(chunks)).toEqual(expected)
    await expect(lazy.receipt).resolves.toEqual({
      batchRows: 2,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      healthRecords: { batchCount: 2, rowCount: 3 },
      healthRecordRevisions: { batchCount: 2, rowCount: 3 },
    })
    await expect(json.receipt).resolves.toEqual({
      schemaVersion: privacyExportSchemaVersion,
      chunkBytes: 43,
      byteLength: expected.length,
      sha256: createHash('sha256').update(expected).digest('hex'),
    })
  })

  it('streams consent evidence and health history from one ordered root snapshot', async () => {
    const userId = await createUser()
    const otherUserId = await createUser()
    const consentAcceptedAt = '2026-08-11T01:47:00.000001Z'
    await Promise.all([
      createConsentEvent(userId, consentAcceptedAt, 'privacy'),
      createConsentEvent(userId, consentAcceptedAt, 'health_data'),
    ])
    const originalConsentIds = await pool.query<{ id: string }>(
      'SELECT id FROM consent_events WHERE user_id = $1 ORDER BY accepted_at, id',
      [userId],
    )
    await createConsentEvent(otherUserId, consentAcceptedAt, 'privacy')
    const firstRecordId = await createRecord(userId, '2026-08-11T01:48:00.000001Z', 70)
    const secondRecordId = await createRecord(userId, '2026-08-11T01:48:00.000002Z', 71)
    const firstRevisionId = await createRevision(
      userId,
      firstRecordId,
      '2026-08-11T01:49:00.000001Z',
    )
    const secondRevisionId = await createRevision(
      userId,
      secondRecordId,
      '2026-08-11T01:49:00.000002Z',
    )
    const index = await pool.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = 'consent_events_user_history_idx'`,
    )
    expect(index.rows[0]?.indexdef).toContain('(user_id, accepted_at DESC, id DESC)')

    const stable = snapshots.createConsentHealthSnapshot(userId, { batchRows: 1 })
    const stableConsentEvents: Array<Record<string, unknown>> = []
    const stableHealthRecords: Array<Record<string, unknown>> = []
    const stableHealthRecordRevisions: Array<Record<string, unknown>> = []
    for await (const row of stable.consentEvents) stableConsentEvents.push(row)

    const concurrentConsentId = await createConsentEvent(
      userId,
      '2026-08-11T01:47:00.000002Z',
      'progress_photo_analysis',
    )
    const concurrentRecordId = await createRecord(userId, '2026-08-11T01:48:00.000003Z', 72)
    const concurrentRevisionId = await createRevision(
      userId,
      concurrentRecordId,
      '2026-08-11T01:49:00.000003Z',
    )
    for await (const row of stable.healthRecords) stableHealthRecords.push(row)
    for await (const row of stable.healthRecordRevisions) {
      stableHealthRecordRevisions.push(row)
    }

    expect(stableConsentEvents.map((row) => row.id)).toEqual(
      originalConsentIds.rows.map((row) => row.id),
    )
    expect(stableConsentEvents.some((row) => row.id === concurrentConsentId)).toBe(false)
    expect(stableHealthRecords.map((row) => row.id)).toEqual([firstRecordId, secondRecordId])
    expect(stableHealthRecords.some((row) => row.id === concurrentRecordId)).toBe(false)
    expect(stableHealthRecordRevisions.map((row) => row.id)).toEqual([
      firstRevisionId,
      secondRevisionId,
    ])
    expect(stableHealthRecordRevisions.some((row) => row.id === concurrentRevisionId)).toBe(false)
    await stable.complete()
    await expect(stable.receipt).resolves.toEqual({
      batchRows: 1,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      consentEvents: { batchCount: 2, rowCount: 2 },
      healthRecords: { batchCount: 2, rowCount: 2 },
      healthRecordRevisions: { batchCount: 2, rowCount: 2 },
    })

    const eager = snapshots.createConsentHealthSnapshot(userId, { batchRows: 2 })
    const eagerConsentEvents: Array<Record<string, unknown>> = []
    const eagerHealthRecords: Array<Record<string, unknown>> = []
    const eagerHealthRecordRevisions: Array<Record<string, unknown>> = []
    for await (const row of eager.consentEvents) eagerConsentEvents.push(row)
    for await (const row of eager.healthRecords) eagerHealthRecords.push(row)
    for await (const row of eager.healthRecordRevisions) eagerHealthRecordRevisions.push(row)
    await eager.complete()
    expect(eagerConsentEvents.map((row) => row.id)).toContain(concurrentConsentId)
    expect(eagerHealthRecords.map((row) => row.id)).toContain(concurrentRecordId)
    expect(eagerHealthRecordRevisions.map((row) => row.id)).toContain(concurrentRevisionId)
    const eagerPayload = privacyExportSchema.parse({
      schemaVersion: privacyExportSchemaVersion,
      generatedAt: '2026-08-11T01:59:10.000Z',
      accountId: userId,
      data: {
        account: { id: userId, status: 'active' },
        identities: [],
        profile: null,
        goal: null,
        consentEvents: eagerConsentEvents,
        healthRecords: eagerHealthRecords,
        healthRecordRevisions: eagerHealthRecordRevisions,
        exerciseCatalog: [],
        foodCatalog: [],
        workouts: [],
        nutritionMeals: [],
        nutritionFavorites: [],
        weeklyPlans: [],
        aiExplanationRuns: [],
        foodPhotoAnalyses: [],
        progressPhotos: [],
      },
    })
    const expected = serializePortableExport(eagerPayload, Number.MAX_SAFE_INTEGER)

    const lazy = snapshots.createConsentHealthSnapshot(userId, { batchRows: 2 })
    const json = createPortableExportJsonStream(
      {
        ...eagerPayload,
        data: {
          ...eagerPayload.data,
          consentEvents: portableExportJsonAsyncArray(lazy.consentEvents),
          healthRecords: portableExportJsonAsyncArray(lazy.healthRecords),
          healthRecordRevisions: portableExportJsonAsyncArray(lazy.healthRecordRevisions),
        },
      },
      { chunkBytes: 47, lifecycle: lazy },
    )
    const chunks: Buffer[] = []
    for await (const chunk of json.bytes) chunks.push(Buffer.from(chunk))

    expect(Buffer.concat(chunks)).toEqual(expected)
    await expect(lazy.receipt).resolves.toEqual({
      batchRows: 2,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      consentEvents: { batchCount: 2, rowCount: 3 },
      healthRecords: { batchCount: 2, rowCount: 3 },
      healthRecordRevisions: { batchCount: 2, rowCount: 3 },
    })
    await expect(json.receipt).resolves.toEqual({
      schemaVersion: privacyExportSchemaVersion,
      chunkBytes: 47,
      byteLength: expected.length,
      sha256: createHash('sha256').update(expected).digest('hex'),
    })
  })

  it('rolls back the root transaction when JSON is cancelled after consent evidence', async () => {
    const userId = await createUser()
    await createConsentEvent(userId, '2026-08-11T01:59:20.000001Z')
    const snapshot = snapshots.createConsentHealthSnapshot(userId, { batchRows: 1 })
    let consentEventsCompleted = false
    let healthRecordsStarted = false
    const observedConsentEvents = (async function* () {
      for await (const row of snapshot.consentEvents) yield row
      consentEventsCompleted = true
    })()
    const observedHealthRecords = (async function* () {
      healthRecordsStarted = true
      yield* snapshot.healthRecords
    })()
    const payload = privacyExportSchema.parse({
      schemaVersion: privacyExportSchemaVersion,
      generatedAt: '2026-08-11T01:59:30.000Z',
      accountId: userId,
      data: {
        account: { id: userId },
        identities: [],
        profile: null,
        goal: null,
        consentEvents: [],
        healthRecords: [],
        healthRecordRevisions: [],
        exerciseCatalog: [],
        foodCatalog: [],
        workouts: [],
        nutritionMeals: [],
        nutritionFavorites: [],
        weeklyPlans: [],
        aiExplanationRuns: [],
        foodPhotoAnalyses: [],
        progressPhotos: [],
      },
    })
    const json = createPortableExportJsonStream(
      {
        ...payload,
        data: {
          ...payload.data,
          consentEvents: portableExportJsonAsyncArray(observedConsentEvents),
          healthRecords: portableExportJsonAsyncArray(observedHealthRecords),
          healthRecordRevisions: portableExportJsonAsyncArray(snapshot.healthRecordRevisions),
        },
      },
      { chunkBytes: 1, lifecycle: snapshot },
    )
    const iterator = json.bytes[Symbol.asyncIterator]()
    while (!consentEventsCompleted) {
      await expect(iterator.next()).resolves.toMatchObject({ done: false })
    }
    expect(healthRecordsStarted).toBe(false)
    const jsonFailure = json.receipt.catch((error: unknown) => error)
    const snapshotFailure = snapshot.receipt.catch((error: unknown) => error)

    await iterator.return?.()

    expect(await snapshotFailure).toBe(await jsonFailure)
    expect(await jsonFailure).toMatchObject({
      message: 'portable export JSON stream did not complete',
    })
  })

  it('rolls back one root transaction when JSON is cancelled between health fields', async () => {
    const userId = await createUser()
    const recordId = await createRecord(userId, '2026-08-11T01:59:30.000001Z', 70)
    await createRevision(userId, recordId, '2026-08-11T01:59:40.000001Z')
    const snapshot = snapshots.createHealthHistorySnapshot(userId, { batchRows: 1 })
    let healthRecordsCompleted = false
    let healthRecordRevisionsStarted = false
    const observedHealthRecords = (async function* () {
      for await (const row of snapshot.healthRecords) yield row
      healthRecordsCompleted = true
    })()
    const observedHealthRecordRevisions = (async function* () {
      healthRecordRevisionsStarted = true
      yield* snapshot.healthRecordRevisions
    })()
    const payload = privacyExportSchema.parse({
      schemaVersion: privacyExportSchemaVersion,
      generatedAt: '2026-08-11T01:59:50.000Z',
      accountId: userId,
      data: {
        account: { id: userId },
        identities: [],
        profile: null,
        goal: null,
        consentEvents: [],
        healthRecords: [],
        healthRecordRevisions: [],
        exerciseCatalog: [],
        foodCatalog: [],
        workouts: [],
        nutritionMeals: [],
        nutritionFavorites: [],
        weeklyPlans: [],
        aiExplanationRuns: [],
        foodPhotoAnalyses: [],
        progressPhotos: [],
      },
    })
    const json = createPortableExportJsonStream(
      {
        ...payload,
        data: {
          ...payload.data,
          healthRecords: portableExportJsonAsyncArray(observedHealthRecords),
          healthRecordRevisions: portableExportJsonAsyncArray(observedHealthRecordRevisions),
        },
      },
      { chunkBytes: 1, lifecycle: snapshot },
    )
    const iterator = json.bytes[Symbol.asyncIterator]()
    while (!healthRecordsCompleted) {
      await expect(iterator.next()).resolves.toMatchObject({ done: false })
    }
    expect(healthRecordRevisionsStarted).toBe(false)
    const jsonFailure = json.receipt.catch((error: unknown) => error)
    const snapshotFailure = snapshot.receipt.catch((error: unknown) => error)

    await iterator.return?.()

    expect(await snapshotFailure).toBe(await jsonFailure)
    expect(await jsonFailure).toMatchObject({
      message: 'portable export JSON stream did not complete',
    })
  })

  it('fails closed for an inactive owner and for cancellation between rows', async () => {
    const disabledUserId = await createUser('disabled')
    const inactive = snapshots.createHealthRecordSnapshot(disabledUserId)
    const inactiveReceipt = expect(inactive.receipt).rejects.toThrowError(
      'active account not found',
    )
    await expect(
      (async () => {
        for await (const _ of inactive.rows) {
          // No row may be exposed for an inactive owner.
        }
      })(),
    ).rejects.toThrowError('active account not found')
    await inactiveReceipt

    const activeUserId = await createUser()
    await createRecord(activeUserId, '2026-08-11T02:00:00.000001Z', 70)
    await createRecord(activeUserId, '2026-08-11T02:00:00.000002Z', 71)
    const abort = new AbortController()
    const cancelled = snapshots.createHealthRecordSnapshot(activeUserId, {
      batchRows: 1,
      signal: abort.signal,
    })
    const cancelledIterator = cancelled.rows[Symbol.asyncIterator]()
    await expect(cancelledIterator.next()).resolves.toMatchObject({ done: false })
    abort.abort(new Error('snapshot cancelled by lease owner'))
    const cancelledReceipt = expect(cancelled.receipt).rejects.toThrowError(
      'snapshot cancelled by lease owner',
    )
    await expect(cancelledIterator.next()).rejects.toThrowError('snapshot cancelled by lease owner')
    await cancelledReceipt
  })

  it('withholds an oversized row in PostgreSQL and propagates one root error through JSON', async () => {
    const userId = await createUser()
    const secretMarker = `must-not-cross-the-database-boundary-${randomUUID()}`
    const recordId = await createRecord(
      userId,
      '2026-08-11T02:30:00.000001Z',
      70,
      '2026-08-11T02:30:00.000001Z',
      { provider: `${secretMarker}-${'x'.repeat(2048)}` },
    )
    const measured = await pool.query<{ payload_byte_length: number }>(
      `SELECT octet_length(to_jsonb(record)::text) AS payload_byte_length
       FROM (
         SELECT id, metric, canonical_value, canonical_unit, display_value, display_unit,
                source_kind, source_metadata, confidence, status, occurred_at, timezone,
                revision, deleted_at, created_at, updated_at
         FROM health_records
         WHERE id = $1
       ) AS record`,
      [recordId],
    )
    const expectedPayloadBytes = measured.rows[0]!.payload_byte_length
    expect(expectedPayloadBytes).toBeGreaterThan(512)

    const snapshot = snapshots.createHealthRecordSnapshot(userId, {
      batchRows: 1,
      maximumPayloadBytes: 512,
    })
    const snapshotReceiptFailure = snapshot.receipt.catch((error: unknown) => error)
    const base = privacyExportSchema.parse({
      schemaVersion: privacyExportSchemaVersion,
      generatedAt: '2026-08-11T02:45:00.000Z',
      accountId: userId,
      data: {
        account: { id: userId },
        identities: [],
        profile: null,
        goal: null,
        consentEvents: [],
        healthRecords: [],
        healthRecordRevisions: [],
        exerciseCatalog: [],
        foodCatalog: [],
        workouts: [],
        nutritionMeals: [],
        nutritionFavorites: [],
        weeklyPlans: [],
        aiExplanationRuns: [],
        foodPhotoAnalyses: [],
        progressPhotos: [],
      },
    })
    const json = createPortableExportJsonStream(
      {
        ...base,
        data: {
          ...base.data,
          healthRecords: portableExportJsonAsyncArray(snapshot.rows),
        },
      },
      { chunkBytes: 64 },
    )
    const jsonReceiptFailure = json.receipt.catch((error: unknown) => error)
    const chunks: Buffer[] = []
    let streamFailure: unknown

    try {
      for await (const chunk of json.bytes) chunks.push(Buffer.from(chunk))
    } catch (error) {
      streamFailure = error
    }

    expect(streamFailure).toBeInstanceOf(PortableExportSnapshotPayloadTooLargeError)
    expect(streamFailure).toMatchObject({
      code: 'portable_export_snapshot_payload_too_large',
      maximumBytes: 512,
      actualBytes: expectedPayloadBytes,
    })
    expect(Buffer.concat(chunks).toString('utf8')).not.toContain(secretMarker)
    expect(await snapshotReceiptFailure).toBe(streamFailure)
    expect(await jsonReceiptFailure).toBe(streamFailure)
  })

  it('reuses the database payload gate for oversized health record revisions', async () => {
    const userId = await createUser()
    const secretMarker = `revision-must-not-cross-${randomUUID()}`
    const recordId = await createRecord(userId, '2026-08-11T02:50:00.000001Z', 70)
    const revisionId = await createRevision(userId, recordId, '2026-08-11T02:55:00.000001Z', 1, {
      provider: `${secretMarker}-${'y'.repeat(2048)}`,
    })
    const measured = await pool.query<{ payload_byte_length: number }>(
      `SELECT octet_length(to_jsonb(history)::text) AS payload_byte_length
       FROM (
         SELECT id, record_id, action, revision, metric, canonical_value, canonical_unit,
                display_value, display_unit, source_kind, source_metadata, confidence,
                status, occurred_at, timezone, created_at, updated_at, changed_at
         FROM health_record_revisions
         WHERE id = $1
       ) AS history`,
      [revisionId],
    )
    const expectedPayloadBytes = measured.rows[0]!.payload_byte_length
    expect(expectedPayloadBytes).toBeGreaterThan(512)

    const snapshot = snapshots.createHealthRecordRevisionSnapshot(userId, {
      batchRows: 1,
      maximumPayloadBytes: 512,
    })
    const snapshotReceiptFailure = snapshot.receipt.catch((error: unknown) => error)
    const base = privacyExportSchema.parse({
      schemaVersion: privacyExportSchemaVersion,
      generatedAt: '2026-08-11T02:59:00.000Z',
      accountId: userId,
      data: {
        account: { id: userId },
        identities: [],
        profile: null,
        goal: null,
        consentEvents: [],
        healthRecords: [],
        healthRecordRevisions: [],
        exerciseCatalog: [],
        foodCatalog: [],
        workouts: [],
        nutritionMeals: [],
        nutritionFavorites: [],
        weeklyPlans: [],
        aiExplanationRuns: [],
        foodPhotoAnalyses: [],
        progressPhotos: [],
      },
    })
    const json = createPortableExportJsonStream(
      {
        ...base,
        data: {
          ...base.data,
          healthRecordRevisions: portableExportJsonAsyncArray(snapshot.rows),
        },
      },
      { chunkBytes: 64 },
    )
    const jsonReceiptFailure = json.receipt.catch((error: unknown) => error)
    const chunks: Buffer[] = []
    let streamFailure: unknown

    try {
      for await (const chunk of json.bytes) chunks.push(Buffer.from(chunk))
    } catch (error) {
      streamFailure = error
    }

    expect(streamFailure).toBeInstanceOf(PortableExportSnapshotPayloadTooLargeError)
    expect(streamFailure).toMatchObject({
      code: 'portable_export_snapshot_payload_too_large',
      maximumBytes: 512,
      actualBytes: expectedPayloadBytes,
    })
    expect(Buffer.concat(chunks).toString('utf8')).not.toContain(secretMarker)
    expect(await snapshotReceiptFailure).toBe(streamFailure)
    expect(await jsonReceiptFailure).toBe(streamFailure)
  })

  it('feeds the owner snapshot into a byte-compatible complete v4 JSON tree without an array copy', async () => {
    const userId = await createUser()
    await createRecord(userId, '2026-08-11T03:00:00.000001Z', 70)
    await createRecord(userId, '2026-08-11T03:00:00.000002Z', 71)
    await createRecord(userId, '2026-08-11T03:00:00.000003Z', 72)

    const eagerSnapshot = snapshots.createHealthRecordSnapshot(userId, { batchRows: 2 })
    const eagerRows: Array<Record<string, unknown>> = []
    for await (const row of eagerSnapshot.rows) eagerRows.push(row)
    await expect(eagerSnapshot.receipt).resolves.toEqual({
      batchRows: 2,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      batchCount: 2,
      rowCount: 3,
    })
    const eagerPayload = privacyExportSchema.parse({
      schemaVersion: privacyExportSchemaVersion,
      generatedAt: '2026-08-11T03:30:00.000Z',
      accountId: userId,
      data: {
        account: { id: userId, status: 'active' },
        identities: [],
        profile: null,
        goal: null,
        consentEvents: [],
        healthRecords: eagerRows,
        healthRecordRevisions: [],
        exerciseCatalog: [],
        foodCatalog: [],
        workouts: [],
        nutritionMeals: [],
        nutritionFavorites: [],
        weeklyPlans: [],
        aiExplanationRuns: [],
        foodPhotoAnalyses: [],
        progressPhotos: [],
      },
    })
    const expected = serializePortableExport(eagerPayload, Number.MAX_SAFE_INTEGER)

    const lazySnapshot = snapshots.createHealthRecordSnapshot(userId, { batchRows: 2 })
    const json = createPortableExportJsonStream(
      {
        ...eagerPayload,
        data: {
          ...eagerPayload.data,
          healthRecords: portableExportJsonAsyncArray(lazySnapshot.rows),
        },
      },
      { chunkBytes: 37 },
    )
    const chunks: Buffer[] = []
    for await (const chunk of json.bytes) {
      expect(chunk.length).toBeLessThanOrEqual(37)
      chunks.push(Buffer.from(chunk))
    }

    expect(Buffer.concat(chunks)).toEqual(expected)
    await expect(lazySnapshot.receipt).resolves.toEqual({
      batchRows: 2,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      batchCount: 2,
      rowCount: 3,
    })
    await expect(json.receipt).resolves.toEqual({
      schemaVersion: privacyExportSchemaVersion,
      chunkBytes: 37,
      byteLength: expected.length,
      sha256: createHash('sha256').update(expected).digest('hex'),
    })
  })

  it('rolls back the database snapshot when the composed JSON consumer stops early', async () => {
    const userId = await createUser()
    await createRecord(userId, '2026-08-11T04:00:00.000001Z', 70)
    await createRecord(userId, '2026-08-11T04:00:00.000002Z', 71)
    const snapshot = snapshots.createHealthRecordSnapshot(userId, { batchRows: 1 })
    let yieldedRows = 0
    const observedRows = (async function* () {
      for await (const row of snapshot.rows) {
        yieldedRows += 1
        yield row
      }
    })()
    const base = privacyExportSchema.parse({
      schemaVersion: privacyExportSchemaVersion,
      generatedAt: '2026-08-11T04:30:00.000Z',
      accountId: userId,
      data: {
        account: { id: userId },
        identities: [],
        profile: null,
        goal: null,
        consentEvents: [],
        healthRecords: [],
        healthRecordRevisions: [],
        exerciseCatalog: [],
        foodCatalog: [],
        workouts: [],
        nutritionMeals: [],
        nutritionFavorites: [],
        weeklyPlans: [],
        aiExplanationRuns: [],
        foodPhotoAnalyses: [],
        progressPhotos: [],
      },
    })
    const json = createPortableExportJsonStream(
      {
        ...base,
        data: {
          ...base.data,
          healthRecords: portableExportJsonAsyncArray(observedRows),
        },
      },
      { chunkBytes: 32 },
    )
    const iterator = json.bytes[Symbol.asyncIterator]()
    while (yieldedRows === 0) {
      await expect(iterator.next()).resolves.toMatchObject({ done: false })
    }
    const jsonReceiptRejection = expect(json.receipt).rejects.toThrowError(
      'portable export JSON stream did not complete',
    )
    const snapshotReceiptRejection = expect(snapshot.receipt).rejects.toThrowError(
      'portable export database snapshot did not complete',
    )

    await iterator.return?.()
    await Promise.all([jsonReceiptRejection, snapshotReceiptRejection])
  })

  it('streams owner exercise catalog histories as the fourth coordinated v4 field', async () => {
    const userId = await createUser()
    const otherUserId = await createUser()
    await createConsentEvent(userId, '2026-08-11T04:40:00.000001Z')
    const firstEntryId = await createExerciseCatalogEntry(userId, '2026-08-11T04:41:00.000001Z', {
      name: 'Owner active catalog',
      revision: 2,
    })
    await createExerciseCatalogRevision(
      userId,
      firstEntryId,
      1,
      '2026-08-11T04:42:00.000001Z',
      'created',
    )
    await createExerciseCatalogRevision(
      userId,
      firstEntryId,
      2,
      '2026-08-11T04:42:00.000002Z',
      'updated',
    )
    const archivedEntryId = await createExerciseCatalogEntry(
      userId,
      '2026-08-11T04:41:00.000002Z',
      {
        name: 'Owner archived catalog',
        archivedAt: '2026-08-11T04:43:00.000001Z',
      },
    )
    await createExerciseCatalogRevision(
      userId,
      archivedEntryId,
      1,
      '2026-08-11T04:43:00.000001Z',
      'archived',
    )
    const otherEntryId = await createExerciseCatalogEntry(
      otherUserId,
      '2026-08-11T04:41:00.000001Z',
      { name: 'Other owner catalog' },
    )
    await createExerciseCatalogRevision(otherUserId, otherEntryId, 1, '2026-08-11T04:42:00.000001Z')

    const stable = snapshots.createConsentHealthExerciseCatalogSnapshot(userId, {
      batchRows: 1,
    })
    for await (const _ of stable.consentEvents) {
      // Establish the root transaction through field one.
    }
    for await (const _ of stable.healthRecords) {
      // Reach field two boundary.
    }
    for await (const _ of stable.healthRecordRevisions) {
      // Reach field three boundary.
    }
    const concurrentEntryId = await createExerciseCatalogEntry(
      userId,
      '2026-08-11T04:41:00.000003Z',
      { name: 'Concurrent catalog' },
    )
    await createExerciseCatalogRevision(userId, concurrentEntryId, 1, '2026-08-11T04:44:00.000001Z')
    const stableCatalog: Array<Record<string, unknown>> = []
    for await (const entry of stable.exerciseCatalog) {
      const value = { ...entry, history: [] as Array<Record<string, unknown>> }
      for await (const revision of entry.history) value.history.push(revision)
      stableCatalog.push(value)
    }
    expect(stableCatalog.map((entry) => entry.id)).toEqual([firstEntryId, archivedEntryId])
    expect(stableCatalog.some((entry) => entry.id === concurrentEntryId)).toBe(false)
    expect(stableCatalog.some((entry) => entry.id === otherEntryId)).toBe(false)
    await stable.complete()
    await expect(stable.receipt).resolves.toMatchObject({
      consentEvents: { batchCount: 1, rowCount: 1 },
      exerciseCatalog: { batchCount: 2, rowCount: 2 },
      exerciseCatalogRevisions: { batchCount: 3, rowCount: 3 },
    })

    const index = await pool.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes
       WHERE schemaname = 'public'
         AND indexname = 'user_exercise_catalog_entries_user_export_idx'`,
    )
    expect(index.rows[0]?.indexdef).toContain('(user_id, created_at, id)')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SET LOCAL enable_seqscan = off')
      const plan = await client.query<{ 'QUERY PLAN': unknown }>(
        `EXPLAIN (FORMAT JSON, COSTS OFF) ${portableExportExerciseCatalogEntryPageQuery}`,
        [userId, null, 2, portableExportSnapshotMaximumPayloadBytes],
      )
      expect(JSON.stringify(plan.rows[0]?.['QUERY PLAN'])).toContain(
        'user_exercise_catalog_entries_user_export_idx',
      )
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }

    const eager = snapshots.createConsentHealthExerciseCatalogSnapshot(userId, { batchRows: 2 })
    const eagerConsentEvents: Array<Record<string, unknown>> = []
    const eagerHealthRecords: Array<Record<string, unknown>> = []
    const eagerHealthRecordRevisions: Array<Record<string, unknown>> = []
    const eagerCatalog: Array<Record<string, unknown>> = []
    for await (const row of eager.consentEvents) eagerConsentEvents.push(row)
    for await (const row of eager.healthRecords) eagerHealthRecords.push(row)
    for await (const row of eager.healthRecordRevisions) eagerHealthRecordRevisions.push(row)
    for await (const entry of eager.exerciseCatalog) {
      const value = { ...entry, history: [] as Array<Record<string, unknown>> }
      for await (const revision of entry.history) value.history.push(revision)
      eagerCatalog.push(value)
    }
    await eager.complete()
    const direct = await pool.query<{ payload: Record<string, unknown> }>(
      `SELECT (
         (to_jsonb(entry) - 'user_id' - 'idempotency_key' - 'request_hash')
         || jsonb_build_object(
           'history', COALESCE((
             SELECT jsonb_agg(
               (to_jsonb(history) - 'user_id' - 'entry_id') ORDER BY history.revision
             )
             FROM user_exercise_catalog_revisions AS history
             WHERE history.entry_id = entry.id
           ), '[]'::jsonb)
         )
       ) AS payload
       FROM user_exercise_catalog_entries AS entry
       WHERE user_id = $1
       ORDER BY created_at, id`,
      [userId],
    )
    expect(JSON.stringify(eagerCatalog)).toBe(JSON.stringify(direct.rows.map((row) => row.payload)))
    expect(eagerCatalog.map((entry) => entry.id)).toEqual([
      firstEntryId,
      archivedEntryId,
      concurrentEntryId,
    ])
    expect(eagerCatalog.some((entry) => entry.id === otherEntryId)).toBe(false)
    expect(eagerCatalog.every((entry) => entry.source !== 'starter')).toBe(true)

    const eagerPayload = privacyExportSchema.parse({
      schemaVersion: privacyExportSchemaVersion,
      generatedAt: '2026-08-11T04:50:00.000Z',
      accountId: userId,
      data: {
        account: { id: userId, status: 'active' },
        identities: [],
        profile: null,
        goal: null,
        consentEvents: eagerConsentEvents,
        healthRecords: eagerHealthRecords,
        healthRecordRevisions: eagerHealthRecordRevisions,
        exerciseCatalog: eagerCatalog,
        foodCatalog: [],
        workouts: [],
        nutritionMeals: [],
        nutritionFavorites: [],
        weeklyPlans: [],
        aiExplanationRuns: [],
        foodPhotoAnalyses: [],
        progressPhotos: [],
      },
    })
    const expected = serializePortableExport(eagerPayload, Number.MAX_SAFE_INTEGER)
    const lazy = snapshots.createConsentHealthExerciseCatalogSnapshot(userId, { batchRows: 2 })
    const source = createPortableExportConsentHealthExerciseCatalogJsonSource(lazy)
    const json = createPortableExportJsonStream(
      {
        ...eagerPayload,
        data: {
          ...eagerPayload.data,
          consentEvents: source.consentEvents as never,
          healthRecords: source.healthRecords as never,
          healthRecordRevisions: source.healthRecordRevisions as never,
          exerciseCatalog: source.exerciseCatalog as never,
        },
      },
      { chunkBytes: 41, lifecycle: source },
    )
    const chunks: Buffer[] = []
    for await (const chunk of json.bytes) chunks.push(Buffer.from(chunk))

    expect(Buffer.concat(chunks)).toEqual(expected)
    await expect(lazy.receipt).resolves.toMatchObject({
      exerciseCatalog: { batchCount: 2, rowCount: 3 },
      exerciseCatalogRevisions: { batchCount: 3, rowCount: 4 },
    })
    await expect(json.receipt).resolves.toEqual({
      schemaVersion: privacyExportSchemaVersion,
      chunkBytes: 41,
      byteLength: expected.length,
      sha256: createHash('sha256').update(expected).digest('hex'),
    })
  })

  it('cancels the four-field root from an active exercise catalog history', async () => {
    const userId = await createUser()
    const entryId = await createExerciseCatalogEntry(userId, '2026-08-11T05:00:00.000001Z', {
      name: 'Catalog cancellation',
      revision: 2,
    })
    const firstRevisionId = await createExerciseCatalogRevision(
      userId,
      entryId,
      1,
      '2026-08-11T05:01:00.000001Z',
    )
    await createExerciseCatalogRevision(
      userId,
      entryId,
      2,
      '2026-08-11T05:01:00.000002Z',
      'updated',
    )
    const base = privacyExportSchema.parse({
      schemaVersion: privacyExportSchemaVersion,
      generatedAt: '2026-08-11T05:02:00.000Z',
      accountId: userId,
      data: {
        account: { id: userId },
        identities: [],
        profile: null,
        goal: null,
        consentEvents: [],
        healthRecords: [],
        healthRecordRevisions: [],
        exerciseCatalog: [],
        foodCatalog: [],
        workouts: [],
        nutritionMeals: [],
        nutritionFavorites: [],
        weeklyPlans: [],
        aiExplanationRuns: [],
        foodPhotoAnalyses: [],
        progressPhotos: [],
      },
    })
    const snapshot = snapshots.createConsentHealthExerciseCatalogSnapshot(userId, {
      batchRows: 1,
    })
    const source = createPortableExportConsentHealthExerciseCatalogJsonSource(snapshot)
    const json = createPortableExportJsonStream(
      {
        ...base,
        data: {
          ...base.data,
          consentEvents: source.consentEvents as never,
          healthRecords: source.healthRecords as never,
          healthRecordRevisions: source.healthRecordRevisions as never,
          exerciseCatalog: source.exerciseCatalog as never,
        },
      },
      { chunkBytes: 1, lifecycle: source },
    )
    const iterator = json.bytes[Symbol.asyncIterator]()
    let prefix = ''
    while (!prefix.includes(firstRevisionId)) {
      const next = await iterator.next()
      if (next.done) throw new Error('exercise catalog revision fixture was not reached')
      prefix += next.value.toString('utf8')
    }
    const jsonFailure = json.receipt.catch((error: unknown) => error)
    const snapshotFailure = snapshot.receipt.catch((error: unknown) => error)
    let returnFailure: unknown

    try {
      await iterator.return?.()
    } catch (error) {
      returnFailure = error
    }

    expect(await snapshotFailure).toBe(returnFailure)
    expect(await jsonFailure).toBe(returnFailure)
    expect(returnFailure).toMatchObject({
      message: 'portable export exercise catalog history did not complete',
    })
  })

  it('streams owner food catalog histories as the fifth coordinated v4 field', async () => {
    const userId = await createUser()
    const otherUserId = await createUser()
    await createConsentEvent(userId, '2026-08-11T05:10:00.000001Z')
    const exerciseEntryId = await createExerciseCatalogEntry(
      userId,
      '2026-08-11T05:11:00.000001Z',
      { name: 'Boundary exercise' },
    )
    await createExerciseCatalogRevision(userId, exerciseEntryId, 1, '2026-08-11T05:12:00.000001Z')
    const firstEntryId = await createFoodCatalogEntry(userId, '2026-08-11T05:13:00.000001Z', {
      name: 'Owner active food',
      revision: 2,
    })
    await createFoodCatalogRevision(userId, firstEntryId, 1, '2026-08-11T05:14:00.000001Z')
    await createFoodCatalogRevision(
      userId,
      firstEntryId,
      2,
      '2026-08-11T05:14:00.000002Z',
      'updated',
    )
    const archivedEntryId = await createFoodCatalogEntry(userId, '2026-08-11T05:13:00.000002Z', {
      name: 'Owner archived food',
      archivedAt: '2026-08-11T05:15:00.000001Z',
    })
    await createFoodCatalogRevision(
      userId,
      archivedEntryId,
      1,
      '2026-08-11T05:15:00.000001Z',
      'archived',
    )
    const otherEntryId = await createFoodCatalogEntry(otherUserId, '2026-08-11T05:13:00.000001Z', {
      name: 'Other owner food',
    })
    await createFoodCatalogRevision(otherUserId, otherEntryId, 1, '2026-08-11T05:14:00.000001Z')

    const stable = snapshots.createConsentHealthCatalogSnapshot(userId, { batchRows: 1 })
    for await (const _ of stable.consentEvents) {
      // Establish the root transaction through field one.
    }
    for await (const _ of stable.healthRecords) {
      // Reach field two boundary.
    }
    for await (const _ of stable.healthRecordRevisions) {
      // Reach field three boundary.
    }
    for await (const entry of stable.exerciseCatalog) {
      for await (const _ of entry.history) {
        // Reach field four boundary with nested history complete.
      }
    }
    const concurrentEntryId = await createFoodCatalogEntry(userId, '2026-08-11T05:13:00.000003Z', {
      name: 'Concurrent food',
    })
    await createFoodCatalogRevision(userId, concurrentEntryId, 1, '2026-08-11T05:16:00.000001Z')
    const stableCatalog: Array<Record<string, unknown>> = []
    for await (const entry of stable.foodCatalog) {
      const value = { ...entry, history: [] as Array<Record<string, unknown>> }
      for await (const revision of entry.history) value.history.push(revision)
      stableCatalog.push(value)
    }
    expect(stableCatalog.map((entry) => entry.id)).toEqual([firstEntryId, archivedEntryId])
    expect(stableCatalog.some((entry) => entry.id === concurrentEntryId)).toBe(false)
    expect(stableCatalog.some((entry) => entry.id === otherEntryId)).toBe(false)
    await stable.complete()
    await expect(stable.receipt).resolves.toMatchObject({
      consentEvents: { batchCount: 1, rowCount: 1 },
      exerciseCatalog: { batchCount: 1, rowCount: 1 },
      exerciseCatalogRevisions: { batchCount: 1, rowCount: 1 },
      foodCatalog: { batchCount: 2, rowCount: 2 },
      foodCatalogRevisions: { batchCount: 3, rowCount: 3 },
    })

    const index = await pool.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes
       WHERE schemaname = 'public'
         AND indexname = 'user_food_catalog_entries_user_export_idx'`,
    )
    expect(index.rows[0]?.indexdef).toContain('(user_id, created_at, id)')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SET LOCAL enable_seqscan = off')
      const plan = await client.query<{ 'QUERY PLAN': unknown }>(
        `EXPLAIN (FORMAT JSON, COSTS OFF) ${portableExportFoodCatalogEntryPageQuery}`,
        [userId, null, 2, portableExportSnapshotMaximumPayloadBytes],
      )
      expect(JSON.stringify(plan.rows[0]?.['QUERY PLAN'])).toContain(
        'user_food_catalog_entries_user_export_idx',
      )
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }

    const eager = snapshots.createConsentHealthCatalogSnapshot(userId, { batchRows: 2 })
    const eagerConsentEvents: Array<Record<string, unknown>> = []
    const eagerHealthRecords: Array<Record<string, unknown>> = []
    const eagerHealthRecordRevisions: Array<Record<string, unknown>> = []
    const eagerExerciseCatalog: Array<Record<string, unknown>> = []
    const eagerFoodCatalog: Array<Record<string, unknown>> = []
    for await (const row of eager.consentEvents) eagerConsentEvents.push(row)
    for await (const row of eager.healthRecords) eagerHealthRecords.push(row)
    for await (const row of eager.healthRecordRevisions) eagerHealthRecordRevisions.push(row)
    for await (const entry of eager.exerciseCatalog) {
      const value = { ...entry, history: [] as Array<Record<string, unknown>> }
      for await (const revision of entry.history) value.history.push(revision)
      eagerExerciseCatalog.push(value)
    }
    for await (const entry of eager.foodCatalog) {
      const value = { ...entry, history: [] as Array<Record<string, unknown>> }
      for await (const revision of entry.history) value.history.push(revision)
      eagerFoodCatalog.push(value)
    }
    await eager.complete()
    const direct = await pool.query<{ payload: Record<string, unknown> }>(
      `SELECT (
         (to_jsonb(entry) - 'user_id' - 'idempotency_key' - 'request_hash')
         || jsonb_build_object(
           'history', COALESCE((
             SELECT jsonb_agg(
               (to_jsonb(history) - 'user_id' - 'entry_id') ORDER BY history.revision
             )
             FROM user_food_catalog_revisions AS history
             WHERE history.entry_id = entry.id
           ), '[]'::jsonb)
         )
       ) AS payload
       FROM user_food_catalog_entries AS entry
       WHERE user_id = $1
       ORDER BY created_at, id`,
      [userId],
    )
    expect(JSON.stringify(eagerFoodCatalog)).toBe(
      JSON.stringify(direct.rows.map((row) => row.payload)),
    )
    expect(eagerFoodCatalog.map((entry) => entry.id)).toEqual([
      firstEntryId,
      archivedEntryId,
      concurrentEntryId,
    ])
    expect(eagerFoodCatalog.some((entry) => entry.id === otherEntryId)).toBe(false)
    expect(
      eagerFoodCatalog.every(
        (entry) =>
          !('user_id' in entry) && !('idempotency_key' in entry) && !('request_hash' in entry),
      ),
    ).toBe(true)

    const eagerPayload = privacyExportSchema.parse({
      schemaVersion: privacyExportSchemaVersion,
      generatedAt: '2026-08-11T05:20:00.000Z',
      accountId: userId,
      data: {
        account: { id: userId, status: 'active' },
        identities: [],
        profile: null,
        goal: null,
        consentEvents: eagerConsentEvents,
        healthRecords: eagerHealthRecords,
        healthRecordRevisions: eagerHealthRecordRevisions,
        exerciseCatalog: eagerExerciseCatalog,
        foodCatalog: eagerFoodCatalog,
        workouts: [],
        nutritionMeals: [],
        nutritionFavorites: [],
        weeklyPlans: [],
        aiExplanationRuns: [],
        foodPhotoAnalyses: [],
        progressPhotos: [],
      },
    })
    const expected = serializePortableExport(eagerPayload, Number.MAX_SAFE_INTEGER)
    const lazy = snapshots.createConsentHealthCatalogSnapshot(userId, { batchRows: 2 })
    const source = createPortableExportConsentHealthCatalogJsonSource(lazy)
    const json = createPortableExportJsonStream(
      {
        ...eagerPayload,
        data: {
          ...eagerPayload.data,
          consentEvents: source.consentEvents as never,
          healthRecords: source.healthRecords as never,
          healthRecordRevisions: source.healthRecordRevisions as never,
          exerciseCatalog: source.exerciseCatalog as never,
          foodCatalog: source.foodCatalog as never,
        },
      },
      { chunkBytes: 43, lifecycle: source },
    )
    const chunks: Buffer[] = []
    for await (const chunk of json.bytes) chunks.push(Buffer.from(chunk))

    expect(Buffer.concat(chunks)).toEqual(expected)
    await expect(lazy.receipt).resolves.toMatchObject({
      foodCatalog: { batchCount: 2, rowCount: 3 },
      foodCatalogRevisions: { batchCount: 3, rowCount: 4 },
    })
    await expect(json.receipt).resolves.toEqual({
      schemaVersion: privacyExportSchemaVersion,
      chunkBytes: 43,
      byteLength: expected.length,
      sha256: createHash('sha256').update(expected).digest('hex'),
    })
  })

  it('cancels the five-field root from an active food catalog history', async () => {
    const userId = await createUser()
    const entryId = await createFoodCatalogEntry(userId, '2026-08-11T05:30:00.000001Z', {
      name: 'Food cancellation',
      revision: 2,
    })
    const firstRevisionId = await createFoodCatalogRevision(
      userId,
      entryId,
      1,
      '2026-08-11T05:31:00.000001Z',
    )
    await createFoodCatalogRevision(userId, entryId, 2, '2026-08-11T05:31:00.000002Z', 'updated')
    const base = privacyExportSchema.parse({
      schemaVersion: privacyExportSchemaVersion,
      generatedAt: '2026-08-11T05:32:00.000Z',
      accountId: userId,
      data: {
        account: { id: userId },
        identities: [],
        profile: null,
        goal: null,
        consentEvents: [],
        healthRecords: [],
        healthRecordRevisions: [],
        exerciseCatalog: [],
        foodCatalog: [],
        workouts: [],
        nutritionMeals: [],
        nutritionFavorites: [],
        weeklyPlans: [],
        aiExplanationRuns: [],
        foodPhotoAnalyses: [],
        progressPhotos: [],
      },
    })
    const snapshot = snapshots.createConsentHealthCatalogSnapshot(userId, { batchRows: 1 })
    const source = createPortableExportConsentHealthCatalogJsonSource(snapshot)
    const json = createPortableExportJsonStream(
      {
        ...base,
        data: {
          ...base.data,
          consentEvents: source.consentEvents as never,
          healthRecords: source.healthRecords as never,
          healthRecordRevisions: source.healthRecordRevisions as never,
          exerciseCatalog: source.exerciseCatalog as never,
          foodCatalog: source.foodCatalog as never,
        },
      },
      { chunkBytes: 1, lifecycle: source },
    )
    const iterator = json.bytes[Symbol.asyncIterator]()
    let prefix = ''
    while (!prefix.includes(firstRevisionId)) {
      const next = await iterator.next()
      if (next.done) throw new Error('food catalog revision fixture was not reached')
      prefix += next.value.toString('utf8')
    }
    const jsonFailure = json.receipt.catch((error: unknown) => error)
    const snapshotFailure = snapshot.receipt.catch((error: unknown) => error)
    let returnFailure: unknown

    try {
      await iterator.return?.()
    } catch (error) {
      returnFailure = error
    }

    expect(await snapshotFailure).toBe(returnFailure)
    expect(await jsonFailure).toBe(returnFailure)
    expect(returnFailure).toMatchObject({
      message: 'portable export food catalog history did not complete',
    })
  })

  it('streams complete workouts as the sixth field in the coordinated v4 snapshot', async () => {
    const userId = await createUser()
    const foodEntryId = await createFoodCatalogEntry(userId, '2026-08-11T05:40:00.000001Z', {
      name: 'Workout boundary food',
    })
    await createFoodCatalogRevision(userId, foodEntryId, 1, '2026-08-11T05:41:00.000001Z')
    const workoutId = await createWorkout(userId, '2026-08-11T05:42:00.000001Z')
    const currentExerciseId = await createWorkoutExercise(workoutId, 1)
    await createWorkoutSet(currentExerciseId, 1)
    const revisionSnapshot = workoutRevisionSnapshot(userId, workoutId, 1, [
      {
        id: randomUUID(),
        position: 1,
        exerciseKey: 'coordinated_history',
        name: '协调历史动作',
        category: 'strength',
        sets: [
          {
            id: randomUUID(),
            position: 1,
            kind: 'working',
            reps: 10,
            canonicalLoadKg: null,
            completed: true,
          },
        ],
      },
    ])
    await createWorkoutRevision(
      userId,
      workoutId,
      1,
      '2026-08-11T05:43:00.000001Z',
      'created',
      revisionSnapshot,
    )

    const materializeWorkouts = async (
      workouts: AsyncIterable<
        ReturnType<
          typeof snapshots.createConsentHealthCatalogWorkoutSnapshot
        >['workouts'] extends AsyncIterable<infer Workout>
          ? Workout
          : never
      >,
    ) => {
      const values: Array<Record<string, unknown>> = []
      for await (const workout of workouts) {
        const header = { ...workout.header }
        const history: Array<Record<string, unknown>> = []
        for await (const revision of workout.history) {
          const snapshotValue = {
            ...revision.snapshot,
            exercises: [] as Array<Record<string, unknown>>,
          }
          for await (const exercise of revision.snapshot.exercises) {
            const exerciseValue = { ...exercise, sets: [] as Array<Record<string, unknown>> }
            for await (const set of exercise.sets) exerciseValue.sets.push(set)
            snapshotValue.exercises.push(exerciseValue)
          }
          history.push({ ...revision, snapshot: snapshotValue })
        }
        header.history = history
        const exercises: Array<Record<string, unknown>> = []
        for await (const exercise of workout.exercises) {
          const exerciseValue = {
            ...exercise.header,
            sets: [] as Array<Record<string, unknown>>,
          }
          for await (const set of exercise.sets) exerciseValue.sets.push(set)
          exercises.push(exerciseValue)
        }
        header.exercises = exercises
        values.push(header)
      }
      return values
    }

    const stable = snapshots.createConsentHealthCatalogWorkoutSnapshot(userId, { batchRows: 1 })
    for await (const _ of stable.consentEvents) {
      // Establish the root transaction.
    }
    for await (const _ of stable.healthRecords) {
      // Reach field two.
    }
    for await (const _ of stable.healthRecordRevisions) {
      // Reach field three.
    }
    for await (const entry of stable.exerciseCatalog) {
      for await (const _ of entry.history) {
        // Reach field four.
      }
    }
    for await (const entry of stable.foodCatalog) {
      for await (const _ of entry.history) {
        // Reach field five.
      }
    }
    const concurrentWorkoutId = await createWorkout(
      userId,
      '2026-08-11T05:42:00.000002Z',
      '2026-08-11T05:42:00.000002Z',
      { title: 'Concurrent workout' },
    )
    const stableWorkouts = await materializeWorkouts(stable.workouts)
    expect(stableWorkouts.map((workout) => workout.id)).toEqual([workoutId])
    expect(stableWorkouts.some((workout) => workout.id === concurrentWorkoutId)).toBe(false)
    await stable.complete()
    await expect(stable.receipt).resolves.toMatchObject({
      foodCatalog: { batchCount: 1, rowCount: 1 },
      foodCatalogRevisions: { batchCount: 1, rowCount: 1 },
      workouts: { batchCount: 1, rowCount: 1 },
      workoutExercises: { batchCount: 1, rowCount: 1 },
      workoutSets: { batchCount: 1, rowCount: 1 },
      workoutRevisions: { batchCount: 1, rowCount: 1 },
      workoutRevisionSnapshotRoots: { batchCount: 1, rowCount: 1 },
      workoutRevisionSnapshotExercises: { batchCount: 1, rowCount: 1 },
      workoutRevisionSnapshotSets: { batchCount: 1, rowCount: 1 },
    })

    const eager = snapshots.createConsentHealthCatalogWorkoutSnapshot(userId, { batchRows: 2 })
    const consentEvents: Array<Record<string, unknown>> = []
    const healthRecords: Array<Record<string, unknown>> = []
    const healthRecordRevisions: Array<Record<string, unknown>> = []
    const exerciseCatalog: Array<Record<string, unknown>> = []
    const foodCatalog: Array<Record<string, unknown>> = []
    for await (const row of eager.consentEvents) consentEvents.push(row)
    for await (const row of eager.healthRecords) healthRecords.push(row)
    for await (const row of eager.healthRecordRevisions) healthRecordRevisions.push(row)
    for await (const entry of eager.exerciseCatalog) {
      const value = { ...entry, history: [] as Array<Record<string, unknown>> }
      for await (const revision of entry.history) value.history.push(revision)
      exerciseCatalog.push(value)
    }
    for await (const entry of eager.foodCatalog) {
      const value = { ...entry, history: [] as Array<Record<string, unknown>> }
      for await (const revision of entry.history) value.history.push(revision)
      foodCatalog.push(value)
    }
    const workouts = await materializeWorkouts(eager.workouts)
    await eager.complete()
    expect(workouts.map((workout) => workout.id)).toEqual([workoutId, concurrentWorkoutId])

    const eagerPayload = privacyExportSchema.parse({
      schemaVersion: privacyExportSchemaVersion,
      generatedAt: '2026-08-11T05:45:00.000Z',
      accountId: userId,
      data: {
        account: { id: userId, status: 'active' },
        identities: [],
        profile: null,
        goal: null,
        consentEvents,
        healthRecords,
        healthRecordRevisions,
        exerciseCatalog,
        foodCatalog,
        workouts,
        nutritionMeals: [],
        nutritionFavorites: [],
        weeklyPlans: [],
        aiExplanationRuns: [],
        foodPhotoAnalyses: [],
        progressPhotos: [],
      },
    })
    const expected = serializePortableExport(eagerPayload, Number.MAX_SAFE_INTEGER)
    const lazy = snapshots.createConsentHealthCatalogWorkoutSnapshot(userId, { batchRows: 2 })
    const source = createPortableExportConsentHealthCatalogWorkoutJsonSource(lazy)
    const json = createPortableExportJsonStream(
      {
        ...eagerPayload,
        data: {
          ...eagerPayload.data,
          consentEvents: source.consentEvents as never,
          healthRecords: source.healthRecords as never,
          healthRecordRevisions: source.healthRecordRevisions as never,
          exerciseCatalog: source.exerciseCatalog as never,
          foodCatalog: source.foodCatalog as never,
          workouts: source.workouts as never,
        },
      },
      { chunkBytes: 47, lifecycle: source },
    )
    const chunks: Buffer[] = []
    for await (const chunk of json.bytes) chunks.push(Buffer.from(chunk))

    expect(Buffer.concat(chunks)).toEqual(expected)
    await expect(lazy.receipt).resolves.toMatchObject({
      workouts: { rowCount: 2 },
      workoutExercises: { rowCount: 1 },
      workoutSets: { rowCount: 1 },
      workoutRevisions: { rowCount: 1 },
      workoutRevisionSnapshotRoots: { rowCount: 1 },
      workoutRevisionSnapshotExercises: { rowCount: 1 },
      workoutRevisionSnapshotSets: { rowCount: 1 },
    })
    await expect(json.receipt).resolves.toEqual({
      schemaVersion: privacyExportSchemaVersion,
      chunkBytes: 47,
      byteLength: expected.length,
      sha256: createHash('sha256').update(expected).digest('hex'),
    })
  })

  it('cancels the six-field root from an active immutable workout set', async () => {
    const userId = await createUser()
    const workoutId = await createWorkout(userId, '2026-08-11T05:50:00.000001Z')
    const firstSetId = randomUUID()
    const revisionSnapshot = workoutRevisionSnapshot(userId, workoutId, 1, [
      {
        id: randomUUID(),
        position: 1,
        exerciseKey: 'coordinated_cancel',
        name: 'Coordinated cancellation fixture',
        category: 'strength',
        sets: [
          {
            id: firstSetId,
            position: 1,
            kind: 'working',
            reps: 10,
            canonicalLoadKg: null,
            completed: true,
          },
          {
            id: randomUUID(),
            position: 2,
            kind: 'working',
            reps: 8,
            canonicalLoadKg: null,
            completed: true,
          },
        ],
      },
    ])
    await createWorkoutRevision(
      userId,
      workoutId,
      1,
      '2026-08-11T05:51:00.000001Z',
      'created',
      revisionSnapshot,
    )
    const base = privacyExportSchema.parse({
      schemaVersion: privacyExportSchemaVersion,
      generatedAt: '2026-08-11T05:52:00.000Z',
      accountId: userId,
      data: {
        account: { id: userId },
        identities: [],
        profile: null,
        goal: null,
        consentEvents: [],
        healthRecords: [],
        healthRecordRevisions: [],
        exerciseCatalog: [],
        foodCatalog: [],
        workouts: [],
        nutritionMeals: [],
        nutritionFavorites: [],
        weeklyPlans: [],
        aiExplanationRuns: [],
        foodPhotoAnalyses: [],
        progressPhotos: [],
      },
    })
    const snapshot = snapshots.createConsentHealthCatalogWorkoutSnapshot(userId, { batchRows: 1 })
    const source = createPortableExportConsentHealthCatalogWorkoutJsonSource(snapshot)
    const json = createPortableExportJsonStream(
      {
        ...base,
        data: {
          ...base.data,
          consentEvents: source.consentEvents as never,
          healthRecords: source.healthRecords as never,
          healthRecordRevisions: source.healthRecordRevisions as never,
          exerciseCatalog: source.exerciseCatalog as never,
          foodCatalog: source.foodCatalog as never,
          workouts: source.workouts as never,
        },
      },
      { chunkBytes: 1, lifecycle: source },
    )
    const iterator = json.bytes[Symbol.asyncIterator]()
    let prefix = ''
    while (!prefix.includes(firstSetId)) {
      const next = await iterator.next()
      if (next.done) throw new Error('coordinated workout set fixture was not reached')
      prefix += next.value.toString('utf8')
    }
    const jsonFailure = json.receipt.catch((error: unknown) => error)
    const snapshotFailure = snapshot.receipt.catch((error: unknown) => error)
    let returnFailure: unknown

    try {
      await iterator.return?.()
    } catch (error) {
      returnFailure = error
    }

    expect(await snapshotFailure).toBe(returnFailure)
    expect(await jsonFailure).toBe(returnFailure)
    expect(returnFailure).toMatchObject({
      message: 'portable export workout revision snapshot sets did not complete',
    })
  })
})
