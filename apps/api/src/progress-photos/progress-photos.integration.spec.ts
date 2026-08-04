import { randomUUID } from 'node:crypto'

import type { INestApplication } from '@nestjs/common'
import {
  progressPhotoAnalysisConsentVersion,
  progressPhotoRetentionConsentVersion,
} from '@myfitness/contracts'
import { Pool } from 'pg'
import sharp from 'sharp'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApplication } from '../bootstrap'
import { getRuntimeConfig } from '../config'
import { runMigrations } from '../database/migrate'
import { PhotoStorageService } from '../nutrition/photo-storage.service'

describe('private progress photos with PostgreSQL and local quality checks', () => {
  const config = getRuntimeConfig()
  const pool = new Pool({ connectionString: config.databaseUrl })
  const users = new Set<string>()
  let app: INestApplication
  let storage: PhotoStorageService
  let operationJobCutoff: Date

  const createUser = async () => {
    const session = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .send({ subject: `progress-photo-${randomUUID()}` })
      .expect(200)
    const userId = String(session.body.userId)
    users.add(userId)
    return { userId, token: String(session.body.accessToken) }
  }

  const reserve = (
    token: string,
    retentionMode: 'analysis_only' | 'retained',
    view: 'front' | 'side' | 'back' = 'front',
  ) =>
    request(app.getHttpServer())
      .post('/v1/progress-photos')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', `progress-photo-${randomUUID()}`)
      .send({
        view,
        capturedAt: new Date().toISOString(),
        timezone: 'Asia/Shanghai',
        analysisConsent: { granted: true, version: progressPhotoAnalysisConsentVersion },
        retention:
          retentionMode === 'retained'
            ? {
                mode: 'retained',
                consent: { granted: true, version: progressPhotoRetentionConsentVersion },
              }
            : { mode: 'analysis_only' },
      })

  const portraitImage = async () => {
    const width = 800
    const height = 1200
    const pixels = Buffer.alloc(width * height * 3)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 3
        const value = (Math.floor(x / 40) + Math.floor(y / 40)) % 2 ? 190 : 70
        pixels[offset] = value
        pixels[offset + 1] = value
        pixels[offset + 2] = value
      }
    }
    return sharp(pixels, { raw: { width, height, channels: 3 } })
      .jpeg({ quality: 92 })
      .withMetadata({ orientation: 1 })
      .toBuffer()
  }

  const upload = async (
    token: string,
    retentionMode: 'analysis_only' | 'retained',
    view: 'front' | 'side' | 'back' = 'front',
  ) => {
    const ticket = await reserve(token, retentionMode, view).expect(201)
    const response = await request(app.getHttpServer())
      .post(String(ticket.body.upload.path))
      .set('Authorization', `Bearer ${token}`)
      .attach('file', await portraitImage(), {
        filename: 'progress.jpg',
        contentType: 'image/jpeg',
      })
      .expect(201)
    return response.body as {
      id: string
      previewPath: string
      retentionMode: 'analysis_only' | 'retained'
      quality: { overallStatus: 'ready' | 'adjust'; checks: unknown[] } | null
      expiresAt: string | null
    }
  }

  beforeAll(async () => {
    await runMigrations(config.databaseUrl)
    operationJobCutoff = (await pool.query<{ cutoff: Date }>('SELECT clock_timestamp() AS cutoff'))
      .rows[0]!.cutoff
    app = await createApplication(false)
    await app.init()
    storage = app.get(PhotoStorageService)
  })

  afterAll(async () => {
    for (const userId of users) await storage.removeUserDirectory(userId)
    await pool.query('DELETE FROM data_operation_jobs WHERE created_at >= $1', [operationJobCutoff])
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[...users]])
    await pool.end()
    await app.close()
  })

  it('sanitizes into a scoped private object and returns bounded capture-quality checks', async () => {
    const { userId, token } = await createUser()
    const photo = await upload(token, 'analysis_only')
    expect(photo).toMatchObject({
      retentionMode: 'analysis_only',
      quality: { overallStatus: 'ready' },
    })
    expect(photo.quality?.checks).toHaveLength(4)
    expect(photo.expiresAt).toBeTruthy()

    const storageKey = `${userId}/progress/${photo.id}.jpg`
    const sanitized = await storage.read(storageKey)
    expect(sanitized.includes(Buffer.from('Exif'))).toBe(false)
    await request(app.getHttpServer()).get(photo.previewPath).expect(200)

    const listed = await request(app.getHttpServer())
      .get('/v1/progress-photos')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(listed.body.items).toHaveLength(1)
    expect(listed.body.items[0]).toMatchObject({ id: photo.id, view: 'front' })

    const overview = await request(app.getHttpServer())
      .get('/v1/me/privacy')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(overview.body).toMatchObject({ activePhotoCount: 1 })
    expect(
      overview.body.inventory.find(
        (item: { category: string }) => item.category === 'photo_analyses',
      ),
    ).toMatchObject({ recordCount: 1 })

    const exported = await request(app.getHttpServer())
      .get('/v1/me/privacy/export')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    const payload = JSON.parse(exported.text) as {
      data: { progressPhotos: Array<{ media?: { encoding?: string; data?: string } }> }
    }
    expect(payload.data.progressPhotos[0]?.media).toMatchObject({ encoding: 'base64' })
    expect(payload.data.progressPhotos[0]?.media?.data?.length).toBeGreaterThan(20)
    expect(exported.text).not.toContain('storage_key')
  })

  it('requires separate retention consent and keeps retained media when analysis is revoked', async () => {
    const { userId, token } = await createUser()
    await request(app.getHttpServer())
      .post('/v1/progress-photos')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', `progress-photo-${randomUUID()}`)
      .send({
        view: 'side',
        capturedAt: new Date().toISOString(),
        timezone: 'Asia/Shanghai',
        analysisConsent: { granted: true, version: progressPhotoAnalysisConsentVersion },
        retention: { mode: 'retained' },
      })
      .expect(400)

    const temporary = await upload(token, 'analysis_only', 'side')
    const retained = await upload(token, 'retained', 'side')
    const revoked = await request(app.getHttpServer())
      .post('/v1/me/privacy/consents/progress_photo_analysis/revoke')
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmed: true })
      .expect(200)
    expect(revoked.body).toMatchObject({
      purpose: 'progress_photo_analysis',
      removedPhotoAnalyses: 0,
      removedProgressPhotos: 2,
    })
    expect(await storage.exists(`${userId}/progress/${temporary.id}.jpg`)).toBe(false)
    expect(await storage.exists(`${userId}/progress/${retained.id}.jpg`)).toBe(true)

    const listed = await request(app.getHttpServer())
      .get('/v1/progress-photos')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(listed.body.items).toHaveLength(1)
    expect(listed.body.items[0]).toMatchObject({
      id: retained.id,
      analysisAvailable: false,
      quality: null,
    })

    const retentionRevoked = await request(app.getHttpServer())
      .post('/v1/me/privacy/consents/progress_photo_retention/revoke')
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmed: true })
      .expect(200)
    expect(retentionRevoked.body).toMatchObject({ removedProgressPhotos: 2 })
    expect(await storage.exists(`${userId}/progress/${retained.id}.jpg`)).toBe(false)
  })

  it('requires explicit deletion and prevents another account from deleting the photo', async () => {
    const owner = await createUser()
    const other = await createUser()
    const photo = await upload(owner.token, 'retained', 'back')
    await request(app.getHttpServer())
      .delete(`/v1/progress-photos/${photo.id}`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(404)
    await request(app.getHttpServer())
      .delete(`/v1/progress-photos/${photo.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(204)
    expect(await storage.exists(`${owner.userId}/progress/${photo.id}.jpg`)).toBe(false)
  })
})
