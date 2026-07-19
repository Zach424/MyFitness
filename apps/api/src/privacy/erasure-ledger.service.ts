import { createHash, createHmac } from 'node:crypto'

import { Injectable } from '@nestjs/common'
import { userAuthProviderSchema, type UserAuthProvider } from '@myfitness/contracts'
import type { Pool } from 'pg'
import * as z from 'zod'

import { getRuntimeConfig } from '../config'
import { PhotoStorageService } from '../nutrition/photo-storage.service'
import { ObjectStorageService } from '../operations/object-storage.service'

const erasureLedgerV1EntrySchema = z
  .object({
    schemaVersion: z.literal('durable-erasure-ledger-v1'),
    receiptId: z.string().uuid(),
    subjectRef: z.string().regex(/^[0-9a-f]{64}$/),
    requestedAt: z.string().datetime({ offset: true }),
  })
  .strict()

const erasureIdentityRefSchema = z
  .object({
    provider: userAuthProviderSchema,
    subjectRef: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict()

const erasureLedgerV2EntrySchema = z
  .object({
    schemaVersion: z.literal('durable-erasure-ledger-v2'),
    receiptId: z.string().uuid(),
    subjectRef: z.string().regex(/^[0-9a-f]{64}$/),
    identityRefs: z.array(erasureIdentityRefSchema).max(8),
    requestedAt: z.string().datetime({ offset: true }),
  })
  .strict()

const erasureLedgerEntrySchema = z.discriminatedUnion('schemaVersion', [
  erasureLedgerV1EntrySchema,
  erasureLedgerV2EntrySchema,
])

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

  identitySubjectRef(provider: UserAuthProvider, providerSubject: string) {
    return createHmac('sha256', this.config.erasureLedgerHashSecret)
      .update(`identity\0${provider}\0${providerSubject}`)
      .digest('hex')
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
    const identitySuppressions = new Map<
      string,
      {
        provider: UserAuthProvider
        subjectRef: string
        receiptId: string
        requestedAt: string
      }
    >()
    for (const entry of entries) {
      if (entry.schemaVersion !== 'durable-erasure-ledger-v2') continue
      for (const identity of entry.identityRefs) {
        identitySuppressions.set(`${identity.provider}:${identity.subjectRef}`, {
          ...identity,
          receiptId: entry.receiptId,
          requestedAt: entry.requestedAt,
        })
      }
    }
    const erasedIdentities = new Set(identitySuppressions.keys())
    const users = await pool.query<{ id: string }>('SELECT id FROM users')
    const identities = await pool.query<{
      user_id: string
      provider: UserAuthProvider
      provider_subject: string
    }>('SELECT user_id, provider, provider_subject FROM auth_identities')
    const entriesBySubject = new Map(entries.map((entry) => [entry.subjectRef, entry]))
    const matchingUserEntries = new Map(
      users.rows.flatMap((row) => {
        const entry = entriesBySubject.get(this.subjectRef(row.id))
        return entry ? [[row.id, entry] as const] : []
      }),
    )
    const resurrectedUserIds = new Set(matchingUserEntries.keys())
    for (const identity of identities.rows) {
      const ref = this.identitySubjectRef(identity.provider, identity.provider_subject)
      if (erasedIdentities.has(`${identity.provider}:${ref}`)) {
        resurrectedUserIds.add(identity.user_id)
      }
      const legacyEntry = matchingUserEntries.get(identity.user_id)
      if (legacyEntry) {
        identitySuppressions.set(`${identity.provider}:${ref}`, {
          provider: identity.provider,
          subjectRef: ref,
          receiptId: legacyEntry.receiptId,
          requestedAt: legacyEntry.requestedAt,
        })
      }
    }

    for (const userId of resurrectedUserIds) {
      await this.photos.removeUserDirectory(userId)
    }
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for (const identity of identitySuppressions.values()) {
        await client.query(
          `INSERT INTO auth_identity_suppressions
             (provider, subject_ref, erasure_receipt_id, suppressed_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (provider, subject_ref) DO UPDATE
             SET erasure_receipt_id = EXCLUDED.erasure_receipt_id,
                 suppressed_at = LEAST(
                   auth_identity_suppressions.suppressed_at,
                   EXCLUDED.suppressed_at
                 )`,
          [identity.provider, identity.subjectRef, identity.receiptId, identity.requestedAt],
        )
      }
      if (resurrectedUserIds.size) {
        await client.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [
          [...resurrectedUserIds],
        ])
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    return {
      ledgerEntries: entries.length,
      restoredIdentitySuppressions: identitySuppressions.size,
      erasedRestoredUsers: resurrectedUserIds.size,
    }
  }
}
