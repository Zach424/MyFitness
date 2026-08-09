import { randomUUID } from 'node:crypto'

import { expect, test, type Page, type Response } from '@playwright/test'
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
  beforeOpen?: () => Promise<void>,
) => {
  const sessionPromise = page.waitForResponse((response) =>
    response.url().endsWith('/v1/auth/dev/session'),
  )
  await page.goto('/')
  const session = await sessionPromise
  expect(session.status()).toBe(200)
  const { accessToken } = (await session.json()) as { accessToken: string }
  const profile = await page.request.put(`${apiUrl}/me/onboarding`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: onboarding(riskFlags, availableDays),
  })
  expect(profile.status()).toBe(200)
  await beforeOpen?.()
  await page.getByRole('button', { name: '计划' }).click()
  await expect(page.getByText('这一周，先留出余地')).toBeVisible()
  return accessToken
}

test('weekly plan supports substitution, modification and acceptance history', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const errors = collectBrowserErrors(
    page,
    (response) =>
      response.status() === 503 &&
      (response.url().includes('/history?') || response.url().includes('/outcome')),
  )
  const accessToken = await seedProfileAndOpenPlans(page)

  const generatedPromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/plans/weekly') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: /生成 .* 初稿/ }).click()
  expect((await generatedPromise).status()).toBe(201)
  await expect(page.getByText('本周折页')).toBeVisible()
  await expect(page.getByText(/EXPLANATION RUNS 0 · ACCEPTED SNAPSHOT/)).toBeVisible()
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
  const outcomeReview = page.locator('.outcome-review-card')
  await expect(outcomeReview.getByText('采用后回看')).toBeVisible()
  await expect(outcomeReview.getByText('Unknown', { exact: true })).toBeVisible()
  await expect(outcomeReview).toContainText('高脚杯深蹲')
  await expect(outcomeReview).toContainText('不能证明因果或计划效果')
  await outcomeReview.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: 'output/playwright/iteration-103-plan-outcome-unknown-mobile.png',
  })
  await page.locator('.plans-scroll').evaluate((element) => element.scrollTo({ top: 0 }))
  await page.screenshot({
    path: 'output/playwright/iteration-008-plans-mobile.png',
  })

  const withdrawnRecovery = await page.request.post(`${apiUrl}/health-records`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-idempotency-key': `record-${crypto.randomUUID()}`,
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
  expect(withdrawnRecovery.status()).toBe(201)
  const withdrawnRecoveryBody = (await withdrawnRecovery.json()) as {
    id: string
    revision: number
  }
  const deletedRecovery = await page.request.delete(
    `${apiUrl}/health-records/${withdrawnRecoveryBody.id}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-expected-revision': String(withdrawnRecoveryBody.revision),
      },
    },
  )
  expect(deletedRecovery.status()).toBe(204)

  for (let expectedRevision = acceptedPlan.revision; expectedRevision < 11; expectedRevision += 1) {
    const decision = await page.request.put(`${apiUrl}/plans/weekly/${acceptedPlan.id}/decision`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { decision: 'accepted', expectedRevision, selections: [] },
    })
    expect(decision.status()).toBe(200)
  }

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.reload()
  await expect(page.getByText('v11', { exact: true }).first()).toBeVisible()
  const historyCard = page.locator('.history-card')
  await historyCard.scrollIntoViewIfNeeded()
  await expect(historyCard.locator('.plan-history')).toHaveCount(10)
  let olderReads = 0
  let explanationWrites = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/ai-explanations')) {
      explanationWrites += 1
    }
  })
  await page.route(/\/history\?limit=10&cursor=/, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }
    olderReads += 1
    if (olderReads === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'raw plan history outage must stay hidden' }),
      })
      return
    }
    await route.continue()
  })
  await page.getByRole('button', { name: '继续载入更早决定' }).click()
  const historyReadState = historyCard.locator('.aggregate-history-read-state')
  await expect(historyReadState.getByText('SERVICE PAUSED / 服务暂不可用')).toBeVisible()
  await expect(historyReadState).toContainText('RETAINED 10 REVISIONS · CURSOR FROZEN')
  await expect(historyReadState).not.toContainText('raw plan history outage')
  await expect(historyCard.locator('.plan-history')).toHaveCount(10)
  await expect(page.getByRole('button', { name: '继续载入更早决定' })).toBeDisabled()
  await expect(page.getByText(/EXPLANATION RUNS 0 · ACCEPTED SNAPSHOT/)).toBeVisible()
  const retry = historyCard.getByRole('button', { name: '重试载入计划决定更早版本' })
  await expect(retry).toBeFocused()
  await page.screenshot({ path: 'output/playwright/iteration-075-plan-history-stale-wide.png' })

  await retry.click()
  await expect(historyReadState).toHaveCount(0)
  await expect(historyCard.locator('.plan-history')).toHaveCount(11)
  await expect(page.getByText('已载入全部决定版本')).toBeVisible()
  expect(olderReads).toBe(2)
  expect(explanationWrites).toBe(0)

  let historicalOutcomeReads = 0
  await page.route(/\/history\/3\/outcome$/, async (route) => {
    historicalOutcomeReads += 1
    if (historicalOutcomeReads === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'raw historical outcome outage must stay hidden' }),
      })
      return
    }
    await route.continue()
  })
  const historicalV3 = historyCard
    .locator('.plan-history')
    .filter({ hasText: '采用计划' })
    .filter({ hasText: 'v3' })
  await historicalV3.getByRole('button', { name: '查看 v3 采用后回看' }).click()
  await expect(historicalV3.getByText('回看尚未确认')).toBeVisible()
  await expect(historicalV3).not.toContainText('raw historical outcome outage')
  const outcomeRetry = historicalV3.getByRole('button', { name: '重试核对 v3' })
  await expect(outcomeRetry).toBeFocused()
  await outcomeRetry.click()
  await expect(historicalV3.getByText('历史采用 v3')).toBeVisible()
  await expect(historicalV3.getByText('Unknown', { exact: true })).toBeVisible()
  await expect(historicalV3).toContainText('高脚杯深蹲')
  await expect(historicalV3).toContainText('1 条已删除恢复记录')
  await expect(historicalV3).toContainText('撤销项不再算证据')
  await expect(historicalV3).toContainText('不能证明因果或计划效果')
  await page.setViewportSize({ width: 390, height: 844 })
  await historicalV3.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: 'output/playwright/iteration-104-historical-plan-outcome-mobile.png',
  })
  expect(historicalOutcomeReads).toBe(2)
  expect(errors).toEqual([])
})

test('lost generation response reconciles the current week without a second write', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const errors = collectBrowserErrors(page)
  await seedProfileAndOpenPlans(page)
  let generationWrites = 0
  page.on('request', (request) => {
    if (request.url().endsWith('/v1/plans/weekly') && request.method() === 'POST') {
      generationWrites += 1
    }
  })
  await page.route(
    '**/v1/plans/weekly',
    async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }
      const response = await route.fetch()
      expect(response.status()).toBe(201)
      await route.abort('failed')
    },
    { times: 1 },
  )

  await page.getByRole('button', { name: /生成 .* 初稿/ }).click()
  const recovery = page.getByRole('alert')
  await expect(recovery).toContainText('RECONCILE FIRST')
  await expect(recovery).toContainText('核对前不会重放操作')
  await expect(page.getByRole('button', { name: /生成 .* 初稿/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await page.locator('.plans-scroll').evaluate((element) => element.scrollTo({ top: 0 }))
  await page.screenshot({
    path: 'output/playwright/iteration-058-plan-generate-reconciliation-mobile.png',
  })

  await page.getByRole('button', { name: '核对服务端状态' }).click()
  await expect(page.getByText('本周折页')).toBeVisible()
  await expect(page.getByText(/核对完成：服务端已有 v1 周计划/)).toBeVisible()
  await expect(page.getByText('v1', { exact: true }).first()).toBeVisible()
  expect(generationWrites).toBe(1)
  expect(errors.filter((error) => !error.includes('net::ERR_FAILED'))).toEqual([])
})

test('lost plan decisions preserve substitutions and reconcile exact next revisions', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const errors = collectBrowserErrors(page)
  await seedProfileAndOpenPlans(page)
  await page.getByRole('button', { name: /生成 .* 初稿/ }).click()
  await expect(page.getByText('本周折页')).toBeVisible()
  let decisionWrites = 0
  page.on('request', (request) => {
    if (request.url().endsWith('/decision') && request.method() === 'PUT') decisionWrites += 1
  })
  await page.getByRole('button', { name: '高脚杯深蹲' }).click()
  await page.route(
    '**/v1/plans/weekly/*/decision',
    async (route) => {
      const response = await route.fetch()
      expect(response.status()).toBe(200)
      await route.abort('failed')
    },
    { times: 1 },
  )

  await page.getByRole('button', { name: '保存替代动作' }).click()
  let recovery = page.getByRole('alert')
  await expect(recovery).toContainText('RECONCILE FIRST')
  await expect(recovery).toContainText('当前替代动作选择仍留在本页')
  await expect(page.getByText('1 项替代动作尚未保存')).toBeVisible()
  await page.locator('.plans-scroll').evaluate((element) => element.scrollTo({ top: 0 }))
  await page.screenshot({
    path: 'output/playwright/iteration-058-plan-modify-reconciliation-mobile.png',
  })

  await page.getByRole('button', { name: '核对服务端状态' }).click()
  await expect(page.getByText(/服务端 v2 已记录替代动作/)).toBeVisible()
  await expect(page.getByText('已调整', { exact: true })).toBeVisible()
  await expect(page.getByText('v2', { exact: true }).first()).toBeVisible()
  expect(decisionWrites).toBe(1)

  await page.route(
    '**/v1/plans/weekly/*/decision',
    async (route) => {
      const response = await route.fetch()
      expect(response.status()).toBe(200)
      await route.abort('failed')
    },
    { times: 1 },
  )
  await page.getByRole('button', { name: '本周暂不采用' }).click()
  recovery = page.getByRole('alert')
  await expect(recovery).toContainText('RECONCILE FIRST')
  await expect(page.getByRole('button', { name: '本周暂不采用' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await page.locator('.plans-scroll').evaluate((element) => element.scrollTo({ top: 0 }))
  await page.screenshot({
    path: 'output/playwright/iteration-058-plan-skip-reconciliation-mobile.png',
  })

  await page.getByRole('button', { name: '核对服务端状态' }).click()
  await expect(page.getByText(/服务端 v3 已记录本周跳过决定/)).toBeVisible()
  await expect(page.getByText('本周跳过', { exact: true })).toBeVisible()
  await expect(page.getByText('v3', { exact: true }).first()).toBeVisible()
  expect(decisionWrites).toBe(2)
  expect(errors.filter((error) => !error.includes('net::ERR_FAILED'))).toEqual([])
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

test('lost AI explanation response reads the exact durable run without a second model call', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const errors = collectBrowserErrors(page)
  await seedProfileAndOpenPlans(page)
  await page.getByRole('button', { name: /生成 .* 初稿/ }).click()
  await expect(page.getByText('计划边注')).toBeVisible()

  let explanationWrites = 0
  let exactStatusReads = 0
  page.on('request', (request) => {
    if (request.url().endsWith('/explanation') && request.method() === 'POST') {
      explanationWrites += 1
    }
    if (request.url().endsWith('/explanation-request') && request.method() === 'GET') {
      exactStatusReads += 1
    }
  })
  await page.route(
    '**/v1/plans/weekly/*/explanation',
    async (route) => {
      const response = await route.fetch()
      expect(response.status()).toBe(201)
      await route.abort('failed')
    },
    { times: 1 },
  )

  await page.getByRole('checkbox', { name: '同意本次 AI 计划解释数据处理' }).click()
  await page.getByRole('button', { name: '生成解释边注' }).click()
  const recovery = page.locator('.ai-run-recovery')
  await expect(recovery).toContainText('ORIGINAL REQUEST → STATUS')
  await expect(recovery).toContainText('只读取刚才那次运行')
  await expect(recovery).toContainText('保留目标：计划 v1')
  await expect(page.getByText(/本次授权已经绑定到上方原请求/)).toBeVisible()
  await expect(page.getByRole('button', { name: '生成解释边注' })).not.toBeVisible()
  await recovery.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: 'output/playwright/iteration-060-ai-explanation-reconciliation-mobile.png',
  })

  await page.getByRole('button', { name: '核对服务端状态' }).click()
  await expect(page.getByText(/原请求已生成计划 v1 的边注/)).toBeVisible()
  await expect(page.getByText('本地演示解释')).toBeVisible()
  await expect(page.getByText('这周先把节奏做稳')).toBeVisible()
  expect(explanationWrites).toBe(1)
  expect(exactStatusReads).toBe(1)
  expect(errors.filter((error) => !error.includes('net::ERR_FAILED'))).toEqual([])
})

test('AI explanation ledger keeps current and historical plan revisions distinct', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const errors = collectBrowserErrors(page)
  await seedProfileAndOpenPlans(page)
  await page.getByRole('button', { name: /生成 .* 初稿/ }).click()

  await page.getByRole('checkbox', { name: '同意本次 AI 计划解释数据处理' }).click()
  await page.getByRole('button', { name: '生成解释边注' }).click()
  await expect(page.getByText('本地演示解释')).toBeVisible()

  await page.getByRole('button', { name: '高脚杯深蹲' }).click()
  await page.getByRole('button', { name: '保存替代动作' }).click()
  await expect(page.getByText('v2', { exact: true }).first()).toBeVisible()
  await page.getByRole('checkbox', { name: '同意本次 AI 计划解释数据处理' }).click()
  await page.getByRole('button', { name: '生成解释边注' }).click()
  await expect(page.getByRole('button', { name: /查看解释运行档案，共 2 条/ })).toBeVisible()

  await page.getByRole('button', { name: /查看解释运行档案，共 2 条/ }).click()
  await expect(page).toHaveURL(/#\/pages\/ai-explanations\/index\?planId=/)
  const ledger = page.getByRole('list', { name: 'AI 解释运行档案' })
  await expect(ledger.getByRole('listitem')).toHaveCount(2)
  await expect(ledger.getByText('CURRENT / 当前可用')).toBeVisible()
  await expect(ledger.getByText('HISTORY / 历史版本')).toBeVisible()
  await expect(ledger.getByText('PLAN V2')).toBeVisible()
  await expect(ledger.getByText('PLAN V1')).toBeVisible()
  await expect(ledger.getByText('本地演示解释')).toHaveCount(2)
  await expect(ledger.getByText('plan-explanation-v1')).toHaveCount(2)
  await expect(ledger.getByText('plan-explanation-safety-v2')).toHaveCount(2)
  await expect(ledger.getByText('运行完成，未记录失败或安全回退代码')).toHaveCount(2)

  const historicalToggle = page.getByRole('button', { name: '查看计划 v1 历史边注' })
  await historicalToggle.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: '收起计划 v1 历史边注' })).toBeVisible()
  await expect(page.getByText(/这条边注属于计划 v1，不会作为当前 v2 的解释/)).toBeVisible()
  await expect(page.getByText(/没有被 AI 自动修改/).last()).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-061-ai-ledger-mobile.png',
    fullPage: true,
  })
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
  await page.getByRole('button', { name: /查看解释运行档案，共 1 条/ }).click()
  await expect(page.getByText('CURRENT / 当前可用')).toBeVisible()
  await expect(page.getByText('plan-explanation-safety-v2')).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-061-ai-ledger-wide.png',
    fullPage: true,
  })
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

  const record = await page.request.post(`${apiUrl}/health-records`, {
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
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByText('v1', { exact: true }).first()).toBeVisible()

  const now = Date.now()
  const calibratedRecords = [
    ...Array.from({ length: 7 }, (_, dayIndex) =>
      (
        [
          ['recovery.energy', 3],
          ['recovery.sleep_quality', 3],
          ['recovery.stress', 3],
        ] as const
      ).map(([metric, value]) => ({
        metric,
        value,
        occurredAt: new Date(now - (dayIndex + 8) * 86_400_000).toISOString(),
      })),
    ).flat(),
    ...Array.from({ length: 3 }, (_, dayIndex) =>
      (
        [
          ['recovery.energy', 5],
          ['recovery.sleep_quality', 5],
          ['recovery.stress', 1],
        ] as const
      ).map(([metric, value]) => ({
        metric,
        value,
        occurredAt: new Date(now - dayIndex * 86_400_000).toISOString(),
      })),
    ).flat(),
  ]
  const responses = await Promise.all(
    calibratedRecords.map(({ metric, value, occurredAt }) =>
      page.request.post(`${apiUrl}/health-records`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'x-idempotency-key': `plan-evidence-${randomUUID()}`,
        },
        data: {
          metric,
          value,
          unit: 'score_1_5',
          source: { kind: 'manual' },
          status: 'confirmed',
          occurredAt,
          timezone: 'Asia/Shanghai',
        },
      }),
    ),
  )
  expect(responses.every((response) => response.status() === 201)).toBe(true)

  await page.getByRole('button', { name: '检查版本' }).click()
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('EVIDENCE SHIFT')
  await expect(alert).toContainText('中等置信恢复估计改变了计划依据')
  await expect(alert).toContainText('不是身体事实或医学判断')
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

  const actualWorkoutAt = new Date().toISOString()

  const workout = await page.request.post(`${apiUrl}/workouts`, {
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
      startedAt: actualWorkoutAt,
      endedAt: actualWorkoutAt,
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
  const observedReview = page.locator('.outcome-review-card')
  await expect(observedReview.getByText('已有后续记录', { exact: true })).toBeVisible()
  await expect(observedReview).toContainText('1 条明确训练关联')
  await expect(observedReview).toContainText('PLAN v2 ↔ WORKOUT v1')
  await expect(observedReview).toContainText('不能证明因果或计划效果')
  await observedReview.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: 'output/playwright/iteration-103-plan-outcome-observed-mobile.png',
  })
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

test('lost plan-link responses reconcile one exact active relationship without replay', async ({
  page,
}) => {
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
  const workout = await page.request.post(`${apiUrl}/workouts`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-idempotency-key': `plan-link-recovery-${randomUUID()}`,
    },
    data: {
      title: '响应丢失关联训练',
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
  const workoutChoice = page.getByRole('button', { name: /响应丢失关联训练.*全部完成.*v1/ })
  await expect(workoutChoice).toBeVisible()

  let linkWrites = 0
  let unlinkWrites = 0
  page.on('request', (request) => {
    if (request.url().endsWith('/session-links') && request.method() === 'POST') linkWrites += 1
    if (request.url().includes('/session-links/') && request.method() === 'DELETE') {
      unlinkWrites += 1
    }
  })
  await page.route(
    '**/v1/plans/weekly/*/session-links',
    async (route) => {
      const response = await route.fetch()
      expect(response.status()).toBe(201)
      await route.abort('failed')
    },
    { times: 1 },
  )
  await workoutChoice.click()
  let recovery = page.getByRole('alert')
  await expect(recovery).toContainText('RECONCILE FIRST')
  await expect(recovery).toContainText('响应丢失关联训练')
  await expect(recovery).toContainText('计划 v2')
  await expect(workoutChoice).toHaveAttribute('aria-disabled', 'true')
  await page.locator('.plans-scroll').evaluate((element) => element.scrollTo({ top: 0 }))
  await page.screenshot({
    path: 'output/playwright/iteration-059-plan-link-reconciliation-mobile.png',
  })

  await page.getByRole('button', { name: '核对服务端状态' }).click()
  await expect(page.getByText(/已与 .* 的计划 v2 精确关联/)).toBeVisible()
  await expect(
    page.getByText('这是你的明确选择，不是根据标题、日期或时长推测的完成情况。'),
  ).toBeVisible()
  expect(linkWrites).toBe(1)

  await page.route(
    '**/v1/plans/weekly/*/session-links/*',
    async (route) => {
      const response = await route.fetch()
      expect(response.status()).toBe(200)
      await route.abort('failed')
    },
    { times: 1 },
  )
  await page.getByRole('button', { name: '解除关联' }).click()
  recovery = page.getByRole('alert')
  await expect(recovery).toContainText('RECONCILE FIRST')
  await expect(recovery).toContainText(/解除 .*响应丢失关联训练 的活动关联/)
  await page.locator('.plans-scroll').evaluate((element) => element.scrollTo({ top: 0 }))
  await page.screenshot({
    path: 'output/playwright/iteration-059-plan-unlink-reconciliation-mobile.png',
  })

  await page.getByRole('button', { name: '核对服务端状态' }).click()
  await expect(page.getByText(/目标关联已不再活动/)).toBeVisible()
  await expect(page.getByText(/不能证明具体关闭原因/)).toBeVisible()
  await expect(page.getByText('系统不会预选或自动匹配。')).toBeVisible()
  expect(unlinkWrites).toBe(1)
  expect(errors.filter((error) => !error.includes('net::ERR_FAILED'))).toEqual([])
})

test('initial offline plan read stays unknown until an explicit mobile retry succeeds', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const errors = collectBrowserErrors(page)
  await seedProfileAndOpenPlans(page, [], undefined, async () => {
    await page.route(
      '**/v1/plans/weekly',
      async (route) => {
        expect(route.request().method()).toBe('GET')
        await route.abort('internetdisconnected')
      },
      { times: 1 },
    )
  })
  await expect(page.getByText('OFFLINE / 连接未完成')).toBeVisible()
  await expect(page.getByText('还没有读取到本周计划')).toBeVisible()
  await expect(page.getByText('NO WEEK YET')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '重新读取周计划与版本历史' })).toBeFocused()
  await expect
    .poll(() =>
      page.locator('.plans-page').evaluate((element) => element.getBoundingClientRect().left),
    )
    .toBe(0)
  await page.screenshot({
    path: 'output/playwright/iteration-063-plan-initial-offline-mobile.png',
  })

  await page.keyboard.press('Enter')
  await expect(page.getByText('NO WEEK YET')).toBeVisible()
  await expect(page.getByRole('button', { name: /生成 .* 初稿/ })).toBeEnabled()
  expect(errors.filter((error) => !error.includes('net::ERR_INTERNET_DISCONNECTED'))).toEqual([])
})

test('failed plan refresh retains one wide revision while freezing writes and AI', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const errors = collectBrowserErrors(
    page,
    (response) => response.status() === 429 && response.url().endsWith('/v1/plans/weekly'),
  )
  await seedProfileAndOpenPlans(page)
  const generation = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/plans/weekly') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: /生成 .* 初稿/ }).click()
  expect((await generation).status()).toBe(201)
  await expect(page.getByText('v1', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('生成初稿', { exact: true }).last()).toBeVisible()

  await page.route(
    '**/v1/plans/weekly',
    async (route) => {
      expect(route.request().method()).toBe('GET')
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'rate_limited', message: 'retry later' } }),
      })
    },
    { times: 1 },
  )
  await page.getByRole('button', { name: '检查版本' }).click()

  await expect(page.getByText('READ REFUSED / 读取被拒绝')).toBeVisible()
  await expect(page.getByText('RETAINED PLAN v1 · 1 HISTORY ROWS')).toBeVisible()
  await expect(page.getByText('v1', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: '高脚杯深蹲' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await expect(page.getByRole('button', { name: '采用这份计划' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await expect(page.getByRole('button', { name: '本周暂不采用' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await expect(
    page.getByRole('checkbox', { name: '同意本次 AI 计划解释数据处理' }),
  ).toHaveAttribute('aria-disabled', 'true')
  const retry = page.getByRole('button', { name: '重新读取周计划与版本历史' })
  await expect(retry).toBeFocused()
  await page.screenshot({ path: 'output/playwright/iteration-063-plan-stale-wide.png' })

  await page.keyboard.press('Enter')
  await expect(page.getByText('READ REFUSED / 读取被拒绝')).toHaveCount(0)
  await expect(page.getByText('v1', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('生成初稿', { exact: true }).last()).toBeVisible()
  await expect(page.getByRole('button', { name: '采用这份计划' })).toBeEnabled()
  expect(errors).toEqual([])
})
