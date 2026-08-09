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
  let evidenceToken: string

  const createSession = async (subject: string) => {
    const response = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .send({ subject })
      .expect(200)
    userIds.push(response.body.userId as string)
    return response.body.accessToken as string
  }

  const addModerateRecoveryEvidence = async (accessToken: string, at: number) => {
    const records = [
      ...Array.from({ length: 7 }, (_, dayIndex) =>
        (
          [
            ['recovery.energy', 3],
            ['recovery.sleep_quality', 3],
            ['recovery.stress', 3],
          ] as const
        ).map(([metric, value]) => ({
          metric,
          value,
          occurredAt: new Date(at - (dayIndex + 8) * 86_400_000).toISOString(),
        })),
      ).flat(),
      ...Array.from({ length: 3 }, (_, dayIndex) =>
        (
          [
            ['recovery.energy', 5],
            ['recovery.sleep_quality', 5],
            ['recovery.stress', 1],
          ] as const
        ).map(([metric, value]) => ({
          metric,
          value,
          occurredAt: new Date(at - dayIndex * 86_400_000).toISOString(),
        })),
      ).flat(),
    ]
    await Promise.all(
      records.map(({ metric, value, occurredAt }) =>
        request(app.getHttpServer())
          .post('/v1/health-records')
          .set('Authorization', `Bearer ${accessToken}`)
          .set('x-idempotency-key', `record-${randomUUID()}`)
          .send({
            metric,
            value,
            unit: 'score_1_5',
            source: { kind: 'manual' },
            status: 'confirmed',
            occurredAt,
            timezone: 'Asia/Shanghai',
          })
          .expect(201),
      ),
    )
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
    evidenceToken = await createSession(`plans-evidence-${randomUUID()}`)

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
    await request(app.getHttpServer())
      .put('/v1/me/onboarding')
      .set('Authorization', `Bearer ${evidenceToken}`)
      .send(onboarding())
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

    const firstPage = await request(app.getHttpServer())
      .get(`/v1/plans/weekly/${generated.body.id}/history`)
      .query({ limit: 2 })
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(firstPage.body.items.map((item: { revision: number }) => item.revision)).toEqual([4, 3])
    expect(firstPage.body.items[0].decisionNote).toBe('本周行程变化')
    expect(firstPage.body.nextCursor).toEqual(expect.any(String))

    await request(app.getHttpServer())
      .put(`/v1/plans/weekly/${generated.body.id}/decision`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'accepted', expectedRevision: 4, selections: [] })
      .expect(200)

    const secondPage = await request(app.getHttpServer())
      .get(`/v1/plans/weekly/${generated.body.id}/history`)
      .query({ limit: 2, cursor: firstPage.body.nextCursor })
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(secondPage.body.items.map((item: { revision: number }) => item.revision)).toEqual([2, 1])
    expect(secondPage.body.nextCursor).toBeNull()

    const refreshedHead = await request(app.getHttpServer())
      .get(`/v1/plans/weekly/${generated.body.id}/history`)
      .query({ limit: 2 })
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(refreshedHead.body.items.map((item: { revision: number }) => item.revision)).toEqual([
      5, 4,
    ])

    const missingAnchor = Buffer.from(
      JSON.stringify({ v: 1, id: generated.body.id, revision: 999 }),
    ).toString('base64url')
    await request(app.getHttpServer())
      .get(`/v1/plans/weekly/${generated.body.id}/history`)
      .query({ cursor: missingAnchor })
      .set('Authorization', `Bearer ${token}`)
      .expect(400)
    await request(app.getHttpServer())
      .get(`/v1/plans/weekly/${randomUUID()}/history`)
      .query({ cursor: firstPage.body.nextCursor })
      .set('Authorization', `Bearer ${token}`)
      .expect(400)
    await request(app.getHttpServer())
      .get(`/v1/plans/weekly/${generated.body.id}/history`)
      .query({ unexpected: 'value' })
      .set('Authorization', `Bearer ${token}`)
      .expect(400)

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

  it('projects an evidence-bound post-adoption review without causal or inferred adherence claims', async () => {
    const outcomeToken = await createSession(`plans-outcome-${randomUUID()}`)
    await request(app.getHttpServer())
      .put('/v1/me/onboarding')
      .set('Authorization', `Bearer ${outcomeToken}`)
      .send(onboarding())
      .expect(200)
    await addModerateRecoveryEvidence(outcomeToken, Date.now() - 60_000)

    const generated = await request(app.getHttpServer())
      .post('/v1/plans/weekly')
      .set('Authorization', `Bearer ${outcomeToken}`)
      .set('x-idempotency-key', `plan-${randomUUID()}`)
      .send({ weekStart: '2026-08-10' })
      .expect(201)
    expect(generated.body.evidence.recoveryState).toMatchObject({
      policyVersion: 'subjective-recovery-state-v1',
      confidence: 'moderate',
    })
    expect(generated.body.evidence.recoveryState.evidence.length).toBeGreaterThan(0)

    const activity = generated.body.days
      .flatMap(
        (day: { session: { activities: unknown[] } | null }) => day.session?.activities ?? [],
      )
      .find((candidate: { options: unknown[] }) => candidate.options.length > 1) as {
      id: string
      selectedOptionId: string
      options: { id: string; title: string }[]
    }
    const alternative = activity.options.find((option) => option.id !== activity.selectedOptionId)!
    const modified = await request(app.getHttpServer())
      .put(`/v1/plans/weekly/${generated.body.id}/decision`)
      .set('Authorization', `Bearer ${outcomeToken}`)
      .send({
        decision: 'modified',
        expectedRevision: 1,
        selections: [{ activityId: activity.id, optionId: alternative.id }],
      })
      .expect(200)
    const accepted = await request(app.getHttpServer())
      .put(`/v1/plans/weekly/${generated.body.id}/decision`)
      .set('Authorization', `Bearer ${outcomeToken}`)
      .send({ decision: 'accepted', expectedRevision: modified.body.revision, selections: [] })
      .expect(200)

    const postAdoptionRecoveryAt = new Date().toISOString()
    const confirmedRecovery = await request(app.getHttpServer())
      .post('/v1/health-records')
      .set('Authorization', `Bearer ${outcomeToken}`)
      .set('x-idempotency-key', `record-${randomUUID()}`)
      .send({
        metric: 'recovery.soreness',
        value: 2,
        unit: 'score_1_5',
        source: { kind: 'manual' },
        status: 'confirmed',
        occurredAt: postAdoptionRecoveryAt,
        timezone: 'Asia/Shanghai',
      })
      .expect(201)
    await request(app.getHttpServer())
      .post('/v1/health-records')
      .set('Authorization', `Bearer ${outcomeToken}`)
      .set('x-idempotency-key', `record-${randomUUID()}`)
      .send({
        metric: 'recovery.energy',
        value: 4,
        unit: 'score_1_5',
        source: {
          kind: 'ai_estimate',
          metadata: { modelVersion: 'fixture-v1', promptVersion: 'fixture-v1' },
        },
        confidence: 0.7,
        status: 'candidate',
        occurredAt: new Date().toISOString(),
        timezone: 'Asia/Shanghai',
      })
      .expect(201)

    const workoutAt = new Date().toISOString()
    const workout = await request(app.getHttpServer())
      .post('/v1/workouts')
      .set('Authorization', `Bearer ${outcomeToken}`)
      .set('x-idempotency-key', `workout-${randomUUID()}`)
      .send({
        title: '采用后的确认训练',
        source: { kind: 'manual' },
        exercises: [
          {
            position: 1,
            exerciseKey: 'chair_squat',
            name: '椅子深蹲',
            category: 'strength',
            sets: [{ position: 1, kind: 'working', reps: 8, completed: true }],
          },
        ],
        startedAt: workoutAt,
        endedAt: workoutAt,
        timezone: 'Asia/Shanghai',
        painLevel: 0,
        fatigue: 2,
      })
      .expect(201)
    const sessionDate = accepted.body.days.find((day: { session: unknown }) => day.session)
      .date as string
    const link = await request(app.getHttpServer())
      .post(`/v1/plans/weekly/${generated.body.id}/session-links`)
      .set('Authorization', `Bearer ${outcomeToken}`)
      .send({
        expectedPlanRevision: accepted.body.revision,
        sessionDate,
        workoutId: workout.body.id,
        expectedWorkoutRevision: workout.body.revision,
      })
      .expect(201)

    const list = await request(app.getHttpServer())
      .get('/v1/plans/weekly')
      .set('Authorization', `Bearer ${outcomeToken}`)
      .expect(200)
    const review = list.body.items[0].outcomeReview
    expect(review).toMatchObject({
      policyVersion: 'plan-outcome-review-v1',
      planId: generated.body.id,
      planRevision: accepted.body.revision,
      followUpState: 'observed',
      observationWindow: { state: 'open' },
      recoveryObservationTotal: 1,
      withdrawnEvidence: { workoutLinkCount: 0, recoveryRecordCount: 0 },
      planningEvidence: {
        recoveryState: { policyVersion: 'subjective-recovery-state-v1' },
      },
    })
    expect(review.adjustments).toEqual([
      expect.objectContaining({
        activityId: activity.id,
        adopted: { id: alternative.id, title: alternative.title },
      }),
    ])
    expect(review.linkedWorkouts).toEqual([
      expect.objectContaining({ id: link.body.id, workoutId: workout.body.id }),
    ])
    expect(review.recoveryObservations).toEqual([
      expect.objectContaining({
        recordId: confirmedRecovery.body.id,
        revision: confirmedRecovery.body.revision,
        sourceKind: 'manual',
      }),
    ])
    expect(review.limitations.join(' ')).toContain('不能单独证明计划造成了变化')
    expect(JSON.stringify(review)).not.toContain('ai_estimate')
    expect(JSON.stringify(review)).not.toContain('adherence')

    await request(app.getHttpServer())
      .delete(`/v1/plans/weekly/${generated.body.id}/session-links/${link.body.id}`)
      .set('Authorization', `Bearer ${outcomeToken}`)
      .set('x-expected-revision', String(link.body.revision))
      .expect(200)
    await request(app.getHttpServer())
      .delete(`/v1/health-records/${confirmedRecovery.body.id}`)
      .set('Authorization', `Bearer ${outcomeToken}`)
      .set('x-expected-revision', String(confirmedRecovery.body.revision))
      .expect(204)
    await request(app.getHttpServer())
      .put(`/v1/plans/weekly/${generated.body.id}/decision`)
      .set('Authorization', `Bearer ${outcomeToken}`)
      .send({ decision: 'skipped', expectedRevision: accepted.body.revision, selections: [] })
      .expect(200)

    const noCurrentReview = await request(app.getHttpServer())
      .get('/v1/plans/weekly')
      .set('Authorization', `Bearer ${outcomeToken}`)
      .expect(200)
    expect(noCurrentReview.body.items[0].outcomeReview).toBeNull()

    const historicalReview = await request(app.getHttpServer())
      .get(`/v1/plans/weekly/${generated.body.id}/history/${accepted.body.revision}/outcome`)
      .set('Authorization', `Bearer ${outcomeToken}`)
      .expect('Cache-Control', 'private, no-store')
      .expect(200)
    expect(historicalReview.body).toMatchObject({
      planId: generated.body.id,
      planRevision: accepted.body.revision,
      followUpState: 'unknown',
      recoveryObservationTotal: 0,
      linkedWorkouts: [],
      recoveryObservations: [],
      withdrawnEvidence: { workoutLinkCount: 1, recoveryRecordCount: 1 },
    })
    expect(historicalReview.body.adjustments).toEqual(review.adjustments)
    expect(historicalReview.body.limitations.join(' ')).toContain('撤销事实不再构成后续证据')

    await request(app.getHttpServer())
      .get(`/v1/plans/weekly/${generated.body.id}/history/${accepted.body.revision}/outcome`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404)
    await request(app.getHttpServer())
      .get(`/v1/plans/weekly/${generated.body.id}/history/${modified.body.revision}/outcome`)
      .set('Authorization', `Bearer ${outcomeToken}`)
      .expect(404)
  })

  it('links only explicit owner-selected current revisions and preserves closure history', async () => {
    const generated = await request(app.getHttpServer())
      .post('/v1/plans/weekly')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', `plan-${randomUUID()}`)
      .send({ weekStart: '2026-06-15' })
      .expect(201)
    const sessionDate = generated.body.days.find((day: { session: unknown }) => day.session)
      .date as string
    const workoutInput = {
      title: '实际完成的自选训练',
      source: { kind: 'manual' },
      exercises: [
        {
          position: 1,
          exerciseKey: 'goblet_squat',
          name: '高脚杯深蹲',
          category: 'strength',
          sets: [{ position: 1, kind: 'working', reps: 8, completed: true }],
        },
      ],
      startedAt: `${sessionDate}T10:00:00+08:00`,
      endedAt: `${sessionDate}T10:30:00+08:00`,
      timezone: 'Asia/Shanghai',
      painLevel: 0,
      fatigue: 2,
    }
    const workout = await request(app.getHttpServer())
      .post('/v1/workouts')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', `workout-${randomUUID()}`)
      .send(workoutInput)
      .expect(201)
    const foreignWorkout = await request(app.getHttpServer())
      .post('/v1/workouts')
      .set('Authorization', `Bearer ${otherToken}`)
      .set('x-idempotency-key', `workout-${randomUUID()}`)
      .send(workoutInput)
      .expect(201)

    await request(app.getHttpServer())
      .post(`/v1/plans/weekly/${generated.body.id}/session-links`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        expectedPlanRevision: 1,
        sessionDate,
        workoutId: workout.body.id,
        expectedWorkoutRevision: 1,
      })
      .expect(422)

    const accepted = await request(app.getHttpServer())
      .put(`/v1/plans/weekly/${generated.body.id}/decision`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'accepted', expectedRevision: 1, selections: [] })
      .expect(200)

    await request(app.getHttpServer())
      .post('/v1/health-records')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', `record-${randomUUID()}`)
      .send({
        metric: 'recovery.energy',
        value: 5,
        unit: 'score_1_5',
        source: { kind: 'manual' },
        status: 'confirmed',
        occurredAt: new Date().toISOString(),
        timezone: 'Asia/Shanghai',
      })
      .expect(201)
    await addModerateRecoveryEvidence(token, Date.now())
    const evidenceStaleLink = await request(app.getHttpServer())
      .post(`/v1/plans/weekly/${generated.body.id}/session-links`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        expectedPlanRevision: accepted.body.revision,
        sessionDate,
        workoutId: workout.body.id,
        expectedWorkoutRevision: 1,
      })
      .expect(409)
    expect(evidenceStaleLink.body).toMatchObject({ code: 'plan_evidence_changed' })

    const regenerated = await request(app.getHttpServer())
      .post('/v1/plans/weekly')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', `plan-${randomUUID()}`)
      .send({ weekStart: '2026-06-15' })
      .expect(201)
    const linkablePlan = await request(app.getHttpServer())
      .put(`/v1/plans/weekly/${generated.body.id}/decision`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'accepted', expectedRevision: regenerated.body.revision, selections: [] })
      .expect(200)

    await request(app.getHttpServer())
      .post(`/v1/plans/weekly/${generated.body.id}/session-links`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        expectedPlanRevision: 1,
        sessionDate,
        workoutId: workout.body.id,
        expectedWorkoutRevision: 1,
      })
      .expect(409)
    await request(app.getHttpServer())
      .post(`/v1/plans/weekly/${generated.body.id}/session-links`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        expectedPlanRevision: linkablePlan.body.revision,
        sessionDate,
        workoutId: foreignWorkout.body.id,
        expectedWorkoutRevision: 1,
      })
      .expect(404)
    await request(app.getHttpServer())
      .post(`/v1/plans/weekly/${generated.body.id}/session-links`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        expectedPlanRevision: linkablePlan.body.revision,
        sessionDate,
        workoutId: foreignWorkout.body.id,
        expectedWorkoutRevision: 1,
      })
      .expect(404)

    const linked = await request(app.getHttpServer())
      .post(`/v1/plans/weekly/${generated.body.id}/session-links`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        expectedPlanRevision: linkablePlan.body.revision,
        sessionDate,
        workoutId: workout.body.id,
        expectedWorkoutRevision: 1,
      })
      .expect(201)
    expect(linked.body).toMatchObject({
      planId: generated.body.id,
      planRevision: linkablePlan.body.revision,
      sessionDate,
      workoutId: workout.body.id,
      workoutRevision: 1,
      currentWorkoutRevision: 1,
      revision: 1,
    })

    const replay = await request(app.getHttpServer())
      .post(`/v1/plans/weekly/${generated.body.id}/session-links`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        expectedPlanRevision: linkablePlan.body.revision,
        sessionDate,
        workoutId: workout.body.id,
        expectedWorkoutRevision: 1,
      })
      .expect(201)
    expect(replay.body.id).toBe(linked.body.id)

    const updatedWorkout = await request(app.getHttpServer())
      .put(`/v1/workouts/${workout.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...workoutInput, title: '修订后的实际训练', expectedRevision: 1 })
      .expect(200)
    const linkedList = await request(app.getHttpServer())
      .get('/v1/plans/weekly')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    const linkedListPlan = linkedList.body.items.find(
      (item: { id: string }) => item.id === generated.body.id,
    )
    expect(linkedListPlan.sessionLinks[0]).toMatchObject({
      id: linked.body.id,
      workoutRevision: 1,
      currentWorkoutRevision: 2,
      workoutTitle: '修订后的实际训练',
    })

    await request(app.getHttpServer())
      .delete(`/v1/plans/weekly/${generated.body.id}/session-links/${linked.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-expected-revision', '1')
      .expect(200)
    const unlinkedList = await request(app.getHttpServer())
      .get('/v1/plans/weekly')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    const unlinkedListPlan = unlinkedList.body.items.find(
      (item: { id: string }) => item.id === generated.body.id,
    )
    expect(unlinkedListPlan.sessionLinks).toEqual([])

    const relinked = await request(app.getHttpServer())
      .post(`/v1/plans/weekly/${generated.body.id}/session-links`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        expectedPlanRevision: linkablePlan.body.revision,
        sessionDate,
        workoutId: workout.body.id,
        expectedWorkoutRevision: updatedWorkout.body.revision,
      })
      .expect(201)
    expect(relinked.body.id).not.toBe(linked.body.id)

    await request(app.getHttpServer())
      .delete(`/v1/workouts/${workout.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-expected-revision', String(updatedWorkout.body.revision))
      .expect(204)
    const closedByDeletion = await pool.query<{
      revision: number
      unlink_reason: string
    }>(
      `SELECT revision, unlink_reason FROM plan_workout_links
       WHERE id = $1 AND unlinked_at IS NOT NULL`,
      [relinked.body.id],
    )
    expect(closedByDeletion.rows[0]).toMatchObject({
      revision: 2,
      unlink_reason: 'workout_deleted',
    })

    const exported = await request(app.getHttpServer())
      .get('/v1/me/privacy/export')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    const exportedPlan = exported.body.data.weeklyPlans.find(
      (plan: { id: string }) => plan.id === generated.body.id,
    ) as { workout_links: Array<{ unlink_reason: string }> }
    expect(exportedPlan.workout_links).toHaveLength(2)
    expect(exportedPlan.workout_links.map((link) => link.unlink_reason)).toEqual([
      'user',
      'workout_deleted',
    ])
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

    const staleList = await request(app.getHttpServer())
      .get('/v1/plans/weekly')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200)
    expect(staleList.body.items[0].freshness).toMatchObject({
      state: 'profile_changed',
      planOnboardingRevision: 1,
      currentOnboardingRevision: 2,
      canAcceptOrModify: false,
      canExplainWithAi: false,
      canSkip: true,
      recommendedAction: 'regenerate',
    })

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

    const currentList = await request(app.getHttpServer())
      .get('/v1/plans/weekly')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200)
    expect(currentList.body.items[0].freshness).toMatchObject({
      state: 'current',
      planOnboardingRevision: 2,
      currentOnboardingRevision: 2,
      canAcceptOrModify: true,
      canExplainWithAi: true,
      canSkip: true,
      recommendedAction: 'none',
    })

    await request(app.getHttpServer())
      .put('/v1/me/onboarding')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ ...onboarding(['chest_pain']), expectedRevision: 2 })
      .expect(200)

    const blockedList = await request(app.getHttpServer())
      .get('/v1/plans/weekly')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200)
    expect(blockedList.body.items[0].freshness).toMatchObject({
      state: 'eligibility_blocked',
      currentOnboardingRevision: 3,
      canAcceptOrModify: false,
      canExplainWithAi: false,
      canSkip: true,
      recommendedAction: 'review_profile',
    })

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

  it('invalidates only evidence changes that alter the deterministic planning boundary', async () => {
    const generated = await request(app.getHttpServer())
      .post('/v1/plans/weekly')
      .set('Authorization', `Bearer ${evidenceToken}`)
      .set('x-idempotency-key', `plan-${randomUUID()}`)
      .send({ weekStart: '2026-08-03' })
      .expect(201)
    expect(generated.body).toMatchObject({
      revision: 1,
      evidence: {
        readinessScore: null,
        evidencePolicyVersion: 'planning-impact-v1',
        evidenceFingerprint: 'planning-impact-v1:readiness-missing',
      },
    })

    const now = Date.now()
    await request(app.getHttpServer())
      .post('/v1/workouts')
      .set('Authorization', `Bearer ${evidenceToken}`)
      .set('x-idempotency-key', `workout-${randomUUID()}`)
      .send({
        title: '边界测试训练',
        source: { kind: 'manual' },
        exercises: [
          {
            position: 1,
            exerciseKey: 'goblet_squat',
            name: '高脚杯深蹲',
            category: 'strength',
            sets: [{ position: 1, kind: 'working', reps: 8, completed: true }],
          },
        ],
        startedAt: new Date(now - 30 * 60_000).toISOString(),
        endedAt: new Date(now - 20 * 60_000).toISOString(),
        timezone: 'Asia/Shanghai',
        painLevel: 0,
        fatigue: 2,
      })
      .expect(201)
    await request(app.getHttpServer())
      .post('/v1/nutrition/meals')
      .set('Authorization', `Bearer ${evidenceToken}`)
      .set('x-idempotency-key', `meal-${randomUUID()}`)
      .send({
        mealType: 'lunch',
        title: '边界测试午餐',
        source: { kind: 'manual' },
        items: [
          {
            position: 1,
            food: {
              foodKey: 'rice_cooked',
              name: '熟米饭',
              category: 'staple',
              nutrientsPer100g: {
                energyKcal: 130,
                proteinG: 2.7,
                carbohydrateG: 28,
                fatG: 0.3,
              },
            },
            serving: { amount: 150, unit: 'g', grams: 150 },
          },
        ],
        occurredAt: new Date(now - 10 * 60_000).toISOString(),
        timezone: 'Asia/Shanghai',
      })
      .expect(201)

    const noOpRegeneration = await request(app.getHttpServer())
      .post('/v1/plans/weekly')
      .set('Authorization', `Bearer ${evidenceToken}`)
      .set('x-idempotency-key', `plan-${randomUUID()}`)
      .send({ weekStart: '2026-08-03' })
      .expect(201)
    expect(noOpRegeneration.body).toMatchObject({ id: generated.body.id, revision: 1 })

    await request(app.getHttpServer())
      .post('/v1/health-records')
      .set('Authorization', `Bearer ${evidenceToken}`)
      .set('x-idempotency-key', `record-${randomUUID()}`)
      .send({
        metric: 'recovery.energy',
        value: 5,
        unit: 'score_1_5',
        source: { kind: 'manual' },
        status: 'confirmed',
        occurredAt: new Date(now - 60_000).toISOString(),
        timezone: 'Asia/Shanghai',
      })
      .expect(201)

    const singleSelfReportList = await request(app.getHttpServer())
      .get('/v1/plans/weekly')
      .set('Authorization', `Bearer ${evidenceToken}`)
      .expect(200)
    expect(singleSelfReportList.body.items[0].freshness).toMatchObject({
      state: 'current',
      planEvidenceFingerprint: 'planning-impact-v1:readiness-missing',
      currentEvidenceFingerprint: 'planning-impact-v1:readiness-missing',
    })

    const singleSelfReportRegeneration = await request(app.getHttpServer())
      .post('/v1/plans/weekly')
      .set('Authorization', `Bearer ${evidenceToken}`)
      .set('x-idempotency-key', `plan-${randomUUID()}`)
      .send({ weekStart: '2026-08-03' })
      .expect(201)
    expect(singleSelfReportRegeneration.body).toMatchObject({ id: generated.body.id, revision: 1 })

    await addModerateRecoveryEvidence(evidenceToken, now)

    const staleList = await request(app.getHttpServer())
      .get('/v1/plans/weekly')
      .set('Authorization', `Bearer ${evidenceToken}`)
      .expect(200)
    expect(staleList.body.items[0].freshness).toMatchObject({
      state: 'evidence_changed',
      changeReason: 'recovery_added',
      planEvidenceFingerprint: 'planning-impact-v1:readiness-missing',
      currentEvidenceFingerprint: 'planning-impact-v1:readiness-standard',
      canAcceptOrModify: false,
      canExplainWithAi: false,
      canSkip: true,
      recommendedAction: 'regenerate',
    })

    const blockedDecision = await request(app.getHttpServer())
      .put(`/v1/plans/weekly/${generated.body.id}/decision`)
      .set('Authorization', `Bearer ${evidenceToken}`)
      .send({ decision: 'accepted', expectedRevision: 1, selections: [] })
      .expect(409)
    expect(blockedDecision.body).toMatchObject({
      code: 'plan_evidence_changed',
      changeReason: 'recovery_added',
    })

    const blockedExplanation = await request(app.getHttpServer())
      .post(`/v1/plans/weekly/${generated.body.id}/explanation`)
      .set('Authorization', `Bearer ${evidenceToken}`)
      .set('x-idempotency-key', `ai-explain-${randomUUID()}`)
      .send({
        expectedPlanRevision: 1,
        consent: {
          purpose: 'ai_plan_explanation',
          version: aiPlanConsentVersion,
          accepted: true,
        },
      })
      .expect(409)
    expect(blockedExplanation.body).toMatchObject({
      code: 'plan_evidence_changed',
      changeReason: 'recovery_added',
    })

    const regenerated = await request(app.getHttpServer())
      .post('/v1/plans/weekly')
      .set('Authorization', `Bearer ${evidenceToken}`)
      .set('x-idempotency-key', `plan-${randomUUID()}`)
      .send({ weekStart: '2026-08-03' })
      .expect(201)
    expect(regenerated.body).toMatchObject({
      id: generated.body.id,
      revision: 2,
      evidence: {
        readinessScore: 100,
        evidenceFingerprint: 'planning-impact-v1:readiness-standard',
      },
    })
    expect(
      regenerated.body.days
        .filter((day: { session: unknown }) => day.session)
        .every((day: { session: { intensity: string } }) => day.session.intensity === 'moderate'),
    ).toBe(true)

    const currentList = await request(app.getHttpServer())
      .get('/v1/plans/weekly')
      .set('Authorization', `Bearer ${evidenceToken}`)
      .expect(200)
    expect(currentList.body.items[0].freshness).toMatchObject({
      state: 'current',
      planEvidenceFingerprint: 'planning-impact-v1:readiness-standard',
      currentEvidenceFingerprint: 'planning-impact-v1:readiness-standard',
    })
  })
})
