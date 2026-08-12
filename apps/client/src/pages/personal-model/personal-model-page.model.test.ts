import { describe, expect, it } from 'vitest'

import { personalModelPageFailureCopy, personalModelPageSubject } from './personal-model-page.model'

describe('personal model page model', () => {
  it('fixes the first page to recorded training frequency', () => {
    expect(personalModelPageSubject).toBe('training.recorded_frequency')
  })

  it.each(['offline', 'refused', 'service', 'unknown'] as const)(
    'keeps an initial %s failure unknown and actionable',
    (kind) => {
      const copy = personalModelPageFailureCopy(kind, false)

      expect(copy.title.length).toBeGreaterThan(0)
      expect(copy.detail).toMatch(/未知|没有|尚未|暂时/)
      expect(copy.detail).not.toMatch(/^(零次训练|没有训练记录)[。！]?$/)
    },
  )

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
