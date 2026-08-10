export type ReadFailureKind = 'offline' | 'refused' | 'service' | 'unknown'

export type SnapshotReadPhase =
  'initial-loading' | 'ready' | 'refreshing' | 'initial-error' | 'stale'

type StatusCodeError = { statusCode?: unknown; errMsg?: unknown }

export const classifyReadFailure = (error: unknown): ReadFailureKind => {
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

export const snapshotReadPhase = ({
  hasSnapshot,
  busy,
  hasFailure,
}: {
  hasSnapshot: boolean
  busy: boolean
  hasFailure: boolean
}): SnapshotReadPhase => {
  if (busy) return hasSnapshot ? 'refreshing' : 'initial-loading'
  if (hasFailure) return hasSnapshot ? 'stale' : 'initial-error'
  return hasSnapshot ? 'ready' : 'initial-loading'
}
