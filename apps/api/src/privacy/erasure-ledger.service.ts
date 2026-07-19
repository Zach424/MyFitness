import { createHash, createHmac } from 'node:crypto'

import { Injectable } from '@nestjs/common'
import type { Pool } from 'pg'
import * as z from 'zod'

import { getRuntimeConfig } from '../config'
import { PhotoStorageService } from '../nutrition/photo-storage.service'
import { ObjectStorageService } from '../operations/object-storage.service'

const erasureLedgerEntrySchema = z
  .object({
    schemaVersion: z.literal('durable-erasure-ledger-v1'),
    receiptId: z.string().uuid(),
    subjectRef: z.string().regex(/^[0-9a-f]{64}$/),
    requestedAt: z.string().datetime({ offset: true }),
  })
  .strict()

export type ErasureLedgerEntry = z.infer<typeof erasureLedgerEntrySchema>

@Injectable()
export class ErasureLedgerService {
  private readonly config = getRuntimeConfig()

  constructor(
    private readonly objects: ObjectStorageService,
    private readonly photos: PhotoStorageService,
  ) {}

  subjectRef(userId: string) {
    return createHmac('sha256', this.config.erasureLedgerHashSecret).update(userId).digest('hex')
  }

  private entryKey(receiptId: string) {
    return `${this.config.erasureLedgerPrefix}/${receiptId}.json`
  }

  async publish(entry: ErasureLedgerEntry) {
    const exact = erasureLedgerEntrySchema.parse(entry)
    const body = Buffer.from(`${JSON.stringify(exact)}\n`, 'utf8')
    const sha256 = createHash('sha256').update(body).digest()
    await this.objects.putPrivateObject({
      key: this.entryKey(exact.receiptId),
      body,
      contentType: 'application/json',
      sha256Base64: sha256.toString('base64'),
      metadata: { schemaVersion: exact.schemaVersion },
    })
  }

  async removeForVerification(receiptId: string) {
    await this.objects.deletePrivateObject(this.entryKey(receiptId))
  }

  async entries() {
    const keys = await this.objects.listPrivateObjectKeys(this.config.erasureLedgerPrefix)
    const entries: ErasureLedgerEntry[] = []
    for (const key of keys) {
      const body = await this.objects.getPrivateObject(key)
      entries.push(erasureLedgerEntrySchema.parse(JSON.parse(body.toString('utf8'))))
    }
    return entries
  }

  async reconcileRestoredDatabase(pool: Pool) {
    const entries = await this.entries()
    const erasedSubjects = new Set(entries.map((entry) => entry.subjectRef))
    const users = await pool.query<{ id: string }>('SELECT id FROM users')
    const resurrectedUserIds = users.rows
      .filter((row) => erasedSubjects.has(this.subjectRef(row.id)))
      .map((row) => row.id)

    for (const userId of resurrectedUserIds) {
      await this.photos.removeUserDirectory(userId)
    }
    if (resurrectedUserIds.length) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [resurrectedUserIds])
    }
    return {
      ledgerEntries: entries.length,
      erasedRestoredUsers: resurrectedUserIds.length,
    }
  }
}
