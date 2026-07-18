import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { metricCodes, sourceKinds, unitCodes } from '@myfitness/contracts'
import { describe, expect, it } from 'vitest'

const migrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0001_health_records.sql',
)

describe('health-record migration drift', () => {
  it('contains every contract metric, unit and source kind', async () => {
    const migration = await readFile(migrationPath, 'utf8')

    for (const value of [...metricCodes, ...unitCodes, ...sourceKinds]) {
      expect(migration, `${value} is missing from the migration`).toContain(`'${value}'`)
    }
  })
})
