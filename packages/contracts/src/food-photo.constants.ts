export const foodPhotoConsentPurpose = 'food_photo_analysis' as const
export const foodPhotoConsentVersion = 'food-photo-analysis-2026-07-19.v1' as const
export const foodPhotoPromptVersions = [
  'food-photo-candidates-v1',
  'food-photo-candidates-v2',
] as const
export const foodPhotoValidatorVersions = [
  'food-photo-catalog-safety-v1',
  'food-photo-catalog-safety-v2',
] as const
export const foodPhotoPromptVersion = 'food-photo-candidates-v2' as const
export const foodPhotoValidatorVersion = 'food-photo-catalog-safety-v2' as const

export const foodPhotoStatuses = [
  'reserved',
  'processing',
  'ready',
  'failed',
  'rejected',
  'confirmed',
  'deleted',
  'expired',
] as const
export const foodPhotoConfidences = ['low', 'medium', 'high'] as const
export const foodPhotoSources = ['model', 'fixture'] as const
export const foodPhotoProviders = ['fixture', 'openai'] as const
export const foodPhotoContentTypes = ['image/jpeg', 'image/png', 'image/webp'] as const

export const foodPhotoMaxBytes = 6 * 1024 * 1024
export const foodPhotoMaxPixels = 20_000_000
export const foodPhotoMaxDimension = 1_600
export const foodPhotoRetentionHours = 24
export const foodPhotoUploadTtlSeconds = 10 * 60
export const foodPhotoPreviewTtlSeconds = 10 * 60
