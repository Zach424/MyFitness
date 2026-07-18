import { createHash, randomUUID } from 'node:crypto'

import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import type {
  CreateHealthRecord,
  HealthRecord,
  MetricCode,
  RecordSource,
  UnitCode,
} from '@myfitness/contracts'
import { MeasurementError, normalizeMeasurement } from '@myfitness/domain'

import { DatabaseService } from '../database/database.service'

type HealthRecordRow = {
  id: string
  user_id: string
  metric: MetricCode
  canonical_value: string
  canonical_unit: UnitCode
  display_value: string
  display_unit: UnitCode
  source_kind: RecordSource['kind']
  source_metadata: Record<string, string>
  confidence: string | null
  status: HealthRecord['status']
  occurred_at: Date
  timezone: string
  revision: number
  created_at: Date
  updated_at: Date
  request_hash: string
}

const mapRow = (row: HealthRecordRow): HealthRecord => {
  const metadata = row.source_metadata ?? {}
  return {
    id: row.id,
    userId: row.user_id,
    metric: row.metric,
    canonicalValue: Number(row.canonical_value),
    canonicalUnit: row.canonical_unit,
    displayValue: Number(row.display_value),
    displayUnit: row.display_unit,
    source: {
      kind: row.source_kind,
      ...(Object.keys(metadata).length ? { metadata } : {}),
    },
    confidence: row.confidence === null ? null : Number(row.confidence),
    status: row.status,
    occurredAt: row.occurred_at.toISOString(),
    timezone: row.timezone,
    revision: row.revision,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

@Injectable()
export class HealthRecordsService {
  constructor(private readonly database: DatabaseService) {}

  async create(userId: string, idempotencyKey: string, input: CreateHealthRecord) {
    let measurement: ReturnType<typeof normalizeMeasurement>
    try {
      measurement = normalizeMeasurement(input.metric, input.value, input.unit)
    } catch (error) {
      if (error instanceof MeasurementError) {
        throw new BadRequestException(error.message)
      }
      throw error
    }

    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex')
    const result = await this.database.query<HealthRecordRow>(
      `
        INSERT INTO health_records (
          id, user_id, metric, canonical_value, canonical_unit,
          display_value, display_unit, source_kind, source_metadata,
          confidence, status, occurred_at, timezone, idempotency_key, request_hash
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9::jsonb,
          $10, $11, $12, $13, $14, $15
        )
        ON CONFLICT (user_id, idempotency_key) DO NOTHING
        RETURNING *
      `,
      [
        randomUUID(),
        userId,
        input.metric,
        measurement.canonicalValue,
        measurement.canonicalUnit,
        measurement.displayValue,
        measurement.displayUnit,
        input.source.kind,
        JSON.stringify(input.source.metadata ?? {}),
        input.confidence ?? null,
        input.status,
        input.occurredAt,
        input.timezone,
        idempotencyKey,
        requestHash,
      ],
    )

    if (result.rows[0]) return mapRow(result.rows[0])

    const existing = await this.database.query<HealthRecordRow>(
      'SELECT * FROM health_records WHERE user_id = $1 AND idempotency_key = $2',
      [userId, idempotencyKey],
    )
    const row = existing.rows[0]
    if (!row) throw new ConflictException('idempotency conflict could not be resolved')
    if (row.request_hash !== requestHash) {
      throw new ConflictException('idempotency key was already used for a different request')
    }
    return mapRow(row)
  }

  async list(userId: string) {
    const result = await this.database.query<HealthRecordRow>(
      `
        SELECT * FROM health_records
        WHERE user_id = $1
        ORDER BY occurred_at DESC, created_at DESC
        LIMIT 100
      `,
      [userId],
    )

    return { items: result.rows.map(mapRow) }
  }
}
