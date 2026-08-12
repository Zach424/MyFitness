import { describe, expect, it } from 'vitest'

import { isPersonalModelOffsetDateTime } from './personal-model-time.runtime'

describe('personal model offset date-time runtime guard', () => {
  it.each(['2026-08-12T08:00:00Z', '2024-02-29T23:59:59.123+08:00', '2026-08-12T08:00:00-05:30'])(
    'accepts canonical offset instant %#',
    (value) => {
      expect(isPersonalModelOffsetDateTime(value)).toBe(true)
    },
  )

  it.each([
    '2026-02-29T08:00:00Z',
    '2026-02-30T08:00:00Z',
    '2026-04-31T08:00:00Z',
    '2026-13-01T08:00:00Z',
    '2026-08-12T24:00:00Z',
    '2026-08-12T08:60:00Z',
    '2026-08-12T08:00:60Z',
    '2026-08-12T08:00:00+24:00',
    '2026-08-12T08:00:00+08:60',
    '2026-08-12T08:00:00',
  ])('rejects normalized or malformed calendar value %#', (value) => {
    expect(isPersonalModelOffsetDateTime(value)).toBe(false)
  })
})
