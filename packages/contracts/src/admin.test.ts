import { describe, expect, it } from 'vitest'

import {
  adminAuditEventSchema,
  adminDevSessionRequestSchema,
  supportUserLookupRequestSchema,
} from './admin'

describe('administrator contracts', () => {
  it('requires an exact account, bounded ticket and enumerated support reason', () => {
    expect(
      supportUserLookupRequestSchema.parse({
        accountId: '00000000-0000-4000-8000-000000000001',
        ticketReference: 'SUP-2026-001',
        reason: 'data_export',
      }),
    ).toMatchObject({ reason: 'data_export' })

    expect(() =>
      supportUserLookupRequestSchema.parse({
        accountId: 'someone@example.com',
        ticketReference: 'free form ticket',
        reason: 'browse_records',
      }),
    ).toThrow()
  })

  it('rejects duplicate or unknown administrator roles', () => {
    expect(() =>
      adminDevSessionRequestSchema.parse({
        subject: 'operator-1',
        displayName: '本地支持员',
        roles: ['support_reader', 'support_reader'],
      }),
    ).toThrow()
    expect(() =>
      adminDevSessionRequestSchema.parse({
        subject: 'operator-1',
        displayName: '本地支持员',
        roles: ['super_admin'],
      }),
    ).toThrow()
  })

  it('allows only bounded scalar audit details and HMAC references', () => {
    const base = {
      eventId: '00000000-0000-4000-8000-000000000001',
      operatorId: null,
      action: 'operator.session.denied',
      outcome: 'denied',
      targetType: 'operator',
      targetRef: 'a'.repeat(64),
      requestId: '00000000-0000-4000-8000-000000000002',
      occurredAt: '2026-07-19T00:00:00.000Z',
    }
    expect(
      adminAuditEventSchema.parse({ ...base, details: { code: 'unknown_operator' } }),
    ).toBeTruthy()
    expect(() =>
      adminAuditEventSchema.parse({ ...base, details: { rawToken: { nested: 'secret' } } }),
    ).toThrow()
  })
})
