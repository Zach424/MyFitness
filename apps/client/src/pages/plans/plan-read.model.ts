export type PlanReadFailureKind = 'offline' | 'refused' | 'service' | 'unknown'

export type PlanReadPhase = 'initial-loading' | 'ready' | 'refreshing' | 'initial-error' | 'stale'

type StatusCodeError = {
  statusCode?: unknown
  errMsg?: unknown
}

export const classifyPlanReadFailure = (error: unknown): PlanReadFailureKind => {
  const candidate = error as StatusCodeError | null
  const statusCode =
    candidate && typeof candidate.statusCode === 'number' ? candidate.statusCode : undefined
  if (statusCode !== undefined) {
    if (statusCode >= 400 && statusCode < 500) return 'refused'
    if (statusCode >= 500) return 'service'
    return 'unknown'
  }
  if (error instanceof Error || (candidate && typeof candidate.errMsg === 'string'))
    return 'offline'
  return 'unknown'
}

export const planReadPhase = ({
  hasSnapshot,
  busy,
  hasFailure,
}: {
  hasSnapshot: boolean
  busy: boolean
  hasFailure: boolean
}): PlanReadPhase => {
  if (busy) return hasSnapshot ? 'refreshing' : 'initial-loading'
  if (hasFailure) return hasSnapshot ? 'stale' : 'initial-error'
  return hasSnapshot ? 'ready' : 'initial-loading'
}
