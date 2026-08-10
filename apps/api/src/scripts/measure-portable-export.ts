import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'

import { HttpException, HttpStatus } from '@nestjs/common'
import { maximumPrivacyExportBytes, privacyExportTooLargeCode } from '@myfitness/contracts'

import { createApplication } from '../bootstrap'
import { getRuntimeConfig } from '../config'
import { DatabaseService } from '../database/database.service'
import { runMigrations } from '../database/migrate'
import {
  assertLocalPortableExportMeasurementDatabase,
  createPortableExportMeasurementReceipt,
  parsePortableExportMeasurementRecords,
} from '../privacy/portable-export-measurement'
import { serializePortableExport } from '../privacy/portable-export-artifact'
import { PrivacyService } from '../privacy/privacy.service'

const config = getRuntimeConfig()
const databaseUrl = assertLocalPortableExportMeasurementDatabase(config.databaseUrl)
const recordCount = parsePortableExportMeasurementRecords(
  process.env.PORTABLE_EXPORT_MEASURE_RECORDS,
)
const userId = randomUUID()

const run = async () => {
  await runMigrations(databaseUrl)
  const app = await createApplication(false, 'metadata')
  await app.init()
  const database = app.get(DatabaseService)

  try {
    await database.query('INSERT INTO users (id) VALUES ($1)', [userId])
    await database.query(
      `INSERT INTO health_records (
         id, user_id, metric, canonical_value, canonical_unit, display_value, display_unit,
         source_kind, source_metadata, confidence, status, occurred_at, timezone, revision,
         idempotency_key, request_hash
       )
       SELECT gen_random_uuid(), $1, 'body.weight',
              65 + ((sample % 200)::numeric / 10), 'kg',
              65 + ((sample % 200)::numeric / 10), 'kg',
              'manual',
              jsonb_build_object(
                'fixture', 'portable_export_measurement',
                'sequence', sample,
                'device', repeat('x', 48)
              ),
              NULL, 'confirmed',
              TIMESTAMPTZ '2025-01-01T00:00:00Z' + (sample * INTERVAL '1 minute'),
              'UTC', 1,
              'measure-' || lpad(sample::text, 8, '0'),
              repeat('0', 64)
       FROM generate_series(1, $2::integer) AS sample`,
      [userId, recordCount],
    )

    const memoryBefore = process.memoryUsage()
    const startedAt = performance.now()
    let outcome:
      | { status: 'accepted'; artifactBytes: number }
      | { status: 'refused'; code: typeof privacyExportTooLargeCode; maximumBytes: number }
    try {
      const payload = await app.get(PrivacyService).portableExport(userId)
      if (payload.data.healthRecords.length !== recordCount) {
        throw new Error('portable export measurement fixture count drifted')
      }
      const artifact = serializePortableExport(payload)
      outcome = { status: 'accepted', artifactBytes: artifact.byteLength }
    } catch (error) {
      if (!(error instanceof HttpException) || error.getStatus() !== HttpStatus.PAYLOAD_TOO_LARGE) {
        throw error
      }
      const response = error.getResponse() as { code?: unknown; maximumBytes?: unknown }
      if (
        response.code !== privacyExportTooLargeCode ||
        response.maximumBytes !== maximumPrivacyExportBytes
      ) {
        throw error
      }
      outcome = {
        status: 'refused',
        code: privacyExportTooLargeCode,
        maximumBytes: maximumPrivacyExportBytes,
      }
    }
    const durationMs = performance.now() - startedAt
    const memoryAfter = process.memoryUsage()
    const receipt = createPortableExportMeasurementReceipt({
      generatedAt: new Date().toISOString(),
      fixture: {
        kind: 'synthetic_confirmed_health_records',
        recordCount,
        includesMedia: false,
      },
      outcome,
      durationMs,
      memory: {
        rssBeforeBytes: memoryBefore.rss,
        rssAfterBytes: memoryAfter.rss,
        heapUsedBeforeBytes: memoryBefore.heapUsed,
        heapUsedAfterBytes: memoryAfter.heapUsed,
        processMaxRssKiB: process.resourceUsage().maxRSS,
      },
      runtime: { node: process.version, platform: process.platform, arch: process.arch },
    })
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`)
  } finally {
    try {
      await database.query('DELETE FROM users WHERE id = $1', [userId])
    } finally {
      await app.close()
    }
  }
}

void run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'measurement failed'}\n`)
  process.exitCode = 1
})
