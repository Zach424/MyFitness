import { createHash, webcrypto } from 'node:crypto'

import type { OidcAuthorizationConfig } from '@myfitness/contracts'
import { describe, expect, it } from 'vitest'

import {
  consumeOidcAuthorizationResponse,
  createOidcAuthorization,
  hasOidcAuthorizationResponse,
  hasOidcCallbackTarget,
  oidcCallbackTargetStorageKey,
  oidcTransactionStorageKey,
  OidcFlowError,
} from './oidc.model'

const origin = 'https://h5.myfitness.cn'
const config: OidcAuthorizationConfig = {
  issuer: 'https://identity.myfitness.cn',
  authorizationUrl: 'https://identity.myfitness.cn/authorize',
  clientId: 'myfitness-h5',
  redirectUri: `${origin}/auth/callback`,
  scopes: ['openid'],
}

const cryptoBoundary = {
  randomBytes: (byteLength: number) => webcrypto.getRandomValues(new Uint8Array(byteLength)),
  sha256: async (data: Uint8Array<ArrayBuffer>) =>
    new Uint8Array(await webcrypto.subtle.digest('SHA-256', data)),
}

class MemoryStorage {
  readonly values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }
}

const callbackHref = (parameters: URLSearchParams) =>
  `${origin}/#/pages/login/index?${parameters.toString()}`

describe('H5 OIDC browser transaction', () => {
  it('creates high-entropy state, nonce and an RFC 7636 S256 challenge in tab storage', async () => {
    const storage = new MemoryStorage()
    const first = await createOidcAuthorization({
      config,
      browserOrigin: origin,
      storage,
      crypto: cryptoBoundary,
      now: 1_000,
    })
    const secondStorage = new MemoryStorage()
    const second = await createOidcAuthorization({
      config,
      browserOrigin: origin,
      storage: secondStorage,
      crypto: cryptoBoundary,
      now: 1_000,
    })

    expect(first.transaction.state).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(first.transaction.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(first.transaction.codeVerifier).toMatch(/^[A-Za-z0-9_-]{86}$/)
    expect(first.transaction.state).not.toBe(second.transaction.state)
    expect(first.codeChallenge).toBe(
      createHash('sha256').update(first.transaction.codeVerifier).digest('base64url'),
    )
    const authorization = new URL(first.authorizationUrl)
    expect(Object.fromEntries(authorization.searchParams)).toMatchObject({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: 'openid',
      state: first.transaction.state,
      nonce: first.transaction.nonce,
      code_challenge: first.codeChallenge,
      code_challenge_method: 'S256',
    })
    expect(storage.getItem(oidcTransactionStorageKey)).toContain(first.transaction.codeVerifier)
  })

  it('consumes one exact callback, clears URL and transaction, and returns only the exchange input', async () => {
    const storage = new MemoryStorage()
    const { transaction } = await createOidcAuthorization({
      config,
      browserOrigin: origin,
      storage,
      crypto: cryptoBoundary,
      now: 1_000,
    })
    storage.setItem(oidcCallbackTargetStorageKey, config.redirectUri)
    const replacements: string[] = []
    const parameters = new URLSearchParams({
      code: 'authorization-code-123',
      state: transaction.state,
      iss: config.issuer,
    })
    const href = callbackHref(parameters)

    expect(hasOidcAuthorizationResponse(href)).toBe(true)
    expect(
      consumeOidcAuthorizationResponse({
        config,
        href,
        browserOrigin: origin,
        storage,
        history: {
          replaceState: (_data, _unused, url) => replacements.push(String(url)),
        },
        now: 2_000,
      }),
    ).toEqual({
      code: 'authorization-code-123',
      codeVerifier: transaction.codeVerifier,
      nonce: transaction.nonce,
      redirectUri: config.redirectUri,
    })
    expect(replacements).toEqual(['/#/pages/login/index'])
    expect(storage.getItem(oidcTransactionStorageKey)).toBeNull()
    expect(storage.getItem(oidcCallbackTargetStorageKey)).toBeNull()
  })

  it('fails closed for wrong state, issuer, callback target, duplicates and expired transactions', async () => {
    const cases: Array<{
      name: string
      mutate: (values: {
        parameters: URLSearchParams
        storage: MemoryStorage
        now: number
      }) => number | void
      kind: OidcFlowError['kind']
    }> = [
      {
        name: 'wrong state',
        mutate: ({ parameters }) => parameters.set('state', 'x'.repeat(43)),
        kind: 'invalid_response',
      },
      {
        name: 'wrong issuer',
        mutate: ({ parameters }) => parameters.set('iss', 'https://other.example.com'),
        kind: 'invalid_response',
      },
      {
        name: 'wrong callback',
        mutate: ({ storage }) =>
          storage.setItem(oidcCallbackTargetStorageKey, `${origin}/other/callback`),
        kind: 'invalid_response',
      },
      {
        name: 'duplicate state',
        mutate: ({ parameters }) => parameters.append('state', 'y'.repeat(43)),
        kind: 'invalid_response',
      },
      {
        name: 'expired',
        mutate: () => 11 * 60 * 1000,
        kind: 'expired_transaction',
      },
    ]

    for (const testCase of cases) {
      const storage = new MemoryStorage()
      const { transaction } = await createOidcAuthorization({
        config,
        browserOrigin: origin,
        storage,
        crypto: cryptoBoundary,
        now: 0,
      })
      storage.setItem(oidcCallbackTargetStorageKey, config.redirectUri)
      const parameters = new URLSearchParams({
        code: 'authorization-code-123',
        state: transaction.state,
        iss: config.issuer,
      })
      const changedNow = testCase.mutate({ parameters, storage, now: 1_000 })
      try {
        consumeOidcAuthorizationResponse({
          config,
          href: callbackHref(parameters),
          browserOrigin: origin,
          storage,
          history: { replaceState: () => undefined },
          now: typeof changedNow === 'number' ? changedNow : 1_000,
        })
        throw new Error(`${testCase.name} unexpectedly passed`)
      } catch (error) {
        expect(error, testCase.name).toBeInstanceOf(OidcFlowError)
        expect((error as OidcFlowError).kind, testCase.name).toBe(testCase.kind)
      }
    }
  })

  it('validates state before reporting a provider denial and never exposes provider descriptions', async () => {
    const storage = new MemoryStorage()
    const { transaction } = await createOidcAuthorization({
      config,
      browserOrigin: origin,
      storage,
      crypto: cryptoBoundary,
      now: 1_000,
    })
    storage.setItem(oidcCallbackTargetStorageKey, config.redirectUri)
    const parameters = new URLSearchParams({
      error: 'access_denied',
      error_description: 'untrusted provider text',
      state: transaction.state,
    })

    expect(() =>
      consumeOidcAuthorizationResponse({
        config,
        href: callbackHref(parameters),
        browserOrigin: origin,
        storage,
        history: { replaceState: () => undefined },
        now: 2_000,
      }),
    ).toThrowError(expect.objectContaining({ kind: 'provider_denied' }))
    try {
      consumeOidcAuthorizationResponse({
        config,
        href: callbackHref(parameters),
        browserOrigin: origin,
        storage: new MemoryStorage(),
        history: { replaceState: () => undefined },
        now: 2_000,
      })
    } catch (error) {
      expect((error as Error).message).not.toContain('untrusted provider text')
    }
  })

  it('consumes and clears a callback target even when the provider returns no recognized result', async () => {
    const storage = new MemoryStorage()
    await createOidcAuthorization({
      config,
      browserOrigin: origin,
      storage,
      crypto: cryptoBoundary,
      now: 1_000,
    })
    storage.setItem(oidcCallbackTargetStorageKey, config.redirectUri)
    expect(hasOidcCallbackTarget(storage)).toBe(true)

    expect(() =>
      consumeOidcAuthorizationResponse({
        config,
        href: `${origin}/#/pages/login/index?unexpected=value`,
        browserOrigin: origin,
        storage,
        history: { replaceState: () => undefined },
        now: 2_000,
      }),
    ).toThrowError(expect.objectContaining({ kind: 'invalid_response' }))
    expect(storage.getItem(oidcTransactionStorageKey)).toBeNull()
    expect(storage.getItem(oidcCallbackTargetStorageKey)).toBeNull()
  })
})
