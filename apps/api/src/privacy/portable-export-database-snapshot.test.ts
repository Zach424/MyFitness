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
})
