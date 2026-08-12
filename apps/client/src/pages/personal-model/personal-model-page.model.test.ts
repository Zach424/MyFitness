import { describe, expect, it } from 'vitest'

import {
  defaultPersonalModelPageSubject,
  personalModelPageFeedbackFailureCopy,
  personalModelPageFeedbackOptions,
  personalModelPageFailureCopy,
  personalModelPageSubjectContext,
  personalModelPageSubjectOption,
  personalModelPageSubjects,
} from './personal-model-page.model'

describe('personal model page model', () => {
  it('offers the three strict subjects while keeping recorded frequency as the default', () => {
    expect(personalModelPageSubjects.map(({ subjectKey }) => subjectKey)).toEqual([
      'training.availability',
      'training.recorded_frequency',
      'training.recorded_session_duration',
    ])
    expect(defaultPersonalModelPageSubject).toBe('training.recorded_frequency')
    expect(new Set(personalModelPageSubjects.map(({ subjectKey }) => subjectKey)).size).toBe(3)
  })

  it('keeps each subject authority and non-evaluative boundary explicit', () => {
    expect(personalModelPageSubjectOption('training.availability')).toMatchObject({
      label: '本人安排',
    })
    expect(personalModelPageSubjectContext('training.availability')).toContain('本人提交')
    expect(personalModelPageSubjectContext('training.recorded_frequency')).toContain(
      '不判断现实训练是否达标',
    )
    expect(personalModelPageSubjectContext('training.recorded_session_duration')).toContain(
      '不评价效果、能力或强度',
    )
  })

  it.each(['offline', 'refused', 'service', 'unknown'] as const)(
    'keeps an initial %s failure unknown and actionable',
    (kind) => {
      const copy = personalModelPageFailureCopy(kind, false)

      expect(copy.title.length).toBeGreaterThan(0)
      expect(copy.detail).toMatch(/未知|没有|尚未|暂时/)
      expect(copy.detail).not.toMatch(/^(零次训练|没有训练记录|没有资料)[。！]?$/)
    },
  )

  it('offers three complete choices and does not invent a temporary deadline', () => {
    expect(personalModelPageFeedbackOptions.map(({ choice }) => choice)).toEqual([
      'matches_me',
      'disagree',
      'uncertain',
    ])
    expect(personalModelPageFeedbackOptions.map(({ choice }) => String(choice))).not.toContain(
      'temporary_context',
    )
  })

  it.each([
    ['conflict', false],
    ['offline', true],
    ['unknown', true],
    ['service', true],
    ['refused', false],
    ['invalid-contract', false],
  ] as const)('keeps %s write guidance bounded and retry authority explicit', (kind, retryable) => {
    const copy = personalModelPageFeedbackFailureCopy(kind)
    expect(copy.retryable).toBe(retryable)
    expect(copy.detail.length).toBeGreaterThan(0)
    expect(JSON.stringify(copy)).not.toContain('raw backend')
  })

  it.each(['offline', 'refused', 'service', 'unknown'] as const)(
    'explains retained evidence after a stale %s refresh',
    (kind) => {
      const copy = personalModelPageFailureCopy(kind, true)

      expect(copy.title).toMatch(/上次观察|更新|本次/)
      expect(copy.detail).toMatch(/保留|继续显示|上次成功/)
      expect(copy.detail).toMatch(/重试|旧快照/)
    },
  )
})
