import * as z from 'zod'

export const userAuthProviders = ['dev', 'wechat', 'phone'] as const
export const userAuthProviderSchema = z.enum(userAuthProviders)

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
export type WechatSessionRequest = z.infer<typeof wechatSessionRequestSchema>
export type VerifiedSession = z.infer<typeof verifiedSessionSchema>
