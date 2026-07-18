import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type {
  HealthRecord,
  HealthRecordHistoryItem,
  MetricCode,
  UnitCode,
} from '@myfitness/contracts'

import { buttonA11yProps } from '../../lib/accessibility'
import {
  ApiError,
  createHealthRecord,
  deleteHealthRecord,
  getHealthRecordHistory,
  listHealthRecords,
  updateHealthRecord,
} from '../../lib/api'
import {
  buildRecordRequest,
  createDraft,
  draftFromRecord,
  formatRecordValue,
  groupMetrics,
  metricUiDefinitions,
  type RecordDraft,
  type RecordGroup,
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

const RecordsPage = () => {
  const [group, setGroup] = useState<RecordGroup>('body')
  const [draft, setDraft] = useState<RecordDraft>(() => createDraft('body.weight'))
  const [records, setRecords] = useState<HealthRecord[]>([])
  const [editing, setEditing] = useState<HealthRecord>()
  const [deleting, setDeleting] = useState<HealthRecord>()
  const [history, setHistory] = useState<HealthRecordHistoryItem[]>()
  const [historyRecord, setHistoryRecord] = useState<HealthRecord>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const requestKey = useRef('')

  const loadRecords = async () => {
    setLoading(true)
    setFeedback('')
    try {
      const result = await listHealthRecords()
      setRecords(result.items)
    } catch (error) {
      setFeedback(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRecords()
  }, [])

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
    setDraft(createDraft(groupMetrics[nextGroup][0]!))
    setFeedback('')
    requestKey.current = ''
  }

  const selectMetric = (metric: MetricCode) => {
    setEditing(undefined)
    setDraft(createDraft(metric))
    setFeedback('')
    requestKey.current = ''
  }

  const save = async () => {
    const validationError = validateRecordDraft(draft)
    if (validationError) {
      setFeedback(validationError)
      return
    }
    setSaving(true)
    setFeedback('')
    try {
      if (editing) {
        const updated = await updateHealthRecord(
          editing.id,
          buildRecordRequest(draft, editing.revision),
        )
        setRecords((current) =>
          current.map((record) => (record.id === updated.id ? updated : record)),
        )
        setEditing(undefined)
        setDraft(createDraft(updated.metric))
        setFeedback('修改已保存，原版本仍保留在历史中。')
      } else {
        if (!requestKey.current) requestKey.current = createRequestKey()
        const created = await createHealthRecord(buildRecordRequest(draft), requestKey.current)
        setRecords((current) => [created, ...current])
        setDraft(createDraft(created.metric))
        requestKey.current = ''
        setFeedback('记录已保存。持续记录比单次数字更有价值。')
      }
    } catch (error) {
      setFeedback(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (record: HealthRecord) => {
    const nextGroup = metricUiDefinitions[record.metric].group
    setGroup(nextGroup)
    setDraft(draftFromRecord(record))
    setEditing(record)
    setFeedback('正在修改这条记录；保存后会新增一个历史版本。')
    requestKey.current = ''
    Taro.pageScrollTo({ scrollTop: 0, duration: 240 })
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setSaving(true)
    try {
      await deleteHealthRecord(deleting.id, deleting.revision)
      setRecords((current) => current.filter((record) => record.id !== deleting.id))
      if (editing?.id === deleting.id) {
        setEditing(undefined)
        setDraft(createDraft(deleting.metric))
      }
      setDeleting(undefined)
      setFeedback('记录已从列表移除，审计历史仍安全保留。')
    } catch (error) {
      setFeedback(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const openHistory = async (record: HealthRecord) => {
    setHistoryRecord(record)
    setHistory(undefined)
    try {
      const result = await getHealthRecordHistory(record.id)
      setHistory(result.items)
    } catch (error) {
      setHistoryRecord(undefined)
      setFeedback(errorMessage(error))
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
                        setEditing(undefined)
                        setDraft(createDraft(draft.metric))
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
                        }}
                      >
                        {unitLabels[unit]}
                      </Button>
                    ))}
                  </View>
                ) : null}

                <View className="editor-meta">
                  <Text>来源 · 手动记录</Text>
                  <Text>{editing ? `版本 ${editing.revision}` : '时间 · 现在'}</Text>
                </View>

                {feedback ? (
                  <View className="record-feedback" role="status">
                    {feedback}
                  </View>
                ) : null}

                <Button
                  {...buttonA11yProps}
                  className="save-button"
                  disabled={saving}
                  onClick={() => void save()}
                >
                  {saving ? '正在保存…' : editing ? '保存新版本' : '保存记录'}
                </Button>
              </View>

              <View className="trend-panel section-card">
                <View className="editor-heading">
                  <View>
                    <Text className="panel-eyebrow">LAST 7 ENTRIES</Text>
                    <Text className="panel-title">{activeDefinition.label}趋势</Text>
                  </View>
                  <Text className="trend-panel__count metric">{trendRecords.length}/7</Text>
                </View>
                {trendRecords.length ? (
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
              </View>
            </View>

            <View className="records-layout__log section-card">
              <View className="log-heading">
                <View>
                  <Text className="panel-eyebrow">RECENT LOG</Text>
                  <Text className="panel-title">最近记录</Text>
                </View>
                <Text className="log-heading__count metric">{groupRecords.length}</Text>
              </View>

              {loading ? (
                <View className="log-state">正在整理记录…</View>
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
                            onClick={() => startEdit(record)}
                          >
                            修改
                          </Button>
                          <Button
                            {...buttonA11yProps}
                            className="log-action"
                            onClick={() => void openHistory(record)}
                          >
                            历史
                          </Button>
                          <Button
                            {...buttonA11yProps}
                            className="log-action log-action--danger"
                            onClick={() => setDeleting(record)}
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
            </View>
          </View>

          <Text className="records-safety">
            异常或持续不适请咨询专业医疗人员；本工具不提供诊断。
          </Text>
        </View>
      </ScrollView>

      {deleting ? (
        <View className="modal-layer" role="dialog" aria-modal="true" aria-label="确认删除记录">
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
                {...buttonA11yProps}
                className="modal-button"
                onClick={() => setDeleting(undefined)}
              >
                取消
              </Button>
              <Button
                {...buttonA11yProps}
                className="modal-button modal-button--danger"
                disabled={saving}
                onClick={() => void confirmDelete()}
              >
                确认删除
              </Button>
            </View>
          </View>
        </View>
      ) : null}

      {historyRecord ? (
        <View className="history-layer" role="dialog" aria-modal="true" aria-label="记录历史">
          <Button
            {...buttonA11yProps}
            className="history-layer__scrim"
            aria-label="关闭历史"
            onClick={() => setHistoryRecord(undefined)}
          />
          <View className="history-sheet">
            <View className="history-sheet__heading">
              <View>
                <Text className="panel-eyebrow">AUDIT TRAIL</Text>
                <Text className="panel-title">
                  {metricUiDefinitions[historyRecord.metric].label}历史
                </Text>
              </View>
              <Button
                {...buttonA11yProps}
                className="history-close"
                aria-label="关闭历史"
                onClick={() => setHistoryRecord(undefined)}
              >
                ×
              </Button>
            </View>
            {history ? (
              <View className="history-list">
                {history.map((item) => (
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
              </View>
            ) : (
              <View className="log-state">正在读取历史…</View>
            )}
          </View>
        </View>
      ) : null}
    </View>
  )
}

export default RecordsPage
