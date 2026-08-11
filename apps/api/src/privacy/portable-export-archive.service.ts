import { randomUUID } from 'node:crypto'

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  portableExportArchiveReceiptSchema,
  portableExportArchiveReceiptSchemaVersion,
  portableExportArchiveStatusSchema,
  privacyExportSchemaVersion,
  type PortableExportArchiveReceipt,
} from '@myfitness/contracts'
import type { QueryResultRow } from 'pg'
import * as z from 'zod'

import { DatabaseService } from '../database/database.service'

const portableExportArchiveGenerationLifetimeSql = "INTERVAL '1 hour'"

const reservationInputSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    requestHash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict()

type PortableExportArchiveRow = QueryResultRow & {
  id: string
  user_id: string
  idempotency_key: string
  request_hash: string
  export_schema_version: typeof privacyExportSchemaVersion
  status: z.infer<typeof portableExportArchiveStatusSchema>
  object_key: string | null
  encryption_key_ref: string | null
  artifact_sha256: string | null
  artifact_byte_size: string | null
  generation_expires_at: Date
  available_at: Date | null
  download_expires_at: Date | null
  failure_code: PortableExportArchiveReceipt['failureCode']
  disposition_reason: PortableExportArchiveReceipt['dispositionReason']
  created_at: Date
  updated_at: Date
  disposed_at: Date | null
}

const mapReceipt = (row: PortableExportArchiveRow) =>
  portableExportArchiveReceiptSchema.parse({
    schemaVersion: portableExportArchiveReceiptSchemaVersion,
    archiveId: row.id,
    status: row.status,
    requestedAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    generationExpiresAt: row.generation_expires_at.toISOString(),
    availableAt: row.available_at?.toISOString() ?? null,
    downloadExpiresAt: row.download_expires_at?.toISOString() ?? null,
    artifact:
      row.artifact_sha256 && row.artifact_byte_size
        ? { sha256: row.artifact_sha256, byteSize: Number(row.artifact_byte_size) }
        : null,
    failureCode: row.failure_code,
    dispositionReason: row.disposition_reason,
    disposedAt: row.disposed_at?.toISOString() ?? null,
  })

@Injectable()
export class PortableExportArchiveService {
  constructor(private readonly database: DatabaseService) {}

  async reserve(userId: string, rawInput: unknown) {
    const parsedUserId = z.string().uuid().safeParse(userId)
    const parsed = reservationInputSchema.safeParse(rawInput)
    if (!parsedUserId.success || !parsed.success) {
      throw new BadRequestException('portable export archive request is invalid')
    }

    return this.database.withTransaction(async (client) => {
      const owner = await client.query<{ id: string }>(
        "SELECT id FROM users WHERE id = $1 AND status = 'active' FOR SHARE",
        [parsedUserId.data],
      )
      if (!owner.rows[0]) throw new NotFoundException('active account not found')

      const archiveId = randomUUID()
      const created = await client.query<PortableExportArchiveRow>(
        `INSERT INTO privacy_export_archives (
           id, user_id, idempotency_key, request_hash, export_schema_version,
           object_key, generation_expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6, NOW() + ${portableExportArchiveGenerationLifetimeSql})
         ON CONFLICT (user_id, idempotency_key) DO NOTHING
         RETURNING *`,
        [
          archiveId,
          parsedUserId.data,
          parsed.data.idempotencyKey,
          parsed.data.requestHash,
          privacyExportSchemaVersion,
          `${parsedUserId.data}/${archiveId}.json.enc`,
        ],
      )
      if (created.rows[0]) return mapReceipt(created.rows[0])

      const replay = await client.query<PortableExportArchiveRow>(
        `SELECT * FROM privacy_export_archives
         WHERE user_id = $1 AND idempotency_key = $2`,
        [parsedUserId.data, parsed.data.idempotencyKey],
      )
      const existing = replay.rows[0]
      if (!existing) {
        throw new ConflictException('portable export archive idempotency conflict was unresolved')
      }
      if (existing.request_hash !== parsed.data.requestHash) {
        throw new ConflictException(
          'idempotency key was already used for a different portable export archive request',
        )
      }
      return mapReceipt(existing)
    })
  }

  async findOwned(userId: string, archiveId: string) {
    const parsedUserId = z.string().uuid().safeParse(userId)
    const parsedArchiveId = z.string().uuid().safeParse(archiveId)
    if (!parsedUserId.success || !parsedArchiveId.success) {
      throw new NotFoundException('portable export archive not found')
    }

    const result = await this.database.query<PortableExportArchiveRow>(
      `SELECT archive.*
       FROM privacy_export_archives AS archive
       JOIN users AS owner ON owner.id = archive.user_id AND owner.status = 'active'
       WHERE archive.user_id = $1 AND archive.id = $2`,
      [parsedUserId.data, parsedArchiveId.data],
    )
    if (!result.rows[0]) throw new NotFoundException('portable export archive not found')
    return mapReceipt(result.rows[0])
  }
}
