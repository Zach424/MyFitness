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
import { buttonA11yProps } from '../../lib/accessibility'
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

const ExerciseCatalogPage = () => {
  const requestedEntryId = useRef(Taro.getCurrentInstance().router?.params.entryId ?? '')
  const pendingCreateKey = useRef('')
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

  const patchDraft = (patch: Partial<ExerciseCatalogDraft>) => {
    setDraft((current) => ({ ...current, ...patch }))
    if (!editing) pendingCreateKey.current = ''
  }

  const openEditor = async (entry?: CustomExerciseCatalogEntry) => {
    setEditing(entry)
    setDraft(entry ? exerciseCatalogDraftFromItem(entry) : initialExerciseCatalogDraft())
    setHistory(entry ? undefined : [])
    setHistoryNextCursor(null)
    setHistoryLoadingMore(false)
    setEditorOpen(true)
    setFeedback('')
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
    let active = true
    void listExerciseCatalog()
      .then((result) => {
        if (!active) return
        const custom = result.items.filter(
          (entry): entry is CustomExerciseCatalogEntry => entry.source === 'custom',
        )
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

  const closeEditor = () => {
    setEditorOpen(false)
    setEditing(undefined)
    setHistory(undefined)
    setHistoryNextCursor(null)
    setDraft(initialExerciseCatalogDraft())
    pendingCreateKey.current = ''
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
      closeEditor()
      setFeedback(
        wasCorrection
          ? '动作定义已纠正；训练草稿与历史训练仍保留选择时的快照。'
          : '自定义动作已保存；返回训练页后可搜索并加入当前草稿。',
      )
    } catch (error) {
      setFeedback(messageOf(error))
    } finally {
      setBusy(false)
    }
  }

  const archive = async () => {
    if (!archiving) return
    setBusy(true)
    try {
      await archiveExerciseCatalogEntry(archiving.id, archiving.revision)
      setEntries((current) => current.filter((entry) => entry.id !== archiving.id))
      setArchiving(undefined)
      closeEditor()
      setFeedback('动作已从未来选择中停用；训练草稿、历史训练与修订证据未被改写。')
    } catch (error) {
      setFeedback(messageOf(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View className="food-catalog-page">
      <ScrollView className="food-catalog-scroll" scrollY enhanced showScrollbar={false}>
        <View className="food-catalog-shell">
          <View className="food-catalog-topbar">
            <Button
              {...buttonA11yProps}
              className="food-catalog-back"
              aria-label="返回训练记录"
              onClick={() => void Taro.navigateBack()}
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
              {...buttonA11yProps}
              className="food-catalog-new"
              onClick={() => void openEditor()}
            >
              ＋ 新建动作
            </Button>
            <Text>动作定义用于记录一致性，不代表动作适合性、技术质量或训练建议。</Text>
          </View>

          {feedback ? (
            <View className="food-catalog-feedback" role="status">
              {feedback}
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
                    {...buttonA11yProps}
                    className="food-editor__archive"
                    style={{ color: 'var(--color-pulse)' }}
                    disabled={busy}
                    onClick={() => setArchiving(editing)}
                  >
                    停用
                  </Button>
                ) : null}
                <Button
                  {...buttonA11yProps}
                  className="food-editor__cancel"
                  style={{ color: 'var(--color-muted)' }}
                  disabled={busy}
                  onClick={closeEditor}
                >
                  取消
                </Button>
                <Button
                  {...buttonA11yProps}
                  className="food-editor__save"
                  disabled={busy}
                  onClick={() => void save()}
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
                    {...buttonA11yProps}
                    className="food-register__edit"
                    aria-label={`编辑自定义动作${entry.name}`}
                    onClick={() => void openEditor(entry)}
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
          aria-label="确认停用自定义动作"
        >
          <View className="food-modal__card">
            <Text className="food-catalog-eyebrow">ARCHIVE OWNED MOVEMENT</Text>
            <Text className="food-modal__title">停用“{archiving.name}”？</Text>
            <Text className="food-modal__body">
              它会离开未来可选目录；当前训练草稿、历史训练和版本审计都保持原样。
            </Text>
            <View className="food-modal__actions">
              <Button {...buttonA11yProps} disabled={busy} onClick={() => setArchiving(undefined)}>
                取消
              </Button>
              <Button
                {...buttonA11yProps}
                className="food-modal__danger"
                disabled={busy}
                onClick={() => void archive()}
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
