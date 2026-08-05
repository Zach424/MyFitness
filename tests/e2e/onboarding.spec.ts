import { expect, test, type Page } from '@playwright/test'
import { Pool } from 'pg'

const subjectStorageKey = 'myfitness.dev.subject'
const apiUrl = process.env.MYFITNESS_E2E_API_URL ?? 'http://127.0.0.1:3100/v1'
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
  await page.getByRole('button', { name: '建立或更新个人资料' }).click()
  await expect(page.getByText('先认识你')).toBeVisible()
}

const collectBrowserErrors = (
  page: Page,
  options: {
    allowOnboardingRequestFailure?: boolean
    expectedOnboardingStatus?: number
    expectedOnboardingWriteStatus?: number
  } = {},
) => {
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
    if (
      options.allowOnboardingRequestFailure &&
      request.method() === 'GET' &&
      request.url().endsWith('/v1/me/onboarding')
    )
      return
    errors.push(`Request failed: ${request.method()} ${request.url()}`)
  })
  page.on('response', (response) => {
    if (response.status() < 400) return
    const expectedEmptyProfile =
      response.status() === 404 && response.url().endsWith('/v1/me/onboarding')
    const expectedInjectedStatus =
      options.expectedOnboardingStatus === response.status() &&
      response.request().method() === 'GET' &&
      response.url().endsWith('/v1/me/onboarding')
    const expectedWriteStatus =
      options.expectedOnboardingWriteStatus === response.status() &&
      response.request().method() === 'PUT' &&
      response.url().endsWith('/v1/me/onboarding')
    if (!expectedEmptyProfile && !expectedInjectedStatus && !expectedWriteStatus) {
      errors.push(`HTTP ${response.status()}: ${response.request().method()} ${response.url()}`)
    }
  })
  return errors
}

const onboardingPayload = (displayName: string) => ({
  adultConfirmed: true,
  profile: {
    displayName,
    ageBand: '25_34',
    sexForCalculations: 'unspecified',
    height: { value: 170, unit: 'cm' },
    unitSystem: 'metric',
    timezone: 'Asia/Shanghai',
  },
  goal: {
    primaryGoal: 'fitness',
    experience: 'beginner',
    availableDays: ['mon', 'wed', 'fri'],
    sessionMinutes: 45,
    equipment: ['bodyweight'],
    dietaryPreferences: ['none'],
  },
  risk: { flags: [], acknowledged: true },
  consents: {
    terms: { accepted: true, version: '2026-07-18' },
    privacy: { accepted: true, version: '2026-07-18' },
    healthData: { accepted: true, version: '2026-07-18' },
  },
})

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

test('profile register keeps an initial transport outage unknown', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors = collectBrowserErrors(page, { allowOnboardingRequestFailure: true })
  let disconnectRead = true
  await page.route(`${apiUrl}/me/onboarding`, async (route) => {
    if (route.request().method() !== 'GET' || !disconnectRead) {
      await route.continue()
      return
    }
    await route.abort('internetdisconnected')
  })

  await page.goto('/')
  await page.getByRole('button', { name: '建立或更新个人资料' }).click()

  await expect(page.getByText('先确认资料底稿')).toBeVisible()
  await expect(page.getByText('个人资料底稿还没有读取')).toBeVisible()
  await expect(page.getByRole('button', { name: '重新核对' })).toBeFocused()
  await expect(page.getByRole('textbox', { name: '例如：小陈' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '保存资料' })).toHaveCount(0)
  await page.screenshot({
    path: 'output/playwright/iteration-071-profile-register-offline-mobile.png',
    fullPage: true,
  })

  disconnectRead = false
  await page.getByRole('button', { name: '重新核对' }).click()
  await expect(page.getByText('服务已确认：当前尚未建档')).toBeVisible()
  await expect(page.getByRole('textbox', { name: '例如：小陈' })).toBeVisible()
  expect(browserErrors).toEqual([])
})

test('profile register retains local edits after a refused refresh', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const browserErrors = collectBrowserErrors(page, { expectedOnboardingStatus: 503 })
  const sessionPromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/auth/dev/session') && response.request().method() === 'POST',
  )
  await page.goto('/')
  const session = await sessionPromise
  expect(session.status()).toBe(200)
  const { accessToken } = (await session.json()) as { accessToken: string }
  const seeded = await page.request.put(`${apiUrl}/me/onboarding`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: onboardingPayload('已核对资料'),
  })
  expect(seeded.status()).toBe(200)

  await page.getByRole('button', { name: '建立或更新个人资料' }).click()
  const displayName = page.getByRole('textbox', { name: '例如：小陈' })
  await expect(displayName).toHaveValue('已核对资料')
  await displayName.fill('保留的本地修改')

  let observedPutCount = 0
  await page.route(`${apiUrl}/me/onboarding`, async (route) => {
    if (route.request().method() !== 'GET') {
      if (route.request().method() === 'PUT') observedPutCount += 1
      await route.continue()
      return
    }
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'injected profile register outage' }),
    })
  })
  await page.getByRole('button', { name: '更新底稿' }).click()

  await expect(page.getByText('个人资料底稿暂时无法读取')).toBeVisible()
  await expect(page.getByText('保留底稿 · 资料 v1', { exact: true })).toBeVisible()
  await expect(displayName).toHaveValue('保留的本地修改')
  await expect(page.getByRole('button', { name: '重新核对' })).toBeFocused()
  await page.locator('.onboarding-scroll').evaluate((element) => element.scrollTo({ top: 0 }))
  await page.screenshot({
    path: 'output/playwright/iteration-071-profile-register-stale-wide.png',
    fullPage: true,
  })

  await page.getByRole('button', { name: '继续' }).click()
  await page.getByRole('button', { name: '继续' }).click()
  await expect(page.getByRole('button', { name: '保存资料' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  expect(observedPutCount).toBe(0)
  expect(
    await page.evaluate(
      (localValue) => Object.values(localStorage).some((value) => value.includes(localValue)),
      '保留的本地修改',
    ),
  ).toBe(false)
  expect(browserErrors).toEqual([])
})

test('profile register refuses to rebase a local draft over a newer revision', async ({ page }) => {
  const browserErrors = collectBrowserErrors(page, { expectedOnboardingWriteStatus: 409 })
  const sessionPromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/auth/dev/session') && response.request().method() === 'POST',
  )
  await page.goto('/')
  const session = await sessionPromise
  expect(session.status()).toBe(200)
  const { accessToken } = (await session.json()) as { accessToken: string }
  const headers = { Authorization: `Bearer ${accessToken}` }
  const seeded = await page.request.put(`${apiUrl}/me/onboarding`, {
    headers,
    data: onboardingPayload('资料 v1'),
  })
  expect(seeded.status()).toBe(200)

  await page.getByRole('button', { name: '建立或更新个人资料' }).click()
  const displayName = page.getByRole('textbox', { name: '例如：小陈' })
  await expect(displayName).toHaveValue('资料 v1')
  await displayName.fill('不应被自动覆盖的本地修改')

  const remoteUpdate = await page.request.put(`${apiUrl}/me/onboarding`, {
    headers,
    data: { ...onboardingPayload('服务端资料 v2'), expectedRevision: 1 },
  })
  expect(remoteUpdate.status()).toBe(200)
  await page.getByRole('button', { name: '继续' }).click()
  await page.getByRole('button', { name: '继续' }).click()

  const conflictResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/me/onboarding') && response.request().method() === 'PUT',
  )
  await page.getByRole('button', { name: '保存资料' }).click()
  expect((await conflictResponse).status()).toBe(409)

  await expect(page.getByText('本地修改基于较早的资料修订')).toBeVisible()
  await expect(page.getByText('已确认底稿 · 资料 v2 · 有未提交修改')).toBeVisible()
  await expect(page.getByRole('button', { name: '保存资料' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await page.getByRole('button', { name: '放弃本地修改并载入最新底稿' }).click()
  await expect(displayName).toHaveValue('服务端资料 v2')
  await expect(page.getByText('本地修改基于较早的资料修订')).toHaveCount(0)
  expect(browserErrors).toEqual([])
})
