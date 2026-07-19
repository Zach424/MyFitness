import { afterEach, describe, expect, it } from 'vitest'

import { getRuntimeConfig } from './config'

const productionEnvironment = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://service:secret@database.example.com/myfitness',
  AI_SERVICE_URL: 'https://ai.example.com',
  AI_SERVICE_TOKEN: 'production-ai-service-token',
  PHOTO_UPLOAD_SIGNING_SECRET: 'photo-signing-secret-with-32-characters',
  REDIS_URL: 'rediss://redis.example.com:6380',
  RATE_LIMIT_HASH_SECRET: 'rate-limit-hash-secret-with-32-chars',
  OPERATIONS_TOKEN: 'operations-token-with-at-least-32-chars',
  ADMIN_AUDIT_HASH_SECRET: 'admin-audit-hash-secret-with-32-chars',
  ADMIN_OIDC_ISSUER: 'https://identity.example.com',
  ADMIN_OIDC_AUDIENCE: 'myfitness-admin',
  ADMIN_OIDC_JWKS_URL: 'https://identity.example.com/.well-known/jwks.json',
  OBJECT_STORAGE_BUCKET: 'myfitness-production-private',
  OBJECT_STORAGE_SSE: 'AES256',
  OBJECT_STORAGE_AUTO_CREATE_BUCKET: 'false',
  ERASURE_LEDGER_HASH_SECRET: 'erasure-ledger-hash-secret-with-32-chars',
  AUTH_ENABLED_PROVIDERS: 'wechat',
  WECHAT_MINI_APP_ID: 'wx1234567890abcdef',
  WECHAT_MINI_APP_SECRET: 'wechat-app-secret-with-32-characters',
} as const

const originalEnvironment = new Map<string, string | undefined>()

const configureProduction = () => {
  for (const [name, value] of Object.entries(productionEnvironment)) {
    if (!originalEnvironment.has(name)) originalEnvironment.set(name, process.env[name])
    process.env[name] = value
  }
}

const setEnvironment = (name: string, value: string) => {
  if (!originalEnvironment.has(name)) originalEnvironment.set(name, process.env[name])
  process.env[name] = value
}

afterEach(() => {
  for (const [name, value] of originalEnvironment) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  originalEnvironment.clear()
})

describe('production user identity configuration', () => {
  it('accepts a verified WeChat-only production boundary', () => {
    configureProduction()
    expect(getRuntimeConfig()).toMatchObject({
      authEnabledProviders: ['wechat'],
      wechatMiniAppId: productionEnvironment.WECHAT_MINI_APP_ID,
      wechatCodeSessionUrl: 'https://api.weixin.qq.com/sns/jscode2session',
    })
  })

  it('rejects the development adapter in production', () => {
    configureProduction()
    setEnvironment('AUTH_ENABLED_PROVIDERS', 'dev,wechat')
    expect(() => getRuntimeConfig()).toThrow(
      'AUTH_ENABLED_PROVIDERS must not enable dev in production',
    )
  })

  it('pins production code exchange to the official WeChat endpoint', () => {
    configureProduction()
    setEnvironment('WECHAT_CODE_SESSION_URL', 'https://identity-proxy.example.com/code')
    expect(() => getRuntimeConfig()).toThrow(
      'WECHAT_CODE_SESSION_URL cannot be overridden in production',
    )
  })
})
