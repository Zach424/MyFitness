import { useEffect, useRef, useState } from 'react'

import { deferH5Focus, deferH5FocusWithFallback } from './accessibility'
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

  useEffect(
    () => () => {
      requestToken.current += 1
    },
    [],
  )

  useEffect(() => {
    if (target && focusBoundary?.initialFocusId) deferH5Focus(focusBoundary.initialFocusId)
  }, [focusBoundary?.initialFocusId, target])

  useEffect(() => {
    if (failure) deferH5Focus(retryId)
  }, [failure, retryId])

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
    returnFocusId.current = triggerId
    setTarget(nextTarget)
    setItems(undefined)
    setNextCursor(null)
    setFailure(undefined)
    void read(nextTarget, 'initial')
  }

  const close = () => {
    requestToken.current += 1
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
    if (focusId || fallbackFocusId) deferH5FocusWithFallback(focusId, fallbackFocusId, 40)
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
