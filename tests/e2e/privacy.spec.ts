import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Pool } from 'pg'

import {
  accountDeletionConfirmationPhrase,
  aiPlanConsentVersion,
  consentVersions,
  foodPhotoConsentVersion,
} from '@myfitness/contracts'

const apiUrl = 'http://127.0.0.1:3100/v1'
const database = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgresql://myfitness:myfitness_local@127.0.0.1:54329/myfitness',
})
const objectStorage = new S3Client({
  region: process.env.OBJECT_STORAGE_REGION ?? 'us-east-1',
  endpoint: process.env.OBJECT_STORAGE_ENDPOINT ?? 'http://127.0.0.1:9000',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID ?? 'myfitness-minio',
    secretAccessKey:
      process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY ?? 'myfitness-minio-secret-2026-local',
  },
})
let trackedSubject: string | undefined
let trackedReceiptId: string | undefined
let testStartedAt: Date

const onboarding = {
  adultConfirmed: true,
  profile: {
    displayName: '隐私验收用户',
    ageBand: '25_34',
    sexForCalculations: 'unspecified',
    height: { value: 172, unit: 'cm' },
    unitSystem: 'metric',
    timezone: 'Asia/Shanghai',
  },
  goal: {
    primaryGoal: 'fitness',
    experience: 'beginner',
    availableDays: ['mon', 'wed', 'sat'],
    sessionMinutes: 45,
    equipment: ['bodyweight'],
    dietaryPreferences: ['none'],
  },
  risk: { flags: [], acknowledged: true },
  consents: {
    terms: { accepted: true, version: consentVersions.terms },
    privacy: { accepted: true, version: consentVersions.privacy },
    healthData: { accepted: true, version: consentVersions.healthData },
  },
}

const seedAccount = async (page: Page, request: APIRequestContext) => {
  const sessionResponse = page.waitForResponse(
    (response) => response.url().endsWith('/v1/auth/dev/session') && response.status() === 200,
  )
  await page.goto('/')
  const session = (await (await sessionResponse).json()) as {
    accessToken: string
    userId: string
  }
  const identity = await database.query<{ provider_subject: string }>(
    "SELECT provider_subject FROM auth_identities WHERE user_id = $1 AND provider = 'dev'",
    [session.userId],
  )
  trackedSubject = identity.rows[0]?.provider_subject
  const headers = { Authorization: `Bearer ${session.accessToken}` }

  expect(
    (
      await request.put(`${apiUrl}/me/onboarding`, {
        headers,
        data: onboarding,
      })
    ).ok(),
  ).toBe(true)
  expect(
    (
      await request.post(`${apiUrl}/health-records`, {
        headers: { ...headers, 'x-idempotency-key': `privacy-e2e-record-${Date.now()}` },
        data: {
          metric: 'body.weight',
          value: 70,
          unit: 'kg',
          source: { kind: 'manual' },
          status: 'confirmed',
          occurredAt: '2026-07-19T06:00:00+08:00',
          timezone: 'Asia/Shanghai',
        },
      })
    ).ok(),
  ).toBe(true)
  expect(
    (
      await request.post(`${apiUrl}/nutrition/photo-candidates`, {
        headers: { ...headers, 'x-idempotency-key': `privacy-e2e-photo-${Date.now()}` },
        data: { consent: { granted: true, version: foodPhotoConsentVersion } },
      })
    ).ok(),
  ).toBe(true)
  await database.query(
    `INSERT INTO consent_events (id, user_id, purpose, version)
     VALUES (gen_random_uuid(), $1, 'ai_plan_explanation', $2)`,
    [session.userId, aiPlanConsentVersion],
  )
  await page.reload()
  await page.getByRole('button', { name: '我的', exact: true }).click()
  await expect(page.getByText('把数据带走，也能彻底离开。')).toBeVisible()
  return session
}

const collectBrowserErrors = (page: Page) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('requestfailed', (request) => {
    browserErrors.push(`Request failed: ${request.method()} ${request.url()}`)
  })
  return browserErrors
}

test.beforeEach(async () => {
  const result = await database.query<{ started_at: Date }>(
    'SELECT clock_timestamp() AS started_at',
  )
  testStartedAt = result.rows[0]!.started_at
})

test.afterEach(async () => {
  if (trackedSubject) {
    await database.query(
      `DELETE FROM users WHERE id IN (
         SELECT user_id FROM auth_identities WHERE provider = 'dev' AND provider_subject = $1
       )`,
      [trackedSubject],
    )
  }
  await database.query('DELETE FROM data_operation_jobs WHERE created_at >= $1', [testStartedAt])
  if (trackedReceiptId) {
    await database.query('DELETE FROM privacy_erasure_receipts WHERE receipt_id = $1', [
      trackedReceiptId,
    ])
    await objectStorage.send(
      new DeleteObjectCommand({
        Bucket: process.env.OBJECT_STORAGE_BUCKET ?? 'myfitness-private',
        Key: `${process.env.ERASURE_LEDGER_PREFIX ?? 'control/erasure-ledger'}/${trackedReceiptId}.json`,
      }),
    )
  }
  trackedSubject = undefined
  trackedReceiptId = undefined
})

test.afterAll(async () => {
  objectStorage.destroy()
  await database.end()
})

test('mobile privacy ledger inventories and downloads an owned-data export', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors = collectBrowserErrors(page)
  await seedAccount(page, request)

  await expect(page.getByText('身体与恢复记录')).toBeVisible()
  await expect(page.getByText('AI 计划解释')).toBeVisible()
  await expect(page.locator('.inventory-row').filter({ hasText: '餐食照片分析' })).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-011-privacy-mobile.png',
    fullPage: true,
  })

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载我的数据' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^myfitness-export-\d{4}-\d{2}-\d{2}\.json$/)
  expect(await download.path()).toBeTruthy()
  await expect(page.getByText(/已开始下载/)).toBeVisible()
  expect(browserErrors).toEqual([])
})

test('wide privacy controls revoke optional processing and permanently erase the account', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const browserErrors = collectBrowserErrors(page)
  const session = await seedAccount(page, request)

  await page.screenshot({
    path: 'output/playwright/iteration-011-privacy-wide.png',
    fullPage: true,
  })
  const photoConsent = page.locator('.consent-row').filter({ hasText: '餐食照片分析' })
  await photoConsent.getByRole('button', { name: '撤回这项授权' }).click()
  await photoConsent.getByRole('button', { name: '确认撤回' }).click()
  await expect(photoConsent.getByText('已撤回', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: '不导出' }).click()
  await page.getByRole('checkbox', { name: /我知道删除无法撤销/ }).click()
  await page
    .locator(`input[placeholder="${accountDeletionConfirmationPhrase}"]`)
    .fill(accountDeletionConfirmationPhrase)
  const deletionResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/me/privacy/account') &&
      response.request().method() === 'DELETE' &&
      response.status() === 202,
  )
  await page.getByRole('button', { name: '永久删除账户' }).click()
  const deletionReceipt = (await (await deletionResponse).json()) as {
    receiptId: string
    statusToken: string
  }
  trackedReceiptId = deletionReceipt.receiptId

  await expect(page.getByText('账户数据已删除')).toBeVisible()
  await expect(page.getByText(/旧会话已失效/)).toBeVisible()
  await expect
    .poll(async () => {
      const account = await database.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM users WHERE id = $1',
        [session.userId],
      )
      return account.rows[0]?.count
    })
    .toBe('0')
  expect(browserErrors).toEqual([])
  trackedSubject = undefined
})
