import { expect, test, type Page } from '@playwright/test'
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { Pool } from 'pg'

import { apiUrl } from './runtime'
import { expectPoliteStatus, expectReducedMotion, expectVisibleFocus } from './accessibility'

const subjectStorageKey = 'myfitness.dev.subject'
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
let testStartedAt: Date

test.beforeEach(async ({ page }) => {
  trackedSubject = undefined
  const result = await database.query<{ started_at: Date }>(
    'SELECT clock_timestamp() AS started_at',
  )
  testStartedAt = result.rows[0]!.started_at
  page.on('request', (request) => {
    if (!request.url().endsWith('/v1/auth/dev/session') || request.method() !== 'POST') return
    try {
      const body = request.postDataJSON() as { subject?: unknown }
      if (typeof body.subject === 'string') trackedSubject = body.subject
    } catch {
      // The storage fallback below still covers a request body that cannot be parsed.
    }
  })
})

test.afterEach(async ({ page }) => {
  const subject =
    trackedSubject ??
    (await page
      .evaluate((key) => {
        const raw = localStorage.getItem(key)
        if (!raw) return null
        try {
          const stored = JSON.parse(raw) as { data?: unknown }
          return typeof stored.data === 'string' ? stored.data : null
        } catch {
          return raw
        }
      }, subjectStorageKey)
      .catch(() => null))
  let userId: string | undefined
  if (subject) {
    const identity = await database.query<{ user_id: string }>(
      `SELECT user_id FROM auth_identities
       WHERE provider = 'dev' AND provider_subject = $1`,
      [subject],
    )
    userId = identity.rows[0]?.user_id
    if (userId) await database.query('DELETE FROM users WHERE id = $1', [userId])
  }
  await database.query('DELETE FROM data_operation_jobs WHERE created_at >= $1', [testStartedAt])
  if (userId) {
    const listed = await objectStorage.send(
      new ListObjectsV2Command({
        Bucket: process.env.OBJECT_STORAGE_BUCKET ?? 'myfitness-private',
        Prefix: `${process.env.PHOTO_OBJECT_PREFIX ?? 'private-photos'}/${userId}/`,
      }),
    )
    const keys = (listed.Contents ?? []).flatMap((object) => (object.Key ? [object.Key] : []))
    if (keys.length) {
      await objectStorage.send(
        new DeleteObjectsCommand({
          Bucket: process.env.OBJECT_STORAGE_BUCKET ?? 'myfitness-private',
          Delete: { Quiet: true, Objects: keys.map((Key) => ({ Key })) },
        }),
      )
    }
  }
})

test.afterAll(async () => {
  objectStorage.destroy()
  await database.end()
})

const openNutrition = async (page: Page) => {
  await page.goto('/')
  await page.getByRole('button', { name: '饮食', exact: true }).click()
  await expect(page.getByText('把一餐拆清楚，不必把数字吃成压力。')).toBeVisible()
}

const collectBrowserErrors = (page: Page) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  return browserErrors
}

const demoMealPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAUAAAADwCAIAAAD+Tyo8AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAGP0lEQVR4nO3VUQ0DARAC0fMv4fRUxMiph/6QZl+CgM0Ay9PnJQQQ6D+L8MwvIAQQSIGFAIHu7YEF3ntACKTAQoBA976hBd57QAikwEKAQPe+oQXee0AIpMBCgED3vqEF3ntACKTAQoBA976hBd57QAikwEKAQPe+oQXee0AIpMBCgED3vqEF3ntACKTAQoBA976hBd57QAikwEKAQPe+oQXee0AIpMBCgED3vqEF3ntACKTAQoBA976hBd57QAikwEKAQPe+oQXee0AIpMBCgED3vqEF3ntACKTAQoBA976hBd57QAikwEKAQPe+oQXee0AIpMBCgED3vqEF3ntACKTAQoBA976hBd57QAikwEKAQPe+oQXee0AIpMBCgED3vqEF3ntACKTAQoBA976hBd57QAikwEKAQPe+oQXee0AIpMBCgED3vqEF3ntACKTAQoBA976hBd57QAikwEKAQPe+oQXee0AIpMBCgED3vqEF3ntACKTAQoBA976hBd57QAikwEKAQPe+oQXee0AIpMBCgED3vqEF3ntACKTAQoBA976hBd57QAikwEKAQPe+oQXee0AIKLAQIPAefAQWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASHQrzH4AgeTbtrUvzNbAAAAAElFTkSuQmCC',
  'base64',
)

const validDemoMealPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFUlEQVQYlWO4cWQWHsQwKn0ES7AAAP7B3Rk90PKpAAAAAElFTkSuQmCC',
  'base64',
)

const uploadDemoMealPhoto = async (page: Page) => {
  await page.getByRole('button', { name: /我同意本次上传与上述处理/ }).focus()
  await page.keyboard.press(' ')
  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '选择一张餐食照片' }).focus()
  await page.keyboard.press('Enter')
  const fileChooser = await fileChooserPromise
  const uploadResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/v1/nutrition/photo-candidates/') &&
      response.url().includes('/upload?token=') &&
      response.request().method() === 'POST',
  )
  await fileChooser.setFiles({ name: 'meal.png', mimeType: 'image/png', buffer: validDemoMealPng })
  expect((await uploadResponse).status()).toBe(201)
  await expect(page.getByText('本地演示夹具 · 非真实识别')).toBeVisible()
}

const openFoodPhotoWorkflow = async (page: Page) => {
  const launcher = page.getByRole('button', { name: '打开照片校样台' })
  await launcher.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('餐食照片校样台')).toBeVisible()
  await expect(page.getByText('先校样，再带回餐食。')).toBeVisible()
  await expectVisibleFocus(page.getByRole('button', { name: '返回餐食草稿' }))
}

test('meal completes favorite, create, repeat, update, history and delete lifecycle', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors = collectBrowserErrors(page)

  await openNutrition(page)
  await expect(page.getByText('还没有饮食记录')).toBeVisible()
  await page.getByRole('button', { name: '添加熟鸡胸肉' }).click()
  await page.getByRole('button', { name: '添加熟米饭' }).click()
  await page.locator('[aria-label="进餐时间使用的 IANA 时区"] input').fill('Asia/Shanghai')
  await page.locator('[aria-label="进餐时间，年-月-日 时:分"] input').fill('2026-07-18 12:30')
  await expect(page.getByLabel('本餐营养汇总预览').getByText('393')).toBeVisible()
  await expect(page.getByLabel('本餐营养汇总预览').getByText('41.3')).toBeVisible()

  const favoritePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/nutrition/favorites/rice_cooked') &&
      response.request().method() === 'PUT',
  )
  await page.getByRole('button', { name: '收藏熟米饭' }).click()
  expect((await favoritePromise).status()).toBe(200)
  await expect(page.getByRole('button', { name: '取消收藏熟米饭' })).toBeVisible()

  const firstCreatePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/nutrition/meals') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '保存餐次', exact: true }).click()
  const firstCreate = await firstCreatePromise
  expect(firstCreate.status()).toBe(201)
  expect(firstCreate.request().postDataJSON()).toMatchObject({
    occurredAt: '2026-07-18T04:30:00.000Z',
    timezone: 'Asia/Shanghai',
  })
  await expect(page.locator('.meal-entry')).toHaveCount(1)
  await expect(page.locator('.meal-entry').first().getByText('393')).toBeVisible()

  await page.locator('.meal-entry').first().getByRole('button', { name: '再记一次' }).click()
  await expect(page.getByLabel('本餐营养汇总预览').getByText('393')).toBeVisible()
  const repeatedCreatePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/nutrition/meals') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '保存餐次', exact: true }).click()
  expect((await repeatedCreatePromise).status()).toBe(201)
  await expect(page.locator('.meal-entry')).toHaveCount(2)

  await page.locator('.meal-entry').first().getByRole('button', { name: '修改' }).click()
  await page.locator('[aria-label="熟米饭份量"] input').fill('200')
  await expect(page.getByLabel('本餐营养汇总预览').getByText('458')).toBeVisible()
  const updatePromise = page.waitForResponse(
    (response) =>
      /\/v1\/nutrition\/meals\/[0-9a-f-]{36}$/.test(response.url()) &&
      response.request().method() === 'PUT',
  )
  await page.getByRole('button', { name: '保存餐次新版本' }).click()
  expect((await updatePromise).status()).toBe(200)
  await expect(page.locator('.meal-entry').first().getByText('458')).toBeVisible()
  await expect(page.locator('.meal-entry').first().getByText('v2')).toBeVisible()

  const historyPromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith('/history') &&
      response.request().method() === 'GET',
  )
  await page.locator('.meal-entry').first().getByRole('button', { name: '历史' }).click()
  expect((await historyPromise).status()).toBe(200)
  await expect(page.getByRole('dialog', { name: '餐次历史' }).getByText('修改餐次')).toBeVisible()
  await expect(page.getByRole('dialog', { name: '餐次历史' }).getByText('创建餐次')).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-006-nutrition-mobile.png',
    fullPage: true,
  })
  await page.getByRole('button', { name: '关闭餐次历史' }).first().click()

  await page.locator('.meal-entry').first().getByRole('button', { name: '删除' }).click()
  await expect(page.getByRole('dialog', { name: '确认删除餐次' })).toBeVisible()
  const deletePromise = page.waitForResponse(
    (response) =>
      /\/v1\/nutrition\/meals\/[0-9a-f-]{36}$/.test(response.url()) &&
      response.request().method() === 'DELETE',
  )
  await page.getByRole('button', { name: '确认删除' }).click()
  expect((await deletePromise).status()).toBe(204)
  await expect(page.locator('.meal-entry')).toHaveCount(1)
  await expect(page.getByText('餐次已从日常记录移除，版本历史仍保留。')).toBeVisible()
  expect(browserErrors).toEqual([])
})

test('ambiguous meal response retains the draft and retries one aggregate', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openNutrition(page)

  const title = page.locator('.nutrition-title-input input')
  await title.fill('响应丢失午餐')
  await page.getByRole('button', { name: '添加熟鸡胸肉' }).click()
  await page.locator('[aria-label="进餐时间，年-月-日 时:分"] input').fill('2026-07-18 12:30')

  const idempotencyKeys: string[] = []
  let createAttempts = 0
  await page.route('**/v1/nutrition/meals', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    createAttempts += 1
    idempotencyKeys.push(route.request().headers()['x-idempotency-key'] ?? '')
    if (createAttempts === 1) {
      const committedResponse = await route.fetch()
      expect(committedResponse.status()).toBe(201)
      await route.abort('failed')
      return
    }
    await route.continue()
  })

  await page.getByRole('button', { name: '保存餐次', exact: true }).click()
  const uncertainStatus = page.getByRole('status')
  await expect(uncertainStatus.getByText('CONNECTION UNCERTAIN / 输入仍保留')).toBeVisible()
  await expect(uncertainStatus).toContainText('无法确认这次餐次是否已经到达服务端')
  await expect(title).toHaveValue('响应丢失午餐')
  await expect(page.locator('.meal-item').getByText('熟鸡胸肉')).toBeVisible()
  const retryButton = page.getByRole('button', { name: '重试保存（防重复）' })
  await expect(retryButton).toBeEnabled()
  await expect(retryButton).toHaveCSS('opacity', '1')

  await page.screenshot({
    path: 'output/playwright/iteration-054-meal-save-recovery-mobile.png',
    fullPage: true,
  })

  const retryResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/nutrition/meals') && response.request().method() === 'POST',
  )
  await retryButton.click()
  expect((await retryResponse).status()).toBe(201)
  await expect(page.locator('.meal-entry').filter({ hasText: '响应丢失午餐' })).toHaveCount(1)
  expect(createAttempts).toBe(2)
  expect(idempotencyKeys[0]).not.toBe('')
  expect(idempotencyKeys[1]).toBe(idempotencyKeys[0])
})

test('meal editor and ledger remain balanced at wide viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const browserErrors = collectBrowserErrors(page)

  await openNutrition(page)
  await expect(page.getByText('饮食记录簿')).toBeVisible()
  await expect(page.getByText('还没有饮食记录')).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-006-nutrition-wide.png',
    fullPage: true,
  })
  expect(browserErrors).toEqual([])
})

test('meal editor restores only whitelisted form fields and clears the draft after save', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const browserErrors = collectBrowserErrors(page)
  await openNutrition(page)
  await expectReducedMotion(page)

  const title = page.locator('.nutrition-title-input input')
  await title.fill('训练后的晚餐')
  await page.getByRole('button', { name: '添加熟鸡胸肉' }).click()
  await expect(page.getByText('未完成内容已暂存')).toBeVisible()
  await page.reload()
  await expect(page.getByText('发现一份未完成记录')).toBeVisible()
  await page.getByRole('button', { name: '恢复草稿' }).click()
  await expect(title).toHaveValue('训练后的晚餐')
  await expect(page.locator('.meal-item')).toHaveCount(1)
  await expect(page.getByText('仅保存表单字段，不包含照片、授权材料或 AI 待审内容。')).toBeVisible()

  const createResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/nutrition/meals') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '保存餐次', exact: true }).click()
  expect((await createResponse).status()).toBe(201)
  expect(await page.evaluate(() => localStorage.getItem('myfitness.local-draft.meal'))).toBeNull()
  expect(browserErrors).toEqual([])
})

test('meal correction draft refuses a stale server revision without overwriting it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors = collectBrowserErrors(page)
  await openNutrition(page)

  await page.getByRole('button', { name: '添加熟鸡胸肉' }).click()
  await page.getByRole('button', { name: '保存餐次', exact: true }).click()
  await expect(page.locator('.meal-entry')).toHaveCount(1)
  await page.locator('.meal-entry').first().getByRole('button', { name: '修改' }).click()
  await page.locator('.nutrition-title-input input').fill('未保存的餐次修改')
  await expect(page.getByText('未保存修改已暂存')).toBeVisible()

  await page.reload()
  await expect(page.getByText('发现一份未完成修改')).toBeVisible()
  await page.route(/\/v1\/nutrition\/meals\/[0-9a-f-]{36}$/, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }
    const response = await route.fetch()
    const body = (await response.json()) as { revision: number }
    await route.fulfill({ response, json: { ...body, revision: body.revision + 1 } })
  })
  await page.getByRole('button', { name: '恢复修改' }).click()
  await expect(page.getByText(/修改基于旧版本或已删除餐次/)).toBeVisible()
  await expect(page.getByText('发现一份未完成修改')).not.toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('myfitness.local-draft.meal'))).toBeNull()
  expect(browserErrors).toEqual([])
})

test('daily nutrition observation keeps recorded and missing local days explicit', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors = collectBrowserErrors(page)
  await openNutrition(page)

  await page.getByRole('button', { name: '添加熟鸡胸肉' }).click()
  await page.getByRole('button', { name: '保存餐次', exact: true }).click()
  await expect(page.locator('.meal-entry')).toHaveCount(1)

  const insightResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/v1/insights/nutrition') && response.request().method() === 'GET',
  )
  await page.getByRole('button', { name: '查看每日营养趋势' }).click()
  expect((await insightResponse).status()).toBe(200)
  await expect(page.getByText('看见记录留下的形状，也看见没有记录的空白。')).toBeVisible()
  await expect(page.locator('.nutrition-evidence-day')).toHaveCount(30)
  await expect(page.getByText('无记录，不等于零摄入')).toHaveCount(6)
  await expect(
    page.getByText('纤维有标注 1/1 个食物条目。未标注部分不会按 0 g 计入。'),
  ).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-040-nutrition-observation-mobile.png',
    fullPage: true,
  })

  await page.getByRole('button', { name: '7 天' }).click()
  await expect(page.locator('.nutrition-evidence-day')).toHaveCount(7)
  await expect(page.getByLabel('有记录日 1')).toBeVisible()
  await expect(page.getByLabel('无记录日 6')).toBeVisible()
  await page.getByRole('button', { name: '纤维' }).click()
  await expect(page.getByText('7 天 · 纤维 g')).toBeVisible()
  expect(browserErrors).toEqual([])
})

test('owned food stays reusable and corrections never rewrite the meal draft snapshot', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors = collectBrowserErrors(page)
  await openNutrition(page)

  await page.getByRole('button', { name: '管理我的食物' }).click()
  await expect(page.getByText('我的食物，是可修订的定义，不是会漂移的历史。')).toBeVisible()
  await page.getByRole('button', { name: '＋ 新建食物' }).click()
  await page.locator('[aria-label="自定义食物名称"] input').fill('家庭炖牛肉')
  await page.locator('[aria-label="自定义别名（逗号分隔）"] input').fill('周末炖牛肉')
  await page.locator('[aria-label="自定义默认克重"] input').fill('180')
  await page.locator('[aria-label="自定义热量 kcal"] input').fill('186')
  await page.locator('[aria-label="自定义蛋白质 g"] input').fill('22')
  await page.locator('[aria-label="自定义碳水 g"] input').fill('4')
  await page.locator('[aria-label="自定义脂肪 g"] input').fill('9')
  await page.locator('[aria-label="自定义膳食纤维 g（可选）"] input').fill('0.8')
  await page.locator('[aria-label="自定义数据依据（必填）"] input').fill('家庭配方估算：2026-08-05')
  await page.locator('.food-editor__categories').getByRole('button', { name: '蛋白来源' }).click()

  const createResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/food-catalog') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '保存定义' }).click()
  expect((await createResponse).status()).toBe(201)
  await expect(page.getByText('自建食物已保存；返回餐食页后可从“我的”列表加入本餐。')).toBeVisible()
  await page.getByRole('button', { name: '返回餐食记录' }).click()
  await page.getByRole('button', { name: '我的 1' }).click()
  await page.getByRole('button', { name: '添加家庭炖牛肉' }).click()
  await expect(page.locator('.meal-item').getByText('家庭炖牛肉')).toBeVisible()
  await expect(page.getByText('家庭炖牛肉已加入本餐，请确认实际份量。')).toBeVisible()

  const historyResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith('/history') &&
      response.request().method() === 'GET',
  )
  await page.getByRole('button', { name: '编辑家庭炖牛肉' }).click()
  expect((await historyResponse).status()).toBe(200)
  await page.locator('[aria-label="自定义食物名称"] input').fill('低脂家庭炖牛肉')
  await page.locator('[aria-label="自定义热量 kcal"] input').fill('165')
  await page.locator('[aria-label="自定义脂肪 g"] input').fill('6.5')
  await page
    .locator('[aria-label="自定义数据依据（必填）"] input')
    .fill('家庭配方重新称量：2026-08-06')
  const updateResponse = page.waitForResponse(
    (response) =>
      /\/v1\/food-catalog\/[0-9a-f-]{36}$/.test(response.url()) &&
      response.request().method() === 'PUT',
  )
  await page.getByRole('button', { name: '保存纠正' }).click()
  expect((await updateResponse).status()).toBe(200)
  await expect(
    page.getByText('定义已纠正；餐食页中的当前草稿、历史餐食和收藏快照不会被改写。'),
  ).toBeVisible()
  await page.getByRole('button', { name: '返回餐食记录' }).click()
  await expect(page.locator('.meal-item').getByText('家庭炖牛肉')).toBeVisible()
  await expect(page.locator('.meal-item').getByText('低脂家庭炖牛肉')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '添加低脂家庭炖牛肉' })).toBeVisible()

  const revisedHistoryResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith('/history') &&
      response.request().method() === 'GET',
  )
  await page.getByRole('button', { name: '编辑低脂家庭炖牛肉' }).click()
  expect((await revisedHistoryResponse).status()).toBe(200)
  await expect(page.getByLabel('定义修订历史').getByText(/R2 · 纠正/)).toBeVisible()
  await expect(page.getByLabel('定义修订历史').getByText(/R1 · 创建/)).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-039-user-food-catalog-mobile.png',
    fullPage: true,
  })

  const archiveResponse = page.waitForResponse(
    (response) =>
      /\/v1\/food-catalog\/[0-9a-f-]{36}$/.test(response.url()) &&
      response.request().method() === 'DELETE',
  )
  await page.getByRole('button', { name: '归档', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '确认归档自建食物' })).toBeVisible()
  await page.getByRole('button', { name: '确认归档' }).click()
  expect((await archiveResponse).status()).toBe(200)
  await expect(page.getByText('自建食物已归档；历史餐食与收藏未被改写。')).toBeVisible()
  await page.getByRole('button', { name: '返回餐食记录' }).click()
  await expect(page.getByRole('button', { name: '添加低脂家庭炖牛肉' })).toHaveCount(0)
  await expect(page.locator('.meal-item').getByText('家庭炖牛肉')).toBeVisible()
  expect(browserErrors).toEqual([])
})

test('owned food definition history progressively loads immutable older revisions', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors = collectBrowserErrors(page)
  await openNutrition(page)
  await page.getByRole('button', { name: '管理我的食物' }).click()

  const seed = await page.evaluate(async (apiUrl) => {
    const rawToken = localStorage.getItem('myfitness.auth.accessToken')
    if (!rawToken) throw new Error('development access token is missing')
    let decoded: { data?: unknown } = {}
    try {
      decoded = JSON.parse(rawToken) as { data?: unknown }
    } catch {
      // Legacy H5 storage kept the access token as a plain string.
    }
    const token = typeof decoded.data === 'string' ? decoded.data : rawToken
    const headers = {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    }
    const payload = (revision: number) => ({
      name: '分页配方食物',
      aliases: ['历史分页样本'],
      category: 'custom',
      nutrientsPer100g: {
        energyKcal: 120 + revision,
        proteinG: 8,
        carbohydrateG: 12,
        fatG: 4,
      },
      reference: `配方称量修订 R${revision}`,
      defaultServing: { amount: 100, unit: 'g', grams: 100 },
    })
    const createdResponse = await fetch(`${apiUrl}/food-catalog`, {
      method: 'POST',
      headers: { ...headers, 'x-idempotency-key': 'progressive-food-definition-history' },
      body: JSON.stringify(payload(1)),
    })
    let current = (await createdResponse.json()) as { id: string; revision: number }
    const statuses = [createdResponse.status]
    for (let revision = 2; revision <= 12; revision += 1) {
      const response = await fetch(`${apiUrl}/food-catalog/${current.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ ...payload(revision), expectedRevision: current.revision }),
      })
      statuses.push(response.status)
      current = (await response.json()) as { id: string; revision: number }
    }
    return { statuses, revision: current.revision }
  }, apiUrl)
  expect(seed.statuses).toEqual([201, ...Array.from({ length: 11 }, () => 200)])
  expect(seed.revision).toBe(12)

  await page.reload()
  const firstPageResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/history?limit=10') && response.request().method() === 'GET',
  )
  await page.getByRole('button', { name: '编辑分页配方食物' }).click()
  expect((await firstPageResponse).status()).toBe(200)
  const history = page.getByLabel('定义修订历史')
  await expect(history.locator('.definition-revision-ledger__item')).toHaveCount(10)
  await expect(history.getByText(/R12 · 纠正/)).toBeVisible()

  const olderPageResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/history?limit=10&cursor=') && response.request().method() === 'GET',
  )
  await history.getByRole('button', { name: '继续载入更早版本' }).click()
  expect((await olderPageResponse).status()).toBe(200)
  await expect(history.locator('.definition-revision-ledger__item')).toHaveCount(12)
  await expect(history.getByText(/R1 · 创建/)).toBeVisible()
  await expect(history.getByText('已载入全部版本')).toBeVisible()
  await history.screenshot({
    path: 'output/playwright/iteration-048-progressive-definition-revisions-mobile.png',
  })
  expect(browserErrors).toEqual([])
})

test('food photo candidates require review, delete media and only fill an unsaved draft', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors = collectBrowserErrors(page)
  await openNutrition(page)

  await page.locator('.nutrition-title-input input').fill('照片校样后的午餐')
  await expect(page.getByRole('button', { name: '打开照片校样台' })).toBeVisible()
  await expect(page.getByRole('button', { name: '选择一张餐食照片' })).toHaveCount(0)
  await openFoodPhotoWorkflow(page)
  await expect(page.getByRole('button', { name: '选择一张餐食照片' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await uploadDemoMealPhoto(page)
  await expectPoliteStatus(page.locator('.food-photo-feedback'))
  await expect(page.getByText('未确认 / PROOF')).toBeVisible()
  await expect(page.getByText('估计 100–220 g')).toBeVisible()
  await expect(page.getByText('中置信')).toBeVisible()
  await expect(page.getByRole('button', { name: '取消选择熟米饭' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  const riceCandidate = page.getByRole('button', { name: '取消选择熟米饭' })
  await riceCandidate.focus()
  await page.keyboard.press(' ')
  await expect(page.getByRole('button', { name: '选择熟米饭' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await page.keyboard.press(' ')
  await expect(page.getByRole('button', { name: '取消选择熟米饭' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.screenshot({
    path: 'output/playwright/iteration-052-keyboard-food-photo-mobile.png',
    fullPage: true,
  })
  await expect(page.locator('.meal-entry')).toHaveCount(0)
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('myfitness.local-draft.meal') ?? ''))
    .toContain('照片校样后的午餐')
  const unconfirmedDraft = await page.evaluate(
    () => localStorage.getItem('myfitness.local-draft.meal') ?? '',
  )
  expect(unconfirmedDraft).not.toContain('rice_cooked')
  expect(unconfirmedDraft).not.toContain('previewPath')
  await page.locator('[aria-label="熟米饭确认克重"] input').fill('165')
  await page.locator('[aria-label="熟鸡胸肉确认克重"] input').fill('120')
  await page.screenshot({
    path: 'output/playwright/iteration-051-lazy-food-photo-mobile.png',
    fullPage: true,
  })

  const confirmResponse = page.waitForResponse(
    (response) => response.url().endsWith('/confirm') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '确认 2 项并返回草稿' }).focus()
  await page.keyboard.press('Enter')
  expect((await confirmResponse).status()).toBe(200)
  await expect(
    page.getByText('候选已带入当前草稿，照片已删除；餐次尚未保存，请继续核对。'),
  ).toBeVisible()
  await expectPoliteStatus(page.locator('.nutrition-feedback'))
  await expectVisibleFocus(page.getByRole('button', { name: '打开照片校样台' }))
  await expect(page.getByText('未确认 / PROOF')).toHaveCount(0)
  await expect(page.locator('.nutrition-title-input input')).toHaveValue('照片校样后的午餐')
  await expect(page.locator('.meal-item')).toHaveCount(2)
  await expect(page.locator('.meal-entry')).toHaveCount(0)
  expect(browserErrors).toEqual([])
})

test('ambiguous photo reservation reuses one key without retaining media in the meal draft', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openNutrition(page)
  await page.locator('.nutrition-title-input input').fill('预约响应丢失午餐')
  await openFoodPhotoWorkflow(page)
  await page.getByRole('button', { name: /我同意本次上传与上述处理/ }).click()

  const idempotencyKeys: string[] = []
  let reservationAttempts = 0
  await page.route('**/v1/nutrition/photo-candidates', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    reservationAttempts += 1
    idempotencyKeys.push(route.request().headers()['x-idempotency-key'] ?? '')
    if (reservationAttempts === 1) {
      const committedResponse = await route.fetch()
      expect(committedResponse.status()).toBe(201)
      await route.abort('failed')
      return
    }
    await route.continue()
  })

  const firstChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '选择一张餐食照片' }).click()
  const firstChooser = await firstChooserPromise
  await firstChooser.setFiles({
    name: 'meal.png',
    mimeType: 'image/png',
    buffer: validDemoMealPng,
  })

  const recovery = page.locator('.food-photo-recovery')
  await expect(recovery.getByText('SAME REQUEST / 仅同一请求可重试')).toBeVisible()
  await expect(page.getByText('未确认 / PROOF')).toHaveCount(0)
  const unresolvedDraft = await page.evaluate(
    () => localStorage.getItem('myfitness.local-draft.meal') ?? '',
  )
  expect(unresolvedDraft).toContain('预约响应丢失午餐')
  expect(unresolvedDraft).not.toContain('meal.png')
  expect(unresolvedDraft).not.toContain('previewPath')

  await page.screenshot({
    path: 'output/playwright/iteration-055-photo-reserve-recovery-mobile.png',
    fullPage: true,
  })

  const retryChooserPromise = page.waitForEvent('filechooser')
  await recovery.getByRole('button', { name: '重新选择并重试预约' }).click()
  const retryChooser = await retryChooserPromise
  const uploadResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/v1/nutrition/photo-candidates/') &&
      response.url().includes('/upload?token=') &&
      response.request().method() === 'POST',
  )
  await retryChooser.setFiles({
    name: 'meal.png',
    mimeType: 'image/png',
    buffer: validDemoMealPng,
  })
  expect((await uploadResponse).status()).toBe(201)
  await expect(page.getByText('未确认 / PROOF')).toBeVisible()
  expect(reservationAttempts).toBe(2)
  expect(idempotencyKeys[0]).not.toBe('')
  expect(idempotencyKeys[1]).toBe(idempotencyKeys[0])
  await expect
    .poll(async () => {
      if (!trackedSubject) return -1
      const result = await database.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM nutrition_photo_candidates AS candidate
         JOIN auth_identities AS identity ON identity.user_id = candidate.user_id
         WHERE identity.provider = 'dev' AND identity.provider_subject = $1
           AND candidate.idempotency_key = $2`,
        [trackedSubject, idempotencyKeys[0]],
      )
      return Number(result.rows[0]?.count ?? -1)
    })
    .toBe(1)
})

test('ambiguous photo confirmation reconciles without writing unknown candidates to the meal', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openNutrition(page)
  await page.locator('.nutrition-title-input input').fill('确认响应丢失午餐')
  await openFoodPhotoWorkflow(page)
  await uploadDemoMealPhoto(page)
  await page.locator('[aria-label="熟米饭确认克重"] input').fill('165')
  await page.locator('[aria-label="熟鸡胸肉确认克重"] input').fill('120')

  await page.route('**/v1/nutrition/photo-candidates/*/confirm', async (route) => {
    const committedResponse = await route.fetch()
    expect(committedResponse.status()).toBe(200)
    await route.abort('failed')
  })

  await page.getByRole('button', { name: '确认 2 项并返回草稿' }).click()
  const recovery = page.locator('.food-photo-recovery')
  await expect(recovery.getByText('RECONCILE FIRST / 禁止直接重放')).toBeVisible()
  await expect(recovery).toContainText('核对前不会重放操作')
  await expect(page.getByText('候选已带入当前草稿')).toHaveCount(0)
  const unresolvedDraft = await page.evaluate(
    () => localStorage.getItem('myfitness.local-draft.meal') ?? '',
  )
  expect(unresolvedDraft).toContain('确认响应丢失午餐')
  expect(unresolvedDraft).not.toContain('rice_cooked')
  expect(unresolvedDraft).not.toContain('previewPath')

  await recovery.getByRole('button', { name: '核对服务端状态' }).click()
  await expect(recovery.getByText('NO CONFIRMED HANDOFF / 未写入餐食')).toBeVisible()
  await expect(recovery).toContainText('没有向餐食草稿写入任何候选')
  await expect(page.getByRole('button', { name: '确认 2 项并返回草稿' })).toHaveCount(0)

  await page.screenshot({
    path: 'output/playwright/iteration-055-photo-confirm-reconciliation-mobile.png',
    fullPage: true,
  })

  await recovery.getByRole('button', { name: '返回餐食重新开始' }).click()
  await expect(page.locator('.nutrition-title-input input')).toHaveValue('确认响应丢失午餐')
  await expect(page.locator('.meal-item')).toHaveCount(0)
  await expect(page.getByText('没有候选写入餐食草稿')).toBeVisible()
})

test('food photo proof sheet is readable at wide viewport and can be revoked', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const browserErrors = collectBrowserErrors(page)
  await openNutrition(page)
  await openFoodPhotoWorkflow(page)
  await uploadDemoMealPhoto(page)
  await expect(page.locator('.photo-review')).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-051-lazy-food-photo-wide.png',
    fullPage: true,
  })

  await page.route('**/v1/nutrition/photo-candidates/*', async (route) => {
    if (route.request().method() !== 'DELETE') {
      await route.continue()
      return
    }
    const committedResponse = await route.fetch()
    expect(committedResponse.status()).toBe(204)
    await route.abort('failed')
  })
  await page.getByRole('button', { name: '删除校样' }).click()
  const recovery = page.locator('.food-photo-recovery')
  await expect(recovery.getByText('RECONCILE FIRST / 禁止直接重放')).toBeVisible()
  await expect(page.getByText(/照片和衍生候选已删除/)).toHaveCount(0)
  await recovery.getByRole('button', { name: '核对服务端状态' }).click()
  await expect(recovery.getByText('NO REVIEWABLE PROOF / 清理状态受控')).toBeVisible()
  await expect(recovery).toContainText('不声称私有媒体已经物理删除')
  expect(
    browserErrors.filter((error) => error !== 'Failed to load resource: net::ERR_FAILED'),
  ).toEqual([])
})
