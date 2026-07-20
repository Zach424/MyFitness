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

const userOidcEnvironment = {
  USER_OIDC_ISSUER: 'https://accounts.example.com',
  USER_OIDC_AUTHORIZATION_URL: 'https://accounts.example.com/oauth2/authorize',
  USER_OIDC_TOKEN_URL: 'https://accounts.example.com/oauth2/token',
  USER_OIDC_JWKS_URL: 'https://accounts.example.com/.well-known/jwks.json',
  USER_OIDC_CLIENT_ID: 'myfitness-h5',
  USER_OIDC_CLIENT_SECRET: 'server-side-client-secret',
  USER_OIDC_REDIRECT_URI: 'https://h5.example.com/auth/callback',
} as const

const originalEnvironment = new Map<string, string | undefined>()

const configureProduction = () => {
  for (const [name, value] of Object.entries(productionEnvironment)) {
    if (!originalEnvironment.has(name)) originalEnvironment.set(name, process.env[name])
    process.env[name] = value
  }
}

const configureProductionOidc = () => {
  configureProduction()
  setEnvironment('AUTH_ENABLED_PROVIDERS', 'oidc')
  for (const [name, value] of Object.entries(userOidcEnvironment)) {
    setEnvironment(name, value)
  }
}

const setEnvironment = (name: string, value: string) => {
  if (!originalEnvironment.has(name)) originalEnvironment.set(name, process.env[name])
  process.env[name] = value
}

const unsetEnvironment = (name: string) => {
  if (!originalEnvironment.has(name)) originalEnvironment.set(name, process.env[name])
  delete process.env[name]
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
      host: '0.0.0.0',
      wechatMiniAppId: productionEnvironment.WECHAT_MINI_APP_ID,
      wechatCodeSessionUrl: 'https://api.weixin.qq.com/sns/jscode2session',
    })
  })

  it('accepts a complete TLS-only end-user OIDC production boundary', () => {
    configureProductionOidc()
    expect(getRuntimeConfig()).toMatchObject({
      authEnabledProviders: ['oidc'],
      userOidcIssuer: userOidcEnvironment.USER_OIDC_ISSUER,
      userOidcAuthorizationUrl: userOidcEnvironment.USER_OIDC_AUTHORIZATION_URL,
      userOidcTokenUrl: userOidcEnvironment.USER_OIDC_TOKEN_URL,
      userOidcJwksUrl: userOidcEnvironment.USER_OIDC_JWKS_URL,
      userOidcClientId: userOidcEnvironment.USER_OIDC_CLIENT_ID,
      userOidcClientSecret: userOidcEnvironment.USER_OIDC_CLIENT_SECRET,
      userOidcRedirectUri: userOidcEnvironment.USER_OIDC_REDIRECT_URI,
    })
  })

  it('rejects incomplete or non-TLS end-user OIDC production settings', () => {
    configureProductionOidc()
    unsetEnvironment('USER_OIDC_TOKEN_URL')
    expect(() => getRuntimeConfig()).toThrow('USER_OIDC_TOKEN_URL')

    setEnvironment('USER_OIDC_TOKEN_URL', 'http://accounts.example.com/oauth2/token')
    expect(() => getRuntimeConfig()).toThrow('USER_OIDC_TOKEN_URL must use https:// in production')

    setEnvironment('USER_OIDC_TOKEN_URL', userOidcEnvironment.USER_OIDC_TOKEN_URL)
    setEnvironment('USER_OIDC_CLIENT_SECRET', 'too-short')
    expect(() => getRuntimeConfig()).toThrow(
      'USER_OIDC_CLIENT_SECRET must contain at least 16 characters when set',
    )
  })

  it('keeps local development loopback-only unless explicitly configured', () => {
    setEnvironment('NODE_ENV', 'development')
    unsetEnvironment('API_HOST')
    expect(getRuntimeConfig().host).toBe('127.0.0.1')
  })

  it('rejects hostnames so the network bind is always explicit', () => {
    configureProduction()
    setEnvironment('API_HOST', 'api.internal')
    expect(() => getRuntimeConfig()).toThrow('API_HOST must be a valid IPv4 or IPv6 address')
  })

  it('requires TLS for production AI and Redis service endpoints', () => {
    configureProduction()
    setEnvironment('AI_SERVICE_URL', 'http://ai.internal')
    expect(() => getRuntimeConfig()).toThrow('AI_SERVICE_URL must use https:// in production')

    setEnvironment('AI_SERVICE_URL', productionEnvironment.AI_SERVICE_URL)
    setEnvironment('REDIS_URL', 'redis://redis.internal:6379')
    expect(() => getRuntimeConfig()).toThrow('REDIS_URL must use rediss:// in production')
  })

  it('keeps the AI run deadline beyond the worker timeout and bounds reconciliation polling', () => {
    configureProduction()
    expect(getRuntimeConfig()).toMatchObject({
      aiTimeoutMs: 22_000,
      aiRunStaleMs: 30_000,
      aiRunReconcilePollMs: 15_000,
    })

    setEnvironment('AI_SERVICE_TIMEOUT_MS', '26000')
    expect(() => getRuntimeConfig()).toThrow(
      'AI_RUN_STALE_MS must exceed AI_SERVICE_TIMEOUT_MS by at least 5000',
    )
    setEnvironment('AI_RUN_STALE_MS', '31000')
    expect(getRuntimeConfig().aiRunStaleMs).toBe(31_000)

    setEnvironment('AI_RUN_RECONCILE_POLL_MS', '999')
    expect(() => getRuntimeConfig()).toThrow(
      'AI_RUN_RECONCILE_POLL_MS must be an integer between 1000 and 300000',
    )
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
