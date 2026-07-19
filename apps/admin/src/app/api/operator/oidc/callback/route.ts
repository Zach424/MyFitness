import { timingSafeEqual } from 'node:crypto'

import { adminSessionSchema } from '@myfitness/contracts'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import {
  adminApi,
  adminSessionCookie,
  oidcClientConfig,
  oidcNonceCookie,
  oidcStateCookie,
  oidcVerifierCookie,
  sessionCookieOptions,
  transientCookieOptions,
} from '@/lib/admin-server'

export const dynamic = 'force-dynamic'

const sameValue = (left: string, right: string) => {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

const clearOidcCookies = (response: NextResponse) => {
  for (const name of [oidcStateCookie, oidcVerifierCookie, oidcNonceCookie]) {
    response.cookies.set(name, '', { ...transientCookieOptions, maxAge: 0 })
  }
}

const failure = (request: Request, code: string) => {
  const response = NextResponse.redirect(new URL(`/?authError=${code}`, request.url))
  clearOidcCookies(response)
  return response
}

export async function GET(request: Request) {
  const config = oidcClientConfig()
  if (!config) return failure(request, 'oidc_not_configured')
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const returnedState = url.searchParams.get('state')
  const cookieStore = await cookies()
  const expectedState = cookieStore.get(oidcStateCookie)?.value
  const verifier = cookieStore.get(oidcVerifierCookie)?.value
  const nonce = cookieStore.get(oidcNonceCookie)?.value
  if (
    !code ||
    !returnedState ||
    !expectedState ||
    !sameValue(returnedState, expectedState) ||
    !verifier ||
    !nonce
  ) {
    return failure(request, 'oidc_state_invalid')
  }

  let idToken: string | undefined
  try {
    const tokenResponse = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.redirectUri,
        client_id: config.clientId,
        code_verifier: verifier,
      }),
      cache: 'no-store',
    })
    const payload = (await tokenResponse.json()) as { id_token?: unknown }
    if (tokenResponse.ok && typeof payload.id_token === 'string') idToken = payload.id_token
  } catch {
    idToken = undefined
  }
  if (!idToken) return failure(request, 'oidc_exchange_failed')

  const exchanged = await adminApi('/admin/auth/oidc/exchange', {
    method: 'POST',
    body: JSON.stringify({ idToken, nonce }),
  })
  const parsed = adminSessionSchema.safeParse(exchanged.body)
  if (!parsed.success) return failure(request, 'operator_not_authorized')

  const response = NextResponse.redirect(new URL('/', request.url))
  response.cookies.set(
    adminSessionCookie,
    parsed.data.accessToken,
    sessionCookieOptions(parsed.data.expiresAt),
  )
  clearOidcCookies(response)
  return response
}
