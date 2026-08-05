import { useEffect, useRef, useState } from 'react'

import type { ConsentReceipt } from '@myfitness/contracts'
import { Button, Text, View } from '@tarojs/components'

import { buttonActivationProps, deferH5Focus } from '../../lib/accessibility'
import { getConsentReceiptHistory } from '../../lib/api'
import {
  classifyPrivacyReadFailure,
  consentCopy,
  type PrivacyReadFailureKind,
} from './privacy.model'
import {
  consentReceiptHistoryFailurePresentation,
  consentReceiptHistoryReadPhase,
  consentReceiptHistoryRequestCanCommit,
  type ConsentReceiptHistoryOperation,
} from './consent-receipt-history.model'

type HistoryFailure = {
  kind: PrivacyReadFailureKind
  operation: ConsentReceiptHistoryOperation
}

type ActiveHistoryRequest = {
  generation: number
  operation: ConsentReceiptHistoryOperation
  cursor?: string
}

const formatHistoryDate = (value: string) =>
  new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

export const ConsentReceiptHistory = ({ disabled }: { disabled: boolean }) => {
  const [opened, setOpened] = useState(false)
  const [items, setItems] = useState<ConsentReceipt[] | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [operation, setOperation] = useState<ConsentReceiptHistoryOperation>('initial')
  const [failure, setFailure] = useState<HistoryFailure>()
  const inFlight = useRef(false)
  const requestGeneration = useRef(0)
  const activeRequest = useRef<ActiveHistoryRequest>()
  const interruptedRequest = useRef<Omit<ActiveHistoryRequest, 'generation'>>()
  const mounted = useRef(true)
  const openedRef = useRef(false)
  const disabledRef = useRef(disabled)
  disabledRef.current = disabled

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      openedRef.current = false
      requestGeneration.current += 1
      activeRequest.current = undefined
      interruptedRequest.current = undefined
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    if (!disabled || !activeRequest.current) return
    requestGeneration.current += 1
    activeRequest.current = undefined
    interruptedRequest.current = undefined
    inFlight.current = false
    setBusy(false)
    setFailure(undefined)
  }, [disabled])

  const load = async (nextOperation: ConsentReceiptHistoryOperation, cursor?: string) => {
    if (inFlight.current || disabledRef.current || !openedRef.current) return
    const request: ActiveHistoryRequest = {
      generation: requestGeneration.current + 1,
      operation: nextOperation,
      cursor,
    }
    requestGeneration.current = request.generation
    activeRequest.current = request
    inFlight.current = true
    setBusy(true)
    setOperation(nextOperation)
    setFailure(undefined)
    try {
      const page = await getConsentReceiptHistory({ limit: 10, cursor })
      if (
        !consentReceiptHistoryRequestCanCommit({
          requestGeneration: request.generation,
          currentGeneration: requestGeneration.current,
          opened: openedRef.current,
          mounted: mounted.current,
          disabled: disabledRef.current,
        })
      )
        return
      if (nextOperation === 'continuation') {
        setItems((current) => {
          const accepted = current ?? []
          const known = new Set(accepted.map((item) => item.receiptId))
          return [...accepted, ...page.items.filter((item) => !known.has(item.receiptId))]
        })
      } else {
        setItems(page.items)
      }
      setNextCursor(page.nextCursor)
    } catch (error) {
      if (
        !consentReceiptHistoryRequestCanCommit({
          requestGeneration: request.generation,
          currentGeneration: requestGeneration.current,
          opened: openedRef.current,
          mounted: mounted.current,
          disabled: disabledRef.current,
        })
      )
        return
      setFailure({ kind: classifyPrivacyReadFailure(error), operation: nextOperation })
      deferH5Focus('consent-history-retry', 80)
    } finally {
      if (requestGeneration.current !== request.generation) return
      activeRequest.current = undefined
      inFlight.current = false
      if (mounted.current) setBusy(false)
    }
  }

  const toggle = () => {
    if (opened) {
      openedRef.current = false
      if (activeRequest.current) {
        interruptedRequest.current = {
          operation: activeRequest.current.operation,
          cursor: activeRequest.current.cursor,
        }
        requestGeneration.current += 1
        activeRequest.current = undefined
        inFlight.current = false
        setBusy(false)
        setFailure(undefined)
      }
      setOpened(false)
      return
    }
    if (disabled) return
    openedRef.current = true
    setOpened(true)
    const interrupted = interruptedRequest.current
    interruptedRequest.current = undefined
    if (interrupted) {
      void load(interrupted.operation, interrupted.cursor)
      return
    }
    if (items === null) void load('initial')
  }

  const retry = () => {
    if (!failure) return
    if (failure.operation === 'continuation' && nextCursor) {
      void load('continuation', nextCursor)
      return
    }
    void load(items === null ? 'initial' : 'refresh')
  }

  const phase = consentReceiptHistoryReadPhase({
    opened,
    hasSnapshot: items !== null,
    busy,
    operation,
    hasFailure: Boolean(failure),
  })
  const failurePresentation = failure
    ? consentReceiptHistoryFailurePresentation({
        ...failure,
        acceptedCount: items?.length ?? null,
      })
    : undefined

  return (
    <View className="consent-history">
      <View className="consent-history__intro">
        <View>
          <Text className="consent-history__kicker">HISTORICAL RECEIPTS</Text>
          <Text className="consent-history__note">
            历史记录只说明何时接受、何时撤回；当前是否有效以上方授权行与本页最新总览为准。
          </Text>
        </View>
        <Button
          className="text-action consent-history__toggle"
          aria-expanded={opened}
          {...buttonActivationProps(toggle, disabled && !opened)}
        >
          {opened ? '收起历史' : '查看全部凭证'}
        </Button>
      </View>

      {opened ? (
        <View className="consent-history__panel" aria-busy={busy}>
          {phase === 'initial-loading' ? (
            <View className="consent-history__loading" role="status">
              <Text>正在核对历史凭证…</Text>
            </View>
          ) : null}

          {failurePresentation ? (
            <View
              className={`consent-history__failure ${items !== null ? 'consent-history__failure--retained' : ''}`}
              role="status"
            >
              <View>
                <Text className="consent-history__failure-eyebrow">
                  {failurePresentation.eyebrow}
                </Text>
                <Text className="consent-history__failure-title">{failurePresentation.title}</Text>
                <Text className="consent-history__failure-note">{failurePresentation.detail}</Text>
              </View>
              <Button
                id="consent-history-retry"
                className="consent-history__retry"
                {...buttonActivationProps(retry, busy || disabled)}
              >
                重新核对
              </Button>
            </View>
          ) : null}

          {items?.length === 0 && !failure ? (
            <View className="consent-history__empty" role="status">
              <Text>服务端确认：当前没有授权凭证历史。</Text>
              <Button
                className="text-action"
                {...buttonActivationProps(() => void load('refresh'), busy || disabled)}
              >
                刷新凭证历史
              </Button>
            </View>
          ) : null}

          {items && items.length > 0 ? (
            <View className="consent-history__list" role="list">
              {items.map((item, index) => (
                <View className="consent-history__item" key={item.receiptId} role="listitem">
                  <Text className="consent-history__index">
                    {String(index + 1).padStart(2, '0')}
                  </Text>
                  <View className="consent-history__item-copy">
                    <Text className="consent-history__item-kicker">
                      {item.revokedAt ? 'REVOKED INTERVAL' : 'ACCEPTED RECEIPT'}
                    </Text>
                    <Text className="consent-history__item-title">
                      {consentCopy[item.purpose].label} · {item.version}
                    </Text>
                    <Text className="consent-history__item-time">
                      接受 {formatHistoryDate(item.acceptedAt)}
                    </Text>
                    <Text className="consent-history__item-time">
                      {item.revokedAt
                        ? `撤回 ${formatHistoryDate(item.revokedAt)}`
                        : '未记录撤回时间 · 当前状态以上方授权行为准'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {phase === 'refreshing' || phase === 'continuing' ? (
            <View className="consent-history__progress" role="status">
              <Text>
                {phase === 'continuing'
                  ? `正在续读更早凭证；已核对的 ${items?.length ?? 0} 份保持可见。`
                  : `正在核对最新凭证；已核对的 ${items?.length ?? 0} 份保持可见。`}
              </Text>
            </View>
          ) : null}

          {items !== null && items.length > 0 && !failurePresentation ? (
            <View className="consent-history__footer">
              <Text>{items.length} 份已核对历史凭证</Text>
              <View className="consent-history__footer-actions">
                <Button
                  className="consent-history__refresh"
                  {...buttonActivationProps(() => void load('refresh'), busy || disabled)}
                >
                  {busy && operation === 'refresh' ? '正在核对…' : '核对最新凭证'}
                </Button>
                {nextCursor ? (
                  <Button
                    className="consent-history__more"
                    {...buttonActivationProps(
                      () => void load('continuation', nextCursor),
                      busy || disabled,
                    )}
                  >
                    {busy && operation === 'continuation' ? '正在读取…' : '加载更早凭证'}
                  </Button>
                ) : (
                  <Text>已到最早凭证</Text>
                )}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}
