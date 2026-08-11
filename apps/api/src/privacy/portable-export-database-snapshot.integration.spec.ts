import { createHash, randomUUID } from 'node:crypto'

import { privacyExportSchema, privacyExportSchemaVersion } from '@myfitness/contracts'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getRuntimeConfig } from '../config'
import { DatabaseService } from '../database/database.service'
import { runMigrations } from '../database/migrate'
import { serializePortableExport } from './portable-export-artifact'
import {
  PortableExportDatabaseSnapshotService,
  PortableExportSnapshotPayloadTooLargeError,
  portableExportSnapshotMaximumPayloadBytes,
} from './portable-export-database-snapshot'
import {
  createPortableExportJsonStream,
  portableExportJsonAsyncArray,
} from './portable-export-json-stream'

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
    sourceMetadata: Record<string, string> = {},
  ) => {
    const id = randomUUID()
    await pool.query(
      `INSERT INTO health_records (
         id, user_id, metric, canonical_value, canonical_unit,
         display_value, display_unit, source_kind, source_metadata,
         confidence, status, occurred_at, timezone, idempotency_key, request_hash,
         created_at, updated_at
       ) VALUES (
         $1, $2, 'body.weight', $3, 'kg', $3, 'kg', 'manual', $7::jsonb,
         NULL, 'confirmed', $4::timestamptz, 'Asia/Shanghai', $5, repeat('a', 64),
         $6::timestamptz, $6::timestamptz
       )`,
      [
        id,
        userId,
        value,
        occurredAt,
        `snapshot-${randomUUID()}`,
        createdAt,
        JSON.stringify(sourceMetadata),
      ],
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
    await expect(session.receipt).resolves.toEqual({
      batchRows: 2,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      batchCount: 3,
      rowCount: 5,
    })
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

  it('withholds an oversized row in PostgreSQL and propagates one root error through JSON', async () => {
    const userId = await createUser()
    const secretMarker = `must-not-cross-the-database-boundary-${randomUUID()}`
    const recordId = await createRecord(
      userId,
      '2026-08-11T02:30:00.000001Z',
      70,
      '2026-08-11T02:30:00.000001Z',
      { provider: `${secretMarker}-${'x'.repeat(2048)}` },
    )
    const measured = await pool.query<{ payload_byte_length: number }>(
      `SELECT octet_length(to_jsonb(record)::text) AS payload_byte_length
       FROM (
         SELECT id, metric, canonical_value, canonical_unit, display_value, display_unit,
                source_kind, source_metadata, confidence, status, occurred_at, timezone,
                revision, deleted_at, created_at, updated_at
         FROM health_records
         WHERE id = $1
       ) AS record`,
      [recordId],
    )
    const expectedPayloadBytes = measured.rows[0]!.payload_byte_length
    expect(expectedPayloadBytes).toBeGreaterThan(512)

    const snapshot = snapshots.createHealthRecordSnapshot(userId, {
      batchRows: 1,
      maximumPayloadBytes: 512,
    })
    const snapshotReceiptFailure = snapshot.receipt.catch((error: unknown) => error)
    const base = privacyExportSchema.parse({
      schemaVersion: privacyExportSchemaVersion,
      generatedAt: '2026-08-11T02:45:00.000Z',
      accountId: userId,
      data: {
        account: { id: userId },
        identities: [],
        profile: null,
        goal: null,
        consentEvents: [],
        healthRecords: [],
        healthRecordRevisions: [],
        exerciseCatalog: [],
        foodCatalog: [],
        workouts: [],
        nutritionMeals: [],
        nutritionFavorites: [],
        weeklyPlans: [],
        aiExplanationRuns: [],
        foodPhotoAnalyses: [],
        progressPhotos: [],
      },
    })
    const json = createPortableExportJsonStream(
      {
        ...base,
        data: {
          ...base.data,
          healthRecords: portableExportJsonAsyncArray(snapshot.rows),
        },
      },
      { chunkBytes: 64 },
    )
    const jsonReceiptFailure = json.receipt.catch((error: unknown) => error)
    const chunks: Buffer[] = []
    let streamFailure: unknown

    try {
      for await (const chunk of json.bytes) chunks.push(Buffer.from(chunk))
    } catch (error) {
      streamFailure = error
    }

    expect(streamFailure).toBeInstanceOf(PortableExportSnapshotPayloadTooLargeError)
    expect(streamFailure).toMatchObject({
      code: 'portable_export_snapshot_payload_too_large',
      maximumBytes: 512,
      actualBytes: expectedPayloadBytes,
    })
    expect(Buffer.concat(chunks).toString('utf8')).not.toContain(secretMarker)
    expect(await snapshotReceiptFailure).toBe(streamFailure)
    expect(await jsonReceiptFailure).toBe(streamFailure)
  })

  it('feeds the owner snapshot into a byte-compatible complete v4 JSON tree without an array copy', async () => {
    const userId = await createUser()
    await createRecord(userId, '2026-08-11T03:00:00.000001Z', 70)
    await createRecord(userId, '2026-08-11T03:00:00.000002Z', 71)
    await createRecord(userId, '2026-08-11T03:00:00.000003Z', 72)

    const eagerSnapshot = snapshots.createHealthRecordSnapshot(userId, { batchRows: 2 })
    const eagerRows: Array<Record<string, unknown>> = []
    for await (const row of eagerSnapshot.rows) eagerRows.push(row)
    await expect(eagerSnapshot.receipt).resolves.toEqual({
      batchRows: 2,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      batchCount: 2,
      rowCount: 3,
    })
    const eagerPayload = privacyExportSchema.parse({
      schemaVersion: privacyExportSchemaVersion,
      generatedAt: '2026-08-11T03:30:00.000Z',
      accountId: userId,
      data: {
        account: { id: userId, status: 'active' },
        identities: [],
        profile: null,
        goal: null,
        consentEvents: [],
        healthRecords: eagerRows,
        healthRecordRevisions: [],
        exerciseCatalog: [],
        foodCatalog: [],
        workouts: [],
        nutritionMeals: [],
        nutritionFavorites: [],
        weeklyPlans: [],
        aiExplanationRuns: [],
        foodPhotoAnalyses: [],
        progressPhotos: [],
      },
    })
    const expected = serializePortableExport(eagerPayload, Number.MAX_SAFE_INTEGER)

    const lazySnapshot = snapshots.createHealthRecordSnapshot(userId, { batchRows: 2 })
    const json = createPortableExportJsonStream(
      {
        ...eagerPayload,
        data: {
          ...eagerPayload.data,
          healthRecords: portableExportJsonAsyncArray(lazySnapshot.rows),
        },
      },
      { chunkBytes: 37 },
    )
    const chunks: Buffer[] = []
    for await (const chunk of json.bytes) {
      expect(chunk.length).toBeLessThanOrEqual(37)
      chunks.push(Buffer.from(chunk))
    }

    expect(Buffer.concat(chunks)).toEqual(expected)
    await expect(lazySnapshot.receipt).resolves.toEqual({
      batchRows: 2,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      batchCount: 2,
      rowCount: 3,
    })
    await expect(json.receipt).resolves.toEqual({
      schemaVersion: privacyExportSchemaVersion,
      chunkBytes: 37,
      byteLength: expected.length,
      sha256: createHash('sha256').update(expected).digest('hex'),
    })
  })

  it('rolls back the database snapshot when the composed JSON consumer stops early', async () => {
    const userId = await createUser()
    await createRecord(userId, '2026-08-11T04:00:00.000001Z', 70)
    await createRecord(userId, '2026-08-11T04:00:00.000002Z', 71)
    const snapshot = snapshots.createHealthRecordSnapshot(userId, { batchRows: 1 })
    let yieldedRows = 0
    const observedRows = (async function* () {
      for await (const row of snapshot.rows) {
        yieldedRows += 1
        yield row
      }
    })()
    const base = privacyExportSchema.parse({
      schemaVersion: privacyExportSchemaVersion,
      generatedAt: '2026-08-11T04:30:00.000Z',
      accountId: userId,
      data: {
        account: { id: userId },
        identities: [],
        profile: null,
        goal: null,
        consentEvents: [],
        healthRecords: [],
        healthRecordRevisions: [],
        exerciseCatalog: [],
        foodCatalog: [],
        workouts: [],
        nutritionMeals: [],
        nutritionFavorites: [],
        weeklyPlans: [],
        aiExplanationRuns: [],
        foodPhotoAnalyses: [],
        progressPhotos: [],
      },
    })
    const json = createPortableExportJsonStream(
      {
        ...base,
        data: {
          ...base.data,
          healthRecords: portableExportJsonAsyncArray(observedRows),
        },
      },
      { chunkBytes: 32 },
    )
    const iterator = json.bytes[Symbol.asyncIterator]()
    while (yieldedRows === 0) {
      await expect(iterator.next()).resolves.toMatchObject({ done: false })
    }
    const jsonReceiptRejection = expect(json.receipt).rejects.toThrowError(
      'portable export JSON stream did not complete',
    )
    const snapshotReceiptRejection = expect(snapshot.receipt).rejects.toThrowError(
      'portable export database snapshot did not complete',
    )

    await iterator.return?.()
    await Promise.all([jsonReceiptRejection, snapshotReceiptRejection])
  })
})
