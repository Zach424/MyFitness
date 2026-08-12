import { describe, expect, it } from 'vitest'

import { meHubCapabilities, meHubSections } from './me-hub.model'

describe('me hub navigation model', () => {
  it('covers every MVP ownership capability exactly once', () => {
    expect(meHubCapabilities).toEqual([
      '个人资料',
      '训练目标',
      '单位与时区',
      '安全边界',
      '已记录训练观察',
      '证据范围与限制',
      '授权记录',
      '数据导出',
      '账户删除',
    ])
    expect(new Set(meHubCapabilities).size).toBe(meHubCapabilities.length)
  })

  it('delegates facts and custody to their existing authoritative pages', () => {
    expect(meHubSections.map(({ id, path }) => ({ id, path }))).toEqual([
      { id: 'profile', path: '/pages/onboarding/index' },
      { id: 'mirror', path: '/pages/personal-model/index' },
      { id: 'custody', path: '/pages/privacy/index' },
    ])
    expect(meHubSections.every((section) => section.boundary.length > 0)).toBe(true)
  })

  it('keeps export and deletion away from the profile editor', () => {
    const profile = meHubSections.find((section) => section.id === 'profile')
    const custody = meHubSections.find((section) => section.id === 'custody')

    expect(profile?.capabilities).not.toContain('数据导出')
    expect(profile?.capabilities).not.toContain('账户删除')
    expect(custody?.capabilities).toEqual(['授权记录', '数据导出', '账户删除'])
  })

  it('keeps the mirror separate from profile editing and data custody', () => {
    const mirror = meHubSections.find((section) => section.id === 'mirror')

    expect(mirror?.capabilities).toEqual(['已记录训练观察', '证据范围与限制'])
    expect(mirror?.capabilities).not.toContain('个人资料')
    expect(mirror?.capabilities).not.toContain('数据导出')
    expect(mirror?.boundary).toContain('不会自动调整计划')
  })
})
