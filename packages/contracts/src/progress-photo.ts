import * as z from 'zod'

import {
  progressPhotoAnalysisConsentVersion,
  progressPhotoContentTypes,
  progressPhotoMaxBytes,
  progressPhotoPreviewTtlSeconds,
  progressPhotoQualityMethodVersion,
  progressPhotoQualityStatuses,
  progressPhotoRetentionConsentVersion,
  progressPhotoRetentionModes,
  progressPhotoStatuses,
  progressPhotoViews,
} from './progress-photo.constants'

export * from './progress-photo.constants'

export const progressPhotoStatusSchema = z.enum(progressPhotoStatuses)
export const progressPhotoViewSchema = z.enum(progressPhotoViews)
export const progressPhotoRetentionModeSchema = z.enum(progressPhotoRetentionModes)
export const progressPhotoQualityStatusSchema = z.enum(progressPhotoQualityStatuses)
export const progressPhotoContentTypeSchema = z.enum(progressPhotoContentTypes)

const affirmativeConsent = <Version extends string>(version: Version) =>
  z.object({ granted: z.literal(true), version: z.literal(version) }).strict()

export const progressPhotoAnalysisConsentSchema = affirmativeConsent(
  progressPhotoAnalysisConsentVersion,
)
export const progressPhotoRetentionConsentSchema = affirmativeConsent(
  progressPhotoRetentionConsentVersion,
)

export const progressPhotoRetentionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('analysis_only') }).strict(),
  z
    .object({
      mode: z.literal('retained'),
      consent: progressPhotoRetentionConsentSchema,
    })
    .strict(),
])

const isValidIanaTimezone = (timezone: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format()
    return true
  } catch {
    return false
  }
}

export const createProgressPhotoSchema = z
  .object({
    view: progressPhotoViewSchema,
    capturedAt: z.string().datetime({ offset: true }),
    timezone: z.string().trim().min(1).max(64),
    analysisConsent: progressPhotoAnalysisConsentSchema,
    retention: progressPhotoRetentionSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!isValidIanaTimezone(value.timezone)) {
      ctx.addIssue({
        code: 'custom',
        path: ['timezone'],
        message: 'timezone must be a valid IANA time zone',
      })
    }
  })

export const progressPhotoUploadSchema = z
  .object({
    path: z.string().startsWith('/v1/progress-photos/'),
    expiresAt: z.string().datetime({ offset: true }),
    maxBytes: z.literal(progressPhotoMaxBytes),
    acceptedContentTypes: z.tuple([
      z.literal('image/jpeg'),
      z.literal('image/png'),
      z.literal('image/webp'),
    ]),
  })
  .strict()

export const progressPhotoTicketSchema = z
  .object({
    id: z.string().uuid(),
    status: z.literal('reserved'),
    view: progressPhotoViewSchema,
    retentionMode: progressPhotoRetentionModeSchema,
    upload: progressPhotoUploadSchema,
    capturedAt: z.string().datetime({ offset: true }),
    timezone: z.string().trim().min(1).max(64),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict()

const orientationCheckSchema = z
  .object({
    key: z.literal('orientation'),
    status: progressPhotoQualityStatusSchema,
    reason: z.enum(['portrait_ready', 'use_portrait_frame']),
  })
  .strict()

const resolutionCheckSchema = z
  .object({
    key: z.literal('resolution'),
    status: progressPhotoQualityStatusSchema,
    reason: z.enum(['resolution_ready', 'move_closer_or_use_higher_resolution']),
  })
  .strict()

const lightingCheckSchema = z
  .object({
    key: z.literal('lighting'),
    status: progressPhotoQualityStatusSchema,
    reason: z.enum(['lighting_ready', 'image_too_dark', 'image_too_bright']),
  })
  .strict()

const contrastCheckSchema = z
  .object({
    key: z.literal('contrast'),
    status: progressPhotoQualityStatusSchema,
    reason: z.enum(['contrast_ready', 'increase_even_lighting']),
  })
  .strict()

export const progressPhotoQualitySchema = z
  .object({
    methodVersion: z.literal(progressPhotoQualityMethodVersion),
    machineEstimate: z.literal(true),
    overallStatus: progressPhotoQualityStatusSchema,
    metrics: z
      .object({
        width: z.number().int().positive().max(1_600),
        height: z.number().int().positive().max(1_600),
        brightnessPercent: z.number().int().min(0).max(100),
        contrastPercent: z.number().int().min(0).max(100),
      })
      .strict(),
    checks: z.tuple([
      orientationCheckSchema,
      resolutionCheckSchema,
      lightingCheckSchema,
      contrastCheckSchema,
    ]),
  })
  .strict()
  .superRefine((value, ctx) => {
    const expected = value.checks.every((check) => check.status === 'ready') ? 'ready' : 'adjust'
    if (value.overallStatus !== expected) {
      ctx.addIssue({
        code: 'custom',
        path: ['overallStatus'],
        message: 'overallStatus must summarize every capture-quality check',
      })
    }
  })

export const progressPhotoItemSchema = z
  .object({
    id: z.string().uuid(),
    status: z.literal('ready'),
    view: progressPhotoViewSchema,
    retentionMode: progressPhotoRetentionModeSchema,
    previewPath: z.string().startsWith('/v1/progress-photos/'),
    analysisAvailable: z.boolean(),
    quality: progressPhotoQualitySchema.nullable(),
    mediaDeleted: z.literal(false),
    mediaDeletionStatus: z.literal('not_required'),
    capturedAt: z.string().datetime({ offset: true }),
    timezone: z.string().trim().min(1).max(64),
    expiresAt: z.string().datetime({ offset: true }).nullable(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.analysisAvailable !== Boolean(value.quality)) {
      ctx.addIssue({
        code: 'custom',
        path: ['analysisAvailable'],
        message: 'analysisAvailable must match capture-quality availability',
      })
    }
    if (
      (value.retentionMode === 'analysis_only') !== Boolean(value.expiresAt) ||
      (value.retentionMode === 'retained' && value.expiresAt)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['expiresAt'],
        message: 'only analysis-only photos require an expiry',
      })
    }
  })

export const progressPhotoListSchema = z
  .object({ items: z.array(progressPhotoItemSchema).max(100) })
  .strict()

export const progressPhotoIdSchema = z.string().uuid()

export type CreateProgressPhoto = z.infer<typeof createProgressPhotoSchema>
export type ProgressPhotoQuality = z.infer<typeof progressPhotoQualitySchema>
export type ProgressPhotoTicket = z.infer<typeof progressPhotoTicketSchema>
export type ProgressPhotoItem = z.infer<typeof progressPhotoItemSchema>
