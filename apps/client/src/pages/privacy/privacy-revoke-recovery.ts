import type { PrivacyOverview, RevocableConsentPurpose } from '@myfitness/contracts'

export type RevocationFailureKind =
  'network_uncertain' | 'service_unavailable' | 'server_rejected' | 'unexpected'
export type RevocationRecoveryAuthority = 'reconcile_required' | 'terminal'
export type RevocationEvidence = 'applied' | 'not_applied' | 'diverged'

export type RevocationRecoveryReceipt = {
  authority: RevocationRecoveryAuthority
  kind: RevocationFailureKind
  eyebrow: string
  message: string
  actionLabel: string
}

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

export const describeRevocationFailure = (
  error: unknown,
  consentLabel: string,
): RevocationRecoveryReceipt => {
  const status = statusCode(error)
  if (status !== undefined && !retryableServerStatuses.has(status)) {
    return {
      authority: 'terminal',
      kind: 'server_rejected',
      eyebrow: 'REVOCATION REFUSED / 当前尝试已终止',
      message: `服务端明确拒绝撤回“${consentLabel}”：${messageOf(error)}。当前授权清单仍保留，请检查后重新决定。`,
      actionLabel: '关闭撤回提示',
    }
  }

  const kind: RevocationFailureKind =
    status !== undefined
      ? 'service_unavailable'
      : networkMarkers.some((marker) => messageOf(error).toLocaleLowerCase().includes(marker))
        ? 'network_uncertain'
        : 'unexpected'
  return {
    authority: 'reconcile_required',
    kind,
    eyebrow: 'REVOCATION UNKNOWN / 禁止重复撤回',
    message: `无法确认“${consentLabel}”是否已撤回。清理条数未知；页面会先读取一次当前授权清单，不会自动重放撤回请求。`,
    actionLabel: '核对撤回结果',
  }
}

export const describeRevocationReconciliationFailure = (
  consentLabel: string,
): RevocationRecoveryReceipt => ({
  authority: 'reconcile_required',
  kind: 'service_unavailable',
  eyebrow: 'REVOCATION RECHECK INCOMPLETE / 保留旧清单',
  message: `暂时无法读取“${consentLabel}”的当前授权状态。不会重放撤回；恢复连接后请再次核对。`,
  actionLabel: '重新核对撤回结果',
})

export const classifyRevocationEvidence = (
  overview: PrivacyOverview,
  purpose: RevocableConsentPurpose,
): RevocationEvidence => {
  const consent = overview.consents.find((candidate) => candidate.purpose === purpose)
  if (consent?.status === 'revoked') return 'applied'
  if (consent?.status === 'active') return 'not_applied'
  return 'diverged'
}
