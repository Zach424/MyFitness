export const privacyExportSchemaVersion = 'myfitness-portable-export-v4' as const
export const privacyExportContentType = 'application/json' as const
export const privacyErasureScopeVersion = 'durable-erasure-v2' as const
export const accountDeletionConfirmationPhrase = '删除我的衡迹账户' as const

export const consentPurposes = [
  'terms',
  'privacy',
  'health_data',
  'ai_plan_explanation',
  'food_photo_analysis',
  'progress_photo_analysis',
  'progress_photo_retention',
] as const

export const revocableConsentPurposes = [
  'ai_plan_explanation',
  'food_photo_analysis',
  'progress_photo_analysis',
  'progress_photo_retention',
] as const

export const privacyDataCategories = [
  'profile',
  'health_records',
  'workouts',
  'nutrition',
  'plans',
  'ai_outputs',
  'photo_analyses',
  'consent_receipts',
] as const
