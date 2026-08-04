import { describe, expect, it } from 'vitest'

import { buildRecordRequest, createDraft, validateRecordDraft } from './record.model'

describe('record page model', () => {
  it('creates a metric-specific draft', () => {
    expect(createDraft('recovery.sleep_duration')).toMatchObject({
      value: '7.5',
      unit: 'hour',
      occurredLocal: '',
    })
  })

  it('validates canonical ranges and whole-number scores', () => {
    expect(
      validateRecordDraft({ ...createDraft('body.weight'), value: '10', unit: 'kg' }),
    ).toContain('20.0')
    expect(
      validateRecordDraft({
        ...createDraft('recovery.energy'),
        value: '3.5',
        unit: 'score_1_5',
      }),
    ).toContain('整数')
  })

  it('builds a confirmed manual update while preserving occurrence time', () => {
    const request = buildRecordRequest(
      {
        metric: 'body.weight',
        value: '72.4',
        unit: 'kg',
        occurredLocal: '2026-07-18 16:00',
        timezone: 'Asia/Shanghai',
        occurrenceOffsetMinutes: 480,
      },
      3,
    )

    expect(request).toMatchObject({
      value: 72.4,
      source: { kind: 'manual' },
      status: 'confirmed',
      expectedRevision: 3,
      occurredAt: '2026-07-18T08:00:00.000Z',
      timezone: 'Asia/Shanghai',
    })
  })

  it('rejects a future local occurrence time', () => {
    const draft = createDraft('body.weight')
    draft.occurredLocal = '2100-01-01 00:00'
    expect(validateRecordDraft(draft)).toContain('晚于现在')
  })
})
