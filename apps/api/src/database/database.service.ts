import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { Pool, type QueryResult, type QueryResultRow } from 'pg'

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

  async onModuleDestroy() {
    await this.pool.end()
  }
}
