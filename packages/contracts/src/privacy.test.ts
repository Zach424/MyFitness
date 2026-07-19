import { describe, expect, it } from 'vitest'

import {
  accountDeletionConfirmationPhrase,
  accountDeletionResultSchema,
  accountDeletionRequestSchema,
  consentRevocationRequestSchema,
  privacyDataCategories,
  privacyOverviewSchema,
  revocableConsentPurposeSchema,
} from './privacy'

describe('privacy contracts', () => {
  it('keeps optional revocation narrower than required service consent', () => {
    expect(revocableConsentPurposeSchema.parse('ai_plan_explanation')).toBe('ai_plan_explanation')
    expect(revocableConsentPurposeSchema.parse('food_photo_analysis')).toBe('food_photo_analysis')
    expect(revocableConsentPurposeSchema.safeParse('health_data').success).toBe(false)
    expect(consentRevocationRequestSchema.parse({ confirmed: true })).toEqual({ confirmed: true })
  })

  it('requires the exact permanent-account confirmation', () => {
    expect(
      accountDeletionRequestSchema.parse({
        confirmationPhrase: accountDeletionConfirmationPhrase,
        exportChoice: 'skip',
        understandsPermanent: true,
      }),
    ).toMatchObject({ confirmationPhrase: accountDeletionConfirmationPhrase })
    expect(
      accountDeletionRequestSchema.safeParse({
        confirmationPhrase: '删除账户',
        exportChoice: 'skip',
        understandsPermanent: true,
      }).success,
    ).toBe(false)
  })

  it('separates queued primary, media, provider and backup deletion evidence', () => {
    expect(
      accountDeletionResultSchema.parse({
        receiptId: '7f568918-1141-4cc4-ae9e-f700c5239608',
        statusToken: 'x'.repeat(43),
        status: 'queued',
        deleted: false,
        scopeVersion: 'durable-erasure-v2',
        primaryStoreStatus: 'pending',
        mediaStatus: 'pending',
        providerStatus: 'pending',
        backupStatus: 'pending',
        requestedAt: '2026-07-19T08:00:00.000Z',
        deletedAt: null,
        lastErrorCode: 'object_storage_unavailable',
      }),
    ).toMatchObject({ deleted: false, backupStatus: 'pending' })
  })

  it('rejects incomplete inventory responses', () => {
    const result = privacyOverviewSchema.safeParse({
      generatedAt: new Date().toISOString(),
      accountCreatedAt: new Date().toISOString(),
      totalRecordCount: 0,
      activePhotoCount: 0,
      inventory: privacyDataCategories.slice(1).map((category) => ({
        category,
        recordCount: 0,
        includesHistory: false,
        lastUpdatedAt: null,
      })),
      consents: [],
      portableExport: {
        schemaVersion: 'myfitness-portable-export-v1',
        contentType: 'application/json',
        includesHistory: true,
        includesActiveSanitizedPhotos: true,
      },
      deletion: { confirmationPhrase: accountDeletionConfirmationPhrase, permanent: true },
    })
    expect(result.success).toBe(false)
  })
})
