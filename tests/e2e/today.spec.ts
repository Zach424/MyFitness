import { expect, test, type Page } from '@playwright/test'
import { Pool } from 'pg'

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
  const healthResponse = await page.request.post('http://127.0.0.1:3100/v1/health-records', {
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
  const mealResponse = await page.request.post('http://127.0.0.1:3100/v1/nutrition/meals', {
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
  await expect(page.getByText('恢复信号较稳')).toBeVisible()
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
  await expect(page.getByText('等待恢复记录')).toBeVisible()
  await expect(page.getByText('没有恢复证据时不生成分数')).toBeVisible()
  await expect(page.getByText('记录趋势')).toBeVisible()
  await page.screenshot({ path: 'output/playwright/iteration-007-today-wide.png', fullPage: true })
  expect(errors).toEqual([])
})
