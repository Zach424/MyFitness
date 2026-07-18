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

  async onModuleDestroy() {
    await this.pool.end()
  }
}
