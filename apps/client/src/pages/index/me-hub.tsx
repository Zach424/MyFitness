import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import { buttonActivationProps } from '../../lib/accessibility'
import { meHubSections } from './me-hub.model'
import './me-hub.scss'

type MeHubProps = {
  onClose: () => void
}

export const MeHub = ({ onClose }: MeHubProps) => (
  <View className="me-shell">
    <View className="me-topbar">
      <Button className="me-back" aria-label="返回今日" {...buttonActivationProps(onClose)}>
        ‹
      </Button>
      <View className="me-wordmark" aria-label="衡迹我的工作台">
        <Text className="me-wordmark__cn">我的衡迹</Text>
        <Text className="me-wordmark__en">OWNERSHIP NOTE</Text>
      </View>
    </View>

    <View className="me-hero">
      <Text className="me-eyebrow">ONE PLACE, TWO AUTHORITIES</Text>
      <Text className="me-title">你提供什么，由你决定。</Text>
      <Text className="me-lead">
        个人资料决定计划依据，数据台账决定保管权限。这里把两者放在一起，但不会复制它们的当前状态。
      </Text>
    </View>

    <View className="me-ledger" aria-label="我的资料与数据控制入口">
      {meHubSections.map((section) => (
        <View className={`me-folio me-folio--${section.id}`} key={section.id}>
          <View className="me-folio__index" aria-hidden="true">
            {section.id === 'profile' ? '我' : '权'}
          </View>
          <View className="me-folio__content">
            <Text className="me-folio__eyebrow">{section.eyebrow}</Text>
            <Text className="me-folio__title">{section.title}</Text>
            <Text className="me-folio__description">{section.description}</Text>
            <View className="me-capabilities" aria-label={`${section.title}包含的功能`}>
              {section.capabilities.map((capability) => (
                <Text className="me-capability" key={capability}>
                  {capability}
                </Text>
              ))}
            </View>
            <Text className="me-folio__boundary">{section.boundary}</Text>
            <Button
              className="me-folio__action"
              {...buttonActivationProps(() => void Taro.navigateTo({ url: section.path }))}
            >
              {section.actionLabel}
            </Button>
          </View>
        </View>
      ))}
    </View>

    <View className="me-trust-note" role="note">
      <Text className="me-trust-note__label">入口边界</Text>
      <Text className="me-trust-note__body">
        本页不读取健康数据、不判断资料是否完整，也不提供快捷删除。每项事实和敏感操作只由对应页面在取得当前服务凭据后显示。
      </Text>
    </View>
  </View>
)
