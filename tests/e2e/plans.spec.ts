import { randomUUID } from 'node:crypto'

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
    errors.push(
      `Request failed: ${request.method()} ${request.url()} (${request.failure()?.errorText ?? 'unknown'})`,
    ),
  )
  page.on('response', (response) => {
    if (response.status() < 400 || allowedResponse?.(response)) return
    errors.push(`HTTP ${response.status()}: ${response.request().method()} ${response.url()}`)
  })
  return errors
}

const onboarding = (riskFlags: string[] = [], availableDays: string[] = ['tue', 'thu', 'sat']) => ({
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
    availableDays,
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

const seedProfileAndOpenPlans = async (
  page: Page,
  riskFlags: string[] = [],
  availableDays?: string[],
) => {
  const sessionPromise = page.waitForResponse((response) =>
    response.url().endsWith('/v1/auth/dev/session'),
  )
  await page.goto('/')
  const session = await sessionPromise
  expect(session.status()).toBe(200)
  const { accessToken } = (await session.json()) as { accessToken: string }
  const profile = await page.request.put('http://127.0.0.1:3100/v1/me/onboarding', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: onboarding(riskFlags, availableDays),
  })
  expect(profile.status()).toBe(200)
  await page.getByRole('button', { name: '计划' }).click()
  await expect(page.getByText('这一周，先留出余地')).toBeVisible()
  return accessToken
}

test('weekly plan supports substitution, modification and acceptance history', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const errors = collectBrowserErrors(page)
  const accessToken = await seedProfileAndOpenPlans(page)

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
  const acceptedResponse = await acceptedPromise
  expect(acceptedResponse.status()).toBe(200)
  const acceptedPlan = (await acceptedResponse.json()) as { id: string; revision: number }
  await expect(page.getByText('已采用', { exact: true })).toBeVisible()
  await expect(page.getByText('v3', { exact: true }).first()).toBeVisible()
  await page.locator('.plans-scroll').evaluate((element) => element.scrollTo({ top: 0 }))
  await page.screenshot({
    path: 'output/playwright/iteration-008-plans-mobile.png',
  })

  for (let expectedRevision = acceptedPlan.revision; expectedRevision < 11; expectedRevision += 1) {
    const decision = await page.request.put(
      `http://127.0.0.1:3100/v1/plans/weekly/${acceptedPlan.id}/decision`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { decision: 'accepted', expectedRevision, selections: [] },
      },
    )
    expect(decision.status()).toBe(200)
  }

  await page.reload()
  await expect(page.getByText('v11', { exact: true }).first()).toBeVisible()
  const historyCard = page.locator('.history-card')
  await historyCard.scrollIntoViewIfNeeded()
  await expect(historyCard.locator('.plan-history')).toHaveCount(10)
  const olderHistoryPromise = page.waitForResponse(
    (response) =>
      response.url().includes(`/v1/plans/weekly/${acceptedPlan.id}/history?`) &&
      response.url().includes('cursor=') &&
      response.request().method() === 'GET',
  )
  await page.getByRole('button', { name: '继续载入更早决定' }).click()
  expect((await olderHistoryPromise).status()).toBe(200)
  await expect(historyCard.locator('.plan-history')).toHaveCount(11)
  await expect(page.getByText('已载入全部决定版本')).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-049-progressive-plan-revisions-mobile.png',
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

test('material recovery evidence freezes the old fold and regenerates it safely', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const errors = collectBrowserErrors(page)
  const accessToken = await seedProfileAndOpenPlans(page)
  await page.getByRole('button', { name: /生成 .* 初稿/ }).click()
  await expect(page.getByText('本周折页')).toBeVisible()

  const record = await page.request.post('http://127.0.0.1:3100/v1/health-records', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-idempotency-key': `plan-evidence-${randomUUID()}`,
    },
    data: {
      metric: 'recovery.energy',
      value: 5,
      unit: 'score_1_5',
      source: { kind: 'manual' },
      status: 'confirmed',
      occurredAt: new Date().toISOString(),
      timezone: 'Asia/Shanghai',
    },
  })
  expect(record.status()).toBe(201)

  await page.getByRole('button', { name: '检查版本' }).click()
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('EVIDENCE SHIFT')
  await expect(alert).toContainText('新的恢复记录改变了本周安排边界')
  await expect(alert).toContainText('不是医学判断')
  await expect(page.getByRole('button', { name: '高脚杯深蹲' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await expect(page.getByRole('button', { name: '采用这份计划' })).toHaveAttribute('disabled', '')
  await expect(page.getByRole('button', { name: '本周暂不采用' })).toHaveAttribute(
    'disabled',
    'false',
  )
  await alert.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'output/playwright/iteration-035-evidence-shift-mobile.png' })

  const regeneration = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/plans/weekly') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '按最新记录重排本周' }).click()
  expect((await regeneration).status()).toBe(201)
  await expect(alert).not.toBeVisible()
  await expect(page.getByText('v2', { exact: true }).first()).toBeVisible()
  await expect(page.locator('.evidence-strip__value').filter({ hasText: '100' })).toBeVisible()
  expect(errors).toEqual([])
})

test('user explicitly reconciles a planned session with one actual workout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const errors = collectBrowserErrors(page)
  const todayWeekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'Asia/Shanghai',
  })
    .format(new Date())
    .toLowerCase()
  const accessToken = await seedProfileAndOpenPlans(page, [], [todayWeekday])
  const generation = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/plans/weekly') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: /生成 .* 初稿/ }).click()
  const generated = (await (await generation).json()) as {
    days: Array<{ date: string; session: unknown }>
  }
  const sessionDate = generated.days.find((day) => day.session)?.date
  expect(sessionDate).toBeTruthy()
  await page.getByRole('button', { name: '采用这份计划' }).click()
  await expect(page.getByText('已采用', { exact: true })).toBeVisible()

  const localMidnight = Date.parse(`${sessionDate}T00:00:00+08:00`)
  const actualWorkoutEnd = Math.min(localMidnight + 30 * 60_000, Date.now() - 1_000)
  const actualWorkoutStart = Math.max(localMidnight, actualWorkoutEnd - 30 * 60_000)

  const workout = await page.request.post('http://127.0.0.1:3100/v1/workouts', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-idempotency-key': `plan-link-workout-${randomUUID()}`,
    },
    data: {
      title: '显式关联训练',
      source: { kind: 'manual' },
      exercises: [
        {
          position: 1,
          exerciseKey: 'goblet_squat',
          name: '高脚杯深蹲',
          category: 'strength',
          sets: [{ position: 1, kind: 'working', reps: 8, completed: true }],
        },
      ],
      startedAt: new Date(actualWorkoutStart).toISOString(),
      endedAt: new Date(actualWorkoutEnd).toISOString(),
      timezone: 'Asia/Shanghai',
      painLevel: 0,
      fatigue: 2,
    },
  })
  expect(workout.status()).toBe(201)

  await page.getByRole('button', { name: '检查版本' }).click()
  await expect(page.getByText('系统不会预选或自动匹配。')).toBeVisible()
  const linkResponse = page.waitForResponse(
    (response) => response.url().endsWith('/session-links') && response.status() === 201,
  )
  await page.getByRole('button', { name: /显式关联训练.*全部完成.*v1/ }).click()
  expect((await linkResponse).status()).toBe(201)
  await expect(
    page.getByText('这是你的明确选择，不是根据标题、日期或时长推测的完成情况。'),
  ).toBeVisible()
  await expect(page.locator('.week-fold__day--recorded')).toHaveCount(1)
  await page.locator('.session-link-card').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'output/playwright/iteration-036-plan-link-mobile.png' })

  await page.getByRole('button', { name: '返回今日' }).click()
  await expect(page.getByText('实际：显式关联训练')).toBeVisible()
  await expect(page.getByText('已记录', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '查看关联' }).click()
  await expect(page.locator('.session-link-card__workout')).toHaveText('显式关联训练')

  const unlinkResponse = page.waitForResponse(
    (response) => response.url().includes('/session-links/') && response.status() === 200,
  )
  await page.getByRole('button', { name: '解除关联' }).click()
  expect((await unlinkResponse).status()).toBe(200)
  await expect(page.getByText('系统不会预选或自动匹配。')).toBeVisible()
  expect(errors).toEqual([])
})
