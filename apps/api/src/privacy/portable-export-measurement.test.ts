import { maximumPrivacyExportBytes, privacyExportTooLargeCode } from '@myfitness/contracts'
import { describe, expect, it } from 'vitest'

import {
  assertLocalPortableExportMeasurementDatabase,
  createPortableExportMeasurementReceipt,
  defaultPortableExportMeasurementRecords,
  maximumPortableExportMeasurementRecords,
  parsePortableExportMeasurementRecords,
  portableExportMeasurementReceiptSchema,
} from './portable-export-measurement'

describe('portable export measurement receipt', () => {
  it('bounds the synthetic record count', () => {
    expect(parsePortableExportMeasurementRecords(undefined)).toBe(
      defaultPortableExportMeasurementRecords,
    )
    expect(parsePortableExportMeasurementRecords('1')).toBe(1)
    expect(
      parsePortableExportMeasurementRecords(String(maximumPortableExportMeasurementRecords)),
    ).toBe(maximumPortableExportMeasurementRecords)
    for (const invalid of ['0', '1.5', '-1', '100001', 'not-a-number']) {
      expect(() => parsePortableExportMeasurementRecords(invalid)).toThrowError(
        'PORTABLE_EXPORT_MEASURE_RECORDS',
      )
    }
  })

  it('refuses non-loopback and non-PostgreSQL targets', () => {
    expect(
      assertLocalPortableExportMeasurementDatabase(
        'postgresql://user:secret@127.0.0.1:54329/myfitness',
      ),
    ).toContain('127.0.0.1')
    expect(
      assertLocalPortableExportMeasurementDatabase('postgresql://user:secret@[::1]/myfitness'),
    ).toContain('[::1]')
    expect(() =>
      assertLocalPortableExportMeasurementDatabase(
        'postgresql://user:secret@database.example.com/myfitness',
      ),
    ).toThrowError('refuses non-loopback PostgreSQL')
    expect(() =>
      assertLocalPortableExportMeasurementDatabase('https://127.0.0.1/myfitness'),
    ).toThrowError('requires a PostgreSQL URL')
  })

  it('emits a strict aggregate-only receipt without an account identifier', () => {
    const receipt = createPortableExportMeasurementReceipt({
      generatedAt: '2026-08-11T08:00:00.000Z',
      fixture: {
        kind: 'synthetic_confirmed_health_records',
        recordCount: 25_000,
        includesMedia: false,
      },
      outcome: {
        status: 'refused',
        code: privacyExportTooLargeCode,
        maximumBytes: maximumPrivacyExportBytes,
      },
      durationMs: 123.45,
      memory: {
        rssBeforeBytes: 100,
        rssAfterBytes: 200,
        heapUsedBeforeBytes: 50,
        heapUsedAfterBytes: 150,
        processMaxRssKiB: 1,
      },
      runtime: { node: 'v24.0.0', platform: 'win32', arch: 'x64' },
    })

    expect(portableExportMeasurementReceiptSchema.parse(receipt)).toEqual(receipt)
    expect(JSON.stringify(receipt)).not.toContain('accountId')
    expect(JSON.stringify(receipt)).not.toContain('userId')
  })
})
