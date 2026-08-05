export type WorkbenchOperation =
  | 'action_create'
  | 'action_update'
  | 'action_archive'
  | 'food_create'
  | 'food_update'
  | 'food_archive'
  | 'photo_reserve'
  | 'photo_upload'
  | 'photo_confirm'
  | 'photo_delete'
  | 'progress_reserve'
  | 'progress_upload'
  | 'progress_delete'
  | 'plan_generate'
  | 'plan_accept'
  | 'plan_modify'
  | 'plan_skip'
  | 'plan_link'
  | 'plan_unlink'
  | 'plan_explain'

export type WorkbenchRecoveryAuthority = 'retry_same_request' | 'reconcile_required' | 'terminal'

export type WorkbenchFailureKind =
  'network_uncertain' | 'service_unavailable' | 'server_rejected' | 'unexpected'

export type WorkbenchRecovery = {
  operation: WorkbenchOperation
  authority: WorkbenchRecoveryAuthority
  failureKind: WorkbenchFailureKind
  eyebrow: string
  message: string
  actionLabel: string
  preserves:
    | 'definition_input'
    | 'review_input'
    | 'capture_intent'
    | 'decision_input'
    | 'link_intent'
    | 'explanation_intent'
    | 'none'
}

type OperationPolicy = {
  label: string
  uncertainAuthority: Exclude<WorkbenchRecoveryAuthority, 'terminal'>
  preserves: WorkbenchRecovery['preserves']
}

export const workbenchOperationPolicies: Record<WorkbenchOperation, OperationPolicy> = {
  action_create: {
    label: '动作定义新建',
    uncertainAuthority: 'retry_same_request',
    preserves: 'definition_input',
  },
  action_update: {
    label: '动作定义纠正',
    uncertainAuthority: 'reconcile_required',
    preserves: 'definition_input',
  },
  action_archive: {
    label: '动作停用',
    uncertainAuthority: 'reconcile_required',
    preserves: 'none',
  },
  food_create: {
    label: '食物定义新建',
    uncertainAuthority: 'retry_same_request',
    preserves: 'definition_input',
  },
  food_update: {
    label: '食物定义纠正',
    uncertainAuthority: 'reconcile_required',
    preserves: 'definition_input',
  },
  food_archive: {
    label: '食物定义归档',
    uncertainAuthority: 'reconcile_required',
    preserves: 'none',
  },
  photo_reserve: {
    label: '照片预约',
    uncertainAuthority: 'retry_same_request',
    preserves: 'none',
  },
  photo_upload: {
    label: '照片上传与分析',
    uncertainAuthority: 'reconcile_required',
    preserves: 'none',
  },
  photo_confirm: {
    label: '照片候选确认',
    uncertainAuthority: 'reconcile_required',
    preserves: 'review_input',
  },
  photo_delete: {
    label: '照片候选删除',
    uncertainAuthority: 'reconcile_required',
    preserves: 'none',
  },
  progress_reserve: {
    label: '进度照预约',
    uncertainAuthority: 'retry_same_request',
    preserves: 'capture_intent',
  },
  progress_upload: {
    label: '进度照上传与画质检查',
    uncertainAuthority: 'reconcile_required',
    preserves: 'capture_intent',
  },
  progress_delete: {
    label: '进度照删除',
    uncertainAuthority: 'reconcile_required',
    preserves: 'none',
  },
  plan_generate: {
    label: '周计划生成或刷新',
    uncertainAuthority: 'reconcile_required',
    preserves: 'none',
  },
  plan_accept: {
    label: '周计划采用',
    uncertainAuthority: 'reconcile_required',
    preserves: 'none',
  },
  plan_modify: {
    label: '周计划替代动作保存',
    uncertainAuthority: 'reconcile_required',
    preserves: 'decision_input',
  },
  plan_skip: {
    label: '周计划跳过',
    uncertainAuthority: 'reconcile_required',
    preserves: 'none',
  },
  plan_link: {
    label: '计划日与实际训练关联',
    uncertainAuthority: 'reconcile_required',
    preserves: 'link_intent',
  },
  plan_unlink: {
    label: '计划与实际训练解除关联',
    uncertainAuthority: 'reconcile_required',
    preserves: 'link_intent',
  },
  plan_explain: {
    label: 'AI 计划解释运行',
    uncertainAuthority: 'reconcile_required',
    preserves: 'explanation_intent',
  },
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

const failureKindOf = (error: unknown): WorkbenchFailureKind => {
  const status = statusCode(error)
  if (status !== undefined) {
    return retryableServerStatuses.has(status) ? 'service_unavailable' : 'server_rejected'
  }
  const message = messageOf(error).toLocaleLowerCase()
  if (networkMarkers.some((marker) => message.includes(marker))) return 'network_uncertain'
  return 'unexpected'
}

export const describeWorkbenchFailure = (
  operation: WorkbenchOperation,
  error: unknown,
): WorkbenchRecovery => {
  const policy = workbenchOperationPolicies[operation]
  const failureKind = failureKindOf(error)

  if (failureKind === 'server_rejected') {
    return {
      operation,
      authority: 'terminal',
      failureKind,
      eyebrow: 'REQUEST REFUSED / 当前尝试已终止',
      message: `服务端明确拒绝了${policy.label}：${messageOf(error)}。这不代表操作成功，也不会自动重放；请按提示检查后重新开始。`,
      actionLabel: '检查当前输入',
      preserves: policy.preserves,
    }
  }

  if (policy.uncertainAuthority === 'retry_same_request') {
    const isReservation = operation === 'photo_reserve' || operation === 'progress_reserve'
    const subject = isReservation ? '预约' : '定义'
    return {
      operation,
      authority: 'retry_same_request',
      failureKind,
      eyebrow: 'SAME REQUEST / 仅同一请求可重试',
      message: `无法确认这次${policy.label}是否已提交。页面不保存照片或后台排队；仅在输入未变化时沿用同一请求编号重试，服务端只保留一笔${subject}。`,
      actionLabel: isReservation
        ? '重新选择并重试预约'
        : operation === 'food_create'
          ? '重试保存食物定义（防重复）'
          : '重试保存定义（防重复）',
      preserves: policy.preserves,
    }
  }

  return {
    operation,
    authority: 'reconcile_required',
    failureKind,
    eyebrow: 'RECONCILE FIRST / 禁止直接重放',
    message: `无法确认${policy.label}的服务端结果。必须先读取当前状态；核对前不会重放操作，也不会把未知结果报告为成功。`,
    actionLabel: '核对服务端状态',
    preserves: policy.preserves,
  }
}
