import { randomUUID } from 'node:crypto'

import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import request from 'supertest'

import { createApplication } from '../bootstrap'
import { getRuntimeConfig } from '../config'
import { runMigrations } from '../database/migrate'

describe('exercise insight API with PostgreSQL', () => {
  const databaseUrl = getRuntimeConfig().databaseUrl
  const pool = new Pool({ connectionString: databaseUrl })
  let app: INestApplication
  let token = ''
  let userId = ''
  let otherToken = ''
  let otherUserId = ''

  const workout = (
    exerciseKey: string,
    startedAt: string,
    sets: Array<{ reps: number; load: number; completed: boolean }>,
  ) => ({
    title: `趋势验证 ${exerciseKey}`,
    source: { kind: 'manual' },
    exercises: [
      {
        position: 1,
        exerciseKey,
        name: '同名动作',
        category: 'strength',
        trackingMode: 'reps_load',
        equipment: ['dumbbells'],
        sets: sets.map((set, index) => ({
          position: index + 1,
          kind: 'working',
          reps: set.reps,
          load: set.load,
          loadUnit: 'kg',
          rpe: 7,
          completed: set.completed,
        })),
      },
    ],
    startedAt,
    endedAt: new Date(new Date(startedAt).getTime() + 45 * 60_000).toISOString(),
    timezone: 'Asia/Shanghai',
    painLevel: 0,
    fatigue: 3,
  })

  const createWorkout = (payload: ReturnType<typeof workout>) =>
    request(app.getHttpServer())
      .post('/v1/workouts')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', `insight-${randomUUID()}`)
      .send(payload)
      .expect(201)

  beforeAll(async () => {
    await runMigrations(databaseUrl)
    app = await createApplication(false)
    await app.init()
    const session = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .send({ subject: `exercise-insights-${randomUUID()}` })
      .expect(200)
    token = session.body.accessToken as string
    userId = session.body.userId as string
    const other = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .send({ subject: `exercise-insights-other-${randomUUID()}` })
      .expect(200)
    otherToken = other.body.accessToken as string
    otherUserId = other.body.userId as string
  })

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[userId, otherUserId]])
    await pool.end()
    await app.close()
  })

  it('isolates a stable key, uses completed sets, and recomputes corrections and deletion', async () => {
    const recent = await createWorkout(
      workout('trend_lunge', '2026-08-04T02:00:00.000Z', [
        { reps: 10, load: 10, completed: true },
        { reps: 10, load: 100, completed: false },
      ]),
    )
    const older = await createWorkout(
      workout('trend_lunge', '2026-07-20T02:00:00.000Z', [{ reps: 5, load: 20, completed: true }]),
    )
    await createWorkout(
      workout('trend_lunge', '2026-08-03T02:00:00.000Z', [{ reps: 9, load: 99, completed: false }]),
    )
    await createWorkout(
      workout('different_lunge', '2026-08-04T03:00:00.000Z', [
        { reps: 99, load: 99, completed: true },
      ]),
    )

    const endpoint =
      '/v1/insights/exercises/trend_lunge?timezone=Asia%2FShanghai&at=2026-08-05T12%3A00%3A00.000Z'
    const initial = await request(app.getHttpServer())
      .get(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(initial.body).toMatchObject({
      exerciseKey: 'trend_lunge',
      identity: { name: '同名动作', trackingMode: 'reps_load' },
      hasMore: false,
    })
    expect(initial.body.windows).toEqual([
      expect.objectContaining({
        days: 7,
        sessionCount: 1,
        completedSetCount: 1,
        totalReps: 10,
        volumeKg: 100,
      }),
      expect.objectContaining({ days: 30, sessionCount: 2, totalReps: 15, volumeKg: 200 }),
      expect.objectContaining({ days: 90, sessionCount: 2, totalReps: 15, volumeKg: 200 }),
    ])
    expect(initial.body.series).toHaveLength(2)
    expect(initial.body.windows[2].sessionCount).toBe(initial.body.series.length)
    for (const field of [
      'completedSetCount',
      'totalReps',
      'volumeKg',
      'activeMinutes',
      'distanceKm',
    ]) {
      expect(initial.body.windows[2][field]).toBe(
        initial.body.series.reduce(
          (total: number, point: Record<string, number>) => total + point[field]!,
          0,
        ),
      )
    }
    expect(initial.body.series[0]).toMatchObject({
      workoutId: recent.body.id,
      completedSetCount: 1,
      totalSetCount: 2,
      totalReps: 10,
      volumeKg: 100,
      localDate: '2026-08-04',
    })

    const correctedPayload = workout('trend_lunge', '2026-08-04T02:00:00.000Z', [
      { reps: 10, load: 20, completed: true },
      { reps: 10, load: 100, completed: false },
    ])
    await request(app.getHttpServer())
      .put(`/v1/workouts/${String(recent.body.id)}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...correctedPayload, expectedRevision: 1 })
      .expect(200)

    const corrected = await request(app.getHttpServer())
      .get(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(corrected.body.windows[1]).toMatchObject({ sessionCount: 2, volumeKg: 300 })
    expect(corrected.body.series[0]).toMatchObject({ workoutRevision: 2, volumeKg: 200 })

    await request(app.getHttpServer())
      .delete(`/v1/workouts/${String(older.body.id)}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-expected-revision', '1')
      .expect(204)

    const afterDelete = await request(app.getHttpServer())
      .get(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(afterDelete.body.windows[1]).toMatchObject({ sessionCount: 1, volumeKg: 200 })
    expect(afterDelete.body.series).toHaveLength(1)

    const isolated = await request(app.getHttpServer())
      .get(endpoint)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200)
    expect(isolated.body.identity).toBeNull()
    expect(isolated.body.series).toEqual([])
    expect(
      isolated.body.windows.every((window: { sessionCount: number }) => !window.sessionCount),
    ).toBe(true)

    await request(app.getHttpServer())
      .get('/v1/insights/exercises/%E5%90%8C%E5%90%8D?timezone=Asia%2FShanghai')
      .set('Authorization', `Bearer ${token}`)
      .expect(400)
  })
})
