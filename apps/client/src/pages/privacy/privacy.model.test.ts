import { describe, expect, it } from 'vitest'

import { accountDeletionConfirmationPhrase } from '@myfitness/contracts/privacy.constants'

import {
  classifyPrivacyReadFailure,
  deletionReady,
  formatInventoryCount,
  formatReceiptToken,
  privacyReadPhase,
} from './privacy.model'

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

  it('does not render a complete erasure receipt secret', () => {
    const token = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG'
    expect(formatReceiptToken(token)).toBe('abcd…BCDEFG')
    expect(formatReceiptToken(token)).not.toContain(token)
  })

  it('does not treat a failed custody read as an authoritative empty inventory', () => {
    expect(privacyReadPhase({ hasSnapshot: false, busy: true, hasFailure: false })).toBe(
      'initial-loading',
    )
    expect(privacyReadPhase({ hasSnapshot: false, busy: false, hasFailure: true })).toBe(
      'initial-error',
    )
    expect(privacyReadPhase({ hasSnapshot: true, busy: false, hasFailure: false })).toBe('ready')
  })

  it('retains a custody snapshot as refreshing or stale without making it actionable', () => {
    expect(privacyReadPhase({ hasSnapshot: true, busy: true, hasFailure: false })).toBe(
      'refreshing',
    )
    expect(privacyReadPhase({ hasSnapshot: true, busy: false, hasFailure: true })).toBe('stale')
  })

  it('classifies transport, refusal, outage, and unknown custody-read failures', () => {
    expect(classifyPrivacyReadFailure(new Error('network failed'))).toBe('offline')
    expect(classifyPrivacyReadFailure({ errMsg: 'request:fail' })).toBe('offline')
    expect(classifyPrivacyReadFailure({ statusCode: 429 })).toBe('refused')
    expect(classifyPrivacyReadFailure({ statusCode: 503 })).toBe('service')
    expect(classifyPrivacyReadFailure({ statusCode: 302 })).toBe('unknown')
  })
})
