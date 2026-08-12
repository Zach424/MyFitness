import { Text, View } from '@tarojs/components'

import type { PersonalModelCurrentSubjectPresentation } from '../../lib/personal-model-current-subject-presentation'
import './index.scss'

type PersonalModelCurrentSubjectCardProps = {
  presentation: PersonalModelCurrentSubjectPresentation
}

export const PersonalModelCurrentSubjectCard = ({
  presentation,
}: PersonalModelCurrentSubjectCardProps) => {
  if (presentation.kind === 'empty') {
    return (
      <View
        className="personal-model-card personal-model-card--empty"
        role="group"
        aria-label={`${presentation.title}：暂无内容`}
      >
        <Text className="personal-model-card__eyebrow">{presentation.eyebrow}</Text>
        <Text className="personal-model-card__title">{presentation.title}</Text>
        <Text className="personal-model-card__empty-copy">{presentation.detail}</Text>
      </View>
    )
  }

  return (
    <View
      className={`personal-model-card personal-model-card--${presentation.tone}`}
      role="group"
      aria-label={`${presentation.title}个人认知内容`}
    >
      <View className="personal-model-card__header">
        <View>
          <Text className="personal-model-card__eyebrow">{presentation.eyebrow}</Text>
          <Text className="personal-model-card__title">{presentation.title}</Text>
        </View>
        <Text className="personal-model-card__revision">{presentation.revisionLabel}</Text>
      </View>

      <Text className="personal-model-card__summary">{presentation.summary}</Text>
      <Text className="personal-model-card__interpretation">{presentation.interpretation}</Text>
      <Text className="personal-model-card__source">{presentation.sourceLabel}</Text>

      <View className="personal-model-card__notice" role="status">
        <Text className="personal-model-card__notice-title">{presentation.statusLabel}</Text>
        <Text className="personal-model-card__notice-copy">{presentation.statusDetail}</Text>
      </View>

      <View className="personal-model-card__facts" aria-label="核对状态与资料覆盖">
        <View className="personal-model-card__fact">
          <Text className="personal-model-card__fact-label">你的核对</Text>
          <Text className="personal-model-card__fact-value">{presentation.feedbackLabel}</Text>
        </View>
        <View className="personal-model-card__fact">
          <Text className="personal-model-card__fact-label">资料覆盖</Text>
          <Text className="personal-model-card__fact-value">{presentation.confidenceLabel}</Text>
        </View>
      </View>

      <View className="personal-model-card__evidence" aria-label="证据刻度">
        <Text className="personal-model-card__section-label">EVIDENCE SCALE / 证据刻度</Text>
        <View className="personal-model-card__scale">
          {presentation.evidenceCounts.map((count) => (
            <View className="personal-model-card__scale-item" key={count.key}>
              <Text className="personal-model-card__scale-value">{count.value}</Text>
              <Text className="personal-model-card__scale-label">{count.label}</Text>
            </View>
          ))}
        </View>
        <Text className="personal-model-card__time">{presentation.evidenceWindowLabel}</Text>
        <Text className="personal-model-card__time">{presentation.evidenceAsOfLabel}</Text>
      </View>

      <View className="personal-model-card__limits" aria-label="资料限制">
        <Text className="personal-model-card__section-label">资料限制</Text>
        {presentation.limitationLabels.map((limitation) => (
          <Text className="personal-model-card__limit" key={limitation}>
            {limitation}
          </Text>
        ))}
      </View>

      <Text className="personal-model-card__validity">{presentation.validityLabel}</Text>
    </View>
  )
}
