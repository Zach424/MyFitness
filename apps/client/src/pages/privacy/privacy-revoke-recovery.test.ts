import { describe, expect, it } from 'vitest'
import type { PrivacyOverview, RevocableConsentPurpose } from '@myfitness/contracts'

import {
  classifyRevocationEvidence,
  describeRevocationFailure,
  describeRevocationReconciliationFailure,
} from './privacy-revoke-recovery'

const purpose: RevocableConsentPurpose = 'food_photo_analysis'
const overview = (status: 'never_granted' | 'active' | 'revoked') =>
  ({
    consents: [
      {
        purpose,
        status,
        requiredForService: false,
        revocable: true,
        version: status === 'never_granted' ? null : '2026-08-05',
        acceptedAt: status === 'never_granted' ? null : '2026-08-05T07:00:00.000Z',
        revokedAt: status === 'revoked' ? '2026-08-05T08:00:00.000Z' : null,
      },
    ],
  }) as PrivacyOverview

describe('optional-consent revocation response-loss recovery', () => {
  it('requires a current-overview read for network and retryable failures', () => {
    expect(describeRevocationFailure(new Error('Failed to fetch'), '餐食照片分析').authority).toBe(
      'reconcile_required',
    )
    expect(
      describeRevocationFailure(
        Object.assign(new Error('paused'), { statusCode: 503 }),
        '餐食照片分析',
      ).authority,
    ).toBe('reconcile_required')
  })

  it('terminates an explicit non-retryable refusal', () => {
    expect(
      describeRevocationFailure(
        Object.assign(new Error('not granted'), { statusCode: 404 }),
        '餐食照片分析',
      ).authority,
    ).toBe('terminal')
  })

  it('accepts only an explicit revoked ledger state as applied evidence', () => {
    expect(classifyRevocationEvidence(overview('revoked'), purpose)).toBe('applied')
    expect(classifyRevocationEvidence(overview('active'), purpose)).toBe('not_applied')
    expect(classifyRevocationEvidence(overview('never_granted'), purpose)).toBe('diverged')
    expect(classifyRevocationEvidence({ ...overview('active'), consents: [] }, purpose)).toBe(
      'diverged',
    )
  })

  it('keeps reconciliation failure copy free of replay and cleanup-count claims', () => {
    const receipt = describeRevocationReconciliationFailure('餐食照片分析')
    expect(receipt.authority).toBe('reconcile_required')
    expect(receipt.message).toContain('不会重放撤回')
    expect(receipt.message).not.toContain('已清理')
  })
})
