import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, ScrollView, Text, Textarea, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import type {
  ExerciseCatalogItem,
  ExerciseEquipment,
  Workout,
  WorkoutHistoryItem,
} from '@myfitness/contracts'

import {
  buttonA11yProps,
  buttonActivationProps,
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
  createWorkout,
  deleteWorkout,
  getWorkout,
  getWorkoutHistory,
  listExerciseCatalog,
  listWorkouts,
  updateWorkout,
} from '../../lib/api'
import { appendOlderRecords, includeExactRecord } from '../../lib/record-pages'
import { describeSaveFailure, type SaveRecovery } from '../../lib/save-recovery'
import { useAggregateHistory } from '../../lib/use-aggregate-history'
import { useRecoverableDraft } from '../../lib/use-local-draft'
import {
  buildWorkoutRequest,
  classifyWorkoutReadFailure,
  createExerciseDraft,
  draftFromWorkout,
  exerciseMode,
  filterExerciseCatalog,
  initialWorkoutDraft,
  isWorkoutDraft,
  type WorkoutDraft,
  type WorkoutReadFailureKind,
  workoutReadPhase,
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

const workoutReadFailureCopy = (
  kind: WorkoutReadFailureKind,
  hasSnapshot: boolean,
): { eyebrow: string; title: string; detail: string } => {
  if (kind === 'offline') {
    return {
      eyebrow: 'OFFLINE / 连接未完成',
      title: hasSnapshot ? '训练与动作目录复核没有完成' : '训练记录还没有读取',
      detail: hasSnapshot
        ? '上次成功读取的训练与动作目录仍在下方，但保存、复用、修改、历史与删除均已冻结。'
        : '当前无法确认账户里的训练和自定义动作；页面不会用空记录簿代替，也不会提交训练。',
    }
  }
  if (kind === 'refused') {
    return {
      eyebrow: 'READ REFUSED / 读取被拒绝',
      title: hasSnapshot ? '服务拒绝了本次训练复核' : '服务没有接受本次训练读取',
      detail: hasSnapshot
        ? '旧训练与动作目录继续只读保留；重新核对前不会生成新的训练事实。'
        : '训练数量和可复用动作仍是未知状态；重新核对成功前，训练操作保持冻结。',
    }
  }
  if (kind === 'service') {
    return {
      eyebrow: 'SERVICE PAUSED / 服务暂不可用',
      title: hasSnapshot ? '本次训练复核暂未完成' : '训练记录暂时无法读取',
      detail: hasSnapshot
        ? '下方保留上次快照用于查看，所有训练记录操作保持冻结。'
        : '服务暂时没有返回训练与动作目录证据；这里不会显示“还没有训练记录”。',
    }
  }
  return {
    eyebrow: 'READ UNKNOWN / 结果未知',
    title: hasSnapshot ? '无法确认当前训练快照' : '无法确认训练记录状态',
    detail: hasSnapshot
      ? '旧训练与动作目录继续只读保留；重新核对前不会提交任何训练记录操作。'
      : '页面尚未取得可信的训练快照，也不会推断账户没有训练或自定义动作。',
  }
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

const trackingLabels = {
  reps_load: '次数 / 负重',
  duration: '时长',
  duration_distance: '时长 / 距离',
} as const

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
  const [editing, setEditing] = useState<Workout>()
  const [deleting, setDeleting] = useState<Workout>()
  const [loading, setLoading] = useState(true)
  const [hasReadSnapshot, setHasReadSnapshot] = useState(false)
  const [readFailure, setReadFailure] = useState<WorkoutReadFailureKind>()
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [saveRecovery, setSaveRecovery] = useState<SaveRecovery>()
  const pendingKey = useRef('')
  const catalogReturnFocusId = useRef('')
  const readInFlight = useRef(false)
  const pageActive = useRef(true)
  const historyRead = useAggregateHistory<Workout, WorkoutHistoryItem>(
    getWorkoutHistory,
    'workout-history-read-retry',
    {
      initialFocusId: 'workout-history-close',
      fallbackFocusId: 'workout-read-refresh',
    },
  )

  const invalidatePendingSave = (nextFeedback = '') => {
    pendingKey.current = ''
    setSaveRecovery(undefined)
    setFeedback(nextFeedback)
  }

  useEffect(() => {
    pageActive.current = true
    return () => {
      pageActive.current = false
    }
  }, [])

  const loadWorkoutAuthority = async () => {
    if (readInFlight.current) return
    readInFlight.current = true
    setLoading(true)
    setReadFailure(undefined)
    setDeleting(undefined)
    historyRead.close()
    try {
      const [workoutResult, catalogResult] = await Promise.all([
        listWorkouts({ limit: 20 }),
        listExerciseCatalog(),
      ])
      if (!pageActive.current) return
      setWorkouts(workoutResult.items)
      setNextCursor(workoutResult.nextCursor)
      setCatalogItems(catalogResult.items)
      setHasReadSnapshot(true)

      const returnTarget = catalogReturnFocusId.current
      if (!returnTarget) return
      catalogReturnFocusId.current = ''
      const customEntryId = returnTarget.replace('workout-edit-action-', '')
      const targetStillExists = catalogResult.items.some(
        (entry) => entry.source === 'custom' && entry.id === customEntryId,
      )
      deferH5Focus(targetStillExists ? returnTarget : 'workout-manage-actions', 350)
    } catch (error) {
      if (!pageActive.current) return
      setReadFailure(classifyWorkoutReadFailure(error))
      deferH5Focus('workout-read-retry', 80)
    } finally {
      readInFlight.current = false
      if (pageActive.current) setLoading(false)
    }
  }

  useDidShow(() => {
    void loadWorkoutAuthority()
  })

  const readPhase = workoutReadPhase({
    hasSnapshot: hasReadSnapshot,
    busy: loading,
    hasFailure: Boolean(readFailure),
  })
  const readAuthorityReady = readPhase === 'ready'
  const readFailurePresentation = readFailure
    ? workoutReadFailureCopy(readFailure, hasReadSnapshot)
    : undefined

  const openExerciseCatalog = (returnFocusId: string, entryId?: string) => {
    if (entryId && !readAuthorityReady) return
    catalogReturnFocusId.current = returnFocusId
    const query = entryId ? `&entryId=${encodeURIComponent(entryId)}` : ''
    void Taro.navigateTo({
      url: `/pages/food-catalog/index?kind=exercise${query}`,
    }).catch((error: unknown) => {
      catalogReturnFocusId.current = ''
      setFeedback(messageOf(error))
    })
  }

  const loadOlderWorkouts = async () => {
    if (!readAuthorityReady || !nextCursor || loadingMore) return
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
      setSaveRecovery(undefined)
      setFeedback('本地草稿已恢复；保存前请重新核对完成组、负重与感受。')
      return
    }
    if (!readAuthorityReady) {
      setFeedback('请先重新核对训练与动作目录，再恢复这份修改草稿。草稿仍安全保留。')
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
      setSaveRecovery(undefined)
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
    invalidatePendingSave()
  }

  const addExercise = (item: ExerciseCatalogItem) => {
    if (!readAuthorityReady) return
    if (draft.exercises.some((exercise) => exercise.exerciseKey === item.key)) {
      setFeedback(`${item.name}已经在本次训练中。`)
      return
    }
    setDraft((current) => ({
      ...current,
      exercises: [...current.exercises, createExerciseDraft(item)],
    }))
    invalidatePendingSave()
  }

  const removeExercise = (index: number) => {
    setDraft((current) => ({
      ...current,
      exercises: current.exercises.filter((_, currentIndex) => currentIndex !== index),
    }))
    invalidatePendingSave()
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
    invalidatePendingSave()
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
    invalidatePendingSave()
  }

  const save = async () => {
    if (!readAuthorityReady) {
      setFeedback('请先重新核对训练与动作目录，再保存本次训练。当前输入仍保留。')
      return
    }
    const validation = validateWorkoutDraft(draft)
    if (validation) {
      setSaveRecovery(undefined)
      setFeedback(validation)
      return
    }
    setSaving(true)
    setSaveRecovery(undefined)
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
        setSaveRecovery(undefined)
        setFeedback('训练修改已保存，上一版本仍可在历史中查看。')
      } else {
        if (!pendingKey.current) pendingKey.current = requestKey()
        const saved = await createWorkout(buildWorkoutRequest(draft), pendingKey.current)
        recoverableDraft.clear()
        setWorkouts((current) => [saved, ...current])
        setDraft(initialWorkoutDraft())
        pendingKey.current = ''
        setSaveRecovery(undefined)
        setFeedback('训练已保存。完成组才会进入训练量汇总。')
      }
    } catch (error) {
      const recovery = describeSaveFailure(error, {
        subject: editing ? '这次训练修改' : '这次训练',
        create: !editing,
      })
      setSaveRecovery(recovery)
      setFeedback(recovery.message)
    } finally {
      setSaving(false)
    }
  }

  const edit = (workout: Workout) => {
    if (!readAuthorityReady) return
    if (recoverableDraft.pending) {
      setFeedback('请先恢复或放弃页面顶部的本地草稿，再开始另一项修改。')
      Taro.pageScrollTo({ scrollTop: 0, duration: 220 })
      return
    }
    setEditing(workout)
    setDraft(draftFromWorkout(workout))
    setFeedback('正在修改这次训练；保存会产生新版本。')
    setSaveRecovery(undefined)
    pendingKey.current = ''
    Taro.pageScrollTo({ scrollTop: 0, duration: 220 })
  }

  const repeat = (workout: Workout) => {
    if (!readAuthorityReady) return
    if (recoverableDraft.pending) {
      setFeedback('请先恢复或放弃页面顶部的本地草稿，再复制另一项训练。')
      Taro.pageScrollTo({ scrollTop: 0, duration: 220 })
      return
    }
    setEditing(undefined)
    setDraft(draftFromWorkout(workout, true))
    setFeedback('已复制上次结构；请勾选今天实际完成的组，再保存为新训练。')
    setSaveRecovery(undefined)
    pendingKey.current = ''
    Taro.pageScrollTo({ scrollTop: 0, duration: 220 })
  }

  const remove = async () => {
    if (!deleting || !readAuthorityReady) return
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
            <Text className="workouts-topbar__count metric">
              {hasReadSnapshot ? workouts.length : '—'}
            </Text>
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

          {readPhase === 'refreshing' && hasReadSnapshot ? (
            <View className="workout-read-state workout-read-state--refreshing" role="status">
              <View>
                <Text className="workout-read-state__eyebrow">
                  CHECKING TRAINING / 保留上次快照
                </Text>
                <Text className="workout-read-state__title">正在复核训练与动作目录</Text>
                <Text className="workout-read-state__copy">
                  复核完成前，下方训练与动作目录只读保留；保存、复用、修改、历史与删除均已冻结。
                </Text>
              </View>
            </View>
          ) : readFailurePresentation ? (
            <View className={`workout-read-state workout-read-state--${readPhase}`} role="status">
              <View>
                <Text className="workout-read-state__eyebrow">
                  {readFailurePresentation.eyebrow}
                </Text>
                <Text className="workout-read-state__title">{readFailurePresentation.title}</Text>
                <Text className="workout-read-state__copy">{readFailurePresentation.detail}</Text>
                {hasReadSnapshot ? (
                  <Text className="workout-read-state__retained metric">
                    RETAINED SNAPSHOT · {workouts.length} SESSIONS · {catalogItems.length} ACTIONS
                  </Text>
                ) : null}
              </View>
              <Button
                id="workout-read-retry"
                className="workout-read-state__action"
                aria-label="重新核对训练与动作目录"
                {...buttonActivationProps(
                  () => void loadWorkoutAuthority(),
                  loading || loadingMore || saving,
                )}
              >
                重新核对
              </Button>
            </View>
          ) : null}

          <View className="workouts-grid">
            <View className="workout-builder">
              {workouts[0] && !editing ? (
                <Button
                  {...buttonA11yProps}
                  className="repeat-banner"
                  disabled={!readAuthorityReady}
                  aria-disabled={!readAuthorityReady}
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
                        setSaveRecovery(undefined)
                        pendingKey.current = ''
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
                      invalidatePendingSave()
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
                      invalidatePendingSave()
                    }}
                    onTimeZoneChange={(timezone) => {
                      setDraft((current) => ({
                        ...current,
                        timezone,
                        endedOffsetMinutes: undefined,
                        originalStartedAt: undefined,
                        originalEndedAt: undefined,
                      }))
                      invalidatePendingSave()
                    }}
                    onOffsetChange={(startedOffsetMinutes) => {
                      setDraft((current) => ({
                        ...current,
                        startedOffsetMinutes,
                        originalStartedAt: undefined,
                      }))
                      invalidatePendingSave()
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
                      invalidatePendingSave()
                    }}
                    onTimeZoneChange={(timezone) => {
                      setDraft((current) => ({
                        ...current,
                        timezone,
                        startedOffsetMinutes: undefined,
                        originalStartedAt: undefined,
                        originalEndedAt: undefined,
                      }))
                      invalidatePendingSave()
                    }}
                    onOffsetChange={(endedOffsetMinutes) => {
                      setDraft((current) => ({
                        ...current,
                        endedOffsetMinutes,
                        originalEndedAt: undefined,
                      }))
                      invalidatePendingSave()
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
                      {...buttonActivationProps(() =>
                        openExerciseCatalog('workout-manage-actions'),
                      )}
                      id="workout-manage-actions"
                      className="catalog-create"
                    >
                      管理我的动作
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
                    {!hasReadSnapshot ? (
                      <View className="catalog-empty">
                        {loading
                          ? '正在核对可复用动作…'
                          : '动作目录尚未核对；重新核对成功后才会显示可复用动作。'}
                      </View>
                    ) : filteredCatalog.length ? (
                      filteredCatalog.map((item) => {
                        const selected = draft.exercises.some(
                          (exercise) => exercise.exerciseKey === item.key,
                        )
                        return (
                          <View className="catalog-entry" key={item.id}>
                            <Button
                              {...buttonA11yProps}
                              className={`catalog-entry__add ${selected ? 'catalog-entry__add--selected' : ''}`}
                              disabled={selected || !readAuthorityReady}
                              aria-disabled={selected || !readAuthorityReady}
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
                                {...buttonActivationProps(
                                  () =>
                                    openExerciseCatalog(`workout-edit-action-${item.id}`, item.id),
                                  !readAuthorityReady,
                                )}
                                id={`workout-edit-action-${item.id}`}
                                className="catalog-entry__edit"
                                aria-label={`编辑自定义动作${item.name}`}
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
                        onClick={() => {
                          setDraft((current) => ({ ...current, loadUnit: unit }))
                          invalidatePendingSave()
                        }}
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
                          onClick={() => {
                            setDraft((current) => ({ ...current, fatigue: value }))
                            invalidatePendingSave()
                          }}
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
                          onClick={() => {
                            setDraft((current) => ({ ...current, painLevel: value }))
                            invalidatePendingSave()
                          }}
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
                    onInput={(event) => {
                      setDraft((current) => ({ ...current, note: event.detail.value }))
                      invalidatePendingSave()
                    }}
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
                  <View
                    className={`workout-feedback ${saveRecovery ? `workout-feedback--${saveRecovery.kind}` : ''}`}
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    {saveRecovery ? (
                      <Text className="workout-feedback__eyebrow">{saveRecovery.eyebrow}</Text>
                    ) : null}
                    <Text>{feedback}</Text>
                  </View>
                ) : null}

                <Button
                  {...buttonA11yProps}
                  className="save-workout"
                  disabled={saving || !readAuthorityReady}
                  aria-disabled={saving || !readAuthorityReady}
                  onClick={() => void save()}
                >
                  {saving
                    ? '正在保存…'
                    : (saveRecovery?.actionLabel ?? (editing ? '保存训练新版本' : '保存训练'))}
                </Button>
              </View>
            </View>

            <View className="workout-card workout-ledger">
              <View className="workout-section-heading workout-ledger__heading">
                <View>
                  <Text className="workouts-eyebrow">RECENT SESSIONS</Text>
                  <Text className="workout-panel-title">训练记录簿</Text>
                </View>
                <View className="workout-ledger__tools">
                  <Text className="workout-ledger__count metric">
                    {readAuthorityReady
                      ? `已载入 ${workouts.length}`
                      : hasReadSnapshot
                        ? `保留 ${workouts.length}`
                        : '尚未核对'}
                  </Text>
                  {readPhase === 'ready' || readPhase === 'refreshing' ? (
                    <Button
                      id="workout-read-refresh"
                      className="workout-read-refresh"
                      aria-label="更新训练与动作目录"
                      {...buttonActivationProps(
                        () => void loadWorkoutAuthority(),
                        loading || loadingMore || saving,
                      )}
                    >
                      {loading ? '核对中…' : '更新训练'}
                    </Button>
                  ) : null}
                </View>
              </View>
              {loading && !hasReadSnapshot ? (
                <View className="workout-empty">正在整理训练…</View>
              ) : !hasReadSnapshot ? (
                <View className="workout-empty">
                  <Text className="workout-empty__mark">?</Text>
                  <Text className="workout-empty__title">训练数量尚未核对</Text>
                  <Text className="workout-empty__body">
                    重新核对成功后，才会显示当前训练或空记录簿。
                  </Text>
                </View>
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
                          disabled={!readAuthorityReady}
                          aria-disabled={!readAuthorityReady}
                          onClick={() => repeat(workout)}
                        >
                          重复
                        </Button>
                        <Button
                          {...buttonA11yProps}
                          className="entry-action"
                          disabled={!readAuthorityReady}
                          aria-disabled={!readAuthorityReady}
                          onClick={() => edit(workout)}
                        >
                          修改
                        </Button>
                        <Button
                          id={`workout-history-trigger-${workout.id}`}
                          className="entry-action"
                          disabled={!readAuthorityReady}
                          {...buttonActivationProps(
                            () =>
                              historyRead.open(workout, `workout-history-trigger-${workout.id}`),
                            !readAuthorityReady,
                          )}
                        >
                          历史
                        </Button>
                        <Button
                          {...buttonA11yProps}
                          className="entry-action entry-action--danger"
                          disabled={!readAuthorityReady}
                          aria-disabled={!readAuthorityReady}
                          onClick={() => {
                            if (readAuthorityReady) setDeleting(workout)
                          }}
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
                      disabled={loadingMore || !readAuthorityReady}
                      aria-disabled={loadingMore || !readAuthorityReady}
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
                disabled={saving || !readAuthorityReady}
                aria-disabled={saving || !readAuthorityReady}
                onClick={() => void remove()}
              >
                确认删除
              </Button>
            </View>
          </View>
        </View>
      ) : null}

      {historyRead.target ? (
        <View
          className="workout-history"
          role="dialog"
          aria-modal="true"
          aria-label="训练历史"
          {...escapeDismissProps(historyRead.dismiss)}
        >
          <Button
            className="workout-history__scrim"
            aria-label="关闭训练历史"
            {...buttonActivationProps(historyRead.dismiss)}
          />
          <View className="workout-history__sheet">
            <View className="workout-section-heading">
              <View>
                <Text className="workouts-eyebrow">AUDIT TRAIL</Text>
                <Text className="workout-panel-title">{historyRead.target.title}历史</Text>
              </View>
              <Button
                id="workout-history-close"
                className="history-close-button"
                aria-label="关闭训练历史"
                {...buttonActivationProps(historyRead.dismiss)}
              >
                ×
              </Button>
            </View>
            <AggregateHistoryReadState
              phase={historyRead.phase}
              failure={historyRead.failure}
              subject="训练"
              itemCount={historyRead.items?.length ?? 0}
              retryId="workout-history-read-retry"
              onRetry={historyRead.retry}
            />
            {historyRead.items !== undefined ? (
              <View className="workout-history__list">
                {historyRead.items.map((item) => (
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
                {historyRead.items.length === 0 ? (
                  <AggregateHistoryEmptyState subject="训练" />
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

export default WorkoutsPage
