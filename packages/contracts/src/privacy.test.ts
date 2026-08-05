import { describe, expect, it } from 'vitest'

import {
  accountDeletionConfirmationPhrase,
  accountDeletionIntentSchema,
  accountDeletionResultSchema,
  accountDeletionRequestSchema,
  consentRevocationRequestSchema,
  consentReceiptHistoryQuerySchema,
  consentReceiptHistorySchema,
  privacyDataCategories,
  privacyOverviewSchema,
  revocableConsentPurposeSchema,
} from './privacy'

describe('privacy contracts', () => {
  it('keeps optional revocation narrower than required service consent', () => {
    expect(revocableConsentPurposeSchema.parse('ai_plan_explanation')).toBe('ai_plan_explanation')
    expect(revocableConsentPurposeSchema.parse('food_photo_analysis')).toBe('food_photo_analysis')
    expect(revocableConsentPurposeSchema.parse('progress_photo_analysis')).toBe(
      'progress_photo_analysis',
    )
    expect(revocableConsentPurposeSchema.parse('progress_photo_retention')).toBe(
      'progress_photo_retention',
    )
    expect(revocableConsentPurposeSchema.safeParse('health_data').success).toBe(false)
    expect(consentRevocationRequestSchema.parse({ confirmed: true })).toEqual({ confirmed: true })
  })

  it('bounds strict consent-receipt history pages without implying current state', () => {
    expect(consentReceiptHistoryQuerySchema.parse({ limit: '2' })).toEqual({ limit: 2 })
    expect(consentReceiptHistoryQuerySchema.parse({})).toEqual({ limit: 10 })
    expect(consentReceiptHistoryQuerySchema.safeParse({ limit: 21 }).success).toBe(false)
    expect(
      consentReceiptHistorySchema.parse({
        items: [
          {
            receiptId: '619ef62a-e665-40dc-95ed-3790b947b48c',
            purpose: 'ai_plan_explanation',
            version: 'ai-plan-v1',
            acceptedAt: '2026-08-05T08:00:00.000Z',
            revokedAt: '2026-08-05T09:00:00.000Z',
          },
        ],
        nextCursor: null,
      }),
    ).not.toHaveProperty('status')
  })

  it('requires the exact permanent-account confirmation', () => {
    const intentId = '619ef62a-e665-40dc-95ed-3790b947b48c'
    expect(
      accountDeletionRequestSchema.parse({
        intentId,
        confirmationPhrase: accountDeletionConfirmationPhrase,
        exportChoice: 'skip',
        understandsPermanent: true,
      }),
    ).toMatchObject({ confirmationPhrase: accountDeletionConfirmationPhrase })
    expect(
      accountDeletionRequestSchema.safeParse({
        intentId,
        confirmationPhrase: '删除账户',
        exportChoice: 'skip',
        understandsPermanent: true,
      }).success,
    ).toBe(false)
  })

  it('uses one bounded secret for deletion intent and later receipt recovery', () => {
    expect(
      accountDeletionIntentSchema.parse({
        intentId: '619ef62a-e665-40dc-95ed-3790b947b48c',
        intentToken: 'x'.repeat(43),
        expiresAt: '2026-07-20T08:15:00.000Z',
      }),
    ).toMatchObject({ intentToken: 'x'.repeat(43) })
    expect(
      accountDeletionIntentSchema.safeParse({
        intentId: '619ef62a-e665-40dc-95ed-3790b947b48c',
        intentToken: 'too-short',
        expiresAt: '2026-07-20T08:15:00.000Z',
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
        schemaVersion: 'myfitness-portable-export-v4',
        contentType: 'application/json',
        includesHistory: true,
        includesActiveSanitizedPhotos: true,
      },
      deletion: { confirmationPhrase: accountDeletionConfirmationPhrase, permanent: true },
    })
    expect(result.success).toBe(false)
  })
})
