import * as z from 'zod'

export const adminRoles = ['support_reader', 'audit_reader'] as const
export const adminIdentityProviders = ['dev', 'oidc'] as const
export const adminAuditActions = [
  'operator.session.created',
  'operator.session.denied',
  'operator.session.revoked',
  'operator.profile.read',
  'support.user.lookup',
  'audit.events.read',
  'authorization.denied',
] as const
export const adminAuditOutcomes = ['allowed', 'denied', 'not_found'] as const
export const adminAuditTargetTypes = ['operator', 'user', 'audit'] as const
export const supportLookupReasons = [
  'account_access',
  'data_export',
  'account_erasure',
  'technical_issue',
] as const

export const adminRoleSchema = z.enum(adminRoles)
export const adminIdentityProviderSchema = z.enum(adminIdentityProviders)
export const adminAuditActionSchema = z.enum(adminAuditActions)
export const adminAuditOutcomeSchema = z.enum(adminAuditOutcomes)
export const adminAuditTargetTypeSchema = z.enum(adminAuditTargetTypes)
export const supportLookupReasonSchema = z.enum(supportLookupReasons)

const uniqueRolesSchema = z
  .array(adminRoleSchema)
  .min(1)
  .max(adminRoles.length)
  .refine((roles) => new Set(roles).size === roles.length, 'roles must be unique')

export const adminOperatorSchema = z
  .object({
    operatorId: z.string().uuid(),
    displayName: z.string().min(1).max(80),
    roles: uniqueRolesSchema,
    identityProvider: adminIdentityProviderSchema,
  })
  .strict()

export const adminDevSessionRequestSchema = z
  .object({
    subject: z
      .string()
      .trim()
      .min(3)
      .max(128)
      .regex(/^[A-Za-z0-9._:-]+$/),
    displayName: z.string().trim().min(1).max(80),
    roles: uniqueRolesSchema,
  })
  .strict()

export const adminOidcExchangeRequestSchema = z
  .object({
    idToken: z.string().min(80).max(16_384),
    nonce: z
      .string()
      .min(16)
      .max(256)
      .regex(/^[A-Za-z0-9_-]+$/),
  })
  .strict()

export const adminSessionSchema = z
  .object({
    accessToken: z.string().min(32).max(256),
    expiresAt: z.string().datetime({ offset: true }),
    operator: adminOperatorSchema,
  })
  .strict()

export const supportUserLookupRequestSchema = z
  .object({
    accountId: z.string().uuid(),
    ticketReference: z
      .string()
      .trim()
      .min(3)
      .max(40)
      .regex(/^[A-Z0-9][A-Z0-9._-]+$/),
    reason: supportLookupReasonSchema,
  })
  .strict()

export const supportUserSummarySchema = z
  .object({
    lookupReceiptId: z.string().uuid(),
    auditedAt: z.string().datetime({ offset: true }),
    account: z
      .object({
        accountId: z.string().uuid(),
        status: z.enum(['active', 'disabled', 'deletion_pending']),
        createdAt: z.string().datetime({ offset: true }),
        updatedAt: z.string().datetime({ offset: true }),
        identityProviders: z.array(z.enum(['dev', 'wechat', 'phone'])).max(3),
        onboarding: z
          .object({
            profilePresent: z.boolean(),
            goalPresent: z.boolean(),
            profileRevision: z.number().int().positive().nullable(),
          })
          .strict(),
        evidenceCounts: z
          .object({
            healthRecords: z.number().int().nonnegative(),
            workouts: z.number().int().nonnegative(),
            meals: z.number().int().nonnegative(),
            weeklyPlans: z.number().int().nonnegative(),
            aiExplanations: z.number().int().nonnegative(),
            photoAnalyses: z.number().int().nonnegative(),
            consentReceipts: z.number().int().nonnegative(),
          })
          .strict(),
        activeSessionCount: z.number().int().nonnegative(),
        activePhotoCount: z.number().int().nonnegative(),
        latestActivityAt: z.string().datetime({ offset: true }).nullable(),
        optionalConsents: z
          .object({
            aiPlanExplanation: z.enum(['never_granted', 'active', 'revoked']),
            foodPhotoAnalysis: z.enum(['never_granted', 'active', 'revoked']),
          })
          .strict(),
      })
      .strict(),
  })
  .strict()

const auditDetailsSchema = z
  .record(
    z.string().min(1).max(40),
    z.union([z.string().max(160), z.number().finite(), z.boolean(), z.null()]),
  )
  .refine((details) => Object.keys(details).length <= 8, 'audit details are bounded')

export const adminAuditEventSchema = z
  .object({
    eventId: z.string().uuid(),
    operatorId: z.string().uuid().nullable(),
    action: adminAuditActionSchema,
    outcome: adminAuditOutcomeSchema,
    targetType: adminAuditTargetTypeSchema.nullable(),
    targetRef: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
    requestId: z.string().uuid(),
    details: auditDetailsSchema,
    occurredAt: z.string().datetime({ offset: true }),
  })
  .strict()

export const adminAuditListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z
      .string()
      .min(16)
      .max(256)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
  })
  .strict()

export const adminAuditListSchema = z
  .object({
    events: z.array(adminAuditEventSchema),
    nextCursor: z.string().min(16).max(256).nullable(),
  })
  .strict()

export type AdminRole = z.infer<typeof adminRoleSchema>
export type AdminIdentityProvider = z.infer<typeof adminIdentityProviderSchema>
export type AdminOperator = z.infer<typeof adminOperatorSchema>
export type AdminDevSessionRequest = z.infer<typeof adminDevSessionRequestSchema>
export type AdminOidcExchangeRequest = z.infer<typeof adminOidcExchangeRequestSchema>
export type AdminSession = z.infer<typeof adminSessionSchema>
export type SupportLookupReason = z.infer<typeof supportLookupReasonSchema>
export type SupportUserLookupRequest = z.infer<typeof supportUserLookupRequestSchema>
export type SupportUserSummary = z.infer<typeof supportUserSummarySchema>
export type AdminAuditAction = z.infer<typeof adminAuditActionSchema>
export type AdminAuditOutcome = z.infer<typeof adminAuditOutcomeSchema>
export type AdminAuditTargetType = z.infer<typeof adminAuditTargetTypeSchema>
export type AdminAuditEvent = z.infer<typeof adminAuditEventSchema>
export type AdminAuditListQuery = z.infer<typeof adminAuditListQuerySchema>
export type AdminAuditList = z.infer<typeof adminAuditListSchema>
