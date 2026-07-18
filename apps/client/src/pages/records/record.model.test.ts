import { describe, expect, it } from 'vitest'

import { buildRecordRequest, createDraft, validateRecordDraft } from './record.model'

describe('record page model', () => {
  it('creates a metric-specific draft', () => {
    expect(createDraft('recovery.sleep_duration')).toMatchObject({
      value: '7.5',
      unit: 'hour',
    })
  })

  it('validates canonical ranges and whole-number scores', () => {
    expect(validateRecordDraft({ metric: 'body.weight', value: '10', unit: 'kg' })).toContain(
      '20.0',
    )
    expect(
      validateRecordDraft({ metric: 'recovery.energy', value: '3.5', unit: 'score_1_5' }),
    ).toContain('整数')
  })

  it('builds a confirmed manual update while preserving occurrence time', () => {
    const request = buildRecordRequest(
      {
        metric: 'body.weight',
        value: '72.4',
        unit: 'kg',
        occurredAt: '2026-07-18T08:00:00.000Z',
      },
      3,
    )

    expect(request).toMatchObject({
      value: 72.4,
      source: { kind: 'manual' },
      status: 'confirmed',
      expectedRevision: 3,
      occurredAt: '2026-07-18T08:00:00.000Z',
    })
  })
})
