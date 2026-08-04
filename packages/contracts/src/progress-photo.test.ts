import { describe, expect, it } from 'vitest'

import {
  createProgressPhotoSchema,
  progressPhotoAnalysisConsentVersion,
  progressPhotoItemSchema,
  progressPhotoQualityMethodVersion,
  progressPhotoQualitySchema,
  progressPhotoRetentionConsentVersion,
} from './progress-photo'

const quality = {
  methodVersion: progressPhotoQualityMethodVersion,
  machineEstimate: true,
  overallStatus: 'ready',
  metrics: { width: 1_000, height: 1_500, brightnessPercent: 52, contrastPercent: 31 },
  checks: [
    { key: 'orientation', status: 'ready', reason: 'portrait_ready' },
    { key: 'resolution', status: 'ready', reason: 'resolution_ready' },
    { key: 'lighting', status: 'ready', reason: 'lighting_ready' },
    { key: 'contrast', status: 'ready', reason: 'contrast_ready' },
  ],
} as const

describe('progress photo contracts', () => {
  it('requires separate explicit consent for retained comparison photos', () => {
    expect(() =>
      createProgressPhotoSchema.parse({
        view: 'front',
        capturedAt: '2026-08-04T06:00:00.000Z',
        timezone: 'Asia/Shanghai',
        analysisConsent: { granted: true, version: progressPhotoAnalysisConsentVersion },
        retention: { mode: 'retained' },
      }),
    ).toThrow()
    expect(
      createProgressPhotoSchema.parse({
        view: 'front',
        capturedAt: '2026-08-04T06:00:00.000Z',
        timezone: 'Asia/Shanghai',
        analysisConsent: { granted: true, version: progressPhotoAnalysisConsentVersion },
        retention: {
          mode: 'retained',
          consent: { granted: true, version: progressPhotoRetentionConsentVersion },
        },
      }).retention.mode,
    ).toBe('retained')
  })

  it('allows a default expiring analysis-only proof without retention consent', () => {
    expect(
      createProgressPhotoSchema.parse({
        view: 'side',
        capturedAt: '2026-08-04T06:00:00.000Z',
        timezone: 'Asia/Shanghai',
        analysisConsent: { granted: true, version: progressPhotoAnalysisConsentVersion },
        retention: { mode: 'analysis_only' },
      }).retention,
    ).toEqual({ mode: 'analysis_only' })
  })

  it('derives the quality summary from every bounded non-diagnostic check', () => {
    expect(progressPhotoQualitySchema.parse(quality).overallStatus).toBe('ready')
    expect(() =>
      progressPhotoQualitySchema.parse({
        ...quality,
        checks: [
          { key: 'orientation', status: 'adjust', reason: 'use_portrait_frame' },
          ...quality.checks.slice(1),
        ],
      }),
    ).toThrow('overallStatus must summarize')
  })

  it('keeps retained and expiring previews structurally distinct', () => {
    const base = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status: 'ready',
      view: 'front',
      previewPath: '/v1/progress-photos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/preview?token=x',
      analysisAvailable: true,
      quality,
      mediaDeleted: false,
      mediaDeletionStatus: 'not_required',
      capturedAt: '2026-08-04T06:00:00.000Z',
      timezone: 'Asia/Shanghai',
      createdAt: '2026-08-04T06:01:00.000Z',
    } as const
    expect(
      progressPhotoItemSchema.parse({ ...base, retentionMode: 'retained', expiresAt: null })
        .expiresAt,
    ).toBeNull()
    expect(() =>
      progressPhotoItemSchema.parse({
        ...base,
        retentionMode: 'analysis_only',
        expiresAt: null,
      }),
    ).toThrow('only analysis-only photos require an expiry')
  })
})
