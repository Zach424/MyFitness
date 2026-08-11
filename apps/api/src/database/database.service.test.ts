import type { PoolClient } from 'pg'
import { describe, expect, it, vi } from 'vitest'

import { DatabaseService } from './database.service'

const databaseWithClient = (client: Pick<PoolClient, 'query' | 'release'>) => {
  const database = Object.create(DatabaseService.prototype) as DatabaseService
  Object.defineProperty(database, 'pool', {
    value: { connect: vi.fn().mockResolvedValue(client) },
  })
  return database
}

describe('DatabaseService read-only repeatable-read streams', () => {
  it('commits only after the operation reaches physical completion', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    const release = vi.fn()
    const database = databaseWithClient({ query, release } as unknown as PoolClient)
    const observed: number[] = []

    for await (const value of database.streamReadOnlyRepeatableRead(async function* () {
      yield 1
      yield 2
    })) {
      observed.push(value)
      expect(query).not.toHaveBeenCalledWith('COMMIT')
    }

    expect(observed).toEqual([1, 2])
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',
      'COMMIT',
    ])
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('rolls back and releases the client when the consumer stops early', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    const release = vi.fn()
    const database = databaseWithClient({ query, release } as unknown as PoolClient)
    const iterator = database
      .streamReadOnlyRepeatableRead(async function* () {
        yield 'first'
        yield 'second'
      })
      [Symbol.asyncIterator]()

    await expect(iterator.next()).resolves.toEqual({ done: false, value: 'first' })
    await expect(iterator.return?.()).resolves.toEqual({ done: true, value: undefined })

    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',
      'ROLLBACK',
    ])
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('preserves the operation and rollback errors in deterministic order', async () => {
    const operationError = new Error('snapshot query failed')
    const rollbackError = new Error('rollback failed')
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql === 'ROLLBACK') throw rollbackError
      return { rows: [] }
    })
    const release = vi.fn()
    const database = databaseWithClient({ query, release } as unknown as PoolClient)

    const consume = async () => {
      for await (const _ of database.streamReadOnlyRepeatableRead(async function* () {
        throw operationError
        yield undefined
      })) {
        // The source fails before producing a value.
      }
    }

    const failure = await consume().catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(AggregateError)
    expect((failure as AggregateError).errors).toEqual([operationError, rollbackError])
    expect(release).toHaveBeenCalledTimes(1)
  })
})
