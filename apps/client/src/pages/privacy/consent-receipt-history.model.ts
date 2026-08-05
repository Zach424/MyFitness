import type { PrivacyReadFailureKind } from './privacy.model'

export type ConsentReceiptHistoryOperation = 'initial' | 'refresh' | 'continuation'

export type ConsentReceiptHistoryReadPhase =
  | 'collapsed'
  | 'initial-loading'
  | 'ready'
  | 'refreshing'
  | 'continuing'
  | 'initial-error'
  | 'retained-stale'

export const consentReceiptHistoryReadPhase = ({
  opened,
  hasSnapshot,
  busy,
  operation,
  hasFailure,
}: {
  opened: boolean
  hasSnapshot: boolean
  busy: boolean
  operation: ConsentReceiptHistoryOperation
  hasFailure: boolean
}): ConsentReceiptHistoryReadPhase => {
  if (!opened) return 'collapsed'
  if (busy) {
    if (!hasSnapshot) return 'initial-loading'
    return operation === 'continuation' ? 'continuing' : 'refreshing'
  }
  if (hasFailure) return hasSnapshot ? 'retained-stale' : 'initial-error'
  return hasSnapshot ? 'ready' : 'initial-loading'
}

export const consentReceiptHistoryRequestCanCommit = ({
  requestGeneration,
  currentGeneration,
  opened,
  mounted,
  disabled,
}: {
  requestGeneration: number
  currentGeneration: number
  opened: boolean
  mounted: boolean
  disabled: boolean
}) => requestGeneration === currentGeneration && opened && mounted && !disabled

const failureTitles: Record<PrivacyReadFailureKind, { eyebrow: string; title: string }> = {
  offline: {
    eyebrow: 'OFFLINE / 连接未完成',
    title: '连接尚未完成，无法核对授权凭证历史。',
  },
  refused: {
    eyebrow: 'READ REFUSED / 读取被拒绝',
    title: '服务拒绝了本次授权凭证历史读取。',
  },
  service: {
    eyebrow: 'SERVICE PAUSED / 服务暂不可用',
    title: '授权凭证历史服务暂时不可用。',
  },
  unknown: {
    eyebrow: 'READ UNKNOWN / 结果未知',
    title: '暂时无法确认授权凭证历史。',
  },
}

export const consentReceiptHistoryFailurePresentation = ({
  kind,
  operation,
  acceptedCount,
}: {
  kind: PrivacyReadFailureKind
  operation: ConsentReceiptHistoryOperation
  acceptedCount: number | null
}): { eyebrow: string; title: string; detail: string } => {
  const heading = failureTitles[kind]
  if (acceptedCount === null) {
    return {
      ...heading,
      detail: '历史仍是未知状态；未完成的首次读取不会显示为空历史。',
    }
  }
  if (operation === 'continuation') {
    return {
      ...heading,
      detail: `已核对的 ${acceptedCount} 份凭证仍按原顺序保留；更早凭证的游标没有前进。`,
    }
  }
  return {
    ...heading,
    detail: `已核对的 ${acceptedCount} 份凭证与续读位置仍保留；本次最新凭证复核没有替换它们。`,
  }
}
