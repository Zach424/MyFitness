import { randomUUID } from 'node:crypto'

import type { INestApplication } from '@nestjs/common'
import { Pool } from 'pg'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApplication } from '../bootstrap'
import { getRuntimeConfig } from '../config'
import { runMigrations } from '../database/migrate'

describe('user exercise catalog API with PostgreSQL', () => {
  const databaseUrl = getRuntimeConfig().databaseUrl
  const pool = new Pool({ connectionString: databaseUrl })
  let app: INestApplication
  let token = ''
  let userId = ''
  let otherToken = ''
  let otherUserId = ''

  const definition = {
    name: '地雷管推举',
    aliases: ['Landmine Press'],
    category: 'strength',
    trackingMode: 'reps_load',
    equipment: ['other'],
    equipmentNotes: '地雷管固定装置',
  }

  beforeAll(async () => {
    await runMigrations(databaseUrl)
    app = await createApplication(false)
    await app.init()
    const session = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .send({ subject: `exercise-catalog-${randomUUID()}` })
      .expect(200)
    token = String(session.body.accessToken)
    userId = String(session.body.userId)
    const other = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .send({ subject: `exercise-catalog-other-${randomUUID()}` })
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

  it('owns, reuses, corrects, exports and archives a custom exercise without rewriting workouts', async () => {
    const initialList = await request(app.getHttpServer())
      .get('/v1/exercise-catalog')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(initialList.body.starterVersion).toBe('starter-2026-08-05-v1')
    expect(initialList.body.items).toHaveLength(9)
    expect(initialList.body.items[0]).toMatchObject({
      source: 'starter',
      trackingMode: 'reps_load',
      equipment: ['dumbbells'],
    })

    const idempotencyKey = `exercise-${randomUUID()}`
    const created = await request(app.getHttpServer())
      .post('/v1/exercise-catalog')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', idempotencyKey)
      .send(definition)
      .expect(201)
    expect(created.body).toMatchObject({
      source: 'custom',
      revision: 1,
      name: definition.name,
      equipmentNotes: definition.equipmentNotes,
    })
    expect(created.body.key).toMatch(/^custom_[a-f0-9]{32}$/)

    const replay = await request(app.getHttpServer())
      .post('/v1/exercise-catalog')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', idempotencyKey)
      .send(definition)
      .expect(201)
    expect(replay.body.id).toBe(created.body.id)
    await request(app.getHttpServer())
      .post('/v1/exercise-catalog')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', idempotencyKey)
      .send({ ...definition, name: '另一动作' })
      .expect(409)
    await request(app.getHttpServer())
      .post('/v1/exercise-catalog')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', `exercise-${randomUUID()}`)
      .send({ ...definition, name: definition.name.toUpperCase() })
      .expect(409)

    const otherOwned = await request(app.getHttpServer())
      .post('/v1/exercise-catalog')
      .set('Authorization', `Bearer ${otherToken}`)
      .set('x-idempotency-key', `exercise-${randomUUID()}`)
      .send(definition)
      .expect(201)
    expect(otherOwned.body.userId).toBe(otherUserId)
    await request(app.getHttpServer())
      .get(`/v1/exercise-catalog/${String(created.body.id)}/history`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404)

    const workout = await request(app.getHttpServer())
      .post('/v1/workouts')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', `workout-${randomUUID()}`)
      .send({
        title: '自定义动作训练',
        source: { kind: 'manual' },
        exercises: [
          {
            position: 1,
            exerciseKey: created.body.key,
            name: created.body.name,
            category: created.body.category,
            trackingMode: created.body.trackingMode,
            equipment: created.body.equipment,
            equipmentNotes: created.body.equipmentNotes,
            sets: [
              {
                position: 1,
                kind: 'working',
                reps: 8,
                load: 15,
                loadUnit: 'kg',
                completed: true,
              },
            ],
          },
        ],
        startedAt: '2026-08-05T18:00:00+08:00',
        endedAt: '2026-08-05T18:30:00+08:00',
        timezone: 'Asia/Shanghai',
        painLevel: 0,
        fatigue: 3,
      })
      .expect(201)

    const corrected = await request(app.getHttpServer())
      .put(`/v1/exercise-catalog/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...definition,
        name: '单臂地雷管推举',
        aliases: ['Landmine Press', '地雷管肩推'],
        expectedRevision: 1,
      })
      .expect(200)
    expect(corrected.body).toMatchObject({ revision: 2, name: '单臂地雷管推举' })
    await request(app.getHttpServer())
      .put(`/v1/exercise-catalog/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...definition, expectedRevision: 1 })
      .expect(409)

    const workouts = await request(app.getHttpServer())
      .get('/v1/workouts')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(workouts.body.items[0].exercises[0]).toMatchObject({
      exerciseKey: created.body.key,
      name: '地雷管推举',
      trackingMode: 'reps_load',
      equipment: ['other'],
      equipmentNotes: '地雷管固定装置',
    })
    expect(workouts.body.items[0].id).toBe(workout.body.id)

    const archived = await request(app.getHttpServer())
      .delete(`/v1/exercise-catalog/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-expected-revision', '2')
      .expect(200)
    expect(archived.body).toMatchObject({ revision: 3, name: '单臂地雷管推举' })
    expect(archived.body.archivedAt).toBeTruthy()

    const activeList = await request(app.getHttpServer())
      .get('/v1/exercise-catalog')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(
      activeList.body.items.some((entry: { id: string }) => entry.id === created.body.id),
    ).toBe(false)

    const history = await request(app.getHttpServer())
      .get(`/v1/exercise-catalog/${String(created.body.id)}/history`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(history.body.items.map((item: { action: string }) => item.action)).toEqual([
      'archived',
      'updated',
      'created',
    ])
    expect(history.body.items[2]).toMatchObject({ name: '地雷管推举', revision: 1 })

    const privacy = await request(app.getHttpServer())
      .get('/v1/me/privacy')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(
      privacy.body.inventory.find((item: { category: string }) => item.category === 'workouts'),
    ).toMatchObject({ recordCount: 2, includesHistory: true })

    const portable = await request(app.getHttpServer())
      .get('/v1/me/privacy/export')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(portable.body.schemaVersion).toBe('myfitness-portable-export-v3')
    expect(portable.body.data.exerciseCatalog[0]).toMatchObject({
      id: created.body.id,
      name: '单臂地雷管推举',
    })
    expect(portable.body.data.exerciseCatalog[0].history).toHaveLength(3)
    expect(portable.body.data.workouts[0].exercises[0]).toMatchObject({
      name: '地雷管推举',
      equipment: ['other'],
    })
  })

  it('rejects incomplete other-equipment semantics before persistence', async () => {
    await request(app.getHttpServer())
      .post('/v1/exercise-catalog')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', `exercise-${randomUUID()}`)
      .send({ ...definition, name: '缺少说明', equipmentNotes: undefined })
      .expect(400)
  })
})
