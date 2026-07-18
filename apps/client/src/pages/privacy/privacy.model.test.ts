import { describe, expect, it } from 'vitest'

import { accountDeletionConfirmationPhrase } from '@myfitness/contracts'

import { deletionReady, formatInventoryCount } from './privacy.model'

describe('privacy page model', () => {
  it('formats zero separately from owned items', () => {
    expect(formatInventoryCount(0)).toBe('无数据')
    expect(formatInventoryCount(12)).toBe('12 项')
  })

  it('requires all three deliberate account deletion signals', () => {
    const complete = {
      phrase: accountDeletionConfirmationPhrase,
      exportChoice: 'downloaded' as const,
      understandsPermanent: true,
    }
    expect(deletionReady(complete)).toBe(true)
    expect(deletionReady({ ...complete, phrase: '删除账户' })).toBe(false)
    expect(deletionReady({ ...complete, exportChoice: null })).toBe(false)
    expect(deletionReady({ ...complete, understandsPermanent: false })).toBe(false)
  })
})
