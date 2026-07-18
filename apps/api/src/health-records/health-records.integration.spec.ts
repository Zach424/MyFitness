import { randomUUID } from 'node:crypto'

import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import request from 'supertest'

import { createApplication } from '../bootstrap'
import { getRuntimeConfig } from '../config'
import { runMigrations } from '../database/migrate'

describe('health-record API with PostgreSQL', () => {
  const databaseUrl = getRuntimeConfig().databaseUrl
  const pool = new Pool({ connectionString: databaseUrl })
  let app: INestApplication
  let accessToken = ''
  let userId = ''
  let otherUserId = ''

  const record = {
    metric: 'body.weight',
    value: 160,
    unit: 'lb',
    source: { kind: 'manual' },
    status: 'confirmed',
    occurredAt: '2026-07-18T07:40:00+08:00',
    timezone: 'Asia/Shanghai',
  }

  beforeAll(async () => {
    await runMigrations(databaseUrl)
    app = await createApplication(false)
    await app.init()
    const session = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .send({ subject: `records-${randomUUID()}` })
      .expect(200)
    accessToken = session.body.accessToken as string
    userId = session.body.userId as string
  })

  afterAll(async () => {
    await pool.query('DELETE FROM health_records WHERE user_id = $1', [userId])
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [
      [userId, otherUserId].filter(Boolean),
    ])
    await pool.end()
    await app.close()
  })

  it('reports API and database readiness', async () => {
    const response = await request(app.getHttpServer()).get('/v1/health').expect(200)

    expect(response.body).toMatchObject({ status: 'ok', database: 'up' })
  })

  it('persists, normalizes, lists and idempotently replays a record', async () => {
    const idempotencyKey = `test-${randomUUID()}`
    const first = await request(app.getHttpServer())
      .post('/v1/health-records')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-idempotency-key', idempotencyKey)
      .send(record)
      .expect(201)

    expect(first.body).toMatchObject({
      userId,
      metric: 'body.weight',
      canonicalValue: 72.5748,
      canonicalUnit: 'kg',
      displayValue: 160,
      displayUnit: 'lb',
      status: 'confirmed',
      revision: 1,
    })

    const replay = await request(app.getHttpServer())
      .post('/v1/health-records')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-idempotency-key', idempotencyKey)
      .send(record)
      .expect(201)
    expect(replay.body.id).toBe(first.body.id)

    await request(app.getHttpServer())
      .post('/v1/health-records')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-idempotency-key', idempotencyKey)
      .send({ ...record, value: 170 })
      .expect(409)

    const list = await request(app.getHttpServer())
      .get('/v1/health-records')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
    expect(list.body.items).toHaveLength(1)
    expect(list.body.items[0].id).toBe(first.body.id)

    const otherSession = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .send({ subject: `records-other-${randomUUID()}` })
      .expect(200)
    otherUserId = otherSession.body.userId as string
    const otherUserList = await request(app.getHttpServer())
      .get('/v1/health-records')
      .set('Authorization', `Bearer ${String(otherSession.body.accessToken)}`)
      .expect(200)
    expect(otherUserList.body.items).toEqual([])

    const updateInput = { ...record, value: 165, expectedRevision: 1 }
    const updated = await request(app.getHttpServer())
      .put(`/v1/health-records/${String(first.body.id)}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(updateInput)
      .expect(200)
    expect(updated.body).toMatchObject({
      id: first.body.id,
      canonicalValue: 74.8427,
      displayValue: 165,
      revision: 2,
    })

    await request(app.getHttpServer())
      .put(`/v1/health-records/${String(first.body.id)}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(updateInput)
      .expect(409)

    await request(app.getHttpServer())
      .put(`/v1/health-records/${String(first.body.id)}`)
      .set('Authorization', `Bearer ${String(otherSession.body.accessToken)}`)
      .send({ ...updateInput, expectedRevision: 2 })
      .expect(404)

    const history = await request(app.getHttpServer())
      .get(`/v1/health-records/${String(first.body.id)}/history`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
    expect(history.body.recordId).toBe(first.body.id)
    expect(history.body.items.map((item: { action: string }) => item.action)).toEqual([
      'updated',
      'created',
    ])
    expect(history.body.items.map((item: { revision: number }) => item.revision)).toEqual([2, 1])

    await request(app.getHttpServer())
      .get(`/v1/health-records/${String(first.body.id)}/history`)
      .set('Authorization', `Bearer ${String(otherSession.body.accessToken)}`)
      .expect(404)

    await request(app.getHttpServer())
      .delete(`/v1/health-records/${String(first.body.id)}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-expected-revision', '2')
      .expect(204)

    const emptyList = await request(app.getHttpServer())
      .get('/v1/health-records')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
    expect(emptyList.body.items).toEqual([])

    const deletedHistory = await request(app.getHttpServer())
      .get(`/v1/health-records/${String(first.body.id)}/history`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
    expect(
      deletedHistory.body.items.map((item: { action: string; revision: number }) => [
        item.action,
        item.revision,
      ]),
    ).toEqual([
      ['deleted', 3],
      ['updated', 2],
      ['created', 1],
    ])

    await request(app.getHttpServer())
      .delete(`/v1/health-records/${String(first.body.id)}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-expected-revision', '3')
      .expect(404)
  })

  it('refuses to persist an AI estimate as confirmed fact', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/health-records')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-idempotency-key', `test-${randomUUID()}`)
      .send({
        ...record,
        source: {
          kind: 'ai_estimate',
          metadata: { modelVersion: 'vision-2026-07', promptVersion: 'food-v1' },
        },
        confidence: 0.72,
        status: 'confirmed',
      })
      .expect(400)

    expect(JSON.stringify(response.body)).toContain(
      'AI estimates must remain candidates until explicit confirmation',
    )
  })

  it('enforces the AI candidate rule inside PostgreSQL', async () => {
    await expect(
      pool.query(
        `
          INSERT INTO health_records (
            id, user_id, metric, canonical_value, canonical_unit,
            display_value, display_unit, source_kind, source_metadata,
            confidence, status, occurred_at, timezone, idempotency_key, request_hash
          )
          VALUES (
            $1, $2, 'body.weight', 72, 'kg',
            72, 'kg', 'ai_estimate', '{"modelVersion":"test","promptVersion":"test"}'::jsonb,
            0.7, 'confirmed', NOW(), 'Asia/Shanghai', $3, repeat('a', 64)
          )
        `,
        [randomUUID(), userId, `db-test-${randomUUID()}`],
      ),
    ).rejects.toMatchObject({ code: '23514' })
  })
})
