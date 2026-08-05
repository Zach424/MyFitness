import { Button, Text, View } from '@tarojs/components'

import { buttonActivationProps } from '../../lib/accessibility'
import {
  aggregateHistoryReadFailureCopy,
  type AggregateHistoryReadFailure,
  type AggregateHistoryReadPhase,
} from '../../lib/aggregate-history-read'
import './index.scss'

type AggregateHistoryReadStateProps = {
  phase: AggregateHistoryReadPhase
  failure?: AggregateHistoryReadFailure
  subject: string
  itemCount: number
  retryId: string
  onRetry: () => void
}

export const AggregateHistoryReadState = ({
  phase,
  failure,
  subject,
  itemCount,
  retryId,
  onRetry,
}: AggregateHistoryReadStateProps) => {
  if (phase === 'ready') return null
  if (phase === 'initial-loading')
    return (
      <View
        className="aggregate-history-read-state aggregate-history-read-state--checking"
        role="status"
      >
        <Text className="aggregate-history-read-state__eyebrow">CHECKING AUDIT / 尚未建立结论</Text>
        <Text className="aggregate-history-read-state__title">正在读取{subject}不可变版本</Text>
        <Text className="aggregate-history-read-state__copy">
          成功响应前，版本数量与历史边界保持未知；关闭只会退出抽屉。
        </Text>
      </View>
    )
  if (phase === 'continuing')
    return (
      <View
        className="aggregate-history-read-state aggregate-history-read-state--checking"
        role="status"
      >
        <Text className="aggregate-history-read-state__eyebrow">CHECKING OLDER / 保留已读版本</Text>
        <Text className="aggregate-history-read-state__title">正在载入更早版本</Text>
        <Text className="aggregate-history-read-state__retained">
          RETAINED {itemCount} REVISIONS · PAGE MEMORY
        </Text>
      </View>
    )
  if (!failure) return null
  const presentation = aggregateHistoryReadFailureCopy(failure.kind, subject, phase === 'stale')
  return (
    <View className="aggregate-history-read-state" role="status">
      <Text className="aggregate-history-read-state__eyebrow">{presentation.eyebrow}</Text>
      <Text className="aggregate-history-read-state__title">{presentation.title}</Text>
      <Text className="aggregate-history-read-state__copy">{presentation.detail}</Text>
      <Text className="aggregate-history-read-state__retained">
        {phase === 'stale'
          ? `RETAINED ${itemCount} REVISIONS · CURSOR FROZEN`
          : 'REVISIONS — · AUDIT BOUNDARY UNKNOWN'}
      </Text>
      <Button
        {...buttonActivationProps(onRetry)}
        id={retryId}
        className="aggregate-history-read-state__retry"
        aria-label={
          failure.operation === 'continuation'
            ? `重试载入${subject}更早版本`
            : `重新核对${subject}版本历史`
        }
      >
        {failure.operation === 'continuation' ? '重试载入更早版本' : '重新核对版本历史'}
      </Button>
    </View>
  )
}

export const AggregateHistoryEmptyState = ({ subject }: { subject: string }) => (
  <View className="aggregate-history-empty" role="status">
    <Text className="aggregate-history-empty__mark">◇</Text>
    <Text className="aggregate-history-empty__title">服务已确认：暂无{subject}版本</Text>
    <Text className="aggregate-history-empty__copy">
      这是一次成功的空审计响应，不是连接失败或删除结论。
    </Text>
  </View>
)
