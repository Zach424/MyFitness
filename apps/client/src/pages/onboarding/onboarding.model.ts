import type { OnboardingRequest, RiskFlag } from '@myfitness/contracts'
import { consentVersions } from '@myfitness/contracts/onboarding.constants'

export type OnboardingDraft = {
  displayName: string
  ageBand: OnboardingRequest['profile']['ageBand']
  sexForCalculations: OnboardingRequest['profile']['sexForCalculations']
  height: string
  unitSystem: OnboardingRequest['profile']['unitSystem']
  primaryGoal: OnboardingRequest['goal']['primaryGoal']
  experience: OnboardingRequest['goal']['experience']
  availableDays: OnboardingRequest['goal']['availableDays']
  sessionMinutes: number
  equipment: OnboardingRequest['goal']['equipment']
  dietaryPreferences: OnboardingRequest['goal']['dietaryPreferences']
  riskFlags: RiskFlag[]
  adultConfirmed: boolean
  termsAccepted: boolean
  privacyAccepted: boolean
  healthDataAccepted: boolean
}

export const initialDraft: OnboardingDraft = {
  displayName: '',
  ageBand: '25_34',
  sexForCalculations: 'unspecified',
  height: '170',
  unitSystem: 'metric',
  primaryGoal: 'fitness',
  experience: 'beginner',
  availableDays: ['mon', 'wed', 'fri'],
  sessionMinutes: 45,
  equipment: ['bodyweight'],
  dietaryPreferences: ['none'],
  riskFlags: [],
  adultConfirmed: false,
  termsAccepted: false,
  privacyAccepted: false,
  healthDataAccepted: false,
}

export const toggleSelection = <T>(items: T[], item: T, allowEmpty = false) => {
  if (items.includes(item)) {
    return items.length === 1 && !allowEmpty ? items : items.filter((current) => current !== item)
  }
  return [...items, item]
}

const getTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
  } catch {
    return 'Asia/Shanghai'
  }
}

export const validateStep = (draft: OnboardingDraft, step: number) => {
  if (step === 0) {
    if (!draft.displayName.trim()) return '请填写称呼'
    const height = Number(draft.height)
    const min = draft.unitSystem === 'metric' ? 100 : 39.37
    const max = draft.unitSystem === 'metric' ? 250 : 98.43
    if (!Number.isFinite(height) || height < min || height > max) return '请填写合理的身高'
  }
  if (step === 1) {
    if (draft.availableDays.length === 0) return '请至少选择一个可训练日'
    if (draft.equipment.length === 0) return '请至少选择一种可用器械'
  }
  if (step === 2) {
    if (!draft.adultConfirmed) return '本版本仅供已满 18 周岁的成年人使用'
    if (!draft.termsAccepted || !draft.privacyAccepted || !draft.healthDataAccepted) {
      return '请阅读并同意服务、隐私和健康数据说明'
    }
  }
  return ''
}

export const buildOnboardingRequest = (
  draft: OnboardingDraft,
  expectedRevision?: number,
): OnboardingRequest => {
  const validationError = [0, 1, 2].map((step) => validateStep(draft, step)).find(Boolean)
  if (validationError) throw new Error(validationError)

  return {
    adultConfirmed: true,
    profile: {
      displayName: draft.displayName.trim(),
      ageBand: draft.ageBand,
      sexForCalculations: draft.sexForCalculations,
      height: {
        value: Number(draft.height),
        unit: draft.unitSystem === 'metric' ? 'cm' : 'in',
      },
      unitSystem: draft.unitSystem,
      timezone: getTimezone(),
    },
    goal: {
      primaryGoal: draft.primaryGoal,
      experience: draft.experience,
      availableDays: draft.availableDays,
      sessionMinutes: draft.sessionMinutes,
      equipment: draft.equipment,
      dietaryPreferences: draft.dietaryPreferences,
    },
    risk: { flags: draft.riskFlags, acknowledged: true },
    consents: {
      terms: { accepted: true, version: consentVersions.terms },
      privacy: { accepted: true, version: consentVersions.privacy },
      healthData: { accepted: true, version: consentVersions.healthData },
    },
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
  }
}
