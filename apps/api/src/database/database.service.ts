import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg'

import { getRuntimeConfig } from '../config'

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool = new Pool({
    connectionString: getRuntimeConfig().databaseUrl,
    max: 10,
  })

  query<T extends QueryResultRow>(text: string, values: unknown[] = []): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, values)
  }

  async ping() {
    await this.pool.query('SELECT 1')
  }

  async withTransaction<T>(operation: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await operation(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  streamReadOnlyRepeatableRead<T>(
    operation: (client: PoolClient) => AsyncIterable<T>,
  ): AsyncIterable<T> {
    const pool = this.pool

    return (async function* () {
      const client = await pool.connect()
      let transactionOpen = false
      let operationFailed = false
      let operationError: unknown

      try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
        transactionOpen = true
        for await (const value of operation(client)) yield value
        await client.query('COMMIT')
        transactionOpen = false
      } catch (error) {
        operationFailed = true
        operationError = error
      } finally {
        let rollbackError: unknown
        let releaseError: unknown
        if (transactionOpen) {
          try {
            await client.query('ROLLBACK')
          } catch (error) {
            rollbackError = error
          }
        }
        try {
          client.release()
        } catch (error) {
          releaseError = error
        }

        if (operationFailed) {
          const errors = [operationError, rollbackError, releaseError].filter(
            (error) => error !== undefined,
          )
          if (errors.length > 1) {
            throw new AggregateError(
              errors,
              'read-only repeatable-read stream and transaction cleanup both failed',
            )
          }
          throw operationError
        }
        if (rollbackError !== undefined) throw rollbackError
        if (releaseError !== undefined) throw releaseError
      }
    })()
  }

  async onModuleDestroy() {
    await this.pool.end()
  }
}
