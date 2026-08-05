import { Button, Text, View } from '@tarojs/components'

import { buttonActivationProps } from '../../lib/accessibility'
import {
  privateInventoryReadSubjectLabel,
  type PrivateInventoryReadPhase,
  type PrivateInventoryReadSubject,
} from '../../lib/private-inventory-read'
import './index.scss'

type PrivateInventoryReadPresentation = {
  eyebrow: string
  title: string
  detail: string
}

type PrivateInventoryReadStateProps = {
  phase: PrivateInventoryReadPhase
  subject: PrivateInventoryReadSubject
  presentation?: PrivateInventoryReadPresentation
  retainedLabel: string
  retryId: string
  retryLabel: string
  onRetry: () => void
}

type PrivateInventoryReadToolbarProps = {
  label: string
  buttonId: string
  busy: boolean
  disabled: boolean
  onRefresh: () => void
}

export const PrivateInventoryReadToolbar = ({
  label,
  buttonId,
  busy,
  disabled,
  onRefresh,
}: PrivateInventoryReadToolbarProps) => (
  <View className="private-inventory-toolbar">
    <Text>{label}</Text>
    <Button
      {...buttonActivationProps(onRefresh, disabled)}
      id={buttonId}
      className="private-inventory-toolbar__action"
      aria-label="更新私密照片清单"
    >
      {busy ? '核对中…' : '更新清单'}
    </Button>
  </View>
)

export const PrivateInventoryReadState = ({
  phase,
  subject,
  presentation,
  retainedLabel,
  retryId,
  retryLabel,
  onRetry,
}: PrivateInventoryReadStateProps) => {
  if (phase === 'ready') return null
  const label = privateInventoryReadSubjectLabel(subject)

  if (phase === 'initial-loading')
    return (
      <View className="private-inventory-state private-inventory-state--loading" role="status">
        <Text className="private-inventory-state__eyebrow">CHECKING PRIVATE INVENTORY</Text>
        <Text className="private-inventory-state__title">正在核对{label}</Text>
        <Text className="private-inventory-state__copy">
          只有完整读取成功后，页面才会显示空清单或开放媒体操作。
        </Text>
      </View>
    )

  if (phase === 'refreshing')
    return (
      <View className="private-inventory-state private-inventory-state--refreshing" role="status">
        <Text className="private-inventory-state__eyebrow">CHECKING INVENTORY / 保留上次清单</Text>
        <Text className="private-inventory-state__title">正在复核{label}</Text>
        <Text className="private-inventory-state__copy">
          上次成功读取的清单继续显示；完成前不会替换它，也不会授权媒体或保管操作。
        </Text>
        <Text className="private-inventory-state__retained metric">{retainedLabel}</Text>
      </View>
    )

  if (!presentation) return null
  return (
    <View className="private-inventory-state" role="status">
      <Text className="private-inventory-state__eyebrow">{presentation.eyebrow}</Text>
      <Text className="private-inventory-state__title">{presentation.title}</Text>
      <Text className="private-inventory-state__copy">{presentation.detail}</Text>
      <Text className="private-inventory-state__retained metric">{retainedLabel}</Text>
      <Button
        {...buttonActivationProps(onRetry)}
        id={retryId}
        className="private-inventory-state__action"
        aria-label={retryLabel}
      >
        重新核对
      </Button>
    </View>
  )
}
