import { describe, expect, it } from 'vitest'

import {
  assertPortableExportArchiveTransition,
  isPortableExportArchiveTransitionAllowed,
  portableExportArchiveReceiptSchema,
  portableExportArchiveReceiptSchemaVersion,
} from './privacy-export-archive'

const baseReceipt = {
  schemaVersion: portableExportArchiveReceiptSchemaVersion,
  archiveId: '10000000-0000-4000-8000-000000000001',
  requestedAt: '2026-08-11T08:00:00.000Z',
  updatedAt: '2026-08-11T08:04:00.000Z',
  generationExpiresAt: '2026-08-11T09:00:00.000Z',
}

describe('portable export archive custody contract', () => {
  it('accepts queued and available minimal receipts without storage authority', () => {
    expect(
      portableExportArchiveReceiptSchema.parse({
        ...baseReceipt,
        status: 'queued',
        availableAt: null,
        downloadExpiresAt: null,
        artifact: null,
        failureCode: null,
        dispositionReason: null,
        disposedAt: null,
      }),
    ).not.toHaveProperty('objectKey')

    expect(
      portableExportArchiveReceiptSchema.parse({
        ...baseReceipt,
        status: 'available',
        availableAt: '2026-08-11T08:03:00.000Z',
        downloadExpiresAt: '2026-08-12T08:03:00.000Z',
        artifact: { byteSize: 1024, sha256: 'a'.repeat(64) },
        failureCode: null,
        dispositionReason: null,
        disposedAt: null,
      }),
    ).not.toHaveProperty('encryptionKeyRef')
  })

  it('requires state-specific failure, availability and disposition evidence', () => {
    const queued = {
      ...baseReceipt,
      status: 'queued',
      availableAt: null,
      downloadExpiresAt: null,
      artifact: null,
      failureCode: null,
      dispositionReason: null,
      disposedAt: null,
    }
    for (const invalid of [
      {
        ...baseReceipt,
        status: 'available',
        availableAt: null,
        downloadExpiresAt: null,
        artifact: null,
        failureCode: null,
        dispositionReason: null,
        disposedAt: null,
      },
      {
        ...baseReceipt,
        status: 'failed',
        availableAt: null,
        downloadExpiresAt: null,
        artifact: null,
        failureCode: null,
        dispositionReason: null,
        disposedAt: null,
      },
      {
        ...baseReceipt,
        status: 'disposed',
        availableAt: null,
        downloadExpiresAt: null,
        artifact: null,
        failureCode: null,
        dispositionReason: 'account_erasure',
        disposedAt: null,
      },
      { ...queued, downloadExpiresAt: '2026-08-12T08:03:00.000Z' },
      { ...queued, objectKey: 'private-exports/owner/archive.json.enc' },
      {
        ...queued,
        status: 'available',
        updatedAt: '2026-08-11T10:01:00.000Z',
        availableAt: '2026-08-11T10:00:00.000Z',
        downloadExpiresAt: '2026-08-12T10:00:00.000Z',
        artifact: { byteSize: 1024, sha256: 'a'.repeat(64) },
      },
      {
        ...baseReceipt,
        status: 'available',
        availableAt: '2026-08-11T08:03:00.000Z',
        downloadExpiresAt: '2026-08-12T08:03:00.000Z',
        artifact: { byteSize: Number.MAX_SAFE_INTEGER + 1, sha256: 'a'.repeat(64) },
        failureCode: null,
        dispositionReason: null,
        disposedAt: null,
      },
    ]) {
      expect(portableExportArchiveReceiptSchema.safeParse(invalid).success).toBe(false)
    }
  })

  it('locks the monotonic state transition graph', () => {
    expect(isPortableExportArchiveTransitionAllowed('queued', 'generating')).toBe(true)
    expect(isPortableExportArchiveTransitionAllowed('generating', 'available')).toBe(true)
    expect(isPortableExportArchiveTransitionAllowed('available', 'deletion_pending')).toBe(true)
    expect(isPortableExportArchiveTransitionAllowed('deletion_pending', 'disposed')).toBe(true)
    expect(isPortableExportArchiveTransitionAllowed('failed', 'deletion_pending')).toBe(false)
    expect(isPortableExportArchiveTransitionAllowed('available', 'generating')).toBe(false)
    expect(isPortableExportArchiveTransitionAllowed('disposed', 'queued')).toBe(false)
    expect(() => assertPortableExportArchiveTransition('queued', 'available')).toThrowError(
      RangeError,
    )
  })
})
