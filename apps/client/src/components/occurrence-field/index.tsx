import { Button, Input, Text, View } from '@tarojs/components'

import { buttonA11yProps } from '../../lib/accessibility'
import {
  isOccurrenceDateOnly,
  occurrenceValidationMessage,
  resolveLocalOccurrence,
} from '../../lib/occurrence-time'
import './index.scss'

type OccurrenceFieldProps = {
  label: string
  value: string
  timeZone: string
  selectedOffsetMinutes?: number
  onChange: (value: string) => void
  onTimeZoneChange: (timeZone: string) => void
  onOffsetChange: (offsetMinutes: number | undefined) => void
}

export const OccurrenceField = ({
  label,
  value,
  timeZone,
  selectedOffsetMinutes,
  onChange,
  onTimeZoneChange,
  onOffsetChange,
}: OccurrenceFieldProps) => {
  const dateOnly = isOccurrenceDateOnly(value)
  const inspection = resolveLocalOccurrence(value, timeZone)
  const error = dateOnly ? '' : occurrenceValidationMessage(value, timeZone, selectedOffsetMinutes)
  const selected = resolveLocalOccurrence(value, timeZone, selectedOffsetMinutes)

  return (
    <View className="occurrence-field">
      <View className="occurrence-field__heading">
        <Text className="occurrence-field__label">{label}</Text>
        <Text className="occurrence-field__zone">LOCAL TIME / IANA ZONE</Text>
      </View>
      <Input
        className={`occurrence-field__input ${error ? 'occurrence-field__input--error' : ''}`}
        value={value}
        maxlength={16}
        placeholder="YYYY-MM-DD HH:mm，留空为现在"
        aria-label={`${label}，年-月-日 时:分`}
        aria-invalid={Boolean(error)}
        onInput={(event) => {
          onOffsetChange(undefined)
          onChange(event.detail.value)
        }}
      />
      <Input
        className="occurrence-field__zone-input"
        value={timeZone}
        maxlength={64}
        placeholder="IANA 时区，例如 Asia/Shanghai"
        aria-label={`${label}使用的 IANA 时区`}
        onInput={(event) => {
          onOffsetChange(undefined)
          onTimeZoneChange(event.detail.value)
        }}
      />
      {inspection.status === 'ambiguous' ? (
        <View className="occurrence-field__choices" aria-label="夏令时 UTC 偏移">
          {inspection.candidates.map((candidate) => (
            <Button
              {...buttonA11yProps}
              className={`occurrence-field__choice ${
                selectedOffsetMinutes === candidate.offsetMinutes
                  ? 'occurrence-field__choice--active'
                  : ''
              }`}
              key={candidate.instant}
              aria-pressed={selectedOffsetMinutes === candidate.offsetMinutes}
              onClick={() => onOffsetChange(candidate.offsetMinutes)}
            >
              {candidate.offsetLabel}
            </Button>
          ))}
        </View>
      ) : null}
      <Text className={`occurrence-field__note ${error ? 'occurrence-field__note--error' : ''}`}>
        {dateOnly
          ? '历史日期已带入；请补充 HH:mm 后再保存。'
          : error ||
            (selected.status === 'resolved'
              ? `${selected.candidate.offsetLabel} · 保存为准确时刻`
              : '留空保存为现在；可回填过去记录。')}
      </Text>
    </View>
  )
}
