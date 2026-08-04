import { expect, test, type Page } from '@playwright/test'
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { Pool } from 'pg'

const subjectStorageKey = 'myfitness.dev.subject'
const database = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgresql://myfitness:myfitness_local@127.0.0.1:54329/myfitness',
})
const objectStorage = new S3Client({
  region: process.env.OBJECT_STORAGE_REGION ?? 'us-east-1',
  endpoint: process.env.OBJECT_STORAGE_ENDPOINT ?? 'http://127.0.0.1:9000',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID ?? 'myfitness-minio',
    secretAccessKey:
      process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY ?? 'myfitness-minio-secret-2026-local',
  },
})
let trackedSubject: string | undefined
let testStartedAt: Date

test.beforeEach(async ({ page }) => {
  trackedSubject = undefined
  const result = await database.query<{ started_at: Date }>(
    'SELECT clock_timestamp() AS started_at',
  )
  testStartedAt = result.rows[0]!.started_at
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
  let userId: string | undefined
  if (subject) {
    const identity = await database.query<{ user_id: string }>(
      `SELECT user_id FROM auth_identities
       WHERE provider = 'dev' AND provider_subject = $1`,
      [subject],
    )
    userId = identity.rows[0]?.user_id
    if (userId) await database.query('DELETE FROM users WHERE id = $1', [userId])
  }
  await database.query('DELETE FROM data_operation_jobs WHERE created_at >= $1', [testStartedAt])
  if (userId) {
    const listed = await objectStorage.send(
      new ListObjectsV2Command({
        Bucket: process.env.OBJECT_STORAGE_BUCKET ?? 'myfitness-private',
        Prefix: `${process.env.PHOTO_OBJECT_PREFIX ?? 'private-photos'}/${userId}/`,
      }),
    )
    const keys = (listed.Contents ?? []).flatMap((object) => (object.Key ? [object.Key] : []))
    if (keys.length) {
      await objectStorage.send(
        new DeleteObjectsCommand({
          Bucket: process.env.OBJECT_STORAGE_BUCKET ?? 'myfitness-private',
          Delete: { Quiet: true, Objects: keys.map((Key) => ({ Key })) },
        }),
      )
    }
  }
})

test.afterAll(async () => {
  objectStorage.destroy()
  await database.end()
})

const openNutrition = async (page: Page) => {
  await page.goto('/')
  await page.getByRole('button', { name: '饮食', exact: true }).click()
  await expect(page.getByText('把一餐拆清楚，不必把数字吃成压力。')).toBeVisible()
}

const collectBrowserErrors = (page: Page) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  return browserErrors
}

const demoMealPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAUAAAADwCAIAAAD+Tyo8AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAGP0lEQVR4nO3VUQ0DARAC0fMv4fRUxMiph/6QZl+CgM0Ay9PnJQQQ6D+L8MwvIAQQSIGFAIHu7YEF3ntACKTAQoBA976hBd57QAikwEKAQPe+oQXee0AIpMBCgED3vqEF3ntACKTAQoBA976hBd57QAikwEKAQPe+oQXee0AIpMBCgED3vqEF3ntACKTAQoBA976hBd57QAikwEKAQPe+oQXee0AIpMBCgED3vqEF3ntACKTAQoBA976hBd57QAikwEKAQPe+oQXee0AIpMBCgED3vqEF3ntACKTAQoBA976hBd57QAikwEKAQPe+oQXee0AIpMBCgED3vqEF3ntACKTAQoBA976hBd57QAikwEKAQPe+oQXee0AIpMBCgED3vqEF3ntACKTAQoBA976hBd57QAikwEKAQPe+oQXee0AIpMBCgED3vqEF3ntACKTAQoBA976hBd57QAikwEKAQPe+oQXee0AIpMBCgED3vqEF3ntACKTAQoBA976hBd57QAikwEKAQPe+oQXee0AIpMBCgED3vqEF3ntACKTAQoBA976hBd57QAikwEKAQPe+oQXee0AIKLAQIPAefAQWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASGQAgsBAt37hhZ47wEhkAILAQLd+4YWeO8BIZACCwEC3fuGFnjvASHQrzH4AgeTbtrUvzNbAAAAAElFTkSuQmCC',
  'base64',
)

const validDemoMealPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFUlEQVQYlWO4cWQWHsQwKn0ES7AAAP7B3Rk90PKpAAAAAElFTkSuQmCC',
  'base64',
)

const uploadDemoMealPhoto = async (page: Page) => {
  await page.getByRole('button', { name: /我同意本次上传与上述处理/ }).click()
  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '选择一张餐食照片' }).click()
  const fileChooser = await fileChooserPromise
  const uploadResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/v1/nutrition/photo-candidates/') &&
      response.url().includes('/upload?token=') &&
      response.request().method() === 'POST',
  )
  await fileChooser.setFiles({ name: 'meal.png', mimeType: 'image/png', buffer: validDemoMealPng })
  expect((await uploadResponse).status()).toBe(201)
  await expect(page.getByText('本地演示夹具 · 非真实识别')).toBeVisible()
}

test('meal completes favorite, create, repeat, update, history and delete lifecycle', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors = collectBrowserErrors(page)

  await openNutrition(page)
  await expect(page.getByText('还没有饮食记录')).toBeVisible()
  await page.getByRole('button', { name: '添加熟鸡胸肉' }).click()
  await page.getByRole('button', { name: '添加熟米饭' }).click()
  await page.locator('[aria-label="进餐时间使用的 IANA 时区"] input').fill('Asia/Shanghai')
  await page.locator('[aria-label="进餐时间，年-月-日 时:分"] input').fill('2026-07-18 12:30')
  await expect(page.getByLabel('本餐营养汇总预览').getByText('393')).toBeVisible()
  await expect(page.getByLabel('本餐营养汇总预览').getByText('41.3')).toBeVisible()

  const favoritePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/nutrition/favorites/rice_cooked') &&
      response.request().method() === 'PUT',
  )
  await page.getByRole('button', { name: '收藏熟米饭' }).click()
  expect((await favoritePromise).status()).toBe(200)
  await expect(page.getByRole('button', { name: '取消收藏熟米饭' })).toBeVisible()

  const firstCreatePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/nutrition/meals') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '保存餐次', exact: true }).click()
  const firstCreate = await firstCreatePromise
  expect(firstCreate.status()).toBe(201)
  expect(firstCreate.request().postDataJSON()).toMatchObject({
    occurredAt: '2026-07-18T04:30:00.000Z',
    timezone: 'Asia/Shanghai',
  })
  await expect(page.locator('.meal-entry')).toHaveCount(1)
  await expect(page.locator('.meal-entry').first().getByText('393')).toBeVisible()

  await page.locator('.meal-entry').first().getByRole('button', { name: '再记一次' }).click()
  await expect(page.getByLabel('本餐营养汇总预览').getByText('393')).toBeVisible()
  const repeatedCreatePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/nutrition/meals') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '保存餐次', exact: true }).click()
  expect((await repeatedCreatePromise).status()).toBe(201)
  await expect(page.locator('.meal-entry')).toHaveCount(2)

  await page.locator('.meal-entry').first().getByRole('button', { name: '修改' }).click()
  await page.locator('[aria-label="熟米饭份量"] input').fill('200')
  await expect(page.getByLabel('本餐营养汇总预览').getByText('458')).toBeVisible()
  const updatePromise = page.waitForResponse(
    (response) =>
      /\/v1\/nutrition\/meals\/[0-9a-f-]{36}$/.test(response.url()) &&
      response.request().method() === 'PUT',
  )
  await page.getByRole('button', { name: '保存餐次新版本' }).click()
  expect((await updatePromise).status()).toBe(200)
  await expect(page.locator('.meal-entry').first().getByText('458')).toBeVisible()
  await expect(page.locator('.meal-entry').first().getByText('v2')).toBeVisible()

  const historyPromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith('/history') &&
      response.request().method() === 'GET',
  )
  await page.locator('.meal-entry').first().getByRole('button', { name: '历史' }).click()
  expect((await historyPromise).status()).toBe(200)
  await expect(page.getByRole('dialog', { name: '餐次历史' }).getByText('修改餐次')).toBeVisible()
  await expect(page.getByRole('dialog', { name: '餐次历史' }).getByText('创建餐次')).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-006-nutrition-mobile.png',
    fullPage: true,
  })
  await page.getByRole('button', { name: '关闭餐次历史' }).first().click()

  await page.locator('.meal-entry').first().getByRole('button', { name: '删除' }).click()
  await expect(page.getByRole('dialog', { name: '确认删除餐次' })).toBeVisible()
  const deletePromise = page.waitForResponse(
    (response) =>
      /\/v1\/nutrition\/meals\/[0-9a-f-]{36}$/.test(response.url()) &&
      response.request().method() === 'DELETE',
  )
  await page.getByRole('button', { name: '确认删除' }).click()
  expect((await deletePromise).status()).toBe(204)
  await expect(page.locator('.meal-entry')).toHaveCount(1)
  await expect(page.getByText('餐次已从日常记录移除，版本历史仍保留。')).toBeVisible()
  expect(browserErrors).toEqual([])
})

test('meal editor and ledger remain balanced at wide viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const browserErrors = collectBrowserErrors(page)

  await openNutrition(page)
  await expect(page.getByText('饮食记录簿')).toBeVisible()
  await expect(page.getByText('还没有饮食记录')).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-006-nutrition-wide.png',
    fullPage: true,
  })
  expect(browserErrors).toEqual([])
})

test('meal editor restores only whitelisted form fields and clears the draft after save', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors = collectBrowserErrors(page)
  await openNutrition(page)

  const title = page.locator('.nutrition-title-input input')
  await title.fill('训练后的晚餐')
  await page.getByRole('button', { name: '添加熟鸡胸肉' }).click()
  await expect(page.getByText('未完成内容已暂存')).toBeVisible()
  await page.reload()
  await expect(page.getByText('发现一份未完成记录')).toBeVisible()
  await page.getByRole('button', { name: '恢复草稿' }).click()
  await expect(title).toHaveValue('训练后的晚餐')
  await expect(page.locator('.meal-item')).toHaveCount(1)
  await expect(page.getByText('仅保存表单字段，不包含照片、授权材料或 AI 待审内容。')).toBeVisible()

  const createResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/nutrition/meals') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '保存餐次', exact: true }).click()
  expect((await createResponse).status()).toBe(201)
  expect(await page.evaluate(() => localStorage.getItem('myfitness.local-draft.meal'))).toBeNull()
  expect(browserErrors).toEqual([])
})

test('meal correction draft refuses a stale server revision without overwriting it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors = collectBrowserErrors(page)
  await openNutrition(page)

  await page.getByRole('button', { name: '添加熟鸡胸肉' }).click()
  await page.getByRole('button', { name: '保存餐次', exact: true }).click()
  await expect(page.locator('.meal-entry')).toHaveCount(1)
  await page.locator('.meal-entry').first().getByRole('button', { name: '修改' }).click()
  await page.locator('.nutrition-title-input input').fill('未保存的餐次修改')
  await expect(page.getByText('未保存修改已暂存')).toBeVisible()

  await page.reload()
  await expect(page.getByText('发现一份未完成修改')).toBeVisible()
  await page.route(/\/v1\/nutrition\/meals\/[0-9a-f-]{36}$/, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }
    const response = await route.fetch()
    const body = (await response.json()) as { revision: number }
    await route.fulfill({ response, json: { ...body, revision: body.revision + 1 } })
  })
  await page.getByRole('button', { name: '恢复修改' }).click()
  await expect(page.getByText(/修改基于旧版本或已删除餐次/)).toBeVisible()
  await expect(page.getByText('发现一份未完成修改')).not.toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('myfitness.local-draft.meal'))).toBeNull()
  expect(browserErrors).toEqual([])
})

test('daily nutrition observation keeps recorded and missing local days explicit', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors = collectBrowserErrors(page)
  await openNutrition(page)

  await page.getByRole('button', { name: '添加熟鸡胸肉' }).click()
  await page.getByRole('button', { name: '保存餐次', exact: true }).click()
  await expect(page.locator('.meal-entry')).toHaveCount(1)

  const insightResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/v1/insights/nutrition') && response.request().method() === 'GET',
  )
  await page.getByRole('button', { name: '查看每日营养趋势' }).click()
  expect((await insightResponse).status()).toBe(200)
  await expect(page.getByText('看见记录留下的形状，也看见没有记录的空白。')).toBeVisible()
  await expect(page.locator('.nutrition-evidence-day')).toHaveCount(30)
  await expect(page.getByText('无记录，不等于零摄入')).toHaveCount(6)
  await expect(
    page.getByText('纤维有标注 1/1 个食物条目。未标注部分不会按 0 g 计入。'),
  ).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-040-nutrition-observation-mobile.png',
    fullPage: true,
  })

  await page.getByRole('button', { name: '7 天' }).click()
  await expect(page.locator('.nutrition-evidence-day')).toHaveCount(7)
  await expect(page.getByLabel('有记录日 1')).toBeVisible()
  await expect(page.getByLabel('无记录日 6')).toBeVisible()
  await page.getByRole('button', { name: '纤维' }).click()
  await expect(page.getByText('7 天 · 纤维 g')).toBeVisible()
  expect(browserErrors).toEqual([])
})

test('owned food stays reusable and corrections never rewrite the meal draft snapshot', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors = collectBrowserErrors(page)
  await openNutrition(page)

  await page.getByRole('button', { name: '管理我的食物' }).click()
  await expect(page.getByText('我的食物，是可修订的定义，不是会漂移的历史。')).toBeVisible()
  await page.getByRole('button', { name: '＋ 新建食物' }).click()
  await page.locator('[aria-label="自定义食物名称"] input').fill('家庭炖牛肉')
  await page.locator('[aria-label="自定义别名（逗号分隔）"] input').fill('周末炖牛肉')
  await page.locator('[aria-label="自定义默认克重"] input').fill('180')
  await page.locator('[aria-label="自定义热量 kcal"] input').fill('186')
  await page.locator('[aria-label="自定义蛋白质 g"] input').fill('22')
  await page.locator('[aria-label="自定义碳水 g"] input').fill('4')
  await page.locator('[aria-label="自定义脂肪 g"] input').fill('9')
  await page.locator('[aria-label="自定义膳食纤维 g（可选）"] input').fill('0.8')
  await page.locator('[aria-label="自定义数据依据（必填）"] input').fill('家庭配方估算：2026-08-05')
  await page.locator('.food-editor__categories').getByRole('button', { name: '蛋白来源' }).click()

  const createResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/food-catalog') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '保存定义' }).click()
  expect((await createResponse).status()).toBe(201)
  await expect(page.getByText('自建食物已保存；返回餐食页后可从“我的”列表加入本餐。')).toBeVisible()
  await page.getByRole('button', { name: '返回餐食记录' }).click()
  await page.getByRole('button', { name: '我的 1' }).click()
  await page.getByRole('button', { name: '添加家庭炖牛肉' }).click()
  await expect(page.locator('.meal-item').getByText('家庭炖牛肉')).toBeVisible()
  await expect(page.getByText('家庭炖牛肉已加入本餐，请确认实际份量。')).toBeVisible()

  const historyResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith('/history') &&
      response.request().method() === 'GET',
  )
  await page.getByRole('button', { name: '编辑家庭炖牛肉' }).click()
  expect((await historyResponse).status()).toBe(200)
  await page.locator('[aria-label="自定义食物名称"] input').fill('低脂家庭炖牛肉')
  await page.locator('[aria-label="自定义热量 kcal"] input').fill('165')
  await page.locator('[aria-label="自定义脂肪 g"] input').fill('6.5')
  await page
    .locator('[aria-label="自定义数据依据（必填）"] input')
    .fill('家庭配方重新称量：2026-08-06')
  const updateResponse = page.waitForResponse(
    (response) =>
      /\/v1\/food-catalog\/[0-9a-f-]{36}$/.test(response.url()) &&
      response.request().method() === 'PUT',
  )
  await page.getByRole('button', { name: '保存纠正' }).click()
  expect((await updateResponse).status()).toBe(200)
  await expect(
    page.getByText('定义已纠正；餐食页中的当前草稿、历史餐食和收藏快照不会被改写。'),
  ).toBeVisible()
  await page.getByRole('button', { name: '返回餐食记录' }).click()
  await expect(page.locator('.meal-item').getByText('家庭炖牛肉')).toBeVisible()
  await expect(page.locator('.meal-item').getByText('低脂家庭炖牛肉')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '添加低脂家庭炖牛肉' })).toBeVisible()

  const revisedHistoryResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith('/history') &&
      response.request().method() === 'GET',
  )
  await page.getByRole('button', { name: '编辑低脂家庭炖牛肉' }).click()
  expect((await revisedHistoryResponse).status()).toBe(200)
  await expect(page.locator('.food-editor__history').getByText(/R2 · 纠正/)).toBeVisible()
  await expect(page.locator('.food-editor__history').getByText(/R1 · 创建/)).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-039-user-food-catalog-mobile.png',
    fullPage: true,
  })

  const archiveResponse = page.waitForResponse(
    (response) =>
      /\/v1\/food-catalog\/[0-9a-f-]{36}$/.test(response.url()) &&
      response.request().method() === 'DELETE',
  )
  await page.getByRole('button', { name: '归档', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '确认归档自建食物' })).toBeVisible()
  await page.getByRole('button', { name: '确认归档' }).click()
  expect((await archiveResponse).status()).toBe(200)
  await expect(page.getByText('自建食物已归档；历史餐食与收藏未被改写。')).toBeVisible()
  await page.getByRole('button', { name: '返回餐食记录' }).click()
  await expect(page.getByRole('button', { name: '添加低脂家庭炖牛肉' })).toHaveCount(0)
  await expect(page.locator('.meal-item').getByText('家庭炖牛肉')).toBeVisible()
  expect(browserErrors).toEqual([])
})

test('food photo candidates require review, delete media and only fill an unsaved draft', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors = collectBrowserErrors(page)
  await openNutrition(page)

  await expect(page.getByRole('button', { name: '选择一张餐食照片' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await uploadDemoMealPhoto(page)
  await expect(page.getByText('未确认 / PROOF')).toBeVisible()
  await expect(page.getByText('估计 100–220 g')).toBeVisible()
  await expect(page.getByText('中置信')).toBeVisible()
  await expect(page.locator('.meal-entry')).toHaveCount(0)
  await page.locator('[aria-label="熟米饭确认克重"] input').fill('165')
  await page.locator('[aria-label="熟鸡胸肉确认克重"] input').fill('120')
  await page.screenshot({
    path: 'output/playwright/iteration-010-food-photo-mobile.png',
    fullPage: true,
  })

  const confirmResponse = page.waitForResponse(
    (response) => response.url().endsWith('/confirm') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '确认 2 项并带入草稿' }).click()
  expect((await confirmResponse).status()).toBe(200)
  await expect(
    page.getByText('候选已带入当前草稿，照片已删除；餐次尚未保存，请继续核对。'),
  ).toBeVisible()
  await expect(page.getByText('未确认 / PROOF')).toHaveCount(0)
  await expect(page.locator('.meal-item')).toHaveCount(2)
  await expect(page.locator('.meal-entry')).toHaveCount(0)
  expect(browserErrors).toEqual([])
})

test('food photo proof sheet is readable at wide viewport and can be revoked', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const browserErrors = collectBrowserErrors(page)
  await openNutrition(page)
  await uploadDemoMealPhoto(page)
  await expect(page.locator('.photo-review')).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-010-food-photo-wide.png',
    fullPage: true,
  })

  const deleteResponse = page.waitForResponse(
    (response) =>
      /\/v1\/nutrition\/photo-candidates\/[0-9a-f-]{36}$/.test(response.url()) &&
      response.request().method() === 'DELETE',
  )
  await page.getByRole('button', { name: '删除校样' }).click()
  expect((await deleteResponse).status()).toBe(204)
  await expect(page.getByText('照片和衍生候选已删除。')).toBeVisible()
  expect(browserErrors).toEqual([])
})
