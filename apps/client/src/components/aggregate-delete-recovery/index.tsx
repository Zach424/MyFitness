import { Button, Text, View } from '@tarojs/components'

import type { AggregateDeleteRecovery as Recovery } from '../../lib/aggregate-delete-recovery'
import { buttonActivationProps } from '../../lib/accessibility'

import './index.scss'

type AggregateDeleteRecoveryProps = {
  recovery: Recovery
  actionId: string
  busy: boolean
  onAction: () => void
}

export const AggregateDeleteRecovery = ({
  recovery,
  actionId,
  busy,
  onAction,
}: AggregateDeleteRecoveryProps) => (
  <View
    className={`aggregate-delete-recovery aggregate-delete-recovery--${recovery.failureKind}`}
    role="status"
    aria-live="polite"
    aria-atomic="true"
  >
    <Text className="aggregate-delete-recovery__eyebrow">{recovery.eyebrow}</Text>
    <Text className="aggregate-delete-recovery__message">{recovery.message}</Text>
    <Button
      id={actionId}
      className="aggregate-delete-recovery__action"
      disabled={busy}
      {...buttonActivationProps(onAction, busy)}
    >
      {busy ? '核对中…' : recovery.actionLabel}
    </Button>
  </View>
)
