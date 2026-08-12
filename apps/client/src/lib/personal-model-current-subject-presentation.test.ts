import { personalModelCurrentSubjectViewSchema } from '@myfitness/contracts'
import { describe, expect, it } from 'vitest'

import { presentPersonalModelCurrentSubject } from './personal-model-current-subject-presentation'

const window = {
  startAt: '2026-06-30T16:00:00.000Z',
  endAt: '2026-07-28T16:00:00.000Z',
  timezone: 'Asia/Shanghai',
}

const common = {
  itemId: '6f3c5de9-9856-46f4-b419-54329d6aee1c',
  generation: 2,
  revision: 3,
  status: 'active',
  feedbackState: 'unreviewed',
  terminal: false,
  confidence: {
    level: 'moderate',
    limitations: ['single_window'],
  },
  evidence: {
    asOf: '2026-07-28T16:00:00.000Z',
    window,
    qualifiedCount: 8,
    supportingCount: 7,
    contradictingCount: 1,
    withdrawnCount: 2,
  },
  validFrom: '2026-07-28T16:00:00.000Z',
  validTo: null,
  observedFrom: window.startAt,
  observedThrough: window.endAt,
  derivedAt: '2026-07-28T16:00:00.000Z',
  updatedAt: '2026-07-28T16:00:00.000Z',
}

const frequencyView = () =>
  personalModelCurrentSubjectViewSchema.parse({
    schemaVersion: 'personal-model-current-subject-view-v1',
    subjectKey: 'training.recorded_frequency',
    current: {
      ...common,
      kind: 'behavior',
      claimSchemaVersion: 'recorded_training_frequency_behavior_v1',
      source: 'deterministic_rule',
      claim: {
        observationWindow: {
          startDate: '2026-07-01',
          endDateExclusive: '2026-07-29',
          completeWeeks: 4,
          timezone: 'Asia/Shanghai',
        },
        weeklyRecordedSessionCounts: [2, 3, 1, 2],
        qualifyingWorkoutCount: 8,
        recordedWeekCount: 4,
        medianSessionsPerWeek: 2,
        minimumSessionsPerWeek: 1,
        maximumSessionsPerWeek: 3,
        frequencyUnit: 'recorded_sessions_per_week',
        medianPolicyVersion: 'numeric-median-v1',
      },
    },
  })

const durationView = () =>
  personalModelCurrentSubjectViewSchema.parse({
    schemaVersion: 'personal-model-current-subject-view-v1',
    subjectKey: 'training.recorded_session_duration',
    current: {
      ...common,
      kind: 'baseline',
      claimSchemaVersion: 'recorded_session_duration_baseline_v1',
      source: 'deterministic_rule',
      claim: {
        observationWindow: {
          startDate: '2026-07-01',
          endDateExclusive: '2026-07-29',
          completeWeeks: 4,
          timezone: 'Asia/Shanghai',
        },
        sampleCount: 8,
        coveredWeeks: 4,
        firstQuartileMinutes: 45,
        medianMinutes: 60,
        thirdQuartileMinutes: 75,
        durationUnit: 'minutes',
        durationPolicyVersion: 'elapsed-duration-minutes-v1',
        quartilePolicyVersion: 'nearest-rank-quartiles-v1',
      },
    },
  })

describe('personal model current-subject presentation', () => {
  it('presents an absent subject as unknown rather than zero', () => {
    const presentation = presentPersonalModelCurrentSubject({
      schemaVersion: 'personal-model-current-subject-view-v1',
      subjectKey: 'training.availability',
      current: null,
    })

    expect(presentation).toMatchObject({
      kind: 'empty',
      title: '训练时间安排',
    })
    if (presentation.kind !== 'empty') throw new Error('expected empty presentation')
    expect(presentation.detail).toContain('不代表数值为零')
    expect(presentation.detail).toContain('不代表系统已经了解')
  })

  it('keeps user-confirmed availability separate from completed training', () => {
    const view = personalModelCurrentSubjectViewSchema.parse({
      schemaVersion: 'personal-model-current-subject-view-v1',
      subjectKey: 'training.availability',
      current: {
        ...common,
        kind: 'constraint',
        claimSchemaVersion: 'training_availability_constraint_v1',
        source: 'user_confirmed',
        claim: {
          availableDays: ['mon', 'wed', 'sat'],
          sessionMinutes: 60,
          sourceGoalRevision: 4,
          durationUnit: 'minutes',
        },
      },
    })
    const presentation = presentPersonalModelCurrentSubject(view)

    expect(presentation).toMatchObject({
      kind: 'item',
      summary: '周一、周三、周六 · 每次 60 分钟',
      sourceLabel: '来自你提交的训练目标',
      statusLabel: '当前保留',
    })
    if (presentation.kind !== 'item') throw new Error('expected item presentation')
    expect(presentation.interpretation).toContain('不代表已经完成训练')
  })

  it('describes frequency only as recorded behavior and preserves exact counts', () => {
    const presentation = presentPersonalModelCurrentSubject(frequencyView())
    if (presentation.kind !== 'item') throw new Error('expected item presentation')

    expect(presentation.summary).toBe('4 个完整周内，每周已记录中位数 2 次')
    expect(presentation.interpretation).toContain('未记录的现实训练不在其中')
    expect(presentation.evidenceCounts).toEqual([
      { key: 'qualified', label: '合格资料', value: 8 },
      { key: 'supporting', label: '支持', value: 7 },
      { key: 'contradicting', label: '冲突', value: 1 },
      { key: 'withdrawn', label: '已撤回', value: 2 },
    ])
    expect(presentation.confidenceLabel).toBe('资料达到最低覆盖')
    expect(presentation.limitationLabels).toEqual(['只观察了一个时间窗口'])
  })

  it('describes duration as a distribution without judging training effect', () => {
    const presentation = presentPersonalModelCurrentSubject(durationView())
    if (presentation.kind !== 'item') throw new Error('expected item presentation')

    expect(presentation.summary).toBe('8 个已记录课次，时长中位数 60 分钟')
    expect(presentation.interpretation).toContain('中间一半课次约为 45–75 分钟')
    expect(presentation.interpretation).toContain('不评价训练效果')
  })

  it('formats the evidence window in its declared timezone', () => {
    const presentation = presentPersonalModelCurrentSubject(frequencyView())
    if (presentation.kind !== 'item') throw new Error('expected item presentation')

    expect(presentation.evidenceWindowLabel).toBe(
      '资料范围 2026-07-01 00:00 至 2026-07-29 00:00（Asia/Shanghai）',
    )
    expect(presentation.evidenceAsOfLabel).toBe('整理截至 2026-07-29 00:00')
    expect(presentation.revisionLabel).toBe('第 2 代 · 修订 R3')
  })

  it('makes disagreement visible and blocks planning use in its explanation', () => {
    const source = frequencyView()
    const view = personalModelCurrentSubjectViewSchema.parse({
      ...source,
      current: {
        ...source.current,
        status: 'disputed',
        feedbackState: 'disagreed',
        confidence: {
          level: 'moderate',
          limitations: ['conflicting_evidence', 'user_disputed'],
        },
      },
    })
    const presentation = presentPersonalModelCurrentSubject(view)

    expect(presentation).toMatchObject({
      kind: 'item',
      tone: 'disputed',
      statusLabel: '你已表示不同意',
      feedbackLabel: '你已表示不同意',
    })
    if (presentation.kind !== 'item') throw new Error('expected item presentation')
    expect(presentation.statusDetail).toContain('不能驱动训练或饮食建议')
    expect(presentation.limitationLabels).toContain('你对这项内容有异议')
  })

  it('marks terminal content as ended instead of current evidence', () => {
    const source = durationView()
    const view = personalModelCurrentSubjectViewSchema.parse({
      ...source,
      current: {
        ...source.current,
        status: 'invalidated',
        terminal: true,
        validTo: '2026-08-01T08:00:00.000Z',
        updatedAt: '2026-08-01T08:00:00.000Z',
        confidence: { level: 'low', limitations: ['source_withdrawn'] },
      },
    })
    const presentation = presentPersonalModelCurrentSubject(view)

    expect(presentation).toMatchObject({
      kind: 'item',
      tone: 'retired',
      statusLabel: '已停止使用',
      validityLabel: '已于 2026-08-01 16:00 结束',
    })
    if (presentation.kind !== 'item') throw new Error('expected item presentation')
    expect(presentation.statusDetail).toContain('不再作为当前计划依据')
  })

  it('does not generate performance scores or prescriptions', () => {
    const presentations = [frequencyView(), durationView()].map(presentPersonalModelCurrentSubject)
    const text = JSON.stringify(presentations)

    expect(text).not.toMatch(/完成率|依从率|能力评级|训练得分|饮食得分|应该增加|应该减少/)
  })
})
