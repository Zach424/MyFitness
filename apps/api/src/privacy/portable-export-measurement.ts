import { maximumPrivacyExportBytes, privacyExportTooLargeCode } from '@myfitness/contracts'
import * as z from 'zod'

export const portableExportMeasurementSchemaVersion =
  'myfitness-portable-export-measurement/v1' as const
export const defaultPortableExportMeasurementRecords = 25_000
export const maximumPortableExportMeasurementRecords = 100_000

const acceptedOutcomeSchema = z
  .object({
    status: z.literal('accepted'),
    artifactBytes: z.number().int().nonnegative().max(maximumPrivacyExportBytes),
  })
  .strict()

const refusedOutcomeSchema = z
  .object({
    status: z.literal('refused'),
    code: z.literal(privacyExportTooLargeCode),
    maximumBytes: z.literal(maximumPrivacyExportBytes),
  })
  .strict()

export const portableExportMeasurementReceiptSchema = z
  .object({
    schemaVersion: z.literal(portableExportMeasurementSchemaVersion),
    generatedAt: z.string().datetime({ offset: true }),
    fixture: z
      .object({
        kind: z.literal('synthetic_confirmed_health_records'),
        recordCount: z.number().int().min(1).max(maximumPortableExportMeasurementRecords),
        includesMedia: z.literal(false),
      })
      .strict(),
    outcome: z.discriminatedUnion('status', [acceptedOutcomeSchema, refusedOutcomeSchema]),
    durationMs: z.number().nonnegative(),
    memory: z
      .object({
        rssBeforeBytes: z.number().int().nonnegative(),
        rssAfterBytes: z.number().int().nonnegative(),
        heapUsedBeforeBytes: z.number().int().nonnegative(),
        heapUsedAfterBytes: z.number().int().nonnegative(),
        processMaxRssKiB: z.number().int().nonnegative(),
      })
      .strict(),
    runtime: z
      .object({
        node: z.string().min(1),
        platform: z.string().min(1),
        arch: z.string().min(1),
      })
      .strict(),
    caveats: z.tuple([
      z.literal('synthetic_fixture_without_media'),
      z.literal('process_high_water_mark_not_isolated_export_delta'),
      z.literal('local_measurement_not_production_capacity'),
    ]),
  })
  .strict()

export type PortableExportMeasurementReceipt = z.infer<
  typeof portableExportMeasurementReceiptSchema
>

export const parsePortableExportMeasurementRecords = (value: string | undefined) => {
  const records = Number(value ?? defaultPortableExportMeasurementRecords)
  if (
    !Number.isInteger(records) ||
    records < 1 ||
    records > maximumPortableExportMeasurementRecords
  ) {
    throw new Error(
      `PORTABLE_EXPORT_MEASURE_RECORDS must be an integer between 1 and ${maximumPortableExportMeasurementRecords}`,
    )
  }
  return records
}

export const assertLocalPortableExportMeasurementDatabase = (databaseUrl: string) => {
  let parsed: URL
  try {
    parsed = new URL(databaseUrl)
  } catch {
    throw new Error('portable export measurement requires a valid PostgreSQL URL')
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('portable export measurement requires a PostgreSQL URL')
  }
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(parsed.hostname)) {
    throw new Error('portable export measurement refuses non-loopback PostgreSQL')
  }
  return databaseUrl
}

export const createPortableExportMeasurementReceipt = (
  input: Omit<PortableExportMeasurementReceipt, 'schemaVersion' | 'caveats'>,
) =>
  portableExportMeasurementReceiptSchema.parse({
    schemaVersion: portableExportMeasurementSchemaVersion,
    ...input,
    caveats: [
      'synthetic_fixture_without_media',
      'process_high_water_mark_not_isolated_export_delta',
      'local_measurement_not_production_capacity',
    ],
  })
