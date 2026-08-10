import { randomUUID } from 'node:crypto'

import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import request from 'supertest'

import { createApplication } from '../bootstrap'
import { getRuntimeConfig } from '../config'
import { runMigrations } from '../database/migrate'

describe('dashboard occurrence-time boundary with PostgreSQL', () => {
  const databaseUrl = getRuntimeConfig().databaseUrl
  const pool = new Pool({ connectionString: databaseUrl })
  let app: INestApplication
  let token = ''
  let userId = ''

  const referenceAt = '2026-08-10T04:00:00.000Z'
  const beforeAt = '2026-08-10T03:00:00.000Z'
  const afterAt = '2026-08-10T05:00:00.000Z'

  beforeAll(async () => {
    await runMigrations(databaseUrl)
    app = await createApplication(false)
    await app.init()
    const session = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .send({ subject: `dashboard-time-${randomUUID()}` })
      .expect(200)
    token = session.body.accessToken as string
    userId = session.body.userId as string
  })

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE id = $1', [userId])
    await pool.end()
    await app.close()
  })

  const createRecovery = async (occurredAt: string, value: number) => {
    await request(app.getHttpServer())
      .post('/v1/health-records')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', `dashboard-health-${randomUUID()}`)
      .send({
        metric: 'recovery.energy',
        value,
        unit: 'score_1_5',
        source: { kind: 'manual' },
        status: 'confirmed',
        occurredAt,
        timezone: 'Asia/Shanghai',
      })
      .expect(201)
  }

  const createWorkout = async (occurredAt: string, title: string) => {
    await request(app.getHttpServer())
      .post('/v1/workouts')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', `dashboard-workout-${randomUUID()}`)
      .send({
        title,
        source: { kind: 'manual' },
        exercises: [
          {
            position: 1,
            exerciseKey: 'dashboard_time_squat',
            name: '参考时刻深蹲',
            category: 'strength',
            sets: [
              {
                position: 1,
                kind: 'working',
                reps: 10,
                load: 10,
                loadUnit: 'kg',
                completed: true,
              },
            ],
          },
        ],
        startedAt: occurredAt,
        endedAt: new Date(Date.parse(occurredAt) + 30 * 60_000).toISOString(),
        timezone: 'Asia/Shanghai',
        painLevel: 0,
        fatigue: 3,
      })
      .expect(201)
  }

  const createMeal = async (occurredAt: string, title: string) => {
    await request(app.getHttpServer())
      .post('/v1/nutrition/meals')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', `dashboard-meal-${randomUUID()}`)
      .send({
        mealType: 'lunch',
        title,
        source: { kind: 'manual' },
        items: [
          {
            position: 1,
            food: {
              foodKey: 'dashboard_time_food',
              name: '参考时刻食物',
              category: 'custom',
              nutrientsPer100g: {
                energyKcal: 200,
                proteinG: 20,
                carbohydrateG: 10,
                fatG: 5,
                fiberG: 2,
              },
            },
            serving: { amount: 100, unit: 'g', grams: 100 },
          },
        ],
        occurredAt,
        timezone: 'Asia/Shanghai',
      })
      .expect(201)
  }

  it('excludes later occurrences until the reference instant advances', async () => {
    await createRecovery(beforeAt, 3)
    await createRecovery(afterAt, 5)
    await createWorkout(beforeAt, '参考时刻前训练')
    await createWorkout(afterAt, '参考时刻后训练')
    await createMeal(beforeAt, '参考时刻前餐食')
    await createMeal(afterAt, '参考时刻后餐食')

    const historical = await request(app.getHttpServer())
      .get('/v1/insights/dashboard')
      .query({ timezone: 'Asia/Shanghai', at: referenceAt })
      .set('Authorization', `Bearer ${token}`)
      .expect('Cache-Control', 'private, no-store')
      .expect(200)

    expect(
      historical.body.today.items.every(
        (item: { occurredAt: string }) => Date.parse(item.occurredAt) <= Date.parse(referenceAt),
      ),
    ).toBe(true)
    expect(historical.body.today.items).toHaveLength(3)
    expect(historical.body.readiness.evidence).toEqual([
      expect.objectContaining({ canonicalValue: 3, occurredAt: beforeAt }),
    ])
    expect(historical.body.trends[0]).toMatchObject({
      measurementCount: 1,
      workoutCount: 1,
      mealCount: 1,
      workoutVolumeKg: 100,
      energyKcal: 200,
    })
    expect(historical.body.personalState).toMatchObject({
      confirmedRecovery: { observationCount: 1, latestEvidenceAt: beforeAt },
      observedWindow: { measurementCount: 1, workoutCount: 1, mealCount: 1 },
      recoveryEstimate: { evidenceCount: 1 },
    })

    const advanced = await request(app.getHttpServer())
      .get('/v1/insights/dashboard')
      .query({ timezone: 'Asia/Shanghai', at: '2026-08-10T06:00:00.000Z' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(advanced.body.today.items).toHaveLength(6)
    expect(advanced.body.trends[0]).toMatchObject({
      measurementCount: 2,
      workoutCount: 2,
      mealCount: 2,
      workoutVolumeKg: 200,
      energyKcal: 400,
    })
  })
})
