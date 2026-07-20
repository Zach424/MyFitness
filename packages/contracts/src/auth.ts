import * as z from 'zod'

export const userAuthProviders = ['dev', 'wechat', 'oidc', 'phone'] as const
export const userAuthProviderSchema = z.enum(userAuthProviders)

const oidcTransactionValueSchema = z
  .string()
  .min(43)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/)

export const oidcAuthorizationConfigSchema = z
  .object({
    issuer: z.url(),
    authorizationUrl: z.url(),
    clientId: z.string().min(3).max(200),
    redirectUri: z.url(),
    scopes: z.array(z.string().min(1).max(100)).min(1).max(10),
  })
  .strict()

export const oidcSessionRequestSchema = z
  .object({
    code: z.string().trim().min(8).max(2048),
    codeVerifier: z
      .string()
      .min(43)
      .max(128)
      .regex(/^[A-Za-z0-9._~-]+$/),
    nonce: oidcTransactionValueSchema,
    redirectUri: z.url(),
  })
  .strict()

export const wechatSessionRequestSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9_-]+$/),
  })
  .strict()

export const verifiedSessionSchema = z
  .object({
    accessToken: z.string().min(32),
    userId: z.string().uuid(),
    provider: userAuthProviderSchema,
    isNewUser: z.boolean(),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict()

export type UserAuthProvider = z.infer<typeof userAuthProviderSchema>
export type OidcAuthorizationConfig = z.infer<typeof oidcAuthorizationConfigSchema>
export type OidcSessionRequest = z.infer<typeof oidcSessionRequestSchema>
export type WechatSessionRequest = z.infer<typeof wechatSessionRequestSchema>
export type VerifiedSession = z.infer<typeof verifiedSessionSchema>
