import { describe, expect, it } from 'vitest'

import { describeSaveFailure } from './save-recovery'

const options = { subject: '这笔身体记录', create: true }
const serverError = (statusCode: number, message: string) =>
  Object.assign(new Error(message), { statusCode })

describe('save failure recovery contract', () => {
  it.each(['request:fail net::ERR_NETWORK_CHANGED', 'Failed to fetch', 'request:fail timeout'])(
    'treats an interrupted create as an ambiguous network outcome: %s',
    (message) => {
      const recovery = describeSaveFailure(new Error(message), options)

      expect(recovery).toMatchObject({
        kind: 'network_uncertain',
        eyebrow: 'CONNECTION UNCERTAIN / 输入仍保留',
        actionLabel: '重试保存（防重复）',
      })
      expect(recovery.message).toContain('无法确认这笔身体记录是否已经到达服务端')
      expect(recovery.message).toContain('沿用同一请求编号')
    },
  )

  it('keeps a retryable service outage distinct from a transport interruption', () => {
    const recovery = describeSaveFailure(serverError(503, 'service unavailable'), options)

    expect(recovery.kind).toBe('service_unavailable')
    expect(recovery.message).toContain('服务暂时无法完成这笔身体记录保存（503）')
    expect(recovery.actionLabel).toBe('重试保存（防重复）')
  })

  it.each([400, 409, 422])(
    'reports server refusal without presenting it as offline: %s',
    (status) => {
      const recovery = describeSaveFailure(
        serverError(status, 'expected revision is stale'),
        options,
      )

      expect(recovery).toMatchObject({
        kind: 'server_rejected',
        eyebrow: 'SERVER REFUSAL / 输入仍保留',
        actionLabel: '修正后重新保存',
      })
      expect(recovery.message).toContain('服务端未接受这次保存')
      expect(recovery.message).toContain('expected revision is stale')
      expect(recovery.message).not.toContain('网络')
    },
  )

  it('uses a safe uncertain state for an unclassified runtime failure', () => {
    const recovery = describeSaveFailure(new Error('unexpected adapter failure'), options)

    expect(recovery.kind).toBe('unexpected')
    expect(recovery.message).toContain('暂时无法确认这笔身体记录是否保存成功')
    expect(recovery.message).not.toContain('unexpected adapter failure')
  })

  it('does not promise create idempotency for correction requests', () => {
    const recovery = describeSaveFailure(new Error('Failed to fetch'), {
      subject: '这次修改',
      create: false,
    })

    expect(recovery.actionLabel).toBe('重新核对后保存')
    expect(recovery.message).toContain('重新核对当前版本')
    expect(recovery.message).not.toContain('同一请求编号')
  })
})
