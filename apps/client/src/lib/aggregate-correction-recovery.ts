import type {
  HealthRecord,
  Meal,
  UpdateHealthRecord,
  UpdateMeal,
  UpdateWorkout,
  Workout,
} from '@myfitness/contracts'

export type AggregateCorrectionFailureKind =
  'network_uncertain' | 'service_unavailable' | 'server_rejected' | 'unexpected'

export type AggregateCorrectionRecovery = {
  authority: 'reconcile_required' | 'terminal'
  kind: AggregateCorrectionFailureKind
  eyebrow: string
  message: string
  actionLabel: string
}

export type AggregateCorrectionEvidence = 'accepted' | 'unchanged' | 'diverged'

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

export const describeAggregateCorrectionFailure = (
  error: unknown,
  subject: string,
): AggregateCorrectionRecovery => {
  const status = statusCode(error)
  if (status !== undefined && !retryableServerStatuses.has(status)) {
    return {
      authority: 'terminal',
      kind: 'server_rejected',
      eyebrow: 'REQUEST REFUSED / 当前尝试已终止',
      message: `服务端明确拒绝了${subject}：${messageOf(error)}。当前输入仍保留；请按提示检查后再明确保存。`,
      actionLabel: '检查后重新保存',
    }
  }

  const kind: AggregateCorrectionFailureKind =
    status !== undefined
      ? 'service_unavailable'
      : networkMarkers.some((marker) => messageOf(error).toLocaleLowerCase().includes(marker))
        ? 'network_uncertain'
        : 'unexpected'

  return {
    authority: 'reconcile_required',
    kind,
    eyebrow: 'RECONCILE FIRST / 禁止直接重放',
    message: `无法确认${subject}是否已保存。当前输入仍保留；必须先读取这条记录并逐项核对，核对前不会再次发送修改。`,
    actionLabel: '核对保存结果',
  }
}

export const describeAggregateCorrectionReconciliationFailure = (
  error: unknown,
  subject: string,
): AggregateCorrectionRecovery => {
  const status = statusCode(error)
  return {
    authority: 'reconcile_required',
    kind:
      status !== undefined
        ? retryableServerStatuses.has(status)
          ? 'service_unavailable'
          : 'server_rejected'
        : networkMarkers.some((marker) => messageOf(error).toLocaleLowerCase().includes(marker))
          ? 'network_uncertain'
          : 'unexpected',
    eyebrow: 'RECHECK INCOMPLETE / 输入仍保留',
    message: `暂时无法读取${subject}的当前版本，因此仍不能判断上次修改结果。不会重放修改；请恢复连接后再次核对。`,
    actionLabel: '重新核对保存结果',
  }
}

export const describeMissingAggregateCorrectionTarget = (
  subject: string,
): AggregateCorrectionRecovery => ({
  authority: 'terminal',
  kind: 'server_rejected',
  eyebrow: 'TARGET MISSING / 修改已冻结',
  message: `${subject}已不在当前账户可见记录中，无法确认上次修改结果。输入仍保留供你查看或复制；请取消修改返回新建状态，页面不会把它自动改成新记录。`,
  actionLabel: '当前记录已不存在',
})

export const classifyAggregateCorrectionEvidence = <Current extends { revision: number }>(
  baseRevision: number,
  current: Current,
  matchesSubmitted: (value: Current) => boolean,
): AggregateCorrectionEvidence => {
  if (current.revision > baseRevision && matchesSubmitted(current)) return 'accepted'
  if (current.revision === baseRevision) return 'unchanged'
  return 'diverged'
}

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

export const healthRecordMatchesSubmittedCorrection = (
  current: HealthRecord,
  submitted: UpdateHealthRecord,
) =>
  sameValue(
    {
      metric: current.metric,
      value: current.displayValue,
      unit: current.displayUnit,
      source: current.source,
      status: current.status,
      occurredAt: current.occurredAt,
      timezone: current.timezone,
    },
    {
      metric: submitted.metric,
      value: submitted.value,
      unit: submitted.unit,
      source: submitted.source,
      status: submitted.status,
      occurredAt: submitted.occurredAt,
      timezone: submitted.timezone,
    },
  )

export const workoutMatchesSubmittedCorrection = (current: Workout, submitted: UpdateWorkout) =>
  sameValue(
    {
      title: current.title,
      source: current.source,
      exercises: current.exercises.map((exercise) => ({
        position: exercise.position,
        exerciseKey: exercise.exerciseKey,
        name: exercise.name,
        category: exercise.category,
        ...(exercise.trackingMode ? { trackingMode: exercise.trackingMode } : {}),
        equipment: exercise.equipment ?? [],
        ...(exercise.equipmentNotes ? { equipmentNotes: exercise.equipmentNotes } : {}),
        ...(exercise.notes ? { notes: exercise.notes } : {}),
        sets: exercise.sets.map(({ id: _id, canonicalLoadKg: _canonicalLoadKg, ...set }) => set),
      })),
      startedAt: current.startedAt,
      endedAt: current.endedAt,
      timezone: current.timezone,
      painLevel: current.painLevel,
      fatigue: current.fatigue,
      ...(current.note ? { note: current.note } : {}),
    },
    {
      title: submitted.title,
      source: submitted.source,
      exercises: submitted.exercises,
      startedAt: submitted.startedAt,
      endedAt: submitted.endedAt,
      timezone: submitted.timezone,
      painLevel: submitted.painLevel,
      fatigue: submitted.fatigue,
      ...(submitted.note ? { note: submitted.note } : {}),
    },
  )

export const mealMatchesSubmittedCorrection = (current: Meal, submitted: UpdateMeal) =>
  sameValue(
    {
      mealType: current.mealType,
      title: current.title,
      source: current.source,
      items: current.items.map(({ id: _id, summary: _summary, ...item }) => item),
      occurredAt: current.occurredAt,
      timezone: current.timezone,
      ...(current.note ? { note: current.note } : {}),
    },
    {
      mealType: submitted.mealType,
      title: submitted.title,
      source: submitted.source,
      items: submitted.items,
      occurredAt: submitted.occurredAt,
      timezone: submitted.timezone,
      ...(submitted.note ? { note: submitted.note } : {}),
    },
  )
