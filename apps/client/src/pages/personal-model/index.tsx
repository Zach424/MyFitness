import { useEffect, useRef, useState } from 'react'
import { Button, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import { PersonalModelCurrentSubjectCard } from '../../components/personal-model-current-subject-card'
import { buttonActivationProps, deferH5Focus } from '../../lib/accessibility'
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

  const commit = (next: PersonalModelCurrentSubjectReadState) => {
    stateRef.current = next
    setReadState(next)
  }

  const cancelFailureFocus = () => {
    failureFocus.current && failureFocus.current.cancel()
    failureFocus.current = false
  }

  const readCurrentSubject = async () => {
    if (stateRef.current.busy) return
    cancelFailureFocus()
    const begun = beginPersonalModelCurrentSubjectRead(stateRef.current)
    commit(begun.state)
    try {
      const snapshot = await getCurrentPersonalModelSubject(begun.receipt.subjectKey)
      if (!pageActive.current) return
      const next = acceptPersonalModelCurrentSubjectRead(stateRef.current, begun.receipt, snapshot)
      if (next !== stateRef.current) commit(next)
    } catch (error) {
      if (!pageActive.current) return
      const next = failPersonalModelCurrentSubjectRead(stateRef.current, begun.receipt, error)
      if (next === stateRef.current) return
      commit(next)
      failureFocus.current = deferH5Focus('personal-model-read-retry', next.snapshot ? 80 : 450, {
        canFocus: () =>
          pageActive.current &&
          stateRef.current.subjectKey === begun.receipt.subjectKey &&
          stateRef.current.generation === begun.receipt.generation &&
          stateRef.current.failure !== undefined,
      })
    }
  }

  const selectSubject = (subjectKey: (typeof personalModelPageSubjects)[number]['subjectKey']) => {
    if (subjectKey === stateRef.current.subjectKey) return
    cancelFailureFocus()
    commit(replacePersonalModelCurrentSubject(stateRef.current, subjectKey))
    void readCurrentSubject()
  }

  useEffect(() => {
    pageActive.current = true
    void readCurrentSubject()
    return () => {
      pageActive.current = false
      cancelFailureFocus()
      stateRef.current = invalidatePersonalModelCurrentSubjectRead(stateRef.current)
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
                  {...buttonActivationProps(() => selectSubject(option.subjectKey))}
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
                {...buttonActivationProps(() => void readCurrentSubject(), phase !== 'ready')}
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

          <View className="personal-model-page__boundary" role="note">
            <Text className="personal-model-page__boundary-label">当前边界</Text>
            <Text className="personal-model-page__boundary-copy">
              当前开放三项逐项核对，但不会批量读取或组合画像。历史代际、证据正文和反馈操作尚未接入本页。
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

export default PersonalModelPage
