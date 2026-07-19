import type { AuthPrincipal } from '../auth/auth.types'
import type { AdminPrincipal } from '../admin/admin.types'

export type OperationalRequest = {
  headers: Record<string, string | string[] | undefined>
  method: string
  ip?: string
  socket?: { remoteAddress?: string }
  requestId?: string
  user?: AuthPrincipal
  operator?: AdminPrincipal
}

export type OperationalResponse = {
  statusCode: number
  setHeader(name: string, value: string | number): void
}

export type RateLimitPolicy = {
  name: string
  limit: number
  windowSeconds: number
  scope?: 'auto' | 'ip' | 'user' | 'operator'
}

export type RateLimitDecision = {
  allowed: boolean
  count: number
  limit: number
  remaining: number
  resetAfterSeconds: number
}
