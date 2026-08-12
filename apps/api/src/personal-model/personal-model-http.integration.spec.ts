import { randomUUID } from 'node:crypto'

import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Pool } from 'pg'
import request from 'supertest'

import { createApplication } from '../bootstrap'
import { getRuntimeConfig } from '../config'
import { runMigrations } from '../database/migrate'
import {
  PersonalModelCurrentSubjectUnavailableError,
  PersonalModelCurrentSubjectViewService,
} from './personal-model-current-subject-view'
import { PersonalModelRepository } from './personal-model.repository'

describe('personal model current-subject HTTP boundary with PostgreSQL', () => {
  const databaseUrl = getRuntimeConfig().databaseUrl
  const pool = new Pool({ connectionString: databaseUrl })
  const owners = new Set<string>()
  let app: INestApplication
  let repository: PersonalModelRepository
  let viewService: PersonalModelCurrentSubjectViewService
  let token = ''
  let userId = ''
  let otherToken = ''
  let otherUserId = ''

  const createSession = async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .send({ subject: `personal-model-http-${randomUUID()}` })
      .expect(200)
    const owner = {
      token: response.body.accessToken as string,
      userId: response.body.userId as string,
    }
    owners.add(owner.userId)
    return owner
  }

  beforeAll(async () => {
    await runMigrations(databaseUrl)
    app = await createApplication(false)
    await app.init()
    repository = app.get(PersonalModelRepository)
    viewService = app.get(PersonalModelCurrentSubjectViewService)
    const owner = await createSession()
    token = owner.token
    userId = owner.userId
    await pool.query(
      `
        WITH account AS (
          UPDATE users
          SET created_at = clock_timestamp() - INTERVAL '4 weeks'
          WHERE id = $1
          RETURNING id, created_at
        )
        INSERT INTO user_profiles (
          user_id, display_name, age_band, sex_for_calculations,
          height_cm, display_height, display_height_unit, unit_system,
          timezone, adult_confirmed_at, risk_status, risk_flags,
          revision, created_at, updated_at
        )
        SELECT
          id, 'HTTP current subject owner', '25_34', 'unspecified',
          170, 170, 'cm', 'metric',
          'Asia/Shanghai', created_at, 'eligible', '{}',
          1, created_at, clock_timestamp()
        FROM account
      `,
      [userId],
    )
    const otherOwner = await createSession()
    otherToken = otherOwner.token
    otherUserId = otherOwner.userId
  })

  afterAll(async () => {
    for (const owner of owners) {
      await pool.query('DELETE FROM users WHERE id = $1', [owner])
    }
    await pool.end()
    await app.close()
  })

  it('requires a valid Bearer principal', async () => {
    await request(app.getHttpServer())
      .get('/v1/personal-model/subjects/training.recorded_frequency/current')
      .expect('Cache-Control', 'private, no-store')
      .expect(401)

    await request(app.getHttpServer())
      .post('/v1/personal-model/items/22222222-2222-4222-8222-222222222222/revisions/1/feedback')
      .send({})
      .expect('Cache-Control', 'private, no-store')
      .expect(401)
  })

  it('returns one uninformative unavailable boundary without exposing authority state', async () => {
    const read = vi
      .spyOn(viewService, 'read')
      .mockRejectedValueOnce(new PersonalModelCurrentSubjectUnavailableError())

    const response = await request(app.getHttpServer())
      .get('/v1/personal-model/subjects/training.recorded_frequency/current')
      .set('Authorization', `Bearer ${token}`)
      .expect('Cache-Control', 'private, no-store')
      .expect(404)

    expect(response.body).toMatchObject({ statusCode: 404, message: 'Not Found' })
    expect(JSON.stringify(response.body)).not.toContain('owner')
    expect(JSON.stringify(response.body)).not.toContain('disabled')
    expect(JSON.stringify(response.body)).not.toContain('deletion')
    expect(read).toHaveBeenCalledWith(userId, 'training.recorded_frequency')
  })

  it('keeps internal conflicts as no-store server failures', async () => {
    vi.spyOn(viewService, 'read').mockRejectedValueOnce(new Error('ambiguous current generation'))

    const response = await request(app.getHttpServer())
      .get('/v1/personal-model/subjects/training.recorded_frequency/current')
      .set('Authorization', `Bearer ${token}`)
      .expect('Cache-Control', 'private, no-store')
      .expect(500)

    expect(response.body).toMatchObject({ statusCode: 500, message: 'Internal server error' })
    expect(JSON.stringify(response.body)).not.toContain('ambiguous current generation')
  })

  it('rejects unsupported subjects without querying a fallback subject', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/personal-model/subjects/training.unknown/current')
      .set('Authorization', `Bearer ${token}`)
      .expect('Cache-Control', 'private, no-store')
      .expect(400)

    expect(response.body).toMatchObject({ message: 'personal model subject is invalid' })
  })

  it('returns an owner-free explicit empty view for an active owner', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/personal-model/subjects/training.recorded_session_duration/current')
      .set('Authorization', `Bearer ${token}`)
      .expect('Cache-Control', 'private, no-store')
      .expect(200)

    expect(response.body).toEqual({
      schemaVersion: 'personal-model-current-subject-view-v1',
      subjectKey: 'training.recorded_session_duration',
      current: null,
    })
    expect(JSON.stringify(response.body)).not.toContain(userId)
  })

  it('returns only the authenticated owner current item and hides internal provenance', async () => {
    const time = await pool.query<{ started_at: Date; ended_at: Date }>(`
      SELECT
        (
          DATE_TRUNC('week', clock_timestamp() AT TIME ZONE 'Asia/Shanghai')
          - INTERVAL '1 week' + INTERVAL '10 hours'
        ) AT TIME ZONE 'Asia/Shanghai' AS started_at,
        (
          DATE_TRUNC('week', clock_timestamp() AT TIME ZONE 'Asia/Shanghai')
          - INTERVAL '1 week' + INTERVAL '10 hours 45 minutes'
        ) AT TIME ZONE 'Asia/Shanghai' AS ended_at
    `)
    const occurred = time.rows[0]!
    await request(app.getHttpServer())
      .post('/v1/workouts')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', `personal-model-http-${randomUUID()}`)
      .send({
        title: '当前主题接口训练',
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
        startedAt: occurred.started_at.toISOString(),
        endedAt: occurred.ended_at.toISOString(),
        timezone: 'Asia/Shanghai',
        painLevel: 0,
        fatigue: 3,
      })
      .expect(201)
    const created = await repository.refreshRecordedSessionDuration(userId)

    const own = await request(app.getHttpServer())
      .get('/v1/personal-model/subjects/training.recorded_session_duration/current')
      .set('Authorization', `Bearer ${token}`)
      .expect('Cache-Control', 'private, no-store')
      .expect(200)
    expect(own.body.current).toMatchObject({
      itemId: created.revision.itemId,
      generation: 1,
      revision: 1,
      claim: { medianMinutes: 45 },
      evidence: { qualifiedCount: 1, supportingCount: 1 },
    })
    const serialized = JSON.stringify(own.body)
    expect(serialized).not.toContain(userId)
    expect(serialized).not.toContain(created.revision.id)
    expect(serialized).not.toContain('references')
    expect(serialized).not.toContain('Fingerprint')

    const other = await request(app.getHttpServer())
      .get('/v1/personal-model/subjects/training.recorded_session_duration/current')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect('Cache-Control', 'private, no-store')
      .expect(200)
    expect(other.body.current).toBeNull()
    expect(JSON.stringify(other.body)).not.toContain(otherUserId)
    expect(JSON.stringify(other.body)).not.toContain(created.revision.itemId)

    const feedbackRequest = {
      schemaVersion: 'personal-model-feedback-write-request-v1',
      eventId: randomUUID(),
      choice: 'uncertain',
      reasonCode: 'evidence_missing',
      note: null,
      contextValidUntil: null,
    }
    const feedbackPath = `/v1/personal-model/items/${created.revision.itemId}/revisions/1/feedback`
    const accepted = await request(app.getHttpServer())
      .post(feedbackPath)
      .set('Authorization', `Bearer ${token}`)
      .send(feedbackRequest)
      .expect('Cache-Control', 'private, no-store')
      .expect(200)
    expect(accepted.body).toMatchObject({
      schemaVersion: 'personal-model-feedback-write-response-v1',
      outcome: 'revised',
      eventId: feedbackRequest.eventId,
      itemId: created.revision.itemId,
      targetRevision: 1,
      currentRevision: 2,
      choice: 'uncertain',
      feedbackState: 'uncertain',
      noOpReason: null,
    })
    expect(JSON.stringify(accepted.body)).not.toContain(userId)
    expect(JSON.stringify(accepted.body)).not.toContain('evidence')
    expect(JSON.stringify(accepted.body)).not.toContain('Fingerprint')

    const replay = await request(app.getHttpServer())
      .post(feedbackPath)
      .set('Authorization', `Bearer ${token}`)
      .send(feedbackRequest)
      .expect('Cache-Control', 'private, no-store')
      .expect(200)
    expect(replay.body).toEqual(accepted.body)

    await request(app.getHttpServer())
      .post(feedbackPath)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...feedbackRequest, choice: 'matches_me' })
      .expect('Cache-Control', 'private, no-store')
      .expect(409)
    await request(app.getHttpServer())
      .post(feedbackPath)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...feedbackRequest, eventId: randomUUID() })
      .expect('Cache-Control', 'private, no-store')
      .expect(409)
    await request(app.getHttpServer())
      .post(feedbackPath)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ ...feedbackRequest, eventId: randomUUID() })
      .expect('Cache-Control', 'private, no-store')
      .expect(404)
  })
})
