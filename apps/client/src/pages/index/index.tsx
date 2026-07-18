import { useState } from 'react'
import { Button, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import { buttonA11yProps } from '../../lib/accessibility'
import { todayFixture, type RailItem } from './today.fixture'
import './index.scss'

const statusLabel: Record<RailItem['status'], string> = {
  confirmed: '已确认',
  estimated: '待确认',
  planned: '计划',
}

const quickActions = [
  { key: 'body', glyph: '体', label: '身体' },
  { key: 'workout', glyph: '训', label: '训练' },
  { key: 'meal', glyph: '餐', label: '饮食' },
  { key: 'recovery', glyph: '恢', label: '恢复' },
] as const

const navItems = [
  { key: 'today', glyph: '今', label: '今天' },
  { key: 'record', glyph: '记', label: '记录' },
  { key: 'plan', glyph: '划', label: '计划' },
  { key: 'coach', glyph: '问', label: '教练' },
  { key: 'me', glyph: '我', label: '我的' },
] as const

const openRecords = () => void Taro.navigateTo({ url: '/pages/records/index' })

const RailEntry = ({ item, onAction }: { item: RailItem; onAction: (item: RailItem) => void }) => (
  <View className={`rail-entry rail-entry--${item.status}`}>
    <View className="rail-entry__time metric">{item.time}</View>
    <View className="rail-entry__marker" aria-hidden="true">
      <View className="rail-entry__dot" />
    </View>
    <View className="rail-entry__content">
      <View className="rail-entry__heading">
        <Text className="rail-entry__category">{item.category}</Text>
        <Text className={`status status--${item.status}`}>{statusLabel[item.status]}</Text>
      </View>
      <View className="rail-entry__main">
        <Text className="rail-entry__title">{item.title}</Text>
        {item.value ? <Text className="rail-entry__value metric">{item.value}</Text> : null}
      </View>
      <Text className="rail-entry__note">{item.note}</Text>
      {item.action ? (
        <Button {...buttonA11yProps} className="rail-entry__action" onClick={() => onAction(item)}>
          {item.action}
          <Text aria-hidden="true"> →</Text>
        </Button>
      ) : null}
    </View>
  </View>
)

const IndexPage = () => {
  const [feedback, setFeedback] = useState('')
  const { readiness, completion, rail, rationale } = todayFixture

  const handleRailAction = (item: RailItem) => {
    setFeedback(
      item.status === 'estimated'
        ? '午餐仍是估计值；记录表单接入后，需要确认食物和份量。'
        : '训练已准备好；计时与动作记录将在训练模块接入。',
    )
  }

  return (
    <View className="today-page">
      <ScrollView className="today-scroll" scrollY enhanced showScrollbar={false}>
        <View className="today-shell">
          <View className="topbar">
            <View className="wordmark" aria-label="衡迹 MyFitness">
              <Text className="wordmark__cn">衡迹</Text>
              <Text className="wordmark__en">DAILY NOTE</Text>
            </View>
            <Button
              {...buttonA11yProps}
              className="profile-mark"
              aria-label="建立或更新个人资料"
              onClick={() => void Taro.navigateTo({ url: '/pages/onboarding/index' })}
            >
              陈
            </Button>
          </View>

          <View className="desktop-grid">
            <View className="desktop-grid__main">
              <View className="hero">
                <Text className="eyebrow">{todayFixture.dateLabel}</Text>
                <Text className="hero__greeting">{todayFixture.greeting}</Text>
                <Text className="hero__title">{todayFixture.focus}</Text>
                <Text className="hero__body">{readiness.note}</Text>
                <View className="readiness">
                  <View className="readiness__score metric">{readiness.score}</View>
                  <View className="readiness__copy">
                    <Text className="readiness__label">{readiness.label}</Text>
                    <Text className="readiness__hint">根据近 3 天记录整理</Text>
                  </View>
                  <View className="readiness__ticks" aria-hidden="true">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <View
                        key={`readiness-${index}`}
                        className={`readiness__tick ${index < 4 ? 'readiness__tick--active' : ''}`}
                      />
                    ))}
                  </View>
                </View>
              </View>

              <View className="section rhythm-card">
                <View className="section-heading">
                  <View>
                    <Text className="section-heading__eyebrow">PLAN / ACTUAL</Text>
                    <Text className="section-heading__title">今日节律</Text>
                  </View>
                  <View className="completion">
                    <Text className="completion__value metric">{completion.completed}</Text>
                    <Text className="completion__total metric">/{completion.total}</Text>
                    <Text className="completion__label">已记录</Text>
                  </View>
                </View>

                <View className="rail" aria-label="今日计划和记录">
                  {rail.map((item) => (
                    <RailEntry item={item} key={item.id} onAction={handleRailAction} />
                  ))}
                </View>

                {feedback ? (
                  <View className="inline-feedback" role="status">
                    <Text>{feedback}</Text>
                    <Button
                      {...buttonA11yProps}
                      className="inline-feedback__close"
                      onClick={() => setFeedback('')}
                    >
                      关闭
                    </Button>
                  </View>
                ) : null}
              </View>
            </View>

            <View className="desktop-grid__aside">
              <View className="section reason-card">
                <Text className="section-heading__eyebrow">WHY THIS PLAN</Text>
                <Text className="reason-card__title">{rationale.title}</Text>
                <Text className="reason-card__body">{rationale.body}</Text>
                <View className="evidence-list">
                  {rationale.evidence.map((item) => (
                    <View className="evidence" key={item.label}>
                      <Text className="evidence__label">{item.label}</Text>
                      <Text className="evidence__value metric">{item.value}</Text>
                    </View>
                  ))}
                </View>
                <Button {...buttonA11yProps} className="text-action">
                  查看调整依据 →
                </Button>
              </View>

              <View className="section quick-card">
                <View className="quick-card__heading">
                  <Text className="section-heading__title">快速记录</Text>
                  <Text className="quick-card__hint">常用项将在这里置顶</Text>
                </View>
                <View className="quick-grid">
                  {quickActions.map((action) => (
                    <Button
                      {...buttonA11yProps}
                      className="quick-action"
                      key={action.key}
                      onClick={() => {
                        if (action.key === 'body' || action.key === 'recovery') openRecords()
                        else setFeedback(`${action.label}记录将在后续迭代接入。`)
                      }}
                    >
                      <Text className="quick-action__glyph" aria-hidden="true">
                        {action.glyph}
                      </Text>
                      <Text>{action.label}</Text>
                    </Button>
                  ))}
                </View>
              </View>
            </View>
          </View>

          <Text className="safety-note">AI 内容是生活方式建议，不替代医疗诊断或专业治疗。</Text>
        </View>
      </ScrollView>

      <View className="bottom-nav" role="navigation" aria-label="主要导航">
        {navItems.map((item) => (
          <Button
            {...buttonA11yProps}
            className={`nav-item ${item.key === 'today' ? 'nav-item--active' : ''}`}
            key={item.key}
            aria-current={item.key === 'today' ? 'page' : undefined}
            onClick={() => {
              if (item.key === 'me') {
                void Taro.navigateTo({ url: '/pages/onboarding/index' })
              } else if (item.key === 'record') {
                openRecords()
              } else if (item.key !== 'today') {
                setFeedback(`${item.label}模块将在后续迭代接入。`)
              }
            }}
          >
            <Text className="nav-item__glyph" aria-hidden="true">
              {item.glyph}
            </Text>
            <Text>{item.label}</Text>
          </Button>
        ))}
      </View>
    </View>
  )
}

export default IndexPage
