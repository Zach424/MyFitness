import { Injectable, NotFoundException } from '@nestjs/common'
import type { PoolClient, QueryResult, QueryResultRow } from 'pg'

import { DatabaseService } from '../database/database.service'

export const portableExportSnapshotDefaultBatchRows = 25
export const portableExportSnapshotMaximumBatchRows = 100
export const portableExportSnapshotMaximumPayloadBytes = 64 * 1024

export type PortableExportHealthRecordSnapshotReceipt = {
  batchRows: number
  maximumPayloadBytes: number
  batchCount: number
  rowCount: number
}

export type PortableExportHealthRecordSnapshotSession = {
  rows: AsyncIterable<Record<string, unknown>>
  receipt: Promise<PortableExportHealthRecordSnapshotReceipt>
}

type HealthRecordSnapshotRow = QueryResultRow & {
  id: string
  payload_text: string | null
  payload_byte_length: number
}

type MutableSnapshotStats = {
  batchCount: number
  rowCount: number
}

const validateBatchRows = (batchRows: number) => {
  if (
    !Number.isSafeInteger(batchRows) ||
    batchRows < 1 ||
    batchRows > portableExportSnapshotMaximumBatchRows
  ) {
    throw new RangeError(
      `portable export snapshot batch rows must be between 1 and ${portableExportSnapshotMaximumBatchRows}`,
    )
  }
  return batchRows
}

const validateMaximumPayloadBytes = (maximumPayloadBytes: number) => {
  if (
    !Number.isSafeInteger(maximumPayloadBytes) ||
    maximumPayloadBytes < 1 ||
    maximumPayloadBytes > portableExportSnapshotMaximumPayloadBytes
  ) {
    throw new RangeError(
      `portable export snapshot maximum payload bytes must be between 1 and ${portableExportSnapshotMaximumPayloadBytes}`,
    )
  }
  return maximumPayloadBytes
}

export class PortableExportSnapshotPayloadTooLargeError extends RangeError {
  readonly code = 'portable_export_snapshot_payload_too_large'

  constructor(
    readonly maximumBytes: number,
    readonly actualBytes: number,
  ) {
    super(`portable export snapshot payload exceeds ${maximumBytes} bytes`)
    this.name = 'PortableExportSnapshotPayloadTooLargeError'
  }
}

const throwIfAborted = (signal?: AbortSignal) => {
  if (!signal?.aborted) return
  if (signal.reason instanceof Error) throw signal.reason
  throw new Error('portable export database snapshot was aborted')
}

async function* healthRecordRows(
  client: PoolClient,
  userId: string,
  batchRows: number,
  maximumPayloadBytes: number,
  stats: MutableSnapshotStats,
  signal?: AbortSignal,
): AsyncGenerator<Record<string, unknown>> {
  throwIfAborted(signal)
  const account = await client.query<{ id: string }>(
    "SELECT id FROM users WHERE id = $1 AND status = 'active'",
    [userId],
  )
  if (!account.rows[0]) throw new NotFoundException('active account not found')

  let anchorId: string | null = null

  while (true) {
    throwIfAborted(signal)
    const page: QueryResult<HealthRecordSnapshotRow> = await client.query<HealthRecordSnapshotRow>(
      `WITH page AS MATERIALIZED (
         SELECT id, metric, canonical_value, canonical_unit, display_value, display_unit,
                source_kind, source_metadata, confidence, status, occurred_at, timezone,
                revision, deleted_at, created_at, updated_at
         FROM health_records
         WHERE user_id = $1
           AND (
             $2::uuid IS NULL
             OR (occurred_at, created_at, id) > (
               SELECT occurred_at, created_at, id
               FROM health_records
               WHERE user_id = $1 AND id = $2::uuid
             )
         )
         ORDER BY occurred_at, created_at, id
         LIMIT $3
       ), encoded AS MATERIALIZED (
         SELECT id, occurred_at, created_at, to_jsonb(page)::text AS payload_text
         FROM page
       )
       SELECT id,
              CASE
                WHEN octet_length(payload_text) <= $4 THEN payload_text
                ELSE NULL
              END AS payload_text,
              octet_length(payload_text) AS payload_byte_length
       FROM encoded
       ORDER BY occurred_at, created_at, id`,
      [userId, anchorId, batchRows, maximumPayloadBytes],
    )
    if (page.rows.length === 0) break
    if (page.rows.length > batchRows) {
      throw new Error('portable export snapshot query exceeded its batch row limit')
    }

    stats.batchCount += 1
    const pageIds = new Set<string>()
    for (const row of page.rows) {
      throwIfAborted(signal)
      if (
        !row.id ||
        pageIds.has(row.id) ||
        !Number.isSafeInteger(row.payload_byte_length) ||
        row.payload_byte_length < 0
      ) {
        throw new Error('portable export snapshot returned an invalid health record page')
      }
      if (row.payload_byte_length > maximumPayloadBytes) {
        throw new PortableExportSnapshotPayloadTooLargeError(
          maximumPayloadBytes,
          row.payload_byte_length,
        )
      }
      if (row.payload_text === null) {
        throw new Error('portable export snapshot returned an invalid health record page')
      }
      let payload: unknown
      try {
        payload = JSON.parse(row.payload_text)
      } catch {
        throw new Error('portable export snapshot returned an invalid health record page')
      }
      if (
        payload === null ||
        typeof payload !== 'object' ||
        Array.isArray(payload) ||
        (payload as Record<string, unknown>).id !== row.id
      ) {
        throw new Error('portable export snapshot returned an invalid health record page')
      }
      pageIds.add(row.id)
      stats.rowCount += 1
      if (!Number.isSafeInteger(stats.rowCount)) {
        throw new RangeError('portable export snapshot row count exceeds the safe integer boundary')
      }
      yield payload as Record<string, unknown>
    }

    anchorId = page.rows.at(-1)!.id
    if (page.rows.length < batchRows) break
  }
}

@Injectable()
export class PortableExportDatabaseSnapshotService {
  constructor(private readonly database: DatabaseService) {}

  createHealthRecordSnapshot(
    userId: string,
    options: { batchRows?: number; maximumPayloadBytes?: number; signal?: AbortSignal } = {},
  ): PortableExportHealthRecordSnapshotSession {
    const batchRows = validateBatchRows(options.batchRows ?? portableExportSnapshotDefaultBatchRows)
    const maximumPayloadBytes = validateMaximumPayloadBytes(
      options.maximumPayloadBytes ?? portableExportSnapshotMaximumPayloadBytes,
    )
    let resolveReceipt!: (receipt: PortableExportHealthRecordSnapshotReceipt) => void
    let rejectReceipt!: (error: unknown) => void
    const receipt = new Promise<PortableExportHealthRecordSnapshotReceipt>((resolve, reject) => {
      resolveReceipt = resolve
      rejectReceipt = reject
    })
    const stats: MutableSnapshotStats = { batchCount: 0, rowCount: 0 }
    const transactionRows = this.database.streamReadOnlyRepeatableRead((client) =>
      healthRecordRows(client, userId, batchRows, maximumPayloadBytes, stats, options.signal),
    )

    const rows = (async function* () {
      let completed = false
      try {
        for await (const row of transactionRows) yield row
        completed = true
        resolveReceipt({
          batchRows,
          maximumPayloadBytes,
          batchCount: stats.batchCount,
          rowCount: stats.rowCount,
        })
      } catch (error) {
        rejectReceipt(error)
        throw error
      } finally {
        if (!completed) {
          rejectReceipt(new Error('portable export database snapshot did not complete'))
        }
      }
    })()

    return { rows, receipt }
  }
}
