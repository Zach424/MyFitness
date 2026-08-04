import { randomUUID } from 'node:crypto'

import type { INestApplication } from '@nestjs/common'
import { Pool } from 'pg'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApplication } from '../bootstrap'
import { getRuntimeConfig } from '../config'
import { runMigrations } from '../database/migrate'

describe('user food catalog API with PostgreSQL', () => {
  const databaseUrl = getRuntimeConfig().databaseUrl
  const pool = new Pool({ connectionString: databaseUrl })
  let app: INestApplication
  let token = ''
  let userId = ''
  let otherToken = ''
  let otherUserId = ''

  const definition = {
    name: '家庭炖牛肉',
    aliases: ['周末炖牛肉'],
    category: 'protein',
    nutrientsPer100g: {
      energyKcal: 186,
      proteinG: 22,
      carbohydrateG: 4,
      fatG: 9,
      fiberG: 0.8,
    },
    reference: '家庭配方估算：成品总重 1200g，2026-08-05',
    defaultServing: { amount: 1, unit: 'serving', grams: 180 },
  }

  beforeAll(async () => {
    await runMigrations(databaseUrl)
    app = await createApplication(false)
    await app.init()
    const session = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .send({ subject: `food-catalog-${randomUUID()}` })
      .expect(200)
    token = String(session.body.accessToken)
    userId = String(session.body.userId)
    const other = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .send({ subject: `food-catalog-other-${randomUUID()}` })
      .expect(200)
    otherToken = String(other.body.accessToken)
    otherUserId = String(other.body.userId)
  })

  afterAll(async () => {
    const createdUserIds = [userId, otherUserId].filter(Boolean)
    if (createdUserIds.length) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUserIds])
    }
    await pool.end()
    if (app) await app.close()
  })

  it('owns, reuses, corrects, exports and archives food definitions without rewriting meals', async () => {
    const initialList = await request(app.getHttpServer())
      .get('/v1/food-catalog')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(initialList.body.starterVersion).toBe('starter-food-2026-08-05-v1')
    expect(initialList.body.items).toHaveLength(10)
    expect(initialList.body.items[0]).toMatchObject({
      source: 'starter',
      reference: expect.stringContaining('演示食物库'),
    })

    const idempotencyKey = `food-${randomUUID()}`
    const created = await request(app.getHttpServer())
      .post('/v1/food-catalog')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', idempotencyKey)
      .send(definition)
      .expect(201)
    expect(created.body).toMatchObject({ source: 'custom', revision: 1, ...definition })
    expect(created.body.foodKey).toMatch(/^custom:[a-f0-9]{32}$/)

    const replay = await request(app.getHttpServer())
      .post('/v1/food-catalog')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', idempotencyKey)
      .send(definition)
      .expect(201)
    expect(replay.body.id).toBe(created.body.id)
    await request(app.getHttpServer())
      .post('/v1/food-catalog')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', idempotencyKey)
      .send({ ...definition, name: '另一食物' })
      .expect(409)
    await request(app.getHttpServer())
      .post('/v1/food-catalog')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', `food-${randomUUID()}`)
      .send({ ...definition, name: definition.name.toUpperCase() })
      .expect(409)

    const otherOwned = await request(app.getHttpServer())
      .post('/v1/food-catalog')
      .set('Authorization', `Bearer ${otherToken}`)
      .set('x-idempotency-key', `food-${randomUUID()}`)
      .send(definition)
      .expect(201)
    expect(otherOwned.body.userId).toBe(otherUserId)
    await request(app.getHttpServer())
      .get(`/v1/food-catalog/${String(created.body.id)}/history`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404)

    const meal = await request(app.getHttpServer())
      .post('/v1/nutrition/meals')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', `meal-${randomUUID()}`)
      .send({
        mealType: 'dinner',
        title: '家庭晚餐',
        source: { kind: 'manual' },
        items: [
          {
            position: 1,
            food: {
              foodKey: created.body.foodKey,
              name: created.body.name,
              category: created.body.category,
              nutrientsPer100g: created.body.nutrientsPer100g,
              reference: created.body.reference,
            },
            serving: created.body.defaultServing,
          },
        ],
        occurredAt: '2026-08-05T19:00:00+08:00',
        timezone: 'Asia/Shanghai',
      })
      .expect(201)

    const corrected = await request(app.getHttpServer())
      .put(`/v1/food-catalog/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...definition,
        name: '低脂家庭炖牛肉',
        nutrientsPer100g: { ...definition.nutrientsPer100g, energyKcal: 165, fatG: 6.5 },
        reference: '家庭配方重新称量：成品总重 1350g，2026-08-06',
        expectedRevision: 1,
      })
      .expect(200)
    expect(corrected.body).toMatchObject({ revision: 2, name: '低脂家庭炖牛肉' })
    await request(app.getHttpServer())
      .put(`/v1/food-catalog/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...definition, expectedRevision: 1 })
      .expect(409)

    const meals = await request(app.getHttpServer())
      .get('/v1/nutrition/meals')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(meals.body.items[0]).toMatchObject({ id: meal.body.id })
    expect(meals.body.items[0].items[0].food).toMatchObject({
      name: '家庭炖牛肉',
      nutrientsPer100g: { energyKcal: 186, fatG: 9 },
      reference: definition.reference,
    })

    const archived = await request(app.getHttpServer())
      .delete(`/v1/food-catalog/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-expected-revision', '2')
      .expect(200)
    expect(archived.body).toMatchObject({ revision: 3, name: '低脂家庭炖牛肉' })
    expect(archived.body.archivedAt).toBeTruthy()

    const history = await request(app.getHttpServer())
      .get(`/v1/food-catalog/${String(created.body.id)}/history`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(history.body.items.map((item: { action: string }) => item.action)).toEqual([
      'archived',
      'updated',
      'created',
    ])
    expect(history.body.items[2]).toMatchObject({ name: '家庭炖牛肉', revision: 1 })

    const privacy = await request(app.getHttpServer())
      .get('/v1/me/privacy')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(
      privacy.body.inventory.find((item: { category: string }) => item.category === 'nutrition'),
    ).toMatchObject({ recordCount: 2, includesHistory: true })

    const portable = await request(app.getHttpServer())
      .get('/v1/me/privacy/export')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(portable.body.schemaVersion).toBe('myfitness-portable-export-v4')
    expect(portable.body.data.foodCatalog[0]).toMatchObject({
      id: created.body.id,
      name: '低脂家庭炖牛肉',
    })
    expect(portable.body.data.foodCatalog[0].history).toHaveLength(3)
    expect(portable.body.data.nutritionMeals[0].items[0]).toMatchObject({
      food_name: '家庭炖牛肉',
      energy_kcal_per_100g: 186,
    })
  })

  it('rejects missing nutrition provenance before persistence', async () => {
    await request(app.getHttpServer())
      .post('/v1/food-catalog')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', `food-${randomUUID()}`)
      .send({ ...definition, name: '缺少依据', reference: '' })
      .expect(400)
  })
})
