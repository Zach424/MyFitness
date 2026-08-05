import { useRef, useState } from 'react'

import type { ConsentReceipt } from '@myfitness/contracts'
import { Button, Text, View } from '@tarojs/components'

import { buttonActivationProps, deferH5Focus } from '../../lib/accessibility'
import { getConsentReceiptHistory } from '../../lib/api'
import {
  classifyPrivacyReadFailure,
  consentCopy,
  type PrivacyReadFailureKind,
} from './privacy.model'

type HistoryOperation = 'initial' | 'refresh' | 'continuation'
type HistoryFailure = { kind: PrivacyReadFailureKind; operation: HistoryOperation }

const historyFailureCopy: Record<PrivacyReadFailureKind, string> = {
  offline: '连接尚未完成，无法核对授权凭证历史。',
  refused: '服务拒绝了本次授权凭证历史读取。',
  service: '授权凭证历史服务暂时不可用。',
  unknown: '暂时无法确认授权凭证历史。',
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
  const [failure, setFailure] = useState<HistoryFailure>()
  const inFlight = useRef(false)

  const load = async (operation: HistoryOperation, cursor?: string) => {
    if (inFlight.current || disabled) return
    inFlight.current = true
    setBusy(true)
    setFailure(undefined)
    try {
      const page = await getConsentReceiptHistory({ limit: 10, cursor })
      if (operation === 'continuation') {
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
      setFailure({ kind: classifyPrivacyReadFailure(error), operation })
      deferH5Focus('consent-history-retry', 80)
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const toggle = () => {
    if (opened) {
      setOpened(false)
      return
    }
    if (disabled) return
    setOpened(true)
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
        <View className="consent-history__panel">
          {busy && items === null ? (
            <View className="consent-history__loading" role="status">
              <Text>正在核对历史凭证…</Text>
            </View>
          ) : null}

          {failure ? (
            <View
              className={`consent-history__failure ${items !== null ? 'consent-history__failure--retained' : ''}`}
              role="status"
            >
              <View>
                <Text className="consent-history__failure-title">
                  {historyFailureCopy[failure.kind]}
                </Text>
                {items !== null ? (
                  <Text className="consent-history__failure-note">
                    已读取的 {items.length} 份历史凭证仍保留；游标没有前进。
                  </Text>
                ) : (
                  <Text className="consent-history__failure-note">
                    未完成读取不会显示为空历史。
                  </Text>
                )}
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

          {items !== null && items.length > 0 && !failure ? (
            <View className="consent-history__footer">
              <Text>{items.length} 份已核对历史凭证</Text>
              {nextCursor ? (
                <Button
                  className="consent-history__more"
                  {...buttonActivationProps(
                    () => void load('continuation', nextCursor),
                    busy || disabled,
                  )}
                >
                  {busy ? '正在读取…' : '加载更早凭证'}
                </Button>
              ) : (
                <Text>已到最早凭证</Text>
              )}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}
