import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type {
  HealthRecord,
  HealthRecordHistoryItem,
  MetricCode,
  UnitCode,
} from '@myfitness/contracts'

import {
  buttonActivationProps,
  buttonA11yProps,
  deferH5Focus,
  escapeDismissProps,
} from '../../lib/accessibility'
import { parseBackfillIntent } from '../../lib/backfill-intent'
import {
  AggregateHistoryEmptyState,
  AggregateHistoryReadState,
} from '../../components/aggregate-history-read-state'
import { LocalDraftNotice } from '../../components/local-draft-notice'
import { OccurrenceField } from '../../components/occurrence-field'
import { currentCorrectionTarget } from '../../lib/correction-draft'
import {
  ApiError,
  createHealthRecord,
  deleteHealthRecord,
  getHealthRecord,
  getHealthRecordHistory,
  listHealthRecords,
  updateHealthRecord,
} from '../../lib/api'
import { appendOlderRecords, includeExactRecord } from '../../lib/record-pages'
import { describeSaveFailure, type SaveRecovery } from '../../lib/save-recovery'
import { useAggregateHistory } from '../../lib/use-aggregate-history'
import { useDialogFocusBoundary } from '../../lib/use-dialog-focus-boundary'
import { useRecoverableDraft } from '../../lib/use-local-draft'
import {
  buildRecordRequest,
  classifyRecordReadFailure,
  createDraft,
  draftFromRecord,
  formatRecordValue,
  groupMetrics,
  isRecordDraft,
  metricUiDefinitions,
  recordReadPhase,
  type RecordDraft,
  type RecordGroup,
  type RecordReadFailureKind,
  unitLabels,
  validateRecordDraft,
} from './record.model'
import './index.scss'

const actionLabels: Record<HealthRecordHistoryItem['action'], string> = {
  created: '创建记录',
  updated: '修改记录',
  deleted: '删除记录',
}

const dateTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))

const createRequestKey = () =>
  `record-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`

const errorMessage = (error: unknown) =>
  error instanceof ApiError || error instanceof Error ? error.message : '操作失败，请稍后重试'

const recordReadFailureCopy = (
  kind: RecordReadFailureKind,
  hasSnapshot: boolean,
): { eyebrow: string; title: string; detail: string } => {
  if (kind === 'offline') {
    return {
      eyebrow: 'OFFLINE / 连接未完成',
      title: hasSnapshot ? '记录清单复核没有完成' : '身体记录还没有读取',
      detail: hasSnapshot
        ? '上次成功读取的记录仍在下方，但保存、修改、历史与删除均已冻结。'
        : '当前无法确认账户里是否已有记录；页面不会用空记录册代替，也不会提交新的改动。',
    }
  }
  if (kind === 'refused') {
    return {
      eyebrow: 'READ REFUSED / 读取被拒绝',
      title: hasSnapshot ? '服务拒绝了本次清单复核' : '服务没有接受本次记录读取',
      detail: hasSnapshot
        ? '旧清单继续只读保留；重新核对前不会保存、修改、读取历史或删除记录。'
        : '记录数量与内容仍是未知状态；重新核对成功前，记录操作保持冻结。',
    }
  }
  if (kind === 'service') {
    return {
      eyebrow: 'SERVICE PAUSED / 服务暂不可用',
      title: hasSnapshot ? '本次记录复核暂未完成' : '身体记录暂时无法读取',
      detail: hasSnapshot
        ? '下方保留上次清单用于查看，所有记录操作保持冻结。'
        : '服务暂时没有返回记录证据；这里不会显示“还没有记录”。',
    }
  }
  return {
    eyebrow: 'READ UNKNOWN / 结果未知',
    title: hasSnapshot ? '无法确认当前记录清单' : '无法确认身体记录状态',
    detail: hasSnapshot
      ? '旧清单继续只读保留；重新核对前不会提交任何记录操作。'
      : '页面尚未取得可信的记录快照，也不会推断账户没有记录。',
  }
}

const RecordsPage = () => {
  const backfill = useRef(parseBackfillIntent(Taro.getCurrentInstance().router?.params))
  const newDraft = (metric: MetricCode) => {
    const next = createDraft(metric)
    if (backfill.current) {
      next.occurredLocal = backfill.current.localDate
      next.timezone = backfill.current.timezone
    }
    return next
  }
  const [group, setGroup] = useState<RecordGroup>('body')
  const [draft, setDraft] = useState<RecordDraft>(() => newDraft('body.weight'))
  const [records, setRecords] = useState<HealthRecord[]>([])
  const [editing, setEditing] = useState<HealthRecord>()
  const [deleting, setDeleting] = useState<HealthRecord>()
  const [loading, setLoading] = useState(true)
  const [hasReadSnapshot, setHasReadSnapshot] = useState(false)
  const [readFailure, setReadFailure] = useState<RecordReadFailureKind>()
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [saveRecovery, setSaveRecovery] = useState<SaveRecovery>()
  const requestKey = useRef('')
  const readInFlight = useRef(false)
  const historyRead = useAggregateHistory<HealthRecord, HealthRecordHistoryItem>(
    getHealthRecordHistory,
    'health-history-read-retry',
    {
      initialFocusId: 'health-history-close',
      fallbackFocusId: 'record-read-refresh',
    },
  )
  const deleteDialogFocus = useDialogFocusBoundary('health-delete-cancel', 'record-read-refresh')

  const loadRecords = async (isActive: () => boolean = () => true) => {
    if (readInFlight.current) return
    readInFlight.current = true
    setLoading(true)
    setReadFailure(undefined)
    deleteDialogFocus.reset()
    setDeleting(undefined)
    historyRead.close()
    try {
      const result = await listHealthRecords({ limit: 20 })
      if (!isActive()) return
      setRecords(result.items)
      setNextCursor(result.nextCursor)
      setHasReadSnapshot(true)
    } catch (error) {
      if (!isActive()) return
      setReadFailure(classifyRecordReadFailure(error))
      deferH5Focus('record-read-retry', 80)
    } finally {
      readInFlight.current = false
      if (isActive()) setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    void loadRecords(() => active)
    return () => {
      active = false
    }
  }, [])

  const readPhase = recordReadPhase({
    hasSnapshot: hasReadSnapshot,
    busy: loading,
    hasFailure: Boolean(readFailure),
  })
  const readAuthorityReady = readPhase === 'ready'
  const readFailurePresentation = readFailure
    ? recordReadFailureCopy(readFailure, hasReadSnapshot)
    : undefined

  const loadOlderRecords = async () => {
    if (!readAuthorityReady || !nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const result = await listHealthRecords({ limit: 20, cursor: nextCursor })
      setRecords((current) => appendOlderRecords(current, result.items))
      setNextCursor(result.nextCursor)
    } catch (error) {
      setFeedback(errorMessage(error))
    } finally {
      setLoadingMore(false)
    }
  }

  const recoverableDraft = useRecoverableDraft({
    kind: 'health-record',
    draft,
    enabled: true,
    dirty:
      JSON.stringify(draft) !==
      JSON.stringify(editing ? draftFromRecord(editing) : createDraft(draft.metric)),
    validate: isRecordDraft,
  })

  const restorePendingDraft = async () => {
    const pending = recoverableDraft.pending
    if (!pending) return
    const correction = pending.payload.correction
    if (!correction) {
      const restored = recoverableDraft.restore()
      if (!restored) return
      setGroup(metricUiDefinitions[restored.metric].group)
      setDraft(restored)
      requestKey.current = ''
      setSaveRecovery(undefined)
      setFeedback('本地记录草稿已恢复；保存前请重新核对数值、单位与发生时间。')
      return
    }
    if (!readAuthorityReady) {
      setFeedback('请先重新核对记录清单，再恢复这份修改草稿。草稿仍安全保留。')
      return
    }
    try {
      const exact = await getHealthRecord(correction.aggregateId)
      const target = currentCorrectionTarget([exact], correction)
      if (!target) {
        recoverableDraft.clear()
        setFeedback('这份修改基于旧版本或已删除记录，已安全放弃；当前记录没有被覆盖。')
        return
      }
      setRecords((current) => includeExactRecord(current, target))
      const restored = recoverableDraft.restore()
      if (!restored) return
      setGroup(metricUiDefinitions[target.metric].group)
      setEditing(target)
      setDraft(restored)
      requestKey.current = ''
      setSaveRecovery(undefined)
      setFeedback(`已恢复基于 R${correction.baseRevision} 的修改；保存仍会校验当前版本。`)
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 404) {
        recoverableDraft.clear()
        setFeedback('这份修改对应的记录已删除，已安全放弃；当前记录没有被覆盖。')
        return
      }
      setFeedback(`暂时无法核对原记录，修改草稿仍保留。${errorMessage(error)}`)
    }
  }

  const groupRecords = useMemo(
    () => records.filter((record) => metricUiDefinitions[record.metric].group === group),
    [group, records],
  )
  const trendRecords = useMemo(
    () =>
      records
        .filter((record) => record.metric === draft.metric)
        .slice(0, 7)
        .reverse(),
    [draft.metric, records],
  )
  const trendRange = useMemo(() => {
    const values = trendRecords.map((record) => record.canonicalValue)
    return { min: Math.min(...values), max: Math.max(...values) }
  }, [trendRecords])

  const switchGroup = (nextGroup: RecordGroup) => {
    setGroup(nextGroup)
    setEditing(undefined)
    setDraft(newDraft(groupMetrics[nextGroup][0]!))
    setFeedback('')
    setSaveRecovery(undefined)
    requestKey.current = ''
  }

  const selectMetric = (metric: MetricCode) => {
    setEditing(undefined)
    setDraft(newDraft(metric))
    setFeedback('')
    setSaveRecovery(undefined)
    requestKey.current = ''
  }

  const save = async () => {
    if (!readAuthorityReady) {
      setFeedback('请先重新核对记录清单，再保存这笔记录。当前输入仍保留。')
      return
    }
    const validationError = validateRecordDraft(draft)
    if (validationError) {
      setSaveRecovery(undefined)
      setFeedback(validationError)
      return
    }
    setSaving(true)
    setSaveRecovery(undefined)
    setFeedback('')
    try {
      if (editing) {
        const updated = await updateHealthRecord(
          editing.id,
          buildRecordRequest(draft, editing.revision),
        )
        recoverableDraft.clear()
        setRecords((current) =>
          current.map((record) => (record.id === updated.id ? updated : record)),
        )
        setEditing(undefined)
        setDraft(createDraft(updated.metric))
        setSaveRecovery(undefined)
        setFeedback('修改已保存，原版本仍保留在历史中。')
      } else {
        if (!requestKey.current) requestKey.current = createRequestKey()
        const created = await createHealthRecord(buildRecordRequest(draft), requestKey.current)
        recoverableDraft.clear()
        backfill.current = null
        setRecords((current) => [created, ...current])
        setDraft(createDraft(created.metric))
        requestKey.current = ''
        setSaveRecovery(undefined)
        setFeedback('记录已保存。持续记录比单次数字更有价值。')
      }
    } catch (error) {
      const recovery = describeSaveFailure(error, {
        subject: editing ? '这次修改' : '这笔身体记录',
        create: !editing,
      })
      setSaveRecovery(recovery)
      setFeedback(recovery.message)
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (record: HealthRecord) => {
    if (!readAuthorityReady) return
    if (recoverableDraft.pending) {
      setFeedback('请先恢复或放弃页面顶部的本地草稿，再开始另一项修改。')
      Taro.pageScrollTo({ scrollTop: 0, duration: 240 })
      return
    }
    backfill.current = null
    const nextGroup = metricUiDefinitions[record.metric].group
    setGroup(nextGroup)
    setDraft(draftFromRecord(record))
    setEditing(record)
    setFeedback('正在修改这条记录；保存后会新增一个历史版本。')
    setSaveRecovery(undefined)
    requestKey.current = ''
    Taro.pageScrollTo({ scrollTop: 0, duration: 240 })
  }

  const requestDelete = (record: HealthRecord) => {
    const triggerId = `health-delete-trigger-${record.id}`
    setDeleting(record)
    deleteDialogFocus.enter(triggerId)
  }

  const cancelDelete = () => {
    if (saving) return
    setDeleting(undefined)
    deleteDialogFocus.restore()
  }

  const confirmDelete = async () => {
    if (!deleting || !readAuthorityReady) return
    setSaving(true)
    try {
      await deleteHealthRecord(deleting.id, deleting.revision)
      setRecords((current) => current.filter((record) => record.id !== deleting.id))
      if (editing?.id === deleting.id) {
        setEditing(undefined)
        setDraft(createDraft(deleting.metric))
      }
      setDeleting(undefined)
      deleteDialogFocus.complete()
      setFeedback('记录已从列表移除，审计历史仍安全保留。')
    } catch (error) {
      setFeedback(errorMessage(error))
      deferH5Focus('health-delete-cancel', 40)
    } finally {
      setSaving(false)
    }
  }

  const activeDefinition = metricUiDefinitions[draft.metric]

  return (
    <View className="records-page">
      <ScrollView className="records-scroll" scrollY enhanced showScrollbar={false}>
        <View className="records-shell">
          <View className="records-topbar">
            <Button
              {...buttonA11yProps}
              className="back-button"
              aria-label="返回今天"
              onClick={() => void Taro.navigateBack()}
            >
              ←
            </Button>
            <View className="records-brand">
              <Text className="records-brand__cn">衡迹</Text>
              <Text className="records-brand__en">BODY LOG</Text>
            </View>
            <Text className="records-topbar__date">
              {dateTime(new Date().toISOString()).slice(0, 5)}
            </Text>
          </View>

          <View className="records-intro">
            <Text className="records-kicker">MEASURE · NOTICE · ADJUST</Text>
            <Text className="records-title">记录身体，也记录恢复。</Text>
            <Text className="records-lead">
              用相同单位、相近条件持续记录。趋势比某一次读数更能帮助你理解自己。
            </Text>
          </View>

          {recoverableDraft.pending ? (
            <LocalDraftNotice
              mode="restore"
              envelope={recoverableDraft.pending}
              correctionRevision={recoverableDraft.pending.payload.correction?.baseRevision}
              onRestore={() => {
                void restorePendingDraft()
              }}
              onDiscard={() => {
                recoverableDraft.clear()
                backfill.current = null
                setDraft(createDraft(draft.metric))
                requestKey.current = ''
                setSaveRecovery(undefined)
                setFeedback('本地身体记录草稿已清除。')
              }}
            />
          ) : recoverableDraft.saved ? (
            <LocalDraftNotice
              mode="saved"
              envelope={recoverableDraft.saved}
              correctionRevision={recoverableDraft.saved.payload.correction?.baseRevision}
              onDiscard={() => {
                recoverableDraft.clear()
                backfill.current = null
                setEditing(undefined)
                setDraft(createDraft(draft.metric))
                requestKey.current = ''
                setSaveRecovery(undefined)
                setFeedback('本地身体记录草稿已清除。')
              }}
            />
          ) : null}

          {readPhase === 'refreshing' && hasReadSnapshot ? (
            <View className="record-read-state record-read-state--refreshing" role="status">
              <View>
                <Text className="record-read-state__eyebrow">CHECKING LEDGER / 保留上次清单</Text>
                <Text className="record-read-state__title">正在复核身体记录</Text>
                <Text className="record-read-state__copy">
                  复核完成前，下方记录只读保留；保存、修改、历史与删除均已冻结。
                </Text>
              </View>
            </View>
          ) : readFailurePresentation ? (
            <View className={`record-read-state record-read-state--${readPhase}`} role="status">
              <View>
                <Text className="record-read-state__eyebrow">
                  {readFailurePresentation.eyebrow}
                </Text>
                <Text className="record-read-state__title">{readFailurePresentation.title}</Text>
                <Text className="record-read-state__copy">{readFailurePresentation.detail}</Text>
                {hasReadSnapshot ? (
                  <Text className="record-read-state__retained metric">
                    RETAINED PAGE · {records.length} ITEMS
                  </Text>
                ) : null}
              </View>
              <Button
                id="record-read-retry"
                className="record-read-state__action"
                aria-label="重新核对身体记录清单"
                {...buttonActivationProps(
                  () => void loadRecords(),
                  loading || loadingMore || saving,
                )}
              >
                重新核对
              </Button>
            </View>
          ) : null}

          <View className="progress-photo-entry">
            <View>
              <Text className="panel-eyebrow">PRIVATE CONTACT SHEET</Text>
              <Text className="progress-photo-entry__title">进度照与同视角对位</Text>
              <Text className="progress-photo-entry__body">
                检查拍摄条件、选择 24 小时自动删除或单独授权长期保留，并用叠片观察变化。
              </Text>
            </View>
            <Button
              {...buttonA11yProps}
              className="progress-photo-entry__action"
              onClick={() => void Taro.navigateTo({ url: '/pages/progress-photos/index' })}
            >
              打开进度照 →
            </Button>
          </View>

          <View className="records-layout">
            <View className="records-layout__editor">
              <View className="group-tabs" aria-label="记录类别">
                {(['body', 'recovery'] as const).map((item) => (
                  <Button
                    {...buttonA11yProps}
                    className={`group-tab ${group === item ? 'group-tab--active' : ''}`}
                    key={item}
                    aria-pressed={group === item}
                    onClick={() => switchGroup(item)}
                  >
                    <Text>{item === 'body' ? '身体指标' : '恢复感受'}</Text>
                    <Text className="group-tab__count metric">0{groupMetrics[item].length}</Text>
                  </Button>
                ))}
              </View>

              <View className="record-editor section-card">
                <View className="editor-heading">
                  <View>
                    <Text className="panel-eyebrow">{editing ? 'EDIT ENTRY' : 'NEW ENTRY'}</Text>
                    <Text className="panel-title">{editing ? '修改记录' : '添加一笔'}</Text>
                  </View>
                  {editing ? (
                    <Button
                      {...buttonA11yProps}
                      className="quiet-button"
                      onClick={() => {
                        recoverableDraft.clear()
                        setEditing(undefined)
                        setDraft(createDraft(draft.metric))
                        setSaveRecovery(undefined)
                        setFeedback('')
                      }}
                    >
                      取消修改
                    </Button>
                  ) : null}
                </View>

                <View className="metric-picker" aria-label="选择记录项目">
                  {groupMetrics[group].map((metric) => (
                    <Button
                      {...buttonA11yProps}
                      className={`metric-chip ${draft.metric === metric ? 'metric-chip--active' : ''}`}
                      key={metric}
                      aria-pressed={draft.metric === metric}
                      onClick={() => selectMetric(metric)}
                    >
                      {metricUiDefinitions[metric].shortLabel}
                    </Button>
                  ))}
                </View>

                <View className="value-composer">
                  <View className="value-composer__copy">
                    <Text className="value-composer__label">{activeDefinition.label}</Text>
                    <Text className="value-composer__hint">{activeDefinition.hint}</Text>
                  </View>
                  {activeDefinition.score ? (
                    <View className="score-picker" aria-label={`${activeDefinition.label}评分`}>
                      {[1, 2, 3, 4, 5].map((score) => (
                        <Button
                          {...buttonA11yProps}
                          className={`score-button ${draft.value === String(score) ? 'score-button--active' : ''}`}
                          key={score}
                          aria-pressed={draft.value === String(score)}
                          onClick={() => {
                            setDraft((current) => ({ ...current, value: String(score) }))
                            requestKey.current = ''
                            setSaveRecovery(undefined)
                            setFeedback('')
                          }}
                        >
                          {score}
                        </Button>
                      ))}
                    </View>
                  ) : (
                    <View className="number-field">
                      <Input
                        className="number-field__input metric"
                        type="digit"
                        value={draft.value}
                        placeholder={`${activeDefinition.label}数值`}
                        aria-label={`${activeDefinition.label}数值`}
                        onInput={(event) => {
                          setDraft((current) => ({ ...current, value: event.detail.value }))
                          requestKey.current = ''
                          setSaveRecovery(undefined)
                          setFeedback('')
                        }}
                      />
                      <Text className="number-field__unit">{unitLabels[draft.unit]}</Text>
                    </View>
                  )}
                </View>

                {activeDefinition.units.length > 1 ? (
                  <View className="unit-picker" aria-label="选择单位">
                    {activeDefinition.units.map((unit) => (
                      <Button
                        {...buttonA11yProps}
                        className={`unit-button ${draft.unit === unit ? 'unit-button--active' : ''}`}
                        key={unit}
                        aria-pressed={draft.unit === unit}
                        onClick={() => {
                          setDraft((current) => ({ ...current, unit: unit as UnitCode }))
                          requestKey.current = ''
                          setSaveRecovery(undefined)
                          setFeedback('')
                        }}
                      >
                        {unitLabels[unit]}
                      </Button>
                    ))}
                  </View>
                ) : null}

                <OccurrenceField
                  label="发生时间"
                  value={draft.occurredLocal}
                  timeZone={draft.timezone}
                  selectedOffsetMinutes={draft.occurrenceOffsetMinutes}
                  onChange={(occurredLocal) => {
                    setDraft((current) => ({
                      ...current,
                      occurredLocal,
                      originalOccurredAt: undefined,
                    }))
                    requestKey.current = ''
                    setSaveRecovery(undefined)
                    setFeedback('')
                  }}
                  onTimeZoneChange={(timezone) => {
                    setDraft((current) => ({ ...current, timezone, originalOccurredAt: undefined }))
                    requestKey.current = ''
                    setSaveRecovery(undefined)
                    setFeedback('')
                  }}
                  onOffsetChange={(occurrenceOffsetMinutes) => {
                    setDraft((current) => ({
                      ...current,
                      occurrenceOffsetMinutes,
                      originalOccurredAt: undefined,
                    }))
                    requestKey.current = ''
                    setSaveRecovery(undefined)
                    setFeedback('')
                  }}
                />

                <View className="editor-meta">
                  <Text>来源 · 手动记录</Text>
                  <Text>{editing ? `版本 ${editing.revision}` : '时间 · 可回填'}</Text>
                </View>

                {feedback ? (
                  <View
                    className={`record-feedback ${saveRecovery ? `record-feedback--${saveRecovery.kind}` : ''}`}
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    {saveRecovery ? (
                      <Text className="record-feedback__eyebrow">{saveRecovery.eyebrow}</Text>
                    ) : null}
                    <Text>{feedback}</Text>
                  </View>
                ) : null}

                <Button
                  {...buttonA11yProps}
                  className="save-button"
                  disabled={saving || !readAuthorityReady}
                  aria-disabled={saving || !readAuthorityReady}
                  onClick={() => void save()}
                >
                  {saving
                    ? '正在保存…'
                    : (saveRecovery?.actionLabel ?? (editing ? '保存新版本' : '保存记录'))}
                </Button>
              </View>

              <View className="trend-panel section-card">
                <View className="editor-heading">
                  <View>
                    <Text className="panel-eyebrow">LAST 7 ENTRIES</Text>
                    <Text className="panel-title">{activeDefinition.label}趋势</Text>
                  </View>
                  <Text className="trend-panel__count metric">
                    {hasReadSnapshot ? `${trendRecords.length}/7` : '—/7'}
                  </Text>
                </View>
                {!hasReadSnapshot ? (
                  <View className="trend-empty">记录尚未核对；读取成功后才会显示最近趋势。</View>
                ) : trendRecords.length ? (
                  <View className="trend-bars" aria-label={`${activeDefinition.label}最近趋势`}>
                    {trendRecords.map((record) => {
                      const range = trendRange.max - trendRange.min
                      const height = range
                        ? 24 + ((record.canonicalValue - trendRange.min) / range) * 62
                        : 55
                      return (
                        <View className="trend-column" key={record.id}>
                          <Text className="trend-column__value metric">
                            {Number(record.displayValue).toLocaleString('zh-CN', {
                              maximumFractionDigits: 1,
                            })}
                          </Text>
                          <View className="trend-column__track">
                            <View className="trend-column__bar" style={{ height: `${height}px` }} />
                          </View>
                          <Text className="trend-column__date">
                            {dateTime(record.occurredAt).slice(0, 5)}
                          </Text>
                        </View>
                      )
                    })}
                  </View>
                ) : (
                  <View className="trend-empty">保存第一笔后，这里会逐步长出属于你的趋势。</View>
                )}
                <Button
                  {...buttonA11yProps}
                  className="trend-observation-link"
                  aria-label={`查看${activeDefinition.label}长期观察`}
                  onClick={() =>
                    void Taro.navigateTo({
                      url: `/pages/health-insights/index?metric=${draft.metric}`,
                    })
                  }
                >
                  查看 7 / 30 / 90 天观察 →
                </Button>
              </View>
            </View>

            <View className="records-layout__log section-card">
              <View className="log-heading">
                <View>
                  <Text className="panel-eyebrow">RECENT LOG</Text>
                  <Text className="panel-title">最近记录</Text>
                </View>
                <View className="log-heading__tools">
                  <Text className="log-heading__count metric">
                    {readAuthorityReady
                      ? `已载入 ${groupRecords.length}`
                      : hasReadSnapshot
                        ? `保留 ${groupRecords.length}`
                        : '尚未核对'}
                  </Text>
                  {readPhase === 'ready' || readPhase === 'refreshing' ? (
                    <Button
                      id="record-read-refresh"
                      className="record-read-refresh"
                      aria-label="更新身体记录清单"
                      {...buttonActivationProps(
                        () => void loadRecords(),
                        loading || loadingMore || saving,
                      )}
                    >
                      {loading ? '核对中…' : '更新记录'}
                    </Button>
                  ) : null}
                </View>
              </View>

              {loading && !hasReadSnapshot ? (
                <View className="log-state">正在整理记录…</View>
              ) : !hasReadSnapshot ? (
                <View className="log-state">
                  <Text className="log-state__mark">?</Text>
                  <Text className="log-state__title">记录数量尚未核对</Text>
                  <Text className="log-state__body">
                    重新核对成功后，才会显示当前记录或空状态。
                  </Text>
                </View>
              ) : groupRecords.length ? (
                <View className="log-list">
                  {groupRecords.map((record) => (
                    <View className="log-entry" key={record.id}>
                      <View className="log-entry__accent" aria-hidden="true" />
                      <View className="log-entry__main">
                        <View className="log-entry__heading">
                          <Text className="log-entry__metric">
                            {metricUiDefinitions[record.metric].label}
                          </Text>
                          <Text className="log-entry__time">{dateTime(record.occurredAt)}</Text>
                        </View>
                        <Text className="log-entry__value metric">{formatRecordValue(record)}</Text>
                        <View className="log-entry__meta">
                          <Text>手动 · 已确认</Text>
                          <Text>v{record.revision}</Text>
                        </View>
                        <View className="log-entry__actions">
                          <Button
                            {...buttonA11yProps}
                            className="log-action"
                            disabled={!readAuthorityReady}
                            aria-disabled={!readAuthorityReady}
                            onClick={() => startEdit(record)}
                          >
                            修改
                          </Button>
                          <Button
                            id={`health-history-trigger-${record.id}`}
                            className="log-action"
                            disabled={!readAuthorityReady}
                            {...buttonActivationProps(
                              () => historyRead.open(record, `health-history-trigger-${record.id}`),
                              !readAuthorityReady,
                            )}
                          >
                            历史
                          </Button>
                          <Button
                            id={`health-delete-trigger-${record.id}`}
                            className="log-action log-action--danger"
                            disabled={!readAuthorityReady}
                            {...buttonActivationProps(
                              () => requestDelete(record),
                              !readAuthorityReady,
                            )}
                          >
                            删除
                          </Button>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View className="log-state">
                  <Text className="log-state__mark">＋</Text>
                  <Text className="log-state__title">
                    还没有{group === 'body' ? '身体' : '恢复'}记录
                  </Text>
                  <Text className="log-state__body">从左侧选择一项，写下今天的第一笔。</Text>
                </View>
              )}
              {nextCursor ? (
                <Button
                  {...buttonA11yProps}
                  className="record-page-more"
                  disabled={loadingMore || !readAuthorityReady}
                  aria-disabled={loadingMore || !readAuthorityReady}
                  onClick={() => void loadOlderRecords()}
                >
                  {loadingMore ? '正在载入…' : '继续载入更早记录'}
                </Button>
              ) : records.length ? (
                <Text className="record-page-end">已载入当前全部记录</Text>
              ) : null}
            </View>
          </View>

          <Text className="records-safety">
            异常或持续不适请咨询专业医疗人员；本工具不提供诊断。
          </Text>
        </View>
      </ScrollView>

      {deleting ? (
        <View
          className="modal-layer"
          role="dialog"
          aria-modal="true"
          aria-label="确认删除记录"
          {...escapeDismissProps(cancelDelete, saving)}
        >
          <View className="modal-card">
            <Text className="panel-eyebrow">REMOVE ENTRY</Text>
            <Text className="modal-card__title">
              删除这条{metricUiDefinitions[deleting.metric].label}记录？
            </Text>
            <Text className="modal-card__body">
              它会从日常列表移除，但修改轨迹会保留用于数据审计。
            </Text>
            <View className="modal-card__actions">
              <Button
                id="health-delete-cancel"
                className="modal-button"
                disabled={saving}
                {...buttonActivationProps(cancelDelete, saving)}
              >
                取消
              </Button>
              <Button
                className="modal-button modal-button--danger"
                disabled={saving || !readAuthorityReady}
                {...buttonActivationProps(
                  () => void confirmDelete(),
                  saving || !readAuthorityReady,
                )}
              >
                确认删除
              </Button>
            </View>
          </View>
        </View>
      ) : null}

      {historyRead.target ? (
        <View
          className="history-layer"
          role="dialog"
          aria-modal="true"
          aria-label="记录历史"
          {...escapeDismissProps(historyRead.dismiss)}
        >
          <Button
            className="history-layer__scrim"
            aria-label="关闭历史"
            {...buttonActivationProps(historyRead.dismiss)}
          />
          <View className="history-sheet">
            <View className="history-sheet__heading">
              <View>
                <Text className="panel-eyebrow">AUDIT TRAIL</Text>
                <Text className="panel-title">
                  {metricUiDefinitions[historyRead.target.metric].label}历史
                </Text>
              </View>
              <Button
                id="health-history-close"
                className="history-close"
                aria-label="关闭历史"
                {...buttonActivationProps(historyRead.dismiss)}
              >
                ×
              </Button>
            </View>
            <AggregateHistoryReadState
              phase={historyRead.phase}
              failure={historyRead.failure}
              subject="身体记录"
              itemCount={historyRead.items?.length ?? 0}
              retryId="health-history-read-retry"
              onRetry={historyRead.retry}
            />
            {historyRead.items !== undefined ? (
              <View className="history-list">
                {historyRead.items.map((item) => (
                  <View className="history-entry" key={`${item.id}-${item.revision}`}>
                    <View className={`history-entry__dot history-entry__dot--${item.action}`} />
                    <View>
                      <Text className="history-entry__action">{actionLabels[item.action]}</Text>
                      <Text className="history-entry__value metric">{formatRecordValue(item)}</Text>
                      <Text className="history-entry__meta">
                        v{item.revision} · {dateTime(item.changedAt)}
                      </Text>
                    </View>
                  </View>
                ))}
                {historyRead.items.length === 0 ? (
                  <AggregateHistoryEmptyState subject="身体记录" />
                ) : historyRead.nextCursor ? (
                  <Button
                    {...buttonA11yProps}
                    className="record-page-more"
                    disabled={
                      historyRead.busy || historyRead.phase !== 'ready' || !readAuthorityReady
                    }
                    aria-disabled={
                      historyRead.busy || historyRead.phase !== 'ready' || !readAuthorityReady
                    }
                    onClick={historyRead.loadOlder}
                  >
                    {historyRead.busy ? '正在载入…' : '继续载入更早版本'}
                  </Button>
                ) : (
                  <Text className="record-page-end">已载入全部版本</Text>
                )}
              </View>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  )
}

export default RecordsPage
