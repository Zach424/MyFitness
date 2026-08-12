import { useEffect, useRef, useState } from 'react'
import { Button, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { PersonalModelFeedbackChoice } from '@myfitness/contracts'

import { PersonalModelCurrentSubjectCard } from '../../components/personal-model-current-subject-card'
import { buttonActivationProps, deferH5Focus } from '../../lib/accessibility'
import { submitPersonalModelFeedback } from '../../lib/personal-model-feedback-api'
import { createPersonalModelFeedbackEventId } from '../../lib/personal-model-feedback-event'
import {
  acceptPersonalModelFeedbackWrite,
  beginPersonalModelFeedbackWrite,
  createPersonalModelFeedbackWriteState,
  failPersonalModelFeedbackWrite,
  invalidatePersonalModelFeedbackWrite,
  replacePersonalModelFeedbackSubject,
  type PersonalModelFeedbackWriteState,
} from '../../lib/personal-model-feedback-write'
import { getCurrentPersonalModelSubject } from '../../lib/personal-model-current-subject-api'
import { presentPersonalModelCurrentSubject } from '../../lib/personal-model-current-subject-presentation'
import {
  acceptPersonalModelCurrentSubjectRead,
  beginPersonalModelCurrentSubjectRead,
  createPersonalModelCurrentSubjectReadState,
  failPersonalModelCurrentSubjectRead,
  invalidatePersonalModelCurrentSubjectRead,
  personalModelCurrentSubjectReadPhase,
  replacePersonalModelCurrentSubject,
  type PersonalModelCurrentSubjectReadState,
} from '../../lib/personal-model-current-subject-read'
import type { DeferredH5FocusRequest } from '../../lib/accessibility'
import {
  defaultPersonalModelPageSubject,
  personalModelPageFailureCopy,
  personalModelPageFeedbackFailureCopy,
  personalModelPageFeedbackOptions,
  personalModelPageSubjectContext,
  personalModelPageSubjectOption,
  personalModelPageSubjects,
} from './personal-model-page.model'
import './index.scss'

const PersonalModelPage = () => {
  const initialState = useRef(
    createPersonalModelCurrentSubjectReadState(defaultPersonalModelPageSubject),
  )
  const stateRef = useRef<PersonalModelCurrentSubjectReadState>(initialState.current)
  const pageActive = useRef(true)
  const failureFocus = useRef<DeferredH5FocusRequest | false>(false)
  const [readState, setReadState] = useState(initialState.current)
  const initialWriteState = useRef(
    createPersonalModelFeedbackWriteState(defaultPersonalModelPageSubject),
  )
  const writeStateRef = useRef<PersonalModelFeedbackWriteState>(initialWriteState.current)
  const [writeState, setWriteState] = useState(initialWriteState.current)

  const commit = (next: PersonalModelCurrentSubjectReadState) => {
    stateRef.current = next
    setReadState(next)
  }

  const cancelFailureFocus = () => {
    failureFocus.current && failureFocus.current.cancel()
    failureFocus.current = false
  }

  const commitWrite = (next: PersonalModelFeedbackWriteState) => {
    writeStateRef.current = next
    setWriteState(next)
  }

  const readCurrentSubject = async (): Promise<boolean> => {
    if (stateRef.current.busy || writeStateRef.current.phase === 'submitting') return false
    cancelFailureFocus()
    const begun = beginPersonalModelCurrentSubjectRead(stateRef.current)
    commit(begun.state)
    try {
      const snapshot = await getCurrentPersonalModelSubject(begun.receipt.subjectKey)
      if (!pageActive.current) return false
      const next = acceptPersonalModelCurrentSubjectRead(stateRef.current, begun.receipt, snapshot)
      if (next === stateRef.current) return false
      commit(next)
      return true
    } catch (error) {
      if (!pageActive.current) return false
      const next = failPersonalModelCurrentSubjectRead(stateRef.current, begun.receipt, error)
      if (next === stateRef.current) return false
      commit(next)
      failureFocus.current = deferH5Focus('personal-model-read-retry', next.snapshot ? 80 : 450, {
        canFocus: () =>
          pageActive.current &&
          stateRef.current.subjectKey === begun.receipt.subjectKey &&
          stateRef.current.generation === begun.receipt.generation &&
          stateRef.current.failure !== undefined,
      })
      return false
    }
  }

  const rereadAfterFeedbackConflict = async () => {
    const subjectKey = stateRef.current.subjectKey
    if (!(await readCurrentSubject())) return
    if (
      pageActive.current &&
      stateRef.current.subjectKey === subjectKey &&
      writeStateRef.current.failure?.kind === 'conflict'
    ) {
      commitWrite(createPersonalModelFeedbackWriteState(subjectKey))
    }
  }

  const selectSubject = (subjectKey: (typeof personalModelPageSubjects)[number]['subjectKey']) => {
    if (subjectKey === stateRef.current.subjectKey || writeStateRef.current.phase === 'submitting')
      return
    cancelFailureFocus()
    commit(replacePersonalModelCurrentSubject(stateRef.current, subjectKey))
    commitWrite(replacePersonalModelFeedbackSubject(writeStateRef.current, subjectKey))
    void readCurrentSubject()
  }

  const writeFeedback = async (
    choice: Exclude<PersonalModelFeedbackChoice, 'temporary_context'>,
    retry = false,
  ) => {
    const snapshot = stateRef.current.snapshot?.current
    if (!snapshot || snapshot.terminal || writeStateRef.current.phase === 'submitting') return
    const requestedEventId = retry
      ? writeStateRef.current.eventId
      : createPersonalModelFeedbackEventId()
    const requestedChoice = retry ? writeStateRef.current.choice : choice
    if (!requestedEventId || requestedChoice === undefined) return

    const target = retry
      ? writeStateRef.current.target
      : { itemId: snapshot.itemId, revision: snapshot.revision }
    if (!target) return
    const begun = beginPersonalModelFeedbackWrite(
      writeStateRef.current,
      target,
      requestedEventId,
      requestedChoice,
    )
    commitWrite(begun.state)
    try {
      const result = await submitPersonalModelFeedback(target, {
        schemaVersion: 'personal-model-feedback-write-request-v1',
        eventId: requestedEventId,
        choice: requestedChoice,
        reasonCode: null,
        note: null,
        contextValidUntil: null,
      })
      if (!pageActive.current) return
      const next = acceptPersonalModelFeedbackWrite(writeStateRef.current, begun.receipt, result)
      if (next === writeStateRef.current) return
      commitWrite(next)
      await readCurrentSubject()
    } catch (error) {
      if (!pageActive.current) return
      const next = failPersonalModelFeedbackWrite(writeStateRef.current, begun.receipt, error)
      if (next !== writeStateRef.current) commitWrite(next)
    }
  }

  useEffect(() => {
    pageActive.current = true
    void readCurrentSubject()
    return () => {
      pageActive.current = false
      cancelFailureFocus()
      stateRef.current = invalidatePersonalModelCurrentSubjectRead(stateRef.current)
      writeStateRef.current = invalidatePersonalModelFeedbackWrite(writeStateRef.current)
    }
  }, [])

  const selectedSubject = personalModelPageSubjectOption(readState.subjectKey)
  const selectedContext = personalModelPageSubjectContext(readState.subjectKey)
  const phase = personalModelCurrentSubjectReadPhase(readState)
  const presentation = readState.snapshot
    ? presentPersonalModelCurrentSubject(readState.snapshot)
    : undefined
  const failure = readState.failure
    ? personalModelPageFailureCopy(readState.failure.kind, Boolean(readState.snapshot))
    : undefined
  const showRetained = presentation && (phase === 'refreshing' || phase === 'stale')
  const feedbackTarget = readState.snapshot?.current
  const feedbackDisabled =
    !feedbackTarget ||
    feedbackTarget.terminal ||
    phase !== 'ready' ||
    writeState.phase === 'submitting'
  const feedbackFailure = writeState.failure
    ? personalModelPageFeedbackFailureCopy(writeState.failure.kind)
    : undefined
  const retryableFeedbackChoice = personalModelPageFeedbackOptions.find(
    (option) => option.choice === writeState.choice,
  )?.choice
  const selectedFeedbackChoice =
    feedbackTarget?.feedbackState === 'confirmed'
      ? 'matches_me'
      : feedbackTarget?.feedbackState === 'disagreed'
        ? 'disagree'
        : feedbackTarget?.feedbackState === 'uncertain'
          ? 'uncertain'
          : undefined
  const feedbackReconciled =
    writeState.result !== undefined &&
    feedbackTarget?.itemId === writeState.result.itemId &&
    feedbackTarget.revision === writeState.result.currentRevision &&
    feedbackTarget.feedbackState === writeState.result.feedbackState

  return (
    <View className="personal-model-page">
      <ScrollView className="personal-model-page__scroll" scrollY enhanced showScrollbar={false}>
        <View className="personal-model-page__shell" aria-label="个人认知核对">
          <View className="personal-model-page__topbar">
            <Button
              className="personal-model-page__back"
              aria-label="返回我的衡迹"
              {...buttonActivationProps(() => void Taro.navigateBack())}
            >
              ←
            </Button>
            <View className="personal-model-page__wordmark">
              <Text>衡迹</Text>
              <Text className="personal-model-page__wordmark-en">PERSONAL MODEL</Text>
            </View>
            <Text className="personal-model-page__proof">仅本人</Text>
          </View>

          <View className="personal-model-page__intro">
            <Text className="personal-model-page__eyebrow">RECORDED, NOT ASSUMED</Text>
            <Text className="personal-model-page__title">
              系统目前看见的，是你的记录，不是你的全部。
            </Text>
            <Text className="personal-model-page__lead">
              一次只核对一项本人资料或已确认训练记录。切换主题会清除上一项快照，不会把三项拼成评分或自动调整你的计划。
            </Text>
          </View>

          <View
            className="personal-model-page__subject-register"
            role="group"
            aria-label="选择要核对的个人认知"
          >
            {personalModelPageSubjects.map((option) => {
              const selected = option.subjectKey === readState.subjectKey
              return (
                <Button
                  key={option.subjectKey}
                  className={`personal-model-page__subject${selected ? ' personal-model-page__subject--selected' : ''}`}
                  aria-pressed={selected}
                  {...buttonActivationProps(
                    () => selectSubject(option.subjectKey),
                    writeState.phase === 'submitting',
                  )}
                >
                  {option.label}
                </Button>
              )
            })}
          </View>

          <View className="personal-model-page__subject-context" role="note">
            <Text>{selectedContext}</Text>
          </View>

          {readState.snapshot ? (
            <View className="personal-model-page__toolbar">
              <Text>更新会重新核对当前记录；完成前保留上次成功快照。</Text>
              <Button
                id="personal-model-refresh"
                className="personal-model-page__refresh"
                {...buttonActivationProps(
                  () => void readCurrentSubject(),
                  phase !== 'ready' || writeState.phase === 'submitting',
                )}
              >
                {phase === 'refreshing' ? '核对中…' : '更新观察'}
              </Button>
            </View>
          ) : null}

          {phase === 'unread' || phase === 'initial-loading' ? (
            <View className="personal-model-page__state" role="status">
              <Text className="personal-model-page__state-eyebrow">CHECKING CURRENT SUBJECT</Text>
              <Text className="personal-model-page__state-title">
                {selectedSubject.loadingTitle}
              </Text>
              <Text className="personal-model-page__state-copy">
                完整读取成功后才会显示空主题或当前观察；加载中不会使用零值占位。
              </Text>
            </View>
          ) : null}

          {phase === 'refreshing' ? (
            <View
              className="personal-model-page__state personal-model-page__state--refreshing"
              role="status"
            >
              <Text className="personal-model-page__state-eyebrow">REFRESHING / 保留上次观察</Text>
              <Text className="personal-model-page__state-title">正在复核最新记录</Text>
              <Text className="personal-model-page__state-copy">
                下方继续显示上次成功读取的完整快照；新结果到达前不会拼接或替换字段。
              </Text>
            </View>
          ) : null}

          {failure ? (
            <View
              className="personal-model-page__state personal-model-page__state--failure"
              role="status"
            >
              <Text className="personal-model-page__state-eyebrow">{failure.eyebrow}</Text>
              <Text className="personal-model-page__state-title">{failure.title}</Text>
              <Text className="personal-model-page__state-copy">{failure.detail}</Text>
              <Button
                id="personal-model-read-retry"
                className="personal-model-page__retry"
                {...buttonActivationProps(() => void readCurrentSubject())}
              >
                重新核对
              </Button>
            </View>
          ) : null}

          {presentation && (phase === 'ready' || showRetained) ? (
            <PersonalModelCurrentSubjectCard presentation={presentation} />
          ) : null}

          {feedbackTarget && !feedbackTarget.terminal ? (
            <View className="personal-model-page__feedback" aria-label="本人校准当前认识">
              <Text className="personal-model-page__feedback-label">CALIBRATE / 本人校准</Text>
              <Text className="personal-model-page__feedback-title">
                这项认识符合你现在的情况吗？
              </Text>
              <Text className="personal-model-page__feedback-copy">
                你的选择只校准这项认识，不会改写原始记录，也不会自动调整计划。
              </Text>
              <View className="personal-model-page__feedback-options" role="group">
                {personalModelPageFeedbackOptions.map((option) => (
                  <Button
                    key={option.choice}
                    className="personal-model-page__feedback-option"
                    aria-pressed={selectedFeedbackChoice === option.choice}
                    aria-label={`${option.label}：${option.detail}`}
                    {...buttonActivationProps(
                      () => void writeFeedback(option.choice),
                      feedbackDisabled,
                    )}
                  >
                    {option.label}
                  </Button>
                ))}
              </View>
              <Text className="personal-model-page__feedback-temporary">
                “只是暂时情况”需要你指定截止时间，将在下一步开放。
              </Text>
              {writeState.phase === 'submitting' ? (
                <View className="personal-model-page__feedback-status" role="status">
                  <Text>
                    正在保存“
                    {
                      personalModelPageFeedbackOptions.find(
                        (option) => option.choice === writeState.choice,
                      )?.label
                    }
                    ”
                  </Text>
                </View>
              ) : null}
              {writeState.phase === 'succeeded' ? (
                <View className="personal-model-page__feedback-status" role="status">
                  <Text>
                    {phase === 'refreshing'
                      ? '反馈已保存，正在重新读取当前认识。'
                      : feedbackReconciled
                        ? '反馈已保存，当前认识已重新核对。'
                        : '反馈已保存，但最新认识尚未重新读取；请手动更新观察。'}
                  </Text>
                </View>
              ) : null}
              {feedbackFailure ? (
                <View className="personal-model-page__feedback-error" role="status">
                  <Text className="personal-model-page__feedback-label">
                    {feedbackFailure.eyebrow}
                  </Text>
                  <Text className="personal-model-page__feedback-error-title">
                    {feedbackFailure.title}
                  </Text>
                  <Text className="personal-model-page__feedback-error-copy">
                    {feedbackFailure.detail}
                  </Text>
                  {feedbackFailure.retryable && retryableFeedbackChoice ? (
                    <Button
                      className="personal-model-page__feedback-retry"
                      {...buttonActivationProps(
                        () => void writeFeedback(retryableFeedbackChoice, true),
                      )}
                    >
                      重试同一次反馈
                    </Button>
                  ) : writeState.failure?.kind === 'conflict' ? (
                    <Button
                      className="personal-model-page__feedback-retry"
                      {...buttonActivationProps(() => void rereadAfterFeedbackConflict())}
                    >
                      读取最新认识
                    </Button>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}

          <View className="personal-model-page__boundary" role="note">
            <Text className="personal-model-page__boundary-label">当前边界</Text>
            <Text className="personal-model-page__boundary-copy">
              当前开放三项逐项核对与三种结构化反馈，但不会批量读取或组合画像。暂时情况、备注、历史代际和证据正文尚未接入本页。
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

export default PersonalModelPage
