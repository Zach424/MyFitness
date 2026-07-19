import path from 'node:path'

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

const parsePort = (value: string | undefined) => {
  const port = Number(value ?? 3100)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('API_PORT must be an integer between 1 and 65535')
  }
  return port
}

const parseTrustProxyHops = (value: string | undefined) => {
  const hops = Number(value ?? 0)
  if (!Number.isInteger(hops) || hops < 0 || hops > 3) {
    throw new Error('TRUST_PROXY_HOPS must be an integer between 0 and 3')
  }
  return hops
}

const parseRedisUrl = (value: string) => {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('REDIS_URL must be a valid redis:// or rediss:// URL')
  }
  if (!['redis:', 'rediss:'].includes(parsed.protocol)) {
    throw new Error('REDIS_URL must use redis:// or rediss://')
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

export const getRuntimeConfig = () => {
  const production = process.env.NODE_ENV === 'production'
  const databaseUrl = process.env.DATABASE_URL ?? (production ? undefined : localDatabaseUrl)
  const aiServiceUrl = process.env.AI_SERVICE_URL ?? (production ? undefined : localAiServiceUrl)
  const aiServiceToken =
    process.env.AI_SERVICE_TOKEN ?? (production ? undefined : localAiServiceToken)
  const photoStorageRoot =
    process.env.PHOTO_STORAGE_ROOT ??
    (production ? undefined : path.resolve(process.cwd(), 'uploads/private'))
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

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required in production')
  }
  if (!aiServiceUrl || !aiServiceToken) {
    throw new Error('AI_SERVICE_URL and AI_SERVICE_TOKEN are required in production')
  }
  if (!photoStorageRoot || !photoSigningSecret) {
    throw new Error('PHOTO_STORAGE_ROOT and PHOTO_UPLOAD_SIGNING_SECRET are required in production')
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
  if (!/^[A-Za-z0-9._:/-]{3,200}$/.test(adminOidcAudience)) {
    throw new Error('ADMIN_OIDC_AUDIENCE contains unsupported characters')
  }

  const aiTimeoutMs = Number(process.env.AI_SERVICE_TIMEOUT_MS ?? 22_000)
  if (!Number.isInteger(aiTimeoutMs) || aiTimeoutMs < 1_000 || aiTimeoutMs > 65_000) {
    throw new Error('AI_SERVICE_TIMEOUT_MS must be an integer between 1000 and 65000')
  }

  return {
    databaseUrl,
    port: parsePort(process.env.API_PORT),
    aiServiceUrl: aiServiceUrl.replace(/\/$/, ''),
    aiServiceToken,
    aiTimeoutMs,
    photoStorageRoot: path.resolve(photoStorageRoot),
    photoSigningSecret,
    redisUrl: parseRedisUrl(redisUrl),
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
