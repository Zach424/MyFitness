import { useEffect, useRef, useState } from 'react'

import { deferH5Focus } from './accessibility'
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

export const useAggregateHistory = <Target extends AggregateTarget, Item>(
  readPage: AggregateHistoryReader<Item>,
  retryId: string,
) => {
  const [target, setTarget] = useState<Target>()
  const [items, setItems] = useState<Item[]>()
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<AggregateHistoryReadFailure>()
  const requestToken = useRef(0)

  useEffect(
    () => () => {
      requestToken.current += 1
    },
    [],
  )

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
      deferH5Focus(retryId, 80)
    } finally {
      if (requestToken.current === token) setBusy(false)
    }
  }

  const open = (nextTarget: Target) => {
    requestToken.current += 1
    setTarget(nextTarget)
    setItems(undefined)
    setNextCursor(null)
    setFailure(undefined)
    void read(nextTarget, 'initial')
  }

  const close = () => {
    requestToken.current += 1
    setTarget(undefined)
    setItems(undefined)
    setNextCursor(null)
    setBusy(false)
    setFailure(undefined)
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

  return { target, items, nextCursor, busy, failure, phase, open, close, loadOlder, retry }
}
