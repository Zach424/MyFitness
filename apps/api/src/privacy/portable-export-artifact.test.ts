import { HttpException, HttpStatus } from '@nestjs/common'
import {
  privacyExportSchema,
  privacyExportTooLargeCode,
  type PrivacyExport,
} from '@myfitness/contracts'
import { describe, expect, it } from 'vitest'

import { serializePortableExport } from './portable-export-artifact'

const fixture = (): PrivacyExport =>
  privacyExportSchema.parse({
    schemaVersion: 'myfitness-portable-export-v4',
    generatedAt: '2026-08-11T08:00:00.000Z',
    accountId: '11111111-1111-4111-8111-111111111111',
    data: {
      account: { display_name: '衡迹用户' },
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

describe('portable export server artifact', () => {
  it('serializes one deterministic UTF-8 attachment and accepts the exact byte boundary', () => {
    const unrestricted = serializePortableExport(fixture(), Number.MAX_SAFE_INTEGER)
    expect(unrestricted.at(-1)).toBe(10)
    expect(unrestricted.toString('utf8')).toContain('衡迹用户')
    expect(serializePortableExport(fixture(), unrestricted.byteLength)).toEqual(unrestricted)
  })

  it('rejects one byte above the boundary with a stable 413 receipt and no payload', () => {
    const artifact = serializePortableExport(fixture(), Number.MAX_SAFE_INTEGER)
    try {
      serializePortableExport(fixture(), artifact.byteLength - 1)
      throw new Error('expected portable export byte gate to reject')
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException)
      const exception = error as HttpException
      expect(exception.getStatus()).toBe(HttpStatus.PAYLOAD_TOO_LARGE)
      expect(exception.getResponse()).toEqual({
        statusCode: 413,
        code: privacyExportTooLargeCode,
        message: '同步数据副本超过当前 50 MiB 上限，未生成下载附件。',
        maximumBytes: artifact.byteLength - 1,
      })
      expect(exception.getResponse()).not.toHaveProperty('payload')
      expect(exception.getResponse()).not.toHaveProperty('data')
    }
  })
})
