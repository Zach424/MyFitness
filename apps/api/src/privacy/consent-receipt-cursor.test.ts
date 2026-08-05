import { BadRequestException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import { decodeConsentReceiptCursor, encodeConsentReceiptCursor } from './consent-receipt-cursor'

describe('consent receipt cursor', () => {
  it('round-trips one opaque receipt identifier', () => {
    const id = '619ef62a-e665-40dc-95ed-3790b947b48c'
    const cursor = encodeConsentReceiptCursor(id)
    expect(cursor).not.toContain(id)
    expect(decodeConsentReceiptCursor(cursor)).toEqual({ v: 1, id })
  })

  it('rejects malformed, extra-field and non-UUID cursor payloads', () => {
    for (const cursor of [
      'not-base64-json',
      Buffer.from(JSON.stringify({ v: 1, id: 'not-a-uuid' })).toString('base64url'),
      Buffer.from(
        JSON.stringify({
          v: 1,
          id: '619ef62a-e665-40dc-95ed-3790b947b48c',
          userId: 'private',
        }),
      ).toString('base64url'),
    ]) {
      expect(() => decodeConsentReceiptCursor(cursor)).toThrow(BadRequestException)
    }
  })
})
