import { describe, expect, it } from 'vitest'
import type { PoolClient } from 'pg'

import type { DatabaseService } from '../database/database.service'
import { PortableExportDatabaseSnapshotService } from './portable-export-database-snapshot'

const fakeDatabase = (values: Array<Record<string, unknown>>) =>
  ({
    streamReadOnlyRepeatableRead: (operation: (client: PoolClient) => AsyncIterable<unknown>) => {
      const client = {
        query: async (sql: string, parameters: unknown[]) => {
          if (sql.startsWith('SELECT id FROM users')) return { rows: [{ id: parameters[0] }] }
          const anchorId = parameters[1] as string | null
          const batchRows = parameters[2] as number
          const anchorIndex = anchorId ? values.findIndex((value) => value.id === anchorId) : -1
          return {
            rows: values.slice(anchorIndex + 1, anchorIndex + 1 + batchRows).map((payload) => ({
              id: payload.id,
              payload,
            })),
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
    await expect(session.receipt).resolves.toEqual({ batchRows: 2, batchCount: 3, rowCount: 5 })
  })

  it('rejects invalid batch sizes before opening a database stream', () => {
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
