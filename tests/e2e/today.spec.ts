import { expect, test, type Page } from '@playwright/test'
import { Pool } from 'pg'

import { apiUrl } from './runtime'

const database = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgresql://myfitness:myfitness_local@127.0.0.1:54329/myfitness',
})
let trackedSubject: string | undefined

test.beforeEach(async ({ page }) => {
  trackedSubject = undefined
  page.on('request', (request) => {
    if (!request.url().endsWith('/v1/auth/dev/session') || request.method() !== 'POST') return
    const body = request.postDataJSON() as { subject?: unknown }
    if (typeof body.subject === 'string') trackedSubject = body.subject
  })
})

test.afterEach(async () => {
  if (!trackedSubject) return
  await database.query(
    `DELETE FROM users WHERE id IN (
      SELECT user_id FROM auth_identities WHERE provider = 'dev' AND provider_subject = $1
    )`,
    [trackedSubject],
  )
})

test.afterAll(async () => database.end())

const browserErrors = (page: Page) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

test('Today replaces fixtures with confirmed recovery and meal evidence', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const errors = browserErrors(page)
  const sessionPromise = page.waitForResponse((response) =>
    response.url().endsWith('/v1/auth/dev/session'),
  )
  await page.goto('/')
  const { accessToken } = (await (await sessionPromise).json()) as { accessToken: string }
  await expect(page.getByText('今天还没有已确认记录')).toBeVisible()

  const occurredAt = new Date().toISOString()
  const headers = { Authorization: `Bearer ${accessToken}`, 'x-idempotency-key': '' }
  const healthResponse = await page.request.post(`${apiUrl}/health-records`, {
    headers: { ...headers, 'x-idempotency-key': `today-health-${Date.now()}` },
    data: {
      metric: 'recovery.energy',
      value: 4,
      unit: 'score_1_5',
      source: { kind: 'manual' },
      status: 'confirmed',
      occurredAt,
      timezone: 'Asia/Shanghai',
    },
  })
  expect(healthResponse.status()).toBe(201)
  const mealResponse = await page.request.post(`${apiUrl}/nutrition/meals`, {
    headers: { ...headers, 'x-idempotency-key': `today-meal-${Date.now()}` },
    data: {
      mealType: 'lunch',
      title: '真实午餐',
      source: { kind: 'manual' },
      occurredAt,
      timezone: 'Asia/Shanghai',
      items: [
        {
          position: 1,
          food: {
            foodKey: 'rice_cooked',
            name: '熟米饭',
            category: 'staple',
            nutrientsPer100g: {
              energyKcal: 130,
              proteinG: 2.7,
              carbohydrateG: 28,
              fatG: 0.3,
              fiberG: 0.4,
            },
          },
          serving: { amount: 150, unit: 'g', grams: 150 },
        },
      ],
    },
  })
  expect(mealResponse.status()).toBe(201)

  await page.reload()
  await expect(page.getByText('主观恢复证据不足')).toBeVisible()
  await expect(page.getByText('近 7 天：1/2 个记录日 · 1/2 类指标')).toBeVisible()
  await expect(page.getByText('近 7 天只有 1 个记录日、1 类主观恢复指标')).toBeVisible()
  await expect(page.getByText('4 /5', { exact: true })).toBeVisible()
  await expect(page.getByText('真实午餐')).toBeVisible()
  await expect(page.getByText('195 kcal', { exact: true })).toBeVisible()
  await expect(page.getByText('1 餐 · 195 kcal')).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-007-today-mobile.png',
    fullPage: true,
  })
  expect(errors).toEqual([])
})

test('real Today empty state remains balanced on wide H5', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const errors = browserErrors(page)
  await page.goto('/')
  await expect(page.getByText('今天还没有已确认记录')).toBeVisible()
  await expect(page.getByText('主观恢复证据不足')).toBeVisible()
  await expect(page.getByText('近 7 天：0/2 个记录日 · 0/2 类指标')).toBeVisible()
  await expect(page.getByText('记录趋势')).toBeVisible()
  await page.screenshot({ path: 'output/playwright/iteration-007-today-wide.png', fullPage: true })
  expect(errors).toEqual([])
})

test('Coach orders confirmed evidence before plan and AI without inventing an empty plan', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 })
  const errors = browserErrors(page)
  let dashboardReads = 0
  page.on('request', (request) => {
    if (request.url().includes('/v1/insights/dashboard')) dashboardReads += 1
  })
  await page.goto('/')
  await expect(page.getByText('今天还没有已确认记录')).toBeVisible()

  await page.getByRole('button', { name: '教练', exact: true }).click()
  await expect(page.getByText('选择卡片检查来源。')).toBeVisible()
  await expect(page.getByText('本人确认 · 当前暂无')).toBeVisible()
  await expect(page.getByText('确认恢复记录 · 当前未引用')).toBeVisible()
  await expect(page.getByText('系统观察 · 恢复 0 · 训练 0 · 餐次 0')).toBeVisible()
  await expect(page.getByText('估计 · 证据不足 · 0 条证据')).toBeVisible()
  await expect(page.getByText(/无有效期保证/)).toBeVisible()
  await expect(page.getByText('本周还没有计划折页')).toBeVisible()
  await expect(page.getByRole('button', { name: '建立本周计划' })).toBeVisible()
  await expect(page.getByRole('button', { name: '查看 AI 边注档案' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '教练', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )

  const mobileWidths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }))
  expect(mobileWidths).toEqual({ viewport: 320, document: 320, body: 320 })
  await page.screenshot({
    path: 'output/playwright/iteration-096-coach-mobile.png',
    fullPage: true,
  })

  await page.getByRole('button', { name: /系统观察.*检查来源/ }).press('Enter')
  await expect(page).toHaveURL(/#\/pages\/history\/index/)
  await page.goBack()
  await expect(page.getByText('选择卡片检查来源。')).toBeVisible()
  await expect.poll(() => dashboardReads).toBeGreaterThan(1)

  await page.setViewportSize({ width: 1280, height: 900 })
  const desktopHeader = await page.evaluate(() => {
    const refresh = document.querySelector('.coach-refresh')?.getBoundingClientRect()
    const navigation = document.querySelector('.bottom-nav')?.getBoundingClientRect()
    return {
      refreshVisible: Boolean(refresh?.width && refresh?.height),
      overlaps: Boolean(
        refresh &&
        navigation &&
        refresh.right > navigation.left &&
        refresh.left < navigation.right &&
        refresh.bottom > navigation.top &&
        refresh.top < navigation.bottom,
      ),
    }
  })
  expect(desktopHeader).toEqual({ refreshVisible: true, overlaps: false })
  expect(errors).toEqual([])
})

test('Today refuses to turn an initial offline read into a zero-value empty state', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const errors = browserErrors(page)
  let dashboardReads = 0
  await page.route('**/v1/insights/dashboard**', async (route) => {
    dashboardReads += 1
    if (dashboardReads === 1) await route.abort('internetdisconnected')
    else await route.continue()
  })

  await page.goto('/')
  await expect(page.getByText('OFFLINE / 连接未完成')).toBeVisible()
  await expect(page.getByText('还没有读取到今日证据')).toBeVisible()
  await expect(page.getByText('记录数量仍是未知状态')).toBeVisible()
  await expect(page.getByText('今天还没有已确认记录')).toHaveCount(0)
  await expect(page.getByText('有记录天数').locator('..').getByText('—')).toBeVisible()

  const retry = page.getByRole('button', { name: '重新读取今日证据' })
  await expect(retry).toBeFocused()
  await page.screenshot({
    path: 'output/playwright/iteration-062-today-initial-offline-mobile.png',
    fullPage: true,
  })
  await page.keyboard.press('Enter')
  await expect(page.getByText('今天还没有已确认记录')).toBeVisible()
  await expect(page.getByText('OFFLINE / 连接未完成')).toHaveCount(0)
  expect(dashboardReads).toBe(2)
  expect(errors.filter((error) => !error.includes('net::ERR_INTERNET_DISCONNECTED'))).toEqual([])
})

test('Today preserves one confirmed snapshot when a wide refresh is refused and retries', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const errors = browserErrors(page)
  const sessionPromise = page.waitForResponse((response) =>
    response.url().endsWith('/v1/auth/dev/session'),
  )
  await page.goto('/')
  const { accessToken } = (await (await sessionPromise).json()) as { accessToken: string }
  await expect(page.getByText('今天还没有已确认记录')).toBeVisible()

  const healthResponse = await page.request.post(`${apiUrl}/health-records`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-idempotency-key': `today-refresh-health-${Date.now()}`,
    },
    data: {
      metric: 'recovery.energy',
      value: 4,
      unit: 'score_1_5',
      source: { kind: 'manual' },
      status: 'confirmed',
      occurredAt: new Date().toISOString(),
      timezone: 'Asia/Shanghai',
    },
  })
  expect(healthResponse.status()).toBe(201)
  await page.getByRole('button', { name: '手动更新今日证据' }).click()
  await expect(page.getByText('4 /5', { exact: true })).toBeVisible()

  let refuseNextRead = true
  await page.route('**/v1/insights/dashboard**', async (route) => {
    if (refuseNextRead) {
      refuseNextRead = false
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'test read refusal' }),
      })
    } else await route.continue()
  })
  await page.getByRole('button', { name: '手动更新今日证据' }).click()
  await expect(page.getByText('READ REFUSED / 读取被拒绝')).toBeVisible()
  await expect(page.getByText('服务拒绝了本次更新')).toBeVisible()
  await expect(page.getByText('4 /5', { exact: true })).toBeVisible()
  await expect(page.getByText('1', { exact: true }).first()).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-062-today-stale-wide.png',
    fullPage: true,
  })

  const retry = page.getByRole('button', { name: '重新读取今日证据' })
  await retry.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('READ REFUSED / 读取被拒绝')).toHaveCount(0)
  await expect(page.getByText('4 /5', { exact: true })).toBeVisible()
  expect(errors.filter((error) => !error.includes('429 (Too Many Requests)'))).toEqual([])
})
