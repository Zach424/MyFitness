import { randomUUID } from 'node:crypto'

import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import request from 'supertest'

import { createApplication } from '../bootstrap'
import { getRuntimeConfig } from '../config'
import { runMigrations } from '../database/migrate'

describe('health insight API with PostgreSQL', () => {
  const databaseUrl = getRuntimeConfig().databaseUrl
  const pool = new Pool({ connectionString: databaseUrl })
  let app: INestApplication
  let token = ''
  let userId = ''
  let otherToken = ''
  let otherUserId = ''

  const record = (
    metric: 'body.weight' | 'body.waist',
    value: number,
    unit: 'kg' | 'lb' | 'cm',
    occurredAt: string,
  ) => ({
    metric,
    value,
    unit,
    source: { kind: 'manual' },
    status: 'confirmed',
    occurredAt,
    timezone: 'Asia/Shanghai',
  })

  const createRecord = (payload: object, accessToken = token) =>
    request(app.getHttpServer())
      .post('/v1/health-records')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-idempotency-key', `health-insight-${randomUUID()}`)
      .send(payload)
      .expect(201)

  beforeAll(async () => {
    await runMigrations(databaseUrl)
    app = await createApplication(false)
    await app.init()
    const session = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .send({ subject: `health-insights-${randomUUID()}` })
      .expect(200)
    token = session.body.accessToken as string
    userId = session.body.userId as string
    const other = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .send({ subject: `health-insights-other-${randomUUID()}` })
      .expect(200)
    otherToken = other.body.accessToken as string
    otherUserId = other.body.userId as string
  })

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[userId, otherUserId]])
    await pool.end()
    await app.close()
  })

  it('isolates one confirmed metric and recomputes correction and deletion', async () => {
    const recent = await createRecord(
      record('body.weight', 154.3235835, 'lb', '2025-08-04T16:30:00.000Z'),
    )
    const older = await createRecord(record('body.weight', 68, 'kg', '2025-07-25T02:00:00.000Z'))
    await createRecord(record('body.weight', 90, 'kg', '2025-08-05T13:00:00.000Z'))
    await createRecord(record('body.waist', 80, 'cm', '2025-08-04T03:00:00.000Z'))
    await createRecord({
      metric: 'body.weight',
      value: 80,
      unit: 'kg',
      source: {
        kind: 'ai_estimate',
        metadata: { modelVersion: 'fixture-v1', promptVersion: 'fixture-v1' },
      },
      confidence: 0.7,
      status: 'candidate',
      occurredAt: '2025-08-04T04:00:00.000Z',
      timezone: 'Asia/Shanghai',
    })
    await createRecord(record('body.weight', 100, 'kg', '2025-08-04T05:00:00.000Z'), otherToken)

    const endpoint =
      '/v1/insights/health/body.weight?timezone=Asia%2FShanghai&at=2025-08-05T12%3A00%3A00.000Z'
    const initial = await request(app.getHttpServer())
      .get(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(initial.body).toMatchObject({
      metric: 'body.weight',
      canonicalUnit: 'kg',
      hasMore: false,
    })
    expect(initial.body.windows).toEqual([
      expect.objectContaining({
        days: 7,
        recordCount: 1,
        recordedDays: 1,
        statistics: { minimum: 70, maximum: 70, average: 70 },
      }),
      expect.objectContaining({
        days: 30,
        recordCount: 2,
        recordedDays: 2,
        statistics: { minimum: 68, maximum: 70, average: 69 },
      }),
      expect.objectContaining({ days: 90, recordCount: 2 }),
    ])
    expect(initial.body.series).toHaveLength(2)
    expect(initial.body.windows[2].recordCount).toBe(initial.body.series.length)
    expect(initial.body.series[0]).toMatchObject({
      recordId: recent.body.id,
      metric: 'body.weight',
      localDate: '2025-08-05',
      canonicalValue: 70,
      canonicalUnit: 'kg',
      displayValue: 154.3236,
      displayUnit: 'lb',
      recordTimezone: 'Asia/Shanghai',
      source: { kind: 'manual' },
    })

    await request(app.getHttpServer())
      .put(`/v1/health-records/${String(recent.body.id)}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...record('body.weight', 158.7328284, 'lb', '2025-08-04T16:30:00.000Z'),
        expectedRevision: 1,
      })
      .expect(200)

    const corrected = await request(app.getHttpServer())
      .get(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(corrected.body.windows[1].statistics).toEqual({ minimum: 68, maximum: 72, average: 70 })
    expect(corrected.body.series[0]).toMatchObject({ recordRevision: 2, canonicalValue: 72 })

    await request(app.getHttpServer())
      .delete(`/v1/health-records/${String(older.body.id)}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-expected-revision', '1')
      .expect(204)

    const afterDelete = await request(app.getHttpServer())
      .get(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(afterDelete.body.windows[1]).toMatchObject({ recordCount: 1, recordedDays: 1 })
    expect(afterDelete.body.windows[1].statistics).toEqual({
      minimum: 72,
      maximum: 72,
      average: 72,
    })

    const isolated = await request(app.getHttpServer())
      .get(endpoint)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200)
    expect(isolated.body.windows[0]).toMatchObject({ recordCount: 1 })
    expect(isolated.body.series[0]).toMatchObject({ canonicalValue: 100 })

    await request(app.getHttpServer())
      .get('/v1/insights/health/not-a-metric?timezone=Asia%2FShanghai')
      .set('Authorization', `Bearer ${token}`)
      .expect(400)
  })
})
