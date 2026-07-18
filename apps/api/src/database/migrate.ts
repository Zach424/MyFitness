import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import { Pool } from 'pg'

import { getRuntimeConfig } from '../config'

const defaultMigrationsDirectory = path.resolve(__dirname, '../../../../infra/postgres/migrations')

export const runMigrations = async (
  connectionString = getRuntimeConfig().databaseUrl,
  migrationsDirectory = defaultMigrationsDirectory,
) => {
  const pool = new Pool({ connectionString, max: 1 })

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        checksum CHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    const migrationNames = (await readdir(migrationsDirectory))
      .filter((name) => name.endsWith('.sql'))
      .sort()

    for (const name of migrationNames) {
      const sql = await readFile(path.join(migrationsDirectory, name), 'utf8')
      const checksum = createHash('sha256').update(sql).digest('hex')
      const existing = await pool.query<{ checksum: string }>(
        'SELECT checksum FROM schema_migrations WHERE name = $1',
        [name],
      )

      if (existing.rowCount) {
        if (existing.rows[0]?.checksum !== checksum) {
          throw new Error(`migration drift detected for ${name}`)
        }
        continue
      }

      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [
          name,
          checksum,
        ])
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    }

    return migrationNames
  } finally {
    await pool.end()
  }
}

if (require.main === module) {
  runMigrations()
    .then((migrations) => {
      process.stdout.write(`Applied/verified ${migrations.length} migration(s).\n`)
    })
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    })
}
