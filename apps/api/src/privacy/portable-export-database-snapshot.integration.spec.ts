import { randomUUID } from 'node:crypto'

import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getRuntimeConfig } from '../config'
import { DatabaseService } from '../database/database.service'
import { runMigrations } from '../database/migrate'
import { PortableExportDatabaseSnapshotService } from './portable-export-database-snapshot'

describe('portable export bounded PostgreSQL snapshot', () => {
  const config = getRuntimeConfig()
  const pool = new Pool({ connectionString: config.databaseUrl })
  const database = new DatabaseService()
  const snapshots = new PortableExportDatabaseSnapshotService(database)
  const users = new Set<string>()

  const createUser = async (status: 'active' | 'disabled' = 'active') => {
    const id = randomUUID()
    users.add(id)
    await pool.query('INSERT INTO users (id, status) VALUES ($1, $2)', [id, status])
    return id
  }

  const createRecord = async (
    userId: string,
    occurredAt: string,
    value: number,
    createdAt = occurredAt,
  ) => {
    const id = randomUUID()
    await pool.query(
      `INSERT INTO health_records (
         id, user_id, metric, canonical_value, canonical_unit,
         display_value, display_unit, source_kind, source_metadata,
         confidence, status, occurred_at, timezone, idempotency_key, request_hash,
         created_at, updated_at
       ) VALUES (
         $1, $2, 'body.weight', $3, 'kg', $3, 'kg', 'manual', '{}'::jsonb,
         NULL, 'confirmed', $4::timestamptz, 'Asia/Shanghai', $5, repeat('a', 64),
         $6::timestamptz, $6::timestamptz
       )`,
      [id, userId, value, occurredAt, `snapshot-${randomUUID()}`, createdAt],
    )
    return id
  }

  beforeAll(async () => {
    await runMigrations(config.databaseUrl)
  })

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[...users]])
    await database.onModuleDestroy()
    await pool.end()
  })

  it('keeps one owner snapshot stable across keyset pages without timestamp round-trips', async () => {
    const userId = await createUser()
    const otherUserId = await createUser()
    const occurredAt = [
      '2026-08-11T01:00:00.000001Z',
      '2026-08-11T01:00:00.000002Z',
      '2026-08-11T01:00:00.000003Z',
      '2026-08-11T01:00:00.000004Z',
      '2026-08-11T01:00:00.000005Z',
    ]
    const originalIds: string[] = []
    for (let index = 0; index < occurredAt.length; index += 1) {
      originalIds.push(await createRecord(userId, occurredAt[index]!, 70 + index))
    }
    await createRecord(otherUserId, '2026-08-11T01:00:00.000003Z', 999)

    const session = snapshots.createHealthRecordSnapshot(userId, { batchRows: 2 })
    const iterator = session.rows[Symbol.asyncIterator]()
    const first = await iterator.next()
    expect(first).toMatchObject({ done: false, value: { id: originalIds[0] } })

    const concurrentId = await createRecord(userId, '2026-08-11T01:00:00.0000035Z', 88)
    await pool.query(
      'UPDATE health_records SET canonical_value = 123, display_value = 123 WHERE id = $1',
      [originalIds[3]],
    )

    const rows = [first.value!]
    while (true) {
      const next = await iterator.next()
      if (next.done) break
      rows.push(next.value)
    }

    expect(rows.map((row) => row.id)).toEqual(originalIds)
    expect(rows[3]?.canonical_value).toBe(73)
    expect(rows.some((row) => row.id === concurrentId)).toBe(false)
    await expect(session.receipt).resolves.toEqual({ batchRows: 2, batchCount: 3, rowCount: 5 })
  })

  it('fails closed for an inactive owner and for cancellation between rows', async () => {
    const disabledUserId = await createUser('disabled')
    const inactive = snapshots.createHealthRecordSnapshot(disabledUserId)
    const inactiveReceipt = expect(inactive.receipt).rejects.toThrowError(
      'active account not found',
    )
    await expect(
      (async () => {
        for await (const _ of inactive.rows) {
          // No row may be exposed for an inactive owner.
        }
      })(),
    ).rejects.toThrowError('active account not found')
    await inactiveReceipt

    const activeUserId = await createUser()
    await createRecord(activeUserId, '2026-08-11T02:00:00.000001Z', 70)
    await createRecord(activeUserId, '2026-08-11T02:00:00.000002Z', 71)
    const abort = new AbortController()
    const cancelled = snapshots.createHealthRecordSnapshot(activeUserId, {
      batchRows: 1,
      signal: abort.signal,
    })
    const cancelledIterator = cancelled.rows[Symbol.asyncIterator]()
    await expect(cancelledIterator.next()).resolves.toMatchObject({ done: false })
    abort.abort(new Error('snapshot cancelled by lease owner'))
    const cancelledReceipt = expect(cancelled.receipt).rejects.toThrowError(
      'snapshot cancelled by lease owner',
    )
    await expect(cancelledIterator.next()).rejects.toThrowError('snapshot cancelled by lease owner')
    await cancelledReceipt
  })
})
