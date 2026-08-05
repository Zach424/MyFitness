import { Button, Text, View } from '@tarojs/components'

import { buttonActivationProps } from '../../lib/accessibility'
import {
  observationReadSubjectLabel,
  type ObservationReadPhase,
  type ObservationReadSubject,
} from '../../lib/observation-read'
import './index.scss'

type ObservationReadPresentation = {
  eyebrow: string
  title: string
  detail: string
}

type ObservationReadStateProps = {
  phase: ObservationReadPhase
  subject: ObservationReadSubject
  presentation?: ObservationReadPresentation
  retainedLabel: string
  retryId: string
  retryLabel: string
  onRetry: () => void
}

type ObservationReadToolbarProps = {
  label: string
  buttonId: string
  buttonLabel: string
  busy: boolean
  disabled: boolean
  onRefresh: () => void
}

export const ObservationReadToolbar = ({
  label,
  buttonId,
  buttonLabel,
  busy,
  disabled,
  onRefresh,
}: ObservationReadToolbarProps) => (
  <View className="observation-read-toolbar">
    <Text>{label}</Text>
    <Button
      {...buttonActivationProps(onRefresh, disabled)}
      id={buttonId}
      className="observation-read-refresh"
      aria-label={buttonLabel}
    >
      {busy ? '核对中…' : '更新观察'}
    </Button>
  </View>
)

export const ObservationReadState = ({
  phase,
  subject,
  presentation,
  retainedLabel,
  retryId,
  retryLabel,
  onRetry,
}: ObservationReadStateProps) => {
  if (phase === 'initial-loading' || phase === 'ready') return null
  const label = observationReadSubjectLabel(subject)

  if (phase === 'refreshing')
    return (
      <View className="observation-read-state observation-read-state--refreshing" role="status">
        <Text className="observation-read-state__eyebrow">CHECKING OBSERVATION / 保留上次观察</Text>
        <Text className="observation-read-state__title">正在复核{label}</Text>
        <Text className="observation-read-state__copy">
          上次成功读取的观察继续显示；完成前不会替换它，也不会改变服务端选择。
        </Text>
        <Text className="observation-read-state__retained metric">{retainedLabel}</Text>
      </View>
    )

  if (!presentation) return null
  return (
    <View className="observation-read-state" role="status">
      <Text className="observation-read-state__eyebrow">{presentation.eyebrow}</Text>
      <Text className="observation-read-state__title">{presentation.title}</Text>
      <Text className="observation-read-state__copy">{presentation.detail}</Text>
      <Text className="observation-read-state__retained metric">{retainedLabel}</Text>
      <Button
        {...buttonActivationProps(onRetry)}
        id={retryId}
        className="observation-read-state__action"
        aria-label={retryLabel}
      >
        重新核对
      </Button>
    </View>
  )
}
