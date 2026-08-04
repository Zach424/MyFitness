import { describe, expect, it } from 'vitest'

import { parseOidcAuthorizationConfig, parseVerifiedSession } from './api-response'

const oidcConfig = {
  issuer: 'https://identity.example.com/',
  authorizationUrl: 'https://identity.example.com/authorize',
  clientId: 'myfitness-h5',
  redirectUri: 'https://fitness.example.com/login/callback',
  scopes: ['openid', 'profile'],
}

const oidcSession = {
  accessToken: 'a'.repeat(32),
  userId: '84d6f910-b36a-4fc4-89e3-70fece2c8b5b',
  provider: 'oidc',
  isNewUser: false,
  expiresAt: '2026-08-04T12:30:00+08:00',
}

describe('client identity response validation', () => {
  it('accepts the exact public OIDC configuration shape', () => {
    expect(parseOidcAuthorizationConfig(oidcConfig)).toEqual(oidcConfig)
  })

  it.each([
    null,
    { ...oidcConfig, clientId: 'x' },
    { ...oidcConfig, scopes: [] },
    { ...oidcConfig, issuer: 'not-a-url' },
    { ...oidcConfig, unexpected: true },
  ])('rejects malformed or expanded OIDC configuration %#', (value) => {
    expect(() => parseOidcAuthorizationConfig(value)).toThrow('身份服务返回了无效数据')
  })

  it('accepts an exact verified session and preserves its provider', () => {
    expect(parseVerifiedSession(oidcSession)).toEqual(oidcSession)
  })

  it.each([
    { ...oidcSession, accessToken: 'short' },
    { ...oidcSession, userId: 'not-a-uuid' },
    { ...oidcSession, provider: 'unknown' },
    { ...oidcSession, expiresAt: '2026-08-04' },
    { ...oidcSession, extra: 'field' },
  ])('rejects malformed or expanded verified sessions %#', (value) => {
    expect(() => parseVerifiedSession(value)).toThrow('身份服务返回了无效数据')
  })
})
