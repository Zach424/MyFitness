import { describe, expect, it } from 'vitest'

import {
  describeWorkbenchFailure,
  workbenchOperationPolicies,
  type WorkbenchOperation,
} from './workbench-recovery'

const serverError = (statusCode: number, message: string) =>
  Object.assign(new Error(message), { statusCode })

describe('authority-aware workbench recovery contract', () => {
  it.each(['action_create', 'food_create', 'photo_reserve'] as const)(
    'allows only a same-key retry for ambiguous %s',
    (operation) => {
      const recovery = describeWorkbenchFailure(operation, new Error('Failed to fetch'))

      expect(recovery.authority).toBe('retry_same_request')
      expect(recovery.failureKind).toBe('network_uncertain')
      expect(recovery.message).toContain('同一请求编号')
    },
  )

  it.each([
    'action_update',
    'action_archive',
    'food_update',
    'food_archive',
    'photo_upload',
    'photo_confirm',
    'photo_delete',
  ] as const)('requires read-side reconciliation before repeating %s', (operation) => {
    const recovery = describeWorkbenchFailure(operation, serverError(503, 'unavailable'))

    expect(recovery).toMatchObject({
      operation,
      authority: 'reconcile_required',
      failureKind: 'service_unavailable',
      actionLabel: '核对服务端状态',
    })
    expect(recovery.message).toContain('不会把未知结果报告为成功')
  })

  it.each(Object.keys(workbenchOperationPolicies) as WorkbenchOperation[])(
    'treats an explicit server refusal as terminal for %s',
    (operation) => {
      const recovery = describeWorkbenchFailure(operation, serverError(409, 'revision changed'))

      expect(recovery.authority).toBe('terminal')
      expect(recovery.failureKind).toBe('server_rejected')
      expect(recovery.message).toContain('revision changed')
      expect(recovery.message).toContain('不会自动重放')
    },
  )

  it('preserves only page-owned non-media input', () => {
    expect(workbenchOperationPolicies.action_create.preserves).toBe('definition_input')
    expect(workbenchOperationPolicies.action_update.preserves).toBe('definition_input')
    expect(workbenchOperationPolicies.food_create.preserves).toBe('definition_input')
    expect(workbenchOperationPolicies.food_update.preserves).toBe('definition_input')
    expect(workbenchOperationPolicies.food_archive.preserves).toBe('none')
    expect(workbenchOperationPolicies.photo_confirm.preserves).toBe('review_input')
    expect(workbenchOperationPolicies.photo_reserve.preserves).toBe('none')
    expect(workbenchOperationPolicies.photo_upload.preserves).toBe('none')
    expect(workbenchOperationPolicies.photo_delete.preserves).toBe('none')
  })
})
