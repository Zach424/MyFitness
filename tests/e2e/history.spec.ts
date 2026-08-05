import { expect, test, type Page } from '@playwright/test'
import { Pool } from 'pg'

import { apiUrl } from './runtime'

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

const localDate = (instant: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

const apiHeaders = (accessToken: string, scope: string) => ({
  Authorization: `Bearer ${accessToken}`,
  'x-idempotency-key': `history-${scope}-${Date.now()}`,
})

test('history calendar crosses domains and requires a real time for backfill', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  const sessionPromise = page.waitForResponse((response) =>
    response.url().endsWith('/v1/auth/dev/session'),
  )
  await page.goto('/')
  const { accessToken } = (await (await sessionPromise).json()) as { accessToken: string }

  const recordedDate = localDate(new Date(Date.now() - 86_400_000))
  const openDate = localDate(new Date(Date.now() - 2 * 86_400_000))
  const healthResponse = await page.request.post(`${apiUrl}/health-records`, {
    headers: apiHeaders(accessToken, 'health'),
    data: {
      metric: 'body.weight',
      value: 72,
      unit: 'kg',
      source: { kind: 'manual' },
      status: 'confirmed',
      occurredAt: `${recordedDate}T00:00:00.000Z`,
      timezone: 'Asia/Shanghai',
    },
  })
  expect(healthResponse.status()).toBe(201)
  const workoutResponse = await page.request.post(`${apiUrl}/workouts`, {
    headers: apiHeaders(accessToken, 'workout'),
    data: {
      title: '历史日历训练',
      source: { kind: 'manual' },
      exercises: [
        {
          position: 1,
          exerciseKey: 'goblet_squat',
          name: '高脚杯深蹲',
          category: 'strength',
          sets: [
            {
              position: 1,
              kind: 'working',
              reps: 10,
              load: 12,
              loadUnit: 'kg',
              completed: true,
            },
          ],
        },
      ],
      startedAt: `${recordedDate}T01:00:00.000Z`,
      endedAt: `${recordedDate}T01:45:00.000Z`,
      timezone: 'Asia/Shanghai',
      painLevel: 0,
      fatigue: 3,
    },
  })
  expect(workoutResponse.status()).toBe(201)
  const mealResponse = await page.request.post(`${apiUrl}/nutrition/meals`, {
    headers: apiHeaders(accessToken, 'meal'),
    data: {
      mealType: 'lunch',
      title: '历史日历餐次',
      source: { kind: 'manual' },
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
          serving: { amount: 100, unit: 'g', grams: 100 },
        },
      ],
      occurredAt: `${recordedDate}T04:00:00.000Z`,
      timezone: 'Asia/Shanghai',
    },
  })
  expect(mealResponse.status()).toBe(201)

  const calendarResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/v1/insights/history-calendar') &&
      response.request().method() === 'GET',
  )
  await page.getByRole('button', { name: '打开 28 天历史日历' }).click()
  expect((await calendarResponse).status()).toBe(200)
  await expect(page.locator('.history-day')).toHaveCount(28)
  await expect(
    page.getByRole('button', {
      name: `${recordedDate}，身体或恢复 1 条，训练 1 次，饮食 1 餐`,
    }),
  ).toBeVisible()

  await page.getByRole('button', { name: `${openDate}，无记录` }).click()
  await expect(page.getByText('这一天没有已确认记录；这只是证据空白，不是行为结论。')).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-045-history-calendar-mobile.png',
    fullPage: true,
  })

  await page.getByRole('button', { name: '补记身体/恢复' }).click()
  const occurrenceInput = page.locator('[aria-label="发生时间，年-月-日 时:分"] input')
  await expect(occurrenceInput).toHaveValue(openDate)
  await expect(page.getByText('历史日期已带入；请补充 HH:mm 后再保存。')).toBeVisible()
  await page.locator('[aria-label="体重数值"] input').fill('71.8')
  await page.getByRole('button', { name: '保存记录' }).click()
  await expect(
    page.getByRole('status').getByText('已带入日期，请补充发生时分（HH:mm）'),
  ).toBeVisible()

  await occurrenceInput.fill(`${openDate} 08:15`)
  const createResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/health-records') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '保存记录' }).click()
  expect((await createResponse).status()).toBe(201)

  const refreshedCalendar = page.waitForResponse(
    (response) =>
      response.url().includes('/v1/insights/history-calendar') &&
      response.request().method() === 'GET',
  )
  await page.getByRole('button', { name: '返回今天' }).click()
  expect((await refreshedCalendar).status()).toBe(200)
  await expect(
    page.getByRole('button', {
      name: `${openDate}，身体或恢复 1 条，训练 0 次，饮食 0 餐`,
    }),
  ).toBeVisible()
  expect(browserErrors).toEqual([])
})
