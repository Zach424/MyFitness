import { useEffect, useRef, useState } from 'react'
import { Button, Input, ScrollView, Switch, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import {
  ageBands,
  equipmentOptions,
  experienceLevels,
  primaryGoals,
  riskFlags,
  sexForCalculationOptions,
  weekdays,
} from '@myfitness/contracts/onboarding.constants'
import type { OnboardingRequest, OnboardingResponse } from '@myfitness/contracts'

import { ApiError, apiBaseUrl, getOnboarding, saveOnboarding } from '../../lib/api'
import { buttonA11yProps, buttonActivationProps, deferH5Focus } from '../../lib/accessibility'
import {
  classifyRegisterReadFailure,
  registerReadPhase,
  type RegisterReadFailureKind,
} from '../../lib/register-read'
import {
  buildOnboardingRequest,
  initialDraft,
  onboardingAuthorityMatchesBase,
  onboardingReadFailureCopy,
  toggleSelection,
  validateStep,
  type OnboardingDraft,
} from './onboarding.model'
import {
  classifyOnboardingSaveEvidence,
  describeOnboardingReconciliationFailure,
  describeOnboardingSaveFailure,
  type OnboardingRecoveryReceipt,
} from './onboarding-recovery'
import './index.scss'

const labels = {
  ageBand: {
    '18_24': '18–24',
    '25_34': '25–34',
    '35_44': '35–44',
    '45_54': '45–54',
    '55_64': '55–64',
    '65_plus': '65+',
  },
  sex: { female: '女性', male: '男性', unspecified: '暂不说明' },
  goal: { fat_loss: '减脂', muscle_gain: '增肌', fitness: '提升体能', habit: '养成习惯' },
  experience: { beginner: '刚开始', intermediate: '有规律训练', advanced: '长期训练' },
  weekday: { mon: '一', tue: '二', wed: '三', thu: '四', fri: '五', sat: '六', sun: '日' },
  equipment: {
    bodyweight: '徒手',
    dumbbells: '哑铃',
    barbell: '杠铃',
    machines: '固定器械',
    bands: '弹力带',
    cardio: '有氧器械',
  },
  risk: {
    chest_pain: '运动时胸部不适',
    fainting: '近期晕厥或严重眩晕',
    uncontrolled_condition: '未稳定控制的健康状况',
    acute_injury: '急性伤病或术后恢复期',
    pregnancy: '孕期或产后恢复期',
    eating_disorder_history: '进食障碍相关经历',
  },
} as const

const stepMeta = [
  { eyebrow: '01 / BASICS', title: '先认识你', body: '这些信息只用于单位显示和基础估算。' },
  { eyebrow: '02 / RHYTHM', title: '找到可持续节奏', body: '计划会优先服从你的时间和现有条件。' },
  {
    eyebrow: '03 / SAFETY',
    title: '安全边界与授权',
    body: '筛查不是诊断，只决定规划流程是否需要暂停。',
  },
] as const

const authorityMeta = {
  eyebrow: 'PROFILE REGISTER / 资料底稿',
  title: '先确认资料底稿',
  body: '只有服务确认当前资料或明确尚未建档后，页面才会显示并允许保存个人信息。',
} as const

const consentItems: ReadonlyArray<{
  key: 'adultConfirmed' | 'termsAccepted' | 'privacyAccepted' | 'healthDataAccepted'
  label: string
}> = [
  { key: 'adultConfirmed', label: '我确认已满 18 周岁' },
  { key: 'termsAccepted', label: '我已阅读并同意服务条款' },
  { key: 'privacyAccepted', label: '我已阅读隐私说明' },
  { key: 'healthDataAccepted', label: '我同意为记录和规划处理健康数据' },
]

const Chip = ({
  selected,
  label,
  onClick,
  disabled = false,
}: {
  selected: boolean
  label: string
  onClick: () => void
  disabled?: boolean
}) => (
  <Button
    {...buttonActivationProps(onClick, disabled)}
    className={`choice-chip ${selected ? 'choice-chip--selected' : ''}`}
    disabled={disabled}
    aria-pressed={selected}
  >
    {label}
  </Button>
)

const hydrateDraft = (profile: OnboardingResponse): OnboardingDraft => ({
  ...initialDraft,
  displayName: profile.profile.displayName,
  ageBand: profile.profile.ageBand,
  sexForCalculations: profile.profile.sexForCalculations,
  height: String(profile.profile.displayHeight.value),
  unitSystem: profile.profile.unitSystem,
  primaryGoal: profile.goal.primaryGoal,
  experience: profile.goal.experience,
  availableDays: profile.goal.availableDays,
  sessionMinutes: profile.goal.sessionMinutes,
  equipment: profile.goal.equipment,
  dietaryPreferences: profile.goal.dietaryPreferences,
  riskFlags: profile.eligibility.riskFlags,
  adultConfirmed: true,
  termsAccepted: true,
  privacyAccepted: true,
  healthDataAccepted: true,
})

const OnboardingPage = () => {
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<OnboardingDraft>(initialDraft)
  const [acceptedProfile, setAcceptedProfile] = useState<OnboardingResponse | null>()
  const [draftBaseRevision, setDraftBaseRevision] = useState<number | null>()
  const [draftDirty, setDraftDirty] = useState(false)
  const [draftOutdated, setDraftOutdated] = useState(false)
  const [readFailure, setReadFailure] = useState<RegisterReadFailureKind>()
  const [message, setMessage] = useState('')
  const [readBusy, setReadBusy] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveRecoveryBusy, setSaveRecoveryBusy] = useState(false)
  const [saveRecovery, setSaveRecovery] = useState<{
    baseRevision: number | null
    submitted: OnboardingRequest
    receipt: OnboardingRecoveryReceipt
  }>()
  const [result, setResult] = useState<OnboardingResponse>()
  const pageActive = useRef(true)
  const readInFlight = useRef(false)
  const acceptedProfileRef = useRef<OnboardingResponse | null>()
  const draftBaseRevisionRef = useRef<number | null>()
  const draftDirtyRef = useRef(false)

  const publishAuthority = (existing: OnboardingResponse | undefined) => {
    const accepted = existing ?? null
    const currentRevision = existing?.revision ?? null
    const hasLocalEdits = draftDirtyRef.current
    acceptedProfileRef.current = accepted
    setAcceptedProfile(accepted)
    setReadFailure(undefined)

    if (!hasLocalEdits) {
      const nextDraft = existing ? hydrateDraft(existing) : initialDraft
      draftBaseRevisionRef.current = currentRevision
      draftDirtyRef.current = false
      setDraft(nextDraft)
      setDraftBaseRevision(currentRevision)
      setDraftDirty(false)
      setDraftOutdated(false)
      return
    }

    setDraftOutdated(!onboardingAuthorityMatchesBase(currentRevision, draftBaseRevisionRef.current))
  }

  const loadProfileAuthority = async (focusOnFailure = true) => {
    if (readInFlight.current) return false
    const hadSnapshot = acceptedProfileRef.current !== undefined
    readInFlight.current = true
    setReadBusy(true)
    setReadFailure(undefined)
    try {
      const existing = await getOnboarding()
      if (!pageActive.current) return false
      publishAuthority(existing)
      if (!hadSnapshot) deferH5Focus('onboarding-close', 350)
      return true
    } catch (error) {
      if (!pageActive.current) return false
      setReadFailure(classifyRegisterReadFailure(error))
      if (focusOnFailure) deferH5Focus('onboarding-read-retry', hadSnapshot ? 80 : 500)
      return false
    } finally {
      readInFlight.current = false
      if (pageActive.current) setReadBusy(false)
    }
  }

  useEffect(() => {
    pageActive.current = true
    void loadProfileAuthority()
    return () => {
      pageActive.current = false
    }
  }, [])

  const patchDraft = (patch: Partial<OnboardingDraft>) => {
    if (saving || saveRecovery) return
    setDraft((current) => ({ ...current, ...patch }))
    draftDirtyRef.current = true
    setDraftDirty(true)
    setMessage('')
    setResult(undefined)
  }

  const loadAcceptedDraft = () => {
    if (acceptedProfile === undefined) return
    const currentRevision = acceptedProfile?.revision ?? null
    const nextDraft = acceptedProfile ? hydrateDraft(acceptedProfile) : initialDraft
    draftBaseRevisionRef.current = currentRevision
    draftDirtyRef.current = false
    setDraft(nextDraft)
    setDraftBaseRevision(currentRevision)
    setDraftDirty(false)
    setDraftOutdated(false)
    setResult(undefined)
    setMessage('已载入最新底稿；刚才未提交的本地修改已由你明确放弃。')
    setStep(0)
    deferH5Focus('onboarding-display-name', 80)
  }

  const advance = () => {
    const validationError = validateStep(draft, step)
    if (validationError) {
      setMessage(validationError)
      return
    }
    setMessage('')
    setStep((current) => Math.min(2, current + 1))
  }

  const submit = async () => {
    if (
      readBusy ||
      readFailure !== undefined ||
      acceptedProfile === undefined ||
      draftBaseRevision === undefined ||
      draftOutdated ||
      saveRecovery
    ) {
      setMessage(
        saveRecovery
          ? '请先核对上一次保存结果；页面不会用新的 PUT 覆盖未知结果。'
          : '请先重新核对当前资料底稿；保存不会使用未知或过期的修订。',
      )
      deferH5Focus(saveRecovery ? 'onboarding-save-recovery' : 'onboarding-read-retry')
      return
    }
    const validationError = validateStep(draft, 2)
    if (validationError) {
      setMessage(validationError)
      return
    }
    setSaving(true)
    setMessage('')
    setResult(undefined)
    const submitted = buildOnboardingRequest(draft, draftBaseRevision ?? undefined)
    try {
      const saved = await saveOnboarding(submitted)
      acceptedProfileRef.current = saved
      draftBaseRevisionRef.current = saved.revision
      draftDirtyRef.current = false
      setAcceptedProfile(saved)
      setDraftBaseRevision(saved.revision)
      setDraftDirty(false)
      setDraftOutdated(false)
      setReadFailure(undefined)
      setResult(saved)
      setMessage(
        saved.eligibility.status === 'eligible'
          ? '资料已保存，可以继续建立记录和训练计划。'
          : '资料已保存。为安全起见，个性化训练规划会先暂停，请取得医生或合格专业人员许可。',
      )
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 409) {
        setMessage('资料已在其他位置更新。你的本地修改仍保留；请更新底稿后再决定如何填写。')
        const refreshed = await loadProfileAuthority()
        if (refreshed) deferH5Focus('onboarding-load-accepted', 80)
      } else {
        draftDirtyRef.current = true
        setDraftDirty(true)
        setSaveRecovery({
          baseRevision: draftBaseRevision,
          submitted,
          receipt: describeOnboardingSaveFailure(error),
        })
        setMessage('')
        deferH5Focus('onboarding-save-recovery', 80)
      }
    } finally {
      setSaving(false)
    }
  }

  const reconcileSave = async () => {
    if (!saveRecovery || saveRecoveryBusy) return
    if (saveRecovery.receipt.authority === 'terminal') {
      setSaveRecovery(undefined)
      setMessage('服务端明确没有接受上一次保存；本地输入仍保留。')
      deferH5Focus(step === 2 ? 'onboarding-save' : 'onboarding-display-name', 80)
      return
    }

    const pending = saveRecovery
    setSaveRecoveryBusy(true)
    setMessage('')
    try {
      const current = await getOnboarding()
      if (!pageActive.current) return
      const evidence = classifyOnboardingSaveEvidence(
        pending.baseRevision,
        current,
        pending.submitted,
      )

      if (evidence === 'applied' && current) {
        acceptedProfileRef.current = current
        draftBaseRevisionRef.current = current.revision
        draftDirtyRef.current = false
        setAcceptedProfile(current)
        setDraftBaseRevision(current.revision)
        setDraftDirty(false)
        setDraftOutdated(false)
        setReadFailure(undefined)
        setSaveRecovery(undefined)
        setResult(current)
        setMessage(
          current.eligibility.status === 'eligible'
            ? `已从当前资料 v${current.revision} 确认上一次资料与目标保存完成。`
            : `已从当前资料 v${current.revision} 确认保存完成；专业许可安全边界继续生效。`,
        )
        deferH5Focus('onboarding-read-refresh', 80)
        return
      }

      publishAuthority(current)
      setSaveRecovery(undefined)
      setResult(undefined)
      if (evidence === 'not_applied') {
        setMessage(
          current
            ? `当前仍是资料 v${current.revision}，没有上一次保存已落库的证据。如仍需保存，请再次明确点击。`
            : '服务仍确认当前尚未建档，没有上一次保存已落库的证据。如仍需保存，请再次明确点击。',
        )
        deferH5Focus(step === 2 ? 'onboarding-save' : 'onboarding-display-name', 80)
        return
      }

      setMessage(
        current
          ? `当前资料已是 v${current.revision}，但资料、目标、风险标记或同意版本与上次提交不完全一致。本地输入仍保留；请明确载入当前底稿后再编辑。`
          : '当前资料已不存在，与上次提交依据不一致。本地输入仍保留；请明确载入当前未建档状态后再编辑。',
      )
      deferH5Focus('onboarding-load-accepted', 80)
    } catch {
      if (!pageActive.current) return
      setSaveRecovery({
        ...pending,
        receipt: describeOnboardingReconciliationFailure(),
      })
      deferH5Focus('onboarding-save-recovery', 80)
    } finally {
      if (pageActive.current) setSaveRecoveryBusy(false)
    }
  }

  const hasReadSnapshot = acceptedProfile !== undefined
  const readPhase = registerReadPhase({
    hasSnapshot: hasReadSnapshot,
    busy: readBusy,
    hasFailure: readFailure !== undefined,
  })
  const readFailurePresentation = readFailure
    ? onboardingReadFailureCopy(readFailure, hasReadSnapshot)
    : undefined
  const acceptedRevision = acceptedProfile?.revision ?? null
  const authorityMatchesDraft = onboardingAuthorityMatchesBase(acceptedRevision, draftBaseRevision)
  const canSubmit =
    !saving &&
    !saveRecovery &&
    !saveRecoveryBusy &&
    readPhase === 'ready' &&
    authorityMatchesDraft &&
    !draftOutdated
  const editorLocked = saving || saveRecoveryBusy || Boolean(saveRecovery)
  const authorityLabel = saveRecovery
    ? acceptedProfile
      ? `待核对保存 · 提交基于资料 v${saveRecovery.baseRevision ?? 0}`
      : '待核对保存 · 提交基于尚未建档'
    : readPhase === 'ready'
      ? acceptedProfile
        ? `已确认底稿 · 资料 v${acceptedProfile.revision}`
        : '已确认底稿 · 当前尚未建档'
      : acceptedProfile
        ? `保留底稿 · 资料 v${acceptedProfile.revision}`
        : '保留底稿 · 上次确认尚未建档'
  const retainedLabel = acceptedProfile
    ? `保留底稿 · 资料 v${acceptedProfile.revision}`
    : '保留底稿 · 已确认尚未建档'
  const meta = hasReadSnapshot ? stepMeta[step]! : authorityMeta

  return (
    <View className="onboarding-page">
      <ScrollView className="onboarding-scroll" scrollY enhanced showScrollbar={false}>
        <View className="onboarding-shell">
          <View className="onboarding-topbar">
            <View className="mini-wordmark">
              <Text className="mini-wordmark__cn">衡迹</Text>
              <Text className="mini-wordmark__en">PROFILE NOTE</Text>
            </View>
            <Button
              {...buttonA11yProps}
              id="onboarding-close"
              className="close-action"
              aria-label="返回今天"
              onClick={() => void Taro.navigateBack()}
            >
              ×
            </Button>
          </View>

          {hasReadSnapshot ? (
            <View
              className="onboarding-progress"
              aria-label={`建档进度，第 ${step + 1} 步，共 3 步`}
            >
              {[0, 1, 2].map((item) => (
                <View
                  className={`onboarding-progress__bar ${item <= step ? 'onboarding-progress__bar--active' : ''}`}
                  key={item}
                />
              ))}
            </View>
          ) : (
            <View
              className="onboarding-progress onboarding-progress--authority"
              aria-hidden="true"
            />
          )}

          <View className="onboarding-layout">
            <View className="onboarding-main">
              <View className="onboarding-heading">
                <Text className="onboarding-heading__eyebrow">{meta.eyebrow}</Text>
                <Text className="onboarding-heading__title">{meta.title}</Text>
                <Text className="onboarding-heading__body">{meta.body}</Text>
              </View>

              {hasReadSnapshot ? (
                <View className="profile-authority-toolbar">
                  <View className="profile-authority-toolbar__summary">
                    <Text className="profile-authority-toolbar__eyebrow">
                      PROFILE BASE / 保存依据
                    </Text>
                    <Text className="profile-authority-toolbar__label">
                      {authorityLabel}
                      {draftDirty ? ' · 有未提交修改' : ''}
                    </Text>
                  </View>
                  <Button
                    {...buttonActivationProps(
                      () => void loadProfileAuthority(),
                      readBusy || saving || Boolean(saveRecovery),
                    )}
                    id="onboarding-read-refresh"
                    className="profile-authority-toolbar__action"
                  >
                    {readBusy ? '核对中…' : '更新底稿'}
                  </Button>
                </View>
              ) : null}

              {readPhase === 'initial-loading' ? (
                <View
                  className="profile-authority-state profile-authority-state--loading"
                  role="status"
                >
                  <Text className="profile-authority-state__eyebrow">
                    CHECKING PROFILE REGISTER
                  </Text>
                  <Text className="profile-authority-state__title">正在核对个人资料底稿</Text>
                  <Text className="profile-authority-state__copy">
                    完整读取或明确未建档响应返回前，不会显示起始选项，也不会开放保存。
                  </Text>
                </View>
              ) : null}

              {readPhase === 'refreshing' ? (
                <View
                  className="profile-authority-state profile-authority-state--refreshing"
                  role="status"
                >
                  <Text className="profile-authority-state__eyebrow">
                    CHECKING PROFILE BASE / 保留本地修改
                  </Text>
                  <Text className="profile-authority-state__title">正在复核个人资料底稿</Text>
                  <Text className="profile-authority-state__copy">
                    上次核对的资料和未提交修改继续显示；完成前不会替换草稿，也不会授权保存。
                  </Text>
                  <Text className="profile-authority-state__retained metric">{retainedLabel}</Text>
                </View>
              ) : null}

              {readFailurePresentation ? (
                <View className="profile-authority-state" role="status">
                  <Text className="profile-authority-state__eyebrow">
                    {readFailurePresentation.eyebrow}
                  </Text>
                  <Text className="profile-authority-state__title">
                    {readFailurePresentation.title}
                  </Text>
                  <Text className="profile-authority-state__copy">
                    {readFailurePresentation.detail}
                  </Text>
                  {hasReadSnapshot ? (
                    <Text className="profile-authority-state__retained metric">
                      {retainedLabel}
                    </Text>
                  ) : null}
                  <Button
                    {...buttonActivationProps(() => void loadProfileAuthority())}
                    id="onboarding-read-retry"
                    className="profile-authority-state__action"
                  >
                    重新核对
                  </Button>
                </View>
              ) : null}

              {acceptedProfile === null ? (
                <View className="profile-authority-empty" role="status">
                  <Text className="profile-authority-empty__title">
                    {readPhase === 'ready'
                      ? '服务已确认：当前尚未建档'
                      : '保留底稿：上次核对时尚未建档'}
                  </Text>
                  <Text className="profile-authority-empty__copy">
                    下方年龄、目标与节奏只是起始草稿，不是你的已确认事实；只有在当前底稿核对成功后保存，才会成为资料。
                  </Text>
                </View>
              ) : null}

              {draftOutdated ? (
                <View className="profile-authority-drift" role="status">
                  <Text className="profile-authority-drift__title">本地修改基于较早的资料修订</Text>
                  <Text className="profile-authority-drift__copy">
                    为避免覆盖其他位置的更新，保存保持冻结。你的修改仍在本页；只有下面的明确操作会放弃它们并载入最新底稿。
                  </Text>
                  <Button
                    {...buttonActivationProps(
                      loadAcceptedDraft,
                      readBusy || readFailure !== undefined,
                    )}
                    id="onboarding-load-accepted"
                    className="profile-authority-drift__action"
                    disabled={readBusy || readFailure !== undefined}
                  >
                    放弃本地修改并载入最新底稿
                  </Button>
                </View>
              ) : null}

              {hasReadSnapshot && step === 0 ? (
                <View className="form-card">
                  <View className="field">
                    <Text className="field__label">怎么称呼你</Text>
                    <Input
                      id="onboarding-display-name"
                      className="text-input"
                      maxlength={40}
                      placeholder="例如：小陈"
                      value={draft.displayName}
                      disabled={editorLocked}
                      onInput={(event) => patchDraft({ displayName: event.detail.value })}
                    />
                  </View>

                  <View className="field">
                    <Text className="field__label">年龄段</Text>
                    <View className="choice-grid choice-grid--three">
                      {ageBands.map((item) => (
                        <Chip
                          key={item}
                          disabled={editorLocked}
                          label={labels.ageBand[item]}
                          selected={draft.ageBand === item}
                          onClick={() => patchDraft({ ageBand: item })}
                        />
                      ))}
                    </View>
                  </View>

                  <View className="field">
                    <Text className="field__label">用于代谢估算的生理性别</Text>
                    <Text className="field__hint">你可以选择暂不说明；这不会限制记录功能。</Text>
                    <View className="choice-grid choice-grid--three">
                      {sexForCalculationOptions.map((item) => (
                        <Chip
                          key={item}
                          disabled={editorLocked}
                          label={labels.sex[item]}
                          selected={draft.sexForCalculations === item}
                          onClick={() => patchDraft({ sexForCalculations: item })}
                        />
                      ))}
                    </View>
                  </View>

                  <View className="field field--split">
                    <View className="field__grow">
                      <Text className="field__label">身高</Text>
                      <View className="number-input-wrap">
                        <Input
                          className="text-input text-input--number"
                          type="digit"
                          value={draft.height}
                          disabled={editorLocked}
                          onInput={(event) => patchDraft({ height: event.detail.value })}
                        />
                        <Text className="number-input-wrap__unit">
                          {draft.unitSystem === 'metric' ? 'cm' : 'in'}
                        </Text>
                      </View>
                    </View>
                    <View className="unit-toggle">
                      <Chip
                        disabled={editorLocked}
                        label="公制"
                        selected={draft.unitSystem === 'metric'}
                        onClick={() => patchDraft({ unitSystem: 'metric', height: '170' })}
                      />
                      <Chip
                        disabled={editorLocked}
                        label="英制"
                        selected={draft.unitSystem === 'imperial'}
                        onClick={() => patchDraft({ unitSystem: 'imperial', height: '67' })}
                      />
                    </View>
                  </View>
                </View>
              ) : null}

              {hasReadSnapshot && step === 1 ? (
                <View className="form-card">
                  <View className="field">
                    <Text className="field__label">当前最重要的目标</Text>
                    <View className="choice-grid choice-grid--two">
                      {primaryGoals.map((item) => (
                        <Chip
                          key={item}
                          disabled={editorLocked}
                          label={labels.goal[item]}
                          selected={draft.primaryGoal === item}
                          onClick={() => patchDraft({ primaryGoal: item })}
                        />
                      ))}
                    </View>
                  </View>

                  <View className="field">
                    <Text className="field__label">训练经验</Text>
                    <View className="choice-grid choice-grid--three">
                      {experienceLevels.map((item) => (
                        <Chip
                          key={item}
                          disabled={editorLocked}
                          label={labels.experience[item]}
                          selected={draft.experience === item}
                          onClick={() => patchDraft({ experience: item })}
                        />
                      ))}
                    </View>
                  </View>

                  <View className="field">
                    <View className="field__row">
                      <Text className="field__label">每周可训练日</Text>
                      <Text className="field__value">{draft.availableDays.length} 天</Text>
                    </View>
                    <View className="weekday-grid">
                      {weekdays.map((item) => (
                        <Chip
                          key={item}
                          disabled={editorLocked}
                          label={labels.weekday[item]}
                          selected={draft.availableDays.includes(item)}
                          onClick={() =>
                            patchDraft({
                              availableDays: toggleSelection(draft.availableDays, item),
                            })
                          }
                        />
                      ))}
                    </View>
                  </View>

                  <View className="field">
                    <View className="field__row">
                      <Text className="field__label">单次时长</Text>
                      <Text className="field__value metric">{draft.sessionMinutes} min</Text>
                    </View>
                    <View className="choice-grid choice-grid--three">
                      {[30, 45, 60].map((minutes) => (
                        <Chip
                          key={minutes}
                          disabled={editorLocked}
                          label={`${minutes} 分钟`}
                          selected={draft.sessionMinutes === minutes}
                          onClick={() => patchDraft({ sessionMinutes: minutes })}
                        />
                      ))}
                    </View>
                  </View>

                  <View className="field">
                    <Text className="field__label">可用器械</Text>
                    <View className="choice-grid choice-grid--three">
                      {equipmentOptions.map((item) => (
                        <Chip
                          key={item}
                          disabled={editorLocked}
                          label={labels.equipment[item]}
                          selected={draft.equipment.includes(item)}
                          onClick={() =>
                            patchDraft({ equipment: toggleSelection(draft.equipment, item) })
                          }
                        />
                      ))}
                    </View>
                  </View>
                </View>
              ) : null}

              {hasReadSnapshot && step === 2 ? (
                <View className="form-card">
                  <View className="screening-note">
                    <Text className="screening-note__mark">!</Text>
                    <View>
                      <Text className="screening-note__title">以下项目只用于设置安全边界</Text>
                      <Text className="screening-note__body">
                        选择任一项目不会生成诊断；系统会暂停自动训练处方，提示先咨询医生或合格专业人员。
                      </Text>
                    </View>
                  </View>

                  <View className="field">
                    <Text className="field__label">目前是否存在以下情况（可多选）</Text>
                    <View className="risk-list">
                      {riskFlags.map((item) => (
                        <Chip
                          key={item}
                          disabled={editorLocked}
                          label={labels.risk[item]}
                          selected={draft.riskFlags.includes(item)}
                          onClick={() =>
                            patchDraft({ riskFlags: toggleSelection(draft.riskFlags, item, true) })
                          }
                        />
                      ))}
                    </View>
                    {draft.riskFlags.length === 0 ? (
                      <Text className="clear-state">当前未选择风险项</Text>
                    ) : (
                      <Text className="clearance-state">将标记为“需先取得专业许可”</Text>
                    )}
                  </View>

                  <View className="consent-list">
                    {consentItems.map(({ key, label }) => (
                      <View className="consent-row" key={key}>
                        <Text>{label}</Text>
                        <Switch
                          checked={Boolean(draft[key as keyof OnboardingDraft])}
                          color="var(--color-juniper)"
                          disabled={editorLocked}
                          onChange={(event) =>
                            patchDraft({ [key]: event.detail.value } as Partial<OnboardingDraft>)
                          }
                        />
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {saveRecovery ? (
                <View
                  className={`profile-save-recovery profile-save-recovery--${saveRecovery.receipt.kind}`}
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <Text className="profile-save-recovery__eyebrow">
                    {saveRecovery.receipt.eyebrow}
                  </Text>
                  <Text className="profile-save-recovery__copy">
                    {saveRecovery.receipt.message}
                  </Text>
                  <Text className="profile-save-recovery__base metric">
                    {saveRecovery.baseRevision === null
                      ? 'SUBMITTED BASE · 尚未建档'
                      : `SUBMITTED BASE · 资料 v${saveRecovery.baseRevision}`}
                  </Text>
                  <Button
                    id="onboarding-save-recovery"
                    className="profile-save-recovery__action"
                    {...buttonActivationProps(() => void reconcileSave(), saveRecoveryBusy)}
                  >
                    {saveRecoveryBusy ? '正在核对…' : saveRecovery.receipt.actionLabel}
                  </Button>
                </View>
              ) : null}

              <View
                className={`form-message ${result ? 'form-message--success' : ''} ${message ? '' : 'form-message--hidden'}`}
                role="status"
              >
                {message || ' '}
              </View>

              {hasReadSnapshot ? (
                <View className="form-actions">
                  {step > 0 ? (
                    <Button
                      {...buttonA11yProps}
                      className="secondary-action"
                      onClick={() => {
                        setMessage('')
                        setStep((current) => current - 1)
                      }}
                    >
                      上一步
                    </Button>
                  ) : null}
                  {step < 2 ? (
                    <Button {...buttonA11yProps} className="primary-action" onClick={advance}>
                      继续
                      <Text aria-hidden="true"> →</Text>
                    </Button>
                  ) : saveRecovery ? null : (
                    <Button
                      {...buttonActivationProps(() => void submit(), !canSubmit)}
                      id="onboarding-save"
                      className="primary-action"
                      disabled={!canSubmit}
                    >
                      {saving ? '保存中…' : '保存资料'}
                    </Button>
                  )}
                </View>
              ) : null}
            </View>

            <View className="onboarding-aside">
              <Text className="aside-kicker">YOUR DATA, YOUR TERMS</Text>
              <Text className="aside-title">每一项数据，都说明用途。</Text>
              <Text className="aside-body">
                身高与年龄段用于基础估算；时间与器械用于约束计划；风险项只控制安全流程。你可以在之后查看、修订和删除资料。
              </Text>
              <View className="aside-rule" />
              <Text className="aside-meta">当前 API</Text>
              <Text className="aside-value metric">{apiBaseUrl}</Text>
              <Text className="aside-safety">AI 建议不替代医疗诊断或治疗。</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

export default OnboardingPage
