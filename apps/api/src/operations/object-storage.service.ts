import {
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type ServerSideEncryption,
} from '@aws-sdk/client-s3'
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'

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

  async onModuleInit() {
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
    const encryption =
      this.config.objectStorageSse === 'none'
        ? {}
        : {
            ServerSideEncryption: this.config.objectStorageSse as ServerSideEncryption,
            SSEKMSKeyId:
              this.config.objectStorageSse === 'aws:kms'
                ? this.config.objectStorageKmsKeyId
                : undefined,
          }
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
          ...encryption,
        }),
      )
    } catch (error) {
      if (this.isPreconditionFailure(error)) throw new ObjectAlreadyExistsError()
      throw error
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
