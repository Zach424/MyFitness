import { createHash, randomUUID } from 'node:crypto'

import {
  privacyExportSchema,
  privacyExportSchemaVersion,
  type PrivacyExport,
} from '@myfitness/contracts'
import { describe, expect, it } from 'vitest'

import {
  createPortableExportArchiveEncryption,
  decryptPortableExportArchiveEnvelope,
  generatePortableExportArchiveDataKey,
  type PortableExportArchiveEnvelopeContext,
} from './portable-export-archive-envelope'
import { serializePortableExport } from './portable-export-artifact'
import { createPortableExportJsonStream } from './portable-export-json-stream'

const fixture = (): PrivacyExport =>
  privacyExportSchema.parse({
    schemaVersion: privacyExportSchemaVersion,
    generatedAt: '2026-08-11T08:00:00.000Z',
    accountId: '11111111-1111-4111-8111-111111111111',
    data: {
      account: {
        display_name: '衡迹用户',
        escaping: '"\\\u0000\b\t\n\f\r',
        unicode: '汉字🙂\u2028\u2029',
        lone_high_surrogate: '\ud800',
        lone_low_surrogate: '\udc00',
        nested: { 10: 'ten', 2: 'two', enabled: true, missing: null },
      },
      identities: [{ provider: 'fixture', scopes: ['openid', 'profile'] }],
      profile: null,
      goal: null,
      consentEvents: [],
      healthRecords: [],
      healthRecordRevisions: [],
      exerciseCatalog: [],
      foodCatalog: [],
      workouts: [],
      nutritionMeals: [],
      nutritionFavorites: [],
      weeklyPlans: [],
      aiExplanationRuns: [],
      foodPhotoAnalyses: [],
      progressPhotos: [],
    },
  })

const collect = async (source: AsyncIterable<Uint8Array>) => {
  const chunks: Buffer[] = []
  for await (const chunk of source) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

const envelopeContext = (): PortableExportArchiveEnvelopeContext => ({
  ownerId: randomUUID(),
  archiveId: randomUUID(),
  exportSchemaVersion: privacyExportSchemaVersion,
  encryptionKeyRef: 'kms/local/json-stream-test-v1',
})

describe('portable export incremental JSON stream', () => {
  it('is byte-for-byte identical to the existing pretty JSON artifact across escape boundaries', async () => {
    const payload = fixture()
    const expected = serializePortableExport(payload, Number.MAX_SAFE_INTEGER)
    const session = createPortableExportJsonStream(payload, { chunkBytes: 7 })
    const chunks: Buffer[] = []
    for await (const chunk of session.bytes) {
      expect(chunk.length).toBeGreaterThan(0)
      expect(chunk.length).toBeLessThanOrEqual(7)
      chunks.push(Buffer.from(chunk))
    }

    const actual = Buffer.concat(chunks)
    expect(actual).toEqual(expected)
    await expect(session.receipt).resolves.toEqual({
      schemaVersion: privacyExportSchemaVersion,
      chunkBytes: 7,
      byteLength: expected.length,
      sha256: createHash('sha256').update(expected).digest('hex'),
    })
  })

  it('fails before emitting a chunk that would cross the configured byte boundary', async () => {
    const payload = fixture()
    const expectedBytes = serializePortableExport(payload, Number.MAX_SAFE_INTEGER).length
    const session = createPortableExportJsonStream(payload, {
      chunkBytes: 31,
      maximumBytes: expectedBytes - 1,
    })
    const receiptRejection = expect(session.receipt).rejects.toThrowError(
      'portable export JSON exceeds the configured maximum size',
    )
    let emittedBytes = 0

    await expect(
      (async () => {
        for await (const chunk of session.bytes) emittedBytes += chunk.length
      })(),
    ).rejects.toThrowError('portable export JSON exceeds the configured maximum size')
    await receiptRejection
    expect(emittedBytes).toBeLessThanOrEqual(expectedBytes - 1)
  })

  it('pipes a large JSON value through encryption and verified decryption without whole artifacts', async () => {
    const payload = fixture()
    payload.data.account.large_note = '衡迹-stream-boundary-'.repeat(400_000)
    const json = createPortableExportJsonStream(payload)
    const key = generatePortableExportArchiveDataKey()
    const context = envelopeContext()
    const encryption = createPortableExportArchiveEncryption(json.bytes, context, key)
    const decryptedHash = createHash('sha256')
    let decryptedBytes = 0
    let maximumDecryptedChunk = 0
    let maximumEncryptedChunk = 0
    const observedEncrypted = (async function* () {
      for await (const chunk of encryption.encrypted) {
        maximumEncryptedChunk = Math.max(maximumEncryptedChunk, chunk.length)
        yield chunk
      }
    })()

    for await (const chunk of decryptPortableExportArchiveEnvelope(
      observedEncrypted,
      context,
      key,
    )) {
      decryptedBytes += chunk.length
      maximumDecryptedChunk = Math.max(maximumDecryptedChunk, chunk.length)
      decryptedHash.update(chunk)
    }

    const [jsonReceipt, encryptionReceipt] = await Promise.all([json.receipt, encryption.receipt])
    expect(jsonReceipt.byteLength).toBeGreaterThan(8 * 1024 * 1024)
    expect(decryptedBytes).toBe(jsonReceipt.byteLength)
    expect(decryptedHash.digest('hex')).toBe(jsonReceipt.sha256)
    expect(encryptionReceipt.plaintextByteSize).toBe(jsonReceipt.byteLength)
    expect(encryptionReceipt.dataChunkCount).toBe(
      Math.ceil(jsonReceipt.byteLength / encryptionReceipt.chunkBytes),
    )
    expect(maximumEncryptedChunk).toBeLessThanOrEqual(64 * 1024 + 21)
    expect(maximumDecryptedChunk).toBeLessThanOrEqual(64 * 1024)
  })

  it('rejects an incomplete consumer and invalid size configuration', async () => {
    expect(() => createPortableExportJsonStream(fixture(), { chunkBytes: 0 })).toThrowError(
      RangeError,
    )
    expect(() => createPortableExportJsonStream(fixture(), { maximumBytes: -1 })).toThrowError(
      RangeError,
    )

    const session = createPortableExportJsonStream(fixture(), { chunkBytes: 64 })
    const iterator = session.bytes[Symbol.asyncIterator]()
    await expect(iterator.next()).resolves.toMatchObject({ done: false })
    const receiptRejection = expect(session.receipt).rejects.toThrowError(
      'portable export JSON stream did not complete',
    )
    await iterator.return?.()
    await receiptRejection
  })

  it('retains exact bytes when consumed independently of the encryption pipeline', async () => {
    const payload = fixture()
    const session = createPortableExportJsonStream(payload, { chunkBytes: 1024 })
    await expect(collect(session.bytes)).resolves.toEqual(
      serializePortableExport(payload, Number.MAX_SAFE_INTEGER),
    )
    await expect(session.receipt).resolves.toMatchObject({ chunkBytes: 1024 })
  })
})
