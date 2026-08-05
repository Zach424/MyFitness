import { Button, Text, View } from '@tarojs/components'

import { buttonA11yProps } from '../../lib/accessibility'
import './index.scss'

type DefinitionRevision = {
  revision: number
  action: 'created' | 'updated' | 'archived'
  name: string
  changedAt: string
}

type DefinitionRevisionLedgerProps = {
  items: DefinitionRevision[] | undefined
  nextCursor: string | null
  loadingMore: boolean
  onLoadOlder: () => Promise<void>
}

const actionLabels: Record<DefinitionRevision['action'], string> = {
  created: '创建',
  updated: '纠正',
  archived: '归档',
}

const displayTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))

export const DefinitionRevisionLedger = ({
  items,
  nextCursor,
  loadingMore,
  onLoadOlder,
}: DefinitionRevisionLedgerProps) => (
  <View className="definition-revision-ledger" aria-label="定义修订历史">
    <Text className="definition-revision-ledger__eyebrow">REVISION LEDGER</Text>
    {items ? (
      <>
        {items.length ? (
          items.map((item) => (
            <Text
              className="definition-revision-ledger__item"
              key={`${item.revision}-${item.changedAt}`}
            >
              R{item.revision} · {actionLabels[item.action]} · {item.name} ·{' '}
              {displayTime(item.changedAt)}
            </Text>
          ))
        ) : (
          <Text className="definition-revision-ledger__state">暂时无法读取版本。</Text>
        )}
        {nextCursor ? (
          <Button
            {...buttonA11yProps}
            className="record-page-more"
            disabled={loadingMore}
            onClick={() => void onLoadOlder()}
          >
            {loadingMore ? '正在载入…' : '继续载入更早版本'}
          </Button>
        ) : items.length ? (
          <Text className="record-page-end">已载入全部版本</Text>
        ) : null}
      </>
    ) : (
      <Text className="definition-revision-ledger__state">正在读取定义历史…</Text>
    )}
  </View>
)
