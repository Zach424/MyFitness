import { createHash, randomUUID } from 'node:crypto'

import { ListMultipartUploadsCommand, S3Client } from '@aws-sdk/client-s3'
import type { INestApplication } from '@nestjs/common'
import {
  privacyExportSchema,
  privacyExportSchemaVersion,
  type PrivacyExport,
} from '@myfitness/contracts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApplication } from '../bootstrap'
import { getRuntimeConfig } from '../config'
import {
  createPortableExportArchiveEncryption,
  decryptPortableExportArchiveEnvelope,
  generatePortableExportArchiveDataKey,
  type PortableExportArchiveEnvelopeContext,
} from '../privacy/portable-export-archive-envelope'
import { createPortableExportJsonStream } from '../privacy/portable-export-json-stream'
import {
  ObjectAlreadyExistsError,
  ObjectStorageService,
  privateObjectMultipartMinimumPartBytes,
} from './object-storage.service'

const fixture = (): PrivacyExport =>
  privacyExportSchema.parse({
    schemaVersion: privacyExportSchemaVersion,
    generatedAt: '2026-08-11T08:00:00.000Z',
    accountId: '11111111-1111-4111-8111-111111111111',
    data: {
      account: { status: 'active' },
      identities: [],
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

describe('private object bounded multipart stream', () => {
  const config = getRuntimeConfig()
  const keys = new Set<string>()
  let app: INestApplication
  let objects: ObjectStorageService
  let inspector: S3Client

  const expectNoIncompleteUpload = async (key: string) => {
    const listed = await inspector.send(
      new ListMultipartUploadsCommand({
        Bucket: config.objectStorageBucket,
        Prefix: key,
      }),
    )
    expect((listed.Uploads ?? []).filter((upload) => upload.Key === key)).toEqual([])
  }

  beforeAll(async () => {
    app = await createApplication(false)
    await app.init()
    objects = app.get(ObjectStorageService)
    inspector = new S3Client({
      region: config.objectStorageRegion,
      endpoint: config.objectStorageEndpoint,
      forcePathStyle: config.objectStorageForcePathStyle,
      credentials:
        config.objectStorageAccessKeyId && config.objectStorageSecretAccessKey
          ? {
              accessKeyId: config.objectStorageAccessKeyId,
              secretAccessKey: config.objectStorageSecretAccessKey,
            }
          : undefined,
    })
  })

  afterAll(async () => {
    for (const key of keys) await objects.deletePrivateObject(key)
    inspector.destroy()
    await app.close()
  })

  it('persists the JSON and authenticated envelope pipeline with matching completion receipts', async () => {
    const payload = fixture()
    payload.data.account.large_note = 'archive-object-stream-'.repeat(300_000)
    const ownerId = randomUUID()
    const archiveId = randomUUID()
    const key = `${ownerId}/${archiveId}.json.enc`
    keys.add(key)
    const context: PortableExportArchiveEnvelopeContext = {
      ownerId,
      archiveId,
      exportSchemaVersion: privacyExportSchemaVersion,
      encryptionKeyRef: 'kms/local/object-stream-integration-v1',
    }
    const dataKey = generatePortableExportArchiveDataKey()
    const json = createPortableExportJsonStream(payload)
    const encryption = createPortableExportArchiveEncryption(json.bytes, context, dataKey)

    const storedReceipt = await objects.putPrivateObjectStream({
      key,
      body: encryption.encrypted,
      contentType: 'application/octet-stream',
      ifAbsent: true,
      partBytes: privateObjectMultipartMinimumPartBytes,
    })
    const [jsonReceipt, encryptionReceipt] = await Promise.all([json.receipt, encryption.receipt])

    expect(storedReceipt).toEqual({
      partBytes: privateObjectMultipartMinimumPartBytes,
      partCount: 2,
      byteLength: encryptionReceipt.encryptedByteSize,
      sha256: encryptionReceipt.encryptedSha256,
    })
    const stored = await objects.getPrivateObject(key)
    expect(stored.length).toBe(storedReceipt.byteLength)
    expect(createHash('sha256').update(stored).digest('hex')).toBe(storedReceipt.sha256)

    const plaintextHash = createHash('sha256')
    let plaintextBytes = 0
    for await (const chunk of decryptPortableExportArchiveEnvelope([stored], context, dataKey)) {
      plaintextBytes += chunk.length
      plaintextHash.update(chunk)
    }
    expect(plaintextBytes).toBe(jsonReceipt.byteLength)
    expect(plaintextHash.digest('hex')).toBe(jsonReceipt.sha256)
    await expectNoIncompleteUpload(key)
  })

  it('keeps the existing object and aborts uploaded parts when conditional completion loses', async () => {
    const key = `verification/conditional-${randomUUID()}.bin`
    keys.add(key)
    const original = Buffer.from('original-private-object')
    await objects.putPrivateObject({
      key,
      body: original,
      contentType: 'application/octet-stream',
      ifAbsent: true,
    })

    await expect(
      objects.putPrivateObjectStream({
        key,
        body: [Buffer.alloc(privateObjectMultipartMinimumPartBytes + 17, 0x42)],
        contentType: 'application/octet-stream',
        ifAbsent: true,
        partBytes: privateObjectMultipartMinimumPartBytes,
      }),
    ).rejects.toBeInstanceOf(ObjectAlreadyExistsError)

    await expect(objects.getPrivateObject(key)).resolves.toEqual(original)
    await expectNoIncompleteUpload(key)
  })

  it('aborts an incomplete upload and publishes no object when the source fails after one part', async () => {
    const key = `verification/source-failure-${randomUUID()}.bin`
    keys.add(key)
    const source = (async function* () {
      yield Buffer.alloc(privateObjectMultipartMinimumPartBytes, 0x43)
      throw new Error('injected private object source failure')
    })()

    await expect(
      objects.putPrivateObjectStream({
        key,
        body: source,
        contentType: 'application/octet-stream',
        ifAbsent: true,
        partBytes: privateObjectMultipartMinimumPartBytes,
      }),
    ).rejects.toThrowError('injected private object source failure')

    await expect(objects.hasPrivateObject(key)).resolves.toBe(false)
    await expectNoIncompleteUpload(key)
  })

  it('uses an abort signal to stop before the next part and removes the incomplete upload', async () => {
    const key = `verification/cancelled-${randomUUID()}.bin`
    keys.add(key)
    const controller = new AbortController()
    const source = (async function* () {
      yield Buffer.alloc(privateObjectMultipartMinimumPartBytes, 0x44)
      controller.abort(new Error('cancelled private object upload'))
      yield Buffer.from('must-not-upload')
    })()

    await expect(
      objects.putPrivateObjectStream({
        key,
        body: source,
        contentType: 'application/octet-stream',
        ifAbsent: true,
        partBytes: privateObjectMultipartMinimumPartBytes,
        signal: controller.signal,
      }),
    ).rejects.toThrowError('cancelled private object upload')

    await expect(objects.hasPrivateObject(key)).resolves.toBe(false)
    await expectNoIncompleteUpload(key)
  })
})
