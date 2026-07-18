import { expect, test, type Page, type Response } from '@playwright/test'
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

const collectBrowserErrors = (page: Page, allowedResponse?: (response: Response) => boolean) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    if (message.text().startsWith('Failed to load resource:')) return
    errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('requestfailed', (request) =>
    errors.push(`Request failed: ${request.method()} ${request.url()}`),
  )
  page.on('response', (response) => {
    if (response.status() < 400 || allowedResponse?.(response)) return
    errors.push(`HTTP ${response.status()}: ${response.request().method()} ${response.url()}`)
  })
  return errors
}

const onboarding = (riskFlags: string[] = []) => ({
  adultConfirmed: true,
  profile: {
    displayName: '计划浏览器测试',
    ageBand: '25_34',
    sexForCalculations: 'unspecified',
    height: { value: 175, unit: 'cm' },
    unitSystem: 'metric',
    timezone: 'Asia/Shanghai',
  },
  goal: {
    primaryGoal: 'habit',
    experience: 'beginner',
    availableDays: ['tue', 'thu', 'sat'],
    sessionMinutes: 45,
    equipment: ['dumbbells'],
    dietaryPreferences: ['none'],
  },
  risk: { flags: riskFlags, acknowledged: true },
  consents: {
    terms: { accepted: true, version: '2026-07-18' },
    privacy: { accepted: true, version: '2026-07-18' },
    healthData: { accepted: true, version: '2026-07-18' },
  },
})

const seedProfileAndOpenPlans = async (page: Page, riskFlags: string[] = []) => {
  const sessionPromise = page.waitForResponse((response) =>
    response.url().endsWith('/v1/auth/dev/session'),
  )
  await page.goto('/')
  const session = await sessionPromise
  expect(session.status()).toBe(200)
  const { accessToken } = (await session.json()) as { accessToken: string }
  const profile = await page.request.put('http://127.0.0.1:3100/v1/me/onboarding', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: onboarding(riskFlags),
  })
  expect(profile.status()).toBe(200)
  await page.getByRole('button', { name: '计划' }).click()
  await expect(page.getByText('这一周，先留出余地')).toBeVisible()
}

test('weekly plan supports substitution, modification and acceptance history', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const errors = collectBrowserErrors(page)
  await seedProfileAndOpenPlans(page)

  const generatedPromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/plans/weekly') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: /生成 .* 初稿/ }).click()
  expect((await generatedPromise).status()).toBe(201)
  await expect(page.getByText('本周折页')).toBeVisible()
  await expect(page.getByText('待决定')).toBeVisible()
  await expect(page.getByText('椅子深蹲').first()).toBeVisible()

  await page.getByRole('button', { name: '高脚杯深蹲' }).click()
  await expect(page.getByText('1 项替代动作尚未保存')).toBeVisible()
  const modifiedPromise = page.waitForResponse(
    (response) =>
      response.url().includes('/v1/plans/weekly/') &&
      response.url().endsWith('/decision') &&
      response.request().method() === 'PUT',
  )
  await page.getByRole('button', { name: '保存替代动作' }).click()
  expect((await modifiedPromise).status()).toBe(200)
  await expect(page.getByText('已调整')).toBeVisible()
  await expect(page.getByText('v2', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('保存替代动作', { exact: true }).last()).toBeVisible()

  const acceptedPromise = page.waitForResponse(
    (response) => response.url().endsWith('/decision') && response.request().method() === 'PUT',
  )
  await page.getByRole('button', { name: '采用调整后计划' }).click()
  expect((await acceptedPromise).status()).toBe(200)
  await expect(page.getByText('已采用', { exact: true })).toBeVisible()
  await expect(page.getByText('v3', { exact: true }).first()).toBeVisible()
  await page.locator('.plans-scroll').evaluate((element) => element.scrollTo({ top: 0 }))
  await page.screenshot({
    path: 'output/playwright/iteration-008-plans-mobile.png',
  })
  expect(errors).toEqual([])
})

test('weekly fold keeps plan evidence and nutrition focus legible at wide viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const errors = collectBrowserErrors(page)
  await seedProfileAndOpenPlans(page)
  await page.getByRole('button', { name: /生成 .* 初稿/ }).click()
  await expect(page.getByText('生成依据')).toBeVisible()
  await expect(page.getByText('本周饮食关注点')).toBeVisible()
  await expect(page.getByText('不计算热量缺口，也不把演示食物库当作处方。')).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-008-plans-wide.png',
    fullPage: true,
  })
  expect(errors).toEqual([])
})

test('AI margin note requires consent, preserves provenance and becomes stale with the plan', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const errors = collectBrowserErrors(page)
  await seedProfileAndOpenPlans(page)
  await page.getByRole('button', { name: /生成 .* 初稿/ }).click()
  await expect(page.getByText('计划边注')).toBeVisible()

  const generateButton = page.getByRole('button', { name: '生成解释边注' })
  await expect(generateButton).toHaveAttribute('aria-disabled', 'true')
  await page.getByRole('checkbox', { name: '同意本次 AI 计划解释数据处理' }).click()
  await expect(generateButton).toHaveAttribute('aria-disabled', 'false')

  const explanationPromise = page.waitForResponse(
    (response) => response.url().endsWith('/explanation') && response.request().method() === 'POST',
  )
  await generateButton.click()
  expect((await explanationPromise).status()).toBe(201)
  await expect(page.getByText('本地演示解释')).toBeVisible()
  await expect(page.getByText('这周先把节奏做稳')).toBeVisible()
  await expect(page.getByText('可用时间', { exact: true })).toBeVisible()
  await expect(page.getByText(/PLAN V1 · PLAN-EXPLANATION-V1/)).toBeVisible()
  await expect(page.getByText(/没有被 AI 自动修改/)).toBeVisible()
  await page.locator('.ai-margin-card').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'output/playwright/iteration-009-ai-mobile.png' })

  await page.getByRole('button', { name: '高脚杯深蹲' }).click()
  await page.getByRole('button', { name: '保存替代动作' }).click()
  await expect(page.getByText('计划版本已变化，旧边注不会继续显示为当前解释。')).toBeVisible()
  await expect(page.getByText('这周先把节奏做稳')).not.toBeVisible()
  expect(errors).toEqual([])
})

test('AI margin note remains a secondary evidence layer at wide viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 })
  const errors = collectBrowserErrors(page)
  await seedProfileAndOpenPlans(page)
  await page.getByRole('button', { name: /生成 .* 初稿/ }).click()
  await page.getByRole('checkbox', { name: '同意本次 AI 计划解释数据处理' }).click()
  await page.getByRole('button', { name: '生成解释边注' }).click()
  await expect(page.getByText('本地演示解释')).toBeVisible()
  await page.locator('.ai-margin-card').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'output/playwright/iteration-009-ai-wide.png' })
  expect(errors).toEqual([])
})

test('plan generation visibly fails closed for professional-clearance risk', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const errors = collectBrowserErrors(
    page,
    (response) =>
      response.status() === 422 &&
      response.url().endsWith('/v1/plans/weekly') &&
      response.request().method() === 'POST',
  )
  await seedProfileAndOpenPlans(page, ['chest_pain'])
  await page.getByRole('button', { name: /生成 .* 初稿/ }).click()
  await expect(page.getByText(/当前风险回答需要先取得专业许可/)).toBeVisible()
  await expect(page.getByText('先生成一份可审核的初稿')).toBeVisible()
  expect(errors).toEqual([])
})
