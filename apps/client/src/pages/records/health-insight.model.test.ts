import { describe, expect, it } from 'vitest'
import type { HealthInsight, HealthRecord } from '@myfitness/contracts'

import { healthInsightChoices, healthInsightPoints } from './health-insight.model'

describe('health insight view model', () => {
  it('offers only exact metrics with confirmed current records', () => {
    const records = [
      { metric: 'body.weight', status: 'confirmed' },
      { metric: 'body.weight', status: 'confirmed' },
      { metric: 'body.waist', status: 'candidate' },
      { metric: 'recovery.energy', status: 'confirmed' },
    ] as HealthRecord[]

    expect(healthInsightChoices(records).map((choice) => choice.metric)).toEqual([
      'body.weight',
      'recovery.energy',
    ])
  })

  it('uses the same elapsed-time boundary as the server windows', () => {
    const insight = {
      generatedAt: '2026-08-05T12:00:00.000Z',
      series: [
        { occurredAt: '2026-08-01T12:00:00.000Z', recordId: 'recent' },
        { occurredAt: '2026-07-20T12:00:00.000Z', recordId: 'older' },
      ],
    } as unknown as HealthInsight

    expect(healthInsightPoints(insight, 7).map((point) => point.recordId)).toEqual(['recent'])
    expect(healthInsightPoints(insight, 30).map((point) => point.recordId)).toEqual([
      'older',
      'recent',
    ])
  })
})
