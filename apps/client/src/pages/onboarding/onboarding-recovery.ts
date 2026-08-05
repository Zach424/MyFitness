import type { OnboardingRequest, OnboardingResponse } from '@myfitness/contracts'

export type OnboardingFailureKind =
  'network_uncertain' | 'service_unavailable' | 'server_rejected' | 'unexpected'
export type OnboardingRecoveryAuthority = 'reconcile_required' | 'terminal'
export type OnboardingSaveEvidence = 'applied' | 'not_applied' | 'diverged'

export type OnboardingRecoveryReceipt = {
  authority: OnboardingRecoveryAuthority
  kind: OnboardingFailureKind
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

export const describeOnboardingSaveFailure = (error: unknown): OnboardingRecoveryReceipt => {
  const status = statusCode(error)
  if (status !== undefined && !retryableServerStatuses.has(status)) {
    return {
      authority: 'terminal',
      kind: 'server_rejected',
      eyebrow: 'SAVE REFUSED / 当前尝试已终止',
      message: `服务端明确拒绝了这次资料保存：${messageOf(error)}。本地输入仍在；关闭提示后可检查并重新决定。`,
      actionLabel: '关闭保存提示',
    }
  }

  const kind: OnboardingFailureKind =
    status !== undefined
      ? 'service_unavailable'
      : networkMarkers.some((marker) => messageOf(error).toLocaleLowerCase().includes(marker))
        ? 'network_uncertain'
        : 'unexpected'
  return {
    authority: 'reconcile_required',
    kind,
    eyebrow: 'PROFILE SAVE UNKNOWN / 禁止直接重放',
    message:
      '无法确认个人资料与目标是否保存成功。本地输入仍保留；页面会先读取当前资料底稿，不会自动重放 PUT。',
    actionLabel: '核对保存结果',
  }
}

export const describeOnboardingReconciliationFailure = (): OnboardingRecoveryReceipt => ({
  authority: 'reconcile_required',
  kind: 'service_unavailable',
  eyebrow: 'PROFILE RECHECK INCOMPLETE / 输入仍保留',
  message: '暂时无法读取当前资料底稿。不会重放保存；请恢复连接后再次核对。',
  actionLabel: '重新核对保存结果',
})

const sameArray = <T>(left: readonly T[], right: readonly T[]) =>
  left.length === right.length && left.every((value, index) => value === right[index])

const hasConsent = (
  current: OnboardingResponse,
  purpose: OnboardingResponse['consents'][number]['purpose'],
  version: string,
) => current.consents.some((consent) => consent.purpose === purpose && consent.version === version)

export const onboardingMatchesSubmitted = (
  current: OnboardingResponse,
  submitted: OnboardingRequest,
) =>
  current.profile.displayName === submitted.profile.displayName &&
  current.profile.ageBand === submitted.profile.ageBand &&
  current.profile.sexForCalculations === submitted.profile.sexForCalculations &&
  current.profile.displayHeight.value === submitted.profile.height.value &&
  current.profile.displayHeight.unit === submitted.profile.height.unit &&
  current.profile.unitSystem === submitted.profile.unitSystem &&
  current.profile.timezone === submitted.profile.timezone &&
  current.goal.primaryGoal === submitted.goal.primaryGoal &&
  current.goal.experience === submitted.goal.experience &&
  sameArray(current.goal.availableDays, submitted.goal.availableDays) &&
  current.goal.sessionMinutes === submitted.goal.sessionMinutes &&
  sameArray(current.goal.equipment, submitted.goal.equipment) &&
  sameArray(current.goal.dietaryPreferences, submitted.goal.dietaryPreferences) &&
  sameArray(current.eligibility.riskFlags, submitted.risk.flags) &&
  hasConsent(current, 'terms', submitted.consents.terms.version) &&
  hasConsent(current, 'privacy', submitted.consents.privacy.version) &&
  hasConsent(current, 'health_data', submitted.consents.healthData.version)

export const classifyOnboardingSaveEvidence = (
  baseRevision: number | null,
  current: OnboardingResponse | undefined,
  submitted: OnboardingRequest,
): OnboardingSaveEvidence => {
  if (!current) return baseRevision === null ? 'not_applied' : 'diverged'
  if (baseRevision !== null && current.revision === baseRevision) return 'not_applied'
  if (baseRevision !== null && current.revision < baseRevision) return 'diverged'
  return onboardingMatchesSubmitted(current, submitted) ? 'applied' : 'diverged'
}
