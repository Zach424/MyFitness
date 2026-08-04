import { describe, expect, it } from 'vitest'

import {
  formatZonedOccurrence,
  isOccurrenceDateOnly,
  occurrenceInstant,
  occurrenceValidationMessage,
  preservedOccurrenceInstant,
  resolveLocalOccurrence,
} from './occurrence-time'

describe('occurrence time boundary', () => {
  it('keeps a valid date-only backfill value incomplete until time is supplied', () => {
    expect(isOccurrenceDateOnly('2026-08-01')).toBe(true)
    expect(isOccurrenceDateOnly('2026-02-30')).toBe(false)
    expect(occurrenceValidationMessage('2026-08-01', 'Asia/Shanghai')).toContain('补充发生时分')
  })

  it('resolves and formats an ordinary IANA-zoned local minute', () => {
    expect(resolveLocalOccurrence('2026-08-05 12:30', 'Asia/Shanghai')).toEqual({
      status: 'resolved',
      candidate: {
        instant: '2026-08-05T04:30:00.000Z',
        offsetMinutes: 480,
        offsetLabel: 'UTC+08:00',
      },
    })
    expect(formatZonedOccurrence('2026-08-05T04:30:00.789Z', 'Asia/Shanghai')).toEqual({
      local: '2026-08-05 12:30',
      offsetMinutes: 480,
      offsetLabel: 'UTC+08:00',
    })
  })

  it('rejects invalid calendar values and a DST spring-forward gap', () => {
    expect(resolveLocalOccurrence('2026-02-30 10:00', 'Asia/Shanghai')).toEqual({
      status: 'invalid_format',
    })
    expect(resolveLocalOccurrence('2026-03-08 02:30', 'America/New_York')).toEqual({
      status: 'nonexistent',
    })
  })

  it('requires an explicit offset for a repeated DST minute', () => {
    const ambiguous = resolveLocalOccurrence('2026-11-01 01:30', 'America/New_York')
    expect(ambiguous).toMatchObject({
      status: 'ambiguous',
      candidates: [
        { instant: '2026-11-01T05:30:00.000Z', offsetMinutes: -240 },
        { instant: '2026-11-01T06:30:00.000Z', offsetMinutes: -300 },
      ],
    })
    expect(
      occurrenceInstant(
        '2026-11-01 01:30',
        'America/New_York',
        -300,
        Date.parse('2026-12-01T00:00:00.000Z'),
      ),
    ).toBe('2026-11-01T06:30:00.000Z')
  })

  it('rejects invalid zones and future instants while allowing an empty now default', () => {
    expect(occurrenceValidationMessage('2026-08-05 12:30', 'Invalid/Zone')).toContain('时区')
    expect(occurrenceValidationMessage('', '')).toContain('时区')
    expect(
      occurrenceValidationMessage(
        '2026-08-05 12:31',
        'Asia/Shanghai',
        undefined,
        Date.parse('2026-08-05T04:30:00.000Z'),
      ),
    ).toContain('晚于现在')
    expect(occurrenceInstant('', 'Asia/Shanghai', undefined, 1234)).toBe('1970-01-01T00:00:01.234Z')
  })

  it('preserves sub-minute precision until the user changes the local field', () => {
    const original = '2026-08-05T04:30:42.789Z'
    expect(
      preservedOccurrenceInstant(
        original,
        '2026-08-05 12:30',
        'Asia/Shanghai',
        480,
        Date.parse('2026-08-06T00:00:00.000Z'),
      ),
    ).toBe(original)
    expect(() =>
      preservedOccurrenceInstant(
        original,
        '2026-08-05 12:31',
        'Asia/Shanghai',
        480,
        Date.parse('2026-08-06T00:00:00.000Z'),
      ),
    ).toThrow('不一致')
  })
})
