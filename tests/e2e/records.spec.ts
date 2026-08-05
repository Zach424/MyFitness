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

const openRecords = async (page: Page) => {
  await page.goto('/')
  await page.getByRole('button', { name: '记录', exact: true }).click()
  await expect(page.getByText('记录身体，也记录恢复。')).toBeVisible()
}

const seedHealthRecordRevisions = (page: Page, idempotencyKey: string) =>
  page.evaluate(
    async ({ apiUrl, idempotencyKey }) => {
      const rawToken = localStorage.getItem('myfitness.auth.accessToken')
      if (!rawToken) throw new Error('development access token is missing')
      let decoded: { data?: unknown } = {}
      try {
        decoded = JSON.parse(rawToken) as { data?: unknown }
      } catch {
        // Legacy H5 storage kept the access token as a plain string.
      }
      const token = typeof decoded.data === 'string' ? decoded.data : rawToken
      const headers = {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      }
      const payload = (value: number) => ({
        metric: 'body.weight',
        value,
        unit: 'kg',
        source: { kind: 'manual' },
        status: 'confirmed',
        occurredAt: '2026-02-01T04:00:00.000Z',
        timezone: 'Asia/Shanghai',
      })
      const createdResponse = await fetch(`${apiUrl}/health-records`, {
        method: 'POST',
        headers: { ...headers, 'x-idempotency-key': idempotencyKey },
        body: JSON.stringify(payload(70)),
      })
      let current = (await createdResponse.json()) as { id: string; revision: number }
      const statuses = [createdResponse.status]
      for (let revision = 2; revision <= 12; revision += 1) {
        const response = await fetch(`${apiUrl}/health-records/${current.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            ...payload(70 + revision / 10),
            expectedRevision: current.revision,
          }),
        })
        statuses.push(response.status)
        current = (await response.json()) as { id: string; revision: number }
      }
      return { statuses, revision: current.revision }
    },
    { apiUrl, idempotencyKey },
  )

test('record ledger does not turn an initial offline read into an empty logbook', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  let listAttempts = 0
  await page.route(/\/v1\/health-records\?limit=20$/, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }
    listAttempts += 1
    if (listAttempts === 1) {
      await route.abort('failed')
      return
    }
    await route.continue()
  })

  await openRecords(page)
  const readState = page.locator('.record-read-state')
  await expect(readState.getByText('OFFLINE / 连接未完成')).toBeVisible()
  await expect(readState).toContainText('身体记录还没有读取')
  await expect(page.getByText('还没有身体记录')).toHaveCount(0)
  await expect(page.getByText('记录尚未核对；读取成功后才会显示最近趋势。')).toBeVisible()
  await expect(page.locator('.log-heading__count')).toHaveText('尚未核对')
  await expect(page.getByRole('button', { name: '保存记录' })).toBeDisabled()
  const retry = page.getByRole('button', { name: '重新核对身体记录清单' })
  await expect(retry).toBeFocused()
  await expect
    .poll(() =>
      page.locator('.records-page').evaluate((element) => element.getBoundingClientRect().left),
    )
    .toBe(0)
  expect(
    await page.locator('.records-page').evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return bounds.width <= window.innerWidth && element.scrollWidth <= window.innerWidth
    }),
  ).toBe(true)

  await page.screenshot({
    path: 'output/playwright/iteration-065-record-initial-offline-mobile.png',
  })

  const retryResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/health-records?limit=20') &&
      response.request().method() === 'GET',
  )
  await page.keyboard.press('Enter')
  expect((await retryResponse).status()).toBe(200)
  await expect(page.getByText('还没有身体记录')).toBeVisible()
  await expect(page.getByRole('button', { name: '保存记录' })).toBeEnabled()
  expect(listAttempts).toBe(2)
})

test('record ledger retains but freezes a page after a refused refresh', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await openRecords(page)
  await page.locator('[aria-label="体重数值"] input').fill('71.8')
  await page.locator('[aria-label="发生时间，年-月-日 时:分"] input').fill('2026-07-18 16:00')
  await page.getByRole('button', { name: '保存记录' }).click()
  const retainedEntry = page.locator('.log-entry').filter({ hasText: '71.8 kg' })
  await expect(retainedEntry).toBeVisible()

  let refreshAttempts = 0
  await page.route(/\/v1\/health-records\?limit=20$/, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }
    refreshAttempts += 1
    if (refreshAttempts === 1) {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'raw backend refusal must stay hidden' }),
      })
      return
    }
    await route.continue()
  })

  await page.getByRole('button', { name: '更新身体记录清单' }).click()
  const readState = page.locator('.record-read-state')
  await expect(readState.getByText('READ REFUSED / 读取被拒绝')).toBeVisible()
  await expect(readState).toContainText('RETAINED PAGE · 1 ITEMS')
  await expect(readState).not.toContainText('raw backend refusal')
  await expect(retainedEntry).toBeVisible()
  await expect(page.locator('.log-heading__count')).toHaveText('保留 1')
  await expect(page.getByRole('button', { name: '保存记录' })).toBeDisabled()
  await expect(retainedEntry.getByRole('button', { name: '修改' })).toBeDisabled()
  await expect(retainedEntry.getByRole('button', { name: '历史' })).toBeDisabled()
  await expect(retainedEntry.getByRole('button', { name: '删除' })).toBeDisabled()
  const retry = page.getByRole('button', { name: '重新核对身体记录清单' })
  await expect(retry).toBeFocused()

  await page.screenshot({
    path: 'output/playwright/iteration-065-record-stale-wide.png',
    fullPage: true,
  })

  const retryResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/health-records?limit=20') &&
      response.request().method() === 'GET',
  )
  await page.keyboard.press('Enter')
  expect((await retryResponse).status()).toBe(200)
  await expect(readState).toHaveCount(0)
  await expect(retainedEntry.getByRole('button', { name: '修改' })).toBeEnabled()
  await expect(page.getByRole('button', { name: '保存记录' })).toBeEnabled()
  expect(refreshAttempts).toBe(2)
})

const validDemoProgressPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFUlEQVQYlWO4cWQWHsQwKn0ES7AAAP7B3Rk90PKpAAAAAElFTkSuQmCC',
  'base64',
)

const collectBrowserErrors = (page: Page) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

const openProgressPhotos = async (page: Page) => {
  await openRecords(page)
  await page.getByRole('button', { name: '打开进度照 →' }).click()
  await expect(page.getByText('用相同条件，看见自己的长期变化。')).toBeVisible()
}

test('body record completes create, update, history and delete lifecycle', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  await openRecords(page)
  await expect(page.getByText('还没有身体记录')).toBeVisible()
  await page.locator('[aria-label="体重数值"] input').fill('72.4')
  const occurrenceInput = page.locator('[aria-label="发生时间，年-月-日 时:分"] input')
  const occurrenceZone = page.locator('[aria-label="发生时间使用的 IANA 时区"] input')
  await occurrenceZone.fill('Asia/Shanghai')
  await occurrenceInput.fill('2100-01-01 00:00')
  await expect(page.getByText('发生时间不能晚于现在')).toBeVisible()
  await page.getByRole('button', { name: '保存记录' }).click()
  await expect(page.getByRole('status').getByText('发生时间不能晚于现在')).toBeVisible()
  await occurrenceZone.fill('America/New_York')
  await occurrenceInput.fill('2025-11-02 01:30')
  await expect(page.getByText('夏令时重复，请选择 UTC 偏移')).toBeVisible()
  await expect(page.getByRole('button', { name: 'UTC-04:00' })).toBeVisible()
  await page.getByRole('button', { name: 'UTC-05:00' }).click()
  await expect(page.getByText('UTC-05:00 · 保存为准确时刻')).toBeVisible()
  await occurrenceZone.fill('Asia/Shanghai')
  await occurrenceInput.fill('2026-07-18 16:00')
  await expect(page.getByRole('status').getByText('发生时间不能晚于现在')).not.toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-043-occurrence-time-mobile.png',
    fullPage: true,
  })

  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/health-records') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '保存记录' }).click()
  const createResponse = await createResponsePromise
  expect(createResponse.status()).toBe(201)
  expect(createResponse.request().postDataJSON()).toMatchObject({
    occurredAt: '2026-07-18T08:00:00.000Z',
    timezone: 'Asia/Shanghai',
  })
  await expect(page.locator('.records-layout__log').getByText('72.4 kg')).toBeVisible()

  await page.getByRole('button', { name: '修改' }).click()
  await expect(page.getByText('正在修改这条记录；保存后会新增一个历史版本。')).toBeVisible()
  await page.locator('[aria-label="体重数值"] input').fill('73.1')
  const updateResponsePromise = page.waitForResponse(
    (response) =>
      /\/v1\/health-records\/[0-9a-f-]{36}$/.test(response.url()) &&
      response.request().method() === 'PUT',
  )
  await page.getByRole('button', { name: '保存新版本' }).click()
  const updateResponse = await updateResponsePromise
  expect(updateResponse.status()).toBe(200)
  await expect(page.locator('.records-layout__log').getByText('73.1 kg')).toBeVisible()
  await expect(page.locator('.records-layout__log').getByText('v2')).toBeVisible()

  const historyResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith('/history') &&
      response.request().method() === 'GET',
  )
  await page.getByRole('button', { name: '历史' }).click()
  expect((await historyResponsePromise).status()).toBe(200)
  await expect(page.locator('.history-sheet').getByText('修改记录')).toBeVisible()
  await expect(page.locator('.history-sheet').getByText('创建记录')).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-004-records-mobile.png',
    fullPage: true,
  })
  await page.locator('.history-close').click()
  await expect(page.getByRole('button', { name: '历史' })).toBeFocused()

  const deleteTrigger = page.getByRole('button', { name: '删除' })
  await deleteTrigger.focus()
  await page.keyboard.press('Enter')
  const deleteDialog = page.getByRole('dialog', { name: '确认删除记录' })
  await expect(deleteDialog).toBeVisible()
  const cancelDelete = deleteDialog.locator('#health-delete-cancel')
  await expect(cancelDelete).toBeFocused()
  await expect(cancelDelete).toHaveCSS('color', 'rgb(20, 36, 38)')
  await page.screenshot({
    path: 'output/playwright/iteration-077-delete-cancel-mobile.png',
    fullPage: false,
  })
  await page.keyboard.press('Escape')
  await expect(deleteDialog).toHaveCount(0)
  await expect(deleteTrigger).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(cancelDelete).toBeFocused()
  let releaseDelete = () => {}
  let deleteAttempts = 0
  const deleteGate = new Promise<void>((resolve) => {
    releaseDelete = resolve
  })
  await page.route(/\/v1\/health-records\/[0-9a-f-]{36}$/, async (route) => {
    if (route.request().method() !== 'DELETE') {
      await route.continue()
      return
    }
    deleteAttempts += 1
    await deleteGate
    const committedResponse = await route.fetch()
    expect(committedResponse.status()).toBe(204)
    await route.abort('failed')
  })
  await deleteDialog.getByRole('button', { name: '确认删除' }).click()
  await expect(cancelDelete).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(deleteDialog).toBeVisible()
  releaseDelete()
  const deleteRecovery = page.locator('.aggregate-delete-recovery')
  await expect(deleteRecovery.getByText('RESULT UNKNOWN / 先核对再决定')).toBeVisible()
  await expect(deleteDialog).toHaveCount(0)
  await expect(page.locator('#health-delete-reconcile')).toBeFocused()
  await expect(deleteTrigger).toBeDisabled()
  await page.screenshot({
    path: 'output/playwright/iteration-078-delete-reconciliation-mobile.png',
    fullPage: false,
  })
  browserErrors.length = 0
  await page.locator('#health-delete-reconcile').click()
  await expect(page.getByText('还没有身体记录')).toBeVisible()
  await expect(page.getByText(/这条记录已不在当前服务端清单中/)).toBeVisible()
  await expect(page.locator('#record-read-refresh')).toBeFocused()
  expect(deleteAttempts).toBe(1)
  expect(browserErrors).toContain(
    'Failed to load resource: the server responded with a status of 404 (Not Found)',
  )
  browserErrors.length = 0
  expect(browserErrors).toEqual([])
})

test('ambiguous body-record response keeps input and retries with one idempotency key', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openRecords(page)

  const input = page.locator('[aria-label="体重数值"] input')
  await input.fill('74.2')
  await page.locator('[aria-label="发生时间，年-月-日 时:分"] input').fill('2026-07-18 16:00')

  const idempotencyKeys: string[] = []
  let createAttempts = 0
  await page.route('**/v1/health-records', async (route) => {
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

  await page.getByRole('button', { name: '保存记录' }).click()
  const uncertainStatus = page.getByRole('status')
  await expect(uncertainStatus.getByText('CONNECTION UNCERTAIN / 输入仍保留')).toBeVisible()
  await expect(uncertainStatus).toContainText('无法确认这笔身体记录是否已经到达服务端')
  await expect(uncertainStatus).toContainText('沿用同一请求编号')
  await expect(input).toHaveValue('74.2')
  const retryButton = page.getByRole('button', { name: '重试保存（防重复）' })
  await expect(retryButton).toBeVisible()
  await expect(retryButton).toBeEnabled()
  await expect(retryButton).toHaveCSS('opacity', '1')
  expect(createAttempts).toBe(1)

  await page.screenshot({
    path: 'output/playwright/iteration-053-ambiguous-save-recovery-mobile.png',
    fullPage: true,
  })

  const retryResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/health-records') && response.request().method() === 'POST',
  )
  await retryButton.click()
  expect((await retryResponse).status()).toBe(201)
  await expect(page.getByRole('status')).toContainText('记录已保存')
  await expect(page.locator('.log-entry').filter({ hasText: '74.2 kg' })).toHaveCount(1)
  expect(createAttempts).toBe(2)
  expect(idempotencyKeys[0]).not.toBe('')
  expect(idempotencyKeys[1]).toBe(idempotencyKeys[0])
})

test('record log keeps its hierarchy at wide viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  await openRecords(page)
  await expect(page.getByText('最近记录')).toBeVisible()
  await expect(page.getByText('体重趋势')).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-004-records-wide.png',
    fullPage: true,
  })
  expect(browserErrors).toEqual([])
})

test('metric observation keeps canonical statistics and recorded units explicit', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  await openRecords(page)
  await page.locator('[aria-label="体重数值"] input').fill('72.4')
  await page.getByRole('button', { name: '保存记录' }).click()
  await expect(page.locator('.records-layout__log').getByText('72.4 kg')).toBeVisible()

  const insightResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/v1/insights/health/body.weight') &&
      response.request().method() === 'GET',
  )
  await page.getByRole('button', { name: '查看体重长期观察' }).click()
  expect((await insightResponse).status()).toBe(200)
  await expect(page.getByText('只看同一个指标，保留每次记录时的尺度。')).toBeVisible()
  await expect(page.getByLabel('已确认记录 1')).toBeVisible()
  await expect(page.getByLabel('记录日期 1')).toBeVisible()
  await expect(page.locator('.health-calibration-mark')).toHaveCount(1)
  await expect(page.locator('.health-observation-ledger').getByText('72.4 kg')).toBeVisible()
  await expect(page.getByText('手动记录 · 发生时区')).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-041-health-metric-observation-mobile.png',
    fullPage: true,
  })
  await page.getByRole('button', { name: '7 天' }).click()
  await expect(page.getByText('7 天 · 标准单位 kg')).toBeVisible()
  expect(browserErrors).toEqual([])
})

test('health observation keeps an initial source-ledger outage unknown', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  let sourceReads = 0
  await page.route(/\/v1\/health-records$/, async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    sourceReads += 1
    if (sourceReads === 1) return route.abort('failed')
    await route.continue()
  })

  await openRecords(page)
  await page.getByRole('button', { name: '查看体重长期观察' }).click()
  const state = page.locator('.observation-read-state')
  await expect(state.getByText('OFFLINE / 连接未完成')).toBeVisible()
  await expect(state).toContainText('身体与恢复观察还没有读取')
  await expect(state).toContainText('METRIC — · POINTS —')
  await expect(page.getByText(/保存一条已确认的身体或恢复记录后/)).toHaveCount(0)
  await expect(
    page.getByText('身体与恢复观察尚未核对；读取成功后才会显示可选指标或确认空白。'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: '更新身体与恢复长期观察' })).toBeDisabled()
  await expect
    .poll(() =>
      page.evaluate(() => ({
        shellLeft: Math.round(
          document.querySelector('.health-observation-shell')?.getBoundingClientRect().left ?? -1,
        ),
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      })),
    )
    .toEqual({ shellLeft: 0, viewportWidth: 390, documentWidth: 390 })
  const retry = page.getByRole('button', { name: '重新核对身体与恢复长期观察' })
  await expect(retry).toBeFocused()
  await page.screenshot({
    path: 'output/playwright/iteration-069-health-observation-offline-mobile.png',
  })
  await page.keyboard.press('Enter')
  await expect(state).toHaveCount(0)
  await expect(page.getByText(/保存一条已确认的身体或恢复记录后/)).toBeVisible()
  await expect(page.getByRole('button', { name: '更新身体与恢复长期观察' })).toBeEnabled()
  expect(sourceReads).toBe(2)
})

test('health editor restores an owner-scoped local draft and clears it after save', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  await openRecords(page)
  const input = page.locator('[aria-label="体重数值"] input')
  await input.fill('71.2')
  await expect(page.getByText('未完成内容已暂存')).toBeVisible()
  expect(
    await page.evaluate(() => localStorage.getItem('myfitness.local-draft.health-record')),
  ).not.toBeNull()

  await page.reload()
  await expect(page.getByText('发现一份未完成记录')).toBeVisible()
  await expect(input).toHaveValue('70')
  await page.getByRole('button', { name: '恢复草稿' }).click()
  await expect(input).toHaveValue('71.2')
  await expect(page.getByText(/自动清除/)).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-042-recoverable-draft-mobile.png',
    fullPage: true,
  })

  const createResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/health-records') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '保存记录' }).click()
  expect((await createResponse).status()).toBe(201)
  expect(
    await page.evaluate(() => localStorage.getItem('myfitness.local-draft.health-record')),
  ).toBeNull()
  expect(browserErrors).toEqual([])
})

test('health correction draft restores the exact revision and clears after update', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  await openRecords(page)
  const input = page.locator('[aria-label="体重数值"] input')
  await input.fill('72.4')
  await page.getByRole('button', { name: '保存记录' }).click()
  await expect(page.locator('.records-layout__log').getByText('72.4 kg')).toBeVisible()

  await page.getByRole('button', { name: '修改' }).click()
  await input.fill('72.9')
  await expect(page.getByText('未保存修改已暂存')).toBeVisible()
  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('myfitness.local-draft.health-record') ?? '{}'
    const decoded = JSON.parse(raw) as { data?: unknown }
    return typeof decoded.data === 'string' ? JSON.parse(decoded.data) : decoded
  })
  expect(stored).toMatchObject({ payload: { correction: { baseRevision: 1 } } })

  await page.reload()
  await expect(page.getByText('发现一份未完成修改')).toBeVisible()
  await expect(page.getByText(/基于 R1/)).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-044-correction-draft-mobile.png',
    fullPage: true,
  })
  await page.getByRole('button', { name: '恢复修改' }).click()
  await expect(page.getByText(/已恢复基于 R1 的修改/)).toBeVisible()
  await expect(input).toHaveValue('72.9')

  const updateResponse = page.waitForResponse(
    (response) =>
      /\/v1\/health-records\/[0-9a-f-]{36}$/.test(response.url()) &&
      response.request().method() === 'PUT',
  )
  await page.getByRole('button', { name: '保存新版本' }).click()
  expect((await updateResponse).status()).toBe(200)
  await expect(page.locator('.records-layout__log').getByText('v2')).toBeVisible()
  expect(
    await page.evaluate(() => localStorage.getItem('myfitness.local-draft.health-record')),
  ).toBeNull()
  expect(browserErrors).toEqual([])
})

test('health log loads older records and restores a correction beyond the first page', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  await openRecords(page)
  const createStatuses = await page.evaluate(async (apiUrl) => {
    const rawToken = localStorage.getItem('myfitness.auth.accessToken')
    if (!rawToken) throw new Error('development access token is missing')
    let decoded: { data?: unknown } = {}
    try {
      decoded = JSON.parse(rawToken) as { data?: unknown }
    } catch {
      // Legacy H5 storage kept the access token as a plain string.
    }
    const token = typeof decoded.data === 'string' ? decoded.data : rawToken
    const statuses: number[] = []
    for (let day = 1; day <= 21; day += 1) {
      const response = await fetch(`${apiUrl}/health-records`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'x-idempotency-key': `pagination-health-${day}`,
        },
        body: JSON.stringify({
          metric: 'body.weight',
          value: 60 + day,
          unit: 'kg',
          source: { kind: 'manual' },
          status: 'confirmed',
          occurredAt: `2026-01-${String(day).padStart(2, '0')}T04:00:00.000Z`,
          timezone: 'Asia/Shanghai',
        }),
      })
      statuses.push(response.status)
    }
    return statuses
  }, apiUrl)
  expect(createStatuses).toEqual(Array.from({ length: 21 }, () => 201))

  await page.reload()
  await expect(page.locator('.records-layout__log').getByText('已载入 20')).toBeVisible()
  await expect(page.locator('.records-layout__log').getByText('61 kg')).not.toBeVisible()

  const olderPageResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/v1/health-records?limit=20&cursor=') &&
      response.request().method() === 'GET',
  )
  await page.getByRole('button', { name: '继续载入更早记录' }).click()
  expect((await olderPageResponse).status()).toBe(200)
  const oldestEntry = page.locator('.log-entry').filter({ hasText: '61 kg' })
  await expect(oldestEntry).toBeVisible()
  await expect(page.getByText('已载入当前全部记录')).toBeVisible()

  await oldestEntry.getByRole('button', { name: '修改' }).click()
  const input = page.locator('[aria-label="体重数值"] input')
  await input.fill('61.5')
  await expect(page.getByText('未保存修改已暂存')).toBeVisible()

  await page.reload()
  await expect(page.locator('.records-layout__log').getByText('已载入 20')).toBeVisible()
  await expect(page.getByText('发现一份未完成修改')).toBeVisible()
  const exactRecordResponse = page.waitForResponse(
    (response) =>
      /\/v1\/health-records\/[0-9a-f-]{36}$/.test(response.url()) &&
      response.request().method() === 'GET',
  )
  await page.getByRole('button', { name: '恢复修改' }).click()
  expect((await exactRecordResponse).status()).toBe(200)
  await expect(input).toHaveValue('61.5')
  await expect(page.getByText(/已恢复基于 R1 的修改/)).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-046-progressive-history-mobile.png',
    fullPage: false,
  })
  expect(browserErrors).toEqual([])
})

test('health history sheet progressively loads immutable older revisions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  await openRecords(page)
  const seed = await seedHealthRecordRevisions(page, 'progressive-revision-history')
  expect(seed.statuses).toEqual([201, ...Array.from({ length: 11 }, () => 200)])
  expect(seed.revision).toBe(12)

  await page.reload()
  const currentEntry = page.locator('.log-entry').first()
  await expect(currentEntry.getByText('v12')).toBeVisible()
  const historyTrigger = currentEntry.getByRole('button', { name: '历史' })
  const firstPageResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/history?limit=10') && response.request().method() === 'GET',
  )
  await historyTrigger.focus()
  await page.keyboard.press('Enter')
  expect((await firstPageResponse).status()).toBe(200)
  const historyDialog = page.getByRole('dialog', { name: '记录历史' })
  await expect(historyDialog.locator('.history-entry')).toHaveCount(10)
  await expect(historyDialog.locator('#health-history-close')).toBeFocused()
  await page.screenshot({
    path: 'output/playwright/iteration-076-history-focus-mobile.png',
    fullPage: false,
  })

  await page.keyboard.press('Escape')
  await expect(historyDialog).toHaveCount(0)
  await expect(historyTrigger).toBeFocused()
  const reopenedPageResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/history?limit=10') && response.request().method() === 'GET',
  )
  await page.keyboard.press('Enter')
  expect((await reopenedPageResponse).status()).toBe(200)
  await expect(historyDialog.locator('.history-entry')).toHaveCount(10)

  const olderPageResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/history?limit=10&cursor=') && response.request().method() === 'GET',
  )
  await historyDialog.getByRole('button', { name: '继续载入更早版本' }).click()
  expect((await olderPageResponse).status()).toBe(200)
  await expect(historyDialog.locator('.history-entry')).toHaveCount(12)
  await expect(historyDialog.getByText('已载入全部版本')).toBeVisible()
  await historyDialog.locator('.history-sheet').evaluate((element) => {
    element.scrollTop = 0
  })
  await page.screenshot({
    path: 'output/playwright/iteration-047-progressive-revisions-mobile.png',
    fullPage: false,
  })
  expect(browserErrors).toEqual([])
})

test('health history freezes its accepted revisions when an older page is unavailable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await openRecords(page)
  const seed = await seedHealthRecordRevisions(page, 'stale-revision-history')
  expect(seed.statuses).toEqual([201, ...Array.from({ length: 11 }, () => 200)])

  await page.reload()
  const currentEntry = page.locator('.log-entry').first()
  await expect(currentEntry.getByText('v12')).toBeVisible()
  const historyTrigger = currentEntry.getByRole('button', { name: '历史' })
  await historyTrigger.click()
  const dialog = page.getByRole('dialog', { name: '记录历史' })
  await expect(dialog.locator('.history-entry')).toHaveCount(10)
  await expect(dialog.locator('#health-history-close')).toBeFocused()
  await page.screenshot({ path: 'output/playwright/iteration-076-history-focus-wide.png' })

  let olderReads = 0
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
        body: JSON.stringify({ message: 'raw history outage must stay hidden' }),
      })
      return
    }
    await route.continue()
  })

  await dialog.getByRole('button', { name: '继续载入更早版本' }).click()
  const readState = dialog.locator('.aggregate-history-read-state')
  await expect(readState.getByText('SERVICE PAUSED / 服务暂不可用')).toBeVisible()
  await expect(readState).toContainText('RETAINED 10 REVISIONS · CURSOR FROZEN')
  await expect(readState).not.toContainText('raw history outage')
  await expect(dialog.locator('.history-entry')).toHaveCount(10)
  await expect(dialog.getByRole('button', { name: '继续载入更早版本' })).toBeDisabled()
  const retry = dialog.getByRole('button', { name: '重试载入身体记录更早版本' })
  await expect(retry).toBeFocused()

  await page.screenshot({
    path: 'output/playwright/iteration-073-health-history-stale-wide.png',
  })

  await page.keyboard.press('Enter')
  await expect(readState).toHaveCount(0)
  await expect(dialog.locator('.history-entry')).toHaveCount(12)
  await expect(dialog.getByText('已载入全部版本')).toBeVisible()
  expect(olderReads).toBe(2)
  await dialog.locator('.history-layer__scrim').click({ position: { x: 4, y: 4 } })
  await expect(dialog).toHaveCount(0)
  await expect(historyTrigger).toBeFocused()
})

test('progress-photo inventory retains one private item after a refused refresh', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  await openProgressPhotos(page)
  await page.getByRole('button', { name: '保留用于对比' }).click()
  await page.getByRole('button', { name: '同意本次照片净化与拍摄条件机器检查' }).click()
  await page.getByRole('button', { name: '另行同意保留净化照片用于长期对比' }).click()
  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '拍摄或选择照片' }).click()
  const chooser = await chooserPromise
  const uploadResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/v1/progress-photos/') &&
      response.url().includes('/upload?token=') &&
      response.request().method() === 'POST',
  )
  await chooser.setFiles({
    name: 'progress.png',
    mimeType: 'image/png',
    buffer: validDemoProgressPng,
  })
  expect((await uploadResponse).status()).toBe(201)
  const retainedPhoto = page.locator('.photo-strip')
  await expect(retainedPhoto).toHaveCount(1)

  let refreshReads = 0
  await page.route('**/v1/progress-photos', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }
    refreshReads += 1
    if (refreshReads === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'raw storage outage must stay hidden' }),
      })
      return
    }
    await route.continue()
  })

  await page.getByRole('button', { name: '更新私密照片清单' }).click()
  const readState = page.locator('.private-inventory-state')
  await expect(readState.getByText('SERVICE PAUSED / 服务暂不可用')).toBeVisible()
  await expect(readState).toContainText('PRIVATE ITEMS 1 · PAGE MEMORY')
  await expect(readState).not.toContainText('raw storage outage')
  await expect(retainedPhoto).toHaveCount(1)
  await expect(page.getByRole('button', { name: '拍摄或选择照片' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '正面' })).toBeDisabled()
  await expect(retainedPhoto.getByRole('button', { name: '设为基准' })).toBeDisabled()
  await expect(retainedPhoto.getByRole('button', { name: '设为当前' })).toBeDisabled()
  await expect(retainedPhoto.getByRole('button', { name: '删除', exact: true })).toBeDisabled()
  const retry = page.getByRole('button', { name: '重新核对私有进度照片清单' })
  await expect(retry).toBeFocused()
  expect(
    await page.locator('.progress-page').evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return bounds.width <= window.innerWidth && element.scrollWidth <= window.innerWidth
    }),
  ).toBe(true)

  await readState.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: 'output/playwright/iteration-070-progress-inventory-stale-wide.png',
  })

  const retryResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/progress-photos') && response.request().method() === 'GET',
  )
  await retry.click()
  expect((await retryResponse).status()).toBe(200)
  await expect(readState).toHaveCount(0)
  await expect(retainedPhoto.getByRole('button', { name: '删除', exact: true })).toBeEnabled()
  expect(refreshReads).toBe(2)

  const deleteResponse = page.waitForResponse(
    (response) =>
      /\/v1\/progress-photos\/[0-9a-f-]{36}$/.test(response.url()) &&
      response.request().method() === 'DELETE',
  )
  await retainedPhoto.getByRole('button', { name: '删除', exact: true }).click()
  await page
    .getByRole('dialog', { name: '确认删除进度照' })
    .getByRole('button', { name: '确认删除' })
    .click()
  expect((await deleteResponse).status()).toBe(204)
  expect(browserErrors.filter((error) => !error.includes('status of 503'))).toEqual([])
})

test('ambiguous progress-photo reservation reuses one key and deletion reconciles narrowly', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors = collectBrowserErrors(page)
  await openProgressPhotos(page)
  const analysisConsent = page.getByRole('button', {
    name: '同意本次照片净化与拍摄条件机器检查',
  })
  await analysisConsent.click()

  let reservationAttempts = 0
  const idempotencyKeys: string[] = []
  await page.route('**/v1/progress-photos', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    reservationAttempts += 1
    idempotencyKeys.push(route.request().headers()['x-idempotency-key'] ?? '')
    if (reservationAttempts === 1) {
      const committedResponse = await route.fetch()
      expect(committedResponse.status()).toBe(201)
      await route.abort('failed')
      return
    }
    await route.continue()
  })

  const firstChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '拍摄或选择照片' }).click()
  const firstChooser = await firstChooserPromise
  await firstChooser.setFiles({
    name: 'progress.png',
    mimeType: 'image/png',
    buffer: validDemoProgressPng,
  })

  const reserveRecovery = page.locator('.progress-recovery')
  await expect(reserveRecovery.getByText('SAME REQUEST / 仅同一请求可重试')).toBeVisible()
  await expect(reserveRecovery).toContainText('无法确认这次进度照预约是否已提交')
  await expect(analysisConsent).toHaveAttribute('aria-pressed', 'true')
  const captureAction = page.getByRole('button', { name: '拍摄或选择照片' })
  await expect(captureAction).toBeDisabled()
  await expect(captureAction).toHaveCSS('opacity', '0.58')
  const retryReservation = reserveRecovery.getByRole('button', { name: '重新选择并重试预约' })
  await expect(retryReservation).toBeEnabled()
  await expect(retryReservation).toHaveCSS('opacity', '1')
  const unresolvedStorage = await page.evaluate(() => JSON.stringify({ ...localStorage }))
  expect(unresolvedStorage).not.toContain('progress.png')
  expect(unresolvedStorage).not.toContain('data:image')
  await reserveRecovery.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: 'output/playwright/iteration-057-progress-reserve-recovery-mobile.png',
  })

  const retryChooserPromise = page.waitForEvent('filechooser')
  await retryReservation.click()
  const retryChooser = await retryChooserPromise
  const uploadResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/v1/progress-photos/') &&
      response.url().includes('/upload?token=') &&
      response.request().method() === 'POST',
  )
  await retryChooser.setFiles({
    name: 'progress.png',
    mimeType: 'image/png',
    buffer: validDemoProgressPng,
  })
  expect((await uploadResponse).status()).toBe(201)
  await expect(page.locator('.photo-strip')).toHaveCount(1)
  expect(reservationAttempts).toBe(2)
  expect(idempotencyKeys[0]).not.toBe('')
  expect(idempotencyKeys[1]).toBe(idempotencyKeys[0])

  await page.route('**/v1/progress-photos/*', async (route) => {
    if (route.request().method() !== 'DELETE') {
      await route.continue()
      return
    }
    const committedResponse = await route.fetch()
    expect(committedResponse.status()).toBe(204)
    await route.abort('failed')
  })
  await page.getByRole('button', { name: '删除', exact: true }).click()
  const deleteDialog = page.getByRole('dialog', { name: '确认删除进度照' })
  await deleteDialog.getByRole('button', { name: '确认删除' }).click()
  const deleteRecovery = deleteDialog.locator('.progress-recovery')
  await expect(deleteRecovery.getByText('RECONCILE FIRST / 禁止直接重放')).toBeVisible()
  await expect(
    page.getByText('照片已从当前私有清单移除；对象删除由持久任务处理，可在数据权限中继续核对。'),
  ).toHaveCount(0)
  await page.screenshot({
    path: 'output/playwright/iteration-057-progress-delete-reconciliation-mobile.png',
  })
  await deleteRecovery.getByRole('button', { name: '核对服务端状态' }).click()
  await expect(
    page.getByText(
      '核对完成：照片已离开当前私有清单；对象删除由持久任务继续处理，不能仅据此声称物理字节已经删除。',
    ),
  ).toBeVisible()
  await expect(page.locator('.photo-strip')).toHaveCount(0)
  expect(
    browserErrors.filter((error) => error !== 'Failed to load resource: net::ERR_FAILED'),
  ).toEqual([])
})

test('ambiguous progress-photo upload reconciles ready state without replaying media', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors = collectBrowserErrors(page)
  await openProgressPhotos(page)
  const analysisConsent = page.getByRole('button', {
    name: '同意本次照片净化与拍摄条件机器检查',
  })
  await analysisConsent.click()

  await page.route(/\/v1\/progress-photos\/[0-9a-f-]{36}\/upload\?token=/, async (route) => {
    const committedResponse = await route.fetch()
    expect(committedResponse.status()).toBe(201)
    await route.abort('failed')
  })
  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '拍摄或选择照片' }).click()
  const chooser = await chooserPromise
  await chooser.setFiles({
    name: 'progress.png',
    mimeType: 'image/png',
    buffer: validDemoProgressPng,
  })

  const uploadRecovery = page.locator('.progress-recovery')
  await expect(uploadRecovery.getByText('RECONCILE FIRST / 禁止直接重放')).toBeVisible()
  await expect(uploadRecovery).toContainText('无法确认进度照上传与画质检查的服务端结果')
  await expect(page.locator('.photo-strip')).toHaveCount(0)
  await expect(analysisConsent).toHaveAttribute('aria-pressed', 'true')
  await uploadRecovery.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: 'output/playwright/iteration-057-progress-upload-reconciliation-mobile.png',
  })

  await uploadRecovery.getByRole('button', { name: '核对服务端状态' }).click()
  await expect(
    page.getByText('核对完成：净化照片已进入当前私有清单；机器结果仍只描述拍摄条件。'),
  ).toBeVisible()
  await expect(page.locator('.photo-strip')).toHaveCount(1)

  const deleteResponse = page.waitForResponse(
    (response) =>
      /\/v1\/progress-photos\/[0-9a-f-]{36}$/.test(response.url()) &&
      response.request().method() === 'DELETE',
  )
  await page.getByRole('button', { name: '删除', exact: true }).click()
  await page
    .getByRole('dialog', { name: '确认删除进度照' })
    .getByRole('button', {
      name: '确认删除',
    })
    .click()
  expect((await deleteResponse).status()).toBe(204)
  await expect(
    page.getByText('照片已从当前私有清单移除；对象删除由持久任务处理，可在数据权限中继续核对。'),
  ).toBeVisible()
  expect(
    browserErrors.filter((error) => error !== 'Failed to load resource: net::ERR_FAILED'),
  ).toEqual([])
})
