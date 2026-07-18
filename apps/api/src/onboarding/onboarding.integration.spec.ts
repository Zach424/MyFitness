import { randomUUID } from 'node:crypto'

import type { INestApplication } from '@nestjs/common'
import { consentVersions } from '@myfitness/contracts'
import { Pool } from 'pg'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApplication } from '../bootstrap'
import { getRuntimeConfig } from '../config'
import { runMigrations } from '../database/migrate'

describe('authentication and onboarding with PostgreSQL', () => {
  const databaseUrl = getRuntimeConfig().databaseUrl
  const pool = new Pool({ connectionString: databaseUrl })
  const subject = `onboarding-${randomUUID()}`
  let app: INestApplication
  let accessToken = ''
  let userId = ''

  const onboarding = {
    adultConfirmed: true,
    profile: {
      displayName: '志庆',
      ageBand: '25_34',
      sexForCalculations: 'unspecified',
      height: { value: 69, unit: 'in' },
      unitSystem: 'metric',
      timezone: 'Asia/Shanghai',
    },
    goal: {
      primaryGoal: 'fitness',
      experience: 'beginner',
      availableDays: ['mon', 'wed', 'sat'],
      sessionMinutes: 45,
      equipment: ['bodyweight', 'dumbbells'],
      dietaryPreferences: ['none'],
    },
    risk: { flags: [], acknowledged: true },
    consents: {
      terms: { accepted: true, version: consentVersions.terms },
      privacy: { accepted: true, version: consentVersions.privacy },
      healthData: { accepted: true, version: consentVersions.healthData },
    },
  }

  beforeAll(async () => {
    await runMigrations(databaseUrl)
    app = await createApplication(false)
    await app.init()
    const response = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .send({ subject })
      .expect(200)
    accessToken = response.body.accessToken as string
    userId = response.body.userId as string
  })

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE id = $1', [userId])
    await pool.end()
    await app.close()
  })

  it('requires a verified bearer session for personal routes', async () => {
    await request(app.getHttpServer()).get('/v1/me/onboarding').expect(401)
    await request(app.getHttpServer())
      .get('/v1/me/onboarding')
      .set('Authorization', 'Bearer invalid')
      .expect(401)
  })

  it('stores only an opaque session hash and reuses the provider identity', async () => {
    const stored = await pool.query<{ token_hash: string }>(
      'SELECT token_hash FROM auth_sessions WHERE user_id = $1 ORDER BY created_at LIMIT 1',
      [userId],
    )
    expect(stored.rows[0]?.token_hash).toHaveLength(64)
    expect(stored.rows[0]?.token_hash).not.toContain(accessToken)

    const second = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .send({ subject })
      .expect(200)
    expect(second.body.userId).toBe(userId)
    expect(second.body.accessToken).not.toBe(accessToken)
  })

  it('persists profile, goals, risk state, consent and optimistic revisions', async () => {
    await request(app.getHttpServer())
      .get('/v1/me/onboarding')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404)

    await request(app.getHttpServer())
      .put('/v1/me/onboarding')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        ...onboarding,
        consents: {
          ...onboarding.consents,
          privacy: { accepted: true, version: 'stale' },
        },
      })
      .expect(400)

    const created = await request(app.getHttpServer())
      .put('/v1/me/onboarding')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(onboarding)
      .expect(200)
    expect(created.body).toMatchObject({
      userId,
      revision: 1,
      profile: { canonicalHeightCm: 175.26 },
      eligibility: { status: 'eligible', riskFlags: [] },
    })
    expect(created.body.consents).toHaveLength(3)

    const loaded = await request(app.getHttpServer())
      .get('/v1/me/onboarding')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
    expect(loaded.body.revision).toBe(1)

    const updated = await request(app.getHttpServer())
      .put('/v1/me/onboarding')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        ...onboarding,
        risk: { flags: ['acute_injury'], acknowledged: true },
        expectedRevision: 1,
      })
      .expect(200)
    expect(updated.body).toMatchObject({
      revision: 2,
      eligibility: {
        status: 'professional_clearance_required',
        riskFlags: ['acute_injury'],
      },
    })

    await request(app.getHttpServer())
      .put('/v1/me/onboarding')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ...onboarding, expectedRevision: 1 })
      .expect(409)

    const consentCount = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM consent_events WHERE user_id = $1',
      [userId],
    )
    expect(Number(consentCount.rows[0]?.count)).toBe(3)
  })

  it('disables the development session issuer in production mode', async () => {
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      await request(app.getHttpServer())
        .post('/v1/auth/dev/session')
        .send({ subject: `production-${randomUUID()}` })
        .expect(404)
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previous
    }
  })
})
