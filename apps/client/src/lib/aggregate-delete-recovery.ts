export type AggregateDeleteFailureKind =
  'network_uncertain' | 'service_unavailable' | 'server_rejected' | 'unexpected'

export type AggregateDeleteRecovery = {
  authority: 'reconcile_required' | 'terminal'
  failureKind: AggregateDeleteFailureKind
  eyebrow: string
  message: string
  actionLabel: string
}

export type AggregateDeleteEvidence = 'removed' | 'unchanged' | 'changed'

const retryableServerStatuses = new Set([408, 425, 429, 500, 502, 503, 504])
const networkMarkers = [
  'request:fail',
  'failed to fetch',
  'network error',
  'networkerror',
  'err_network',
  'load failed',
  'timeout',
]

const statusCode = (error: unknown) => {
  if (!error || typeof error !== 'object' || !('statusCode' in error)) return undefined
  const value = (error as { statusCode?: unknown }).statusCode
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined
}

const messageOf = (error: unknown) =>
  error instanceof Error && error.message.trim() ? error.message.trim() : '未知请求错误'

const failureKindOf = (error: unknown): AggregateDeleteFailureKind => {
  const status = statusCode(error)
  if (status !== undefined) {
    return retryableServerStatuses.has(status) ? 'service_unavailable' : 'server_rejected'
  }
  const message = messageOf(error).toLocaleLowerCase()
  if (networkMarkers.some((marker) => message.includes(marker))) return 'network_uncertain'
  return 'unexpected'
}

export const describeAggregateDeleteFailure = (
  error: unknown,
  subject: string,
): AggregateDeleteRecovery => {
  const failureKind = failureKindOf(error)
  if (failureKind === 'server_rejected') {
    return {
      authority: 'terminal',
      failureKind,
      eyebrow: 'REQUEST REFUSED / 当前尝试已终止',
      message: `服务端明确拒绝删除${subject}：${messageOf(error)}。这不代表删除成功，也不会自动重放。`,
      actionLabel: '返回检查记录',
    }
  }
  return {
    authority: 'reconcile_required',
    failureKind,
    eyebrow: 'RESULT UNKNOWN / 先核对再决定',
    message: `无法确认${subject}是否已从服务端移除。必须先读取这条记录的当前状态；核对前不会再次发送删除请求。`,
    actionLabel: '核对当前记录',
  }
}

export const describeAggregateDeleteReconciliationFailure = (
  error: unknown,
  subject: string,
): AggregateDeleteRecovery => ({
  authority: 'reconcile_required',
  failureKind: failureKindOf(error),
  eyebrow: 'CHECK INCOMPLETE / 删除结果仍未知',
  message: `暂时无法核对${subject}的当前状态：${messageOf(error)}。不会重放删除；请恢复连接后再次核对。`,
  actionLabel: '再次核对当前记录',
})

export const classifyAggregateDeleteEvidence = (
  expectedRevision: number,
  currentRevision?: number,
): AggregateDeleteEvidence => {
  if (currentRevision === undefined) return 'removed'
  return currentRevision === expectedRevision ? 'unchanged' : 'changed'
}
