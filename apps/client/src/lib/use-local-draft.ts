import { useEffect, useRef, useState } from 'react'

import type { LocalDraftEnvelope, LocalDraftKind } from './draft-vault'
import { localDraftVault } from './local-drafts'

type RecoverableDraftOptions<T> = {
  kind: LocalDraftKind
  draft: T
  enabled: boolean
  dirty: boolean
  validate: (value: unknown) => value is T
  debounceMs?: number
}

export const useRecoverableDraft = <T>({
  kind,
  draft,
  enabled,
  dirty,
  validate,
  debounceMs = 600,
}: RecoverableDraftOptions<T>) => {
  const [pending, setPending] = useState<LocalDraftEnvelope<T>>()
  const [saved, setSaved] = useState<LocalDraftEnvelope<T>>()
  const checked = useRef(false)

  useEffect(() => {
    const result = localDraftVault.read(kind, validate)
    if (result.status === 'ready') setPending(result.envelope)
    checked.current = true
  }, [kind, validate])

  useEffect(() => {
    if (!checked.current || pending || !enabled) return
    if (!dirty) {
      localDraftVault.clear(kind)
      setSaved(undefined)
      return
    }
    const timer = setTimeout(() => {
      const envelope = localDraftVault.write(kind, draft, validate)
      setSaved(envelope ?? undefined)
    }, debounceMs)
    return () => clearTimeout(timer)
  }, [debounceMs, dirty, draft, enabled, kind, pending, validate])

  const restore = () => {
    if (!pending) return null
    setSaved(pending)
    setPending(undefined)
    return pending.payload
  }

  const clear = () => {
    localDraftVault.clear(kind)
    setPending(undefined)
    setSaved(undefined)
  }

  return { pending, saved, restore, clear }
}
