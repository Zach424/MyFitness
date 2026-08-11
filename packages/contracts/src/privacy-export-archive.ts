import * as z from 'zod'

export const portableExportArchiveReceiptSchemaVersion =
  'myfitness-portable-export-archive-receipt/v1' as const

export const portableExportArchiveStatuses = [
  'queued',
  'generating',
  'available',
  'failed',
  'deletion_pending',
  'disposed',
] as const

export const portableExportArchiveFailureCodes = [
  'generation_expired',
  'archive_size_limit_exceeded',
  'object_storage_unavailable',
  'database_unavailable',
  'invalid_archive_state',
  'unexpected_error',
] as const

export const portableExportArchiveDispositionReasons = [
  'retention_expired',
  'account_erasure',
  'user_requested',
] as const

export const portableExportArchiveStatusSchema = z.enum(portableExportArchiveStatuses)
export const portableExportArchiveFailureCodeSchema = z.enum(portableExportArchiveFailureCodes)
export const portableExportArchiveDispositionReasonSchema = z.enum(
  portableExportArchiveDispositionReasons,
)

export type PortableExportArchiveStatus = z.infer<typeof portableExportArchiveStatusSchema>

const allowedTransitions: Record<
  PortableExportArchiveStatus,
  readonly PortableExportArchiveStatus[]
> = {
  queued: ['generating', 'failed', 'deletion_pending'],
  generating: ['available', 'failed', 'deletion_pending'],
  available: ['deletion_pending'],
  failed: [],
  deletion_pending: ['disposed'],
  disposed: [],
}

export const isPortableExportArchiveTransitionAllowed = (
  from: PortableExportArchiveStatus,
  to: PortableExportArchiveStatus,
) => allowedTransitions[from].includes(to)

export const assertPortableExportArchiveTransition = (
  from: PortableExportArchiveStatus,
  to: PortableExportArchiveStatus,
) => {
  if (!isPortableExportArchiveTransitionAllowed(from, to)) {
    throw new RangeError(`portable export archive transition ${from} -> ${to} is not allowed`)
  }
}

const archiveArtifactReceiptSchema = z
  .object({
    byteSize: z.number().int().positive(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict()

export const portableExportArchiveReceiptSchema = z
  .object({
    schemaVersion: z.literal(portableExportArchiveReceiptSchemaVersion),
    archiveId: z.string().uuid(),
    status: portableExportArchiveStatusSchema,
    requestedAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    generationExpiresAt: z.string().datetime({ offset: true }),
    availableAt: z.string().datetime({ offset: true }).nullable(),
    downloadExpiresAt: z.string().datetime({ offset: true }).nullable(),
    artifact: archiveArtifactReceiptSchema.nullable(),
    failureCode: portableExportArchiveFailureCodeSchema.nullable(),
    dispositionReason: portableExportArchiveDispositionReasonSchema.nullable(),
    disposedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict()
  .superRefine((receipt, context) => {
    if ((receipt.availableAt === null) !== (receipt.downloadExpiresAt === null)) {
      context.addIssue({
        code: 'custom',
        message: 'availability timestamps must be present together',
      })
    }
    const hasArtifact = receipt.artifact !== null
    const hasAvailability = receipt.availableAt !== null && receipt.downloadExpiresAt !== null
    if (hasArtifact !== hasAvailability) {
      context.addIssue({
        code: 'custom',
        message: 'artifact and availability timestamps must be present together',
      })
    }

    if (receipt.status === 'available' && !hasArtifact) {
      context.addIssue({ code: 'custom', message: 'available archive requires artifact receipt' })
    }
    if (
      ['queued', 'generating', 'failed'].includes(receipt.status) &&
      (hasArtifact || receipt.dispositionReason !== null || receipt.disposedAt !== null)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'unfinished archive exposes invalid custody state',
      })
    }
    if ((receipt.status === 'queued' || receipt.status === 'generating') && receipt.failureCode) {
      context.addIssue({ code: 'custom', message: 'active archive cannot expose a failure' })
    }
    if (receipt.status === 'failed' && !receipt.failureCode) {
      context.addIssue({ code: 'custom', message: 'failed archive requires a failure code' })
    }
    if (!['failed'].includes(receipt.status) && receipt.failureCode) {
      context.addIssue({ code: 'custom', message: 'only failed archive can expose a failure code' })
    }
    if (
      (receipt.status === 'deletion_pending' || receipt.status === 'disposed') !==
      (receipt.dispositionReason !== null)
    ) {
      context.addIssue({ code: 'custom', message: 'disposition state requires a reason' })
    }
    if ((receipt.status === 'disposed') !== (receipt.disposedAt !== null)) {
      context.addIssue({ code: 'custom', message: 'disposed state requires disposedAt only' })
    }

    const requestedAt = Date.parse(receipt.requestedAt)
    const updatedAt = Date.parse(receipt.updatedAt)
    const generationExpiresAt = Date.parse(receipt.generationExpiresAt)
    if (updatedAt < requestedAt || generationExpiresAt <= requestedAt) {
      context.addIssue({ code: 'custom', message: 'archive receipt timestamps are out of order' })
    }
    if (
      receipt.availableAt &&
      receipt.downloadExpiresAt &&
      (Date.parse(receipt.availableAt) < requestedAt ||
        Date.parse(receipt.availableAt) > updatedAt ||
        Date.parse(receipt.availableAt) > generationExpiresAt ||
        Date.parse(receipt.downloadExpiresAt) <= Date.parse(receipt.availableAt))
    ) {
      context.addIssue({ code: 'custom', message: 'availability timestamps are out of order' })
    }
    if (
      receipt.disposedAt &&
      (Date.parse(receipt.disposedAt) < requestedAt ||
        Date.parse(receipt.disposedAt) > updatedAt ||
        (receipt.availableAt !== null &&
          Date.parse(receipt.disposedAt) < Date.parse(receipt.availableAt)))
    ) {
      context.addIssue({ code: 'custom', message: 'disposition cannot precede request' })
    }
  })

export type PortableExportArchiveReceipt = z.infer<typeof portableExportArchiveReceiptSchema>
