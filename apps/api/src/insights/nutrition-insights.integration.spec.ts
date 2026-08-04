import { randomUUID } from 'node:crypto'

import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import request from 'supertest'

import { createApplication } from '../bootstrap'
import { getRuntimeConfig } from '../config'
import { runMigrations } from '../database/migrate'

describe('nutrition insight API with PostgreSQL', () => {
  const databaseUrl = getRuntimeConfig().databaseUrl
  const pool = new Pool({ connectionString: databaseUrl })
  let app: INestApplication
  let token = ''
  let userId = ''
  let otherToken = ''
  let otherUserId = ''

  const meal = (occurredAt: string, energyKcal: number, fiberG?: number) => ({
    mealType: 'lunch',
    title: `趋势餐次 ${energyKcal}`,
    source: { kind: 'manual' },
    items: [
      {
        position: 1,
        food: {
          foodKey: `trend_food_${energyKcal}`,
          name: `趋势食物 ${energyKcal}`,
          category: 'custom',
          nutrientsPer100g: {
            energyKcal,
            proteinG: 10,
            carbohydrateG: 20,
            fatG: 5,
            ...(fiberG === undefined ? {} : { fiberG }),
          },
          reference: '用户确认测试值',
        },
        serving: { amount: 100, unit: 'g', grams: 100 },
      },
    ],
    occurredAt,
    timezone: 'Asia/Shanghai',
  })

  const createMeal = (payload: ReturnType<typeof meal>, accessToken = token) =>
    request(app.getHttpServer())
      .post('/v1/nutrition/meals')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-idempotency-key', `nutrition-insight-${randomUUID()}`)
      .send(payload)
      .expect(201)

  beforeAll(async () => {
    await runMigrations(databaseUrl)
    app = await createApplication(false)
    await app.init()
    const session = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .send({ subject: `nutrition-insights-${randomUUID()}` })
      .expect(200)
    token = session.body.accessToken as string
    userId = session.body.userId as string
    const other = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .send({ subject: `nutrition-insights-other-${randomUUID()}` })
      .expect(200)
    otherToken = other.body.accessToken as string
    otherUserId = other.body.userId as string
  })

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[userId, otherUserId]])
    await pool.end()
    await app.close()
  })

  it('uses local days and current meals, then recomputes corrections and deletion', async () => {
    const recent = await createMeal(meal('2025-08-04T16:30:00.000Z', 100))
    const older = await createMeal(meal('2025-07-26T04:00:00.000Z', 300, 4))
    await createMeal(meal('2025-08-05T13:00:00.000Z', 900, 9))
    await createMeal(meal('2025-08-04T17:00:00.000Z', 700, 7), otherToken)

    const endpoint =
      '/v1/insights/nutrition?timezone=Asia%2FShanghai&at=2025-08-05T12%3A00%3A00.000Z'
    const initial = await request(app.getHttpServer())
      .get(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(initial.body.series).toHaveLength(90)
    expect(initial.body.series[0]).toMatchObject({
      localDate: '2025-05-08',
      hasEvidence: false,
      nutrients: { energyKcal: null },
    })
    expect(initial.body.series[89]).toMatchObject({
      localDate: '2025-08-05',
      mealCount: 1,
      itemCount: 1,
      fiberKnownItemCount: 0,
      nutrients: { energyKcal: 100, fiberG: null },
    })
    expect(initial.body.windows).toEqual([
      expect.objectContaining({ days: 7, recordedDays: 1, missingDays: 6, mealCount: 1 }),
      expect.objectContaining({
        days: 30,
        recordedDays: 2,
        missingDays: 28,
        mealCount: 2,
        nutrients: expect.objectContaining({ energyKcal: 400, fiberG: 4 }),
      }),
      expect.objectContaining({ days: 90, recordedDays: 2, mealCount: 2 }),
    ])

    await request(app.getHttpServer())
      .put(`/v1/nutrition/meals/${String(recent.body.id)}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...meal('2025-08-04T16:30:00.000Z', 200, 3), expectedRevision: 1 })
      .expect(200)

    const corrected = await request(app.getHttpServer())
      .get(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(corrected.body.series[89]).toMatchObject({
      fiberKnownItemCount: 1,
      nutrients: { energyKcal: 200, fiberG: 3 },
    })
    expect(corrected.body.windows[1].nutrients).toMatchObject({ energyKcal: 500, fiberG: 7 })

    await request(app.getHttpServer())
      .delete(`/v1/nutrition/meals/${String(older.body.id)}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-expected-revision', '1')
      .expect(204)

    const afterDelete = await request(app.getHttpServer())
      .get(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(afterDelete.body.windows[1]).toMatchObject({ recordedDays: 1, mealCount: 1 })
    expect(afterDelete.body.windows[1].nutrients).toMatchObject({ energyKcal: 200, fiberG: 3 })

    const isolated = await request(app.getHttpServer())
      .get(endpoint)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200)
    expect(isolated.body.windows[0]).toMatchObject({ recordedDays: 1, mealCount: 1 })
    expect(isolated.body.windows[0].nutrients.energyKcal).toBe(700)

    await request(app.getHttpServer())
      .get('/v1/insights/nutrition?timezone=Not%2FA_Zone')
      .set('Authorization', `Bearer ${token}`)
      .expect(400)
  })
})
