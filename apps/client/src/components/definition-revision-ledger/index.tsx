import { Button, Text, View } from '@tarojs/components'

import { buttonA11yProps } from '../../lib/accessibility'
import type {
  AggregateHistoryReadFailure,
  AggregateHistoryReadPhase,
} from '../../lib/aggregate-history-read'
import {
  AggregateHistoryEmptyState,
  AggregateHistoryReadState,
} from '../aggregate-history-read-state'
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
  busy: boolean
  phase: AggregateHistoryReadPhase
  failure?: AggregateHistoryReadFailure
  subject: string
  retryId: string
  onLoadOlder: () => void
  onRetry: () => void
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
  busy,
  phase,
  failure,
  subject,
  retryId,
  onLoadOlder,
  onRetry,
}: DefinitionRevisionLedgerProps) => (
  <View className="definition-revision-ledger" aria-label="定义修订历史">
    <Text className="definition-revision-ledger__eyebrow">REVISION LEDGER</Text>
    <AggregateHistoryReadState
      phase={phase}
      failure={failure}
      subject={subject}
      itemCount={items?.length ?? 0}
      retryId={retryId}
      onRetry={onRetry}
    />
    {items !== undefined ? (
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
          <AggregateHistoryEmptyState subject={subject} />
        )}
        {nextCursor ? (
          <Button
            {...buttonA11yProps}
            className="record-page-more"
            disabled={busy || phase !== 'ready'}
            aria-disabled={busy || phase !== 'ready'}
            onClick={onLoadOlder}
          >
            {busy ? '正在载入…' : '继续载入更早版本'}
          </Button>
        ) : items.length ? (
          <Text className="record-page-end">已载入全部版本</Text>
        ) : null}
      </>
    ) : null}
  </View>
)
