import { randomUUID } from 'node:crypto'

import { privacyExportSchemaVersion } from '@myfitness/contracts'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getRuntimeConfig } from '../config'
import { runMigrations } from '../database/migrate'

describe('portable export archive PostgreSQL custody boundary', () => {
  const config = getRuntimeConfig()
  const pool = new Pool({ connectionString: config.databaseUrl })
  const users = new Set<string>()

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
  })

  afterAll(async () => {
    for (const userId of users) {
      await pool.query('DELETE FROM privacy_export_archives WHERE user_id = $1', [userId])
      await pool.query('DELETE FROM users WHERE id = $1', [userId])
    }
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
})
