import { randomUUID } from 'node:crypto'

import type { INestApplication } from '@nestjs/common'
import { privacyExportSchemaVersion } from '@myfitness/contracts'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getRuntimeConfig } from '../config'
import { createApplication } from '../bootstrap'
import { runMigrations } from '../database/migrate'
import { PortableExportArchiveService } from './portable-export-archive.service'

describe('portable export archive PostgreSQL custody boundary', () => {
  const config = getRuntimeConfig()
  const pool = new Pool({ connectionString: config.databaseUrl })
  const users = new Set<string>()
  let app: INestApplication
  let archives: PortableExportArchiveService

  const createUser = async () => {
    const userId = randomUUID()
    users.add(userId)
    await pool.query('INSERT INTO users (id) VALUES ($1)', [userId])
    return userId
  }

  const insertQueued = async (
    userId: string,
    idempotencyKey = randomUUID(),
    timing = {
      createdAt: new Date(),
      generationExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  ) => {
    const archiveId = randomUUID()
    await pool.query(
      `INSERT INTO privacy_export_archives (
         id, user_id, idempotency_key, request_hash, export_schema_version,
         object_key, generation_expires_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
      [
        archiveId,
        userId,
        idempotencyKey,
        'a'.repeat(64),
        privacyExportSchemaVersion,
        `${userId}/${archiveId}.json.enc`,
        timing.generationExpiresAt,
        timing.createdAt,
      ],
    )
    return { archiveId, idempotencyKey }
  }

  beforeAll(async () => {
    await runMigrations(config.databaseUrl)
    app = await createApplication(false, 'metadata')
    await app.init()
    archives = app.get(PortableExportArchiveService)
  })

  afterAll(async () => {
    for (const userId of users) {
      await pool.query('DELETE FROM privacy_export_archives WHERE user_id = $1', [userId])
      await pool.query('DELETE FROM users WHERE id = $1', [userId])
    }
    await app.close()
    await pool.end()
  })

  it('enforces idempotency, monotonic transitions and complete available custody', async () => {
    const userId = await createUser()
    const { archiveId, idempotencyKey } = await insertQueued(userId)

    await expect(insertQueued(userId, idempotencyKey)).rejects.toMatchObject({ code: '23505' })
    await expect(
      pool.query(
        `UPDATE privacy_export_archives
         SET status = 'available', updated_at = NOW()
         WHERE id = $1`,
        [archiveId],
      ),
    ).rejects.toThrowError(/invalid portable export archive transition/)

    await pool.query(
      `UPDATE privacy_export_archives
       SET status = 'generating', encryption_key_ref = 'kms/local/export-v1', updated_at = NOW()
       WHERE id = $1`,
      [archiveId],
    )
    await expect(
      pool.query(
        `UPDATE privacy_export_archives
         SET status = 'available', artifact_sha256 = $2, artifact_byte_size = 1024,
             available_at = NOW(), download_expires_at = NOW() + INTERVAL '24 hours',
             encryption_key_ref = NULL, updated_at = NOW()
         WHERE id = $1`,
        [archiveId, 'b'.repeat(64)],
      ),
    ).rejects.toThrowError(/encryption reference changed outside its boundary/)

    await pool.query(
      `UPDATE privacy_export_archives
       SET status = 'available', artifact_sha256 = $2, artifact_byte_size = 1024,
           available_at = NOW(), download_expires_at = NOW() + INTERVAL '24 hours',
           updated_at = NOW()
       WHERE id = $1`,
      [archiveId, 'b'.repeat(64)],
    )
    const available = await pool.query<{
      status: string
      object_key: string
      encryption_key_ref: string
      artifact_byte_size: string
    }>(
      `SELECT status, object_key, encryption_key_ref, artifact_byte_size::text
       FROM privacy_export_archives WHERE id = $1`,
      [archiveId],
    )
    expect(available.rows[0]).toEqual({
      status: 'available',
      object_key: `${userId}/${archiveId}.json.enc`,
      encryption_key_ref: 'kms/local/export-v1',
      artifact_byte_size: '1024',
    })
    await expect(
      pool.query(
        `UPDATE privacy_export_archives
         SET artifact_sha256 = $2, updated_at = NOW()
         WHERE id = $1`,
        [archiveId, 'c'.repeat(64)],
      ),
    ).rejects.toThrowError(/custody changes require a state transition/)

    const expired = await insertQueued(userId, randomUUID(), {
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      generationExpiresAt: new Date(Date.now() - 60 * 60 * 1000),
    })
    await pool.query(
      `UPDATE privacy_export_archives
       SET status = 'generating', encryption_key_ref = 'kms/local/export-v1', updated_at = NOW()
       WHERE id = $1`,
      [expired.archiveId],
    )
    await expect(
      pool.query(
        `UPDATE privacy_export_archives
         SET status = 'available', artifact_sha256 = $2, artifact_byte_size = 1024,
             available_at = NOW(), download_expires_at = NOW() + INTERVAL '24 hours',
             updated_at = NOW()
         WHERE id = $1`,
        [expired.archiveId, 'd'.repeat(64)],
      ),
    ).rejects.toMatchObject({ code: '23514' })

    const oversized = await insertQueued(userId)
    await pool.query(
      `UPDATE privacy_export_archives
       SET status = 'generating', encryption_key_ref = 'kms/local/export-v1', updated_at = NOW()
       WHERE id = $1`,
      [oversized.archiveId],
    )
    await expect(
      pool.query(
        `UPDATE privacy_export_archives
         SET status = 'available', artifact_sha256 = $2,
             artifact_byte_size = 9007199254740992, available_at = NOW(),
             download_expires_at = NOW() + INTERVAL '24 hours', updated_at = NOW()
         WHERE id = $1`,
        [oversized.archiveId, 'd'.repeat(64)],
      ),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('prevents owner erasure until artifact disposition reaches its terminal state', async () => {
    const userId = await createUser()
    const { archiveId } = await insertQueued(userId)

    await expect(pool.query('DELETE FROM users WHERE id = $1', [userId])).rejects.toMatchObject({
      code: '23001',
    })
    await pool.query(
      `UPDATE privacy_export_archives
       SET status = 'deletion_pending', disposition_reason = 'account_erasure', updated_at = NOW()
       WHERE id = $1`,
      [archiveId],
    )
    await pool.query(
      `UPDATE privacy_export_archives
       SET status = 'disposed', object_key = NULL, disposition_reason = 'account_erasure',
           disposed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [archiveId],
    )
    await pool.query('DELETE FROM privacy_export_archives WHERE id = $1', [archiveId])
    await expect(pool.query('DELETE FROM users WHERE id = $1', [userId])).resolves.toMatchObject({
      rowCount: 1,
    })
    users.delete(userId)
  })

  it('reserves one owner-scoped intent under concurrency and never revives its terminal state', async () => {
    const ownerId = await createUser()
    const otherOwnerId = await createUser()
    const idempotencyKey = randomUUID()
    const requestHash = 'e'.repeat(64)

    const concurrent = await Promise.all(
      Array.from({ length: 8 }, () => archives.reserve(ownerId, { idempotencyKey, requestHash })),
    )
    expect(new Set(concurrent.map((receipt) => receipt.archiveId))).toHaveLength(1)
    expect(concurrent.every((receipt) => receipt.status === 'queued')).toBe(true)
    expect(
      concurrent.every((receipt) => JSON.stringify(receipt) === JSON.stringify(concurrent[0])),
    ).toBe(true)

    const receipt = concurrent[0]!
    const persisted = await pool.query<{
      count: string
      object_key: string
      generation_expires_at: Date
      created_at: Date
    }>(
      `SELECT COUNT(*) OVER ()::text AS count, object_key, generation_expires_at, created_at
       FROM privacy_export_archives
       WHERE user_id = $1 AND idempotency_key = $2`,
      [ownerId, idempotencyKey],
    )
    expect(persisted.rows[0]).toMatchObject({
      count: '1',
      object_key: `${ownerId}/${receipt.archiveId}.json.enc`,
    })
    expect(
      persisted.rows[0]!.generation_expires_at.getTime() - persisted.rows[0]!.created_at.getTime(),
    ).toBe(60 * 60 * 1000)

    await expect(
      archives.reserve(ownerId, { idempotencyKey, requestHash: 'f'.repeat(64) }),
    ).rejects.toMatchObject({ status: 409 })
    await expect(archives.findOwned(otherOwnerId, receipt.archiveId)).rejects.toMatchObject({
      status: 404,
    })
    await expect(archives.findOwned(ownerId, receipt.archiveId)).resolves.toEqual(receipt)

    await pool.query("UPDATE users SET status = 'deletion_pending' WHERE id = $1", [otherOwnerId])
    await expect(
      archives.reserve(otherOwnerId, { idempotencyKey: randomUUID(), requestHash }),
    ).rejects.toMatchObject({ status: 404 })

    await pool.query(
      `UPDATE privacy_export_archives
       SET status = 'failed', object_key = NULL, failure_code = 'unexpected_error',
           updated_at = NOW()
       WHERE id = $1`,
      [receipt.archiveId],
    )
    const terminalReplay = await archives.reserve(ownerId, { idempotencyKey, requestHash })
    expect(terminalReplay).toMatchObject({
      archiveId: receipt.archiveId,
      status: 'failed',
      failureCode: 'unexpected_error',
    })
    expect(terminalReplay.updatedAt).not.toBe(receipt.updatedAt)

    const disposedKey = randomUUID()
    const disposable = await archives.reserve(ownerId, {
      idempotencyKey: disposedKey,
      requestHash,
    })
    await pool.query(
      `UPDATE privacy_export_archives
       SET status = 'deletion_pending', disposition_reason = 'retention_expired', updated_at = NOW()
       WHERE id = $1`,
      [disposable.archiveId],
    )
    await pool.query(
      `UPDATE privacy_export_archives
       SET status = 'disposed', object_key = NULL, disposed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [disposable.archiveId],
    )
    await expect(
      archives.reserve(ownerId, { idempotencyKey: disposedKey, requestHash }),
    ).resolves.toMatchObject({ archiveId: disposable.archiveId, status: 'disposed' })
  })
})
