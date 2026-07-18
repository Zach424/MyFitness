import { randomUUID } from 'node:crypto'

import type { INestApplication } from '@nestjs/common'
import { aiPlanConsentVersion } from '@myfitness/contracts'
import { Pool } from 'pg'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApplication } from '../bootstrap'
import { runMigrations } from '../database/migrate'

const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://myfitness:myfitness_local@127.0.0.1:54329/myfitness'

const onboarding = (riskFlags: string[] = []) => ({
  adultConfirmed: true,
  profile: {
    displayName: 'AI 测试用户',
    ageBand: '25_34',
    sexForCalculations: 'unspecified',
    height: { value: 175, unit: 'cm' },
    unitSystem: 'metric',
    timezone: 'Asia/Shanghai',
  },
  goal: {
    primaryGoal: 'habit',
    experience: 'beginner',
    availableDays: ['tue', 'thu', 'sat'],
    sessionMinutes: 35,
    equipment: ['bodyweight'],
    dietaryPreferences: ['none'],
  },
  risk: { flags: riskFlags, acknowledged: true },
  consents: {
    terms: { accepted: true, version: '2026-07-18' },
    privacy: { accepted: true, version: '2026-07-18' },
    healthData: { accepted: true, version: '2026-07-18' },
  },
})

const explanationBody = (revision: number) => ({
  expectedPlanRevision: revision,
  consent: {
    purpose: 'ai_plan_explanation',
    version: aiPlanConsentVersion,
    accepted: true,
  },
})

describe('AI plan explanations with PostgreSQL and fixture worker', () => {
  let app: INestApplication
  let pool: Pool
  let token: string
  let otherToken: string
  let planId: string
  const userIds: string[] = []

  const createSession = async (subject: string) => {
    const response = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .send({ subject })
      .expect(200)
    userIds.push(response.body.userId as string)
    return response.body.accessToken as string
  }

  beforeAll(async () => {
    await runMigrations(databaseUrl)
    pool = new Pool({ connectionString: databaseUrl })
    app = await createApplication(false)
    await app.init()

    token = await createSession(`ai-${randomUUID()}`)
    otherToken = await createSession(`ai-other-${randomUUID()}`)
    for (const accessToken of [token, otherToken]) {
      await request(app.getHttpServer())
        .put('/v1/me/onboarding')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(onboarding())
        .expect(200)
    }

    const plan = await request(app.getHttpServer())
      .post('/v1/plans/weekly')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', `ai-plan-${randomUUID()}`)
      .send({ weekStart: '2026-07-20' })
      .expect(201)
    planId = plan.body.id as string
  })

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds])
    await pool.end()
    await app.close()
  })

  it('records explicit consent, idempotent provenance and owner-only history', async () => {
    const key = `ai-explain-${randomUUID()}`
    const generated = await request(app.getHttpServer())
      .post(`/v1/plans/weekly/${planId}/explanation`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', key)
      .send(explanationBody(1))
      .expect(201)

    expect(generated.body).toMatchObject({
      planId,
      planRevision: 1,
      source: 'fixture',
      provider: 'fixture',
      model: 'fixture-plan-explainer-v1',
      promptVersion: 'plan-explanation-v1',
      validatorVersion: 'plan-explanation-safety-v1',
      failureCode: null,
    })
    expect(generated.body.content.highlights).toHaveLength(3)
    expect(generated.body.safetyNote).toContain('没有被 AI 自动修改')

    const repeated = await request(app.getHttpServer())
      .post(`/v1/plans/weekly/${planId}/explanation`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', key)
      .send(explanationBody(1))
      .expect(201)
    expect(repeated.body.id).toBe(generated.body.id)

    const history = await request(app.getHttpServer())
      .get(`/v1/plans/weekly/${planId}/explanations`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(history.body.items).toHaveLength(1)

    await request(app.getHttpServer())
      .get(`/v1/plans/weekly/${planId}/explanations`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404)

    const stored = await pool.query<{
      input_fingerprint: string
      content: unknown
      consent_count: string
    }>(
      `
        SELECT run.input_fingerprint, run.content,
          (SELECT COUNT(*)::text FROM consent_events
           WHERE user_id = run.user_id AND purpose = 'ai_plan_explanation') AS consent_count
        FROM ai_explanation_runs AS run
        WHERE run.id = $1
      `,
      [generated.body.id],
    )
    expect(stored.rows[0]?.input_fingerprint).toHaveLength(64)
    expect(Number(stored.rows[0]?.consent_count)).toBe(1)
    expect(JSON.stringify(stored.rows[0]?.content)).not.toContain('AI 测试用户')
  })

  it('uses a deterministic fallback when the worker boundary is unavailable', async () => {
    const previousUrl = process.env.AI_SERVICE_URL
    process.env.AI_SERVICE_URL = 'http://127.0.0.1:1'
    const fallbackApp = await createApplication(false)
    await fallbackApp.init()
    try {
      const response = await request(fallbackApp.getHttpServer())
        .post(`/v1/plans/weekly/${planId}/explanation`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-idempotency-key', `ai-fallback-${randomUUID()}`)
        .send(explanationBody(1))
        .expect(201)
      expect(response.body).toMatchObject({
        source: 'fallback',
        provider: 'unavailable',
        model: 'worker-unavailable',
        failureCode: 'provider_unavailable',
      })
      expect(JSON.stringify(response.body.content)).not.toContain('kcal')
    } finally {
      await fallbackApp.close()
      if (previousUrl === undefined) delete process.env.AI_SERVICE_URL
      else process.env.AI_SERVICE_URL = previousUrl
    }
  })

  it('fails closed for absent consent, stale plans and current risk flags', async () => {
    await request(app.getHttpServer())
      .post(`/v1/plans/weekly/${planId}/explanation`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', `ai-invalid-${randomUUID()}`)
      .send({
        expectedPlanRevision: 1,
        consent: {
          purpose: 'ai_plan_explanation',
          version: aiPlanConsentVersion,
          accepted: false,
        },
      })
      .expect(400)

    await request(app.getHttpServer())
      .post(`/v1/plans/weekly/${planId}/explanation`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', `ai-stale-${randomUUID()}`)
      .send(explanationBody(99))
      .expect(409)

    const riskCandidate = await request(app.getHttpServer())
      .post('/v1/plans/weekly')
      .set('Authorization', `Bearer ${otherToken}`)
      .set('x-idempotency-key', `ai-risk-plan-${randomUUID()}`)
      .send({ weekStart: '2026-07-20' })
      .expect(201)
    await request(app.getHttpServer())
      .put('/v1/me/onboarding')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ ...onboarding(['chest_pain']), expectedRevision: 1 })
      .expect(200)
    const blocked = await request(app.getHttpServer())
      .post(`/v1/plans/weekly/${riskCandidate.body.id}/explanation`)
      .set('Authorization', `Bearer ${otherToken}`)
      .set('x-idempotency-key', `ai-risk-${randomUUID()}`)
      .send(explanationBody(1))
      .expect(422)
    expect(blocked.body).toMatchObject({ code: 'professional_clearance_required' })
  })
})
