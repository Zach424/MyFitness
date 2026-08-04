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
  await page.locator('[aria-label="开始时间使用的 IANA 时区"] input').fill('Asia/Shanghai')
  await page.locator('[aria-label="开始时间，年-月-日 时:分"] input').fill('2026-07-18 18:00')
  await page.locator('[aria-label="结束时间，年-月-日 时:分"] input').fill('2026-07-18 18:45')

  const firstCreatePromise = page.waitForResponse(
    (response) => response.url().endsWith('/v1/workouts') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '保存训练', exact: true }).click()
  const firstCreate = await firstCreatePromise
  expect(firstCreate.status()).toBe(201)
  expect(firstCreate.request().postDataJSON()).toMatchObject({
    startedAt: '2026-07-18T10:00:00.000Z',
    endedAt: '2026-07-18T10:45:00.000Z',
    timezone: 'Asia/Shanghai',
  })
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

test('workout editor restores then explicitly discards its local draft', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors = collectBrowserErrors(page)
  await openWorkouts(page)

  const title = page.locator('.session-title-input input')
  await title.fill('未完成的力量训练')
  await expect(page.getByText('未完成内容已暂存')).toBeVisible()
  await page.reload()
  await expect(page.getByText('发现一份未完成记录')).toBeVisible()
  await page.getByRole('button', { name: '恢复草稿' }).click()
  await expect(title).toHaveValue('未完成的力量训练')
  await page.getByRole('button', { name: '清除草稿' }).click()
  await expect(title).toHaveValue('全身训练 A')
  expect(
    await page.evaluate(() => localStorage.getItem('myfitness.local-draft.workout')),
  ).toBeNull()
  expect(browserErrors).toEqual([])
})

test('workout correction draft restores the exact revision and clears on cancel', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors = collectBrowserErrors(page)
  await openWorkouts(page)

  await page.getByRole('button', { name: '保存训练', exact: true }).click()
  await expect(page.locator('.workout-entry')).toHaveCount(1)
  await page.locator('.workout-entry').first().getByRole('button', { name: '修改' }).click()
  const title = page.locator('.session-title-input input')
  await title.fill('未保存的恢复训练')
  await expect(page.getByText('未保存修改已暂存')).toBeVisible()

  await page.reload()
  await expect(page.getByText('发现一份未完成修改')).toBeVisible()
  await page.getByRole('button', { name: '恢复修改' }).click()
  await expect(page.getByText(/已恢复基于 R1 的训练修改/)).toBeVisible()
  await expect(title).toHaveValue('未保存的恢复训练')
  await page.getByRole('button', { name: '取消修改' }).click()
  await expect(title).toHaveValue('全身训练 A')
  expect(
    await page.evaluate(() => localStorage.getItem('myfitness.local-draft.workout')),
  ).toBeNull()
  expect(browserErrors).toEqual([])
})

test('exercise observation uses completed sets and refreshes corrected evidence', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors = collectBrowserErrors(page)

  await openWorkouts(page)
  await page.getByRole('button', { name: '高脚杯深蹲第2组已完成' }).click()
  await page.locator('[aria-label="高脚杯深蹲第2组负重"] input').fill('99')

  const createWorkout = page.waitForResponse(
    (response) => response.url().endsWith('/v1/workouts') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '保存训练', exact: true }).click()
  expect((await createWorkout).status()).toBe(201)
  const initialInsightPromise = page.waitForResponse(
    (response) =>
      response.url().includes('/v1/insights/exercises/goblet_squat') &&
      response.request().method() === 'GET',
  )
  await page.getByRole('button', { name: '查看高脚杯深蹲趋势' }).click()
  const initialInsight = await initialInsightPromise
  expect(initialInsight.status()).toBe(200)

  const observation = page.getByLabel('单动作历史与趋势')
  await expect(observation.getByRole('button', { name: '高脚杯深蹲' })).toBeVisible()
  await expect(observation.getByText('有完成组的训练')).toBeVisible()
  await expect(observation.getByText('2', { exact: true })).toBeVisible()
  await expect(observation.getByText('240', { exact: true })).toBeVisible()
  await expect(observation.getByText(/完成 2\/3 组 · 次数 20 · 训练量 240 kg/)).toBeVisible()

  await page.getByRole('button', { name: '返回训练记录' }).click()
  await page.locator('.workout-entry').first().getByRole('button', { name: '修改' }).click()
  await page.locator('[aria-label="高脚杯深蹲第1组负重"] input').fill('15')
  const correctedWorkout = page.waitForResponse(
    (response) =>
      /\/v1\/workouts\/[0-9a-f-]{36}$/.test(response.url()) &&
      response.request().method() === 'PUT',
  )
  await page.getByRole('button', { name: '保存训练新版本' }).click()
  expect((await correctedWorkout).status()).toBe(200)
  const correctedInsightPromise = page.waitForResponse(
    (response) =>
      response.url().includes('/v1/insights/exercises/goblet_squat') &&
      response.request().method() === 'GET',
  )
  await page.getByRole('button', { name: '查看高脚杯深蹲趋势' }).click()
  const correctedInsight = await correctedInsightPromise
  expect(correctedInsight.status()).toBe(200)
  await expect(observation.getByText('270', { exact: true })).toBeVisible()
  await expect(observation.getByText(/训练 v2/)).toBeVisible()
  await expect(observation.getByText(/完成 2\/3 组 · 次数 20 · 训练量 270 kg/)).toBeVisible()

  await observation.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: 'output/playwright/iteration-038-exercise-trend-mobile.png',
    fullPage: true,
  })
  expect(browserErrors).toEqual([])
})

test('user creates, searches, corrects and archives an owned exercise snapshot', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors = collectBrowserErrors(page)

  await openWorkouts(page)
  await expect(page.getByRole('button', { name: '添加高脚杯深蹲' })).toBeVisible()
  await page.getByRole('button', { name: '自定义动作' }).click()
  const editor = page.getByRole('dialog', { name: '自定义动作编辑器' })
  await expect(editor).toBeVisible()
  await editor.locator('[aria-label="自定义动作名称"] input').fill('壶铃摆动')
  await editor.locator('[aria-label="自定义动作别名"] input').fill('Kettlebell Swing，KB Swing')
  await editor.getByRole('button', { name: '自重' }).click()
  await editor.getByRole('button', { name: '壶铃' }).click()

  const createDefinition = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/exercise-catalog') && response.request().method() === 'POST',
  )
  await editor.getByRole('button', { name: '创建并加入目录' }).click()
  expect((await createDefinition).status()).toBe(201)
  await expect(editor).not.toBeVisible()
  await page.locator('[aria-label="搜索动作目录"] input').fill('KB Swing')
  await expect(page.getByRole('button', { name: '添加壶铃摆动' })).toBeVisible()
  await page.getByRole('button', { name: '添加壶铃摆动' }).click()
  await expect(page.locator('.exercise-card__equipment').filter({ hasText: '壶铃' })).toBeVisible()

  const createWorkout = page.waitForResponse(
    (response) => response.url().endsWith('/v1/workouts') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '保存训练', exact: true }).click()
  expect((await createWorkout).status()).toBe(201)
  const recorded = page.locator('.workout-entry').first()
  await expect(recorded.getByText(/高脚杯深蹲 · 壶铃摆动/)).toBeVisible()

  await page.getByRole('button', { name: '编辑自定义动作壶铃摆动' }).click()
  await editor.locator('[aria-label="自定义动作名称"] input').fill('双手壶铃摆动')
  const updateDefinition = page.waitForResponse(
    (response) =>
      /\/v1\/exercise-catalog\/[0-9a-f-]{36}$/.test(response.url()) &&
      response.request().method() === 'PUT',
  )
  await editor.getByRole('button', { name: '保存定义新版本' }).click()
  expect((await updateDefinition).status()).toBe(200)
  const correctedCatalogEntry = page.getByRole('button', { name: '添加双手壶铃摆动' })
  await expect(correctedCatalogEntry).toBeVisible()
  await expect(correctedCatalogEntry).toBeEnabled()
  await expect(correctedCatalogEntry).toHaveCSS('opacity', '1')
  await expect(recorded.getByText(/高脚杯深蹲 · 壶铃摆动/)).toBeVisible()
  await page.locator('.catalog-block').scrollIntoViewIfNeeded()
  await page.screenshot({
    path: 'output/playwright/iteration-037-user-exercise-catalog-mobile.png',
    fullPage: true,
  })

  await page.getByRole('button', { name: '编辑自定义动作双手壶铃摆动' }).click()
  const archiveDefinition = page.waitForResponse(
    (response) =>
      /\/v1\/exercise-catalog\/[0-9a-f-]{36}$/.test(response.url()) &&
      response.request().method() === 'DELETE',
  )
  await editor.getByRole('button', { name: '停用动作' }).click()
  expect((await archiveDefinition).status()).toBe(200)
  await expect(
    page.getByText('动作已从未来选择中停用；当前草稿和历史训练快照没有被改写。'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: '添加双手壶铃摆动' })).not.toBeVisible()
  await expect(recorded.getByText(/高脚杯深蹲 · 壶铃摆动/)).toBeVisible()
  expect(browserErrors).toEqual([])
})
