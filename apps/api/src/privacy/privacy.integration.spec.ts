import { randomUUID } from 'node:crypto'
import { access } from 'node:fs/promises'
import path from 'node:path'

import type { INestApplication } from '@nestjs/common'
import {
  accountDeletionConfirmationPhrase,
  consentVersions,
  foodPhotoConsentVersion,
} from '@myfitness/contracts'
import { Pool } from 'pg'
import sharp from 'sharp'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApplication } from '../bootstrap'
import { getRuntimeConfig } from '../config'
import { runMigrations } from '../database/migrate'
import { PhotoStorageService } from '../nutrition/photo-storage.service'

describe('privacy ownership API with PostgreSQL and private media', () => {
  const config = getRuntimeConfig()
  const pool = new Pool({ connectionString: config.databaseUrl })
  const users = new Set<string>()
  const receipts = new Set<string>()
  let app: INestApplication

  const onboarding = {
    adultConfirmed: true,
    profile: {
      displayName: '数据主人',
      ageBand: '25_34',
      sexForCalculations: 'unspecified',
      height: { value: 172, unit: 'cm' },
      unitSystem: 'metric',
      timezone: 'Asia/Shanghai',
    },
    goal: {
      primaryGoal: 'fitness',
      experience: 'beginner',
      availableDays: ['mon', 'wed', 'sat'],
      sessionMinutes: 45,
      equipment: ['bodyweight'],
      dietaryPreferences: ['none'],
    },
    risk: { flags: [], acknowledged: true },
    consents: {
      terms: { accepted: true, version: consentVersions.terms },
      privacy: { accepted: true, version: consentVersions.privacy },
      healthData: { accepted: true, version: consentVersions.healthData },
    },
  }

  const createUser = async () => {
    const subject = `privacy-${randomUUID()}`
    const session = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .send({ subject })
      .expect(200)
    const userId = String(session.body.userId)
    const token = String(session.body.accessToken)
    users.add(userId)
    await request(app.getHttpServer())
      .put('/v1/me/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send(onboarding)
      .expect(200)
    return { subject, userId, token }
  }

  const createHealthRecord = (token: string) =>
    request(app.getHttpServer())
      .post('/v1/health-records')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', `privacy-record-${randomUUID()}`)
      .send({
        metric: 'body.weight',
        value: 70,
        unit: 'kg',
        source: { kind: 'manual' },
        status: 'confirmed',
        occurredAt: '2026-07-19T06:00:00+08:00',
        timezone: 'Asia/Shanghai',
      })
      .expect(201)

  const createPhoto = async (token: string, userId: string, idempotencyKey = randomUUID()) => {
    const ticket = await request(app.getHttpServer())
      .post('/v1/nutrition/photo-candidates')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', `privacy-photo-${idempotencyKey}`)
      .send({ consent: { granted: true, version: foodPhotoConsentVersion } })
      .expect(201)
    const photoId = String(ticket.body.id)
    const image = await sharp({
      create: { width: 180, height: 120, channels: 3, background: '#b88f53' },
    })
      .png()
      .toBuffer()
    await request(app.getHttpServer())
      .post(String(ticket.body.upload.path))
      .set('Authorization', `Bearer ${token}`)
      .attach('file', image, { filename: 'meal.png', contentType: 'image/png' })
      .expect(201)
    return {
      photoId,
      storedPath: path.join(config.photoStorageRoot, userId, `${photoId}.jpg`),
    }
  }

  beforeAll(async () => {
    await runMigrations(config.databaseUrl)
    app = await createApplication(false)
    await app.init()
  })

  afterAll(async () => {
    for (const userId of users) {
      await app.get(PhotoStorageService).removeUserDirectory(userId)
    }
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[...users]])
    await pool.query('DELETE FROM privacy_erasure_receipts WHERE receipt_id = ANY($1::uuid[])', [
      [...receipts],
    ])
    await pool.end()
    await app.close()
  })

  it('inventories owned data and exports history plus active sanitized media without secrets', async () => {
    const { token, userId } = await createUser()
    await createHealthRecord(token)
    const photo = await createPhoto(token, userId)

    const overview = await request(app.getHttpServer())
      .get('/v1/me/privacy')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(overview.body).toMatchObject({ activePhotoCount: 1 })
    expect(overview.body.inventory).toHaveLength(8)
    expect(
      overview.body.inventory.find(
        (item: { category: string }) => item.category === 'health_records',
      ),
    ).toMatchObject({ recordCount: 1, includesHistory: true })

    const exported = await request(app.getHttpServer())
      .get('/v1/me/privacy/export')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(exported.headers['cache-control']).toContain('no-store')
    expect(exported.headers['content-disposition']).toContain('myfitness-export.json')
    const payload = JSON.parse(exported.text) as {
      schemaVersion: string
      data: {
        healthRecords: unknown[]
        healthRecordRevisions: unknown[]
        foodPhotoAnalyses: Array<{ media?: { encoding?: string; data?: string } }>
      }
    }
    expect(payload.schemaVersion).toBe('myfitness-portable-export-v1')
    expect(payload.data.healthRecords).toHaveLength(1)
    expect(payload.data.healthRecordRevisions).toHaveLength(1)
    expect(payload.data.foodPhotoAnalyses[0]?.media).toMatchObject({ encoding: 'base64' })
    expect(payload.data.foodPhotoAnalyses[0]?.media?.data?.length).toBeGreaterThan(20)
    expect(exported.text).not.toContain(token)
    expect(exported.text).not.toContain('token_hash')
    expect(exported.text).not.toContain('request_hash')
    expect(exported.text).not.toContain('storage_key')

    await request(app.getHttpServer())
      .delete(`/v1/nutrition/photo-candidates/${photo.photoId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204)
  })

  it('revokes optional photo consent, clears its data and permits a later explicit grant', async () => {
    const { token, userId } = await createUser()
    const first = await createPhoto(token, userId)

    const revoked = await request(app.getHttpServer())
      .post('/v1/me/privacy/consents/food_photo_analysis/revoke')
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmed: true })
      .expect(200)
    expect(revoked.body).toMatchObject({
      purpose: 'food_photo_analysis',
      status: 'revoked',
      removedPhotoAnalyses: 1,
    })
    await expect(access(first.storedPath)).rejects.toMatchObject({ code: 'ENOENT' })
    const afterRevoke = await request(app.getHttpServer())
      .get('/v1/me/privacy')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(
      afterRevoke.body.consents.find(
        (item: { purpose: string }) => item.purpose === 'food_photo_analysis',
      ),
    ).toMatchObject({ status: 'revoked', revocable: true })

    const second = await createPhoto(token, userId)
    const consentRows = await pool.query<{ revoked_at: Date | null }>(
      `SELECT revoked_at FROM consent_events
       WHERE user_id = $1 AND purpose = 'food_photo_analysis' ORDER BY accepted_at`,
      [userId],
    )
    expect(consentRows.rows).toHaveLength(2)
    expect(consentRows.rows[0]?.revoked_at).toBeInstanceOf(Date)
    expect(consentRows.rows[1]?.revoked_at).toBeNull()
    await request(app.getHttpServer())
      .delete(`/v1/nutrition/photo-candidates/${second.photoId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204)
  })

  it('requires deliberate confirmation, erases the account graph and invalidates its session', async () => {
    const { token, userId } = await createUser()
    await createHealthRecord(token)
    await createPhoto(token, userId)

    await request(app.getHttpServer())
      .delete('/v1/me/privacy/account')
      .set('Authorization', `Bearer ${token}`)
      .send({
        confirmationPhrase: '删除账户',
        exportChoice: 'skip',
        understandsPermanent: true,
      })
      .expect(400)

    const deleted = await request(app.getHttpServer())
      .delete('/v1/me/privacy/account')
      .set('Authorization', `Bearer ${token}`)
      .send({
        confirmationPhrase: accountDeletionConfirmationPhrase,
        exportChoice: 'skip',
        understandsPermanent: true,
      })
      .expect(200)
    expect(deleted.body).toMatchObject({ deleted: true })
    expect(deleted.body.scopeVersion).toBe('primary-store-v1')
    expect(deleted.body.receiptId).toMatch(/^[0-9a-f-]{36}$/)
    receipts.add(String(deleted.body.receiptId))

    await request(app.getHttpServer())
      .get('/v1/me/privacy')
      .set('Authorization', `Bearer ${token}`)
      .expect(401)
    const remaining = await pool.query<{ users: string; records: string; consents: string }>(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE id = $1)::text AS users,
         (SELECT COUNT(*) FROM health_records WHERE user_id = $1)::text AS records,
         (SELECT COUNT(*) FROM consent_events WHERE user_id = $1)::text AS consents`,
      [userId],
    )
    expect(remaining.rows[0]).toEqual({ users: '0', records: '0', consents: '0' })
    const receipt = await pool.query<{ scope_version: string }>(
      'SELECT scope_version FROM privacy_erasure_receipts WHERE receipt_id = $1',
      [deleted.body.receiptId],
    )
    expect(receipt.rows[0]?.scope_version).toBe('primary-store-v1')
    await expect(access(path.join(config.photoStorageRoot, userId))).rejects.toMatchObject({
      code: 'ENOENT',
    })
    users.delete(userId)
  })
})
