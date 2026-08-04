import { BadRequestException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import { decodeRecordPageCursor, encodeRecordPageCursor } from './record-page-cursor'

describe('record page cursor', () => {
  const value = { id: '11111111-1111-4111-8111-111111111111', revision: 3 }

  it('round-trips only aggregate identity and immutable revision', () => {
    const cursor = encodeRecordPageCursor(value)
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeRecordPageCursor(cursor, 'record')).toEqual({ v: 1, ...value })
    expect(Buffer.from(cursor, 'base64url').toString('utf8')).not.toContain('occurredAt')
  })

  it('rejects malformed, expanded and non-versioned cursors', () => {
    for (const payload of [
      'not-json',
      JSON.stringify({ id: value.id, revision: 3 }),
      JSON.stringify({ v: 1, ...value, occurredAt: '2026-08-05T00:00:00.000Z' }),
    ]) {
      expect(() =>
        decodeRecordPageCursor(Buffer.from(payload).toString('base64url'), 'record'),
      ).toThrow(BadRequestException)
    }
  })
})
