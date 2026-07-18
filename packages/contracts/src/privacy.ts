import * as z from 'zod'

export const privacyExportSchemaVersion = 'myfitness-portable-export-v1' as const
export const privacyExportContentType = 'application/json' as const
export const privacyErasureScopeVersion = 'primary-store-v1' as const
export const accountDeletionConfirmationPhrase = '删除我的衡迹账户' as const

export const consentPurposes = [
  'terms',
  'privacy',
  'health_data',
  'ai_plan_explanation',
  'food_photo_analysis',
] as const

export const revocableConsentPurposes = ['ai_plan_explanation', 'food_photo_analysis'] as const

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

export const consentPurposeSchema = z.enum(consentPurposes)
export const revocableConsentPurposeSchema = z.enum(revocableConsentPurposes)
export const privacyDataCategorySchema = z.enum(privacyDataCategories)

export const privacyInventoryItemSchema = z
  .object({
    category: privacyDataCategorySchema,
    recordCount: z.number().int().nonnegative(),
    includesHistory: z.boolean(),
    lastUpdatedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict()

export const consentStateSchema = z
  .object({
    purpose: consentPurposeSchema,
    status: z.enum(['never_granted', 'active', 'revoked']),
    requiredForService: z.boolean(),
    revocable: z.boolean(),
    version: z.string().min(1).max(40).nullable(),
    acceptedAt: z.string().datetime({ offset: true }).nullable(),
    revokedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict()

export const privacyOverviewSchema = z
  .object({
    generatedAt: z.string().datetime({ offset: true }),
    accountCreatedAt: z.string().datetime({ offset: true }),
    totalRecordCount: z.number().int().nonnegative(),
    activePhotoCount: z.number().int().nonnegative(),
    inventory: z.array(privacyInventoryItemSchema).length(privacyDataCategories.length),
    consents: z.array(consentStateSchema).length(consentPurposes.length),
    portableExport: z
      .object({
        schemaVersion: z.literal(privacyExportSchemaVersion),
        contentType: z.literal(privacyExportContentType),
        includesHistory: z.literal(true),
        includesActiveSanitizedPhotos: z.literal(true),
      })
      .strict(),
    deletion: z
      .object({
        confirmationPhrase: z.literal(accountDeletionConfirmationPhrase),
        permanent: z.literal(true),
      })
      .strict(),
  })
  .strict()

export const consentRevocationRequestSchema = z.object({ confirmed: z.literal(true) }).strict()

export const consentRevocationResultSchema = z
  .object({
    purpose: revocableConsentPurposeSchema,
    status: z.literal('revoked'),
    revokedAt: z.string().datetime({ offset: true }),
    removedPhotoAnalyses: z.number().int().nonnegative(),
  })
  .strict()

export const accountDeletionRequestSchema = z
  .object({
    confirmationPhrase: z.literal(accountDeletionConfirmationPhrase),
    exportChoice: z.enum(['downloaded', 'skip']),
    understandsPermanent: z.literal(true),
  })
  .strict()

export const accountDeletionResultSchema = z
  .object({
    receiptId: z.string().uuid(),
    deleted: z.literal(true),
    scopeVersion: z.literal(privacyErasureScopeVersion),
    deletedAt: z.string().datetime({ offset: true }),
  })
  .strict()

const jsonObjectSchema = z.record(z.string(), z.json())

export const privacyExportSchema = z
  .object({
    schemaVersion: z.literal(privacyExportSchemaVersion),
    generatedAt: z.string().datetime({ offset: true }),
    accountId: z.string().uuid(),
    data: z
      .object({
        account: jsonObjectSchema,
        identities: z.array(jsonObjectSchema),
        profile: jsonObjectSchema.nullable(),
        goal: jsonObjectSchema.nullable(),
        consentEvents: z.array(jsonObjectSchema),
        healthRecords: z.array(jsonObjectSchema),
        healthRecordRevisions: z.array(jsonObjectSchema),
        workouts: z.array(jsonObjectSchema),
        nutritionMeals: z.array(jsonObjectSchema),
        nutritionFavorites: z.array(jsonObjectSchema),
        weeklyPlans: z.array(jsonObjectSchema),
        aiExplanationRuns: z.array(jsonObjectSchema),
        foodPhotoAnalyses: z.array(jsonObjectSchema),
      })
      .strict(),
  })
  .strict()

export type PrivacyOverview = z.infer<typeof privacyOverviewSchema>
export type PrivacyDataCategory = z.infer<typeof privacyDataCategorySchema>
export type PrivacyInventoryItem = z.infer<typeof privacyInventoryItemSchema>
export type ConsentState = z.infer<typeof consentStateSchema>
export type RevocableConsentPurpose = z.infer<typeof revocableConsentPurposeSchema>
export type ConsentRevocationRequest = z.infer<typeof consentRevocationRequestSchema>
export type ConsentRevocationResult = z.infer<typeof consentRevocationResultSchema>
export type AccountDeletionRequest = z.infer<typeof accountDeletionRequestSchema>
export type AccountDeletionResult = z.infer<typeof accountDeletionResultSchema>
export type PrivacyExport = z.infer<typeof privacyExportSchema>
