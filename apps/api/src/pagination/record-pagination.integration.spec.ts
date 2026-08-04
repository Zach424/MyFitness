import { randomUUID } from 'node:crypto'

import type { INestApplication } from '@nestjs/common'
import { Pool } from 'pg'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApplication } from '../bootstrap'
import { getRuntimeConfig } from '../config'
import { runMigrations } from '../database/migrate'

describe('owner record pagination API with PostgreSQL', () => {
  const databaseUrl = getRuntimeConfig().databaseUrl
  const pool = new Pool({ connectionString: databaseUrl })
  let app: INestApplication
  let token = ''
  let userId = ''
  let otherToken = ''
  let otherUserId = ''

  const post = (path: string, payload: unknown, accessToken = token) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-idempotency-key', `record-page-${randomUUID()}`)
      .send(payload)

  const healthRecord = (occurredAt: string, value: number) => ({
    metric: 'body.weight',
    value,
    unit: 'kg',
    source: { kind: 'manual' },
    status: 'confirmed',
    occurredAt,
    timezone: 'Asia/Shanghai',
  })

  const workout = (startedAt: string, title: string) => ({
    title,
    source: { kind: 'manual' },
    exercises: [
      {
        position: 1,
        exerciseKey: 'goblet_squat',
        name: '高脚杯深蹲',
        category: 'strength',
        sets: [{ position: 1, kind: 'working', reps: 8, completed: true }],
      },
    ],
    startedAt,
    endedAt: new Date(Date.parse(startedAt) + 30 * 60_000).toISOString(),
    timezone: 'Asia/Shanghai',
    painLevel: 0,
    fatigue: 2,
  })

  const meal = (occurredAt: string, title: string) => ({
    mealType: 'lunch',
    title,
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

  beforeAll(async () => {
    await runMigrations(databaseUrl)
    app = await createApplication(false)
    await app.init()
    const session = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .send({ subject: `record-pagination-${randomUUID()}` })
      .expect(200)
    token = session.body.accessToken as string
    userId = session.body.userId as string
    const other = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .send({ subject: `record-pagination-other-${randomUUID()}` })
      .expect(200)
    otherToken = other.body.accessToken as string
    otherUserId = other.body.userId as string
  })

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[userId, otherUserId]])
    await pool.end()
    await app.close()
  })

  it('continues stable owner pages across correction/deletion and supports exact reads', async () => {
    const health = []
    const workouts = []
    const meals = []
    for (const [index, day] of ['01', '02', '03'].entries()) {
      health.push(
        (
          await post(
            '/v1/health-records',
            healthRecord(`2026-08-${day}T00:00:00.000Z`, 70 + index),
          ).expect(201)
        ).body,
      )
      workouts.push(
        (
          await post(
            '/v1/workouts',
            workout(`2026-08-${day}T01:00:00.000Z`, `分页训练 ${day}`),
          ).expect(201)
        ).body,
      )
      meals.push(
        (
          await post(
            '/v1/nutrition/meals',
            meal(`2026-08-${day}T04:00:00.000Z`, `分页餐次 ${day}`),
          ).expect(201)
        ).body,
      )
    }
    await post(
      '/v1/health-records',
      healthRecord('2026-08-04T00:00:00.000Z', 99),
      otherToken,
    ).expect(201)

    const firstHealth = await request(app.getHttpServer())
      .get('/v1/health-records?limit=2')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(
      firstHealth.body.items.map((item: { displayValue: number }) => item.displayValue),
    ).toEqual([72, 71])
    expect(firstHealth.body.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/)

    await request(app.getHttpServer())
      .put(`/v1/health-records/${String(health[1].id)}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...healthRecord('2026-08-04T02:00:00.000Z', 71.5),
        expectedRevision: 1,
      })
      .expect(200)
    const secondHealth = await request(app.getHttpServer())
      .get(`/v1/health-records?limit=2&cursor=${String(firstHealth.body.nextCursor)}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(
      secondHealth.body.items.map((item: { displayValue: number }) => item.displayValue),
    ).toEqual([70])
    expect(secondHealth.body.nextCursor).toBeNull()

    const firstWorkouts = await request(app.getHttpServer())
      .get('/v1/workouts?limit=2')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(firstWorkouts.body.items.map((item: { title: string }) => item.title)).toEqual([
      '分页训练 03',
      '分页训练 02',
    ])
    await request(app.getHttpServer())
      .delete(`/v1/workouts/${String(workouts[1].id)}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-expected-revision', '1')
      .expect(204)
    const secondWorkouts = await request(app.getHttpServer())
      .get(`/v1/workouts?limit=2&cursor=${String(firstWorkouts.body.nextCursor)}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(secondWorkouts.body.items.map((item: { title: string }) => item.title)).toEqual([
      '分页训练 01',
    ])

    const firstMeals = await request(app.getHttpServer())
      .get('/v1/nutrition/meals?limit=2')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    const secondMeals = await request(app.getHttpServer())
      .get(`/v1/nutrition/meals?limit=2&cursor=${String(firstMeals.body.nextCursor)}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect([
      ...firstMeals.body.items.map((item: { title: string }) => item.title),
      ...secondMeals.body.items.map((item: { title: string }) => item.title),
    ]).toEqual(['分页餐次 03', '分页餐次 02', '分页餐次 01'])
    expect(secondMeals.body.nextCursor).toBeNull()

    await request(app.getHttpServer())
      .get(`/v1/health-records/${String(health[0].id)}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => expect(body.displayValue).toBe(70))
    await request(app.getHttpServer())
      .get(`/v1/workouts/${String(workouts[0].id)}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    await request(app.getHttpServer())
      .get(`/v1/nutrition/meals/${String(meals[0].id)}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    await request(app.getHttpServer())
      .get(`/v1/health-records/${String(health[0].id)}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404)

    await request(app.getHttpServer())
      .get(`/v1/workouts?limit=2&cursor=${String(firstHealth.body.nextCursor)}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400)
    await request(app.getHttpServer())
      .get('/v1/health-records?limit=0')
      .set('Authorization', `Bearer ${token}`)
      .expect(400)
  })
})
