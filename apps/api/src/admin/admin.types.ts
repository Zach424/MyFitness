import type { AdminIdentityProvider, AdminRole } from '@myfitness/contracts'

export type AdminPrincipal = {
  operatorId: string
  sessionId: string
  displayName: string
  roles: AdminRole[]
  identityProvider: AdminIdentityProvider
  expiresAt: string
}

export type AdminAuthenticatedRequest = {
  headers: Record<string, string | string[] | undefined>
  requestId?: string
  operator?: AdminPrincipal
}
