import { Button, Text, View } from '@tarojs/components'

import { buttonA11yProps } from '../../lib/accessibility'
import type { LocalDraftEnvelope } from '../../lib/draft-vault'
import './index.scss'

type LocalDraftNoticeProps = {
  mode: 'restore' | 'saved'
  envelope: LocalDraftEnvelope<unknown>
  correctionRevision?: number
  onRestore?: () => void
  onDiscard: () => void
}

const localTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))

export const LocalDraftNotice = ({
  mode,
  envelope,
  correctionRevision,
  onRestore,
  onDiscard,
}: LocalDraftNoticeProps) => {
  const correction = correctionRevision !== undefined
  return (
    <View className={`local-draft local-draft--${mode}`} role="status">
      <View className="local-draft__rail" aria-hidden="true">
        <Text>LOCAL</Text>
        <Text>24H</Text>
      </View>
      <View className="local-draft__content">
        <Text className="local-draft__eyebrow">
          {mode === 'restore' ? 'RECOVERABLE DRAFT' : 'SAVED ON THIS DEVICE'}
        </Text>
        <Text className="local-draft__title">
          {correction
            ? mode === 'restore'
              ? '发现一份未完成修改'
              : '未保存修改已暂存'
            : mode === 'restore'
              ? '发现一份未完成记录'
              : '未完成内容已暂存'}
        </Text>
        <Text className="local-draft__body">
          {correction
            ? '只在原记录仍是同一版本时恢复；服务器变化会使这份修改失效。'
            : mode === 'restore'
              ? '恢复前不会覆盖当前表单；内容只属于当前账号。'
              : '仅保存表单字段，不包含照片、授权材料或 AI 待审内容。'}
        </Text>
        <Text className="local-draft__time">
          {correction ? `基于 R${correctionRevision} · ` : ''}保存 {localTime(envelope.savedAt)} ·
          自动清除 {localTime(envelope.expiresAt)}
        </Text>
        <View className="local-draft__actions">
          {mode === 'restore' && onRestore ? (
            <Button {...buttonA11yProps} className="local-draft__restore" onClick={onRestore}>
              {correction ? '恢复修改' : '恢复草稿'}
            </Button>
          ) : null}
          <Button {...buttonA11yProps} className="local-draft__discard" onClick={onDiscard}>
            {correction
              ? mode === 'restore'
                ? '放弃这份修改'
                : '清除修改'
              : mode === 'restore'
                ? '放弃这份草稿'
                : '清除草稿'}
          </Button>
        </View>
      </View>
    </View>
  )
}
