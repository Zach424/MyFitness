import { expect, test, type APIRequestContext } from '@playwright/test'
import { Pool } from 'pg'

const localDatabaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://myfitness:myfitness_local@127.0.0.1:54329/myfitness'
const parsedDatabaseUrl = new URL(localDatabaseUrl)
if (
  parsedDatabaseUrl.hostname !== '127.0.0.1' ||
  parsedDatabaseUrl.port !== '54329' ||
  parsedDatabaseUrl.pathname !== '/myfitness'
) {
  throw new Error(
    'administrator E2E cleanup is restricted to the dedicated local MyFitness database',
  )
}

const pool = new Pool({ connectionString: localDatabaseUrl, max: 1 })
let api: APIRequestContext
let accountId = ''

test.beforeAll(async ({ playwright }) => {
  const existing = await pool.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM admin_operators',
  )
  if (existing.rows[0]?.count !== '0') {
    throw new Error('administrator E2E refuses to truncate pre-existing local operator data')
  }
  api = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3100/v1/' })
  const session = await api.post('auth/dev/session', {
    data: { subject: `admin-e2e-user-${Date.now()}` },
  })
  const sessionPayload = (await session.json()) as { userId?: string; message?: string }
  expect(session.ok(), JSON.stringify(sessionPayload)).toBe(true)
  accountId = String(sessionPayload.userId)
})

test.afterAll(async () => {
  await api?.dispose()
  if (accountId) await pool.query('DELETE FROM users WHERE id = $1', [accountId])
  await pool.query(`
    TRUNCATE admin_audit_events, admin_oidc_exchanges, admin_sessions,
             admin_operator_roles, admin_identities, admin_operators
  `)
  await pool.end()
})

const completeLookup = async (page: import('@playwright/test').Page, ticket: string) => {
  await page.getByRole('button', { name: '进入本地只读演示' }).click()
  await expect(page.getByRole('heading', { name: '证据够用，内容不越界。' })).toBeVisible()

  const cookies = await page.context().cookies('http://127.0.0.1:3101')
  expect(cookies.find((cookie) => cookie.name === 'myfitness_admin_session')).toMatchObject({
    httpOnly: true,
    sameSite: 'Strict',
  })

  await page.getByLabel('精确账户 ID').fill(accountId)
  await page.getByLabel('工单号').fill(ticket)
  await page.getByRole('radio', { name: /数据导出/ }).check()
  await page.getByRole('button', { name: '记录依据并查询' }).click()

  const result = page.locator('.result-panel')
  await expect(result.getByText(accountId)).toBeVisible()
  await expect(result.getByText('正常')).toBeVisible()
  await expect(result.getByText('LOOKUP RECEIPT')).toBeVisible()
  await expect(page.getByText('账户证据查询').first()).toBeVisible()
  const resultText = await result.innerText()
  expect(resultText).not.toContain('provider_subject')
  expect(resultText).not.toContain('训练内容')
  expect(resultText).not.toContain('照片内容')
}

test('wide evidence desk completes an exact, audited, read-only support lookup', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 })
  const response = await page.goto('http://127.0.0.1:3101')
  expect(response?.headers()['content-security-policy']).toContain("frame-ancestors 'none'")
  await expect(page.getByRole('heading', { name: /先证明身份/ })).toBeVisible()
  await completeLookup(page, 'SUP-E2E-WIDE-01')
  await page.screenshot({
    path: 'output/playwright/iteration-014-admin-wide.png',
    fullPage: true,
  })
  await page.getByRole('button', { name: '撤销会话' }).click()
  await expect(page.getByRole('heading', { name: /先证明身份/ })).toBeVisible()
})

test('mobile evidence desk preserves the request, proof and summary reading order', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://127.0.0.1:3101')
  await completeLookup(page, 'SUP-E2E-MOBILE-01')
  const headings = await page.locator('h2').allTextContents()
  expect(headings).toEqual(['建立查询依据', '访问证据轨', '账户证据摘要'])
  await page.screenshot({
    path: 'output/playwright/iteration-014-admin-mobile.png',
    fullPage: true,
  })
})
