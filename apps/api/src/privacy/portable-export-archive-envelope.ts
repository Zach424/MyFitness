import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

import { privacyExportSchemaVersion } from '@myfitness/contracts'

export const portableExportArchiveEnvelopeFormat =
  'myfitness-portable-export-archive-envelope/v1' as const
export const portableExportArchiveEnvelopeAlgorithm = 'AES-256-GCM' as const
export const portableExportArchiveEnvelopeDefaultChunkBytes = 64 * 1024

const envelopeMagic = Buffer.from('MFPAE001', 'ascii')
const envelopeVersion = 1
const envelopeAlgorithmId = 1
const envelopeHeaderBytes = 54
const frameHeaderBytes = 5
const authenticationTagBytes = 16
const noncePrefixBytes = 8
const nonceBytes = 12
const contextDigestBytes = 32
const minimumChunkBytes = 1024
const maximumChunkBytes = 1024 * 1024
const finalFrameFlag = 1
const maximumDataFrames = 0xffff_ffff
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

type ByteSource = Iterable<Uint8Array> | AsyncIterable<Uint8Array>

export type PortableExportArchiveEnvelopeContext = {
  ownerId: string
  archiveId: string
  exportSchemaVersion: typeof privacyExportSchemaVersion
  encryptionKeyRef: string
}

export type PortableExportArchiveEncryptionReceipt = {
  format: typeof portableExportArchiveEnvelopeFormat
  algorithm: typeof portableExportArchiveEnvelopeAlgorithm
  encryptionKeyRef: string
  chunkBytes: number
  dataChunkCount: number
  plaintextByteSize: number
  encryptedByteSize: number
  encryptedSha256: string
}

export type PortableExportArchiveEncryptionSession = {
  encrypted: AsyncIterable<Buffer>
  receipt: Promise<PortableExportArchiveEncryptionReceipt>
}

export class PortableExportArchiveEnvelopeError extends Error {
  readonly code = 'portable_export_archive_envelope_invalid'

  constructor() {
    super('portable export archive envelope verification failed')
  }
}

const failEnvelope = (): never => {
  throw new PortableExportArchiveEnvelopeError()
}

const validateContext = (context: PortableExportArchiveEnvelopeContext) => {
  if (
    !uuidPattern.test(context.ownerId) ||
    !uuidPattern.test(context.archiveId) ||
    context.exportSchemaVersion !== privacyExportSchemaVersion ||
    context.encryptionKeyRef.length < 3 ||
    context.encryptionKeyRef.length > 240 ||
    !/^[\x21-\x7e]+$/.test(context.encryptionKeyRef)
  ) {
    throw new Error('portable export archive encryption context is invalid')
  }
  return context
}

const validateDataKey = (dataKey: Uint8Array) => {
  if (!(dataKey instanceof Uint8Array) || dataKey.byteLength !== 32) {
    throw new Error('portable export archive data key must contain exactly 32 bytes')
  }
  return dataKey
}

const copyDataKey = (dataKey: Uint8Array) => {
  validateDataKey(dataKey)
  return Buffer.from(dataKey)
}

const validateChunkBytes = (chunkBytes: number) => {
  if (
    !Number.isSafeInteger(chunkBytes) ||
    chunkBytes < minimumChunkBytes ||
    chunkBytes > maximumChunkBytes
  ) {
    throw new Error(
      `portable export archive chunk size must be between ${minimumChunkBytes} and ${maximumChunkBytes} bytes`,
    )
  }
  return chunkBytes
}

const contextDigest = (context: PortableExportArchiveEnvelopeContext) =>
  createHash('sha256')
    .update(
      JSON.stringify([
        portableExportArchiveEnvelopeFormat,
        context.ownerId,
        context.archiveId,
        context.exportSchemaVersion,
        context.encryptionKeyRef,
      ]),
      'utf8',
    )
    .digest()

const createHeader = (context: PortableExportArchiveEnvelopeContext, chunkBytes: number) => {
  const header = Buffer.allocUnsafe(envelopeHeaderBytes)
  envelopeMagic.copy(header, 0)
  header.writeUInt8(envelopeVersion, 8)
  header.writeUInt8(envelopeAlgorithmId, 9)
  header.writeUInt32BE(chunkBytes, 10)
  randomBytes(noncePrefixBytes).copy(header, 14)
  contextDigest(context).copy(header, 22)
  return header
}

const createFrameHeader = (isFinal: boolean, plaintextBytes: number) => {
  const header = Buffer.allocUnsafe(frameHeaderBytes)
  header.writeUInt8(isFinal ? finalFrameFlag : 0, 0)
  header.writeUInt32BE(plaintextBytes, 1)
  return header
}

const createFrameNonce = (header: Buffer, frameIndex: number) => {
  const nonce = Buffer.allocUnsafe(nonceBytes)
  header.copy(nonce, 0, 14, 14 + noncePrefixBytes)
  nonce.writeUInt32BE(frameIndex, noncePrefixBytes)
  return nonce
}

const createFrameAad = (header: Buffer, frameIndex: number, frameHeader: Buffer) => {
  const counter = Buffer.allocUnsafe(4)
  counter.writeUInt32BE(frameIndex)
  return Buffer.concat([header, counter, frameHeader])
}

const encryptFrame = (
  plaintext: Buffer,
  isFinal: boolean,
  frameIndex: number,
  header: Buffer,
  dataKey: Buffer,
) => {
  const frameHeader = createFrameHeader(isFinal, plaintext.length)
  const cipher = createCipheriv('aes-256-gcm', dataKey, createFrameNonce(header, frameIndex), {
    authTagLength: authenticationTagBytes,
  })
  cipher.setAAD(createFrameAad(header, frameIndex, frameHeader), {
    plaintextLength: plaintext.length,
  })
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return Buffer.concat([frameHeader, ciphertext, cipher.getAuthTag()])
}

const asBuffer = (chunk: Uint8Array) => {
  if (!(chunk instanceof Uint8Array)) {
    throw new TypeError('portable export archive source must emit byte chunks')
  }
  return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
}

async function* rechunk(source: ByteSource, chunkBytes: number): AsyncIterable<Buffer> {
  let pending = Buffer.alloc(0)
  for await (const rawChunk of source) {
    let chunk = asBuffer(rawChunk)
    if (chunk.length === 0) continue

    if (pending.length > 0) {
      const required = chunkBytes - pending.length
      if (chunk.length < required) {
        pending = Buffer.concat([pending, chunk])
        continue
      }
      const completed = Buffer.allocUnsafe(chunkBytes)
      pending.copy(completed)
      chunk.copy(completed, pending.length, 0, required)
      yield completed
      pending = Buffer.alloc(0)
      chunk = chunk.subarray(required)
    }

    while (chunk.length >= chunkBytes) {
      yield chunk.subarray(0, chunkBytes)
      chunk = chunk.subarray(chunkBytes)
    }
    if (chunk.length > 0) pending = Buffer.from(chunk)
  }
  if (pending.length > 0) yield pending
}

export const generatePortableExportArchiveDataKey = () => randomBytes(32)

export const createPortableExportArchiveEncryption = (
  source: ByteSource,
  rawContext: PortableExportArchiveEnvelopeContext,
  rawDataKey: Uint8Array,
  options: { chunkBytes?: number } = {},
): PortableExportArchiveEncryptionSession => {
  const context = validateContext(rawContext)
  validateDataKey(rawDataKey)
  const chunkBytes = validateChunkBytes(
    options.chunkBytes ?? portableExportArchiveEnvelopeDefaultChunkBytes,
  )
  let resolveReceipt!: (receipt: PortableExportArchiveEncryptionReceipt) => void
  let rejectReceipt!: (error: unknown) => void
  const receipt = new Promise<PortableExportArchiveEncryptionReceipt>((resolve, reject) => {
    resolveReceipt = resolve
    rejectReceipt = reject
  })

  const encrypted = (async function* () {
    const dataKey = copyDataKey(rawDataKey)
    const hash = createHash('sha256')
    let encryptedByteSize = 0
    let plaintextByteSize = 0
    let dataChunkCount = 0
    let completed = false

    const account = (chunk: Buffer) => {
      if (encryptedByteSize > Number.MAX_SAFE_INTEGER - chunk.length) {
        throw new Error('portable export archive encrypted size exceeds the safe integer boundary')
      }
      encryptedByteSize += chunk.length
      hash.update(chunk)
      return chunk
    }

    try {
      const header = createHeader(context, chunkBytes)
      yield account(header)

      for await (const chunk of rechunk(source, chunkBytes)) {
        if (dataChunkCount >= maximumDataFrames) {
          throw new Error('portable export archive has too many encrypted chunks')
        }
        if (plaintextByteSize > Number.MAX_SAFE_INTEGER - chunk.length) {
          throw new Error(
            'portable export archive plaintext size exceeds the safe integer boundary',
          )
        }
        plaintextByteSize += chunk.length
        yield account(encryptFrame(chunk, false, dataChunkCount, header, dataKey))
        dataChunkCount += 1
      }

      yield account(encryptFrame(Buffer.alloc(0), true, dataChunkCount, header, dataKey))
      completed = true
      resolveReceipt({
        format: portableExportArchiveEnvelopeFormat,
        algorithm: portableExportArchiveEnvelopeAlgorithm,
        encryptionKeyRef: context.encryptionKeyRef,
        chunkBytes,
        dataChunkCount,
        plaintextByteSize,
        encryptedByteSize,
        encryptedSha256: hash.digest('hex'),
      })
    } catch (error) {
      rejectReceipt(error)
      throw error
    } finally {
      dataKey.fill(0)
      if (!completed) {
        rejectReceipt(new Error('portable export archive encryption did not complete'))
      }
    }
  })()

  return { encrypted, receipt }
}

const toAsyncIterator = (source: ByteSource) =>
  (async function* () {
    for await (const chunk of source) yield chunk
  })()[Symbol.asyncIterator]()

class BoundedByteReader {
  private readonly iterator: AsyncIterator<Uint8Array>
  private current: Buffer = Buffer.alloc(0)
  private offset = 0
  private ended = false

  constructor(source: ByteSource) {
    this.iterator = toAsyncIterator(source)
  }

  private async advance() {
    while (this.offset >= this.current.length && !this.ended) {
      const next = await this.iterator.next()
      if (next.done) {
        this.ended = true
        this.current = Buffer.alloc(0)
        this.offset = 0
        return
      }
      this.current = asBuffer(next.value)
      this.offset = 0
    }
  }

  async readExact(byteLength: number) {
    const output = Buffer.allocUnsafe(byteLength)
    let written = 0
    while (written < byteLength) {
      await this.advance()
      if (this.ended) failEnvelope()
      const available = this.current.length - this.offset
      const take = Math.min(available, byteLength - written)
      this.current.copy(output, written, this.offset, this.offset + take)
      this.offset += take
      written += take
    }
    return output
  }

  async assertEnd() {
    await this.advance()
    if (!this.ended) failEnvelope()
  }
}

const parseHeader = async (
  reader: BoundedByteReader,
  context: PortableExportArchiveEnvelopeContext,
) => {
  const header = await reader.readExact(envelopeHeaderBytes)
  const chunkBytes = header.readUInt32BE(10)
  if (
    !header.subarray(0, envelopeMagic.length).equals(envelopeMagic) ||
    header.readUInt8(8) !== envelopeVersion ||
    header.readUInt8(9) !== envelopeAlgorithmId ||
    chunkBytes < minimumChunkBytes ||
    chunkBytes > maximumChunkBytes ||
    !timingSafeEqual(header.subarray(22, 22 + contextDigestBytes), contextDigest(context))
  ) {
    failEnvelope()
  }
  return { header, chunkBytes }
}

export async function* decryptPortableExportArchiveEnvelope(
  source: ByteSource,
  rawContext: PortableExportArchiveEnvelopeContext,
  rawDataKey: Uint8Array,
): AsyncIterable<Buffer> {
  const context = validateContext(rawContext)
  const dataKey = copyDataKey(rawDataKey)
  const reader = new BoundedByteReader(source)

  try {
    const { header, chunkBytes } = await parseHeader(reader, context)
    let frameIndex = 0
    while (frameIndex <= maximumDataFrames) {
      const currentFrameHeader = await reader.readExact(frameHeaderBytes)
      const flags = currentFrameHeader.readUInt8(0)
      const plaintextBytes = currentFrameHeader.readUInt32BE(1)
      const isFinal = flags === finalFrameFlag
      if (
        (flags !== 0 && !isFinal) ||
        (isFinal && plaintextBytes !== 0) ||
        (!isFinal && (plaintextBytes < 1 || plaintextBytes > chunkBytes))
      ) {
        failEnvelope()
      }

      const ciphertext = await reader.readExact(plaintextBytes)
      const authenticationTag = await reader.readExact(authenticationTagBytes)
      try {
        const decipher = createDecipheriv(
          'aes-256-gcm',
          dataKey,
          createFrameNonce(header, frameIndex),
          { authTagLength: authenticationTagBytes },
        )
        decipher.setAAD(createFrameAad(header, frameIndex, currentFrameHeader), {
          plaintextLength: plaintextBytes,
        })
        decipher.setAuthTag(authenticationTag)
        const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
        if (isFinal) {
          await reader.assertEnd()
          return
        }
        yield plaintext
      } catch (error) {
        if (error instanceof PortableExportArchiveEnvelopeError) throw error
        failEnvelope()
      }
      frameIndex += 1
    }
    failEnvelope()
  } finally {
    dataKey.fill(0)
  }
}
