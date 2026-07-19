import type { UserAuthProvider } from '@myfitness/contracts'

export type AuthPrincipal = {
  userId: string
  sessionId: string
  provider: UserAuthProvider
}

export type AuthenticatedRequest = {
  headers: { authorization?: string }
  user?: AuthPrincipal
}
