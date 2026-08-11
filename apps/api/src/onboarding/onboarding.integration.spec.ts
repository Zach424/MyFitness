import { randomUUID } from 'node:crypto'

import type { INestApplication } from '@nestjs/common'
import { consentVersions, onboardingGoalRevisionSnapshotSchema } from '@myfitness/contracts'
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
        goal: {
          ...onboarding.goal,
          availableDays: ['tue', 'thu'],
          sessionMinutes: 60,
        },
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
      goal: { availableDays: ['tue', 'thu'], sessionMinutes: 60 },
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

    const history = await pool.query<{
      goal_id: string
      revision: number
      previous_revision: number | null
      action: 'created' | 'updated'
      history_coverage: 'complete'
      snapshot: {
        goalId: string
        ownerUserId: string
        revision: number
        action: string
        historyCoverage: string
        goal: { availableDays: string[]; sessionMinutes: number }
      }
    }>(
      `SELECT goal_id, revision, previous_revision, action, history_coverage, snapshot
       FROM user_goal_revisions
       WHERE user_id = $1
       ORDER BY revision`,
      [userId],
    )
    expect(history.rows).toHaveLength(2)
    expect(
      history.rows.map((revision) => onboardingGoalRevisionSnapshotSchema.parse(revision.snapshot)),
    ).toHaveLength(2)
    expect(history.rows.map((revision) => revision.revision)).toEqual([1, 2])
    expect(history.rows.map((revision) => revision.action)).toEqual(['created', 'updated'])
    expect(history.rows.map((revision) => revision.previous_revision)).toEqual([null, 1])
    expect(history.rows.map((revision) => revision.history_coverage)).toEqual([
      'complete',
      'complete',
    ])
    expect(new Set(history.rows.map((revision) => revision.goal_id)).size).toBe(1)
    expect(history.rows[0]?.snapshot).toMatchObject({
      goalId: history.rows[0]?.goal_id,
      ownerUserId: userId,
      revision: 1,
      action: 'created',
      historyCoverage: 'complete',
      goal: { availableDays: ['mon', 'wed', 'sat'], sessionMinutes: 45 },
    })
    expect(history.rows[1]?.snapshot).toMatchObject({
      goalId: history.rows[0]?.goal_id,
      ownerUserId: userId,
      revision: 2,
      action: 'updated',
      historyCoverage: 'complete',
      goal: { availableDays: ['tue', 'thu'], sessionMinutes: 60 },
    })
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

  it('rejects unpublished or mutable goal history and preserves account erasure', async () => {
    await expect(
      pool.query(
        "UPDATE user_goal_revisions SET primary_goal = 'habit' WHERE user_id = $1 AND revision = 1",
        [userId],
      ),
    ).rejects.toMatchObject({ code: 'P0001' })
    await expect(
      pool.query('DELETE FROM user_goal_revisions WHERE user_id = $1 AND revision = 1', [userId]),
    ).rejects.toMatchObject({ code: 'P0001' })

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        'UPDATE user_profiles SET revision = revision + 1, updated_at = NOW() WHERE user_id = $1',
        [userId],
      )
      await client.query(
        `UPDATE user_goals
         SET revision = revision + 1, session_minutes = 75, updated_at = NOW()
         WHERE user_id = $1`,
        [userId],
      )
      await expect(client.query('COMMIT')).rejects.toMatchObject({ code: 'P0001' })
    } finally {
      await client.query('ROLLBACK').catch(() => undefined)
      client.release()
    }

    const current = await pool.query<{ revision: number; session_minutes: number }>(
      'SELECT revision, session_minutes FROM user_goals WHERE user_id = $1',
      [userId],
    )
    expect(current.rows[0]).toEqual({ revision: 2, session_minutes: 60 })

    await pool.query('DELETE FROM users WHERE id = $1', [userId])
    const remaining = await pool.query<{ current_count: string; history_count: string }>(
      `SELECT
         (SELECT COUNT(*) FROM user_goals WHERE user_id = $1)::text AS current_count,
         (SELECT COUNT(*) FROM user_goal_revisions WHERE user_id = $1)::text AS history_count`,
      [userId],
    )
    expect(remaining.rows[0]).toEqual({ current_count: '0', history_count: '0' })
  })
})
