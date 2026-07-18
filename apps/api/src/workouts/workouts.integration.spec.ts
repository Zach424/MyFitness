import { randomUUID } from 'node:crypto'

import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import request from 'supertest'

import { createApplication } from '../bootstrap'
import { getRuntimeConfig } from '../config'
import { runMigrations } from '../database/migrate'

describe('workout API with PostgreSQL', () => {
  const databaseUrl = getRuntimeConfig().databaseUrl
  const pool = new Pool({ connectionString: databaseUrl })
  let app: INestApplication
  let token = ''
  let userId = ''
  let otherToken = ''
  let otherUserId = ''

  const workout = {
    title: '全身 A',
    status: 'completed',
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
            load: 44,
            loadUnit: 'lb',
            rpe: 7,
            completed: true,
          },
          {
            position: 2,
            kind: 'working',
            reps: 8,
            load: 44,
            loadUnit: 'lb',
            rpe: 8,
            completed: false,
          },
        ],
      },
      {
        position: 2,
        exerciseKey: 'running',
        name: '跑步',
        category: 'cardio',
        sets: [
          {
            position: 1,
            kind: 'working',
            durationSeconds: 600,
            distanceMeters: 2000,
            completed: true,
          },
        ],
      },
    ],
    startedAt: '2026-07-18T18:00:00+08:00',
    endedAt: '2026-07-18T18:45:00+08:00',
    timezone: 'Asia/Shanghai',
    painLevel: 0,
    fatigue: 3,
  }

  beforeAll(async () => {
    await runMigrations(databaseUrl)
    app = await createApplication(false)
    await app.init()
    const session = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .send({ subject: `workouts-${randomUUID()}` })
      .expect(200)
    token = session.body.accessToken as string
    userId = session.body.userId as string
    const other = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .send({ subject: `workouts-other-${randomUUID()}` })
      .expect(200)
    otherToken = other.body.accessToken as string
    otherUserId = other.body.userId as string
  })

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[userId, otherUserId]])
    await pool.end()
    await app.close()
  })

  it('creates, calculates, revises, audits and deletes a workout', async () => {
    const key = `workout-${randomUUID()}`
    const created = await request(app.getHttpServer())
      .post('/v1/workouts')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', key)
      .send(workout)
      .expect(201)

    expect(created.body).toMatchObject({
      userId,
      revision: 1,
      summary: {
        completedSets: 2,
        totalSets: 3,
        volumeKg: 199.58,
        distanceMeters: 2000,
        activeSeconds: 600,
      },
    })
    expect(created.body.exercises[0].sets[0]).toMatchObject({
      load: 44,
      loadUnit: 'lb',
      canonicalLoadKg: 19.9581,
    })

    const replay = await request(app.getHttpServer())
      .post('/v1/workouts')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', key)
      .send(workout)
      .expect(201)
    expect(replay.body.id).toBe(created.body.id)

    const list = await request(app.getHttpServer())
      .get('/v1/workouts')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(list.body.items).toHaveLength(1)

    const update = {
      ...workout,
      exercises: [
        {
          ...workout.exercises[0],
          sets: workout.exercises[0]!.sets.map((set) => ({ ...set, completed: true })),
        },
        workout.exercises[1],
      ],
      expectedRevision: 1,
    }
    const updated = await request(app.getHttpServer())
      .put(`/v1/workouts/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${token}`)
      .send(update)
      .expect(200)
    expect(updated.body).toMatchObject({ revision: 2 })
    expect(updated.body.summary.volumeKg).toBe(359.25)
    expect(updated.body.summary.completedSets).toBe(3)

    await request(app.getHttpServer())
      .put(`/v1/workouts/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${token}`)
      .send(update)
      .expect(409)
    await request(app.getHttpServer())
      .get(`/v1/workouts/${String(created.body.id)}/history`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404)

    const history = await request(app.getHttpServer())
      .get(`/v1/workouts/${String(created.body.id)}/history`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(history.body.items.map((item: { action: string }) => item.action)).toEqual([
      'updated',
      'created',
    ])

    await request(app.getHttpServer())
      .delete(`/v1/workouts/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-expected-revision', '2')
      .expect(204)
    const empty = await request(app.getHttpServer())
      .get('/v1/workouts')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(empty.body.items).toEqual([])

    const deletedHistory = await request(app.getHttpServer())
      .get(`/v1/workouts/${String(created.body.id)}/history`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(deletedHistory.body.items[0]).toMatchObject({ action: 'deleted', revision: 3 })
  })

  it('rejects an invalid time boundary before persistence', async () => {
    await request(app.getHttpServer())
      .post('/v1/workouts')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', `workout-${randomUUID()}`)
      .send({ ...workout, endedAt: '2026-07-18T17:00:00+08:00' })
      .expect(400)
  })
})
