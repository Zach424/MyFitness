import { useEffect, useState } from 'react'
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
import type { OnboardingResponse } from '@myfitness/contracts'

import { ApiError, apiBaseUrl, getOnboarding, saveOnboarding } from '../../lib/api'
import { buttonA11yProps } from '../../lib/accessibility'
import {
  buildOnboardingRequest,
  initialDraft,
  toggleSelection,
  validateStep,
  type OnboardingDraft,
} from './onboarding.model'
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
}: {
  selected: boolean
  label: string
  onClick: () => void
}) => (
  <Button
    {...buttonA11yProps}
    className={`choice-chip ${selected ? 'choice-chip--selected' : ''}`}
    aria-pressed={selected}
    onClick={onClick}
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
  const [revision, setRevision] = useState<number>()
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<OnboardingResponse>()

  useEffect(() => {
    void getOnboarding()
      .then((existing) => {
        if (!existing) return
        setDraft(hydrateDraft(existing))
        setRevision(existing.revision)
      })
      .catch((error: unknown) => {
        if (!(error instanceof ApiError) || error.statusCode !== 404) {
          setMessage(error instanceof Error ? error.message : '暂时无法载入资料')
        }
      })
      .finally(() => setLoading(false))
  }, [])

  const patchDraft = (patch: Partial<OnboardingDraft>) => {
    setDraft((current) => ({ ...current, ...patch }))
    setMessage('')
    setResult(undefined)
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
    const validationError = validateStep(draft, 2)
    if (validationError) {
      setMessage(validationError)
      return
    }
    setSaving(true)
    setMessage('')
    try {
      const saved = await saveOnboarding(buildOnboardingRequest(draft, revision))
      setRevision(saved.revision)
      setResult(saved)
      setMessage(
        saved.eligibility.status === 'eligible'
          ? '资料已保存，可以继续建立记录和训练计划。'
          : '资料已保存。为安全起见，个性化训练规划会先暂停，请取得医生或合格专业人员许可。',
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败，请稍后再试')
    } finally {
      setSaving(false)
    }
  }

  const meta = stepMeta[step]!

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
              className="close-action"
              aria-label="返回今天"
              onClick={() => void Taro.navigateBack()}
            >
              ×
            </Button>
          </View>

          <View className="onboarding-progress" aria-label={`建档进度，第 ${step + 1} 步，共 3 步`}>
            {[0, 1, 2].map((item) => (
              <View
                className={`onboarding-progress__bar ${item <= step ? 'onboarding-progress__bar--active' : ''}`}
                key={item}
              />
            ))}
          </View>

          <View className="onboarding-layout">
            <View className="onboarding-main">
              <View className="onboarding-heading">
                <Text className="onboarding-heading__eyebrow">{meta.eyebrow}</Text>
                <Text className="onboarding-heading__title">{meta.title}</Text>
                <Text className="onboarding-heading__body">{meta.body}</Text>
              </View>

              {loading ? <View className="form-card loading-card">正在读取你的资料…</View> : null}

              {!loading && step === 0 ? (
                <View className="form-card">
                  <View className="field">
                    <Text className="field__label">怎么称呼你</Text>
                    <Input
                      className="text-input"
                      maxlength={40}
                      placeholder="例如：小陈"
                      value={draft.displayName}
                      onInput={(event) => patchDraft({ displayName: event.detail.value })}
                    />
                  </View>

                  <View className="field">
                    <Text className="field__label">年龄段</Text>
                    <View className="choice-grid choice-grid--three">
                      {ageBands.map((item) => (
                        <Chip
                          key={item}
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
                          onInput={(event) => patchDraft({ height: event.detail.value })}
                        />
                        <Text className="number-input-wrap__unit">
                          {draft.unitSystem === 'metric' ? 'cm' : 'in'}
                        </Text>
                      </View>
                    </View>
                    <View className="unit-toggle">
                      <Chip
                        label="公制"
                        selected={draft.unitSystem === 'metric'}
                        onClick={() => patchDraft({ unitSystem: 'metric', height: '170' })}
                      />
                      <Chip
                        label="英制"
                        selected={draft.unitSystem === 'imperial'}
                        onClick={() => patchDraft({ unitSystem: 'imperial', height: '67' })}
                      />
                    </View>
                  </View>
                </View>
              ) : null}

              {!loading && step === 1 ? (
                <View className="form-card">
                  <View className="field">
                    <Text className="field__label">当前最重要的目标</Text>
                    <View className="choice-grid choice-grid--two">
                      {primaryGoals.map((item) => (
                        <Chip
                          key={item}
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

              {!loading && step === 2 ? (
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
                          onChange={(event) =>
                            patchDraft({ [key]: event.detail.value } as Partial<OnboardingDraft>)
                          }
                        />
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              <View
                className={`form-message ${result ? 'form-message--success' : ''} ${message ? '' : 'form-message--hidden'}`}
                role="status"
              >
                {message || ' '}
              </View>

              {!loading ? (
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
                  ) : (
                    <Button
                      {...buttonA11yProps}
                      className="primary-action"
                      disabled={saving}
                      onClick={() => void submit()}
                    >
                      保存资料
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
