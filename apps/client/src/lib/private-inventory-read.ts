export type PrivateInventoryReadFailureKind = 'offline' | 'refused' | 'service' | 'unknown'

export type PrivateInventoryReadPhase =
  'initial-loading' | 'ready' | 'refreshing' | 'initial-error' | 'stale'

export type PrivateInventoryReadSubject = 'food-proof' | 'progress-photo'

type StatusCodeError = { statusCode?: unknown; errMsg?: unknown }

const subjectLabels: Record<PrivateInventoryReadSubject, string> = {
  'food-proof': '餐食照片校样清单',
  'progress-photo': '私有进度照片清单',
}

export const privateInventoryReadSubjectLabel = (subject: PrivateInventoryReadSubject) =>
  subjectLabels[subject]

export const classifyPrivateInventoryReadFailure = (
  error: unknown,
): PrivateInventoryReadFailureKind => {
  const candidate = error as StatusCodeError | null
  const statusCode =
    candidate && typeof candidate.statusCode === 'number' ? candidate.statusCode : undefined
  if (statusCode !== undefined) {
    if (statusCode >= 400 && statusCode < 500) return 'refused'
    if (statusCode >= 500) return 'service'
    return 'unknown'
  }
  if (error instanceof Error || (candidate && typeof candidate.errMsg === 'string'))
    return 'offline'
  return 'unknown'
}

export const privateInventoryReadPhase = ({
  hasSnapshot,
  busy,
  hasFailure,
}: {
  hasSnapshot: boolean
  busy: boolean
  hasFailure: boolean
}): PrivateInventoryReadPhase => {
  if (busy) return hasSnapshot ? 'refreshing' : 'initial-loading'
  if (hasFailure) return hasSnapshot ? 'stale' : 'initial-error'
  return hasSnapshot ? 'ready' : 'initial-loading'
}

export const privateInventoryReadFailureCopy = (
  kind: PrivateInventoryReadFailureKind,
  subject: PrivateInventoryReadSubject,
  hasSnapshot: boolean,
) => {
  const label = privateInventoryReadSubjectLabel(subject)
  if (kind === 'offline')
    return {
      eyebrow: 'OFFLINE / 连接未完成',
      title: hasSnapshot ? `${label}复核没有完成` : `${label}还没有读取`,
      detail: hasSnapshot
        ? '上次成功读取的私密清单仍在下方；重新核对前，上传、确认、比较选择和删除保持冻结。'
        : `当前无法确认${label}；页面不会用空清单代替，也不会开放媒体或保管操作。`,
    }
  if (kind === 'refused')
    return {
      eyebrow: 'READ REFUSED / 读取被拒绝',
      title: `服务没有接受本次${label}核对`,
      detail: hasSnapshot
        ? '旧清单继续只读保留；重新核对成功前，不能用它授权媒体或保管操作。'
        : '私密清单仍是未知状态；只有成功响应才能证明当前没有照片或校样。',
    }
  if (kind === 'service')
    return {
      eyebrow: 'SERVICE PAUSED / 服务暂不可用',
      title: `${label}暂时无法读取`,
      detail: hasSnapshot
        ? '下方保留上次清单用于查看，所有依赖当前清单的操作保持冻结。'
        : '服务暂时没有返回私密清单证据；这里不会显示“还没有照片”或“没有校样”。',
    }
  return {
    eyebrow: 'READ UNKNOWN / 结果未知',
    title: `无法确认当前${label}`,
    detail: hasSnapshot
      ? '旧清单继续只读保留；重新核对前不会把它描述为当前保管状态。'
      : `页面尚未取得可信${label}，也不会推断账户里没有相关私密媒体。`,
  }
}
