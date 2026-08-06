import { useEffect, useRef, useState } from 'react'

import {
  deferH5Focus,
  deferH5FocusWithFallback,
  type DeferredH5FocusRequest,
} from './accessibility'
import {
  aggregateHistoryReadPhase,
  classifyAggregateHistoryReadFailure,
  type AggregateHistoryReadFailure,
  type AggregateHistoryReadOperation,
} from './aggregate-history-read'

type AggregateTarget = { id: string }
type AggregateHistoryPage<Item> = { items: Item[]; nextCursor: string | null }
type AggregateHistoryReader<Item> = (
  aggregateId: string,
  options: { limit: number; cursor?: string },
) => Promise<AggregateHistoryPage<Item>>

type AggregateHistoryFocusBoundary = {
  initialFocusId: string
  fallbackFocusId: string
}

export const useAggregateHistory = <Target extends AggregateTarget, Item>(
  readPage: AggregateHistoryReader<Item>,
  retryId: string,
  focusBoundary?: AggregateHistoryFocusBoundary,
) => {
  const [target, setTarget] = useState<Target>()
  const [items, setItems] = useState<Item[]>()
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<AggregateHistoryReadFailure>()
  const requestToken = useRef(0)
  const returnFocusId = useRef('')
  const focusGeneration = useRef(0)
  const focusRequest = useRef<DeferredH5FocusRequest>()

  const invalidateFocus = () => {
    focusGeneration.current += 1
    focusRequest.current?.cancel()
    focusRequest.current = undefined
  }

  const scheduleFocus = (primaryId: string, fallbackId = '', delayMs = 0) => {
    invalidateFocus()
    const generation = focusGeneration.current
    const token = requestToken.current
    const options = {
      canFocus: () => focusGeneration.current === generation && requestToken.current === token,
    }
    const request = fallbackId
      ? deferH5FocusWithFallback(primaryId, fallbackId, delayMs, options)
      : deferH5Focus(primaryId, delayMs, options)
    focusRequest.current = request || undefined
    return request
  }

  useEffect(
    () => () => {
      requestToken.current += 1
      invalidateFocus()
    },
    [],
  )

  useEffect(() => {
    if (!target || !focusBoundary?.initialFocusId) return
    const request = scheduleFocus(focusBoundary.initialFocusId)
    return () => {
      if (request) request.cancel()
    }
  }, [focusBoundary?.initialFocusId, target])

  useEffect(() => {
    if (!failure || busy) return
    const request = scheduleFocus(retryId)
    return () => {
      if (request) request.cancel()
    }
  }, [busy, failure, retryId])

  const read = async (
    currentTarget: Target,
    operation: AggregateHistoryReadOperation,
    cursor?: string,
  ) => {
    const token = ++requestToken.current
    setBusy(true)
    setFailure(undefined)
    try {
      const result = await readPage(currentTarget.id, { limit: 10, ...(cursor ? { cursor } : {}) })
      if (requestToken.current !== token) return
      setItems((current) =>
        operation === 'initial' ? result.items : [...(current ?? []), ...result.items],
      )
      setNextCursor(result.nextCursor)
    } catch (error) {
      if (requestToken.current !== token) return
      setFailure({ kind: classifyAggregateHistoryReadFailure(error), operation })
    } finally {
      if (requestToken.current === token) setBusy(false)
    }
  }

  const open = (nextTarget: Target, triggerId = '') => {
    requestToken.current += 1
    invalidateFocus()
    returnFocusId.current = triggerId
    setTarget(nextTarget)
    setItems(undefined)
    setNextCursor(null)
    setFailure(undefined)
    void read(nextTarget, 'initial')
  }

  const close = () => {
    requestToken.current += 1
    invalidateFocus()
    returnFocusId.current = ''
    setTarget(undefined)
    setItems(undefined)
    setNextCursor(null)
    setBusy(false)
    setFailure(undefined)
  }

  const dismiss = () => {
    const focusId = returnFocusId.current
    const fallbackFocusId = focusBoundary?.fallbackFocusId ?? ''
    close()
    if (focusId || fallbackFocusId) scheduleFocus(focusId, fallbackFocusId, 40)
  }

  const phase = aggregateHistoryReadPhase({
    hasSnapshot: items !== undefined,
    busy,
    hasFailure: Boolean(failure),
  })

  const loadOlder = () => {
    if (phase !== 'ready' || !target || !nextCursor) return
    void read(target, 'continuation', nextCursor)
  }

  const retry = () => {
    if (!target || !failure) return
    if (failure.operation === 'continuation' && nextCursor) {
      void read(target, 'continuation', nextCursor)
      return
    }
    void read(target, 'initial')
  }

  return { target, items, nextCursor, busy, failure, phase, open, close, dismiss, loadOlder, retry }
}
