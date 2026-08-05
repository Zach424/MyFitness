export type AggregateHistoryReadFailureKind = 'offline' | 'refused' | 'service' | 'unknown'

export type AggregateHistoryReadOperation = 'initial' | 'continuation'

export type AggregateHistoryReadFailure = {
  kind: AggregateHistoryReadFailureKind
  operation: AggregateHistoryReadOperation
}

export type AggregateHistoryReadPhase =
  'initial-loading' | 'ready' | 'continuing' | 'initial-error' | 'stale'

type StatusCodeError = { statusCode?: unknown; errMsg?: unknown }

export const classifyAggregateHistoryReadFailure = (
  error: unknown,
): AggregateHistoryReadFailureKind => {
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

export const aggregateHistoryReadPhase = ({
  hasSnapshot,
  busy,
  hasFailure,
}: {
  hasSnapshot: boolean
  busy: boolean
  hasFailure: boolean
}): AggregateHistoryReadPhase => {
  if (busy) return hasSnapshot ? 'continuing' : 'initial-loading'
  if (hasFailure) return hasSnapshot ? 'stale' : 'initial-error'
  return hasSnapshot ? 'ready' : 'initial-loading'
}

export const aggregateHistoryReadFailureCopy = (
  kind: AggregateHistoryReadFailureKind,
  subject: string,
  hasSnapshot: boolean,
) => {
  if (kind === 'offline')
    return {
      eyebrow: 'OFFLINE / 连接未完成',
      title: hasSnapshot ? `${subject}更早版本没有载入` : `${subject}版本历史还没有读取`,
      detail: hasSnapshot
        ? '已读取的不可变版本仍在下方；重新核对前，不会继续使用保留的游标。'
        : '当前无法确认不可变版本；抽屉保持打开，也不会把读取失败解释成没有历史。',
    }
  if (kind === 'refused')
    return {
      eyebrow: 'READ REFUSED / 读取被拒绝',
      title: `服务没有接受本次${subject}历史核对`,
      detail: hasSnapshot
        ? '已读取版本继续只读保留；显式重试成功前不会载入更早后缀。'
        : '版本数量仍是未知状态；关闭抽屉不会改变记录或当前清单。',
    }
  if (kind === 'service')
    return {
      eyebrow: 'SERVICE PAUSED / 服务暂不可用',
      title: `${subject}版本历史暂时无法读取`,
      detail: hasSnapshot
        ? '下方保留已经接受的不可变版本，旧游标暂时冻结。'
        : '服务暂时没有返回审计证据；这里不会显示“没有版本”。',
    }
  return {
    eyebrow: 'READ UNKNOWN / 结果未知',
    title: `无法确认当前${subject}版本历史`,
    detail: hasSnapshot
      ? '已读取版本继续只读保留；显式重试前不会推进历史边界。'
      : '页面尚未取得可信审计快照，也不会推断这项记录没有历史。',
  }
}
