import { createHash, randomBytes } from 'node:crypto'

import { NextResponse } from 'next/server'

import {
  oidcClientConfig,
  oidcNonceCookie,
  oidcStateCookie,
  oidcVerifierCookie,
  transientCookieOptions,
} from '@/lib/admin-server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const config = oidcClientConfig()
  if (!config) {
    return NextResponse.redirect(new URL('/?authError=oidc_not_configured', request.url))
  }
  const state = randomBytes(32).toString('base64url')
  const verifier = randomBytes(32).toString('base64url')
  const nonce = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const destination = new URL(config.authorizationUrl)
  destination.searchParams.set('response_type', 'code')
  destination.searchParams.set('client_id', config.clientId)
  destination.searchParams.set('redirect_uri', config.redirectUri)
  destination.searchParams.set('scope', 'openid')
  destination.searchParams.set('state', state)
  destination.searchParams.set('nonce', nonce)
  destination.searchParams.set('code_challenge', challenge)
  destination.searchParams.set('code_challenge_method', 'S256')

  const response = NextResponse.redirect(destination)
  response.cookies.set(oidcStateCookie, state, transientCookieOptions)
  response.cookies.set(oidcVerifierCookie, verifier, transientCookieOptions)
  response.cookies.set(oidcNonceCookie, nonce, transientCookieOptions)
  return response
}
