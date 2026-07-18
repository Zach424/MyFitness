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

const openOnboarding = async (page: Page) => {
  await page.goto('/')
  const profileEntry = page.getByRole('button', { name: '建立或更新个人资料' })
  if (await profileEntry.isVisible()) await profileEntry.click()
  else await page.getByRole('button', { name: '我的' }).click()
  await expect(page.getByText('先认识你')).toBeVisible()
}

const collectBrowserErrors = (page: Page) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    // Chromium logs a generic duplicate for failed HTTP responses; the response
    // listener below keeps the URL and permits only the expected empty profile.
    if (message.text().startsWith('Failed to load resource:')) return
    errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('requestfailed', (request) => {
    errors.push(`Request failed: ${request.method()} ${request.url()}`)
  })
  page.on('response', (response) => {
    if (response.status() < 400) return
    const expectedEmptyProfile =
      response.status() === 404 && response.url().endsWith('/v1/me/onboarding')
    if (!expectedEmptyProfile) {
      errors.push(`HTTP ${response.status()}: ${response.request().method()} ${response.url()}`)
    }
  })
  return errors
}

test('adult onboarding persists a professional-clearance risk state', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors = collectBrowserErrors(page)

  await openOnboarding(page)
  await page.getByRole('textbox', { name: '例如：小陈' }).fill('端到端测试')
  await page.getByRole('button', { name: '继续' }).click()

  await expect(page.getByText('找到可持续节奏')).toBeVisible()
  await page.getByRole('button', { name: '减脂' }).click()
  await page.getByRole('button', { name: '60 分钟' }).click()
  await page.getByRole('button', { name: '哑铃' }).click()
  await page.getByRole('button', { name: '继续' }).click()

  await expect(page.getByText('安全边界与授权')).toBeVisible()
  await page.getByRole('button', { name: '运动时胸部不适' }).click()

  for (const label of [
    '我确认已满 18 周岁',
    '我已阅读并同意服务条款',
    '我已阅读隐私说明',
    '我同意为记录和规划处理健康数据',
  ]) {
    await page.locator('.consent-row').filter({ hasText: label }).locator('input').click()
  }

  const savedResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/me/onboarding') && response.request().method() === 'PUT',
  )
  await page.getByRole('button', { name: '保存资料' }).click()
  const savedResponse = await savedResponsePromise
  expect(savedResponse.status()).toBe(200)
  const saved = (await savedResponse.json()) as {
    userId: string
    revision: number
    eligibility: { status: string; riskFlags: string[] }
  }
  expect(saved.userId).toMatch(/^[0-9a-f-]{36}$/)
  expect(saved.revision).toBe(1)
  expect(saved.eligibility).toEqual({
    status: 'professional_clearance_required',
    riskFlags: ['chest_pain'],
  })
  await expect(page.getByText(/资料已保存。为安全起见/)).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-003-onboarding-mobile.png',
    fullPage: true,
  })
  expect(browserErrors).toEqual([])
})

test('onboarding layout remains legible at wide viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const browserErrors = collectBrowserErrors(page)

  await openOnboarding(page)
  await expect(page.getByText('每一项数据，都说明用途。')).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-003-onboarding-wide.png',
    fullPage: true,
  })
  expect(browserErrors).toEqual([])
})
