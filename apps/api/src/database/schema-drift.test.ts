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
  exerciseCatalogRevisionActions,
  exerciseEquipmentOptions,
  exerciseTrackingModes,
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
  measurementPersistenceDecimalPlaces,
  nutritionSourceKinds,
  onboardingGoalHistoryCoverageStates,
  onboardingGoalRevisionActions,
  onboardingGoalSnapshotVersion,
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
  progressPhotoAnalysisConsentPurpose,
  progressPhotoQualityMethodVersion,
  progressPhotoRetentionConsentPurpose,
  progressPhotoRetentionModes,
  progressPhotoStatuses,
  progressPhotoViews,
  personalModelClaimSchemaVersions,
  personalModelContractVersion,
  personalModelEvidenceKinds,
  personalModelEvidenceQualificationStates,
  personalModelEvidenceRoles,
  personalModelEvidenceSources,
  personalModelEvidenceWithdrawalReasons,
  personalModelFeedbackChoices,
  personalModelFeedbackNoOpReasons,
  personalModelFeedbackReasonCodes,
  personalModelFeedbackStates,
  personalModelFeedbackTransitionVersion,
  personalModelItemRevisionVersion,
  personalModelKinds,
  personalModelRevisionActions,
  personalModelSources,
  personalModelStatuses,
  personalModelSubjectKeys,
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
const progressPhotoMigrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0020_progress_photos.sql',
)
const authoritativeWorkoutStatusMigrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0021_authoritative_workout_status.sql',
)
const exerciseCatalogMigrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0023_user_exercise_catalog.sql',
)
const consentReceiptHistoryMigrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0027_consent_receipt_history_index.sql',
)
const portableExportArchiveMigrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0029_portable_export_archive_custody.sql',
)
const portableExportArchiveSafeSizeMigrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0030_portable_export_archive_safe_size.sql',
)
const portableExportExerciseCatalogIndexMigrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0033_portable_export_exercise_catalog_index.sql',
)
const portableExportFoodCatalogIndexMigrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0034_portable_export_food_catalog_index.sql',
)
const portableExportNutritionMealIndexMigrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0035_portable_export_nutrition_meal_index.sql',
)
const portableExportPlanWorkoutLinkIndexMigrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0036_portable_export_plan_workout_link_index.sql',
)
const personalModelItemRevisionMigrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0037_personal_model_item_revision_core.sql',
)
const personalModelFeedbackEventMigrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0038_personal_model_feedback_event_core.sql',
)
const personalModelEvidenceProjectionMigrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0039_personal_model_evidence_projection_core.sql',
)
const onboardingGoalRevisionHistoryMigrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0040_onboarding_goal_revision_history.sql',
)
const personalModelSourceQualificationMigrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0041_personal_model_source_qualification.sql',
)
const personalModelItemGenerationMigrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0042_personal_model_item_generation.sql',
)
const personalModelGenerationRefreshRaceMigrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0043_personal_model_generation_refresh_race.sql',
)
const personalModelGenerationStrictTimesMigrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0044_personal_model_generation_strict_times.sql',
)

describe('health-record migration drift', () => {
  it('contains every contract metric, unit and source kind', async () => {
    const migration = await readFile(migrationPath, 'utf8')

    for (const value of [...metricCodes, ...unitCodes, ...sourceKinds]) {
      expect(migration, `${value} is missing from the migration`).toContain(`'${value}'`)
    }
  })

  it('keeps measurement value columns at the shared persistence scale', async () => {
    const [recordMigration, revisionMigration] = await Promise.all([
      readFile(migrationPath, 'utf8'),
      readFile(lifecycleMigrationPath, 'utf8'),
    ])
    const numericType = `NUMERIC(14, ${measurementPersistenceDecimalPlaces})`

    for (const migration of [recordMigration, revisionMigration]) {
      expect(migration).toContain(`canonical_value ${numericType}`)
      expect(migration).toContain(`display_value ${numericType}`)
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

  it('backfills the server-authoritative workout status invariant', async () => {
    const migration = await readFile(authoritativeWorkoutStatusMigrationPath, 'utf8')
    expect(migration).toContain('BOOL_AND(set_row.completed)')
    expect(migration).toContain('COUNT(set_row.id) > 0')
    expect(migration).toContain('Server-derived cache')
  })

  it('contains every exercise catalog lifecycle, tracking and equipment enum', async () => {
    const migration = await readFile(exerciseCatalogMigrationPath, 'utf8')
    for (const value of [
      ...exerciseCatalogRevisionActions,
      ...exerciseTrackingModes,
      ...exerciseEquipmentOptions,
    ]) {
      expect(migration, `${value} is missing from the exercise catalog migration`).toContain(
        `'${value}'`,
      )
    }
    expect(migration).toContain('user_exercise_catalog_active_name_unique')
    expect(migration).toContain('user_exercise_catalog_revision_owner_fk')
    expect(migration).toContain('workout_exercises_other_equipment_notes_check')
  })

  it('indexes the complete owner exercise catalog export order', async () => {
    const migration = await readFile(portableExportExerciseCatalogIndexMigrationPath, 'utf8')
    expect(migration).toContain('ON user_exercise_catalog_entries (user_id, created_at, id)')
  })

  it('indexes the complete owner food catalog export order', async () => {
    const migration = await readFile(portableExportFoodCatalogIndexMigrationPath, 'utf8')
    expect(migration).toContain('ON user_food_catalog_entries (user_id, created_at, id)')
  })

  it('indexes the complete owner nutrition meal export order', async () => {
    const migration = await readFile(portableExportNutritionMealIndexMigrationPath, 'utf8')
    expect(migration).toContain('ON nutrition_meals (user_id, occurred_at, created_at, id)')
  })

  it('indexes the complete owner plan workout link export order', async () => {
    const migration = await readFile(portableExportPlanWorkoutLinkIndexMigrationPath, 'utf8')
    expect(migration).toContain('ON plan_workout_links (user_id, plan_id, linked_at, id)')
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

  it('contains every progress-photo lifecycle, consent boundary and quality method', async () => {
    const migration = await readFile(progressPhotoMigrationPath, 'utf8')
    for (const value of [
      ...progressPhotoStatuses,
      ...progressPhotoViews,
      ...progressPhotoRetentionModes,
      progressPhotoAnalysisConsentPurpose,
      progressPhotoRetentionConsentPurpose,
      progressPhotoQualityMethodVersion,
    ]) {
      expect(migration, `${value} is missing from the progress-photo migration`).toContain(
        `'${value}'`,
      )
    }
    expect(migration).toContain('/progress/')
    expect(migration).toContain("content_type = 'image/jpeg'")
  })

  it('allows append-only consent cycles and user-scoped private photo keys', async () => {
    const migration = await readFile(privacyMigrationPath, 'utf8')
    expect(migration).toContain('DROP CONSTRAINT consent_events_user_id_purpose_version_key')
    expect(migration).toContain('consent_events_revocation_after_acceptance_check')
    expect(migration).toContain("storage_key ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\\.jpg$'")
  })

  it('indexes owner consent receipts in the complete history order', async () => {
    const migration = await readFile(consentReceiptHistoryMigrationPath, 'utf8')
    expect(migration).toContain('ON consent_events (user_id, accepted_at DESC, id DESC)')
  })

  it('locks portable export archive custody states and monotonic transitions', async () => {
    const migration = `${await readFile(portableExportArchiveMigrationPath, 'utf8')}\n${await readFile(
      portableExportArchiveSafeSizeMigrationPath,
      'utf8',
    )}`
    for (const value of [
      'privacy_export_archives',
      'myfitness-portable-export-v4',
      'queued',
      'generating',
      'available',
      'failed',
      'deletion_pending',
      'disposed',
      'encryption_key_ref',
      'download_expires_at',
      'available_at <= generation_expires_at',
      'account_erasure',
      'ON DELETE RESTRICT',
      'privacy_export_archives_transition_guard',
      'artifact_byte_size <= 9007199254740991',
    ]) {
      expect(migration).toContain(value)
    }
    expect(migration).not.toContain('download_url')
    expect(migration).not.toContain('access_token')
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

  it('locks Personal Model owner, revision and immutable snapshot boundaries', async () => {
    const migration = await readFile(personalModelItemRevisionMigrationPath, 'utf8')
    for (const value of [
      personalModelContractVersion,
      personalModelItemRevisionVersion,
      ...personalModelKinds,
      ...personalModelStatuses,
      ...personalModelSources,
      ...personalModelClaimSchemaVersions,
      ...personalModelSubjectKeys,
      ...personalModelFeedbackStates,
      ...personalModelRevisionActions,
    ]) {
      expect(migration, `${value} is missing from the Personal Model migration`).toContain(
        `'${value}'`,
      )
    }
    for (const boundary of [
      'personal_model_items_owner_identity_subject_unique',
      'personal_model_item_revisions_owner_item_subject_fk',
      'personal_model_item_revisions_previous_fk',
      'personal_model_items_current_revision_fk',
      'personal_model_item_revisions_feedback_persistence_pending_check',
      'DEFERRABLE INITIALLY DEFERRED',
      'personal_model_items_mutation_guard',
      'personal_model_item_revisions_immutable',
      'personal_model_item_revisions_current_guard',
      'ON DELETE CASCADE',
    ]) {
      expect(migration).toContain(boundary)
    }
  })

  it('binds append-only Personal Model feedback events to exactly one transition result', async () => {
    const migration = await readFile(personalModelFeedbackEventMigrationPath, 'utf8')
    for (const value of [
      personalModelFeedbackTransitionVersion,
      ...personalModelFeedbackChoices,
      ...personalModelFeedbackReasonCodes,
      ...personalModelFeedbackNoOpReasons,
    ]) {
      expect(migration, `${value} is missing from the feedback event migration`).toContain(
        `'${value}'`,
      )
    }
    for (const boundary of [
      'CREATE TABLE personal_model_feedback_events',
      'personal_model_feedback_events_target_revision_fk',
      'personal_model_feedback_events_result_revision_fk',
      'personal_model_feedback_events_revision_relation_unique',
      'DROP CONSTRAINT personal_model_item_revisions_feedback_persistence_pending_check',
      'personal_model_item_revisions_feedback_event_unique',
      'personal_model_item_revisions_feedback_event_fk',
      'DEFERRABLE INITIALLY DEFERRED',
      'personal_model_feedback_events_target_guard',
      'personal_model_feedback_events_immutable',
      'feedback events are append-only',
    ]) {
      expect(migration).toContain(boundary)
    }
  })

  it('projects every Personal Model revision evidence reference into an immutable ordered ledger', async () => {
    const migration = await readFile(personalModelEvidenceProjectionMigrationPath, 'utf8')
    for (const value of [
      ...personalModelEvidenceKinds,
      ...personalModelEvidenceRoles,
      ...personalModelEvidenceSources,
      ...personalModelEvidenceQualificationStates,
      ...personalModelEvidenceWithdrawalReasons,
    ]) {
      expect(migration, `${value} is missing from the evidence projection migration`).toContain(
        `'${value}'`,
      )
    }
    for (const boundary of [
      'CREATE TABLE personal_model_evidence_refs',
      'personal_model_evidence_refs_revision_fk',
      'personal_model_evidence_refs_revision_ordinal_unique',
      'personal_model_evidence_refs_revision_reference_unique',
      'personal_model_evidence_refs_revision_aggregate_unique',
      'INSERT INTO personal_model_evidence_refs',
      'personal_model_item_revisions_evidence_projection_guard',
      'personal_model_evidence_refs_projection_guard',
      'personal model evidence projection does not match revision snapshot',
      'personal_model_evidence_refs_immutable',
      'personal model evidence references are append-only',
    ]) {
      expect(migration).toContain(boundary)
    }
  })

  it('keeps exact append-only onboarding goal revisions with honest migration coverage', async () => {
    const migration = await readFile(onboardingGoalRevisionHistoryMigrationPath, 'utf8')
    for (const value of [
      ...primaryGoals,
      ...experienceLevels,
      ...weekdays,
      ...equipmentOptions,
      ...dietaryPreferenceOptions,
      ...onboardingGoalRevisionActions,
      ...onboardingGoalHistoryCoverageStates,
    ]) {
      expect(migration, `${value} is missing from the goal history migration`).toContain(
        `'${value}'`,
      )
    }
    expect(migration).toContain(`'${onboardingGoalSnapshotVersion}'`)
    for (const boundary of [
      'CREATE TABLE user_goal_revisions',
      'onboarding-goal-snapshot-v1',
      'migration_checkpoint',
      'checkpoint_only',
      'user_goals_profile_revision_fk',
      'user_goal_revisions_previous_fk',
      'user_goal_revisions_snapshot_exact_check',
      'user_goals_current_revision_guard',
      'user_goal_revisions_current_guard',
      'user goal current row does not match its immutable revision',
      'user_goal_revisions_immutable',
      'user goal revisions are append-only',
    ]) {
      expect(migration).toContain(boundary)
    }
  })

  it('binds Personal Model evidence to exact sources and requires withdrawal resolution', async () => {
    const migration = await readFile(personalModelSourceQualificationMigrationPath, 'utf8')
    for (const boundary of [
      'personal_model_evidence_refs_onboarding_source_fk',
      'personal_model_evidence_refs_workout_source_fk',
      'personal_model_evidence_refs_source_qualification_guard',
      'CREATE TABLE personal_model_source_refresh_requests',
      'personal_model_source_refresh_requests_evidence_fk',
      'personal_model_source_refresh_requests_source_unique',
      'CREATE TABLE personal_model_source_refresh_resolutions',
      'personal_model_source_refresh_resolutions_evidence_fk',
      'personal_model_source_refresh_requests_exact_guard',
      'personal_model_source_refresh_resolutions_exact_guard',
      'personal_model_item_revisions_source_refresh_guard',
      'user_goal_revisions_personal_model_refresh',
      'workout_revisions_personal_model_refresh',
      'personal model revision omitted a pending source withdrawal',
      'personal_model_source_refresh_requests_immutable',
      'personal_model_source_refresh_resolutions_immutable',
    ]) {
      expect(migration).toContain(boundary)
    }
  })

  it('keeps one current Personal Model generation and requires an atomic terminal successor', async () => {
    const migration = await readFile(personalModelItemGenerationMigrationPath, 'utf8')
    for (const boundary of [
      'personal_model_items_owner_subject_generation_unique',
      'personal_model_items_owner_current_subject_unique',
      'personal_model_items_owner_predecessor_unique',
      'personal_model_items_predecessor_subject_fk',
      'personal_model_items_generation_insert_guard',
      'retired personal model generations are immutable',
      'personal model generation retirement requires a terminal settled item',
      'personal_model_items_retirement_successor_guard',
      'retired personal model generation requires an atomic successor',
      'retired personal model generations cannot accept feedback',
      'AND item.retired_at IS NULL',
    ]) {
      expect(migration).toContain(boundary)
    }
  })

  it('closes the race between generation retirement and source refresh insertion', async () => {
    const migration = await readFile(personalModelGenerationRefreshRaceMigrationPath, 'utf8')
    for (const boundary of [
      'personal_model_items_retirement_settled_guard',
      'retired personal model generation gained a pending source refresh',
      'personal_model_source_refresh_requests_generation_guard',
      'source refresh request must target the current personal model generation',
      'DEFERRABLE INITIALLY DEFERRED',
    ]) {
      expect(migration).toContain(boundary)
    }
  })

  it('requires successor creation and retirement times to advance strictly', async () => {
    const migration = await readFile(personalModelGenerationStrictTimesMigrationPath, 'utf8')
    for (const boundary of [
      'personal model generation must start at revision one and remain current',
      'NEW.retired_at <= OLD.updated_at',
      'predecessor_retired_at <> NEW.created_at',
      'CREATE OR REPLACE FUNCTION guard_personal_model_item_mutation()',
    ]) {
      expect(migration).toContain(boundary)
    }
  })
})
