import { AbortMultipartUploadCommand, CreateMultipartUploadCommand } from '@aws-sdk/client-s3'
import { describe, expect, it, vi } from 'vitest'

import {
  ObjectStorageService,
  privateObjectMultipartMinimumPartBytes,
} from './object-storage.service'

const serviceWithClient = (send: ReturnType<typeof vi.fn>) => {
  const service = new ObjectStorageService({
    runBackgroundJobs: false,
    verifyExternalDependencies: false,
  })
  const original = service as unknown as { client: { destroy(): void } }
  original.client.destroy()
  Object.defineProperty(service, 'client', {
    value: { send, destroy: vi.fn() },
  })
  return service
}

describe('private object multipart cleanup boundary', () => {
  it('preserves both the source failure and an abort cleanup failure', async () => {
    const sourceError = new Error('private object source failed')
    const abortError = new Error('private object abort failed')
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof CreateMultipartUploadCommand) return { UploadId: 'upload-1' }
      if (command instanceof AbortMultipartUploadCommand) throw abortError
      throw new Error('unexpected object storage command')
    })
    const service = serviceWithClient(send)
    const source = (async function* () {
      throw sourceError
    })()

    let rejected: unknown
    try {
      await service.putPrivateObjectStream({
        key: 'owner/archive.json.enc',
        body: source,
        contentType: 'application/octet-stream',
      })
    } catch (error) {
      rejected = error
    }

    expect(rejected).toBeInstanceOf(AggregateError)
    expect((rejected as AggregateError).message).toBe(
      'private object multipart upload failed and could not be aborted',
    )
    expect((rejected as AggregateError).errors).toEqual([sourceError, abortError])
    expect(send.mock.calls.map(([command]) => command.constructor.name)).toEqual([
      'CreateMultipartUploadCommand',
      'AbortMultipartUploadCommand',
    ])
  })

  it('rejects an invalid part size before creating a multipart upload', async () => {
    const send = vi.fn()
    const service = serviceWithClient(send)

    await expect(
      service.putPrivateObjectStream({
        key: 'owner/archive.json.enc',
        body: [],
        contentType: 'application/octet-stream',
        partBytes: privateObjectMultipartMinimumPartBytes - 1,
      }),
    ).rejects.toThrowError(RangeError)
    expect(send).not.toHaveBeenCalled()
  })
})
