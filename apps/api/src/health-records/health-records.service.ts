import { createHash, randomUUID } from 'node:crypto'

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  CreateHealthRecord,
  HealthRecord,
  HealthRecordHistoryItem,
  MetricCode,
  RecordSource,
  UnitCode,
  UpdateHealthRecord,
} from '@myfitness/contracts'
import { MeasurementError, normalizeMeasurement } from '@myfitness/domain'
import type { PoolClient } from 'pg'

import { DatabaseService } from '../database/database.service'

type HealthRecordDataRow = {
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
}

type HealthRecordRow = HealthRecordDataRow & {
  request_hash: string
  deleted_at: Date | null
}

type HealthRecordRevisionRow = HealthRecordDataRow & {
  action: HealthRecordHistoryItem['action']
  changed_at: Date
}

const mapRow = (row: HealthRecordDataRow): HealthRecord => {
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

const normalizeInput = (input: CreateHealthRecord | UpdateHealthRecord) => {
  try {
    return normalizeMeasurement(input.metric, input.value, input.unit)
  } catch (error) {
    if (error instanceof MeasurementError) throw new BadRequestException(error.message)
    throw error
  }
}

const insertRevision = async (
  client: PoolClient,
  recordId: string,
  action: HealthRecordHistoryItem['action'],
) => {
  await client.query(
    `
      INSERT INTO health_record_revisions (
        id, record_id, user_id, action, revision, metric,
        canonical_value, canonical_unit, display_value, display_unit,
        source_kind, source_metadata, confidence, status,
        occurred_at, timezone, created_at, updated_at
      )
      SELECT
        $1, id, user_id, $2, revision, metric,
        canonical_value, canonical_unit, display_value, display_unit,
        source_kind, source_metadata, confidence, status,
        occurred_at, timezone, created_at, updated_at
      FROM health_records
      WHERE id = $3
    `,
    [randomUUID(), action, recordId],
  )
}

@Injectable()
export class HealthRecordsService {
  constructor(private readonly database: DatabaseService) {}

  async create(userId: string, idempotencyKey: string, input: CreateHealthRecord) {
    const measurement = normalizeInput(input)
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex')

    return this.database.withTransaction(async (client) => {
      const result = await client.query<HealthRecordRow>(
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

      const created = result.rows[0]
      if (created) {
        await insertRevision(client, created.id, 'created')
        return mapRow(created)
      }

      const existing = await client.query<HealthRecordRow>(
        'SELECT * FROM health_records WHERE user_id = $1 AND idempotency_key = $2',
        [userId, idempotencyKey],
      )
      const row = existing.rows[0]
      if (!row) throw new ConflictException('idempotency conflict could not be resolved')
      if (row.request_hash !== requestHash) {
        throw new ConflictException('idempotency key was already used for a different request')
      }
      if (row.deleted_at) throw new ConflictException('idempotent record was already deleted')
      return mapRow(row)
    })
  }

  async update(userId: string, recordId: string, input: UpdateHealthRecord) {
    const measurement = normalizeInput(input)

    return this.database.withTransaction(async (client) => {
      const result = await client.query<HealthRecordRow>(
        `
          UPDATE health_records
          SET metric = $1,
              canonical_value = $2,
              canonical_unit = $3,
              display_value = $4,
              display_unit = $5,
              source_kind = $6,
              source_metadata = $7::jsonb,
              confidence = $8,
              status = $9,
              occurred_at = $10,
              timezone = $11,
              revision = revision + 1,
              updated_at = NOW()
          WHERE id = $12
            AND user_id = $13
            AND deleted_at IS NULL
            AND revision = $14
          RETURNING *
        `,
        [
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
          recordId,
          userId,
          input.expectedRevision,
        ],
      )

      const updated = result.rows[0]
      if (!updated) await this.throwMutationFailure(client, userId, recordId)
      await insertRevision(client, updated!.id, 'updated')
      return mapRow(updated!)
    })
  }

  async remove(userId: string, recordId: string, expectedRevision: number) {
    return this.database.withTransaction(async (client) => {
      const result = await client.query<HealthRecordRow>(
        `
          UPDATE health_records
          SET deleted_at = NOW(), revision = revision + 1, updated_at = NOW()
          WHERE id = $1
            AND user_id = $2
            AND deleted_at IS NULL
            AND revision = $3
          RETURNING *
        `,
        [recordId, userId, expectedRevision],
      )
      const deleted = result.rows[0]
      if (!deleted) await this.throwMutationFailure(client, userId, recordId)
      await insertRevision(client, deleted!.id, 'deleted')
    })
  }

  async list(userId: string) {
    const result = await this.database.query<HealthRecordRow>(
      `
        SELECT * FROM health_records
        WHERE user_id = $1 AND deleted_at IS NULL
        ORDER BY occurred_at DESC, created_at DESC
        LIMIT 100
      `,
      [userId],
    )

    return { items: result.rows.map(mapRow) }
  }

  async history(userId: string, recordId: string) {
    const owned = await this.database.query<{ id: string }>(
      'SELECT id FROM health_records WHERE id = $1 AND user_id = $2',
      [recordId, userId],
    )
    if (!owned.rows[0]) throw new NotFoundException('health record not found')

    const result = await this.database.query<HealthRecordRevisionRow>(
      `
        SELECT
          record_id AS id, user_id, metric, canonical_value, canonical_unit,
          display_value, display_unit, source_kind, source_metadata,
          confidence, status, occurred_at, timezone, revision,
          created_at, updated_at, action, changed_at
        FROM health_record_revisions
        WHERE record_id = $1 AND user_id = $2
        ORDER BY revision DESC
      `,
      [recordId, userId],
    )

    return {
      recordId,
      items: result.rows.map((row) => ({
        ...mapRow(row),
        action: row.action,
        changedAt: row.changed_at.toISOString(),
      })),
    }
  }

  private async throwMutationFailure(client: PoolClient, userId: string, recordId: string) {
    const existing = await client.query<{ revision: number; deleted_at: Date | null }>(
      'SELECT revision, deleted_at FROM health_records WHERE id = $1 AND user_id = $2',
      [recordId, userId],
    )
    const row = existing.rows[0]
    if (!row || row.deleted_at) throw new NotFoundException('health record not found')
    throw new ConflictException(
      `health record revision changed; current revision is ${row.revision}`,
    )
  }
}
