export const progressPhotoAnalysisConsentPurpose = 'progress_photo_analysis' as const
export const progressPhotoAnalysisConsentVersion = 'progress-photo-analysis-2026-08-04.v1' as const
export const progressPhotoRetentionConsentPurpose = 'progress_photo_retention' as const
export const progressPhotoRetentionConsentVersion =
  'progress-photo-retention-2026-08-04.v1' as const

export const progressPhotoStatuses = ['reserved', 'ready', 'deleted', 'expired'] as const
export const progressPhotoViews = ['front', 'side', 'back'] as const
export const progressPhotoRetentionModes = ['analysis_only', 'retained'] as const
export const progressPhotoQualityStatuses = ['ready', 'adjust'] as const
export const progressPhotoQualityMethodVersion =
  'progress-photo-capture-quality-2026-08-04.v1' as const
export const progressPhotoContentTypes = ['image/jpeg', 'image/png', 'image/webp'] as const

export const progressPhotoMaxBytes = 6 * 1024 * 1024
export const progressPhotoMaxPixels = 20_000_000
export const progressPhotoMaxDimension = 1_600
export const progressPhotoAnalysisRetentionHours = 24
export const progressPhotoUploadTtlSeconds = 10 * 60
export const progressPhotoPreviewTtlSeconds = 10 * 60
