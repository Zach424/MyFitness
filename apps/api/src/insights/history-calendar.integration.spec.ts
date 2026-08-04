import { randomUUID } from 'node:crypto'

import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import request from 'supertest'

import { createApplication } from '../bootstrap'
import { getRuntimeConfig } from '../config'
import { runMigrations } from '../database/migrate'

describe('cross-domain history calendar API with PostgreSQL', () => {
  const databaseUrl = getRuntimeConfig().databaseUrl
  const pool = new Pool({ connectionString: databaseUrl })
  let app: INestApplication
  let token = ''
  let userId = ''
  let otherToken = ''
  let otherUserId = ''

  const healthRecord = (occurredAt: string, value = 72) => ({
    metric: 'body.weight',
    value,
    unit: 'kg',
    source: { kind: 'manual' },
    status: 'confirmed',
    occurredAt,
    timezone: 'Asia/Shanghai',
  })

  const workout = (startedAt: string, endedAt: string) => ({
    title: '历史日历训练',
    source: { kind: 'manual' },
    exercises: [
      {
        position: 1,
        exerciseKey: 'goblet_squat',
        name: '高脚杯深蹲',
        category: 'strength',
        sets: [
          {
            position: 1,
            kind: 'working',
            reps: 10,
            load: 12,
            loadUnit: 'kg',
            completed: true,
          },
        ],
      },
    ],
    startedAt,
    endedAt,
    timezone: 'Asia/Shanghai',
    painLevel: 0,
    fatigue: 3,
  })

  const meal = (occurredAt: string) => ({
    mealType: 'lunch',
    title: '历史日历餐次',
    source: { kind: 'manual' },
    items: [
      {
        position: 1,
        food: {
          foodKey: 'rice_cooked',
          name: '熟米饭',
          category: 'staple',
          nutrientsPer100g: {
            energyKcal: 130,
            proteinG: 2.7,
            carbohydrateG: 28,
            fatG: 0.3,
            fiberG: 0.4,
          },
        },
        serving: { amount: 100, unit: 'g', grams: 100 },
      },
    ],
    occurredAt,
    timezone: 'Asia/Shanghai',
  })

  const post = (path: string, payload: unknown, accessToken = token) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-idempotency-key', `history-calendar-${randomUUID()}`)
      .send(payload)

  beforeAll(async () => {
    await runMigrations(databaseUrl)
    app = await createApplication(false)
    await app.init()
    const session = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .send({ subject: `history-calendar-${randomUUID()}` })
      .expect(200)
    token = session.body.accessToken as string
    userId = session.body.userId as string
    const other = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .send({ subject: `history-calendar-other-${randomUUID()}` })
      .expect(200)
    otherToken = other.body.accessToken as string
    otherUserId = other.body.userId as string
  })

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[userId, otherUserId]])
    await pool.end()
    await app.close()
  })

  it('groups current owner facts by requested local day and recomputes correction/deletion', async () => {
    const record = await post(
      '/v1/health-records',
      healthRecord('2025-08-04T16:30:00.000Z'),
    ).expect(201)
    await post('/v1/health-records', healthRecord('2025-08-05T13:00:00.000Z', 73)).expect(201)
    const session = await post(
      '/v1/workouts',
      workout('2025-08-03T16:30:00.000Z', '2025-08-03T17:15:00.000Z'),
    ).expect(201)
    await post('/v1/nutrition/meals', meal('2025-08-05T04:00:00.000Z')).expect(201)
    await post('/v1/nutrition/meals', meal('2025-08-05T05:00:00.000Z'), otherToken).expect(201)

    const endpoint =
      '/v1/insights/history-calendar?timezone=Asia%2FShanghai&at=2025-08-05T12%3A00%3A00.000Z'
    const initial = await request(app.getHttpServer())
      .get(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(initial.body).toMatchObject({
      timezone: 'Asia/Shanghai',
      startDate: '2025-07-09',
      endDate: '2025-08-05',
    })
    expect(initial.body.series).toHaveLength(28)
    expect(initial.body.series[26]).toMatchObject({
      localDate: '2025-08-04',
      hasRecords: true,
      healthRecordCount: 0,
      workoutCount: 1,
      mealCount: 0,
    })
    expect(initial.body.series[27]).toMatchObject({
      localDate: '2025-08-05',
      hasRecords: true,
      healthRecordCount: 1,
      workoutCount: 0,
      mealCount: 1,
    })

    await request(app.getHttpServer())
      .put(`/v1/health-records/${String(record.body.id)}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...healthRecord('2025-08-03T17:30:00.000Z'), expectedRevision: 1 })
      .expect(200)
    await request(app.getHttpServer())
      .delete(`/v1/workouts/${String(session.body.id)}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-expected-revision', '1')
      .expect(204)

    const recomputed = await request(app.getHttpServer())
      .get(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(recomputed.body.series[26]).toMatchObject({
      localDate: '2025-08-04',
      healthRecordCount: 1,
      workoutCount: 0,
    })
    expect(recomputed.body.series[27]).toMatchObject({
      healthRecordCount: 0,
      mealCount: 1,
    })

    const isolated = await request(app.getHttpServer())
      .get(endpoint)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200)
    expect(isolated.body.series[27]).toMatchObject({
      healthRecordCount: 0,
      workoutCount: 0,
      mealCount: 1,
    })

    await request(app.getHttpServer())
      .get('/v1/insights/history-calendar?timezone=Not%2FA_Zone')
      .set('Authorization', `Bearer ${token}`)
      .expect(400)
  })
})
