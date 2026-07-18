import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, ScrollView, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { Workout, WorkoutHistoryItem } from '@myfitness/contracts'
import { exerciseCatalog } from '@myfitness/contracts/workout.constants'

import { buttonA11yProps } from '../../lib/accessibility'
import {
  ApiError,
  createWorkout,
  deleteWorkout,
  getWorkoutHistory,
  listWorkouts,
  updateWorkout,
} from '../../lib/api'
import {
  buildWorkoutRequest,
  createExerciseDraft,
  draftFromWorkout,
  exerciseMode,
  initialWorkoutDraft,
  type WorkoutDraft,
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

const WorkoutsPage = () => {
  const [draft, setDraft] = useState<WorkoutDraft>(initialWorkoutDraft)
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [editing, setEditing] = useState<Workout>()
  const [deleting, setDeleting] = useState<Workout>()
  const [historyWorkout, setHistoryWorkout] = useState<Workout>()
  const [history, setHistory] = useState<WorkoutHistoryItem[]>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const pendingKey = useRef('')

  useEffect(() => {
    void (async () => {
      try {
        setWorkouts((await listWorkouts()).items)
      } catch (error) {
        setFeedback(messageOf(error))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const summary = useMemo(() => workoutDraftSummary(draft), [draft])

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

  const addExercise = (catalogIndex: number) => {
    const item = exerciseCatalog[catalogIndex]
    if (!item) return
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
        setWorkouts((current) =>
          current.map((workout) => (workout.id === saved.id ? saved : workout)),
        )
        setEditing(undefined)
        setDraft(initialWorkoutDraft())
        setFeedback('训练修改已保存，上一版本仍可在历史中查看。')
      } else {
        if (!pendingKey.current) pendingKey.current = requestKey()
        const saved = await createWorkout(buildWorkoutRequest(draft), pendingKey.current)
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
    setEditing(workout)
    setDraft(draftFromWorkout(workout))
    setFeedback('正在修改这次训练；保存会产生新版本。')
    pendingKey.current = ''
    Taro.pageScrollTo({ scrollTop: 0, duration: 220 })
  }

  const repeat = (workout: Workout) => {
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
    try {
      setHistory((await getWorkoutHistory(workout.id)).items)
    } catch (error) {
      setHistoryWorkout(undefined)
      setFeedback(messageOf(error))
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

                <View className="catalog-block">
                  <View className="catalog-block__heading">
                    <Text className="field-caption">添加动作</Text>
                    <Text className="catalog-block__hint">同一动作本次只添加一次</Text>
                  </View>
                  <ScrollView className="exercise-catalog" scrollX enhanced showScrollbar={false}>
                    <View className="exercise-catalog__row">
                      {exerciseCatalog.map((item, index) => (
                        <Button
                          {...buttonA11yProps}
                          className="catalog-chip"
                          key={item.key}
                          disabled={draft.exercises.some(
                            (exercise) => exercise.exerciseKey === item.key,
                          )}
                          onClick={() => addExercise(index)}
                        >
                          ＋ {item.name}
                        </Button>
                      ))}
                    </View>
                  </ScrollView>
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
                <Text className="workout-ledger__count metric">{workouts.length}</Text>
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
