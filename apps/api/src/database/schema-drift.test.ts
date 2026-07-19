import { readFile } from 'node:fs/promises'
import path from 'node:path'

import {
  aiExplanationProviders,
  aiExplanationContentSchema,
  aiExplanationSources,
  aiPlanPromptVersions,
  aiPlanValidatorVersions,
  aiWorkerFailureCodes,
  ageBands,
  dietaryPreferenceOptions,
  equipmentOptions,
  exerciseCategories,
  foodCategories,
  foodPhotoConsentPurpose,
  foodPhotoPromptVersions,
  foodPhotoProviders,
  foodPhotoSources,
  foodPhotoStatuses,
  foodPhotoValidatorVersions,
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
  adminAuditActions,
  adminAuditOutcomes,
  adminAuditTargetTypes,
  adminIdentityProviders,
  adminRoles,
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
const aiMigrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0007_ai_explanations.sql',
)
const foodPhotoMigrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0008_food_photo_candidates.sql',
)
const privacyMigrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0010_privacy_ownership.sql',
)
const erasureReceiptMigrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0011_erasure_receipts.sql',
)
const adminMigrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0012_admin_support_boundary.sql',
)
const durableDataOperationsMigrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0013_durable_data_operations.sql',
)
const verifiedUserIdentityMigrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0015_verified_user_identity.sql',
)
const aiRecoveryMigrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0017_reconcile_ai_explanation_runs.sql',
)
const adversarialAiSafetyMigrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0018_version_adversarial_ai_safety.sql',
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

  it('contains every AI explanation provenance and failure enum', async () => {
    const migration = `${await readFile(aiMigrationPath, 'utf8')}\n${await readFile(
      adversarialAiSafetyMigrationPath,
      'utf8',
    )}`
    for (const value of [
      ...aiExplanationSources,
      ...aiExplanationProviders,
      ...aiWorkerFailureCodes,
      ...aiPlanPromptVersions,
      ...aiPlanValidatorVersions,
    ]) {
      expect(migration, `${value} is missing from the AI migration`).toContain(`'${value}'`)
    }
  })

  it('gives pending AI explanations a bounded deterministic recovery state', async () => {
    const migration = await readFile(aiRecoveryMigrationPath, 'utf8')
    for (const value of [
      'recovery_content',
      'expires_at',
      'ai_explanation_runs_recovery_check',
      'ai_explanation_runs_expiry_idx',
    ]) {
      expect(migration).toContain(value)
    }
    const legacyRecoveryJson = migration.match(/THEN\s+'(\{[\s\S]*?\})'::jsonb/)?.[1]
    expect(legacyRecoveryJson).toBeDefined()
    expect(aiExplanationContentSchema.parse(JSON.parse(legacyRecoveryJson!))).toMatchObject({
      headline: '上次说明已安全结束',
    })
  })

  it('contains every food-photo lifecycle, provenance and contract version', async () => {
    const migration = `${await readFile(foodPhotoMigrationPath, 'utf8')}\n${await readFile(
      adversarialAiSafetyMigrationPath,
      'utf8',
    )}`
    for (const value of [
      ...foodPhotoStatuses,
      ...foodPhotoSources,
      ...foodPhotoProviders,
      foodPhotoConsentPurpose,
      ...foodPhotoPromptVersions,
      ...foodPhotoValidatorVersions,
    ]) {
      expect(migration, `${value} is missing from the food-photo migration`).toContain(`'${value}'`)
    }
  })

  it('allows append-only consent cycles and user-scoped private photo keys', async () => {
    const migration = await readFile(privacyMigrationPath, 'utf8')
    expect(migration).toContain('DROP CONSTRAINT consent_events_user_id_purpose_version_key')
    expect(migration).toContain('consent_events_revocation_after_acceptance_check')
    expect(migration).toContain("storage_key ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\\.jpg$'")
  })

  it('persists only an unlinkable primary-store erasure receipt', async () => {
    const migration = await readFile(erasureReceiptMigrationPath, 'utf8')
    expect(migration).toContain('CREATE TABLE privacy_erasure_receipts')
    expect(migration).toContain("scope_version = 'primary-store-v1'")
    expect(migration).not.toContain('user_id')
  })

  it('adds leased durable deletion jobs and a restore-safe erasure scope', async () => {
    const migration = await readFile(durableDataOperationsMigrationPath, 'utf8')
    for (const value of [
      'durable-erasure-v2',
      'photo_object_delete',
      'photo_prefix_delete',
      'account_erasure',
      'retry_wait',
      'dead_letter',
      'lease_expires_at',
      'data_operation_attempts',
      'ledger_published',
      'policy_bound',
    ]) {
      expect(migration).toContain(value)
    }
  })

  it('binds session providers and persists unlinkable erased identity suppressions', async () => {
    const migration = await readFile(verifiedUserIdentityMigrationPath, 'utf8')
    for (const value of [
      'ALTER TABLE auth_sessions',
      'ADD COLUMN provider',
      'auth_identity_suppressions',
      'subject_ref',
      'erasure_receipt_id',
      "'wechat'",
    ]) {
      expect(migration).toContain(value)
    }
    expect(migration).not.toContain('provider_subject')
  })

  it('contains every administrator enum and rejects audit mutation', async () => {
    const migration = await readFile(adminMigrationPath, 'utf8')
    for (const value of [
      ...adminRoles,
      ...adminIdentityProviders,
      ...adminAuditActions,
      ...adminAuditOutcomes,
      ...adminAuditTargetTypes,
    ]) {
      expect(migration, `${value} is missing from the admin migration`).toContain(`'${value}'`)
    }
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON admin_audit_events')
    expect(migration).toContain('admin audit events are append-only')
  })
})
