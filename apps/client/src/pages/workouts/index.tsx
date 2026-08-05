import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, ScrollView, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type {
  CustomExerciseCatalogEntry,
  ExerciseCatalogEntryHistoryItem,
  ExerciseCatalogItem,
  ExerciseEquipment,
  Workout,
  WorkoutHistoryItem,
} from '@myfitness/contracts'
import { exerciseEquipmentOptions } from '@myfitness/contracts/exercise-catalog.constants'

import { buttonA11yProps } from '../../lib/accessibility'
import { DefinitionRevisionLedger } from '../../components/definition-revision-ledger'
import { parseBackfillIntent } from '../../lib/backfill-intent'
import { LocalDraftNotice } from '../../components/local-draft-notice'
import { OccurrenceField } from '../../components/occurrence-field'
import { currentCorrectionTarget } from '../../lib/correction-draft'
import {
  ApiError,
  archiveExerciseCatalogEntry,
  createExerciseCatalogEntry,
  createWorkout,
  deleteWorkout,
  getExerciseCatalogEntryHistory,
  getWorkout,
  getWorkoutHistory,
  listExerciseCatalog,
  listWorkouts,
  updateExerciseCatalogEntry,
  updateWorkout,
} from '../../lib/api'
import { appendOlderRecords, includeExactRecord } from '../../lib/record-pages'
import { useRecoverableDraft } from '../../lib/use-local-draft'
import {
  buildExerciseCatalogRequest,
  buildWorkoutRequest,
  createExerciseDraft,
  draftFromWorkout,
  exerciseCatalogDraftFromItem,
  exerciseMode,
  filterExerciseCatalog,
  initialExerciseCatalogDraft,
  initialWorkoutDraft,
  isWorkoutDraft,
  type ExerciseCatalogDraft,
  type WorkoutDraft,
  validateExerciseCatalogDraft,
  workoutDraftSummary,
  validateWorkoutDraft,
} from './workout.model'
import './index.scss'

const actionLabels: Record<WorkoutHistoryItem['action'], string> = {
  created: '创建训练',
  updated: '修改训练',
  deleted: '删除训练',
}

const displayTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))

const requestKey = () =>
  `workout-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`

const messageOf = (error: unknown) =>
  error instanceof ApiError || error instanceof Error ? error.message : '操作失败，请稍后重试'

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

const categoryLabels = { strength: '力量', cardio: '有氧', mobility: '灵活性' } as const
const trackingLabels = {
  reps_load: '次数 / 负重',
  duration: '时长',
  duration_distance: '时长 / 距离',
} as const

const catalogRequestKey = () =>
  `exercise-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`

const WorkoutsPage = () => {
  const backfill = useRef(parseBackfillIntent(Taro.getCurrentInstance().router?.params)).current
  const [draft, setDraft] = useState<WorkoutDraft>(() => {
    const next = initialWorkoutDraft()
    if (backfill) {
      next.startedLocal = backfill.localDate
      next.timezone = backfill.timezone
    }
    return next
  })
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [catalogItems, setCatalogItems] = useState<ExerciseCatalogItem[]>([])
  const [catalogQuery, setCatalogQuery] = useState('')
  const [catalogEditorOpen, setCatalogEditorOpen] = useState(false)
  const [catalogEditing, setCatalogEditing] = useState<CustomExerciseCatalogEntry>()
  const [catalogHistory, setCatalogHistory] = useState<ExerciseCatalogEntryHistoryItem[]>()
  const [catalogHistoryNextCursor, setCatalogHistoryNextCursor] = useState<string | null>(null)
  const [catalogHistoryLoadingMore, setCatalogHistoryLoadingMore] = useState(false)
  const [catalogDraft, setCatalogDraft] = useState<ExerciseCatalogDraft>(
    initialExerciseCatalogDraft,
  )
  const [editing, setEditing] = useState<Workout>()
  const [deleting, setDeleting] = useState<Workout>()
  const [historyWorkout, setHistoryWorkout] = useState<Workout>()
  const [history, setHistory] = useState<WorkoutHistoryItem[]>()
  const [historyNextCursor, setHistoryNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const pendingKey = useRef('')
  const pendingCatalogKey = useRef('')

  useEffect(() => {
    void (async () => {
      try {
        const [workoutResult, catalogResult] = await Promise.all([
          listWorkouts({ limit: 20 }),
          listExerciseCatalog(),
        ])
        setWorkouts(workoutResult.items)
        setNextCursor(workoutResult.nextCursor)
        setCatalogItems(catalogResult.items)
      } catch (error) {
        setFeedback(messageOf(error))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const loadOlderWorkouts = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const result = await listWorkouts({ limit: 20, cursor: nextCursor })
      setWorkouts((current) => appendOlderRecords(current, result.items))
      setNextCursor(result.nextCursor)
    } catch (error) {
      setFeedback(messageOf(error))
    } finally {
      setLoadingMore(false)
    }
  }

  const recoverableDraft = useRecoverableDraft({
    kind: 'workout',
    draft,
    enabled: true,
    dirty:
      JSON.stringify(draft) !==
      JSON.stringify(editing ? draftFromWorkout(editing) : initialWorkoutDraft()),
    validate: isWorkoutDraft,
  })

  const restorePendingDraft = async () => {
    const pending = recoverableDraft.pending
    if (!pending) return
    const correction = pending.payload.correction
    if (!correction) {
      const restored = recoverableDraft.restore()
      if (!restored) return
      setDraft(restored)
      pendingKey.current = ''
      setFeedback('本地草稿已恢复；保存前请重新核对完成组、负重与感受。')
      return
    }
    try {
      const exact = await getWorkout(correction.aggregateId)
      const target = currentCorrectionTarget([exact], correction)
      if (!target) {
        recoverableDraft.clear()
        setFeedback('这份修改基于旧版本或已删除训练，已安全放弃；当前训练没有被覆盖。')
        return
      }
      setWorkouts((current) => includeExactRecord(current, target))
      const restored = recoverableDraft.restore()
      if (!restored) return
      setEditing(target)
      setDraft(restored)
      pendingKey.current = ''
      setFeedback(`已恢复基于 R${correction.baseRevision} 的训练修改；保存仍会校验当前版本。`)
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 404) {
        recoverableDraft.clear()
        setFeedback('这份修改对应的训练已删除，已安全放弃；当前训练没有被覆盖。')
        return
      }
      setFeedback(`暂时无法核对原训练，修改草稿仍保留。${messageOf(error)}`)
    }
  }

  const summary = useMemo(() => workoutDraftSummary(draft), [draft])
  const filteredCatalog = useMemo(
    () => filterExerciseCatalog(catalogItems, catalogQuery).slice(0, 30),
    [catalogItems, catalogQuery],
  )

  const updateSet = (
    exerciseIndex: number,
    setIndex: number,
    field: 'reps' | 'load' | 'durationMinutes' | 'distanceKm' | 'rpe' | 'completed',
    value: string | boolean,
  ) => {
    setDraft((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, currentExerciseIndex) =>
        currentExerciseIndex === exerciseIndex
          ? {
              ...exercise,
              sets: exercise.sets.map((set, currentSetIndex) =>
                currentSetIndex === setIndex ? { ...set, [field]: value } : set,
              ),
            }
          : exercise,
      ),
    }))
    pendingKey.current = ''
  }

  const addExercise = (item: ExerciseCatalogItem) => {
    if (draft.exercises.some((exercise) => exercise.exerciseKey === item.key)) {
      setFeedback(`${item.name}已经在本次训练中。`)
      return
    }
    setDraft((current) => ({
      ...current,
      exercises: [...current.exercises, createExerciseDraft(item)],
    }))
    setFeedback('')
    pendingKey.current = ''
  }

  const patchCatalogDraft = (patch: Partial<ExerciseCatalogDraft>) => {
    setCatalogDraft((current) => ({ ...current, ...patch }))
    if (!catalogEditing) pendingCatalogKey.current = ''
  }

  const openCatalogEditor = async (item?: CustomExerciseCatalogEntry) => {
    setCatalogEditing(item)
    setCatalogDraft(item ? exerciseCatalogDraftFromItem(item) : initialExerciseCatalogDraft())
    setCatalogHistory(item ? undefined : [])
    setCatalogHistoryNextCursor(null)
    setCatalogHistoryLoadingMore(false)
    setCatalogEditorOpen(true)
    pendingCatalogKey.current = ''
    setFeedback('')
    if (!item) return
    try {
      const result = await getExerciseCatalogEntryHistory(item.id, { limit: 10 })
      setCatalogHistory(result.items)
      setCatalogHistoryNextCursor(result.nextCursor)
    } catch (error) {
      setCatalogHistory([])
      setFeedback(messageOf(error))
    }
  }

  const loadOlderCatalogHistory = async () => {
    if (!catalogEditing || !catalogHistoryNextCursor || catalogHistoryLoadingMore) return
    setCatalogHistoryLoadingMore(true)
    try {
      const result = await getExerciseCatalogEntryHistory(catalogEditing.id, {
        limit: 10,
        cursor: catalogHistoryNextCursor,
      })
      setCatalogHistory((current) => [...(current ?? []), ...result.items])
      setCatalogHistoryNextCursor(result.nextCursor)
    } catch (error) {
      setFeedback(messageOf(error))
    } finally {
      setCatalogHistoryLoadingMore(false)
    }
  }

  const closeCatalogEditor = () => {
    setCatalogEditorOpen(false)
    setCatalogEditing(undefined)
    setCatalogHistory(undefined)
    setCatalogHistoryNextCursor(null)
    setCatalogDraft(initialExerciseCatalogDraft())
    pendingCatalogKey.current = ''
  }

  const toggleCatalogEquipment = (equipment: ExerciseEquipment) => {
    patchCatalogDraft({
      equipment: catalogDraft.equipment.includes(equipment)
        ? catalogDraft.equipment.filter((item) => item !== equipment)
        : [...catalogDraft.equipment, equipment],
    })
  }

  const saveCatalogDefinition = async () => {
    const validation = validateExerciseCatalogDraft(catalogDraft)
    if (validation) {
      setFeedback(validation)
      return
    }
    setSaving(true)
    setFeedback('')
    try {
      const request = buildExerciseCatalogRequest(catalogDraft)
      const saved = catalogEditing
        ? await updateExerciseCatalogEntry(catalogEditing.id, {
            ...request,
            expectedRevision: catalogEditing.revision,
          })
        : await createExerciseCatalogEntry(
            request,
            (pendingCatalogKey.current ||= catalogRequestKey()),
          )
      setCatalogItems((current) => {
        const exists = current.some((item) => item.id === saved.id)
        return exists
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [saved, ...current]
      })
      closeCatalogEditor()
      setCatalogQuery(saved.name)
      setFeedback(
        catalogEditing
          ? '动作定义已更新；已保存训练和当前训练草稿仍保留原快照。'
          : '自定义动作已加入你的目录，可以搜索并复用。',
      )
    } catch (error) {
      setFeedback(messageOf(error))
    } finally {
      setSaving(false)
    }
  }

  const archiveCatalogDefinition = async () => {
    if (!catalogEditing) return
    setSaving(true)
    try {
      await archiveExerciseCatalogEntry(catalogEditing.id, catalogEditing.revision)
      setCatalogItems((current) => current.filter((item) => item.id !== catalogEditing.id))
      closeCatalogEditor()
      setCatalogQuery('')
      setFeedback('动作已从未来选择中停用；当前草稿和历史训练快照没有被改写。')
    } catch (error) {
      setFeedback(messageOf(error))
    } finally {
      setSaving(false)
    }
  }

  const removeExercise = (index: number) => {
    setDraft((current) => ({
      ...current,
      exercises: current.exercises.filter((_, currentIndex) => currentIndex !== index),
    }))
    pendingKey.current = ''
  }

  const addSet = (exerciseIndex: number) => {
    setDraft((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, index) => {
        if (index !== exerciseIndex) return exercise
        const previous = exercise.sets[exercise.sets.length - 1]
        return {
          ...exercise,
          sets: [
            ...exercise.sets,
            previous
              ? { ...previous, completed: true }
              : {
                  reps: '10',
                  load: '0',
                  durationMinutes: '',
                  distanceKm: '',
                  rpe: '7',
                  completed: true,
                },
          ],
        }
      }),
    }))
    pendingKey.current = ''
  }

  const removeSet = (exerciseIndex: number, setIndex: number) => {
    setDraft((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, index) =>
        index === exerciseIndex
          ? { ...exercise, sets: exercise.sets.filter((_, itemIndex) => itemIndex !== setIndex) }
          : exercise,
      ),
    }))
    pendingKey.current = ''
  }

  const save = async () => {
    const validation = validateWorkoutDraft(draft)
    if (validation) {
      setFeedback(validation)
      return
    }
    setSaving(true)
    setFeedback('')
    try {
      if (editing) {
        const saved = await updateWorkout(editing.id, buildWorkoutRequest(draft, editing.revision))
        recoverableDraft.clear()
        setWorkouts((current) =>
          current.map((workout) => (workout.id === saved.id ? saved : workout)),
        )
        setEditing(undefined)
        setDraft(initialWorkoutDraft())
        setFeedback('训练修改已保存，上一版本仍可在历史中查看。')
      } else {
        if (!pendingKey.current) pendingKey.current = requestKey()
        const saved = await createWorkout(buildWorkoutRequest(draft), pendingKey.current)
        recoverableDraft.clear()
        setWorkouts((current) => [saved, ...current])
        setDraft(initialWorkoutDraft())
        pendingKey.current = ''
        setFeedback('训练已保存。完成组才会进入训练量汇总。')
      }
    } catch (error) {
      setFeedback(messageOf(error))
    } finally {
      setSaving(false)
    }
  }

  const edit = (workout: Workout) => {
    if (recoverableDraft.pending) {
      setFeedback('请先恢复或放弃页面顶部的本地草稿，再开始另一项修改。')
      Taro.pageScrollTo({ scrollTop: 0, duration: 220 })
      return
    }
    setEditing(workout)
    setDraft(draftFromWorkout(workout))
    setFeedback('正在修改这次训练；保存会产生新版本。')
    pendingKey.current = ''
    Taro.pageScrollTo({ scrollTop: 0, duration: 220 })
  }

  const repeat = (workout: Workout) => {
    if (recoverableDraft.pending) {
      setFeedback('请先恢复或放弃页面顶部的本地草稿，再复制另一项训练。')
      Taro.pageScrollTo({ scrollTop: 0, duration: 220 })
      return
    }
    setEditing(undefined)
    setDraft(draftFromWorkout(workout, true))
    setFeedback('已复制上次结构；请勾选今天实际完成的组，再保存为新训练。')
    pendingKey.current = ''
    Taro.pageScrollTo({ scrollTop: 0, duration: 220 })
  }

  const remove = async () => {
    if (!deleting) return
    setSaving(true)
    try {
      await deleteWorkout(deleting.id, deleting.revision)
      setWorkouts((current) => current.filter((workout) => workout.id !== deleting.id))
      if (editing?.id === deleting.id) {
        setEditing(undefined)
        setDraft(initialWorkoutDraft())
      }
      setDeleting(undefined)
      setFeedback('训练已从记录簿移除，版本历史仍保留。')
    } catch (error) {
      setFeedback(messageOf(error))
    } finally {
      setSaving(false)
    }
  }

  const openHistory = async (workout: Workout) => {
    setHistoryWorkout(workout)
    setHistory(undefined)
    setHistoryNextCursor(null)
    try {
      const result = await getWorkoutHistory(workout.id, { limit: 10 })
      setHistory(result.items)
      setHistoryNextCursor(result.nextCursor)
    } catch (error) {
      setHistoryWorkout(undefined)
      setFeedback(messageOf(error))
    }
  }

  const loadOlderHistory = async () => {
    if (!historyWorkout || !historyNextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const result = await getWorkoutHistory(historyWorkout.id, {
        limit: 10,
        cursor: historyNextCursor,
      })
      setHistory((current) => [...(current ?? []), ...result.items])
      setHistoryNextCursor(result.nextCursor)
    } catch (error) {
      setFeedback(messageOf(error))
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <View className="workouts-page">
      <ScrollView className="workouts-scroll" scrollY enhanced showScrollbar={false}>
        <View className="workouts-shell">
          <View className="workouts-topbar">
            <Button
              {...buttonA11yProps}
              className="workouts-back"
              aria-label="返回今天"
              onClick={() => void Taro.navigateBack()}
            >
              ←
            </Button>
            <View className="workouts-wordmark">
              <Text>衡迹</Text>
              <Text className="workouts-wordmark__en">TRAINING LOG</Text>
            </View>
            <Text className="workouts-topbar__count metric">{workouts.length}</Text>
          </View>

          <View className="workouts-intro">
            <Text className="workouts-eyebrow">SETS · REPS · EVIDENCE</Text>
            <Text className="workouts-title">把完成的每一组，写成下一次的起点。</Text>
            <Text className="workouts-lead">
              只勾选实际完成的组；训练量用于观察负荷，不代表动作质量，也不是越高越好。
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
                setDraft(initialWorkoutDraft())
                pendingKey.current = ''
                setFeedback('本地训练草稿已清除。')
              }}
            />
          ) : recoverableDraft.saved ? (
            <LocalDraftNotice
              mode="saved"
              envelope={recoverableDraft.saved}
              correctionRevision={recoverableDraft.saved.payload.correction?.baseRevision}
              onDiscard={() => {
                recoverableDraft.clear()
                setEditing(undefined)
                setDraft(initialWorkoutDraft())
                pendingKey.current = ''
                setFeedback('本地训练草稿已清除。')
              }}
            />
          ) : null}

          <View className="workouts-grid">
            <View className="workout-builder">
              {workouts[0] && !editing ? (
                <Button
                  {...buttonA11yProps}
                  className="repeat-banner"
                  onClick={() => repeat(workouts[0]!)}
                >
                  <View>
                    <Text className="workouts-eyebrow">QUICK REPEAT</Text>
                    <Text className="repeat-banner__title">重复上次训练</Text>
                  </View>
                  <Text className="repeat-banner__meta">
                    {workouts[0].title} · {workouts[0].summary.totalSets} 组 →
                  </Text>
                </Button>
              ) : null}

              <View className="workout-card builder-card">
                <View className="workout-section-heading">
                  <View>
                    <Text className="workouts-eyebrow">
                      {editing ? 'EDIT SESSION' : 'NEW SESSION'}
                    </Text>
                    <Text className="workout-panel-title">{editing ? '修改训练' : '记录训练'}</Text>
                  </View>
                  {editing ? (
                    <Button
                      {...buttonA11yProps}
                      className="workout-quiet"
                      onClick={() => {
                        recoverableDraft.clear()
                        setEditing(undefined)
                        setDraft(initialWorkoutDraft())
                        setFeedback('')
                      }}
                    >
                      取消修改
                    </Button>
                  ) : null}
                </View>

                <View className="session-title-field">
                  <Text className="field-caption">训练名称</Text>
                  <Input
                    className="session-title-input"
                    value={draft.title}
                    maxlength={100}
                    placeholder="例如：全身训练 A"
                    onInput={(event) => {
                      setDraft((current) => ({ ...current, title: event.detail.value }))
                      pendingKey.current = ''
                    }}
                  />
                </View>

                <View className="workout-occurrence-grid">
                  <OccurrenceField
                    label="开始时间"
                    value={draft.startedLocal}
                    timeZone={draft.timezone}
                    selectedOffsetMinutes={draft.startedOffsetMinutes}
                    onChange={(startedLocal) => {
                      setDraft((current) => ({
                        ...current,
                        startedLocal,
                        originalStartedAt: undefined,
                      }))
                      pendingKey.current = ''
                      setFeedback('')
                    }}
                    onTimeZoneChange={(timezone) => {
                      setDraft((current) => ({
                        ...current,
                        timezone,
                        endedOffsetMinutes: undefined,
                        originalStartedAt: undefined,
                        originalEndedAt: undefined,
                      }))
                      pendingKey.current = ''
                      setFeedback('')
                    }}
                    onOffsetChange={(startedOffsetMinutes) => {
                      setDraft((current) => ({
                        ...current,
                        startedOffsetMinutes,
                        originalStartedAt: undefined,
                      }))
                      pendingKey.current = ''
                      setFeedback('')
                    }}
                  />
                  <OccurrenceField
                    label="结束时间"
                    value={draft.endedLocal}
                    timeZone={draft.timezone}
                    selectedOffsetMinutes={draft.endedOffsetMinutes}
                    onChange={(endedLocal) => {
                      setDraft((current) => ({
                        ...current,
                        endedLocal,
                        originalEndedAt: undefined,
                      }))
                      pendingKey.current = ''
                      setFeedback('')
                    }}
                    onTimeZoneChange={(timezone) => {
                      setDraft((current) => ({
                        ...current,
                        timezone,
                        startedOffsetMinutes: undefined,
                        originalStartedAt: undefined,
                        originalEndedAt: undefined,
                      }))
                      pendingKey.current = ''
                      setFeedback('')
                    }}
                    onOffsetChange={(endedOffsetMinutes) => {
                      setDraft((current) => ({
                        ...current,
                        endedOffsetMinutes,
                        originalEndedAt: undefined,
                      }))
                      pendingKey.current = ''
                      setFeedback('')
                    }}
                  />
                </View>

                <View className="catalog-block">
                  <View className="catalog-block__heading">
                    <View>
                      <Text className="field-caption">动作目录</Text>
                      <Text className="catalog-block__hint">
                        搜索名称、别名或器械；同一动作只添加一次
                      </Text>
                    </View>
                    <Button
                      {...buttonA11yProps}
                      className="catalog-create"
                      onClick={() => void openCatalogEditor()}
                    >
                      ＋ 自定义动作
                    </Button>
                  </View>
                  <Input
                    className="catalog-search"
                    value={catalogQuery}
                    maxlength={80}
                    placeholder="搜索动作或器械，例如：壶铃"
                    aria-label="搜索动作目录"
                    onInput={(event) => setCatalogQuery(event.detail.value)}
                  />
                  <View className="exercise-catalog" aria-label="动作目录搜索结果">
                    {filteredCatalog.length ? (
                      filteredCatalog.map((item) => {
                        const selected = draft.exercises.some(
                          (exercise) => exercise.exerciseKey === item.key,
                        )
                        return (
                          <View className="catalog-entry" key={item.id}>
                            <Button
                              {...buttonA11yProps}
                              className={`catalog-entry__add ${selected ? 'catalog-entry__add--selected' : ''}`}
                              disabled={selected ? true : undefined}
                              aria-label={`${selected ? '已添加' : '添加'}${item.name}`}
                              onClick={() => addExercise(item)}
                            >
                              <Text className="catalog-entry__source">
                                {item.source === 'custom'
                                  ? `MY · v${item.revision}`
                                  : 'STARTER · v1'}
                              </Text>
                              <Text className="catalog-entry__name">
                                {selected ? '✓ ' : '＋ '}
                                {item.name}
                              </Text>
                              <Text className="catalog-entry__meta">
                                {trackingLabels[item.trackingMode]} ·{' '}
                                {item.equipment.map((value) => equipmentLabels[value]).join(' / ')}
                              </Text>
                            </Button>
                            {item.source === 'custom' ? (
                              <Button
                                {...buttonA11yProps}
                                className="catalog-entry__edit"
                                aria-label={`编辑自定义动作${item.name}`}
                                onClick={() => void openCatalogEditor(item)}
                              >
                                编辑
                              </Button>
                            ) : null}
                          </View>
                        )
                      })
                    ) : (
                      <View className="catalog-empty">
                        没有匹配动作。你可以创建自己的动作定义。
                      </View>
                    )}
                  </View>
                </View>

                <View className="load-unit-row">
                  <Text className="field-caption">负重单位</Text>
                  <View className="load-unit-picker">
                    {(['kg', 'lb'] as const).map((unit) => (
                      <Button
                        {...buttonA11yProps}
                        className={`load-unit-button ${draft.loadUnit === unit ? 'load-unit-button--active' : ''}`}
                        key={unit}
                        aria-pressed={draft.loadUnit === unit}
                        onClick={() => setDraft((current) => ({ ...current, loadUnit: unit }))}
                      >
                        {unit}
                      </Button>
                    ))}
                  </View>
                </View>

                <View className="exercise-stack">
                  {draft.exercises.map((exercise, exerciseIndex) => {
                    const mode = exerciseMode(exercise)
                    return (
                      <View
                        className="exercise-card"
                        key={`${exercise.exerciseKey}-${exerciseIndex}`}
                      >
                        <View className="exercise-card__heading">
                          <View>
                            <Text className="exercise-card__number metric">
                              0{exerciseIndex + 1}
                            </Text>
                            <Text className="exercise-card__name">{exercise.name}</Text>
                            <Text className="exercise-card__equipment">
                              {trackingLabels[exercise.trackingMode]} ·{' '}
                              {exercise.equipment.length
                                ? exercise.equipment
                                    .map((value) => equipmentLabels[value])
                                    .join(' / ')
                                : '旧记录未保存器械'}
                              {exercise.equipmentNotes ? ` · ${exercise.equipmentNotes}` : ''}
                            </Text>
                          </View>
                          <Button
                            {...buttonA11yProps}
                            className="remove-exercise"
                            aria-label={`移除${exercise.name}`}
                            onClick={() => removeExercise(exerciseIndex)}
                          >
                            移除
                          </Button>
                        </View>

                        <View className={`set-table set-table--${mode}`}>
                          <View className="set-row set-row--labels">
                            <Text>组</Text>
                            <Text>完成</Text>
                            {mode === 'strength' ? <Text>次数</Text> : <Text>分钟</Text>}
                            {mode === 'strength' ? <Text>负重</Text> : null}
                            {mode === 'cardio' ? <Text>公里</Text> : null}
                            <Text>RPE</Text>
                            <Text />
                          </View>
                          {exercise.sets.map((set, setIndex) => (
                            <View
                              className="set-row"
                              key={`${exercise.exerciseKey}-set-${setIndex}`}
                            >
                              <Text className="set-index metric">{setIndex + 1}</Text>
                              <Button
                                {...buttonA11yProps}
                                className={`set-check ${set.completed ? 'set-check--active' : ''}`}
                                aria-label={`${exercise.name}第${setIndex + 1}组${set.completed ? '已完成' : '未完成'}`}
                                aria-pressed={set.completed}
                                onClick={() =>
                                  updateSet(exerciseIndex, setIndex, 'completed', !set.completed)
                                }
                              >
                                {set.completed ? '✓' : '—'}
                              </Button>
                              <Input
                                className="set-input metric"
                                type="digit"
                                value={mode === 'strength' ? set.reps : set.durationMinutes}
                                placeholder={mode === 'strength' ? '10' : '20'}
                                aria-label={`${exercise.name}第${setIndex + 1}组${mode === 'strength' ? '次数' : '分钟'}`}
                                onInput={(event) =>
                                  updateSet(
                                    exerciseIndex,
                                    setIndex,
                                    mode === 'strength' ? 'reps' : 'durationMinutes',
                                    event.detail.value,
                                  )
                                }
                              />
                              {mode === 'strength' ? (
                                <Input
                                  className="set-input metric"
                                  type="digit"
                                  value={set.load}
                                  placeholder="0"
                                  aria-label={`${exercise.name}第${setIndex + 1}组负重`}
                                  onInput={(event) =>
                                    updateSet(exerciseIndex, setIndex, 'load', event.detail.value)
                                  }
                                />
                              ) : null}
                              {mode === 'cardio' ? (
                                <Input
                                  className="set-input metric"
                                  type="digit"
                                  value={set.distanceKm}
                                  placeholder="3"
                                  aria-label={`${exercise.name}第${setIndex + 1}组公里`}
                                  onInput={(event) =>
                                    updateSet(
                                      exerciseIndex,
                                      setIndex,
                                      'distanceKm',
                                      event.detail.value,
                                    )
                                  }
                                />
                              ) : null}
                              <Input
                                className="set-input metric"
                                type="digit"
                                value={set.rpe}
                                placeholder="7"
                                aria-label={`${exercise.name}第${setIndex + 1}组RPE`}
                                onInput={(event) =>
                                  updateSet(exerciseIndex, setIndex, 'rpe', event.detail.value)
                                }
                              />
                              <Button
                                {...buttonA11yProps}
                                className="remove-set"
                                aria-label={`删除${exercise.name}第${setIndex + 1}组`}
                                onClick={() => removeSet(exerciseIndex, setIndex)}
                              >
                                ×
                              </Button>
                            </View>
                          ))}
                        </View>
                        <Button
                          {...buttonA11yProps}
                          className="add-set"
                          onClick={() => addSet(exerciseIndex)}
                        >
                          ＋ 添加一组
                        </Button>
                      </View>
                    )
                  })}
                </View>

                <View className="session-feedback-grid">
                  <View>
                    <Text className="field-caption">训练后疲劳 · {draft.fatigue}/5</Text>
                    <View className="feedback-scale">
                      {[1, 2, 3, 4, 5].map((value) => (
                        <Button
                          {...buttonA11yProps}
                          className={`feedback-dot ${draft.fatigue === value ? 'feedback-dot--active' : ''}`}
                          key={value}
                          aria-label={`疲劳${value}`}
                          aria-pressed={draft.fatigue === value}
                          onClick={() => setDraft((current) => ({ ...current, fatigue: value }))}
                        >
                          {value}
                        </Button>
                      ))}
                    </View>
                  </View>
                  <View>
                    <Text className="field-caption">疼痛感受 · {draft.painLevel}/10</Text>
                    <View className="pain-options">
                      {[0, 3, 6, 9].map((value) => (
                        <Button
                          {...buttonA11yProps}
                          className={`pain-option ${draft.painLevel === value ? 'pain-option--active' : ''}`}
                          key={value}
                          aria-pressed={draft.painLevel === value}
                          onClick={() => setDraft((current) => ({ ...current, painLevel: value }))}
                        >
                          {value === 0 ? '无' : value}
                        </Button>
                      ))}
                    </View>
                  </View>
                </View>

                <View className="workout-note-field">
                  <Text className="field-caption">备注（可选）</Text>
                  <Textarea
                    className="workout-note-input"
                    value={draft.note}
                    maxlength={500}
                    placeholder="动作感受、替代动作或需要下次留意的事"
                    onInput={(event) =>
                      setDraft((current) => ({ ...current, note: event.detail.value }))
                    }
                  />
                </View>

                <View className="session-summary" aria-label="本次训练汇总预览">
                  <View>
                    <Text className="session-summary__value metric">
                      {summary.completedSets}/{summary.totalSets}
                    </Text>
                    <Text className="session-summary__label">完成组</Text>
                  </View>
                  <View>
                    <Text className="session-summary__value metric">{summary.volumeKg}</Text>
                    <Text className="session-summary__label">训练量 kg</Text>
                  </View>
                  <View>
                    <Text className="session-summary__value metric">{summary.activeMinutes}</Text>
                    <Text className="session-summary__label">有效分钟</Text>
                  </View>
                </View>
                <Text className="session-status-rule">
                  保存后，服务端会按组完成事实生成状态：全部勾选为已完成，否则记为部分完成。
                </Text>

                {draft.painLevel >= 6 ? (
                  <View className="pain-warning" role="alert">
                    疼痛较明显。建议停止加量并寻求合格专业人员评估；这里不做伤病诊断。
                  </View>
                ) : null}
                {feedback ? (
                  <View className="workout-feedback" role="status">
                    {feedback}
                  </View>
                ) : null}

                <Button
                  {...buttonA11yProps}
                  className="save-workout"
                  disabled={saving}
                  onClick={() => void save()}
                >
                  {saving ? '正在保存…' : editing ? '保存训练新版本' : '保存训练'}
                </Button>
              </View>
            </View>

            <View className="workout-card workout-ledger">
              <View className="workout-section-heading workout-ledger__heading">
                <View>
                  <Text className="workouts-eyebrow">RECENT SESSIONS</Text>
                  <Text className="workout-panel-title">训练记录簿</Text>
                </View>
                <Text className="workout-ledger__count metric">已载入 {workouts.length}</Text>
              </View>
              {loading ? (
                <View className="workout-empty">正在整理训练…</View>
              ) : workouts.length ? (
                <View className="workout-list">
                  {workouts.map((workout) => (
                    <View className="workout-entry" key={workout.id}>
                      <View className="workout-entry__top">
                        <Text className="workout-entry__date metric">
                          {displayTime(workout.startedAt)}
                        </Text>
                        <Text className={`workout-status workout-status--${workout.status}`}>
                          {workout.status === 'completed' ? '已完成' : '部分完成'}
                        </Text>
                      </View>
                      <Text className="workout-entry__title">{workout.title}</Text>
                      <Text className="workout-entry__exercises">
                        {workout.exercises.map((exercise) => exercise.name).join(' · ')}
                      </Text>
                      <View className="workout-entry__insight-links" aria-label="查看单动作趋势">
                        {workout.exercises.map((exercise) => (
                          <Button
                            {...buttonA11yProps}
                            className="exercise-observation-link"
                            key={exercise.id}
                            aria-label={`查看${exercise.name}趋势`}
                            onClick={() =>
                              void Taro.navigateTo({
                                url: `/pages/exercise-insights/index?exerciseKey=${encodeURIComponent(exercise.exerciseKey)}`,
                              })
                            }
                          >
                            {exercise.name}趋势 →
                          </Button>
                        ))}
                      </View>
                      <View className="workout-entry__numbers">
                        <View>
                          <Text className="workout-entry__number metric">
                            {workout.summary.completedSets}/{workout.summary.totalSets}
                          </Text>
                          <Text>完成组</Text>
                        </View>
                        <View>
                          <Text className="workout-entry__number metric">
                            {workout.summary.volumeKg}
                          </Text>
                          <Text>训练量 kg</Text>
                        </View>
                        <View>
                          <Text className="workout-entry__number metric">v{workout.revision}</Text>
                          <Text>版本</Text>
                        </View>
                      </View>
                      <View className="workout-entry__actions">
                        <Button
                          {...buttonA11yProps}
                          className="entry-action"
                          onClick={() => repeat(workout)}
                        >
                          重复
                        </Button>
                        <Button
                          {...buttonA11yProps}
                          className="entry-action"
                          onClick={() => edit(workout)}
                        >
                          修改
                        </Button>
                        <Button
                          {...buttonA11yProps}
                          className="entry-action"
                          onClick={() => void openHistory(workout)}
                        >
                          历史
                        </Button>
                        <Button
                          {...buttonA11yProps}
                          className="entry-action entry-action--danger"
                          onClick={() => setDeleting(workout)}
                        >
                          删除
                        </Button>
                      </View>
                    </View>
                  ))}
                  {nextCursor ? (
                    <Button
                      {...buttonA11yProps}
                      className="record-page-more"
                      disabled={loadingMore}
                      onClick={() => void loadOlderWorkouts()}
                    >
                      {loadingMore ? '正在载入…' : '继续载入更早训练'}
                    </Button>
                  ) : (
                    <Text className="record-page-end">已载入当前全部训练</Text>
                  )}
                </View>
              ) : (
                <View className="workout-empty">
                  <Text className="workout-empty__mark">01</Text>
                  <Text className="workout-empty__title">还没有训练记录</Text>
                  <Text className="workout-empty__body">完成左侧动作后，保存今天的第一节。</Text>
                </View>
              )}
            </View>
          </View>

          <Text className="workouts-safety">
            明显疼痛、胸部不适或晕厥时应停止训练并寻求专业帮助。
          </Text>
        </View>
      </ScrollView>

      {catalogEditorOpen ? (
        <View
          className="catalog-modal"
          role="dialog"
          aria-modal="true"
          aria-label="自定义动作编辑器"
        >
          <View className="catalog-modal__card">
            <View className="workout-section-heading">
              <View>
                <Text className="workouts-eyebrow">USER-OWNED CATALOG</Text>
                <Text className="workout-modal__title">
                  {catalogEditing ? '纠正动作定义' : '创建自定义动作'}
                </Text>
              </View>
              <Button
                {...buttonA11yProps}
                className="history-close-button"
                aria-label="关闭自定义动作编辑器"
                onClick={closeCatalogEditor}
              >
                ×
              </Button>
            </View>
            <Text className="catalog-modal__notice">
              目录只影响未来选择。已保存训练和当前草稿会保留当时名称、追踪方式与器械快照。
            </Text>

            <View className="catalog-form-field">
              <Text className="field-caption">动作名称</Text>
              <Input
                className="catalog-form-input"
                value={catalogDraft.name}
                maxlength={80}
                placeholder="例如：壶铃摆动"
                aria-label="自定义动作名称"
                onInput={(event) => patchCatalogDraft({ name: event.detail.value })}
              />
            </View>
            <View className="catalog-form-field">
              <Text className="field-caption">别名（逗号分隔，可选）</Text>
              <Input
                className="catalog-form-input"
                value={catalogDraft.aliases}
                maxlength={240}
                placeholder="例如：Kettlebell Swing，KB Swing"
                aria-label="自定义动作别名"
                onInput={(event) => patchCatalogDraft({ aliases: event.detail.value })}
              />
            </View>

            <View className="catalog-form-field">
              <Text className="field-caption">动作类别</Text>
              <View className="catalog-option-row">
                {(['strength', 'cardio', 'mobility'] as const).map((category) => (
                  <Button
                    {...buttonA11yProps}
                    className={`catalog-option ${catalogDraft.category === category ? 'catalog-option--active' : ''}`}
                    key={category}
                    aria-pressed={catalogDraft.category === category}
                    onClick={() => patchCatalogDraft({ category })}
                  >
                    {categoryLabels[category]}
                  </Button>
                ))}
              </View>
            </View>

            <View className="catalog-form-field">
              <Text className="field-caption">记录方式</Text>
              <View className="catalog-option-row">
                {(['reps_load', 'duration', 'duration_distance'] as const).map((trackingMode) => (
                  <Button
                    {...buttonA11yProps}
                    className={`catalog-option ${catalogDraft.trackingMode === trackingMode ? 'catalog-option--active' : ''}`}
                    key={trackingMode}
                    aria-pressed={catalogDraft.trackingMode === trackingMode}
                    onClick={() => patchCatalogDraft({ trackingMode })}
                  >
                    {trackingLabels[trackingMode]}
                  </Button>
                ))}
              </View>
            </View>

            <View className="catalog-form-field">
              <Text className="field-caption">所需器械（可多选）</Text>
              <View className="catalog-equipment-grid">
                {exerciseEquipmentOptions.map((equipment) => (
                  <Button
                    {...buttonA11yProps}
                    className={`catalog-equipment ${catalogDraft.equipment.includes(equipment) ? 'catalog-equipment--active' : ''}`}
                    key={equipment}
                    aria-pressed={catalogDraft.equipment.includes(equipment)}
                    onClick={() => toggleCatalogEquipment(equipment)}
                  >
                    {equipmentLabels[equipment]}
                  </Button>
                ))}
              </View>
            </View>

            <View className="catalog-form-field">
              <Text className="field-caption">器械说明（选择“其他器械”时必填）</Text>
              <Input
                className="catalog-form-input"
                value={catalogDraft.equipmentNotes}
                maxlength={120}
                placeholder="例如：固定地雷管装置"
                aria-label="自定义动作器械说明"
                onInput={(event) => patchCatalogDraft({ equipmentNotes: event.detail.value })}
              />
            </View>

            {catalogEditing ? (
              <DefinitionRevisionLedger
                items={catalogHistory}
                nextCursor={catalogHistoryNextCursor}
                loadingMore={catalogHistoryLoadingMore}
                onLoadOlder={loadOlderCatalogHistory}
              />
            ) : null}

            {feedback ? (
              <View className="workout-feedback" role="status">
                {feedback}
              </View>
            ) : null}
            <View className="catalog-modal__actions">
              {catalogEditing ? (
                <Button
                  {...buttonA11yProps}
                  className="catalog-archive"
                  disabled={saving}
                  onClick={() => void archiveCatalogDefinition()}
                >
                  停用动作
                </Button>
              ) : (
                <Button
                  {...buttonA11yProps}
                  className="modal-action"
                  disabled={saving}
                  onClick={closeCatalogEditor}
                >
                  取消
                </Button>
              )}
              <Button
                {...buttonA11yProps}
                className="catalog-save"
                disabled={saving}
                onClick={() => void saveCatalogDefinition()}
              >
                {saving ? '正在保存…' : catalogEditing ? '保存定义新版本' : '创建并加入目录'}
              </Button>
            </View>
          </View>
        </View>
      ) : null}

      {deleting ? (
        <View className="workout-modal" role="dialog" aria-modal="true" aria-label="确认删除训练">
          <View className="workout-modal__card">
            <Text className="workouts-eyebrow">REMOVE SESSION</Text>
            <Text className="workout-modal__title">删除“{deleting.title}”？</Text>
            <Text className="workout-modal__body">它会离开日常记录簿，但版本审计仍会保留。</Text>
            <View className="workout-modal__actions">
              <Button
                {...buttonA11yProps}
                className="modal-action"
                onClick={() => setDeleting(undefined)}
              >
                取消
              </Button>
              <Button
                {...buttonA11yProps}
                className="modal-action modal-action--danger"
                onClick={() => void remove()}
              >
                确认删除
              </Button>
            </View>
          </View>
        </View>
      ) : null}

      {historyWorkout ? (
        <View className="workout-history" role="dialog" aria-modal="true" aria-label="训练历史">
          <Button
            {...buttonA11yProps}
            className="workout-history__scrim"
            aria-label="关闭训练历史"
            onClick={() => setHistoryWorkout(undefined)}
          />
          <View className="workout-history__sheet">
            <View className="workout-section-heading">
              <View>
                <Text className="workouts-eyebrow">AUDIT TRAIL</Text>
                <Text className="workout-panel-title">{historyWorkout.title}历史</Text>
              </View>
              <Button
                {...buttonA11yProps}
                className="history-close-button"
                aria-label="关闭训练历史"
                onClick={() => setHistoryWorkout(undefined)}
              >
                ×
              </Button>
            </View>
            {history ? (
              <View className="workout-history__list">
                {history.map((item) => (
                  <View className="workout-history-entry" key={`${item.id}-${item.revision}`}>
                    <View className={`workout-history-entry__mark mark--${item.action}`} />
                    <View>
                      <Text className="workout-history-entry__action">
                        {actionLabels[item.action]}
                      </Text>
                      <Text className="workout-history-entry__value metric">
                        v{item.revision} · {item.summary.completedSets}/{item.summary.totalSets} 组
                        · {item.summary.volumeKg} kg
                      </Text>
                      <Text className="workout-history-entry__time">
                        {displayTime(item.changedAt)}
                      </Text>
                    </View>
                  </View>
                ))}
                {historyNextCursor ? (
                  <Button
                    {...buttonA11yProps}
                    className="record-page-more"
                    disabled={loadingMore}
                    onClick={() => void loadOlderHistory()}
                  >
                    {loadingMore ? '正在载入…' : '继续载入更早版本'}
                  </Button>
                ) : (
                  <Text className="record-page-end">已载入全部版本</Text>
                )}
              </View>
            ) : (
              <View className="workout-empty">正在读取历史…</View>
            )}
          </View>
        </View>
      ) : null}
    </View>
  )
}

export default WorkoutsPage
