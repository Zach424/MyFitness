import { readFile } from 'node:fs/promises'
import path from 'node:path'

import {
  ageBands,
  dietaryPreferenceOptions,
  equipmentOptions,
  experienceLevels,
  metricCodes,
  primaryGoals,
  riskFlags,
  sexForCalculationOptions,
  sourceKinds,
  unitCodes,
  unitSystems,
  weekdays,
} from '@myfitness/contracts'
import { describe, expect, it } from 'vitest'

const migrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0001_health_records.sql',
)
const onboardingMigrationPath = path.resolve(
  __dirname,
  '../../../../infra/postgres/migrations/0002_users_onboarding.sql',
)

describe('health-record migration drift', () => {
  it('contains every contract metric, unit and source kind', async () => {
    const migration = await readFile(migrationPath, 'utf8')

    for (const value of [...metricCodes, ...unitCodes, ...sourceKinds]) {
      expect(migration, `${value} is missing from the migration`).toContain(`'${value}'`)
    }
  })

  it('contains every onboarding enum at the database boundary', async () => {
    const migration = await readFile(onboardingMigrationPath, 'utf8')
    const values = [
      ...ageBands,
      ...sexForCalculationOptions,
      ...unitSystems,
      ...primaryGoals,
      ...experienceLevels,
      ...weekdays,
      ...equipmentOptions,
      ...dietaryPreferenceOptions,
      ...riskFlags,
    ]

    for (const value of values) {
      expect(migration, `${value} is missing from the onboarding migration`).toContain(`'${value}'`)
    }
  })
})
