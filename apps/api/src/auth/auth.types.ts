export type AuthPrincipal = {
  userId: string
  sessionId: string
  provider: 'dev'
}

export type AuthenticatedRequest = {
  headers: { authorization?: string }
  user?: AuthPrincipal
}
