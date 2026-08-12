import { randomUUID } from 'node:crypto'

import type { CreateWorkout } from '@myfitness/contracts'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'

import { getRuntimeConfig } from '../config'
import { DatabaseService } from '../database/database.service'
import { runMigrations } from '../database/migrate'
import { WorkoutsService } from '../workouts/workouts.service'
import {
  PersonalModelRepository,
  PersonalModelSubjectAuthorityNotFoundError,
} from './personal-model.repository'
import {
  PersonalModelCurrentSubjectUnavailableError,
  PersonalModelCurrentSubjectViewService,
} from './personal-model-current-subject-view'

describe('personal model current subject envelope with PostgreSQL', () => {
  const databaseUrl = getRuntimeConfig().databaseUrl
  const pool = new Pool({ connectionString: databaseUrl })
  const database = new DatabaseService()
  const repository = new PersonalModelRepository(database)
  const viewService = new PersonalModelCurrentSubjectViewService(repository)
  const workoutsService = new WorkoutsService(database)
  const owners = new Set<string>()

  const createOwner = async (ageInWeeks = 10) => {
    const userId = randomUUID()
    owners.add(userId)
    await pool.query(
      `
        WITH account AS (
          INSERT INTO users (id, created_at, updated_at)
          VALUES ($1, clock_timestamp() - ($2 * INTERVAL '1 week'), clock_timestamp())
          RETURNING id, created_at
        )
        INSERT INTO user_profiles (
          user_id, display_name, age_band, sex_for_calculations,
          height_cm, display_height, display_height_unit, unit_system,
          timezone, adult_confirmed_at, risk_status, risk_flags,
          revision, created_at, updated_at
        )
        SELECT
          id, 'Current subject owner', '25_34', 'unspecified',
          170, 170, 'cm', 'metric',
          'Asia/Shanghai', created_at, 'eligible', '{}',
          1, created_at, clock_timestamp()
        FROM account
      `,
      [userId, ageInWeeks],
    )
    return userId
  }

  const workoutInput = async (
    weeksAgo: number,
    durationMinutes: number,
  ): Promise<CreateWorkout> => {
    const time = await pool.query<{ started_at: Date; ended_at: Date }>(
      `
        SELECT
          (
            DATE_TRUNC('week', clock_timestamp() AT TIME ZONE 'Asia/Shanghai')
            - ($1 * INTERVAL '1 week') + INTERVAL '10 hours'
          ) AT TIME ZONE 'Asia/Shanghai' AS started_at,
          (
            DATE_TRUNC('week', clock_timestamp() AT TIME ZONE 'Asia/Shanghai')
            - ($1 * INTERVAL '1 week') + INTERVAL '10 hours'
          ) AT TIME ZONE 'Asia/Shanghai' + ($2 * INTERVAL '1 minute') AS ended_at
      `,
      [weeksAgo, durationMinutes],
    )
    const row = time.rows[0]!
    return {
      title: `第 ${weeksAgo} 周 ${durationMinutes} 分钟训练`,
      source: { kind: 'manual' },
      exercises: [
        {
          position: 1,
          exerciseKey: 'bodyweight_squat',
          name: '深蹲',
          category: 'strength',
          sets: [{ position: 1, kind: 'working', reps: 10, completed: true }],
        },
      ],
      startedAt: row.started_at.toISOString(),
      endedAt: row.ended_at.toISOString(),
      timezone: 'Asia/Shanghai',
      painLevel: 0,
      fatigue: 2,
    }
  }

  const createWorkout = async (userId: string, weeksAgo: number, durationMinutes: number) => {
    const input = await workoutInput(weeksAgo, durationMinutes)
    return workoutsService.create(userId, `current-subject-${randomUUID()}`, input)
  }

  beforeAll(async () => {
    await runMigrations(databaseUrl)
  })

  afterEach(async () => {
    const userIds = [...owners]
    if (userIds.length > 0) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds])
      owners.clear()
    }
  })

  afterAll(async () => {
    await database.onModuleDestroy()
    await pool.end()
  })

  it('returns an explicit empty envelope for an active owner without that subject', async () => {
    const userId = await createOwner()

    await expect(
      repository.getCurrentSubject(userId, 'training.recorded_session_duration'),
    ).resolves.toEqual({
      schemaVersion: 'personal-model-current-subject-envelope-v1',
      ownerUserId: userId,
      subjectKey: 'training.recorded_session_duration',
      current: null,
    })
  })

  it('projects an explicit owner-free empty view for an active owner without that subject', async () => {
    const userId = await createOwner()

    const view = await viewService.read(userId, 'training.recorded_frequency')
    expect(view).toEqual({
      schemaVersion: 'personal-model-current-subject-view-v1',
      subjectKey: 'training.recorded_frequency',
      current: null,
    })
    expect(JSON.stringify(view)).not.toContain(userId)
  })

  it('fails closed for missing or inactive owner authority and invalid subjects', async () => {
    await expect(
      repository.getCurrentSubject(randomUUID(), 'training.recorded_session_duration'),
    ).rejects.toBeInstanceOf(PersonalModelSubjectAuthorityNotFoundError)

    const userId = await createOwner()
    await pool.query("UPDATE users SET status = 'disabled' WHERE id = $1", [userId])
    await expect(
      repository.getCurrentSubject(userId, 'training.recorded_session_duration'),
    ).rejects.toBeInstanceOf(PersonalModelSubjectAuthorityNotFoundError)
    await expect(
      repository.getCurrentSubject(userId, 'training.unknown' as never),
    ).rejects.toThrow()
  })

  it('hides missing and inactive owner authority behind one application error', async () => {
    await expect(
      viewService.read(randomUUID(), 'training.recorded_session_duration'),
    ).rejects.toBeInstanceOf(PersonalModelCurrentSubjectUnavailableError)

    const userId = await createOwner()
    await pool.query("UPDATE users SET status = 'deletion_pending' WHERE id = $1", [userId])
    await expect(
      viewService.read(userId, 'training.recorded_session_duration'),
    ).rejects.toBeInstanceOf(PersonalModelCurrentSubjectUnavailableError)
  })

  it('isolates the same subject by owner and never substitutes a different subject', async () => {
    const firstUserId = await createOwner()
    const secondUserId = await createOwner()
    await createWorkout(firstUserId, 4, 35)
    await createWorkout(secondUserId, 4, 95)
    const firstCreated = await repository.refreshRecordedSessionDuration(firstUserId)
    const secondCreated = await repository.refreshRecordedSessionDuration(secondUserId)
    if (firstCreated.outcome !== 'created' || secondCreated.outcome !== 'created') {
      throw new Error('expected both owner-scoped baselines to be created')
    }

    const first = await repository.getCurrentSubject(
      firstUserId,
      'training.recorded_session_duration',
    )
    const second = await repository.getCurrentSubject(
      secondUserId,
      'training.recorded_session_duration',
    )
    expect(first.current?.itemId).toBe(firstCreated.revision.itemId)
    expect(first.current?.currentRevision.snapshot.claim).toMatchObject({ medianMinutes: 35 })
    expect(second.current?.itemId).toBe(secondCreated.revision.itemId)
    expect(second.current?.currentRevision.snapshot.claim).toMatchObject({ medianMinutes: 95 })
    await expect(
      repository.getCurrentSubject(firstUserId, 'training.recorded_frequency'),
    ).resolves.toMatchObject({ current: null })

    const visible = await viewService.read(firstUserId, 'training.recorded_session_duration')
    expect(visible.current).toMatchObject({
      itemId: firstCreated.revision.itemId,
      generation: 1,
      revision: firstCreated.revision.revision,
      claim: { medianMinutes: 35 },
      evidence: { qualifiedCount: 1, supportingCount: 1 },
    })
    const serialized = JSON.stringify(visible)
    expect(serialized).not.toContain(firstUserId)
    expect(serialized).not.toContain(firstCreated.revision.id)
    expect(serialized).not.toContain('derivationFingerprint')
    expect(serialized).not.toContain('references')
  })

  it('distinguishes a terminal current generation and then selects only its successor', async () => {
    const userId = await createOwner()
    const firstWorkout = await createWorkout(userId, 7, 45)
    const initial = await repository.refreshRecordedSessionDuration(userId)
    if (initial.outcome !== 'created') throw new Error('expected initial generation')

    await workoutsService.remove(userId, firstWorkout.id, firstWorkout.revision)
    const invalidated = await repository.refreshRecordedSessionDuration(userId)
    if (invalidated.outcome !== 'revised') throw new Error('expected terminal revision')

    const terminal = await repository.getCurrentSubject(
      userId,
      'training.recorded_session_duration',
    )
    expect(terminal.current).toMatchObject({
      itemId: initial.revision.itemId,
      generation: 1,
      predecessorItemId: null,
      terminal: true,
      retiredAt: null,
      currentRevision: {
        revision: invalidated.revision.revision,
        snapshot: { status: 'invalidated' },
      },
    })
    const terminalView = await viewService.read(userId, 'training.recorded_session_duration')
    expect(terminalView.current).toMatchObject({
      itemId: initial.revision.itemId,
      generation: 1,
      revision: invalidated.revision.revision,
      status: 'invalidated',
      terminal: true,
      validTo: invalidated.revision.snapshot.validTo,
      evidence: { qualifiedCount: 0, supportingCount: 0, withdrawnCount: 1 },
    })

    await createWorkout(userId, 3, 75)
    const successor = await repository.refreshRecordedSessionDuration(userId)
    if (successor.outcome !== 'created') throw new Error('expected successor generation')
    const current = await repository.getCurrentSubject(userId, 'training.recorded_session_duration')
    expect(current.current).toMatchObject({
      itemId: successor.revision.itemId,
      generation: 2,
      predecessorItemId: initial.revision.itemId,
      terminal: false,
      retiredAt: null,
      currentRevision: {
        id: successor.revision.id,
        revision: successor.revision.revision,
        snapshot: { status: 'candidate' },
      },
    })
    await expect(
      viewService.read(userId, 'training.recorded_session_duration'),
    ).resolves.toMatchObject({
      current: {
        itemId: successor.revision.itemId,
        generation: 2,
        status: 'candidate',
        terminal: false,
      },
    })
  })
})
