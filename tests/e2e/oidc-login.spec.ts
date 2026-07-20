import { createHash } from 'node:crypto'

import { expect, test, type Page, type Route } from '@playwright/test'

const browserOrigin = 'http://127.0.0.1:4173'
const apiOrigin = 'http://127.0.0.1:3100'
const issuer = `${browserOrigin}/__oidc`
const authorizationUrl = `${issuer}/authorize`
const redirectUri = `${browserOrigin}/auth/callback`
const transactionKey = 'myfitness.auth.oidc.transaction'
const callbackTargetKey = 'myfitness.auth.oidc.callbackTarget'

type AuthorizationQuery = {
  state: string
  nonce: string
  codeChallenge: string
}

const fulfillConfig = (route: Route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      issuer,
      authorizationUrl,
      clientId: 'myfitness-h5-browser-test',
      redirectUri,
      scopes: ['openid'],
    }),
  })

const configureApi = async (page: Page) => {
  await page.route(`${apiOrigin}/v1/auth/oidc/config`, fulfillConfig)
  await page.route(`${apiOrigin}/v1/me/onboarding`, (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }),
  )
}

const authorizationValues = (route: Route): AuthorizationQuery => {
  const requestUrl = new URL(route.request().url())
  expect(requestUrl.origin + requestUrl.pathname).toBe(authorizationUrl)
  expect(requestUrl.searchParams.get('response_type')).toBe('code')
  expect(requestUrl.searchParams.get('client_id')).toBe('myfitness-h5-browser-test')
  expect(requestUrl.searchParams.get('redirect_uri')).toBe(redirectUri)
  expect(requestUrl.searchParams.get('scope')).toBe('openid')
  expect(requestUrl.searchParams.get('code_challenge_method')).toBe('S256')
  const state = requestUrl.searchParams.get('state') ?? ''
  const nonce = requestUrl.searchParams.get('nonce') ?? ''
  const codeChallenge = requestUrl.searchParams.get('code_challenge') ?? ''
  expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(nonce).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/)
  return { state, nonce, codeChallenge }
}

const browserErrors = (page: Page) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
      errors.push(message.text())
    }
  })
  return errors
}

test('H5 OIDC binds state, nonce and S256 before one-time session exchange', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const errors = browserErrors(page)
  await configureApi(page)
  let authorization: AuthorizationQuery | undefined
  let exchangeCount = 0

  await page.route(`${authorizationUrl}?**`, (route) => {
    authorization = authorizationValues(route)
    return route.fulfill({
      status: 302,
      headers: {
        location: `${redirectUri}?code=authorization-code-123&state=${authorization.state}&iss=${encodeURIComponent(issuer)}`,
      },
    })
  })
  await page.route(`${apiOrigin}/v1/auth/oidc/session`, async (route) => {
    exchangeCount += 1
    const body = route.request().postDataJSON() as {
      code: string
      codeVerifier: string
      nonce: string
      redirectUri: string
    }
    expect(authorization).toBeDefined()
    expect(body).toMatchObject({
      code: 'authorization-code-123',
      nonce: authorization?.nonce,
      redirectUri,
    })
    expect(createHash('sha256').update(body.codeVerifier).digest('base64url')).toBe(
      authorization?.codeChallenge,
    )
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'mf_user_browser_oidc_abcdefghijklmnopqrstuvwxyz0123456789',
        userId: '0190d8f9-89ca-7cc4-8e3a-a5f3e74c6eb8',
        provider: 'oidc',
        isNewUser: true,
        expiresAt: '2026-07-27T00:00:00.000Z',
      }),
    })
  })

  await page.goto('/#/pages/login/index')
  await expect(page.getByRole('button', { name: '继续登录' })).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-029-oidc-login-mobile.png',
    fullPage: true,
  })
  await page.getByRole('button', { name: '继续登录' }).click()

  await expect(page).toHaveURL(/#\/pages\/onboarding\/index$/)
  expect(exchangeCount).toBe(1)
  expect(page.url()).not.toContain('authorization-code-123')
  expect(page.url()).not.toContain('state=')
  expect(
    await page.evaluate(
      ({ transaction, callbackTarget }) => ({
        transaction: sessionStorage.getItem(transaction),
        callbackTarget: sessionStorage.getItem(callbackTarget),
      }),
      { transaction: transactionKey, callbackTarget: callbackTargetKey },
    ),
  ).toEqual({ transaction: null, callbackTarget: null })
  expect(errors).toEqual([])
})

test('H5 OIDC cleans a provider denial and displays only product-owned error copy', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const errors = browserErrors(page)
  await configureApi(page)
  let exchangeCount = 0
  await page.route(`${authorizationUrl}?**`, (route) => {
    const authorization = authorizationValues(route)
    return route.fulfill({
      status: 302,
      headers: {
        location: `${redirectUri}?error=access_denied&error_description=DO_NOT_RENDER_PROVIDER_TEXT&state=${authorization.state}`,
      },
    })
  })
  await page.route(`${apiOrigin}/v1/auth/oidc/session`, (route) => {
    exchangeCount += 1
    return route.abort()
  })

  await page.goto('/#/pages/login/index')
  await page.getByRole('button', { name: '继续登录' }).click()

  await expect(page.getByText('登录已取消')).toBeVisible()
  await expect(page.getByText('DO_NOT_RENDER_PROVIDER_TEXT')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '重新开始登录' })).toBeVisible()
  expect(exchangeCount).toBe(0)
  expect(page.url()).toBe(`${browserOrigin}/#/pages/login/index`)
  await page.screenshot({
    path: 'output/playwright/iteration-029-oidc-denied-mobile.png',
    fullPage: true,
  })
  expect(errors).toEqual([])
})

test('H5 OIDC protects the default entry and remains legible at a wide viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const errors = browserErrors(page)
  await configureApi(page)

  await page.goto('/')
  await expect(page).toHaveURL(/#\/pages\/login\/index$/)
  await expect(page.getByText('一次登录，一条短轨迹。')).toBeVisible()
  await expect(page.getByRole('button', { name: '继续登录' })).toBeVisible()
  await page.screenshot({
    path: 'output/playwright/iteration-029-oidc-login-wide.png',
    fullPage: true,
  })
  expect(errors).toEqual([])
})
