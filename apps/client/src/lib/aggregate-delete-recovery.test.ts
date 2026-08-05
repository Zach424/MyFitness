import { describe, expect, it } from 'vitest'

import {
  classifyAggregateDeleteEvidence,
  describeAggregateDeleteFailure,
  describeAggregateDeleteReconciliationFailure,
} from './aggregate-delete-recovery'

const serverError = (statusCode: number, message: string) =>
  Object.assign(new Error(message), { statusCode })

describe('aggregate delete recovery authority', () => {
  it.each([
    [new Error('Failed to fetch'), 'network_uncertain'],
    [serverError(503, 'paused'), 'service_unavailable'],
    [new Error('adapter broke'), 'unexpected'],
  ] as const)('requires an exact read before resolving %s', (error, failureKind) => {
    const recovery = describeAggregateDeleteFailure(error, '这条记录')

    expect(recovery).toMatchObject({ authority: 'reconcile_required', failureKind })
    expect(recovery.message).toContain('不会再次发送删除请求')
  })

  it('terminates an explicitly refused delete without reconciliation or replay', () => {
    const recovery = describeAggregateDeleteFailure(
      serverError(409, 'revision changed'),
      '这条记录',
    )

    expect(recovery).toMatchObject({
      authority: 'terminal',
      failureKind: 'server_rejected',
      actionLabel: '返回检查记录',
    })
    expect(recovery.message).toContain('revision changed')
  })

  it('keeps a failed reconciliation read-side only', () => {
    const recovery = describeAggregateDeleteReconciliationFailure(
      serverError(503, 'read paused'),
      '这条记录',
    )

    expect(recovery.authority).toBe('reconcile_required')
    expect(recovery.actionLabel).toBe('再次核对当前记录')
    expect(recovery.message).toContain('不会重放删除')
  })

  it('distinguishes owner-visible absence, the same revision and a changed revision', () => {
    expect(classifyAggregateDeleteEvidence(4)).toBe('removed')
    expect(classifyAggregateDeleteEvidence(4, 4)).toBe('unchanged')
    expect(classifyAggregateDeleteEvidence(4, 5)).toBe('changed')
    expect(classifyAggregateDeleteEvidence(4, 3)).toBe('changed')
  })
})
