import { createHash, randomUUID } from 'node:crypto'

import { privacyExportSchemaVersion } from '@myfitness/contracts'
import { describe, expect, it } from 'vitest'

import {
  createPortableExportArchiveEncryption,
  decryptPortableExportArchiveEnvelope,
  generatePortableExportArchiveDataKey,
  PortableExportArchiveEnvelopeError,
  portableExportArchiveEnvelopeAlgorithm,
  portableExportArchiveEnvelopeFormat,
  type PortableExportArchiveEnvelopeContext,
} from './portable-export-archive-envelope'

const context = (): PortableExportArchiveEnvelopeContext => ({
  ownerId: randomUUID(),
  archiveId: randomUUID(),
  exportSchemaVersion: privacyExportSchemaVersion,
  encryptionKeyRef: 'kms/local/archive-test-v1',
})

const collect = async (source: AsyncIterable<Uint8Array>) => {
  const chunks: Buffer[] = []
  for await (const chunk of source) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

const splitEveryByte = async function* (input: Uint8Array) {
  for (let index = 0; index < input.byteLength; index += 1) {
    yield input.subarray(index, index + 1)
  }
}

const expectInvalidEnvelope = async (
  source: AsyncIterable<Uint8Array>,
  ctx: PortableExportArchiveEnvelopeContext,
  key: Uint8Array,
) => {
  await expect(
    collect(decryptPortableExportArchiveEnvelope(source, ctx, key)),
  ).rejects.toMatchObject({
    code: 'portable_export_archive_envelope_invalid',
    message: 'portable export archive envelope verification failed',
  })
}

describe('portable export archive authenticated envelope', () => {
  it('round-trips irregular input and transport chunks with an exact completion receipt', async () => {
    const ctx = context()
    const key = generatePortableExportArchiveDataKey()
    const plaintext = Buffer.from('衡迹 portable export\n'.repeat(173), 'utf8')
    const source = [plaintext.subarray(0, 7), plaintext.subarray(7, 1500), plaintext.subarray(1500)]
    const session = createPortableExportArchiveEncryption(source, ctx, key, { chunkBytes: 1024 })
    const encrypted = await collect(session.encrypted)
    const receipt = await session.receipt
    const decrypted = await collect(
      decryptPortableExportArchiveEnvelope(splitEveryByte(encrypted), ctx, key),
    )

    expect(decrypted).toEqual(plaintext)
    expect(receipt).toEqual({
      format: portableExportArchiveEnvelopeFormat,
      algorithm: portableExportArchiveEnvelopeAlgorithm,
      encryptionKeyRef: ctx.encryptionKeyRef,
      chunkBytes: 1024,
      dataChunkCount: Math.ceil(plaintext.length / 1024),
      plaintextByteSize: plaintext.length,
      encryptedByteSize: encrypted.length,
      encryptedSha256: createHash('sha256').update(encrypted).digest('hex'),
    })

    const emptySession = createPortableExportArchiveEncryption([], ctx, key, { chunkBytes: 1024 })
    const emptyEncrypted = await collect(emptySession.encrypted)
    const emptyReceipt = await emptySession.receipt
    await expect(
      collect(decryptPortableExportArchiveEnvelope(splitEveryByte(emptyEncrypted), ctx, key)),
    ).resolves.toEqual(Buffer.alloc(0))
    expect(emptyReceipt).toMatchObject({ plaintextByteSize: 0, dataChunkCount: 0 })
  })

  it('uses fresh key and nonce material instead of deterministic ciphertext', async () => {
    const firstKey = generatePortableExportArchiveDataKey()
    const secondKey = generatePortableExportArchiveDataKey()
    expect(firstKey).not.toEqual(secondKey)

    const ctx = context()
    const plaintext = [Buffer.from('same plaintext')]
    const first = createPortableExportArchiveEncryption(plaintext, ctx, firstKey)
    const second = createPortableExportArchiveEncryption(plaintext, ctx, firstKey)
    const [firstEncrypted, secondEncrypted] = await Promise.all([
      collect(first.encrypted),
      collect(second.encrypted),
    ])
    await Promise.all([first.receipt, second.receipt])
    expect(firstEncrypted).not.toEqual(secondEncrypted)
  })

  it('binds ciphertext to owner, archive, schema and non-secret key reference', async () => {
    const ctx = context()
    const key = generatePortableExportArchiveDataKey()
    const session = createPortableExportArchiveEncryption(
      [Buffer.from('private timeline')],
      ctx,
      key,
    )
    const encrypted = await collect(session.encrypted)
    await session.receipt

    for (const mismatch of [
      { ...ctx, ownerId: randomUUID() },
      { ...ctx, archiveId: randomUUID() },
      { ...ctx, encryptionKeyRef: 'kms/local/other-key' },
    ]) {
      await expectInvalidEnvelope(splitEveryByte(encrypted), mismatch, key)
    }
    await expectInvalidEnvelope(
      splitEveryByte(encrypted),
      ctx,
      generatePortableExportArchiveDataKey(),
    )
  })

  it('rejects tampering, truncation, trailing bytes and unsafe declared frames', async () => {
    const ctx = context()
    const key = generatePortableExportArchiveDataKey()
    const session = createPortableExportArchiveEncryption([Buffer.alloc(2500, 0x5a)], ctx, key, {
      chunkBytes: 1024,
    })
    const encrypted = await collect(session.encrypted)
    await session.receipt

    const tampered = Buffer.from(encrypted)
    tampered[59] ^= 0x01
    await expectInvalidEnvelope(splitEveryByte(tampered), ctx, key)

    const fullFrameBytes = 5 + 1024 + 16
    const reordered = Buffer.concat([
      encrypted.subarray(0, 54),
      encrypted.subarray(54 + fullFrameBytes, 54 + fullFrameBytes * 2),
      encrypted.subarray(54, 54 + fullFrameBytes),
      encrypted.subarray(54 + fullFrameBytes * 2),
    ])
    await expectInvalidEnvelope(splitEveryByte(reordered), ctx, key)
    await expectInvalidEnvelope(
      splitEveryByte(encrypted.subarray(0, encrypted.length - 1)),
      ctx,
      key,
    )
    await expectInvalidEnvelope(
      splitEveryByte(Buffer.concat([encrypted, Buffer.from([0])])),
      ctx,
      key,
    )

    const unsafeChunkSize = Buffer.from(encrypted)
    unsafeChunkSize.writeUInt32BE(1024 * 1024 + 1, 10)
    await expectInvalidEnvelope(splitEveryByte(unsafeChunkSize), ctx, key)
  })

  it('keeps emitted buffers bounded while streaming a multi-megabyte archive', async () => {
    const totalBytes = 8 * 1024 * 1024 + 137
    const sourceChunkBytes = 3333
    const archiveChunkBytes = 64 * 1024
    const ctx = context()
    const key = generatePortableExportArchiveDataKey()
    const expectedHash = createHash('sha256')

    const makeChunk = (offset: number, length: number) => {
      const chunk = Buffer.allocUnsafe(length)
      for (let index = 0; index < length; index += 1) chunk[index] = (offset + index) % 251
      return chunk
    }
    const source = async function* () {
      for (let offset = 0; offset < totalBytes; offset += sourceChunkBytes) {
        const chunk = makeChunk(offset, Math.min(sourceChunkBytes, totalBytes - offset))
        expectedHash.update(chunk)
        yield chunk
      }
    }

    const session = createPortableExportArchiveEncryption(source(), ctx, key, {
      chunkBytes: archiveChunkBytes,
    })
    let maximumEncryptedChunk = 0
    const observed = async function* () {
      for await (const chunk of session.encrypted) {
        maximumEncryptedChunk = Math.max(maximumEncryptedChunk, chunk.length)
        yield chunk
      }
    }
    const actualHash = createHash('sha256')
    let decryptedBytes = 0
    for await (const chunk of decryptPortableExportArchiveEnvelope(observed(), ctx, key)) {
      actualHash.update(chunk)
      decryptedBytes += chunk.length
      expect(chunk.length).toBeLessThanOrEqual(archiveChunkBytes)
    }
    const receipt = await session.receipt

    expect(actualHash.digest('hex')).toBe(expectedHash.digest('hex'))
    expect(decryptedBytes).toBe(totalBytes)
    expect(receipt.plaintextByteSize).toBe(totalBytes)
    expect(receipt.dataChunkCount).toBe(Math.ceil(totalBytes / archiveChunkBytes))
    expect(maximumEncryptedChunk).toBeLessThanOrEqual(archiveChunkBytes + 21)
  })

  it('fails closed for invalid configuration and incomplete consumption', async () => {
    const ctx = context()
    const key = generatePortableExportArchiveDataKey()
    expect(() => createPortableExportArchiveEncryption([], ctx, key.subarray(0, 31))).toThrow(
      /exactly 32 bytes/,
    )
    expect(() => createPortableExportArchiveEncryption([], ctx, key, { chunkBytes: 1023 })).toThrow(
      /chunk size/,
    )

    const incomplete = createPortableExportArchiveEncryption([Buffer.alloc(4096)], ctx, key, {
      chunkBytes: 1024,
    })
    for await (const _chunk of incomplete.encrypted) break
    await expect(incomplete.receipt).rejects.toThrow(/did not complete/)
    expect(new PortableExportArchiveEnvelopeError().code).toBe(
      'portable_export_archive_envelope_invalid',
    )
  })
})
