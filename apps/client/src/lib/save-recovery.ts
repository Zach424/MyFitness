export type SaveFailureKind =
  'network_uncertain' | 'service_unavailable' | 'server_rejected' | 'unexpected'

export type SaveRecovery = {
  kind: SaveFailureKind
  eyebrow: string
  message: string
  actionLabel: string
}

type SaveFailureOptions = {
  subject: string
  create: boolean
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

const errorMessage = (error: unknown) =>
  error instanceof Error && error.message.trim() ? error.message.trim() : '未知请求错误'

const statusCode = (error: unknown) => {
  if (!error || typeof error !== 'object' || !('statusCode' in error)) return undefined
  const value = (error as { statusCode?: unknown }).statusCode
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined
}

const retryCopy = (create: boolean) =>
  create
    ? '恢复连接后可重试；系统会沿用同一请求编号，服务端只保留一笔。'
    : '恢复连接后请重新核对当前版本，再尝试保存。'

export const describeSaveFailure = (
  error: unknown,
  { subject, create }: SaveFailureOptions,
): SaveRecovery => {
  const status = statusCode(error)
  const message = errorMessage(error)

  if (status !== undefined) {
    if (retryableServerStatuses.has(status)) {
      return {
        kind: 'service_unavailable',
        eyebrow: 'SERVICE UNAVAILABLE / 输入仍保留',
        message: `服务暂时无法完成${subject}保存（${status}）。当前输入仍保留；${retryCopy(create)}`,
        actionLabel: create ? '重试保存（防重复）' : '重新核对后保存',
      }
    }

    return {
      kind: 'server_rejected',
      eyebrow: 'SERVER REFUSAL / 输入仍保留',
      message: `服务端未接受这次保存：${message}。当前输入仍保留，请按提示检查后再保存。`,
      actionLabel: '修正后重新保存',
    }
  }

  const normalized = message.toLocaleLowerCase()
  if (networkMarkers.some((marker) => normalized.includes(marker))) {
    return {
      kind: 'network_uncertain',
      eyebrow: 'CONNECTION UNCERTAIN / 输入仍保留',
      message: `网络连接在保存过程中中断，无法确认${subject}是否已经到达服务端。当前输入仍保留；${retryCopy(create)}`,
      actionLabel: create ? '重试保存（防重复）' : '重新核对后保存',
    }
  }

  return {
    kind: 'unexpected',
    eyebrow: 'SAVE UNCERTAIN / 输入仍保留',
    message: `暂时无法确认${subject}是否保存成功。当前输入仍保留；${retryCopy(create)}`,
    actionLabel: create ? '重试保存（防重复）' : '重新核对后保存',
  }
}
