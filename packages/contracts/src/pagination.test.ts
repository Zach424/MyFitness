import { describe, expect, it } from 'vitest'

import { recordListQuerySchema, recordPageCursorSchema } from './pagination'

describe('record-list pagination contracts', () => {
  const querySchema = recordListQuerySchema(20, 100)

  it('coerces a bounded limit and preserves an opaque cursor', () => {
    const cursor = 'eyJ2IjoxLCJpZCI6Im9wYXF1ZSIsInJldmlzaW9uIjoxfQ'
    expect(querySchema.parse({ limit: '40', cursor })).toEqual({ limit: 40, cursor })
    expect(querySchema.parse({})).toEqual({ limit: 20 })
  })

  it('rejects expanded, oversized and malformed query values', () => {
    expect(querySchema.safeParse({ limit: 101 }).success).toBe(false)
    expect(querySchema.safeParse({ limit: 20, unexpected: 'value' }).success).toBe(false)
    expect(recordPageCursorSchema.safeParse('not+a+base64url+cursor').success).toBe(false)
  })
})
