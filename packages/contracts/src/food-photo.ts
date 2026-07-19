import * as z from 'zod'

import { aiWorkerFailureCodes } from './ai.constants'
import {
  foodPhotoConfidences,
  foodPhotoConsentVersion,
  foodPhotoContentTypes,
  foodPhotoMaxBytes,
  foodPhotoPromptVersion,
  foodPhotoProviders,
  foodPhotoSources,
  foodPhotoStatuses,
  foodPhotoValidatorVersion,
} from './food-photo.constants'
import { foodCategories } from './nutrition.constants'

export * from './food-photo.constants'

export const foodPhotoStatusSchema = z.enum(foodPhotoStatuses)
export const foodPhotoConfidenceSchema = z.enum(foodPhotoConfidences)
export const foodPhotoSourceSchema = z.enum(foodPhotoSources)
export const foodPhotoProviderSchema = z.enum(foodPhotoProviders)
export const foodPhotoContentTypeSchema = z.enum(foodPhotoContentTypes)

export const foodPhotoConsentSchema = z
  .object({
    granted: z.literal(true),
    version: z.literal(foodPhotoConsentVersion),
  })
  .strict()

export const createFoodPhotoCandidateSchema = z.object({ consent: foodPhotoConsentSchema }).strict()

export const foodPhotoPortionRangeSchema = z
  .object({
    minGrams: z.number().int().min(5).max(2_000),
    maxGrams: z.number().int().min(5).max(2_000),
  })
  .strict()
  .refine((value) => value.maxGrams >= value.minGrams, {
    message: 'maxGrams must be greater than or equal to minGrams',
    path: ['maxGrams'],
  })

export const foodPhotoCandidateItemSchema = z
  .object({
    catalogKey: z.string().regex(/^[a-z0-9_:-]{2,100}$/),
    label: z.string().trim().min(1).max(100),
    confidence: foodPhotoConfidenceSchema,
    portionRange: foodPhotoPortionRangeSchema,
    visualBasis: z.string().trim().min(1).max(180),
  })
  .strict()

export const foodPhotoCandidateContentSchema = z
  .object({
    summary: z.string().trim().min(1).max(180),
    safetyStatus: z.enum(['safe', 'rejected']),
    needsManualEntry: z.boolean(),
    candidates: z.array(foodPhotoCandidateItemSchema).max(5),
  })
  .strict()

export const foodPhotoUploadSchema = z
  .object({
    path: z.string().startsWith('/v1/nutrition/photo-candidates/'),
    expiresAt: z.string().datetime({ offset: true }),
    maxBytes: z.literal(foodPhotoMaxBytes),
    acceptedContentTypes: z.tuple([
      z.literal('image/jpeg'),
      z.literal('image/png'),
      z.literal('image/webp'),
    ]),
  })
  .strict()

export const foodPhotoTicketSchema = z
  .object({
    id: z.string().uuid(),
    status: z.literal('reserved'),
    upload: foodPhotoUploadSchema,
    createdAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict()

export const foodPhotoAnalysisSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(['ready', 'failed', 'rejected']),
    previewPath: z.string().startsWith('/v1/nutrition/photo-candidates/').nullable(),
    content: foodPhotoCandidateContentSchema.nullable(),
    source: foodPhotoSourceSchema.nullable(),
    provider: foodPhotoProviderSchema.nullable(),
    model: z.string().trim().min(1).max(120).nullable(),
    promptVersion: z.literal(foodPhotoPromptVersion),
    validatorVersion: z.literal(foodPhotoValidatorVersion),
    failureCode: z.enum(aiWorkerFailureCodes).nullable(),
    mediaDeleted: z.boolean(),
    mediaDeletionStatus: z.enum(['not_required', 'pending', 'deleted']),
    createdAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.status === 'ready') {
      if (
        !value.content ||
        !value.source ||
        !value.provider ||
        !value.model ||
        !value.previewPath
      ) {
        ctx.addIssue({ code: 'custom', message: 'ready analyses require content and provenance' })
      }
      if (value.failureCode || value.mediaDeleted || value.mediaDeletionStatus !== 'not_required') {
        ctx.addIssue({
          code: 'custom',
          message: 'ready analyses must retain media without a failure',
        })
      }
      return
    }
    if (
      value.previewPath ||
      value.mediaDeletionStatus === 'not_required' ||
      value.mediaDeleted !== (value.mediaDeletionStatus === 'deleted')
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'failed or rejected analyses must queue or complete media deletion',
      })
    }
  })

export const foodPhotoListSchema = z.object({ items: z.array(foodPhotoAnalysisSchema) }).strict()

export const confirmFoodPhotoCandidateSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            catalogKey: z.string().regex(/^[a-z0-9_:-]{2,100}$/),
            grams: z.number().int().min(5).max(2_000),
          })
          .strict(),
      )
      .min(1)
      .max(5),
  })
  .strict()
  .refine(
    (value) => new Set(value.items.map((item) => item.catalogKey)).size === value.items.length,
    {
      message: 'catalogKey values must be unique',
      path: ['items'],
    },
  )

export const foodPhotoConfirmationSchema = z
  .object({
    photoCandidateId: z.string().uuid(),
    status: z.literal('confirmed'),
    items: confirmFoodPhotoCandidateSchema.shape.items,
    mediaDeleted: z.boolean(),
    mediaDeletionStatus: z.enum(['pending', 'deleted']),
    confirmedAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .refine((value) => value.mediaDeleted === (value.mediaDeletionStatus === 'deleted'), {
    message: 'mediaDeleted must match mediaDeletionStatus',
    path: ['mediaDeleted'],
  })

export const allowedFoodSchema = z
  .object({
    catalogKey: z.string().regex(/^[a-z0-9_:-]{2,100}$/),
    label: z.string().trim().min(1).max(100),
    category: z.enum(foodCategories),
  })
  .strict()

export const foodPhotoWorkerRequestSchema = z
  .object({
    requestId: z.string().uuid(),
    promptVersion: z.literal(foodPhotoPromptVersion),
    validatorVersion: z.literal(foodPhotoValidatorVersion),
    imageDataUrl: z.string().startsWith('data:image/jpeg;base64,').max(12_000_000),
    allowedFoods: z.array(allowedFoodSchema).min(1).max(100),
  })
  .strict()

export const foodPhotoWorkerResponseSchema = z
  .object({
    status: z.enum(['generated', 'failed']),
    provider: foodPhotoProviderSchema,
    model: z.string().trim().min(1).max(120),
    content: foodPhotoCandidateContentSchema.nullable(),
    failureCode: z.enum(aiWorkerFailureCodes).nullable(),
    providerResponseId: z.string().trim().min(1).max(200).nullable(),
    usage: z
      .object({ inputTokens: z.number().int().min(0), outputTokens: z.number().int().min(0) })
      .strict()
      .nullable(),
    latencyMs: z.number().int().min(0),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.status === 'generated' && (!value.content || value.failureCode)) {
      ctx.addIssue({ code: 'custom', message: 'generated responses require content only' })
    }
    if (value.status === 'failed' && (value.content || !value.failureCode)) {
      ctx.addIssue({ code: 'custom', message: 'failed responses require a failure code only' })
    }
  })

export const foodPhotoIdSchema = z.string().uuid()

export type FoodPhotoCandidateContent = z.infer<typeof foodPhotoCandidateContentSchema>
export type FoodPhotoTicket = z.infer<typeof foodPhotoTicketSchema>
export type FoodPhotoAnalysis = z.infer<typeof foodPhotoAnalysisSchema>
export type ConfirmFoodPhotoCandidate = z.infer<typeof confirmFoodPhotoCandidateSchema>
export type FoodPhotoConfirmation = z.infer<typeof foodPhotoConfirmationSchema>
export type FoodPhotoWorkerRequest = z.infer<typeof foodPhotoWorkerRequestSchema>
export type FoodPhotoWorkerResponse = z.infer<typeof foodPhotoWorkerResponseSchema>
