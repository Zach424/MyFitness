import { describe, expect, it } from 'vitest'

import {
  PrivacyExportVerificationError,
  privacyExportHttpFailureMessage,
  privacyExportContentTypeFromHeaders,
  verifyPrivacyExportArtifact,
} from './privacy-export-verification'

const validArtifact = () =>
  JSON.stringify({
    schemaVersion: 'myfitness-portable-export-v4',
    generatedAt: '2026-08-05T08:00:00.000Z',
    accountId: '11111111-1111-4111-8111-111111111111',
    data: {
      account: {},
      identities: [{}],
      profile: null,
      goal: {},
      consentEvents: [],
      healthRecords: [{}],
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

describe('portable privacy-export artifact verification', () => {
  it('uses product-owned copy only for the deterministic synchronous-size refusal', () => {
    expect(privacyExportHttpFailureMessage(413)).toBe(
      '当前数据副本超过 50 MiB 同步下载上限，未下载或保存。当前版本无法生成该副本。',
    )
    expect(privacyExportHttpFailureMessage(500)).toBeUndefined()
  })

  it('accepts the exact current envelope and returns only bounded receipt metadata', () => {
    const verification = verifyPrivacyExportArtifact(
      validArtifact(),
      'application/json; charset=utf-8',
    )
    expect(verification).toEqual({
      schemaVersion: 'myfitness-portable-export-v4',
      generatedAt: '2026-08-05T08:00:00.000Z',
      byteLength: expect.any(Number),
    })
    expect(verification).not.toHaveProperty('accountId')
    expect(verification).not.toHaveProperty('data')
  })

  it('rejects an incorrect media type before parsing content', () => {
    expect(() => verifyPrivacyExportArtifact(validArtifact(), 'text/plain')).toThrowError(
      expect.objectContaining<Partial<PrivacyExportVerificationError>>({ kind: 'content_type' }),
    )
  })

  it('rejects invalid JSON, old versions, extra keys and malformed data rows', () => {
    for (const artifact of [
      '{broken',
      validArtifact().replace('myfitness-portable-export-v4', 'myfitness-portable-export-v3'),
      JSON.stringify({ ...JSON.parse(validArtifact()), unexpected: true }),
      JSON.stringify({
        ...JSON.parse(validArtifact()),
        data: { ...JSON.parse(validArtifact()).data, healthRecords: ['private-text'] },
      }),
    ]) {
      expect(() => verifyPrivacyExportArtifact(artifact, 'application/json')).toThrowError(
        expect.objectContaining<Partial<PrivacyExportVerificationError>>({
          kind: 'invalid_contract',
        }),
      )
    }
  })

  it('extracts case-insensitive content type from platform header variants', () => {
    expect(privacyExportContentTypeFromHeaders({ 'Content-Type': 'application/json' })).toBe(
      'application/json',
    )
    expect(
      privacyExportContentTypeFromHeaders(
        'content-length: 10\r\ncontent-type: application/json\r\n',
      ),
    ).toBe('application/json')
    expect(privacyExportContentTypeFromHeaders(undefined)).toBeUndefined()
  })
})
