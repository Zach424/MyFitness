import { expect, test, type Page } from '@playwright/test'
import { Pool } from 'pg'

const subjectStorageKey = 'myfitness.dev.subject'
const database = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgresql://myfitness:myfitness_local@127.0.0.1:54329/myfitness',
})
let trackedSubject: string | undefined

test.beforeEach(async ({ page }) => {
  trackedSubject = undefined
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
  if (!subject) return
  await database.query(
    `DELETE FROM users
      WHERE id IN (
        SELECT user_id FROM auth_identities WHERE provider = 'dev' AND provider_subject = $1
      )`,
    [subject],
  )
})

test.afterAll(async () => database.end())

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
  await page.getByRole('button', { name: /我同意本次上传与上述处理/ }).click()
  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '选择一张餐食照片' }).click()
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

test('meal completes favorite, create, repeat, update, history and delete lifecycle', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors = collectBrowserErrors(page)

  await openNutrition(page)
  await expect(page.getByText('还没有饮食记录')).toBeVisible()
  await page.getByRole('button', { name: '添加熟鸡胸肉' }).click()
  await page.getByRole('button', { name: '添加熟米饭' }).click()
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
  expect((await firstCreatePromise).status()).toBe(201)
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
    (response) => response.url().endsWith('/history') && response.request().method() === 'GET',
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

test('food photo candidates require review, delete media and only fill an unsaved draft', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors = collectBrowserErrors(page)
  await openNutrition(page)

  await expect(page.getByRole('button', { name: '选择一张餐食照片' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await uploadDemoMealPhoto(page)
  await expect(page.getByText('未确认 / PROOF')).toBeVisible()
  await expect(page.getByText('估计 100–220 g')).toBeVisible()
  await expect(page.getByText('中置信')).toBeVisible()
  await expect(page.locator('.meal-entry')).toHaveCount(0)
  await page.locator('[aria-label="熟米饭确认克重"] input').fill('165')
  await page.locator('[aria-label="熟鸡胸肉确认克重"] input').fill('120')
  await page.screenshot({
    path: 'output/playwright/iteration-010-food-photo-mobile.png',
    fullPage: true,
  })

  const confirmResponse = page.waitForResponse(
    (response) => response.url().endsWith('/confirm') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '确认 2 项并带入草稿' }).click()
  expect((await confirmResponse).status()).toBe(200)
  await expect(
    page.getByText('候选已带入当前草稿，照片已删除；餐次尚未保存，请继续核对。'),
  ).toBeVisible()
  await expect(page.getByText('未确认 / PROOF')).toHaveCount(0)
  await expect(page.locator('.meal-item')).toHaveCount(2)
  await expect(page.locator('.meal-entry')).toHaveCount(0)
  expect(browserErrors).toEqual([])
})

test('food photo proof sheet is readable at wide viewport and can be revoked', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const browserErrors = collectBrowserErrors(page)
  await openNutrition(page)
  await uploadDemoMealPhoto(page)
  await expect(page.locator('.photo-review')).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-010-food-photo-wide.png',
    fullPage: true,
  })

  const deleteResponse = page.waitForResponse(
    (response) =>
      /\/v1\/nutrition\/photo-candidates\/[0-9a-f-]{36}$/.test(response.url()) &&
      response.request().method() === 'DELETE',
  )
  await page.getByRole('button', { name: '删除校样' }).click()
  expect((await deleteResponse).status()).toBe(204)
  await expect(page.getByText('照片和衍生候选已删除。')).toBeVisible()
  expect(browserErrors).toEqual([])
})
