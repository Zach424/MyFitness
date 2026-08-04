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

const openRecords = async (page: Page) => {
  await page.goto('/')
  await page.getByRole('button', { name: '记录', exact: true }).click()
  await expect(page.getByText('记录身体，也记录恢复。')).toBeVisible()
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

  await page.getByRole('button', { name: '删除' }).click()
  await expect(page.getByRole('dialog', { name: '确认删除记录' })).toBeVisible()
  const deleteResponsePromise = page.waitForResponse(
    (response) =>
      /\/v1\/health-records\/[0-9a-f-]{36}$/.test(response.url()) &&
      response.request().method() === 'DELETE',
  )
  await page.getByRole('button', { name: '确认删除' }).click()
  expect((await deleteResponsePromise).status()).toBe(204)
  await expect(page.getByText('还没有身体记录')).toBeVisible()
  await expect(page.getByText('记录已从列表移除，审计历史仍安全保留。')).toBeVisible()
  expect(browserErrors).toEqual([])
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
  const createStatuses = await page.evaluate(async () => {
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
      const response = await fetch('http://127.0.0.1:3100/v1/health-records', {
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
  })
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
  const seed = await page.evaluate(async () => {
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
    const createdResponse = await fetch('http://127.0.0.1:3100/v1/health-records', {
      method: 'POST',
      headers: { ...headers, 'x-idempotency-key': 'progressive-revision-history' },
      body: JSON.stringify(payload(70)),
    })
    let current = (await createdResponse.json()) as { id: string; revision: number }
    const statuses = [createdResponse.status]
    for (let revision = 2; revision <= 12; revision += 1) {
      const response = await fetch(`http://127.0.0.1:3100/v1/health-records/${current.id}`, {
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
  })
  expect(seed.statuses).toEqual([201, ...Array.from({ length: 11 }, () => 200)])
  expect(seed.revision).toBe(12)

  await page.reload()
  const currentEntry = page.locator('.log-entry').first()
  await expect(currentEntry.getByText('v12')).toBeVisible()
  const firstPageResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/history?limit=10') && response.request().method() === 'GET',
  )
  await currentEntry.getByRole('button', { name: '历史' }).click()
  expect((await firstPageResponse).status()).toBe(200)
  const historyDialog = page.getByRole('dialog', { name: '记录历史' })
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
