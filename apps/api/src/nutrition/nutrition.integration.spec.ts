import { randomUUID } from 'node:crypto'

import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import request from 'supertest'

import { createApplication } from '../bootstrap'
import { getRuntimeConfig } from '../config'
import { runMigrations } from '../database/migrate'

describe('nutrition API with PostgreSQL', () => {
  const databaseUrl = getRuntimeConfig().databaseUrl
  const pool = new Pool({ connectionString: databaseUrl })
  let app: INestApplication
  let token = ''
  let userId = ''
  let otherToken = ''
  let otherUserId = ''

  const chicken = {
    position: 1,
    food: {
      foodKey: 'chicken_breast_cooked',
      name: '熟鸡胸肉',
      category: 'protein',
      nutrientsPer100g: {
        energyKcal: 165,
        proteinG: 31,
        carbohydrateG: 0,
        fatG: 3.6,
        fiberG: 0,
      },
    },
    serving: { amount: 120, unit: 'g', grams: 120 },
  }
  const rice = {
    position: 2,
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
    serving: { amount: 150, unit: 'g', grams: 150 },
  }
  const meal = {
    mealType: 'lunch',
    title: '训练日午餐',
    source: { kind: 'manual' },
    items: [chicken, rice],
    occurredAt: '2026-07-18T12:30:00+08:00',
    timezone: 'Asia/Shanghai',
    note: '按熟重记录',
  }

  beforeAll(async () => {
    await runMigrations(databaseUrl)
    app = await createApplication(false)
    await app.init()
    const session = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .send({ subject: `nutrition-${randomUUID()}` })
      .expect(200)
    token = session.body.accessToken as string
    userId = session.body.userId as string
    const other = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .send({ subject: `nutrition-other-${randomUUID()}` })
      .expect(200)
    otherToken = other.body.accessToken as string
    otherUserId = other.body.userId as string
  })

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[userId, otherUserId]])
    await pool.end()
    await app.close()
  })

  it('creates, calculates, favorites, revises, audits and deletes a meal', async () => {
    const key = `meal-${randomUUID()}`
    const created = await request(app.getHttpServer())
      .post('/v1/nutrition/meals')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', key)
      .send(meal)
      .expect(201)

    expect(created.body).toMatchObject({
      userId,
      revision: 1,
      summary: {
        energyKcal: 393,
        proteinG: 41.25,
        carbohydrateG: 42,
        fatG: 4.77,
        fiberG: 0.6,
      },
    })
    expect(created.body.items[1]).toMatchObject({
      serving: { amount: 150, unit: 'g', grams: 150 },
      summary: { energyKcal: 195 },
    })

    const replay = await request(app.getHttpServer())
      .post('/v1/nutrition/meals')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', key)
      .send(meal)
      .expect(201)
    expect(replay.body.id).toBe(created.body.id)
    await request(app.getHttpServer())
      .post('/v1/nutrition/meals')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', key)
      .send({ ...meal, title: '不同的午餐' })
      .expect(409)

    const favorite = await request(app.getHttpServer())
      .put('/v1/nutrition/favorites/rice_cooked')
      .set('Authorization', `Bearer ${token}`)
      .send({ food: rice.food, defaultServing: rice.serving })
      .expect(200)
    expect(favorite.body.food.foodKey).toBe('rice_cooked')
    const favorites = await request(app.getHttpServer())
      .get('/v1/nutrition/favorites')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(favorites.body.items).toHaveLength(1)

    const list = await request(app.getHttpServer())
      .get('/v1/nutrition/meals')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(list.body.items).toHaveLength(1)

    const dashboard = await request(app.getHttpServer())
      .get('/v1/insights/dashboard')
      .query({ timezone: 'Asia/Shanghai', at: '2026-07-18T13:00:00.000Z' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(dashboard.body.today.items).toEqual([
      expect.objectContaining({ kind: 'nutrition', title: '训练日午餐', value: '393 kcal' }),
    ])
    expect(dashboard.body.trends[0]).toMatchObject({ mealCount: 1, energyKcal: 393 })

    const update = {
      ...meal,
      items: [chicken, { ...rice, serving: { amount: 200, unit: 'g', grams: 200 } }],
      expectedRevision: 1,
    }
    const updated = await request(app.getHttpServer())
      .put(`/v1/nutrition/meals/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${token}`)
      .send(update)
      .expect(200)
    expect(updated.body).toMatchObject({
      revision: 2,
      summary: {
        energyKcal: 458,
        proteinG: 42.6,
        carbohydrateG: 56,
        fatG: 4.92,
        fiberG: 0.8,
      },
    })

    await request(app.getHttpServer())
      .put(`/v1/nutrition/meals/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${token}`)
      .send(update)
      .expect(409)
    await request(app.getHttpServer())
      .get(`/v1/nutrition/meals/${String(created.body.id)}/history`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404)

    const history = await request(app.getHttpServer())
      .get(`/v1/nutrition/meals/${String(created.body.id)}/history`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(history.body.items.map((item: { action: string }) => item.action)).toEqual([
      'updated',
      'created',
    ])

    await request(app.getHttpServer())
      .delete(`/v1/nutrition/meals/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-expected-revision', '2')
      .expect(204)
    await request(app.getHttpServer())
      .delete('/v1/nutrition/favorites/rice_cooked')
      .set('Authorization', `Bearer ${token}`)
      .expect(204)

    const deletedHistory = await request(app.getHttpServer())
      .get(`/v1/nutrition/meals/${String(created.body.id)}/history`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(deletedHistory.body.items[0]).toMatchObject({ action: 'deleted', revision: 3 })
  })

  it('rejects an invalid canonical serving before persistence', async () => {
    await request(app.getHttpServer())
      .post('/v1/nutrition/meals')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', `meal-${randomUUID()}`)
      .send({
        ...meal,
        items: [{ ...rice, serving: { ...rice.serving, grams: 0 } }],
      })
      .expect(400)
  })
})
