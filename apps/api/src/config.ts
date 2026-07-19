import { isIP } from 'node:net'

const localDatabaseUrl = 'postgresql://myfitness:myfitness_local@127.0.0.1:54329/myfitness'
const localAiServiceUrl = 'http://127.0.0.1:8001'
const localAiServiceToken = 'myfitness-ai-local'
const localPhotoSigningSecret = 'myfitness-photo-local-signing-secret-2026'
const localRedisUrl = 'redis://127.0.0.1:63799'
const localRateLimitHashSecret = 'myfitness-rate-limit-local-hash-secret-2026'
const localOperationsToken = 'myfitness-operations-local-token-2026'
const localAdminAuditHashSecret = 'myfitness-admin-audit-local-hash-secret-2026'
const localAdminOidcIssuer = 'http://127.0.0.1:4010'
const localAdminOidcAudience = 'myfitness-admin-local'
const localAdminOidcJwksUrl = 'http://127.0.0.1:4010/.well-known/jwks.json'
const localObjectStorageEndpoint = 'http://127.0.0.1:9000'
const localObjectStorageBucket = 'myfitness-private'
const localObjectStorageAccessKeyId = 'myfitness-minio'
const localObjectStorageSecretAccessKey = 'myfitness-minio-secret-2026-local'
const localErasureLedgerHashSecret = 'myfitness-erasure-ledger-local-hash-secret-2026'
const officialWechatCodeSessionUrl = 'https://api.weixin.qq.com/sns/jscode2session'

const parseAuthProviders = (value: string | undefined, production: boolean) => {
  const requested = (value ?? (production ? 'wechat' : 'dev'))
    .split(',')
    .map((provider) => provider.trim())
  if (!requested.length || requested.some((provider) => !['dev', 'wechat'].includes(provider))) {
    throw new Error('AUTH_ENABLED_PROVIDERS must contain only dev or wechat')
  }
  const providers = [...new Set(requested)]
  if (production && providers.includes('dev')) {
    throw new Error('AUTH_ENABLED_PROVIDERS must not enable dev in production')
  }
  return providers as Array<'dev' | 'wechat'>
}

const parsePort = (value: string | undefined) => {
  const port = Number(value ?? 3100)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('API_PORT must be an integer between 1 and 65535')
  }
  return port
}

const parseHost = (value: string | undefined, production: boolean) => {
  const host = value?.trim() || (production ? '0.0.0.0' : '127.0.0.1')
  if (isIP(host) === 0) {
    throw new Error('API_HOST must be a valid IPv4 or IPv6 address')
  }
  return host
}

const parseTrustProxyHops = (value: string | undefined) => {
  const hops = Number(value ?? 0)
  if (!Number.isInteger(hops) || hops < 0 || hops > 3) {
    throw new Error('TRUST_PROXY_HOPS must be an integer between 0 and 3')
  }
  return hops
}

const parseRedisUrl = (value: string, production: boolean) => {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('REDIS_URL must be a valid redis:// or rediss:// URL')
  }
  if (!['redis:', 'rediss:'].includes(parsed.protocol)) {
    throw new Error('REDIS_URL must use redis:// or rediss://')
  }
  if (production && parsed.protocol !== 'rediss:') {
    throw new Error('REDIS_URL must use rediss:// in production')
  }
  return parsed.toString()
}

const parseRateLimitKeyPrefix = (value: string | undefined) => {
  const prefix = value ?? 'myfitness:rate:v1'
  if (!/^[a-z0-9:_-]{3,100}$/i.test(prefix)) {
    throw new Error('RATE_LIMIT_KEY_PREFIX contains unsupported characters')
  }
  return prefix
}

const parseAdminSessionMinutes = (value: string | undefined) => {
  const minutes = Number(value ?? 60)
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 480) {
    throw new Error('ADMIN_SESSION_MINUTES must be an integer between 15 and 480')
  }
  return minutes
}

const parseAdminUrl = (value: string, name: string, production: boolean) => {
  const exactValue = value.trim()
  let parsed: URL
  try {
    parsed = new URL(exactValue)
  } catch {
    throw new Error(`${name} must be a valid HTTP URL`)
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${name} must use http:// or https://`)
  }
  if (production && parsed.protocol !== 'https:') {
    throw new Error(`${name} must use https:// in production`)
  }
  return exactValue
}

const parseBoolean = (value: string | undefined, fallback: boolean, name: string) => {
  if (value === undefined) return fallback
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error(`${name} must be true or false`)
}

const parseObjectStorageEndpoint = (value: string | undefined, production: boolean) => {
  if (!value) return undefined
  const endpoint = parseAdminUrl(value, 'OBJECT_STORAGE_ENDPOINT', production)
  return endpoint.replace(/\/$/, '')
}

const parseObjectStorageBucket = (value: string) => {
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(value)) {
    throw new Error('OBJECT_STORAGE_BUCKET must be a valid DNS-style bucket name')
  }
  return value
}

const parseObjectPrefix = (value: string, name: string) => {
  const exact = value.replace(/^\/+|\/+$/g, '')
  if (
    exact.length < 3 ||
    exact.length > 160 ||
    !/^[A-Za-z0-9][A-Za-z0-9/._-]+$/.test(exact) ||
    exact.includes('//') ||
    exact.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    throw new Error(`${name} must be a safe object-key prefix`)
  }
  return exact
}

const parsePositiveInteger = (
  value: string | undefined,
  fallback: number,
  name: string,
  minimum: number,
  maximum: number,
) => {
  const parsed = Number(value ?? fallback)
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`)
  }
  return parsed
}

export const getRuntimeConfig = () => {
  const production = process.env.NODE_ENV === 'production'
  const authEnabledProviders = parseAuthProviders(process.env.AUTH_ENABLED_PROVIDERS, production)
  const databaseUrl = process.env.DATABASE_URL ?? (production ? undefined : localDatabaseUrl)
  const aiServiceUrl = process.env.AI_SERVICE_URL ?? (production ? undefined : localAiServiceUrl)
  const aiServiceToken =
    process.env.AI_SERVICE_TOKEN ?? (production ? undefined : localAiServiceToken)
  const photoSigningSecret =
    process.env.PHOTO_UPLOAD_SIGNING_SECRET ?? (production ? undefined : localPhotoSigningSecret)
  const redisUrl = process.env.REDIS_URL ?? (production ? undefined : localRedisUrl)
  const rateLimitHashSecret =
    process.env.RATE_LIMIT_HASH_SECRET ?? (production ? undefined : localRateLimitHashSecret)
  const operationsToken =
    process.env.OPERATIONS_TOKEN ?? (production ? undefined : localOperationsToken)
  const adminAuditHashSecret =
    process.env.ADMIN_AUDIT_HASH_SECRET ?? (production ? undefined : localAdminAuditHashSecret)
  const adminOidcIssuer =
    process.env.ADMIN_OIDC_ISSUER ?? (production ? undefined : localAdminOidcIssuer)
  const adminOidcAudience =
    process.env.ADMIN_OIDC_AUDIENCE ?? (production ? undefined : localAdminOidcAudience)
  const adminOidcJwksUrl =
    process.env.ADMIN_OIDC_JWKS_URL ?? (production ? undefined : localAdminOidcJwksUrl)
  const objectStorageEndpoint = parseObjectStorageEndpoint(
    process.env.OBJECT_STORAGE_ENDPOINT ?? (production ? undefined : localObjectStorageEndpoint),
    production,
  )
  const objectStorageBucket =
    process.env.OBJECT_STORAGE_BUCKET ?? (production ? undefined : localObjectStorageBucket)
  const objectStorageRegion = process.env.OBJECT_STORAGE_REGION ?? 'us-east-1'
  const objectStorageAccessKeyId =
    process.env.OBJECT_STORAGE_ACCESS_KEY_ID ??
    (production ? undefined : localObjectStorageAccessKeyId)
  const objectStorageSecretAccessKey =
    process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY ??
    (production ? undefined : localObjectStorageSecretAccessKey)
  const objectStorageSse = process.env.OBJECT_STORAGE_SSE ?? (production ? undefined : 'none')
  const objectStorageAutoCreateBucket = parseBoolean(
    process.env.OBJECT_STORAGE_AUTO_CREATE_BUCKET,
    !production,
    'OBJECT_STORAGE_AUTO_CREATE_BUCKET',
  )
  const erasureLedgerHashSecret =
    process.env.ERASURE_LEDGER_HASH_SECRET ??
    (production ? undefined : localErasureLedgerHashSecret)
  const wechatMiniAppId = process.env.WECHAT_MINI_APP_ID?.trim()
  const wechatMiniAppSecret = process.env.WECHAT_MINI_APP_SECRET?.trim()
  const wechatCodeSessionUrl = parseAdminUrl(
    process.env.WECHAT_CODE_SESSION_URL ?? officialWechatCodeSessionUrl,
    'WECHAT_CODE_SESSION_URL',
    production,
  )

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required in production')
  }
  if (!aiServiceUrl || !aiServiceToken) {
    throw new Error('AI_SERVICE_URL and AI_SERVICE_TOKEN are required in production')
  }
  const exactAiServiceUrl = parseAdminUrl(aiServiceUrl, 'AI_SERVICE_URL', production)
  if (!photoSigningSecret) {
    throw new Error('PHOTO_UPLOAD_SIGNING_SECRET is required in production')
  }
  if (!redisUrl || !rateLimitHashSecret || !operationsToken) {
    throw new Error(
      'REDIS_URL, RATE_LIMIT_HASH_SECRET and OPERATIONS_TOKEN are required in production',
    )
  }
  if (!adminAuditHashSecret || !adminOidcIssuer || !adminOidcAudience || !adminOidcJwksUrl) {
    throw new Error(
      'ADMIN_AUDIT_HASH_SECRET, ADMIN_OIDC_ISSUER, ADMIN_OIDC_AUDIENCE and ADMIN_OIDC_JWKS_URL are required in production',
    )
  }
  if (!objectStorageBucket || !erasureLedgerHashSecret) {
    throw new Error(
      'OBJECT_STORAGE_BUCKET and ERASURE_LEDGER_HASH_SECRET are required in production',
    )
  }
  if (authEnabledProviders.includes('wechat')) {
    if (!wechatMiniAppId || !wechatMiniAppSecret) {
      throw new Error(
        'WECHAT_MINI_APP_ID and WECHAT_MINI_APP_SECRET are required when wechat auth is enabled',
      )
    }
    if (!/^wx[A-Za-z0-9]{8,30}$/.test(wechatMiniAppId)) {
      throw new Error('WECHAT_MINI_APP_ID must be a valid WeChat Mini Program AppID')
    }
    if (wechatMiniAppSecret.length < 24) {
      throw new Error('WECHAT_MINI_APP_SECRET must contain at least 24 characters')
    }
  }
  if (production && wechatCodeSessionUrl !== officialWechatCodeSessionUrl) {
    throw new Error('WECHAT_CODE_SESSION_URL cannot be overridden in production')
  }
  if ((objectStorageAccessKeyId === undefined) !== (objectStorageSecretAccessKey === undefined)) {
    throw new Error(
      'OBJECT_STORAGE_ACCESS_KEY_ID and OBJECT_STORAGE_SECRET_ACCESS_KEY must be set together',
    )
  }
  if (!['none', 'AES256', 'aws:kms'].includes(objectStorageSse ?? '')) {
    throw new Error('OBJECT_STORAGE_SSE must be none, AES256 or aws:kms')
  }
  if (production && objectStorageSse === 'none') {
    throw new Error('OBJECT_STORAGE_SSE must enable AES256 or aws:kms in production')
  }
  if (production && objectStorageAutoCreateBucket) {
    throw new Error('OBJECT_STORAGE_AUTO_CREATE_BUCKET must be false in production')
  }
  if (objectStorageSse === 'aws:kms' && !process.env.OBJECT_STORAGE_KMS_KEY_ID) {
    throw new Error('OBJECT_STORAGE_KMS_KEY_ID is required when OBJECT_STORAGE_SSE=aws:kms')
  }
  if (photoSigningSecret.length < 32) {
    throw new Error('PHOTO_UPLOAD_SIGNING_SECRET must contain at least 32 characters')
  }
  if (rateLimitHashSecret.length < 32) {
    throw new Error('RATE_LIMIT_HASH_SECRET must contain at least 32 characters')
  }
  if (operationsToken.length < 32) {
    throw new Error('OPERATIONS_TOKEN must contain at least 32 characters')
  }
  if (adminAuditHashSecret.length < 32) {
    throw new Error('ADMIN_AUDIT_HASH_SECRET must contain at least 32 characters')
  }
  if (erasureLedgerHashSecret.length < 32) {
    throw new Error('ERASURE_LEDGER_HASH_SECRET must contain at least 32 characters')
  }
  if (!/^[A-Za-z0-9._:/-]{3,200}$/.test(adminOidcAudience)) {
    throw new Error('ADMIN_OIDC_AUDIENCE contains unsupported characters')
  }

  const aiTimeoutMs = Number(process.env.AI_SERVICE_TIMEOUT_MS ?? 22_000)
  if (!Number.isInteger(aiTimeoutMs) || aiTimeoutMs < 1_000 || aiTimeoutMs > 65_000) {
    throw new Error('AI_SERVICE_TIMEOUT_MS must be an integer between 1000 and 65000')
  }

  return {
    databaseUrl,
    authEnabledProviders,
    wechatMiniAppId,
    wechatMiniAppSecret,
    wechatCodeSessionUrl,
    host: parseHost(process.env.API_HOST, production),
    port: parsePort(process.env.API_PORT),
    aiServiceUrl: exactAiServiceUrl.replace(/\/$/, ''),
    aiServiceToken,
    aiTimeoutMs,
    photoSigningSecret,
    objectStorageEndpoint,
    objectStorageBucket: parseObjectStorageBucket(objectStorageBucket),
    objectStorageRegion,
    objectStorageAccessKeyId,
    objectStorageSecretAccessKey,
    objectStorageForcePathStyle: parseBoolean(
      process.env.OBJECT_STORAGE_FORCE_PATH_STYLE,
      !production,
      'OBJECT_STORAGE_FORCE_PATH_STYLE',
    ),
    objectStorageAutoCreateBucket,
    objectStorageSse: objectStorageSse as 'none' | 'AES256' | 'aws:kms',
    objectStorageKmsKeyId: process.env.OBJECT_STORAGE_KMS_KEY_ID,
    photoObjectPrefix: parseObjectPrefix(
      process.env.PHOTO_OBJECT_PREFIX ?? 'private-photos',
      'PHOTO_OBJECT_PREFIX',
    ),
    erasureLedgerPrefix: parseObjectPrefix(
      process.env.ERASURE_LEDGER_PREFIX ?? 'control/erasure-ledger',
      'ERASURE_LEDGER_PREFIX',
    ),
    erasureLedgerHashSecret,
    dataOperationsWorkerEnabled: parseBoolean(
      process.env.DATA_OPERATIONS_WORKER_ENABLED,
      true,
      'DATA_OPERATIONS_WORKER_ENABLED',
    ),
    dataOperationsPollMs: parsePositiveInteger(
      process.env.DATA_OPERATIONS_POLL_MS,
      15_000,
      'DATA_OPERATIONS_POLL_MS',
      1_000,
      300_000,
    ),
    redisUrl: parseRedisUrl(redisUrl, production),
    rateLimitHashSecret,
    rateLimitKeyPrefix: parseRateLimitKeyPrefix(process.env.RATE_LIMIT_KEY_PREFIX),
    operationsToken,
    adminAuditHashSecret,
    adminOidcIssuer: parseAdminUrl(adminOidcIssuer, 'ADMIN_OIDC_ISSUER', production),
    adminOidcAudience,
    adminOidcJwksUrl: parseAdminUrl(adminOidcJwksUrl, 'ADMIN_OIDC_JWKS_URL', production),
    adminSessionMinutes: parseAdminSessionMinutes(process.env.ADMIN_SESSION_MINUTES),
    trustProxyHops: parseTrustProxyHops(process.env.TRUST_PROXY_HOPS),
  }
}
