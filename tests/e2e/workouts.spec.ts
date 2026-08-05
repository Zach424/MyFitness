import { expect, test, type Page } from '@playwright/test'
import { Pool } from 'pg'

import { expectPoliteStatus, expectReducedMotion, expectVisibleFocus } from './accessibility'

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

test('workout authority keeps an initial offline ledger and action directory unknown', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  let workoutReads = 0
  await page.route(/\/v1\/workouts\?limit=20$/, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }
    workoutReads += 1
    if (workoutReads === 1) {
      await route.abort('failed')
      return
    }
    await route.continue()
  })

  await openWorkouts(page)
  const readState = page.locator('.workout-read-state')
  await expect(readState.getByText('OFFLINE / 连接未完成')).toBeVisible()
  await expect(readState).toContainText('训练记录还没有读取')
  await expect(page.getByText('还没有训练记录')).toHaveCount(0)
  await expect(page.getByText('训练数量尚未核对')).toBeVisible()
  await expect(page.getByText(/动作目录尚未核对/)).toBeVisible()
  await expect(page.getByText('没有匹配动作。你可以创建自己的动作定义。')).toHaveCount(0)
  await expect(page.locator('.workouts-topbar__count')).toHaveText('—')
  await expect(page.getByRole('button', { name: '保存训练', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '管理我的动作' })).toBeEnabled()
  const retry = page.getByRole('button', { name: '重新核对训练与动作目录' })
  await expect(retry).toBeFocused()
  await expect
    .poll(() =>
      page.locator('.workouts-page').evaluate((element) => element.getBoundingClientRect().left),
    )
    .toBe(0)
  expect(
    await page.locator('.workouts-page').evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return bounds.width <= window.innerWidth && element.scrollWidth <= window.innerWidth
    }),
  ).toBe(true)

  await page.screenshot({
    path: 'output/playwright/iteration-066-workout-initial-offline-mobile.png',
  })

  const workoutResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/workouts?limit=20') && response.request().method() === 'GET',
  )
  const catalogResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/exercise-catalog') && response.request().method() === 'GET',
  )
  await page.keyboard.press('Enter')
  expect((await workoutResponse).status()).toBe(200)
  expect((await catalogResponse).status()).toBe(200)
  await expect(page.getByText('还没有训练记录')).toBeVisible()
  await expect(page.getByRole('button', { name: '添加俯卧撑' })).toBeEnabled()
  await expect(page.getByRole('button', { name: '保存训练', exact: true })).toBeEnabled()
  expect(workoutReads).toBe(2)
})

test('workout authority retains and freezes both ledgers when catalog refresh is refused', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await openWorkouts(page)
  await page.getByRole('button', { name: '保存训练', exact: true }).click()
  const retainedEntry = page.locator('.workout-entry').first()
  await expect(retainedEntry).toBeVisible()

  let catalogReads = 0
  await page.route(/\/v1\/exercise-catalog$/, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }
    catalogReads += 1
    if (catalogReads === 1) {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'raw catalog refusal must stay hidden' }),
      })
      return
    }
    await route.continue()
  })

  await page.getByRole('button', { name: '更新训练与动作目录' }).click()
  const readState = page.locator('.workout-read-state')
  await expect(readState.getByText('READ REFUSED / 读取被拒绝')).toBeVisible()
  await expect(readState).toContainText('RETAINED SNAPSHOT · 1 SESSIONS')
  await expect(readState).not.toContainText('raw catalog refusal')
  await expect(retainedEntry).toBeVisible()
  await expect(page.locator('.workout-ledger__count')).toHaveText('保留 1')
  await expect(page.getByRole('button', { name: '保存训练', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '重复上次训练' })).toBeDisabled()
  await expect(retainedEntry.getByRole('button', { name: '重复' })).toBeDisabled()
  await expect(retainedEntry.getByRole('button', { name: '修改' })).toBeDisabled()
  await expect(retainedEntry.getByRole('button', { name: '历史' })).toBeDisabled()
  await expect(retainedEntry.getByRole('button', { name: '删除' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '添加俯卧撑' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '管理我的动作' })).toBeEnabled()
  await expect(page.getByRole('button', { name: '查看高脚杯深蹲趋势' })).toBeEnabled()
  const retry = page.getByRole('button', { name: '重新核对训练与动作目录' })
  await expect(retry).toBeFocused()

  await page.screenshot({
    path: 'output/playwright/iteration-066-workout-stale-wide.png',
    fullPage: true,
  })

  const catalogResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/exercise-catalog') && response.request().method() === 'GET',
  )
  await page.keyboard.press('Enter')
  expect((await catalogResponse).status()).toBe(200)
  await expect(readState).toHaveCount(0)
  await expect(retainedEntry.getByRole('button', { name: '修改' })).toBeEnabled()
  await expect(page.getByRole('button', { name: '添加俯卧撑' })).toBeEnabled()
  await expect(page.getByRole('button', { name: '保存训练', exact: true })).toBeEnabled()
  expect(catalogReads).toBe(2)
})

test('owned action register does not turn an initial offline read into an empty directory', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  let reads = 0
  await page.route(/\/v1\/exercise-catalog$/, async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    reads += 1
    if (reads === 2) return route.abort('failed')
    await route.continue()
  })
  await openWorkouts(page)
  await page.getByRole('button', { name: '管理我的动作' }).click()
  const state = page.locator('.register-read-state')
  await expect(state.getByText('OFFLINE / 连接未完成')).toBeVisible()
  await expect(state).toContainText('动作定义目录还没有读取')
  await expect(state).toContainText('OWNED MOVEMENTS —')
  await expect(page.getByText(/还没有自定义动作/)).toHaveCount(0)
  await expect(page.getByText('动作定义数量尚未核对。')).toBeVisible()
  await expect(page.getByRole('button', { name: '新建动作' })).toBeDisabled()
  await expect
    .poll(() =>
      page.evaluate(() => ({
        shellLeft: Math.round(
          document.querySelector('.food-catalog-shell')?.getBoundingClientRect().left ?? -1,
        ),
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      })),
    )
    .toEqual({ shellLeft: 0, viewportWidth: 390, documentWidth: 390 })
  const retry = page.getByRole('button', { name: '重新核对我的动作定义目录' })
  await expect(retry).toBeFocused()
  await page.screenshot({
    path: 'output/playwright/iteration-068-action-register-offline-mobile.png',
  })
  await page.keyboard.press('Enter')
  await expect(state).toHaveCount(0)
  await expect(page.getByRole('button', { name: '新建动作' })).toBeEnabled()
  expect(reads).toBe(3)
})

const collectBrowserErrors = (page: Page) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  return browserErrors
}

test('workout history keeps its requested aggregate visible after an initial offline read', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openWorkouts(page)
  await page.locator('[aria-label="开始时间，年-月-日 时:分"] input').fill('2026-08-05 18:00')
  await page.locator('[aria-label="结束时间，年-月-日 时:分"] input').fill('2026-08-05 18:45')
  await page.getByRole('button', { name: '保存训练', exact: true }).click()
  const entry = page.locator('.workout-entry').first()
  await expect(entry).toBeVisible()

  let historyReads = 0
  await page.route(/\/v1\/workouts\/[0-9a-f-]{36}\/history\?limit=10$/, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }
    historyReads += 1
    if (historyReads === 1) {
      await route.abort('internetdisconnected')
      return
    }
    await route.continue()
  })

  await entry.getByRole('button', { name: '历史' }).click()
  const dialog = page.getByRole('dialog', { name: '训练历史' })
  await expect(dialog).toBeVisible()
  const readState = dialog.locator('.aggregate-history-read-state')
  await expect(readState.getByText('OFFLINE / 连接未完成')).toBeVisible()
  await expect(readState).toContainText('训练版本历史还没有读取')
  await expect(readState).toContainText('REVISIONS — · AUDIT BOUNDARY UNKNOWN')
  await expect(dialog.locator('.workout-history-entry')).toHaveCount(0)
  const retry = dialog.getByRole('button', { name: '重新核对训练版本历史' })
  await expect(retry).toBeFocused()

  await page.screenshot({
    path: 'output/playwright/iteration-073-workout-history-offline-mobile.png',
  })

  await page.keyboard.press('Enter')
  await expect(readState).toHaveCount(0)
  await expect(dialog.locator('.workout-history-entry')).toHaveCount(1)
  await expect(dialog.getByText('已载入全部版本')).toBeVisible()
  expect(historyReads).toBe(2)
})

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
    (response) =>
      new URL(response.url()).pathname.endsWith('/history') &&
      response.request().method() === 'GET',
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

test('ambiguous workout response retains the draft and retries one aggregate', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openWorkouts(page)

  const title = page.locator('.session-title-input input')
  await title.fill('响应丢失训练')
  await page.locator('[aria-label="开始时间，年-月-日 时:分"] input').fill('2026-07-18 18:00')
  await page.locator('[aria-label="结束时间，年-月-日 时:分"] input').fill('2026-07-18 18:45')

  const idempotencyKeys: string[] = []
  let createAttempts = 0
  await page.route('**/v1/workouts', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    createAttempts += 1
    idempotencyKeys.push(route.request().headers()['x-idempotency-key'] ?? '')
    if (createAttempts === 1) {
      const committedResponse = await route.fetch()
      expect(committedResponse.status()).toBe(201)
      await route.abort('failed')
      return
    }
    await route.continue()
  })

  await page.getByRole('button', { name: '保存训练', exact: true }).click()
  const uncertainStatus = page.getByRole('status')
  await expect(uncertainStatus.getByText('CONNECTION UNCERTAIN / 输入仍保留')).toBeVisible()
  await expect(uncertainStatus).toContainText('无法确认这次训练是否已经到达服务端')
  await expect(title).toHaveValue('响应丢失训练')
  const retryButton = page.getByRole('button', { name: '重试保存（防重复）' })
  await expect(retryButton).toBeEnabled()
  await expect(retryButton).toHaveCSS('opacity', '1')

  await page.screenshot({
    path: 'output/playwright/iteration-054-workout-save-recovery-mobile.png',
    fullPage: true,
  })

  const retryResponse = page.waitForResponse(
    (response) => response.url().endsWith('/v1/workouts') && response.request().method() === 'POST',
  )
  await retryButton.click()
  expect((await retryResponse).status()).toBe(201)
  await expect(page.locator('.workout-entry').filter({ hasText: '响应丢失训练' })).toHaveCount(1)
  expect(createAttempts).toBe(2)
  expect(idempotencyKeys[0]).not.toBe('')
  expect(idempotencyKeys[1]).toBe(idempotencyKeys[0])
})

test('ambiguous action-definition create retries the same key and creates one definition', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openWorkouts(page)
  await page.getByRole('button', { name: '管理我的动作' }).click()
  await page.getByRole('button', { name: '新建动作' }).click()

  const editor = page.locator('.food-editor')
  const name = editor.locator('[aria-label="自定义动作名称"] input')
  await name.fill('响应丢失农夫行走')
  await editor.getByRole('button', { name: '自重' }).click()
  await editor.getByRole('button', { name: '哑铃' }).click()

  const idempotencyKeys: string[] = []
  let createAttempts = 0
  await page.route('**/v1/exercise-catalog', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    createAttempts += 1
    idempotencyKeys.push(route.request().headers()['x-idempotency-key'] ?? '')
    if (createAttempts === 1) {
      const committedResponse = await route.fetch()
      expect(committedResponse.status()).toBe(201)
      await route.abort('failed')
      return
    }
    await route.continue()
  })

  await editor.getByRole('button', { name: '保存定义' }).click()
  const recovery = page.locator('.workbench-recovery')
  await expect(recovery.getByText('SAME REQUEST / 仅同一请求可重试')).toBeVisible()
  await expect(recovery).toContainText('无法确认这次动作定义新建是否已提交')
  await expect(name).toHaveValue('响应丢失农夫行走')
  const primarySave = editor.getByRole('button', { name: '保存定义' })
  await expect(primarySave).toBeDisabled()
  await expect(primarySave).toHaveCSS('opacity', '0.45')
  const retry = recovery.getByRole('button', { name: '重试保存定义（防重复）' })
  await expect(retry).toBeEnabled()
  await expect(retry).toHaveCSS('opacity', '1')

  await page.screenshot({
    path: 'output/playwright/iteration-055-action-create-recovery-mobile.png',
    fullPage: true,
  })

  const retryResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/exercise-catalog') && response.request().method() === 'POST',
  )
  await retry.click()
  expect((await retryResponse).status()).toBe(201)
  await expect(
    page.locator('.food-register__name').filter({ hasText: '响应丢失农夫行走' }),
  ).toHaveCount(1)
  expect(createAttempts).toBe(2)
  expect(idempotencyKeys[0]).not.toBe('')
  expect(idempotencyKeys[1]).toBe(idempotencyKeys[0])
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

test('exercise observation does not publish source choices before its projection succeeds', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openWorkouts(page)
  await page.getByRole('button', { name: '保存训练', exact: true }).click()
  await expect(page.locator('.workout-entry')).toHaveCount(1)

  let insightReads = 0
  await page.route(/\/v1\/insights\/exercises\/goblet_squat/, async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    insightReads += 1
    if (insightReads === 1)
      return route.fulfill({ status: 503, body: JSON.stringify({ message: 'raw hidden' }) })
    await route.continue()
  })
  await page.getByRole('button', { name: '查看高脚杯深蹲趋势' }).click()
  const state = page.locator('.observation-read-state')
  await expect(state.getByText('SERVICE PAUSED / 服务暂不可用')).toBeVisible()
  await expect(state).toContainText('动作观察暂时无法读取')
  await expect(state).toContainText('MOVEMENT — · SESSIONS —')
  await expect(state).not.toContainText('raw hidden')
  await expect(page.getByRole('button', { name: '高脚杯深蹲' })).toHaveCount(0)
  await expect(page.getByText(/保存含有已完成组的训练后/)).toHaveCount(0)
  await expect(
    page.getByText('动作观察尚未核对；读取成功后才会显示动作选择或确认空白。'),
  ).toBeVisible()
  const retry = page.getByRole('button', { name: '重新核对单动作长期观察' })
  await expect(retry).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(state).toHaveCount(0)
  await expect(page.getByRole('button', { name: '高脚杯深蹲' })).toBeVisible()
  await expect(page.getByText('有完成组的训练')).toBeVisible()
  expect(insightReads).toBe(2)
})

test('user creates, searches, corrects and archives an owned exercise snapshot', async ({
  page,
}) => {
  test.slow()
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors = collectBrowserErrors(page)

  await openWorkouts(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expectReducedMotion(page)
  await expect(page.getByRole('button', { name: '添加高脚杯深蹲' })).toBeVisible()
  await page.locator('.session-title-input input').fill('动作目录往返草稿')
  await page.getByRole('button', { name: '管理我的动作' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('我的动作，是可修订的定义，不是会漂移的训练事实。')).toBeVisible()
  await expectVisibleFocus(page.getByRole('button', { name: '返回训练记录' }))
  await page.getByRole('button', { name: '新建动作' }).focus()
  await page.keyboard.press('Enter')
  const editor = page.locator('.food-editor')
  await expect(editor).toBeVisible()
  await editor.locator('[aria-label="自定义动作名称"] input').fill('壶铃摆动')
  await editor.locator('[aria-label="自定义动作别名"] input').fill('Kettlebell Swing，KB Swing')
  await editor.getByRole('button', { name: '自重' }).click()
  await editor.getByRole('button', { name: '壶铃' }).click()

  const createDefinition = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/exercise-catalog') && response.request().method() === 'POST',
  )
  await editor.getByRole('button', { name: '保存定义' }).click()
  expect((await createDefinition).status()).toBe(201)
  await expect(editor).not.toBeVisible()
  await expect(page.getByText('自定义动作已保存；返回训练页后可搜索并加入当前草稿。')).toBeVisible()
  await expectPoliteStatus(page.locator('.food-catalog-feedback'))
  await expectVisibleFocus(page.getByRole('button', { name: '新建动作' }))

  const refreshedAfterCreate = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/exercise-catalog') && response.request().method() === 'GET',
  )
  await page.getByRole('button', { name: '返回训练记录' }).click()
  expect((await refreshedAfterCreate).status()).toBe(200)
  await expectVisibleFocus(page.getByRole('button', { name: '管理我的动作' }))
  await expect(page.locator('.session-title-input input')).toHaveValue('动作目录往返草稿')
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

  await page.getByRole('button', { name: '编辑自定义动作壶铃摆动' }).focus()
  await page.keyboard.press('Enter')
  await expect(editor).toBeVisible()
  await expectVisibleFocus(page.getByRole('button', { name: '返回训练记录' }))
  await expect(editor.getByLabel('定义修订历史').getByText(/R1 · 创建/)).toBeVisible()
  await editor.locator('[aria-label="自定义动作名称"] input').fill('双手壶铃摆动')
  const updateDefinition = page.waitForResponse(
    (response) =>
      /\/v1\/exercise-catalog\/[0-9a-f-]{36}$/.test(response.url()) &&
      response.request().method() === 'PUT',
  )
  await editor.getByRole('button', { name: '保存纠正' }).click()
  expect((await updateDefinition).status()).toBe(200)
  await expect(
    page.locator('.food-register__name').filter({ hasText: '双手壶铃摆动' }),
  ).toBeVisible()
  const correctedEdit = page.getByRole('button', { name: '编辑自定义动作双手壶铃摆动' })
  await expectVisibleFocus(correctedEdit)

  await page.keyboard.press('Enter')
  const definitionHistory = editor.getByLabel('定义修订历史')
  await expect(definitionHistory.getByText(/R2 · 纠正/)).toBeVisible()
  await expect(definitionHistory.getByText(/R1 · 创建/)).toBeVisible()
  await definitionHistory.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: 'output/playwright/iteration-050-lazy-exercise-catalog-mobile.png',
    fullPage: true,
  })

  await editor.getByRole('button', { name: '停用' }).click()
  const archiveDialog = page.getByRole('dialog', { name: /停用“双手壶铃摆动”/ })
  await expect(archiveDialog).toBeVisible()
  const cancelArchive = archiveDialog.getByRole('button', { name: '取消' })
  await expectVisibleFocus(cancelArchive)
  await page.screenshot({
    path: 'output/playwright/iteration-052-action-archive-focus-mobile.png',
    fullPage: true,
  })
  await page.keyboard.press('Enter')
  await expect(archiveDialog).not.toBeVisible()
  const archiveAction = editor.getByRole('button', { name: '停用' })
  await expectVisibleFocus(archiveAction)

  await page.keyboard.press('Enter')
  await expect(archiveDialog).toBeVisible()
  await expectVisibleFocus(cancelArchive)
  await page.keyboard.press('Tab')
  const confirmArchive = archiveDialog.getByRole('button', { name: '确认停用' })
  await expectVisibleFocus(confirmArchive)
  await page.route('**/v1/exercise-catalog/*', async (route) => {
    if (route.request().method() !== 'DELETE') {
      await route.continue()
      return
    }
    const committedResponse = await route.fetch()
    expect(committedResponse.status()).toBe(200)
    await route.abort('failed')
  })
  await page.keyboard.press('Enter')
  const archiveRecovery = archiveDialog.locator('.workbench-recovery')
  await expect(archiveRecovery.getByText('RECONCILE FIRST / 禁止直接重放')).toBeVisible()
  await expect(
    page.getByText('动作已从未来选择中停用；训练草稿、历史训练与修订证据未被改写。'),
  ).toHaveCount(0)
  await page.screenshot({
    path: 'output/playwright/iteration-055-action-archive-reconciliation-mobile.png',
    fullPage: true,
  })
  await archiveRecovery.getByRole('button', { name: '核对服务端状态' }).click()
  await expect(
    page.getByText('核对完成：服务端当前目录已不再包含此动作；仅据此确认它不会用于未来选择。'),
  ).toBeVisible()
  await expectVisibleFocus(page.getByRole('button', { name: '新建动作' }))

  const refreshedAfterArchive = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/exercise-catalog') && response.request().method() === 'GET',
  )
  await page.getByRole('button', { name: '返回训练记录' }).click()
  expect((await refreshedAfterArchive).status()).toBe(200)
  await expectVisibleFocus(page.getByRole('button', { name: '管理我的动作' }))
  await expect(page.getByRole('button', { name: '添加双手壶铃摆动' })).not.toBeVisible()
  await expect(recorded.getByText(/高脚杯深蹲 · 壶铃摆动/)).toBeVisible()
  expect(
    browserErrors.filter((error) => error !== 'Failed to load resource: net::ERR_FAILED'),
  ).toEqual([])
})
