import type { OidcAuthorizationConfig, VerifiedSession } from '@myfitness/contracts'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const offsetDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
const sessionProviders = new Set(['dev', 'wechat', 'oidc', 'phone'])

const invalidResponse = () => new Error('身份服务返回了无效数据')

const isExactRecord = (value: unknown, keys: readonly string[]) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const actualKeys = Object.keys(value)
  return actualKeys.length === keys.length && keys.every((key) => actualKeys.includes(key))
}

const isUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') return false
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

export const parseOidcAuthorizationConfig = (value: unknown): OidcAuthorizationConfig => {
  const keys = ['issuer', 'authorizationUrl', 'clientId', 'redirectUri', 'scopes'] as const
  if (!isExactRecord(value, keys)) throw invalidResponse()

  const candidate = value as Record<(typeof keys)[number], unknown>
  if (
    !isUrl(candidate.issuer) ||
    !isUrl(candidate.authorizationUrl) ||
    typeof candidate.clientId !== 'string' ||
    candidate.clientId.length < 3 ||
    candidate.clientId.length > 200 ||
    !isUrl(candidate.redirectUri) ||
    !Array.isArray(candidate.scopes) ||
    candidate.scopes.length < 1 ||
    candidate.scopes.length > 10 ||
    candidate.scopes.some(
      (scope) => typeof scope !== 'string' || scope.length < 1 || scope.length > 100,
    )
  ) {
    throw invalidResponse()
  }

  return candidate as OidcAuthorizationConfig
}

export const parseVerifiedSession = (value: unknown): VerifiedSession => {
  const keys = ['accessToken', 'userId', 'provider', 'isNewUser', 'expiresAt'] as const
  if (!isExactRecord(value, keys)) throw invalidResponse()

  const candidate = value as Record<(typeof keys)[number], unknown>
  if (
    typeof candidate.accessToken !== 'string' ||
    candidate.accessToken.length < 32 ||
    typeof candidate.userId !== 'string' ||
    !uuidPattern.test(candidate.userId) ||
    typeof candidate.provider !== 'string' ||
    !sessionProviders.has(candidate.provider) ||
    typeof candidate.isNewUser !== 'boolean' ||
    typeof candidate.expiresAt !== 'string' ||
    !offsetDateTimePattern.test(candidate.expiresAt) ||
    !Number.isFinite(Date.parse(candidate.expiresAt))
  ) {
    throw invalidResponse()
  }

  return candidate as VerifiedSession
}
