import { describe, expect, it } from 'vitest'

import { verifiedSessionSchema, wechatSessionRequestSchema } from './auth'

describe('user authentication contracts', () => {
  it('accepts a bounded WeChat login code', () => {
    expect(wechatSessionRequestSchema.parse({ code: 'code_123-AbC' })).toEqual({
      code: 'code_123-AbC',
    })
    expect(() => wechatSessionRequestSchema.parse({ code: 'code with spaces' })).toThrow()
    expect(() => wechatSessionRequestSchema.parse({ code: 'ok', openid: 'untrusted' })).toThrow()
  })

  it('requires provider and first-session state in verified session responses', () => {
    expect(
      verifiedSessionSchema.parse({
        accessToken: 'mf_user_abcdefghijklmnopqrstuvwxyz0123456789',
        userId: '0190d8f9-89ca-7cc4-8e3a-a5f3e74c6eb8',
        provider: 'wechat',
        isNewUser: true,
        expiresAt: '2026-07-26T00:00:00.000Z',
      }),
    ).toMatchObject({ provider: 'wechat', isNewUser: true })
  })
})
