import type { FavoriteFood, FavoriteFoodInput } from '@myfitness/contracts'

export type FavoriteMutation = 'save' | 'remove'
export type FavoriteFailureKind =
  'network_uncertain' | 'service_unavailable' | 'server_rejected' | 'unexpected'
export type FavoriteRecoveryAuthority = 'reconcile_required' | 'terminal'
export type FavoriteEvidence = 'applied' | 'not_applied' | 'diverged'

export type FavoriteRecoveryReceipt = {
  authority: FavoriteRecoveryAuthority
  kind: FavoriteFailureKind
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

export const describeFavoriteFailure = (
  operation: FavoriteMutation,
  error: unknown,
  foodName: string,
): FavoriteRecoveryReceipt => {
  const status = statusCode(error)
  const action = operation === 'save' ? '收藏' : '取消收藏'
  if (status !== undefined && !retryableServerStatuses.has(status)) {
    return {
      authority: 'terminal',
      kind: 'server_rejected',
      eyebrow: 'REQUEST REFUSED / 当前尝试已终止',
      message: `服务端明确拒绝了“${foodName}”的${action}：${messageOf(error)}。餐次草稿没有改变；关闭提示后可重新决定。`,
      actionLabel: '关闭收藏提示',
    }
  }

  const kind: FavoriteFailureKind =
    status !== undefined
      ? 'service_unavailable'
      : networkMarkers.some((marker) => messageOf(error).toLocaleLowerCase().includes(marker))
        ? 'network_uncertain'
        : 'unexpected'
  return {
    authority: 'reconcile_required',
    kind,
    eyebrow: 'FAVORITE UNKNOWN / 先核对收藏清单',
    message: `无法确认“${foodName}”的${action}结果。餐次草稿仍保留；页面会先读取当前收藏清单，不会自动重放${operation === 'save' ? ' PUT' : '删除'}。`,
    actionLabel: '核对收藏状态',
  }
}

export const describeFavoriteReconciliationFailure = (
  foodName: string,
): FavoriteRecoveryReceipt => ({
  authority: 'reconcile_required',
  kind: 'service_unavailable',
  eyebrow: 'FAVORITE RECHECK INCOMPLETE / 草稿仍保留',
  message: `暂时无法读取“${foodName}”的当前收藏状态。不会重放收藏操作；请恢复连接后再次核对。`,
  actionLabel: '重新核对收藏状态',
})

const sameValue = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameValue(value, right[index]))
    )
  }
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord).sort()
  const rightKeys = Object.keys(rightRecord).sort()
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) => key === rightKeys[index] && sameValue(leftRecord[key], rightRecord[key]),
    )
  )
}

export const favoriteMatchesSubmitted = (favorite: FavoriteFood, submitted: FavoriteFoodInput) =>
  sameValue(
    { food: favorite.food, defaultServing: favorite.defaultServing },
    { food: submitted.food, defaultServing: submitted.defaultServing },
  )

export const classifyFavoriteEvidence = (
  operation: FavoriteMutation,
  foodKey: string,
  favorites: FavoriteFood[],
  submitted?: FavoriteFoodInput,
): FavoriteEvidence => {
  const current = favorites.find((favorite) => favorite.food.foodKey === foodKey)
  if (operation === 'remove') return current ? 'not_applied' : 'applied'
  if (!current) return 'not_applied'
  return submitted && favoriteMatchesSubmitted(current, submitted) ? 'applied' : 'diverged'
}
