import 'server-only'

import { randomUUID } from 'node:crypto'

import type { AdminRole } from '@myfitness/contracts'
import type { NextResponse } from 'next/server'

export const adminSessionCookie = 'myfitness_admin_session'
export const oidcStateCookie = 'myfitness_admin_oidc_state'
export const oidcVerifierCookie = 'myfitness_admin_oidc_verifier'
export const oidcNonceCookie = 'myfitness_admin_oidc_nonce'

const apiBaseUrl = () => {
  const raw = process.env.MYFITNESS_API_URL ?? 'http://127.0.0.1:3100/v1'
  const parsed = new URL(raw)
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('MYFITNESS_API_URL must be HTTP(S)')
  }
  return parsed.toString().replace(/\/$/, '')
}

export type ApiResult = {
  status: number
  body: unknown
}

export const adminApi = async (
  path: string,
  init: RequestInit = {},
  accessToken?: string,
): Promise<ApiResult> => {
  const headers = new Headers(init.headers)
  headers.set('x-request-id', randomUUID())
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`)
  try {
    const response = await fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      headers,
      cache: 'no-store',
    })
    const text = await response.text()
    let body: unknown = null
    if (text) {
      try {
        body = JSON.parse(text)
      } catch {
        body = { message: '管理员服务返回了无法读取的响应。' }
      }
    }
    return { status: response.status, body }
  } catch {
    return {
      status: 503,
      body: { code: 'admin_api_unavailable', message: '管理员服务暂不可用，请稍后重试。' },
    }
  }
}

export const safeApiError = (result: ApiResult) => {
  const value = result.body && typeof result.body === 'object' ? result.body : {}
  const record = value as Record<string, unknown>
  return {
    code: typeof record.code === 'string' ? record.code : 'admin_request_failed',
    message:
      typeof record.message === 'string' ? record.message : '请求没有完成，请检查权限后重试。',
    ...(typeof record.lookupReceiptId === 'string'
      ? { lookupReceiptId: record.lookupReceiptId }
      : {}),
  }
}

const secureCookie =
  process.env.NODE_ENV === 'production' && process.env.ADMIN_COOKIE_SECURE !== 'false'

export const sessionCookieOptions = (expiresAt?: string) => ({
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: secureCookie,
  path: '/',
  ...(expiresAt ? { expires: new Date(expiresAt) } : {}),
})

export const transientCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: secureCookie,
  path: '/api/operator/oidc',
  maxAge: 10 * 60,
}

export const clearSessionCookie = (response: NextResponse) => {
  response.cookies.set(adminSessionCookie, '', {
    ...sessionCookieOptions(),
    maxAge: 0,
  })
}

export const localOperator = () => {
  const requested = (process.env.ADMIN_LOCAL_ROLES ?? 'support_reader,audit_reader')
    .split(',')
    .map((role) => role.trim())
    .filter((role): role is AdminRole => ['support_reader', 'audit_reader'].includes(role))
  const roles = [...new Set(requested)]
  if (!roles.length) throw new Error('ADMIN_LOCAL_ROLES must include a supported role')
  return {
    subject: process.env.ADMIN_LOCAL_SUBJECT ?? 'local-evidence-operator',
    displayName: process.env.ADMIN_LOCAL_DISPLAY_NAME ?? '本地证据操作员',
    roles,
  }
}

export type OidcClientConfig = {
  authorizationUrl: string
  tokenUrl: string
  clientId: string
  clientSecret: string
  redirectUri: string
}

export const oidcClientConfig = (): OidcClientConfig | null => {
  const values = {
    authorizationUrl: process.env.ADMIN_OIDC_AUTHORIZATION_URL,
    tokenUrl: process.env.ADMIN_OIDC_TOKEN_URL,
    clientId: process.env.ADMIN_OIDC_CLIENT_ID,
    clientSecret: process.env.ADMIN_OIDC_CLIENT_SECRET,
    redirectUri: process.env.ADMIN_OIDC_REDIRECT_URI,
  }
  if (Object.values(values).some((value) => !value)) return null
  const authorizationUrl = new URL(values.authorizationUrl!)
  const tokenUrl = new URL(values.tokenUrl!)
  const redirectUri = new URL(values.redirectUri!)
  if (
    ![authorizationUrl, tokenUrl, redirectUri].every((url) =>
      ['http:', 'https:'].includes(url.protocol),
    )
  ) {
    throw new Error('administrator OIDC endpoints must use HTTP(S)')
  }
  if (process.env.NODE_ENV === 'production') {
    if (
      authorizationUrl.protocol !== 'https:' ||
      tokenUrl.protocol !== 'https:' ||
      redirectUri.protocol !== 'https:'
    ) {
      throw new Error('administrator OIDC endpoints must use HTTPS in production')
    }
  }
  return values as OidcClientConfig
}
