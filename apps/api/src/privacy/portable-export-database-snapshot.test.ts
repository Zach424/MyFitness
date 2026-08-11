import { describe, expect, it } from 'vitest'
import type { PoolClient } from 'pg'

import type { DatabaseService } from '../database/database.service'
import {
  PortableExportDatabaseSnapshotService,
  PortableExportSnapshotPayloadTooLargeError,
  portableExportSnapshotMaximumPayloadBytes,
} from './portable-export-database-snapshot'

const fakeDatabase = (values: Array<Record<string, unknown>>) =>
  ({
    streamReadOnlyRepeatableRead: (operation: (client: PoolClient) => AsyncIterable<unknown>) => {
      const client = {
        query: async (sql: string, parameters: unknown[]) => {
          if (sql.startsWith('SELECT id FROM users')) return { rows: [{ id: parameters[0] }] }
          const anchorId = parameters[1] as string | null
          const batchRows = parameters[2] as number
          const maximumPayloadBytes = parameters[3] as number
          const anchorIndex = anchorId ? values.findIndex((value) => value.id === anchorId) : -1
          return {
            rows: values.slice(anchorIndex + 1, anchorIndex + 1 + batchRows).map((payload) => {
              const payloadText = JSON.stringify(payload)
              const payloadByteLength = Buffer.byteLength(payloadText)
              return {
                id: payload.id,
                payload_text: payloadByteLength <= maximumPayloadBytes ? payloadText : null,
                payload_byte_length: payloadByteLength,
              }
            }),
          }
        },
      } as unknown as PoolClient
      return operation(client)
    },
  }) as unknown as DatabaseService

const fakeHealthHistoryDatabase = (
  healthRecords: Array<Record<string, unknown>>,
  healthRecordRevisions: Array<Record<string, unknown>>,
  consentEvents: Array<Record<string, unknown>> = [],
) => {
  const lifecycle = {
    accountQueries: 0,
    streamCount: 0,
    committed: false,
    rolledBack: false,
  }
  const database = {
    streamReadOnlyRepeatableRead: (operation: (client: PoolClient) => AsyncIterable<unknown>) => {
      lifecycle.streamCount += 1
      const client = {
        query: async (sql: string, parameters: unknown[]) => {
          if (sql.startsWith('SELECT id FROM users')) {
            lifecycle.accountQueries += 1
            return { rows: [{ id: parameters[0] }] }
          }
          const values = sql.includes('FROM consent_events')
            ? consentEvents
            : sql.includes('FROM health_record_revisions')
              ? healthRecordRevisions
              : healthRecords
          const anchorId = parameters[1] as string | null
          const batchRows = parameters[2] as number
          const maximumPayloadBytes = parameters[3] as number
          const anchorIndex = anchorId ? values.findIndex((value) => value.id === anchorId) : -1
          return {
            rows: values.slice(anchorIndex + 1, anchorIndex + 1 + batchRows).map((payload) => {
              const payloadText = JSON.stringify(payload)
              const payloadByteLength = Buffer.byteLength(payloadText)
              return {
                id: payload.id,
                payload_text: payloadByteLength <= maximumPayloadBytes ? payloadText : null,
                payload_byte_length: payloadByteLength,
              }
            }),
          }
        },
      } as unknown as PoolClient

      return (async function* () {
        let completed = false
        try {
          for await (const value of operation(client)) yield value
          completed = true
          lifecycle.committed = true
        } finally {
          if (!completed) lifecycle.rolledBack = true
        }
      })()
    },
  } as unknown as DatabaseService
  return { database, lifecycle }
}

describe('portable export database snapshot session', () => {
  it('publishes a bounded receipt only after every row is consumed', async () => {
    const service = new PortableExportDatabaseSnapshotService(
      fakeDatabase(Array.from({ length: 5 }, (_, index) => ({ id: `record-${index}` }))),
    )
    const session = service.createHealthRecordSnapshot('11111111-1111-4111-8111-111111111111', {
      batchRows: 2,
    })
    let receiptSettled = false
    void session.receipt.finally(() => {
      receiptSettled = true
    })
    const rows: Array<Record<string, unknown>> = []

    for await (const row of session.rows) {
      rows.push(row)
      expect(receiptSettled).toBe(false)
    }

    expect(rows).toHaveLength(5)
    await expect(session.receipt).resolves.toEqual({
      batchRows: 2,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      batchCount: 3,
      rowCount: 5,
    })
  })

  it('applies the shared bounded receipt to health record revisions', async () => {
    const service = new PortableExportDatabaseSnapshotService(
      fakeDatabase([{ id: 'revision-1' }, { id: 'revision-2' }, { id: 'revision-3' }]),
    )
    const session = service.createHealthRecordRevisionSnapshot(
      '11111111-1111-4111-8111-111111111111',
      { batchRows: 2 },
    )
    const rows: Array<Record<string, unknown>> = []

    for await (const row of session.rows) rows.push(row)

    expect(rows.map((row) => row.id)).toEqual(['revision-1', 'revision-2', 'revision-3'])
    await expect(session.receipt).resolves.toEqual({
      batchRows: 2,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      batchCount: 2,
      rowCount: 3,
    })
  })

  it('applies the shared bounded receipt to consent events', async () => {
    const service = new PortableExportDatabaseSnapshotService(
      fakeDatabase([{ id: 'consent-1' }, { id: 'consent-2' }, { id: 'consent-3' }]),
    )
    const session = service.createConsentEventSnapshot('11111111-1111-4111-8111-111111111111', {
      batchRows: 2,
    })
    const rows: Array<Record<string, unknown>> = []

    for await (const row of session.rows) rows.push(row)

    expect(rows.map((row) => row.id)).toEqual(['consent-1', 'consent-2', 'consent-3'])
    await expect(session.receipt).resolves.toEqual({
      batchRows: 2,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      batchCount: 2,
      rowCount: 3,
    })
  })

  it('applies the shared bounded receipt to workout headers', async () => {
    const service = new PortableExportDatabaseSnapshotService(
      fakeDatabase([{ id: 'workout-1' }, { id: 'workout-2' }, { id: 'workout-3' }]),
    )
    const session = service.createWorkoutHeaderSnapshot('11111111-1111-4111-8111-111111111111', {
      batchRows: 2,
    })
    const rows: Array<Record<string, unknown>> = []

    for await (const row of session.rows) rows.push(row)

    expect(rows.map((row) => row.id)).toEqual(['workout-1', 'workout-2', 'workout-3'])
    await expect(session.receipt).resolves.toEqual({
      batchRows: 2,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      batchCount: 2,
      rowCount: 3,
    })
  })

  it('rejects invalid batch and payload limits before opening a database stream', () => {
    const service = new PortableExportDatabaseSnapshotService(fakeDatabase([]))

    expect(() =>
      service.createHealthRecordSnapshot('11111111-1111-4111-8111-111111111111', {
        batchRows: 0,
      }),
    ).toThrowError(RangeError)
    expect(() =>
      service.createHealthRecordSnapshot('11111111-1111-4111-8111-111111111111', {
        batchRows: 101,
      }),
    ).toThrowError(RangeError)
    expect(() =>
      service.createHealthRecordSnapshot('11111111-1111-4111-8111-111111111111', {
        maximumPayloadBytes: 0,
      }),
    ).toThrowError(RangeError)
    expect(() =>
      service.createHealthRecordSnapshot('11111111-1111-4111-8111-111111111111', {
        maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes + 1,
      }),
    ).toThrowError(RangeError)
  })

  it('rejects an oversized database payload without exposing its content', async () => {
    const service = new PortableExportDatabaseSnapshotService(
      fakeDatabase([{ id: 'oversized', secret: 'do-not-transfer'.repeat(100) }]),
    )
    const session = service.createHealthRecordSnapshot('11111111-1111-4111-8111-111111111111', {
      maximumPayloadBytes: 128,
    })
    const receiptFailure = session.receipt.catch((error: unknown) => error)
    let streamFailure: unknown

    try {
      await session.rows[Symbol.asyncIterator]().next()
    } catch (error) {
      streamFailure = error
    }

    expect(streamFailure).toBeInstanceOf(PortableExportSnapshotPayloadTooLargeError)
    expect(streamFailure).toMatchObject({
      code: 'portable_export_snapshot_payload_too_large',
      maximumBytes: 128,
    })
    expect((streamFailure as Error).message).not.toContain('oversized')
    expect((streamFailure as Error).message).not.toContain('do-not-transfer')
    expect(await receiptFailure).toBe(streamFailure)
  })

  it('accepts a payload whose UTF-8 length is exactly the configured boundary', async () => {
    const payload = { id: 'exact-boundary', note: '含 UTF-8 文本' }
    const maximumPayloadBytes = Buffer.byteLength(JSON.stringify(payload))
    const service = new PortableExportDatabaseSnapshotService(fakeDatabase([payload]))
    const session = service.createHealthRecordSnapshot('11111111-1111-4111-8111-111111111111', {
      maximumPayloadBytes,
    })
    const rows: Array<Record<string, unknown>> = []

    for await (const row of session.rows) rows.push(row)

    expect(rows).toEqual([payload])
    await expect(session.receipt).resolves.toEqual({
      batchRows: 25,
      maximumPayloadBytes,
      batchCount: 1,
      rowCount: 1,
    })
  })

  it('rejects the receipt when the consumer stops before physical EOF', async () => {
    const service = new PortableExportDatabaseSnapshotService(fakeDatabase([{ id: 'one' }]))
    const session = service.createHealthRecordSnapshot('11111111-1111-4111-8111-111111111111')
    const iterator = session.rows[Symbol.asyncIterator]()

    await expect(iterator.next()).resolves.toEqual({ done: false, value: { id: 'one' } })
    const receiptRejection = expect(session.receipt).rejects.toThrowError(
      'portable export database snapshot did not complete',
    )
    await iterator.return?.()
    await receiptRejection
  })

  it('coordinates both health collections in one stream and commits only after root completion', async () => {
    const { database, lifecycle } = fakeHealthHistoryDatabase(
      [{ id: 'record-1' }, { id: 'record-2' }],
      [{ id: 'revision-1' }],
    )
    const service = new PortableExportDatabaseSnapshotService(database)
    const session = service.createHealthHistorySnapshot('11111111-1111-4111-8111-111111111111', {
      batchRows: 1,
    })
    const records: Array<Record<string, unknown>> = []
    const revisions: Array<Record<string, unknown>> = []

    for await (const row of session.healthRecords) records.push(row)
    expect(lifecycle.committed).toBe(false)
    for await (const row of session.healthRecordRevisions) revisions.push(row)
    expect(lifecycle.committed).toBe(false)

    await session.complete()

    expect(records.map((row) => row.id)).toEqual(['record-1', 'record-2'])
    expect(revisions.map((row) => row.id)).toEqual(['revision-1'])
    expect(lifecycle).toMatchObject({
      accountQueries: 1,
      streamCount: 1,
      committed: true,
      rolledBack: false,
    })
    await expect(session.receipt).resolves.toEqual({
      batchRows: 1,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      healthRecords: { batchCount: 2, rowCount: 2 },
      healthRecordRevisions: { batchCount: 1, rowCount: 1 },
    })
  })

  it('drives consent and health collections from one ordered coordinator', async () => {
    const { database, lifecycle } = fakeHealthHistoryDatabase(
      [{ id: 'record-1' }],
      [{ id: 'revision-1' }],
      [{ id: 'consent-1' }, { id: 'consent-2' }],
    )
    const service = new PortableExportDatabaseSnapshotService(database)
    const session = service.createConsentHealthSnapshot('11111111-1111-4111-8111-111111111111', {
      batchRows: 1,
    })
    const consentEvents: Array<Record<string, unknown>> = []
    const healthRecords: Array<Record<string, unknown>> = []
    const healthRecordRevisions: Array<Record<string, unknown>> = []

    for await (const row of session.consentEvents) consentEvents.push(row)
    for await (const row of session.healthRecords) healthRecords.push(row)
    for await (const row of session.healthRecordRevisions) healthRecordRevisions.push(row)
    expect(lifecycle.committed).toBe(false)

    await session.complete()

    expect(consentEvents.map((row) => row.id)).toEqual(['consent-1', 'consent-2'])
    expect(healthRecords.map((row) => row.id)).toEqual(['record-1'])
    expect(healthRecordRevisions.map((row) => row.id)).toEqual(['revision-1'])
    expect(lifecycle).toMatchObject({
      accountQueries: 1,
      streamCount: 1,
      committed: true,
      rolledBack: false,
    })
    await expect(session.receipt).resolves.toEqual({
      batchRows: 1,
      maximumPayloadBytes: portableExportSnapshotMaximumPayloadBytes,
      consentEvents: { batchCount: 2, rowCount: 2 },
      healthRecords: { batchCount: 1, rowCount: 1 },
      healthRecordRevisions: { batchCount: 1, rowCount: 1 },
    })
  })

  it('fails closed when a coordinated collection is skipped', async () => {
    const { database, lifecycle } = fakeHealthHistoryDatabase(
      [{ id: 'record-1' }],
      [{ id: 'revision-1' }],
      [{ id: 'consent-1' }],
    )
    const service = new PortableExportDatabaseSnapshotService(database)
    const session = service.createConsentHealthSnapshot('11111111-1111-4111-8111-111111111111')
    for await (const _ of session.consentEvents) {
      // Reach the first boundary, then deliberately skip health records.
    }
    const receiptFailure = session.receipt.catch((error: unknown) => error)
    let streamFailure: unknown

    try {
      await session.healthRecordRevisions[Symbol.asyncIterator]().next()
    } catch (error) {
      streamFailure = error
    }

    expect(streamFailure).toMatchObject({
      message: 'portable export coordinated snapshot collections must be read once in order',
    })
    expect(await receiptFailure).toBe(streamFailure)
    expect(lifecycle).toMatchObject({ committed: false, rolledBack: true })
  })

  it('rolls back the shared stream with one root cause when cancelled between collections', async () => {
    const { database, lifecycle } = fakeHealthHistoryDatabase(
      [{ id: 'record-1' }],
      [{ id: 'revision-1' }],
    )
    const service = new PortableExportDatabaseSnapshotService(database)
    const session = service.createHealthHistorySnapshot('11111111-1111-4111-8111-111111111111')
    for await (const _ of session.healthRecords) {
      // Finish the first collection and leave the transaction between fields.
    }
    const cancellation = new Error('portable export root was cancelled between fields')
    const receiptFailure = session.receipt.catch((error: unknown) => error)

    await session.cancel(cancellation)

    expect(lifecycle).toMatchObject({ committed: false, rolledBack: true })
    expect(await receiptFailure).toBe(cancellation)
  })
})
