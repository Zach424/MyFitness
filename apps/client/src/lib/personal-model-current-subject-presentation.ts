import type { PersonalModelCurrentSubjectView, PersonalModelSubjectKey } from '@myfitness/contracts'

type CurrentSubjectItem = NonNullable<PersonalModelCurrentSubjectView['current']>

export type PersonalModelCurrentSubjectTone = 'neutral' | 'limited' | 'disputed' | 'retired'

export type PersonalModelEvidenceCountPresentation = {
  key: 'qualified' | 'supporting' | 'contradicting' | 'withdrawn'
  label: string
  value: number
}

export type PersonalModelCurrentSubjectPresentation =
  | {
      kind: 'empty'
      subjectKey: PersonalModelSubjectKey
      eyebrow: string
      title: string
      detail: string
    }
  | {
      kind: 'item'
      subjectKey: PersonalModelSubjectKey
      eyebrow: string
      title: string
      summary: string
      interpretation: string
      sourceLabel: string
      statusLabel: string
      statusDetail: string
      tone: PersonalModelCurrentSubjectTone
      feedbackLabel: string
      confidenceLabel: string
      limitationLabels: string[]
      evidenceCounts: PersonalModelEvidenceCountPresentation[]
      evidenceWindowLabel: string
      evidenceAsOfLabel: string
      revisionLabel: string
      validityLabel: string
    }

const weekdayLabels = {
  mon: '周一',
  tue: '周二',
  wed: '周三',
  thu: '周四',
  fri: '周五',
  sat: '周六',
  sun: '周日',
} as const

const subjectLabels: Record<PersonalModelSubjectKey, string> = {
  'training.availability': '训练时间安排',
  'training.recorded_frequency': '已记录训练频次',
  'training.recorded_session_duration': '已记录课次时长',
}

const sourceLabels: Record<CurrentSubjectItem['source'], string> = {
  user_confirmed: '来自你提交的训练目标',
  deterministic_rule: '由已确认训练记录按固定规则整理',
}

const statusPresentation: Record<
  CurrentSubjectItem['status'],
  { label: string; detail: string; tone: PersonalModelCurrentSubjectTone }
> = {
  candidate: {
    label: '资料仍在积累',
    detail: '当前内容只用于核对；资料达到最低覆盖前，不应据此调整计划。',
    tone: 'limited',
  },
  active: {
    label: '当前保留',
    detail: '这是系统目前保留的内容，仍可能随记录更正或你的反馈而改变。',
    tone: 'neutral',
  },
  disputed: {
    label: '你已表示不同意',
    detail: '这项内容保留用于核对，但不能驱动训练或饮食建议。',
    tone: 'disputed',
  },
  superseded: {
    label: '已被后续内容替代',
    detail: '这项内容已经结束，不再作为当前计划依据。',
    tone: 'retired',
  },
  invalidated: {
    label: '已停止使用',
    detail: '相关资料已失效或被撤回，这项内容不再作为当前计划依据。',
    tone: 'retired',
  },
}

const feedbackLabels: Record<CurrentSubjectItem['feedbackState'], string> = {
  unreviewed: '尚未由你核对',
  confirmed: '你已确认符合当前情况',
  temporary: '你已标记为暂时情况',
  disagreed: '你已表示不同意',
  uncertain: '你已标记为暂不确定',
}

const confidenceLabels: Record<CurrentSubjectItem['confidence']['level'], string> = {
  insufficient: '资料不足',
  low: '资料覆盖较少',
  moderate: '资料达到最低覆盖',
  high: '资料覆盖较多',
}

const limitationLabels: Record<CurrentSubjectItem['confidence']['limitations'][number], string> = {
  limited_coverage: '覆盖范围有限',
  single_window: '只观察了一个时间窗口',
  conflicting_evidence: '资料之间存在冲突',
  stale_evidence: '资料可能已经过时',
  user_disputed: '你对这项内容有异议',
  source_withdrawn: '部分来源已被撤回',
}

const partsAt = (value: string, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    calendar: 'gregory',
    numberingSystem: 'latn',
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(value))
  const valueFor = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${valueFor('year')}-${valueFor('month')}-${valueFor('day')} ${valueFor(
    'hour',
  )}:${valueFor('minute')}`
}

const claimPresentation = (item: CurrentSubjectItem) => {
  switch (item.claimSchemaVersion) {
    case 'training_availability_constraint_v1':
      return {
        summary: `${item.claim.availableDays.map((day) => weekdayLabels[day]).join('、')} · 每次 ${item.claim.sessionMinutes} 分钟`,
        interpretation: '这是你主动填写的可安排时间，不代表已经完成训练。',
      }
    case 'recorded_training_frequency_behavior_v1':
      return {
        summary: `${item.claim.observationWindow.completeWeeks} 个完整周内，每周已记录中位数 ${item.claim.medianSessionsPerWeek} 次`,
        interpretation: `共纳入 ${item.claim.qualifyingWorkoutCount} 个已记录课次；每周范围 ${item.claim.minimumSessionsPerWeek}–${item.claim.maximumSessionsPerWeek} 次。未记录的现实训练不在其中。`,
      }
    case 'recorded_session_duration_baseline_v1':
      return {
        summary: `${item.claim.sampleCount} 个已记录课次，时长中位数 ${item.claim.medianMinutes} 分钟`,
        interpretation: `中间一半课次约为 ${item.claim.firstQuartileMinutes}–${item.claim.thirdQuartileMinutes} 分钟，覆盖 ${item.claim.coveredWeeks} 周。这里只描述记录，不评价训练效果。`,
      }
  }
}

export const presentPersonalModelCurrentSubject = (
  view: PersonalModelCurrentSubjectView,
): PersonalModelCurrentSubjectPresentation => {
  const title = subjectLabels[view.subjectKey]
  if (view.current === null) {
    return {
      kind: 'empty',
      subjectKey: view.subjectKey,
      eyebrow: 'PERSONAL MODEL / 个人认知',
      title,
      detail: '目前没有可展示的内容。这不代表数值为零，也不代表系统已经了解你的情况。',
    }
  }

  const item = view.current
  const claim = claimPresentation(item)
  const status = statusPresentation[item.status]
  const timeZone = item.evidence.window.timezone
  const limitations = item.confidence.limitations.map((limitation) => limitationLabels[limitation])

  return {
    kind: 'item',
    subjectKey: view.subjectKey,
    eyebrow: 'PERSONAL MODEL / 个人认知',
    title,
    summary: claim.summary,
    interpretation: claim.interpretation,
    sourceLabel: sourceLabels[item.source],
    statusLabel: status.label,
    statusDetail: status.detail,
    tone: status.tone,
    feedbackLabel: feedbackLabels[item.feedbackState],
    confidenceLabel: confidenceLabels[item.confidence.level],
    limitationLabels: limitations.length ? limitations : ['当前没有额外限制标记'],
    evidenceCounts: [
      { key: 'qualified', label: '合格资料', value: item.evidence.qualifiedCount },
      { key: 'supporting', label: '支持', value: item.evidence.supportingCount },
      { key: 'contradicting', label: '冲突', value: item.evidence.contradictingCount },
      { key: 'withdrawn', label: '已撤回', value: item.evidence.withdrawnCount },
    ],
    evidenceWindowLabel: `资料范围 ${partsAt(item.evidence.window.startAt, timeZone)} 至 ${partsAt(
      item.evidence.window.endAt,
      timeZone,
    )}（${timeZone}）`,
    evidenceAsOfLabel: `整理截至 ${partsAt(item.evidence.asOf, timeZone)}`,
    revisionLabel: `第 ${item.generation} 代 · 修订 R${item.revision}`,
    validityLabel:
      item.validTo === null
        ? `保留自 ${partsAt(item.validFrom, timeZone)}`
        : `已于 ${partsAt(item.validTo, timeZone)} 结束`,
  }
}
