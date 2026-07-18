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

const openRecords = async (page: Page) => {
  await page.goto('/')
  await page.getByRole('button', { name: '记录', exact: true }).click()
  await expect(page.getByText('记录身体，也记录恢复。')).toBeVisible()
}

test('body record completes create, update, history and delete lifecycle', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  await openRecords(page)
  await expect(page.getByText('还没有身体记录')).toBeVisible()
  await page.locator('[aria-label="体重数值"] input').fill('72.4')

  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/health-records') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '保存记录' }).click()
  const createResponse = await createResponsePromise
  expect(createResponse.status()).toBe(201)
  await expect(page.locator('.records-layout__log').getByText('72.4 kg')).toBeVisible()

  await page.getByRole('button', { name: '修改' }).click()
  await expect(page.getByText('正在修改这条记录；保存后会新增一个历史版本。')).toBeVisible()
  await page.locator('[aria-label="体重数值"] input').fill('73.1')
  const updateResponsePromise = page.waitForResponse(
    (response) =>
      /\/v1\/health-records\/[0-9a-f-]{36}$/.test(response.url()) &&
      response.request().method() === 'PUT',
  )
  await page.getByRole('button', { name: '保存新版本' }).click()
  const updateResponse = await updateResponsePromise
  expect(updateResponse.status()).toBe(200)
  await expect(page.locator('.records-layout__log').getByText('73.1 kg')).toBeVisible()
  await expect(page.locator('.records-layout__log').getByText('v2')).toBeVisible()

  const historyResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith('/history') && response.request().method() === 'GET',
  )
  await page.getByRole('button', { name: '历史' }).click()
  expect((await historyResponsePromise).status()).toBe(200)
  await expect(page.locator('.history-sheet').getByText('修改记录')).toBeVisible()
  await expect(page.locator('.history-sheet').getByText('创建记录')).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-004-records-mobile.png',
    fullPage: true,
  })
  await page.locator('.history-close').click()

  await page.getByRole('button', { name: '删除' }).click()
  await expect(page.getByRole('dialog', { name: '确认删除记录' })).toBeVisible()
  const deleteResponsePromise = page.waitForResponse(
    (response) =>
      /\/v1\/health-records\/[0-9a-f-]{36}$/.test(response.url()) &&
      response.request().method() === 'DELETE',
  )
  await page.getByRole('button', { name: '确认删除' }).click()
  expect((await deleteResponsePromise).status()).toBe(204)
  await expect(page.getByText('还没有身体记录')).toBeVisible()
  await expect(page.getByText('记录已从列表移除，审计历史仍安全保留。')).toBeVisible()
  expect(browserErrors).toEqual([])
})

test('record log keeps its hierarchy at wide viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  await openRecords(page)
  await expect(page.getByText('最近记录')).toBeVisible()
  await expect(page.getByText('体重趋势')).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-004-records-wide.png',
    fullPage: true,
  })
  expect(browserErrors).toEqual([])
})
