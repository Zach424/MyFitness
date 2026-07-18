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

const openWorkouts = async (page: Page) => {
  await page.goto('/')
  await page.getByRole('button', { name: '训练', exact: true }).click()
  await expect(page.getByText('把完成的每一组，写成下一次的起点。')).toBeVisible()
}

const collectBrowserErrors = (page: Page) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  return browserErrors
}

test('workout completes create, repeat, update, history and delete lifecycle', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors = collectBrowserErrors(page)

  await openWorkouts(page)
  await expect(page.getByText('还没有训练记录')).toBeVisible()
  await expect(page.getByLabel('本次训练汇总预览').getByText('3/3')).toBeVisible()
  await expect(page.getByLabel('本次训练汇总预览').getByText('360')).toBeVisible()

  const firstCreatePromise = page.waitForResponse(
    (response) => response.url().endsWith('/v1/workouts') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '保存训练', exact: true }).click()
  expect((await firstCreatePromise).status()).toBe(201)
  await expect(page.locator('.workout-entry')).toHaveCount(1)
  await expect(page.locator('.workout-entry').first().getByText('360')).toBeVisible()

  await page.getByRole('button', { name: '重复上次训练' }).click()
  await expect(page.getByLabel('本次训练汇总预览').getByText('0/3')).toBeVisible()
  for (let setIndex = 1; setIndex <= 3; setIndex += 1) {
    await page.getByRole('button', { name: `高脚杯深蹲第${setIndex}组未完成` }).click()
  }

  const repeatedCreatePromise = page.waitForResponse(
    (response) => response.url().endsWith('/v1/workouts') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '保存训练', exact: true }).click()
  expect((await repeatedCreatePromise).status()).toBe(201)
  await expect(page.locator('.workout-entry')).toHaveCount(2)

  const newestEntry = page.locator('.workout-entry').first()
  await newestEntry.getByRole('button', { name: '修改' }).click()
  await page.locator('[aria-label="高脚杯深蹲第1组次数"] input').fill('12')
  const updatePromise = page.waitForResponse(
    (response) =>
      /\/v1\/workouts\/[0-9a-f-]{36}$/.test(response.url()) &&
      response.request().method() === 'PUT',
  )
  await page.getByRole('button', { name: '保存训练新版本' }).click()
  expect((await updatePromise).status()).toBe(200)
  await expect(page.locator('.workout-entry').first().getByText('384')).toBeVisible()
  await expect(page.locator('.workout-entry').first().getByText('v2')).toBeVisible()

  const historyPromise = page.waitForResponse(
    (response) => response.url().endsWith('/history') && response.request().method() === 'GET',
  )
  await page.locator('.workout-entry').first().getByRole('button', { name: '历史' }).click()
  expect((await historyPromise).status()).toBe(200)
  await expect(page.getByRole('dialog', { name: '训练历史' }).getByText('修改训练')).toBeVisible()
  await expect(page.getByRole('dialog', { name: '训练历史' }).getByText('创建训练')).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-005-workouts-mobile.png',
    fullPage: true,
  })
  await page.getByRole('button', { name: '关闭训练历史' }).first().click()

  await page.locator('.workout-entry').first().getByRole('button', { name: '删除' }).click()
  await expect(page.getByRole('dialog', { name: '确认删除训练' })).toBeVisible()
  const deletePromise = page.waitForResponse(
    (response) =>
      /\/v1\/workouts\/[0-9a-f-]{36}$/.test(response.url()) &&
      response.request().method() === 'DELETE',
  )
  await page.getByRole('button', { name: '确认删除' }).click()
  expect((await deletePromise).status()).toBe(204)
  await expect(page.locator('.workout-entry')).toHaveCount(1)
  await expect(page.getByText('训练已从记录簿移除，版本历史仍保留。')).toBeVisible()
  expect(browserErrors).toEqual([])
})

test('workout log remains useful at wide viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const browserErrors = collectBrowserErrors(page)

  await openWorkouts(page)
  await expect(page.getByText('训练记录簿')).toBeVisible()
  await expect(page.getByText('还没有训练记录')).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-005-workouts-wide.png',
    fullPage: true,
  })
  expect(browserErrors).toEqual([])
})
