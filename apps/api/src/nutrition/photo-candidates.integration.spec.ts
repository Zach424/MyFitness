import { randomUUID } from 'node:crypto'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'

import type { INestApplication } from '@nestjs/common'
import { foodPhotoConsentVersion } from '@myfitness/contracts'
import { Pool } from 'pg'
import sharp from 'sharp'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApplication } from '../bootstrap'
import { getRuntimeConfig } from '../config'
import { runMigrations } from '../database/migrate'

describe('private food-photo candidates with PostgreSQL and fixture worker', () => {
  const config = getRuntimeConfig()
  const pool = new Pool({ connectionString: config.databaseUrl })
  let app: INestApplication
  let token = ''
  let userId = ''
  let otherToken = ''
  let otherUserId = ''

  const reserve = async () =>
    request(app.getHttpServer())
      .post('/v1/nutrition/photo-candidates')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', `food-photo-${randomUUID()}`)
      .send({ consent: { granted: true, version: foodPhotoConsentVersion } })
      .expect(201)

  beforeAll(async () => {
    await runMigrations(config.databaseUrl)
    app = await createApplication(false)
    await app.init()
    const session = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .send({ subject: `food-photo-${randomUUID()}` })
      .expect(200)
    token = session.body.accessToken as string
    userId = session.body.userId as string
    const other = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .send({ subject: `food-photo-other-${randomUUID()}` })
      .expect(200)
    otherToken = other.body.accessToken as string
    otherUserId = other.body.userId as string
  })

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[userId, otherUserId]])
    await pool.end()
    await app.close()
  })

  it('sanitizes EXIF, protects preview ownership, confirms a bounded selection and creates no meal', async () => {
    const original = await sharp({
      create: { width: 2400, height: 1200, channels: 3, background: '#d8c49a' },
    })
      .jpeg({ quality: 90 })
      .withMetadata({ orientation: 6 })
      .toBuffer()
    expect(original.includes(Buffer.from('Exif'))).toBe(true)

    const ticket = await reserve()
    const photoId = String(ticket.body.id)
    const preflight = await request(app.getHttpServer())
      .options(String(ticket.body.upload.path))
      .set('Origin', 'http://127.0.0.1:4173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type')
      .expect(204)
    expect(preflight.headers['access-control-allow-origin']).toBe('http://127.0.0.1:4173')
    expect(preflight.headers['access-control-allow-credentials']).toBe('true')
    const upload = await request(app.getHttpServer())
      .post(String(ticket.body.upload.path))
      .set('Authorization', `Bearer ${token}`)
      .attach('file', original, { filename: 'private-meal.jpg', contentType: 'image/jpeg' })
      .expect(201)

    expect(upload.body).toMatchObject({
      id: photoId,
      status: 'ready',
      source: 'fixture',
      provider: 'fixture',
      mediaDeleted: false,
    })
    expect(
      upload.body.content.candidates.map((item: { catalogKey: string }) => item.catalogKey),
    ).toEqual(['rice_cooked', 'chicken_breast_cooked'])

    const storedPath = path.join(config.photoStorageRoot, userId, `${photoId}.jpg`)
    const sanitized = await readFile(storedPath)
    const metadata = await sharp(sanitized).metadata()
    expect(sanitized.includes(Buffer.from('Exif'))).toBe(false)
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBe(1600)
    await request(app.getHttpServer()).get(String(upload.body.previewPath)).expect(200)
    await request(app.getHttpServer())
      .delete(`/v1/nutrition/photo-candidates/${photoId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404)

    await request(app.getHttpServer())
      .post(`/v1/nutrition/photo-candidates/${photoId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ catalogKey: 'rice_cooked', grams: 500 }] })
      .expect(422)
    const confirmed = await request(app.getHttpServer())
      .post(`/v1/nutrition/photo-candidates/${photoId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          { catalogKey: 'rice_cooked', grams: 160 },
          { catalogKey: 'chicken_breast_cooked', grams: 120 },
        ],
      })
      .expect(200)
    expect(confirmed.body).toMatchObject({ status: 'confirmed', mediaDeleted: true })
    await expect(access(storedPath)).rejects.toMatchObject({ code: 'ENOENT' })

    const meals = await request(app.getHttpServer())
      .get('/v1/nutrition/meals')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(meals.body.items).toHaveLength(0)
  })

  it('requires explicit consent and rejects bytes that do not match the declared type', async () => {
    await request(app.getHttpServer())
      .post('/v1/nutrition/photo-candidates')
      .set('Authorization', `Bearer ${token}`)
      .set('x-idempotency-key', `food-photo-${randomUUID()}`)
      .send({ consent: { granted: false, version: foodPhotoConsentVersion } })
      .expect(400)

    const ticket = await reserve()
    await request(app.getHttpServer())
      .post(String(ticket.body.upload.path))
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('not a photo'), {
        filename: 'fake.jpg',
        contentType: 'image/jpeg',
      })
      .expect(400)
    await request(app.getHttpServer())
      .delete(`/v1/nutrition/photo-candidates/${String(ticket.body.id)}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204)
  })

  it('deletes ready media and derived candidates on demand', async () => {
    const image = await sharp({
      create: { width: 320, height: 240, channels: 3, background: '#7d987d' },
    })
      .png()
      .toBuffer()
    const ticket = await reserve()
    const photoId = String(ticket.body.id)
    await request(app.getHttpServer())
      .post(String(ticket.body.upload.path))
      .set('Authorization', `Bearer ${token}`)
      .attach('file', image, { filename: 'meal.png', contentType: 'image/png' })
      .expect(201)
    await request(app.getHttpServer())
      .delete(`/v1/nutrition/photo-candidates/${photoId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204)

    const row = await pool.query<{
      status: string
      storage_key: string | null
      content: unknown
      media_sha256: string | null
    }>(
      'SELECT status, storage_key, content, media_sha256 FROM nutrition_photo_candidates WHERE id = $1',
      [photoId],
    )
    expect(row.rows[0]).toEqual({
      status: 'deleted',
      storage_key: null,
      content: null,
      media_sha256: null,
    })
  })

  it('expires ready media and derived content through the retention reconciler', async () => {
    const image = await sharp({
      create: { width: 120, height: 90, channels: 3, background: '#a96821' },
    })
      .webp()
      .toBuffer()
    const ticket = await reserve()
    const photoId = String(ticket.body.id)
    await request(app.getHttpServer())
      .post(String(ticket.body.upload.path))
      .set('Authorization', `Bearer ${token}`)
      .attach('file', image, { filename: 'meal.webp', contentType: 'image/webp' })
      .expect(201)
    const storedPath = path.join(config.photoStorageRoot, userId, `${photoId}.jpg`)
    await pool.query(
      "UPDATE nutrition_photo_candidates SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1",
      [photoId],
    )

    const list = await request(app.getHttpServer())
      .get('/v1/nutrition/photo-candidates')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(list.body.items).toHaveLength(0)
    await expect(access(storedPath)).rejects.toMatchObject({ code: 'ENOENT' })
    const row = await pool.query<{
      status: string
      storage_key: string | null
      content: unknown
      media_sha256: string | null
    }>(
      'SELECT status, storage_key, content, media_sha256 FROM nutrition_photo_candidates WHERE id = $1',
      [photoId],
    )
    expect(row.rows[0]).toEqual({
      status: 'expired',
      storage_key: null,
      content: null,
      media_sha256: null,
    })
  })
})
