import { createHash } from 'node:crypto'

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
  type CompletedPart,
  type ServerSideEncryption,
} from '@aws-sdk/client-s3'
import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'

import {
  APPLICATION_LIFECYCLE_POLICY,
  type ApplicationLifecyclePolicy,
} from '../application-lifecycle'
import { getRuntimeConfig } from '../config'

export class ObjectNotFoundError extends Error {
  readonly code = 'ENOENT'

  constructor() {
    super('private object is unavailable')
  }
}

export class ObjectAlreadyExistsError extends Error {
  constructor() {
    super('private object already exists')
  }
}

type PutPrivateObjectInput = {
  key: string
  body: Buffer
  contentType: string
  sha256Base64?: string
  metadata?: Record<string, string>
  ifAbsent?: boolean
}

type PrivateObjectByteSource = Iterable<Uint8Array> | AsyncIterable<Uint8Array>

type PutPrivateObjectStreamInput = Omit<PutPrivateObjectInput, 'body' | 'sha256Base64'> & {
  body: PrivateObjectByteSource
  partBytes?: number
  signal?: AbortSignal
}

export const privateObjectMultipartMinimumPartBytes = 5 * 1024 * 1024
export const privateObjectMultipartDefaultPartBytes = 8 * 1024 * 1024

const privateObjectMultipartMaximumPartBytes = 64 * 1024 * 1024
const privateObjectMultipartMaximumParts = 10_000

const asBuffer = (chunk: Uint8Array) => {
  if (!(chunk instanceof Uint8Array)) {
    throw new TypeError('private object stream must emit byte chunks')
  }
  return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
}

async function* multipartParts(
  source: PrivateObjectByteSource,
  partBytes: number,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted()
  let pending = Buffer.allocUnsafe(partBytes)
  let pendingBytes = 0

  for await (const rawChunk of source) {
    signal?.throwIfAborted()
    const chunk = asBuffer(rawChunk)
    let offset = 0
    while (offset < chunk.length) {
      const copied = chunk.copy(
        pending,
        pendingBytes,
        offset,
        Math.min(chunk.length, offset + partBytes - pendingBytes),
      )
      pendingBytes += copied
      offset += copied
      if (pendingBytes === partBytes) {
        yield pending
        pending = Buffer.allocUnsafe(partBytes)
        pendingBytes = 0
      }
    }
  }

  if (pendingBytes > 0) yield pending.subarray(0, pendingBytes)
}

@Injectable()
export class ObjectStorageService implements OnModuleInit, OnModuleDestroy {
  private readonly config = getRuntimeConfig()
  private readonly client = new S3Client({
    region: this.config.objectStorageRegion,
    endpoint: this.config.objectStorageEndpoint,
    forcePathStyle: this.config.objectStorageForcePathStyle,
    credentials:
      this.config.objectStorageAccessKeyId && this.config.objectStorageSecretAccessKey
        ? {
            accessKeyId: this.config.objectStorageAccessKeyId,
            secretAccessKey: this.config.objectStorageSecretAccessKey,
          }
        : undefined,
  })
  private injectedFailure: 'delete' | 'put' | 'get' | null = null

  constructor(
    @Inject(APPLICATION_LIFECYCLE_POLICY)
    private readonly lifecycle: ApplicationLifecyclePolicy,
  ) {}

  private validateKey(key: string) {
    if (
      key.length < 3 ||
      key.length > 512 ||
      key.startsWith('/') ||
      key.endsWith('/') ||
      key.includes('//') ||
      !/^[A-Za-z0-9][A-Za-z0-9/._-]+$/.test(key) ||
      key.split('/').some((segment) => segment === '.' || segment === '..')
    ) {
      throw new Error('invalid private object key')
    }
    return key
  }

  private failIfInjected(operation: 'delete' | 'put' | 'get') {
    if (this.injectedFailure === operation) {
      this.injectedFailure = null
      throw new Error(`injected ${operation} failure`)
    }
  }

  failNextForTest(operation: 'delete' | 'put' | 'get') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('object-storage fault injection is disabled in production')
    }
    this.injectedFailure = operation
  }

  private isMissing(error: unknown) {
    const candidate = error as {
      name?: string
      Code?: string
      $metadata?: { httpStatusCode?: number }
    }
    return (
      candidate.$metadata?.httpStatusCode === 404 ||
      ['NoSuchBucket', 'NoSuchKey', 'NotFound'].includes(candidate.name ?? '') ||
      ['NoSuchBucket', 'NoSuchKey', 'NotFound'].includes(candidate.Code ?? '')
    )
  }

  private isPreconditionFailure(error: unknown) {
    const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } }
    return candidate.$metadata?.httpStatusCode === 412 || candidate.name === 'PreconditionFailed'
  }

  private encryptionHeaders() {
    return this.config.objectStorageSse === 'none'
      ? {}
      : {
          ServerSideEncryption: this.config.objectStorageSse as ServerSideEncryption,
          SSEKMSKeyId:
            this.config.objectStorageSse === 'aws:kms'
              ? this.config.objectStorageKmsKeyId
              : undefined,
        }
  }

  private validateMultipartPartBytes(partBytes: number) {
    if (
      !Number.isSafeInteger(partBytes) ||
      partBytes < privateObjectMultipartMinimumPartBytes ||
      partBytes > privateObjectMultipartMaximumPartBytes
    ) {
      throw new RangeError(
        `private object multipart size must be between ${privateObjectMultipartMinimumPartBytes} and ${privateObjectMultipartMaximumPartBytes} bytes`,
      )
    }
    return partBytes
  }

  async onModuleInit() {
    if (!this.lifecycle.verifyExternalDependencies) return
    try {
      await this.ping()
    } catch (error) {
      if (!this.config.objectStorageAutoCreateBucket || !this.isMissing(error)) throw error
      await this.client.send(new CreateBucketCommand({ Bucket: this.config.objectStorageBucket }))
      await this.ping()
    }
  }

  async ping() {
    await this.client.send(new HeadBucketCommand({ Bucket: this.config.objectStorageBucket }))
  }

  async putPrivateObject(input: PutPrivateObjectInput) {
    this.failIfInjected('put')
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.objectStorageBucket,
          Key: this.validateKey(input.key),
          Body: input.body,
          ContentType: input.contentType,
          CacheControl: 'no-store, private',
          ChecksumSHA256: input.sha256Base64,
          Metadata: input.metadata,
          IfNoneMatch: input.ifAbsent ? '*' : undefined,
          ...this.encryptionHeaders(),
        }),
      )
    } catch (error) {
      if (this.isPreconditionFailure(error)) throw new ObjectAlreadyExistsError()
      throw error
    }
  }

  async putPrivateObjectStream(input: PutPrivateObjectStreamInput) {
    this.failIfInjected('put')
    input.signal?.throwIfAborted()
    const key = this.validateKey(input.key)
    const partBytes = this.validateMultipartPartBytes(
      input.partBytes ?? privateObjectMultipartDefaultPartBytes,
    )
    let uploadId: string | undefined

    try {
      const created = await this.client.send(
        new CreateMultipartUploadCommand({
          Bucket: this.config.objectStorageBucket,
          Key: key,
          ContentType: input.contentType,
          CacheControl: 'no-store, private',
          Metadata: input.metadata,
          ChecksumAlgorithm: 'SHA256',
          ChecksumType: 'COMPOSITE',
          ...this.encryptionHeaders(),
        }),
        { abortSignal: input.signal },
      )
      uploadId = created.UploadId
      if (!uploadId) throw new Error('private object multipart upload did not return an upload id')

      const completedParts: CompletedPart[] = []
      const fullHash = createHash('sha256')
      let byteLength = 0

      const uploadPart = async (body: Buffer) => {
        const partNumber = completedParts.length + 1
        if (partNumber > privateObjectMultipartMaximumParts) {
          throw new RangeError('private object multipart upload exceeds 10,000 parts')
        }
        if (byteLength > Number.MAX_SAFE_INTEGER - body.length) {
          throw new RangeError('private object stream exceeds the safe integer byte boundary')
        }
        const checksumSha256 = createHash('sha256').update(body).digest('base64')
        const uploaded = await this.client.send(
          new UploadPartCommand({
            Bucket: this.config.objectStorageBucket,
            Key: key,
            UploadId: uploadId,
            PartNumber: partNumber,
            Body: body,
            ContentLength: body.length,
            ChecksumAlgorithm: 'SHA256',
            ChecksumSHA256: checksumSha256,
          }),
          { abortSignal: input.signal },
        )
        if (!uploaded.ETag) throw new Error('private object multipart part did not return an ETag')
        if (uploaded.ChecksumSHA256 && uploaded.ChecksumSHA256 !== checksumSha256) {
          throw new Error('private object multipart part checksum response did not match')
        }
        fullHash.update(body)
        byteLength += body.length
        completedParts.push({
          PartNumber: partNumber,
          ETag: uploaded.ETag,
          ChecksumSHA256: uploaded.ChecksumSHA256 ?? checksumSha256,
        })
      }

      for await (const part of multipartParts(input.body, partBytes, input.signal)) {
        await uploadPart(part)
      }
      if (completedParts.length === 0) await uploadPart(Buffer.alloc(0))

      await this.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.config.objectStorageBucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: { Parts: completedParts },
          IfNoneMatch: input.ifAbsent ? '*' : undefined,
        }),
        { abortSignal: input.signal },
      )
      uploadId = undefined

      return {
        partBytes,
        partCount: completedParts.length,
        byteLength,
        sha256: fullHash.digest('hex'),
      }
    } catch (error) {
      const operationError = this.isPreconditionFailure(error)
        ? new ObjectAlreadyExistsError()
        : error
      if (uploadId) {
        try {
          await this.client.send(
            new AbortMultipartUploadCommand({
              Bucket: this.config.objectStorageBucket,
              Key: key,
              UploadId: uploadId,
            }),
          )
        } catch (abortError) {
          throw new AggregateError(
            [operationError, abortError],
            'private object multipart upload failed and could not be aborted',
          )
        }
      }
      throw operationError
    }
  }

  async getPrivateObject(key: string) {
    this.failIfInjected('get')
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.objectStorageBucket,
          Key: this.validateKey(key),
        }),
      )
      if (!response.Body) throw new ObjectNotFoundError()
      return Buffer.from(await response.Body.transformToByteArray())
    } catch (error) {
      if (this.isMissing(error)) throw new ObjectNotFoundError()
      throw error
    }
  }

  async hasPrivateObject(key: string) {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.config.objectStorageBucket,
          Key: this.validateKey(key),
        }),
      )
      return true
    } catch (error) {
      if (this.isMissing(error)) return false
      throw error
    }
  }

  async deletePrivateObject(key: string) {
    this.failIfInjected('delete')
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.config.objectStorageBucket,
        Key: this.validateKey(key),
      }),
    )
  }

  async listPrivateObjectKeys(prefix: string) {
    const safePrefix = `${this.validateKey(prefix.replace(/\/$/, ''))}/`
    const keys: string[] = []
    let continuationToken: string | undefined
    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.config.objectStorageBucket,
          Prefix: safePrefix,
          ContinuationToken: continuationToken,
        }),
      )
      for (const item of response.Contents ?? []) {
        if (item.Key) keys.push(item.Key)
      }
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
    } while (continuationToken)
    return keys
  }

  async deletePrivatePrefix(prefix: string) {
    const keys = await this.listPrivateObjectKeys(prefix)
    for (let offset = 0; offset < keys.length; offset += 1_000) {
      this.failIfInjected('delete')
      const batch = keys.slice(offset, offset + 1_000)
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.config.objectStorageBucket,
          Delete: { Quiet: true, Objects: batch.map((Key) => ({ Key })) },
        }),
      )
    }
    return keys.length
  }

  onModuleDestroy() {
    this.client.destroy()
  }
}
