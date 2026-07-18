import { readFile } from 'node:fs/promises'
import path from 'node:path'

import {
  ageBands,
  dietaryPreferenceOptions,
  equipmentOptions,
  exerciseCategories,
  foodCategories,
  foodPortionUnits,
  loadUnits,
  experienceLevels,
  metricCodes,
  mealRevisionActions,
  mealTypes,
  nutritionSourceKinds,
  planEngineVersion,
  planRevisionActions,
  planStatuses,
  primaryGoals,
  recordStatuses,
  revisionActions,
  riskFlags,
  sexForCalculationOptions,
  sourceKinds,
  unitCodes,
  unitSystems,
  weekdays,
  workoutRevisionActions,
  workoutSetKinds,
  workoutSourceKinds,
  workoutStatuses,
} from '@myfitness/contracts'
import { describe, expect, it } from 'vitest'

const migrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0001_health_records.sql',
)
const onboardingMigrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0002_users_onboarding.sql',
)
const lifecycleMigrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0003_health_record_lifecycle.sql',
)
const workoutMigrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0004_workout_sessions.sql',
)
const nutritionMigrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0005_nutrition_meals.sql',
)
const planMigrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0006_weekly_plans.sql',
)

describe('health-record migration drift', () => {
  it('contains every contract metric, unit and source kind', async () => {
    const migration = await readFile(migrationPath, 'utf8')

    for (const value of [...metricCodes, ...unitCodes, ...sourceKinds]) {
      expect(migration, `${value} is missing from the migration`).toContain(`'${value}'`)
    }
  })

  it('contains every onboarding enum at the database boundary', async () => {
    const migration = await readFile(onboardingMigrationPath, 'utf8')
    const values = [
      ...ageBands,
      ...sexForCalculationOptions,
      ...unitSystems,
      ...primaryGoals,
      ...experienceLevels,
      ...weekdays,
      ...equipmentOptions,
      ...dietaryPreferenceOptions,
      ...riskFlags,
    ]

    for (const value of values) {
      expect(migration, `${value} is missing from the onboarding migration`).toContain(`'${value}'`)
    }
  })

  it('contains every record lifecycle enum in the immutable revision boundary', async () => {
    const migration = await readFile(lifecycleMigrationPath, 'utf8')

    for (const value of [
      ...metricCodes,
      ...unitCodes,
      ...sourceKinds,
      ...recordStatuses,
      ...revisionActions,
    ]) {
      expect(migration, `${value} is missing from the lifecycle migration`).toContain(`'${value}'`)
    }
  })

  it('contains every workout lifecycle enum at the relational boundary', async () => {
    const migration = await readFile(workoutMigrationPath, 'utf8')
    for (const value of [
      ...workoutStatuses,
      ...exerciseCategories,
      ...workoutSetKinds,
      ...loadUnits,
      ...workoutSourceKinds,
      ...workoutRevisionActions,
    ]) {
      expect(migration, `${value} is missing from the workout migration`).toContain(`'${value}'`)
    }
  })

  it('contains every nutrition lifecycle enum at the snapshot boundary', async () => {
    const migration = await readFile(nutritionMigrationPath, 'utf8')
    for (const value of [
      ...mealTypes,
      ...foodCategories,
      ...foodPortionUnits,
      ...nutritionSourceKinds,
      ...mealRevisionActions,
    ]) {
      expect(migration, `${value} is missing from the nutrition migration`).toContain(`'${value}'`)
    }
  })

  it('contains every weekly plan lifecycle enum and engine version', async () => {
    const migration = await readFile(planMigrationPath, 'utf8')
    for (const value of [...planStatuses, ...planRevisionActions, planEngineVersion]) {
      expect(migration, `${value} is missing from the plan migration`).toContain(`'${value}'`)
    }
  })
})
