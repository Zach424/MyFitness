import { useEffect, useRef, useState } from 'react'
import { Button, Input, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type {
  CustomExerciseCatalogEntry,
  ExerciseCatalogEntryHistoryItem,
  ExerciseEquipment,
  ExerciseTrackingMode,
} from '@myfitness/contracts'
import { exerciseEquipmentOptions } from '@myfitness/contracts/exercise-catalog.constants'

import { DefinitionRevisionLedger } from '../../components/definition-revision-ledger'
import { buttonA11yProps, buttonActivationProps, deferH5Focus } from '../../lib/accessibility'
import {
  ApiError,
  archiveExerciseCatalogEntry,
  createExerciseCatalogEntry,
  getExerciseCatalogEntryHistory,
  listExerciseCatalog,
  updateExerciseCatalogEntry,
} from '../../lib/api'
import {
  buildExerciseCatalogRequest,
  exerciseCatalogDraftFromItem,
  initialExerciseCatalogDraft,
  type ExerciseCatalogDraft,
  validateExerciseCatalogDraft,
} from './exercise-catalog.model'
import { describeWorkbenchFailure, type WorkbenchRecovery } from '../../lib/workbench-recovery'
import './index.scss'

const categoryLabels = { strength: '力量', cardio: '有氧', mobility: '灵活性' } as const

const trackingLabels: Record<ExerciseTrackingMode, string> = {
  reps_load: '次数 / 负重',
  duration: '时长',
  duration_distance: '时长 / 距离',
}

const equipmentLabels: Record<ExerciseEquipment, string> = {
  bodyweight: '自重',
  dumbbells: '哑铃',
  barbell: '杠铃',
  kettlebell: '壶铃',
  resistance_band: '弹力带',
  bench: '训练凳',
  pull_up_bar: '单杠',
  cable_machine: '绳索器械',
  cardio_machine: '有氧器械',
  bicycle: '自行车',
  open_space: '开放场地',
  other: '其他器械',
}

const messageOf = (error: unknown) =>
  error instanceof ApiError || error instanceof Error ? error.message : '操作失败，请稍后重试'

const requestKey = () =>
  `exercise-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`

const customEntriesFrom = (items: Awaited<ReturnType<typeof listExerciseCatalog>>['items']) =>
  items.filter((entry): entry is CustomExerciseCatalogEntry => entry.source === 'custom')

const entryMatchesDraft = (entry: CustomExerciseCatalogEntry, draft: ExerciseCatalogDraft) => {
  const request = buildExerciseCatalogRequest(draft)
  return (
    entry.name === request.name &&
    JSON.stringify(entry.aliases) === JSON.stringify(request.aliases ?? []) &&
    entry.category === request.category &&
    entry.trackingMode === request.trackingMode &&
    JSON.stringify(entry.equipment) === JSON.stringify(request.equipment) &&
    (entry.equipmentNotes ?? '') === (request.equipmentNotes ?? '')
  )
}

const ExerciseCatalogPage = () => {
  const requestedEntryId = useRef(Taro.getCurrentInstance().router?.params.entryId ?? '')
  const pendingCreateKey = useRef('')
  const archiveReturnFocusId = useRef('')
  const editorReturnFocusId = useRef('exercise-new-action')
  const [entries, setEntries] = useState<CustomExerciseCatalogEntry[]>([])
  const [editing, setEditing] = useState<CustomExerciseCatalogEntry>()
  const [archiving, setArchiving] = useState<CustomExerciseCatalogEntry>()
  const [history, setHistory] = useState<ExerciseCatalogEntryHistoryItem[]>()
  const [historyNextCursor, setHistoryNextCursor] = useState<string | null>(null)
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false)
  const [draft, setDraft] = useState<ExerciseCatalogDraft>(initialExerciseCatalogDraft)
  const [editorOpen, setEditorOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [recovery, setRecovery] = useState<WorkbenchRecovery>()

  const patchDraft = (patch: Partial<ExerciseCatalogDraft>) => {
    setDraft((current) => ({ ...current, ...patch }))
    if (!editing) pendingCreateKey.current = ''
    setRecovery(undefined)
    setFeedback('')
  }

  const openEditor = async (entry?: CustomExerciseCatalogEntry) => {
    editorReturnFocusId.current = entry ? `exercise-edit-${entry.id}` : 'exercise-new-action'
    setEditing(entry)
    setDraft(entry ? exerciseCatalogDraftFromItem(entry) : initialExerciseCatalogDraft())
    setHistory(entry ? undefined : [])
    setHistoryNextCursor(null)
    setHistoryLoadingMore(false)
    setEditorOpen(true)
    setFeedback('')
    setRecovery(undefined)
    pendingCreateKey.current = ''
    if (!entry) return
    try {
      const result = await getExerciseCatalogEntryHistory(entry.id, { limit: 10 })
      setHistory(result.items)
      setHistoryNextCursor(result.nextCursor)
    } catch (error) {
      setHistory([])
      setFeedback(messageOf(error))
    }
  }

  const loadOlderHistory = async () => {
    if (!editing || !historyNextCursor || historyLoadingMore) return
    setHistoryLoadingMore(true)
    try {
      const result = await getExerciseCatalogEntryHistory(editing.id, {
        limit: 10,
        cursor: historyNextCursor,
      })
      setHistory((current) => [...(current ?? []), ...result.items])
      setHistoryNextCursor(result.nextCursor)
    } catch (error) {
      setFeedback(messageOf(error))
    } finally {
      setHistoryLoadingMore(false)
    }
  }

  useEffect(() => {
    deferH5Focus('exercise-catalog-back', 350)
    let active = true
    void listExerciseCatalog()
      .then((result) => {
        if (!active) return
        const custom = customEntriesFrom(result.items)
        setEntries(custom)
        const requested = custom.find((entry) => entry.id === requestedEntryId.current)
        if (requested) void openEditor(requested)
      })
      .catch((error: unknown) => {
        if (active) setFeedback(messageOf(error))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (archiving) deferH5Focus('exercise-archive-cancel')
  }, [archiving])

  const closeEditor = (restoreFocus = true) => {
    const returnTarget = editorReturnFocusId.current
    setEditorOpen(false)
    setEditing(undefined)
    setHistory(undefined)
    setHistoryNextCursor(null)
    setDraft(initialExerciseCatalogDraft())
    pendingCreateKey.current = ''
    setRecovery(undefined)
    if (restoreFocus) deferH5Focus(returnTarget)
  }

  const toggleEquipment = (equipment: ExerciseEquipment) => {
    patchDraft({
      equipment: draft.equipment.includes(equipment)
        ? draft.equipment.filter((item) => item !== equipment)
        : [...draft.equipment, equipment],
    })
  }

  const save = async () => {
    const validation = validateExerciseCatalogDraft(draft)
    if (validation) {
      setFeedback(validation)
      return
    }
    setBusy(true)
    setFeedback('')
    try {
      const request = buildExerciseCatalogRequest(draft)
      const wasCorrection = Boolean(editing)
      const saved = editing
        ? await updateExerciseCatalogEntry(editing.id, {
            ...request,
            expectedRevision: editing.revision,
          })
        : await createExerciseCatalogEntry(request, (pendingCreateKey.current ||= requestKey()))
      setEntries((current) => [saved, ...current.filter((entry) => entry.id !== saved.id)])
      setRecovery(undefined)
      closeEditor()
      setFeedback(
        wasCorrection
          ? '动作定义已纠正；训练草稿与历史训练仍保留选择时的快照。'
          : '自定义动作已保存；返回训练页后可搜索并加入当前草稿。',
      )
    } catch (error) {
      setRecovery(describeWorkbenchFailure(editing ? 'action_update' : 'action_create', error))
    } finally {
      setBusy(false)
    }
  }

  const reconcileDefinition = async () => {
    if (!recovery || recovery.operation !== 'action_update' || !editing) return
    setBusy(true)
    try {
      const result = await listExerciseCatalog()
      const custom = customEntriesFrom(result.items)
      const current = custom.find((entry) => entry.id === editing.id)
      setEntries(custom)
      if (!current) {
        setRecovery({
          ...recovery,
          authority: 'terminal',
          eyebrow: 'CURRENT STATE / 定义已不可编辑',
          message:
            '核对后，服务端当前目录已没有这条可编辑定义。页面仍保留输入，但不会把上次纠正报告为成功；请取消并重新检查目录。',
          actionLabel: '返回检查目录',
        })
        return
      }
      if (current.revision > editing.revision && entryMatchesDraft(current, draft)) {
        closeEditor()
        setFeedback(`核对完成：服务端 R${current.revision} 与保留输入一致，上次纠正已经提交。`)
        return
      }
      setEditing(current)
      setRecovery(undefined)
      setFeedback(
        current.revision === editing.revision
          ? `核对完成：服务端仍为 R${current.revision}，没有纠正成功的证据；输入已保留，可重新明确保存。`
          : `核对完成：服务端已到 R${current.revision} 且内容不同；输入已保留，请重新检查后再保存。`,
      )
    } catch (error) {
      setRecovery(describeWorkbenchFailure('action_update', error))
    } finally {
      setBusy(false)
    }
  }

  const reconcileArchive = async () => {
    if (!recovery || recovery.operation !== 'action_archive' || !archiving) return
    setBusy(true)
    try {
      const result = await listExerciseCatalog()
      const custom = customEntriesFrom(result.items)
      const current = custom.find((entry) => entry.id === archiving.id)
      setEntries(custom)
      setRecovery(undefined)
      setArchiving(undefined)
      if (!current) {
        closeEditor(false)
        setFeedback('核对完成：服务端当前目录已不再包含此动作；仅据此确认它不会用于未来选择。')
        archiveReturnFocusId.current = ''
        deferH5Focus('exercise-new-action')
        return
      }
      setEditing(current)
      setFeedback(
        '核对完成：服务端仍显示此动作可用，本次停用没有成功证据；如仍需停用，请再次明确确认。',
      )
      deferH5Focus(`exercise-archive-${current.id}`)
    } catch (error) {
      setRecovery(describeWorkbenchFailure('action_archive', error))
    } finally {
      setBusy(false)
    }
  }

  const handleRecoveryAction = () => {
    if (!recovery) return
    if (recovery.authority === 'terminal') {
      const operation = recovery.operation
      setRecovery(undefined)
      setFeedback('当前尝试已终止；输入仍保留，请检查后重新开始。')
      if (operation === 'action_archive') {
        cancelArchive()
        return
      }
      deferH5Focus('exercise-action-name')
      return
    }
    if (recovery.authority === 'retry_same_request' && recovery.operation === 'action_create') {
      void save()
      return
    }
    if (recovery.operation === 'action_update') {
      void reconcileDefinition()
      return
    }
    if (recovery.operation === 'action_archive') {
      void reconcileArchive()
      return
    }
  }

  const archive = async () => {
    if (!archiving) return
    setBusy(true)
    try {
      await archiveExerciseCatalogEntry(archiving.id, archiving.revision)
      setEntries((current) => current.filter((entry) => entry.id !== archiving.id))
      setArchiving(undefined)
      setRecovery(undefined)
      closeEditor(false)
      setFeedback('动作已从未来选择中停用；训练草稿、历史训练与修订证据未被改写。')
      archiveReturnFocusId.current = ''
      deferH5Focus('exercise-new-action')
    } catch (error) {
      setRecovery(describeWorkbenchFailure('action_archive', error))
    } finally {
      setBusy(false)
    }
  }

  const requestArchive = (entry: CustomExerciseCatalogEntry) => {
    archiveReturnFocusId.current = `exercise-archive-${entry.id}`
    setArchiving(entry)
    setRecovery(undefined)
  }

  const cancelArchive = () => {
    const returnTarget = archiveReturnFocusId.current
    archiveReturnFocusId.current = ''
    setArchiving(undefined)
    if (recovery?.operation === 'action_archive') setRecovery(undefined)
    if (returnTarget) deferH5Focus(returnTarget)
  }

  return (
    <View className="food-catalog-page">
      <ScrollView className="food-catalog-scroll" scrollY enhanced showScrollbar={false}>
        <View className="food-catalog-shell">
          <View className="food-catalog-topbar">
            <Button
              {...buttonActivationProps(() => void Taro.navigateBack())}
              id="exercise-catalog-back"
              className="food-catalog-back"
              aria-label="返回训练记录"
            >
              ←
            </Button>
            <View>
              <Text className="food-catalog-wordmark">衡迹</Text>
              <Text className="food-catalog-eyebrow">OWNED MOVEMENT REGISTER</Text>
            </View>
            <Text className="food-catalog-count metric">{entries.length}</Text>
          </View>

          <View className="food-catalog-hero">
            <Text className="food-catalog-eyebrow">DEFINE · CORRECT · SNAPSHOT</Text>
            <Text className="food-catalog-title">
              我的动作，是可修订的定义，不是会漂移的训练事实。
            </Text>
            <Text className="food-catalog-intro">
              这里维护名称、别名、记录方式与器械。加入训练时会复制当时的定义；后续纠正不会改写草稿或历史训练。
            </Text>
          </View>

          <View className="food-catalog-actions">
            <Button
              {...buttonActivationProps(() => void openEditor())}
              id="exercise-new-action"
              className="food-catalog-new"
            >
              ＋ 新建动作
            </Button>
            <Text>动作定义用于记录一致性，不代表动作适合性、技术质量或训练建议。</Text>
          </View>

          {feedback ? (
            <View
              className="food-catalog-feedback"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {feedback}
            </View>
          ) : null}

          {recovery && recovery.operation !== 'action_archive' ? (
            <View
              className="workbench-recovery"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <Text className="workbench-recovery__eyebrow">{recovery.eyebrow}</Text>
              <Text className="workbench-recovery__message">{recovery.message}</Text>
              <Button
                {...buttonActivationProps(handleRecoveryAction, busy)}
                className="workbench-recovery__action"
                style={{ color: 'var(--color-warning)' }}
                disabled={busy}
              >
                {busy ? '处理中…' : recovery.actionLabel}
              </Button>
            </View>
          ) : null}

          {editorOpen ? (
            <View className="food-editor" aria-label="自定义动作编辑器">
              <Text className="food-catalog-eyebrow">
                {editing ? `CORRECT DEFINITION / R${editing.revision}` : 'NEW OWNED MOVEMENT'}
              </Text>
              <Text className="food-editor__title">
                {editing ? '纠正只影响未来选择' : '保存一条可复用动作定义'}
              </Text>
              <Text className="food-editor__notice">
                保存的是你确认的描述性信息，不会自动改变训练规划或生成安全结论。
              </Text>

              <View className="food-editor__grid">
                <View className="food-editor__field">
                  <Text>动作名称</Text>
                  <Input
                    id="exercise-action-name"
                    className="food-editor__input"
                    value={draft.name}
                    maxlength={80}
                    placeholder="例如：壶铃摆动"
                    aria-label="自定义动作名称"
                    onInput={(event) => patchDraft({ name: event.detail.value })}
                  />
                </View>
                <View className="food-editor__field">
                  <Text>别名（逗号分隔，可选）</Text>
                  <Input
                    className="food-editor__input"
                    value={draft.aliases}
                    maxlength={240}
                    placeholder="例如：Kettlebell Swing，KB Swing"
                    aria-label="自定义动作别名"
                    onInput={(event) => patchDraft({ aliases: event.detail.value })}
                  />
                </View>
                <View className="food-editor__field food-editor__field--wide">
                  <Text>器械说明（选择“其他器械”时必填）</Text>
                  <Input
                    className="food-editor__input"
                    value={draft.equipmentNotes}
                    maxlength={120}
                    placeholder="例如：固定地雷管装置"
                    aria-label="自定义动作器械说明"
                    onInput={(event) => patchDraft({ equipmentNotes: event.detail.value })}
                  />
                </View>
              </View>

              <View className="food-editor__field exercise-choice-block">
                <Text>动作类别</Text>
                <View className="food-editor__categories" aria-label="动作类别">
                  {(['strength', 'cardio', 'mobility'] as const).map((category) => (
                    <Button
                      {...buttonA11yProps}
                      className={`food-editor__category ${draft.category === category ? 'food-editor__category--active' : ''}`}
                      key={category}
                      aria-pressed={draft.category === category}
                      onClick={() => patchDraft({ category })}
                    >
                      {categoryLabels[category]}
                    </Button>
                  ))}
                </View>
              </View>

              <View className="food-editor__field exercise-choice-block">
                <Text>记录方式</Text>
                <View className="food-editor__categories" aria-label="记录方式">
                  {(Object.keys(trackingLabels) as ExerciseTrackingMode[]).map((trackingMode) => (
                    <Button
                      {...buttonA11yProps}
                      className={`food-editor__category ${draft.trackingMode === trackingMode ? 'food-editor__category--active' : ''}`}
                      key={trackingMode}
                      aria-pressed={draft.trackingMode === trackingMode}
                      onClick={() => patchDraft({ trackingMode })}
                    >
                      {trackingLabels[trackingMode]}
                    </Button>
                  ))}
                </View>
              </View>

              <View className="food-editor__field exercise-choice-block">
                <Text>所需器械（可多选）</Text>
                <View className="food-editor__categories" aria-label="所需器械">
                  {exerciseEquipmentOptions.map((equipment) => (
                    <Button
                      {...buttonA11yProps}
                      className={`food-editor__category ${draft.equipment.includes(equipment) ? 'food-editor__category--active' : ''}`}
                      key={equipment}
                      aria-pressed={draft.equipment.includes(equipment)}
                      onClick={() => toggleEquipment(equipment)}
                    >
                      {equipmentLabels[equipment]}
                    </Button>
                  ))}
                </View>
              </View>

              {editing ? (
                <DefinitionRevisionLedger
                  items={history}
                  nextCursor={historyNextCursor}
                  loadingMore={historyLoadingMore}
                  onLoadOlder={loadOlderHistory}
                />
              ) : null}

              <View className="food-editor__actions">
                {editing ? (
                  <Button
                    {...buttonActivationProps(() => requestArchive(editing), busy)}
                    id={`exercise-archive-${editing.id}`}
                    className="food-editor__archive"
                    style={{ color: 'var(--color-pulse)' }}
                    disabled={busy}
                  >
                    停用
                  </Button>
                ) : null}
                <Button
                  {...buttonA11yProps}
                  className="food-editor__cancel"
                  style={{ color: 'var(--color-muted)' }}
                  disabled={busy}
                  onClick={() => closeEditor()}
                >
                  取消
                </Button>
                <Button
                  {...buttonActivationProps(() => void save(), busy || Boolean(recovery))}
                  className="food-editor__save"
                  disabled={busy || Boolean(recovery)}
                >
                  {busy ? '保存中…' : editing ? '保存纠正' : '保存定义'}
                </Button>
              </View>
            </View>
          ) : null}

          <View className="food-register">
            <View className="food-register__heading">
              <View>
                <Text className="food-catalog-eyebrow">ACTIVE DEFINITIONS</Text>
                <Text className="food-register__title">当前目录</Text>
              </View>
              <Text className="metric">{entries.length}</Text>
            </View>
            {loading ? (
              <View className="food-register__empty">正在读取目录…</View>
            ) : entries.length ? (
              entries.map((entry) => (
                <View className="food-register__item" key={entry.id}>
                  <View>
                    <Text className="food-register__name">{entry.name}</Text>
                    <Text className="food-register__meta">
                      R{entry.revision} · {categoryLabels[entry.category]} ·{' '}
                      {trackingLabels[entry.trackingMode]}
                    </Text>
                    <Text className="food-register__reference">
                      {entry.equipment.map((value) => equipmentLabels[value]).join(' / ')}
                    </Text>
                  </View>
                  <Button
                    {...buttonActivationProps(() => void openEditor(entry))}
                    id={`exercise-edit-${entry.id}`}
                    className="food-register__edit"
                    aria-label={`编辑自定义动作${entry.name}`}
                  >
                    修订
                  </Button>
                </View>
              ))
            ) : (
              <View className="food-register__empty">
                还没有自定义动作。先建立一条适合你记录习惯的定义。
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {archiving ? (
        <View
          className="food-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="exercise-archive-title"
          aria-describedby="exercise-archive-description"
        >
          <View className="food-modal__card">
            <Text className="food-catalog-eyebrow">ARCHIVE OWNED MOVEMENT</Text>
            <Text id="exercise-archive-title" className="food-modal__title">
              停用“{archiving.name}”？
            </Text>
            <Text id="exercise-archive-description" className="food-modal__body">
              它会离开未来可选目录；当前训练草稿、历史训练和版本审计都保持原样。
            </Text>
            {recovery?.operation === 'action_archive' ? (
              <View
                className="workbench-recovery workbench-recovery--modal"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <Text className="workbench-recovery__eyebrow">{recovery.eyebrow}</Text>
                <Text className="workbench-recovery__message">{recovery.message}</Text>
                <Button
                  {...buttonActivationProps(handleRecoveryAction, busy)}
                  className="workbench-recovery__action"
                  style={{ color: 'var(--color-warning)' }}
                  disabled={busy}
                >
                  {busy ? '核对中…' : recovery.actionLabel}
                </Button>
              </View>
            ) : null}
            <View className="food-modal__actions">
              <Button
                {...buttonActivationProps(cancelArchive, busy)}
                id="exercise-archive-cancel"
                style={{ color: 'var(--color-muted)' }}
                disabled={busy}
              >
                取消
              </Button>
              <Button
                {...buttonActivationProps(() => void archive(), busy || Boolean(recovery))}
                className="food-modal__danger"
                style={{ color: 'var(--color-pulse)' }}
                disabled={busy || Boolean(recovery)}
              >
                {busy ? '停用中…' : '确认停用'}
              </Button>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  )
}

export default ExerciseCatalogPage
