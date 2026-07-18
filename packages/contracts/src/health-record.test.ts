import { describe, expect, it } from 'vitest'
import * as z from 'zod'

import {
  createHealthRecordBaseSchema,
  createHealthRecordSchema,
  expectedRevisionHeaderSchema,
  updateHealthRecordSchema,
} from './health-record'

const manualRecord = {
  metric: 'body.weight',
  value: 72.4,
  unit: 'kg',
  source: { kind: 'manual' },
  status: 'confirmed',
  occurredAt: '2026-07-18T07:40:00+08:00',
  timezone: 'Asia/Shanghai',
} as const

describe('health-record contract', () => {
  it('accepts a confirmed manual measurement', () => {
    expect(createHealthRecordSchema.parse(manualRecord)).toEqual(manualRecord)
  })

  it('keeps AI estimates as provenance-rich candidates', () => {
    const result = createHealthRecordSchema.safeParse({
      ...manualRecord,
      source: {
        kind: 'ai_estimate',
        metadata: { modelVersion: 'vision-2026-07', promptVersion: 'food-v1' },
      },
      confidence: 0.72,
      status: 'confirmed',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        'AI estimates must remain candidates until explicit confirmation',
      )
    }
  })

  it('requires confidence and model provenance for AI estimates', () => {
    expect(
      createHealthRecordSchema.safeParse({
        ...manualRecord,
        source: { kind: 'ai_estimate' },
        status: 'candidate',
      }).success,
    ).toBe(false)
  })

  it('rejects unknown time zones', () => {
    expect(
      createHealthRecordSchema.safeParse({ ...manualRecord, timezone: 'Shanghai/Local' }).success,
    ).toBe(false)
  })

  it('requires a positive optimistic revision for updates and deletes', () => {
    expect(updateHealthRecordSchema.parse({ ...manualRecord, expectedRevision: 2 })).toMatchObject({
      expectedRevision: 2,
    })
    expect(
      updateHealthRecordSchema.safeParse({ ...manualRecord, expectedRevision: 0 }).success,
    ).toBe(false)
    expect(expectedRevisionHeaderSchema.parse('3')).toBe(3)
  })

  it('emits an OpenAPI-compatible JSON schema from the base contract', () => {
    const schema = z.toJSONSchema(createHealthRecordBaseSchema, { target: 'openapi-3.0' })

    expect(schema.type).toBe('object')
    expect(schema.required).toContain('metric')
    expect(schema.properties?.source).toBeDefined()
  })
})
