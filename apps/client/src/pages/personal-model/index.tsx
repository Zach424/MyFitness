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
  type PersonalModelCurrentSubjectReadState,
} from '../../lib/personal-model-current-subject-read'
import { personalModelPageFailureCopy, personalModelPageSubject } from './personal-model-page.model'
import './index.scss'

const PersonalModelPage = () => {
  const initialState = useRef(createPersonalModelCurrentSubjectReadState(personalModelPageSubject))
  const stateRef = useRef<PersonalModelCurrentSubjectReadState>(initialState.current)
  const pageActive = useRef(true)
  const [readState, setReadState] = useState(initialState.current)

  const commit = (next: PersonalModelCurrentSubjectReadState) => {
    stateRef.current = next
    setReadState(next)
  }

  const readCurrentSubject = async () => {
    if (stateRef.current.busy) return
    const begun = beginPersonalModelCurrentSubjectRead(stateRef.current)
    commit(begun.state)
    try {
      const snapshot = await getCurrentPersonalModelSubject(personalModelPageSubject)
      if (!pageActive.current) return
      const next = acceptPersonalModelCurrentSubjectRead(stateRef.current, begun.receipt, snapshot)
      if (next !== stateRef.current) commit(next)
    } catch (error) {
      if (!pageActive.current) return
      const next = failPersonalModelCurrentSubjectRead(stateRef.current, begun.receipt, error)
      if (next === stateRef.current) return
      commit(next)
      deferH5Focus('personal-model-read-retry', next.snapshot ? 80 : 450)
    }
  }

  useEffect(() => {
    pageActive.current = true
    void readCurrentSubject()
    return () => {
      pageActive.current = false
      stateRef.current = invalidatePersonalModelCurrentSubjectRead(stateRef.current)
    }
  }, [])

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
        <View className="personal-model-page__shell" aria-label="已记录训练频次个人认知">
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
              本页只核对完整观察周内的已确认训练记录。它不会判断现实训练是否达标，也不会自动调整你的计划。
            </Text>
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
              <Text className="personal-model-page__state-title">正在核对已记录训练频次</Text>
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
              当前只开放“已记录训练频次”。训练时间安排、课次时长、历史代际和反馈操作尚未接入本页。
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

export default PersonalModelPage
