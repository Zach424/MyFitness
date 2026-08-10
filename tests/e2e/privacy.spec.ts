import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Pool } from 'pg'

import {
  accountDeletionConfirmationPhrase,
  aiPlanConsentVersion,
  consentVersions,
  foodPhotoConsentVersion,
} from '@myfitness/contracts'

import { apiUrl } from './runtime'
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

const seedAccount = async (
  page: Page,
  request: APIRequestContext,
  beforeOpen?: () => Promise<void>,
) => {
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
  await beforeOpen?.()
  await page.getByRole('button', { name: '我的', exact: true }).click()
  await expect(page.getByText('你提供什么，由你决定。')).toBeVisible()
  const privacySnapshot = beforeOpen
    ? undefined
    : page.waitForResponse(
        (response) => response.url().endsWith('/v1/me/privacy') && response.status() === 200,
      )
  await page.getByRole('button', { name: '打开数据保管台账' }).click()
  await privacySnapshot
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
    await database.query('DELETE FROM auth_identity_suppressions WHERE erasure_receipt_id = $1', [
      trackedReceiptId,
    ])
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
  await expect(page.locator('.inventory-row').filter({ hasText: '照片分析与进度照' })).toBeVisible()
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

test('privacy export validates local content and media type before download success', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors = collectBrowserErrors(page)
  await seedAccount(page, request)
  let downloads = 0
  page.on('download', () => {
    downloads += 1
  })

  await page.route(
    '**/v1/me/privacy/export',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ schemaVersion: 'myfitness-portable-export-v3' }),
      })
    },
    { times: 1 },
  )
  await page.getByRole('button', { name: '下载我的数据' }).click()
  await expect(page.getByText(/未通过当前版本与结构验证/)).toBeVisible()
  expect(downloads).toBe(0)
  await page.locator('.privacy-scroll').evaluate((element) => {
    element.scrollTop = 0
  })
  await page.screenshot({
    path: 'output/playwright/iteration-083-export-verification-mobile.png',
    fullPage: true,
  })
  await page.getByRole('button', { name: '关闭' }).click()

  await page.route(
    '**/v1/me/privacy/export',
    async (route) => {
      const response = await route.fetch()
      await route.fulfill({
        status: response.status(),
        headers: { ...response.headers(), 'content-type': 'text/plain' },
        body: await response.body(),
      })
    },
    { times: 1 },
  )
  await page.getByRole('button', { name: '下载我的数据' }).click()
  await expect(page.getByText(/不是受支持的 JSON 文件/)).toBeVisible()
  expect(downloads).toBe(0)
  await page.getByRole('button', { name: '关闭' }).click()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载我的数据' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^myfitness-export-\d{4}-\d{2}-\d{2}\.json$/)
  await expect(
    page.getByText(/已通过 myfitness-portable-export-v4 结构验证，已开始下载/),
  ).toBeVisible()
  expect(downloads).toBe(1)
  expect(browserErrors).toEqual([])
})

test('privacy export rejects late artifacts after unmount or custody-authority loss', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors = collectBrowserErrors(page)
  await seedAccount(page, request)
  let downloads = 0
  page.on('download', () => {
    downloads += 1
  })

  let releaseUnmountedExport = () => {}
  const unmountedExportGate = new Promise<void>((resolve) => {
    releaseUnmountedExport = resolve
  })
  let markUnmountedExportStarted = () => {}
  const unmountedExportStarted = new Promise<void>((resolve) => {
    markUnmountedExportStarted = resolve
  })
  let markUnmountedExportSettled = () => {}
  const unmountedExportSettled = new Promise<void>((resolve) => {
    markUnmountedExportSettled = resolve
  })
  await page.route(
    '**/v1/me/privacy/export',
    async (route) => {
      const response = await route.fetch()
      markUnmountedExportStarted()
      await unmountedExportGate
      await route.fulfill({ response })
      markUnmountedExportSettled()
    },
    { times: 1 },
  )

  await page.getByRole('button', { name: '下载我的数据' }).click()
  await unmountedExportStarted
  await page.getByRole('button', { name: '返回上一页' }).click()
  await expect(page.getByText('你提供什么，由你决定。')).toBeVisible()
  releaseUnmountedExport()
  await unmountedExportSettled
  await page.waitForTimeout(150)
  expect(downloads).toBe(0)

  await page.getByRole('button', { name: '打开数据保管台账' }).click()
  await expect(page.getByText('把数据带走，也能彻底离开。')).toBeVisible()
  const firstFreshDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载我的数据' }).click()
  await firstFreshDownload
  await expect(
    page.getByText(/已通过 myfitness-portable-export-v4 结构验证，已开始下载/),
  ).toBeVisible()
  expect(downloads).toBe(1)
  await page.locator('.privacy-feedback').getByRole('button', { name: '关闭' }).click()

  let releaseStaleAuthorityExport = () => {}
  const staleAuthorityExportGate = new Promise<void>((resolve) => {
    releaseStaleAuthorityExport = resolve
  })
  let markStaleAuthorityExportStarted = () => {}
  const staleAuthorityExportStarted = new Promise<void>((resolve) => {
    markStaleAuthorityExportStarted = resolve
  })
  let markStaleAuthorityExportSettled = () => {}
  const staleAuthorityExportSettled = new Promise<void>((resolve) => {
    markStaleAuthorityExportSettled = resolve
  })
  let staleAuthorityTransport: 'fulfilled' | 'cancelled' = 'fulfilled'
  await page.route(
    '**/v1/me/privacy/export',
    async (route) => {
      const response = await route.fetch()
      markStaleAuthorityExportStarted()
      await staleAuthorityExportGate
      try {
        await route.fulfill({ response })
      } catch (routeError) {
        if (!(routeError instanceof Error) || !routeError.message.includes('already handled')) {
          throw routeError
        }
        staleAuthorityTransport = 'cancelled'
      } finally {
        markStaleAuthorityExportSettled()
      }
    },
    { times: 1 },
  )

  await page.route(
    '**/v1/me/privacy/consents/ai_plan_explanation/revoke',
    (route) => route.abort('failed'),
    { times: 1 },
  )

  await page.getByRole('button', { name: '下载我的数据' }).click()
  await staleAuthorityExportStarted
  const aiConsent = page.locator('.consent-row').filter({ hasText: 'AI 计划解释' })
  await aiConsent.getByRole('button', { name: '撤回这项授权' }).click()
  await aiConsent.getByRole('button', { name: '确认撤回' }).click()
  await expect(page.getByText('REVOCATION UNKNOWN / 禁止重复撤回')).toBeVisible()
  await expect(page.getByRole('button', { name: '下载我的数据' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )

  releaseStaleAuthorityExport()
  await staleAuthorityExportSettled
  await page.waitForTimeout(150)
  expect(downloads).toBe(1)
  expect(staleAuthorityTransport).toBe('cancelled')
  await expect(page.locator('body')).not.toContainText('当前隐私清单已变化，本次导出未保存')
  await expect(page.locator('body')).not.toContainText('已开始下载（')

  await page.getByRole('button', { name: '核对撤回结果' }).click()
  await expect(aiConsent.getByText('有效', { exact: true })).toBeVisible()
  await expect(page.getByText(/仍然有效；系统没有自动重放撤回/)).toBeVisible()
  await expect(page.getByRole('button', { name: '下载我的数据' })).toHaveAttribute(
    'aria-disabled',
    'false',
  )
  const secondFreshDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载我的数据' }).click()
  await secondFreshDownload
  await expect(
    page.getByText(/已通过 myfitness-portable-export-v4 结构验证，已开始下载/),
  ).toBeVisible()
  expect(downloads).toBe(2)
  await page.locator('.privacy-scroll').evaluate((scroll) => {
    scroll.scrollTop = 0
  })
  await page.screenshot({
    path: 'output/playwright/iteration-088-export-lifecycle-mobile.png',
    fullPage: true,
  })
  expect(
    browserErrors.filter(
      (error) =>
        error !== 'Failed to load resource: net::ERR_FAILED' &&
        !(
          error.includes('Request failed: POST') &&
          error.includes('/v1/me/privacy/consents/ai_plan_explanation/revoke')
        ) &&
        !(error.includes('Request failed: GET') && error.includes('/v1/me/privacy/export')),
    ),
  ).toEqual([])
})

test('consent receipt history keeps empty, current and continuation evidence distinct', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors = collectBrowserErrors(page)
  const session = await seedAccount(page, request)
  await expect(page.locator('.custody-total__value')).toHaveText(/^\d+$/)

  await database.query('DELETE FROM nutrition_photo_candidates WHERE user_id = $1', [
    session.userId,
  ])
  await database.query('DELETE FROM consent_events WHERE user_id = $1', [session.userId])
  await page.reload()
  await page.getByRole('button', { name: '查看全部凭证' }).click()
  await expect(page.locator('.consent-history__empty')).toContainText(
    '服务端确认：当前没有授权凭证历史',
  )
  await expect(page.locator('.consent-history__item')).toHaveCount(0)

  await database.query(
    `INSERT INTO consent_events (id, user_id, purpose, version, accepted_at, revoked_at)
     SELECT gen_random_uuid(),
            $1,
            (ARRAY[
              'ai_plan_explanation',
              'food_photo_analysis',
              'progress_photo_analysis',
              'progress_photo_retention'
            ])[1 + ((series - 1) % 4)],
            'history-v' || LPAD(series::text, 2, '0'),
            NOW() - make_interval(mins => series),
            CASE WHEN series % 3 = 0
                 THEN NOW() - make_interval(mins => series) + INTERVAL '30 seconds'
                 ELSE NULL
            END
     FROM generate_series(1, 12) AS series`,
    [session.userId],
  )

  await page.reload()
  await page.getByRole('button', { name: '查看全部凭证' }).click()
  await expect(page.getByRole('button', { name: '收起历史' })).toHaveCSS(
    'color',
    'rgb(36, 76, 102)',
  )
  await expect(page.locator('.consent-history__item')).toHaveCount(10)
  await expect(page.getByText('REVOKED INTERVAL').first()).toBeVisible()
  await expect(page.getByText('ACCEPTED RECEIPT').first()).toBeVisible()
  await expect(page.getByText(/当前状态以上方授权行为准/).first()).toBeVisible()
  await page.getByRole('button', { name: '加载更早凭证' }).click()
  await expect(page.locator('.consent-history__item')).toHaveCount(12)
  await expect(page.getByRole('button', { name: '加载更早凭证' })).toHaveCount(0)
  await expect(page.getByText('12 份已核对历史凭证')).toBeVisible()
  await page.locator('.privacy-scroll').evaluate((scroll) => {
    const history = scroll.querySelector('.consent-history')
    if (!(history instanceof HTMLElement)) return
    scroll.scrollTop +=
      history.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 16
  })
  await page.screenshot({
    path: 'output/playwright/iteration-084-consent-receipt-history-mobile.png',
    fullPage: true,
  })
  await expect(page.locator('body')).not.toContainText(session.userId)
  expect(browserErrors).toEqual([])
})

test('consent receipt history retains authority across initial, refresh and continuation failure', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors = collectBrowserErrors(page)
  const session = await seedAccount(page, request)

  await database.query('DELETE FROM nutrition_photo_candidates WHERE user_id = $1', [
    session.userId,
  ])
  await database.query('DELETE FROM consent_events WHERE user_id = $1', [session.userId])
  await database.query(
    `INSERT INTO consent_events (id, user_id, purpose, version, accepted_at, revoked_at)
     SELECT gen_random_uuid(),
            $1,
            (ARRAY[
              'ai_plan_explanation',
              'food_photo_analysis',
              'progress_photo_analysis',
              'progress_photo_retention'
            ])[1 + ((series - 1) % 4)],
            'authority-v' || LPAD(series::text, 2, '0'),
            NOW() - make_interval(mins => series),
            CASE WHEN series % 4 = 0
                 THEN NOW() - make_interval(mins => series) + INTERVAL '30 seconds'
                 ELSE NULL
            END
     FROM generate_series(1, 12) AS series`,
    [session.userId],
  )
  const privacyReload = page.waitForResponse(
    (response) => response.url().endsWith('/v1/me/privacy') && response.status() === 200,
  )
  await page.reload()
  await privacyReload

  await page.route(
    '**/v1/me/privacy/consents/history?limit=10',
    (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'raw-backend-message-initial' }),
      }),
    { times: 1 },
  )
  await page.getByRole('button', { name: '查看全部凭证' }).click()
  await expect(page.getByText('授权凭证历史服务暂时不可用。')).toBeVisible()
  await expect(page.getByText(/不会显示为空历史/)).toBeVisible()
  await expect(page.locator('.consent-history__empty')).toHaveCount(0)
  await expect(page.locator('.consent-history__item')).toHaveCount(0)
  await expect(page.locator('#consent-history-retry')).toBeFocused()
  await expect(page.locator('body')).not.toContainText('raw-backend-message-initial')
  const revokeAction = page.getByRole('button', { name: '撤回这项授权' }).first()
  await expect(revokeAction).toHaveAttribute('aria-disabled', 'false')

  await page.locator('#consent-history-retry').click()
  await expect(page.locator('.consent-history__item')).toHaveCount(10)

  await page.route(
    '**/v1/me/privacy/consents/history?limit=10',
    (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'raw-backend-message-refresh' }),
      }),
    { times: 1 },
  )
  await page.getByRole('button', { name: '核对最新凭证' }).click()
  await expect(page.getByText('服务拒绝了本次授权凭证历史读取。')).toBeVisible()
  await expect(page.locator('.consent-history__item')).toHaveCount(10)
  await expect(page.getByText(/10 份凭证与续读位置仍保留/)).toBeVisible()
  await expect(page.locator('#consent-history-retry')).toBeFocused()
  await expect(revokeAction).toHaveAttribute('aria-disabled', 'false')
  await expect(page.locator('body')).not.toContainText('raw-backend-message-refresh')
  await page.locator('#consent-history-retry').click()
  await expect(page.getByRole('button', { name: '加载更早凭证' })).toBeVisible()

  const continuationUrls: string[] = []
  await page.route('**/v1/me/privacy/consents/history?limit=10&cursor=*', async (route) => {
    continuationUrls.push(route.request().url())
    if (continuationUrls.length === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'raw-backend-message-continuation' }),
      })
      return
    }
    await route.continue()
  })
  await page.getByRole('button', { name: '加载更早凭证' }).click()
  await expect(page.locator('.consent-history__item')).toHaveCount(10)
  await expect(page.getByText(/10 份凭证仍按原顺序保留/)).toBeVisible()
  await expect(page.getByText(/游标没有前进/)).toBeVisible()
  await expect(page.locator('#consent-history-retry')).toBeFocused()
  await expect(revokeAction).toHaveAttribute('aria-disabled', 'false')
  await expect(page.locator('body')).not.toContainText('raw-backend-message-continuation')
  await page.locator('.privacy-scroll').evaluate((scroll) => {
    const history = scroll.querySelector('.consent-history')
    if (!(history instanceof HTMLElement)) return
    scroll.scrollTop +=
      history.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 16
  })
  await page.screenshot({
    path: 'output/playwright/iteration-085-consent-history-read-authority-mobile.png',
    fullPage: true,
  })

  await page.locator('#consent-history-retry').click()
  await expect(page.locator('.consent-history__item')).toHaveCount(12)
  expect(continuationUrls).toHaveLength(2)
  expect(continuationUrls[1]).toBe(continuationUrls[0])
  await expect(page.getByText('12 份已核对历史凭证')).toBeVisible()
  const injectedHttpFailures = browserErrors.filter((message) =>
    /Failed to load resource: the server responded with a status of (403|503)/.test(message),
  )
  expect(injectedHttpFailures).toHaveLength(3)
  expect(browserErrors.filter((message) => !injectedHttpFailures.includes(message))).toEqual([])
})

test('consent history reflows at 320px with large text and completes the keyboard matrix', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 320, height: 844 })
  const browserErrors = collectBrowserErrors(page)
  const session = await seedAccount(page, request)

  await database.query('DELETE FROM nutrition_photo_candidates WHERE user_id = $1', [
    session.userId,
  ])
  await database.query('DELETE FROM consent_events WHERE user_id = $1', [session.userId])
  await database.query(
    `INSERT INTO consent_events (id, user_id, purpose, version, accepted_at, revoked_at)
     SELECT gen_random_uuid(),
            $1,
            (ARRAY[
              'ai_plan_explanation',
              'food_photo_analysis',
              'progress_photo_analysis',
              'progress_photo_retention'
            ])[1 + ((series - 1) % 4)],
            'accessibility-version-' || LPAD(series::text, 2, '0'),
            NOW() - make_interval(mins => series),
            CASE WHEN series % 4 = 0
                 THEN NOW() - make_interval(mins => series) + INTERVAL '30 seconds'
                 ELSE NULL
            END
     FROM generate_series(1, 12) AS series`,
    [session.userId],
  )
  await page.reload()
  await page.addStyleTag({
    content: `.consent-history {
      --consent-history-font-xs: 16px;
      --consent-history-font-sm: 18px;
      --consent-history-font-md: 20px;
      --consent-history-font-lg: 22px;
    }`,
  })

  const expectNoHorizontalOverflow = async () => {
    await expect
      .poll(() =>
        page.locator('.privacy-scroll').evaluate((element) => ({
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        })),
      )
      .toEqual({ clientWidth: 320, scrollWidth: 320 })
  }

  await page.route(
    '**/v1/me/privacy/consents/history?limit=10',
    (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'large-text-initial-raw-copy' }),
      }),
    { times: 1 },
  )
  const toggle = page.getByRole('button', { name: '查看全部凭证' })
  await toggle.focus()
  await page.keyboard.press(' ')
  await expect(page.getByText('授权凭证历史服务暂时不可用。')).toBeVisible()
  await expect(page.getByText(/不会显示为空历史/)).toBeVisible()
  await expect(page.locator('#consent-history-retry')).toBeFocused()
  await expectNoHorizontalOverflow()

  await page.keyboard.press('Enter')
  await expect(page.locator('.consent-history__item')).toHaveCount(10)
  await expect(page.getByRole('button', { name: '核对最新凭证' })).toBeVisible()
  await expect(page.getByRole('button', { name: '加载更早凭证' })).toBeVisible()
  await expectNoHorizontalOverflow()

  let refreshReads = 0
  await page.route('**/v1/me/privacy/consents/history?limit=10', async (route) => {
    refreshReads += 1
    await route.continue()
  })
  const refresh = page.getByRole('button', { name: '核对最新凭证' })
  await refresh.focus()
  await page.keyboard.press(' ')
  await expect.poll(() => refreshReads).toBe(1)
  await expect(refresh).toHaveAttribute('aria-disabled', 'false')

  const continuationUrls: string[] = []
  await page.route('**/v1/me/privacy/consents/history?limit=10&cursor=*', async (route) => {
    continuationUrls.push(route.request().url())
    if (continuationUrls.length === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'large-text-continuation-raw-copy' }),
      })
      return
    }
    await route.continue()
  })
  const continuation = page.getByRole('button', { name: '加载更早凭证' })
  await continuation.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.consent-history__item')).toHaveCount(10)
  await expect(page.getByText(/游标没有前进/)).toBeVisible()
  await expect(page.locator('#consent-history-retry')).toBeFocused()
  await expectNoHorizontalOverflow()
  await page.locator('.privacy-scroll').evaluate((scroll) => {
    const history = scroll.querySelector('.consent-history')
    if (!(history instanceof HTMLElement)) return
    scroll.scrollTop +=
      history.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 12
  })
  await page.screenshot({
    path: 'output/playwright/iteration-086-consent-history-large-text-mobile.png',
    fullPage: true,
  })

  await page.keyboard.press(' ')
  await expect(page.locator('.consent-history__item')).toHaveCount(12)
  expect(continuationUrls).toHaveLength(2)
  expect(continuationUrls[1]).toBe(continuationUrls[0])
  const collapse = page.getByRole('button', { name: '收起历史' })
  await collapse.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.consent-history__panel')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '查看全部凭证' })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
  await expect(page.getByRole('button', { name: '撤回这项授权' }).first()).toHaveAttribute(
    'aria-disabled',
    'false',
  )
  await expect(page.locator('body')).not.toContainText('large-text-initial-raw-copy')
  await expect(page.locator('body')).not.toContainText('large-text-continuation-raw-copy')

  const injectedHttpFailures = browserErrors.filter((message) =>
    /Failed to load resource: the server responded with a status of 503/.test(message),
  )
  expect(injectedHttpFailures).toHaveLength(2)
  expect(browserErrors.filter((message) => !injectedHttpFailures.includes(message))).toEqual([])
})

test('consent history invalidates late responses across collapse and explicit reopen', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors = collectBrowserErrors(page)
  const session = await seedAccount(page, request)

  await database.query('DELETE FROM nutrition_photo_candidates WHERE user_id = $1', [
    session.userId,
  ])
  await database.query('DELETE FROM consent_events WHERE user_id = $1', [session.userId])
  await database.query(
    `INSERT INTO consent_events (id, user_id, purpose, version, accepted_at)
     SELECT gen_random_uuid(),
            $1,
            (ARRAY[
              'ai_plan_explanation',
              'food_photo_analysis',
              'progress_photo_analysis',
              'progress_photo_retention'
            ])[1 + ((series - 1) % 4)],
            'lifecycle-v' || LPAD(series::text, 2, '0'),
            NOW() - make_interval(mins => series)
     FROM generate_series(1, 12) AS series`,
    [session.userId],
  )
  await page.reload()

  let releaseLateInitial = () => {}
  const lateInitialGate = new Promise<void>((resolve) => {
    releaseLateInitial = resolve
  })
  let markInitialStarted = () => {}
  const initialStarted = new Promise<void>((resolve) => {
    markInitialStarted = resolve
  })
  let markLateInitialSettled = () => {}
  const lateInitialSettled = new Promise<void>((resolve) => {
    markLateInitialSettled = resolve
  })
  const initialUrls: string[] = []
  await page.route('**/v1/me/privacy/consents/history?limit=10', async (route) => {
    initialUrls.push(route.request().url())
    if (initialUrls.length === 1) {
      markInitialStarted()
      await lateInitialGate
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], nextCursor: null }),
      })
      markLateInitialSettled()
      return
    }
    await route.continue()
  })

  await page.getByRole('button', { name: '查看全部凭证' }).click()
  await initialStarted
  await page.getByRole('button', { name: '收起历史' }).click()
  await expect(page.locator('.consent-history__panel')).toHaveCount(0)
  await page.getByRole('button', { name: '查看全部凭证' }).click()
  await expect.poll(() => initialUrls.length).toBe(2)
  await expect(page.locator('.consent-history__item')).toHaveCount(10)
  releaseLateInitial()
  await lateInitialSettled
  await page.waitForTimeout(100)
  await expect(page.locator('.consent-history__item')).toHaveCount(10)
  await expect(page.locator('.consent-history__empty')).toHaveCount(0)

  let releaseLateContinuation = () => {}
  const lateContinuationGate = new Promise<void>((resolve) => {
    releaseLateContinuation = resolve
  })
  let markContinuationStarted = () => {}
  const continuationStarted = new Promise<void>((resolve) => {
    markContinuationStarted = resolve
  })
  let markLateContinuationSettled = () => {}
  const lateContinuationSettled = new Promise<void>((resolve) => {
    markLateContinuationSettled = resolve
  })
  const continuationUrls: string[] = []
  await page.route('**/v1/me/privacy/consents/history?limit=10&cursor=*', async (route) => {
    continuationUrls.push(route.request().url())
    if (continuationUrls.length === 1) {
      markContinuationStarted()
      await lateContinuationGate
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'late-hidden-continuation-copy' }),
      })
      markLateContinuationSettled()
      return
    }
    await route.continue()
  })

  await page.getByRole('button', { name: '加载更早凭证' }).click()
  await continuationStarted
  await page.getByRole('button', { name: '收起历史' }).click()
  await expect(page.locator('.consent-history__panel')).toHaveCount(0)
  await page.getByRole('button', { name: '查看全部凭证' }).click()
  await expect.poll(() => continuationUrls.length).toBe(2)
  await expect(page.locator('.consent-history__item')).toHaveCount(12)
  const collapse = page.getByRole('button', { name: '收起历史' })
  await collapse.focus()
  releaseLateContinuation()
  await lateContinuationSettled
  await page.waitForTimeout(120)
  await expect(page.locator('.consent-history__item')).toHaveCount(12)
  await expect(page.locator('.consent-history__failure')).toHaveCount(0)
  await expect(page.locator('#consent-history-retry')).toHaveCount(0)
  await expect(collapse).toBeFocused()
  expect(continuationUrls[1]).toBe(continuationUrls[0])
  await expect(page.locator('body')).not.toContainText('late-hidden-continuation-copy')
  await page.locator('.privacy-scroll').evaluate((scroll) => {
    const history = scroll.querySelector('.consent-history')
    if (!(history instanceof HTMLElement)) return
    scroll.scrollTop +=
      history.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 16
  })
  await page.screenshot({
    path: 'output/playwright/iteration-087-consent-history-interruption-mobile.png',
    fullPage: true,
  })

  const injectedHttpFailures = browserErrors.filter((message) =>
    /Failed to load resource: the server responded with a status of 503/.test(message),
  )
  expect(injectedHttpFailures).toHaveLength(1)
  expect(browserErrors.filter((message) => !injectedHttpFailures.includes(message))).toEqual([])
})

test('logout removes every local editor draft before starting a new session', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors = collectBrowserErrors(page)
  await seedAccount(page, request)
  await page.evaluate(() => {
    localStorage.setItem('myfitness.local-draft.workout', 'sensitive-workout')
    localStorage.setItem('myfitness.local-draft.meal', 'sensitive-meal')
    localStorage.setItem('myfitness.local-draft.health-record', 'sensitive-health')
  })

  const nextSession = page.waitForResponse(
    (response) => response.url().endsWith('/v1/auth/dev/session') && response.status() === 200,
  )
  await page.getByRole('button', { name: '退出登录并清除草稿' }).click()
  const nextSessionBody = (await (await nextSession).json()) as { userId: string }
  expect(
    await page.evaluate(() =>
      ['workout', 'meal', 'health-record'].map((kind) =>
        localStorage.getItem(`myfitness.local-draft.${kind}`),
      ),
    ),
  ).toEqual([null, null, null])
  await database.query('DELETE FROM users WHERE id = $1', [nextSessionBody.userId])
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
  await page.evaluate(() => {
    localStorage.setItem('myfitness.local-draft.workout', 'sensitive-workout')
    localStorage.setItem('myfitness.local-draft.meal', 'sensitive-meal')
    localStorage.setItem('myfitness.local-draft.health-record', 'sensitive-health')
  })
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
  expect(
    await page.evaluate(() =>
      ['workout', 'meal', 'health-record'].map((kind) =>
        localStorage.getItem(`myfitness.local-draft.${kind}`),
      ),
    ),
  ).toEqual([null, null, null])
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

test('privacy revocation reconciles committed and uncommitted response loss without replay', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors = collectBrowserErrors(page)
  await seedAccount(page, request)
  let revokeRequests = 0
  let overviewReads = 0
  page.on('request', (outgoing) => {
    if (outgoing.method() === 'POST' && outgoing.url().includes('/v1/me/privacy/consents/')) {
      revokeRequests += 1
    }
    if (outgoing.method() === 'GET' && outgoing.url().endsWith('/v1/me/privacy')) {
      overviewReads += 1
    }
  })

  const foodConsent = page.locator('.consent-row').filter({ hasText: '餐食照片分析' })
  await page.route(
    '**/v1/me/privacy/consents/food_photo_analysis/revoke',
    async (route) => {
      const committed = await route.fetch()
      expect(committed.status()).toBe(200)
      await route.abort('failed')
    },
    { times: 1 },
  )
  await foodConsent.getByRole('button', { name: '撤回这项授权' }).click()
  await foodConsent.getByRole('button', { name: '确认撤回' }).click()

  await expect(page.getByText('REVOCATION UNKNOWN / 禁止重复撤回')).toBeVisible()
  await expect(page.getByText(/清理条数未知/)).toBeVisible()
  await expect(page.getByRole('button', { name: '下载我的数据' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await page.locator('.privacy-scroll').evaluate((element) => {
    element.scrollTop = 0
  })
  await page.screenshot({
    path: 'output/playwright/iteration-082-privacy-revocation-recovery-mobile.png',
    fullPage: true,
  })
  const committedRecheck = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/me/privacy') &&
      response.request().method() === 'GET' &&
      response.status() === 200,
  )
  await page.getByRole('button', { name: '核对撤回结果' }).click()
  await committedRecheck
  await expect(foodConsent.getByText('已撤回', { exact: true })).toBeVisible()
  await expect(page.getByText(/原始响应已丢失，因此不显示本次敏感数据清理条数/)).toBeVisible()
  expect(revokeRequests).toBe(1)
  expect(overviewReads).toBe(1)

  const aiConsent = page.locator('.consent-row').filter({ hasText: 'AI 计划解释' })
  await page.route(
    '**/v1/me/privacy/consents/ai_plan_explanation/revoke',
    async (route) => {
      await route.abort('failed')
    },
    { times: 1 },
  )
  await aiConsent.getByRole('button', { name: '撤回这项授权' }).click()
  await aiConsent.getByRole('button', { name: '确认撤回' }).click()
  await page.getByRole('button', { name: '核对撤回结果' }).click()

  await expect(aiConsent.getByText('有效', { exact: true })).toBeVisible()
  await expect(page.getByText(/仍然有效；系统没有自动重放撤回/)).toBeVisible()
  await expect(aiConsent.getByRole('button', { name: '撤回这项授权' })).toBeEnabled()
  expect(revokeRequests).toBe(2)
  expect(overviewReads).toBe(2)

  await aiConsent.getByRole('button', { name: '撤回这项授权' }).click()
  await aiConsent.getByRole('button', { name: '确认撤回' }).click()
  await expect(aiConsent.getByText('已撤回', { exact: true })).toBeVisible()
  expect(revokeRequests).toBe(3)
  expect(overviewReads).toBe(3)
  expect(
    browserErrors.filter(
      (error) =>
        error !== 'Failed to load resource: net::ERR_FAILED' &&
        !(
          error.includes('Request failed: POST') &&
          error.includes('/v1/me/privacy/consents/') &&
          error.includes('/revoke')
        ),
    ),
  ).toEqual([])
})

test('privacy page recovers a committed deletion receipt after the response and page state are lost', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const session = await seedAccount(page, request)
  let committedReceiptId: string | undefined

  await page.route(
    '**/v1/me/privacy/account',
    async (route) => {
      const response = await route.fetch()
      const receipt = (await response.json()) as { receiptId: string }
      committedReceiptId = receipt.receiptId
      await route.abort('failed')
    },
    { times: 1 },
  )

  await page.getByRole('button', { name: '不导出' }).click()
  await page.getByRole('checkbox', { name: /我知道删除无法撤销/ }).click()
  await page
    .locator(`input[placeholder="${accountDeletionConfirmationPhrase}"]`)
    .fill(accountDeletionConfirmationPhrase)
  const recoveredResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/privacy/erasure-receipts/recover') &&
      response.request().method() === 'POST' &&
      response.status() === 200,
  )
  await page.getByRole('button', { name: '永久删除账户' }).click()
  await recoveredResponse

  await expect(page.getByText('账户数据已删除')).toBeVisible()
  await expect(page.getByText(/页面重启后仍可恢复回执/)).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-022-erasure-recovery-mobile.png',
    fullPage: true,
  })
  expect(committedReceiptId).toMatch(/^[0-9a-f-]{36}$/)
  trackedReceiptId = committedReceiptId

  await page.reload()
  await expect(page.getByText('账户数据已删除')).toBeVisible()
  await expect(page.getByText(new RegExp(committedReceiptId!))).toBeVisible()
  await expect
    .poll(async () => {
      const account = await database.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM users WHERE id = $1',
        [session.userId],
      )
      return account.rows[0]?.count
    })
    .toBe('0')
  trackedSubject = undefined
})

test('initial offline privacy read retries receipt recovery before showing a mobile inventory', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors = collectBrowserErrors(page)
  await seedAccount(page, request, async () => {
    await page.route(
      '**/v1/me/privacy',
      async (route) => {
        expect(route.request().method()).toBe('GET')
        await route.abort('internetdisconnected')
      },
      { times: 1 },
    )
  })

  await expect(page.getByText('OFFLINE / 连接未完成')).toBeVisible()
  await expect(page.getByText('还没有核对销户回执与数据清单')).toBeVisible()
  await expect(page.getByText('我的数据清单')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '下载我的数据' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '永久删除账户' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '重新核对销户回执与数据清单' })).toBeFocused()
  await expect
    .poll(() =>
      page.locator('.privacy-page').evaluate((element) => element.getBoundingClientRect().left),
    )
    .toBe(0)
  await page.screenshot({
    path: 'output/playwright/iteration-064-privacy-initial-offline-mobile.png',
  })

  await page.keyboard.press('Enter')
  await expect(page.getByText('我的数据清单')).toBeVisible()
  await expect(page.getByRole('button', { name: '下载我的数据' })).toBeEnabled()
  expect(
    browserErrors.filter(
      (error) =>
        !error.includes('net::ERR_INTERNET_DISCONNECTED') &&
        !(error.includes('Request failed: GET') && error.includes('/v1/me/privacy')),
    ),
  ).toEqual([])
})

test('failed post-revocation refresh retains a wide privacy ledger but freezes custody actions', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const browserErrors = collectBrowserErrors(page)
  await seedAccount(page, request)
  const retainedTotal = await page.locator('.custody-total__value').textContent()
  expect(retainedTotal).toMatch(/^\d+$/)
  const photoConsent = page.locator('.consent-row').filter({ hasText: '餐食照片分析' })

  await page.route(
    '**/v1/me/privacy',
    async (route) => {
      expect(route.request().method()).toBe('GET')
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'rate_limited', message: 'retry later' } }),
      })
    },
    { times: 1 },
  )
  await photoConsent.getByRole('button', { name: '撤回这项授权' }).click()
  await photoConsent.getByRole('button', { name: '确认撤回' }).click()

  await expect(page.getByText('READ REFUSED / 读取被拒绝')).toBeVisible()
  await expect(
    page.getByText(new RegExp(`RETAINED INVENTORY · ${retainedTotal} ITEMS`)),
  ).toBeVisible()
  await expect(photoConsent.getByText('有效', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '下载我的数据' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await expect(photoConsent.getByRole('button', { name: '撤回这项授权' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await expect(page.getByRole('button', { name: '不导出' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await expect(page.getByRole('checkbox', { name: /我知道删除无法撤销/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await expect(
    page.locator(`input[placeholder="${accountDeletionConfirmationPhrase}"]`),
  ).toBeDisabled()
  const retry = page.getByRole('button', { name: '重新核对销户回执与数据清单' })
  await expect(retry).toBeFocused()
  await page.screenshot({ path: 'output/playwright/iteration-064-privacy-stale-wide.png' })

  await page.keyboard.press('Enter')
  await expect(page.getByText('READ REFUSED / 读取被拒绝')).toHaveCount(0)
  await expect(photoConsent.getByText('已撤回', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '下载我的数据' })).toBeEnabled()
  expect(
    browserErrors.filter(
      (error) => !(error.includes('Failed to load resource:') && error.includes('429')),
    ),
  ).toEqual([])
})
