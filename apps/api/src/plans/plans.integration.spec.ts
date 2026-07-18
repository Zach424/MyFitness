import { randomUUID } from 'node:crypto'

import type { INestApplication } from '@nestjs/common'
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
    displayName: '计划测试用户',
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
    sessionMinutes: 45,
    equipment: ['dumbbells'],
    dietaryPreferences: ['none'],
  },
  risk: { flags: riskFlags, acknowledged: true },
  consents: {
    terms: { accepted: true, version: '2026-07-18' },
    privacy: { accepted: true, version: '2026-07-18' },
    healthData: { accepted: true, version: '2026-07-18' },
  },
})

describe('weekly plan API with PostgreSQL', () => {
  let app: INestApplication
  let pool: Pool
  const userIds: string[] = []
  let token: string
  let otherToken: string
  let riskToken: string
  let incompleteToken: string

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

    token = await createSession(`plans-${randomUUID()}`)
    otherToken = await createSession(`plans-other-${randomUUID()}`)
    riskToken = await createSession(`plans-risk-${randomUUID()}`)
    incompleteToken = await createSession(`plans-incomplete-${randomUUID()}`)

    await request(app.getHttpServer())
      .put('/v1/me/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send(onboarding())
      .expect(200)
    await request(app.getHttpServer())
      .put('/v1/me/onboarding')
      .set('Authorization', `Bearer ${otherToken}`)
      .send(onboarding())
      .expect(200)
    await request(app.getHttpServer())
      .put('/v1/me/onboarding')
      .set('Authorization', `Bearer ${riskToken}`)
      .send(onboarding(['chest_pain']))
      .expect(200)
  })

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds])
    await pool.end()
    await app.close()
  })

  it('persists generation and accept/modify/skip history with optimistic revisions', async () => {
    const key = `plan-${randomUUID()}`
    const generated = await request(app.getHttpServer())
      .post('/v1/plans/weekly')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', key)
      .send({ weekStart: '2026-07-20' })
      .expect(201)

    expect(generated.body).toMatchObject({
      weekStart: '2026-07-20',
      timezone: 'Asia/Shanghai',
      engineVersion: 'deterministic-v1',
      status: 'draft',
      revision: 1,
    })
    expect(generated.body.days).toHaveLength(7)
    expect(
      generated.body.days
        .filter((day: { session: unknown }) => day.session)
        .every(
          (day: { available: boolean; session: { intensity: string } }) =>
            day.available && day.session.intensity === 'easy',
        ),
    ).toBe(true)
    expect(JSON.stringify(generated.body.nutritionFocuses)).not.toContain('kcal')

    const repeated = await request(app.getHttpServer())
      .post('/v1/plans/weekly')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', key)
      .send({ weekStart: '2026-07-20' })
      .expect(201)
    expect(repeated.body.id).toBe(generated.body.id)

    const activity = generated.body.days
      .flatMap(
        (day: { session: { activities: unknown[] } | null }) => day.session?.activities ?? [],
      )
      .find((candidate: { options: unknown[] }) => candidate.options.length > 1) as {
      id: string
      selectedOptionId: string
      options: { id: string }[]
    }
    const alternative = activity.options.find(
      (candidate) => candidate.id !== activity.selectedOptionId,
    )!

    const modified = await request(app.getHttpServer())
      .put(`/v1/plans/weekly/${generated.body.id}/decision`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        decision: 'modified',
        expectedRevision: 1,
        selections: [{ activityId: activity.id, optionId: alternative.id }],
        note: '选择更熟悉的动作',
      })
      .expect(200)
    expect(modified.body).toMatchObject({ status: 'modified', revision: 2 })

    await request(app.getHttpServer())
      .put(`/v1/plans/weekly/${generated.body.id}/decision`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'accepted', expectedRevision: 1, selections: [] })
      .expect(409)

    const accepted = await request(app.getHttpServer())
      .put(`/v1/plans/weekly/${generated.body.id}/decision`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'accepted', expectedRevision: 2, selections: [] })
      .expect(200)
    expect(accepted.body).toMatchObject({ status: 'accepted', revision: 3 })

    const skipped = await request(app.getHttpServer())
      .put(`/v1/plans/weekly/${generated.body.id}/decision`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        decision: 'skipped',
        expectedRevision: 3,
        selections: [],
        note: '本周行程变化',
      })
      .expect(200)
    expect(skipped.body).toMatchObject({ status: 'skipped', revision: 4 })

    const history = await request(app.getHttpServer())
      .get(`/v1/plans/weekly/${generated.body.id}/history`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(history.body.items.map((item: { action: string }) => item.action)).toEqual([
      'skipped',
      'accepted',
      'modified',
      'generated',
    ])
    expect(history.body.items[0].decisionNote).toBe('本周行程变化')

    const list = await request(app.getHttpServer())
      .get('/v1/plans/weekly')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(list.body.items).toHaveLength(1)

    await request(app.getHttpServer())
      .get(`/v1/plans/weekly/${generated.body.id}/history`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404)
  })

  it('fails closed for missing onboarding and professional-clearance risk', async () => {
    const missing = await request(app.getHttpServer())
      .post('/v1/plans/weekly')
      .set('Authorization', `Bearer ${incompleteToken}`)
      .set('x-idempotency-key', `plan-${randomUUID()}`)
      .send({ weekStart: '2026-07-20' })
      .expect(422)
    expect(missing.body).toMatchObject({ code: 'onboarding_required' })

    const blocked = await request(app.getHttpServer())
      .post('/v1/plans/weekly')
      .set('Authorization', `Bearer ${riskToken}`)
      .set('x-idempotency-key', `plan-${randomUUID()}`)
      .send({ weekStart: '2026-07-20' })
      .expect(422)
    expect(blocked.body).toMatchObject({
      code: 'professional_clearance_required',
      riskFlags: ['chest_pain'],
    })
  })

  it('regenerates changed constraints and blocks unsafe decisions on an existing plan', async () => {
    const generated = await request(app.getHttpServer())
      .post('/v1/plans/weekly')
      .set('Authorization', `Bearer ${otherToken}`)
      .set('x-idempotency-key', `plan-${randomUUID()}`)
      .send({ weekStart: '2026-07-27' })
      .expect(201)

    const revisedOnboarding = onboarding()
    await request(app.getHttpServer())
      .put('/v1/me/onboarding')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        ...revisedOnboarding,
        goal: { ...revisedOnboarding.goal, sessionMinutes: 30 },
        expectedRevision: 1,
      })
      .expect(200)

    const regenerated = await request(app.getHttpServer())
      .post('/v1/plans/weekly')
      .set('Authorization', `Bearer ${otherToken}`)
      .set('x-idempotency-key', `plan-${randomUUID()}`)
      .send({ weekStart: '2026-07-27' })
      .expect(201)
    expect(regenerated.body).toMatchObject({ id: generated.body.id, status: 'draft', revision: 2 })
    expect(
      regenerated.body.days
        .filter((day: { session: unknown }) => day.session)
        .every((day: { session: { plannedMinutes: number } }) => day.session.plannedMinutes === 30),
    ).toBe(true)

    await request(app.getHttpServer())
      .put('/v1/me/onboarding')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ ...onboarding(['chest_pain']), expectedRevision: 2 })
      .expect(200)

    const blockedDecision = await request(app.getHttpServer())
      .put(`/v1/plans/weekly/${generated.body.id}/decision`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ decision: 'accepted', expectedRevision: 2, selections: [] })
      .expect(422)
    expect(blockedDecision.body).toMatchObject({ code: 'professional_clearance_required' })

    const skipped = await request(app.getHttpServer())
      .put(`/v1/plans/weekly/${generated.body.id}/decision`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ decision: 'skipped', expectedRevision: 2, selections: [] })
      .expect(200)
    expect(skipped.body).toMatchObject({ status: 'skipped', revision: 3 })

    const history = await request(app.getHttpServer())
      .get(`/v1/plans/weekly/${generated.body.id}/history`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200)
    expect(history.body.items.map((item: { action: string }) => item.action)).toEqual([
      'skipped',
      'generated',
      'generated',
    ])
  })
})
