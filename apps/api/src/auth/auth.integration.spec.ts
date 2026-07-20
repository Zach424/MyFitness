import { createServer, type Server } from 'node:http'
import { createHash } from 'node:crypto'

import type { INestApplication } from '@nestjs/common'
import { accountDeletionConfirmationPhrase } from '@myfitness/contracts'
import { Pool } from 'pg'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApplication } from '../bootstrap'
import { getRuntimeConfig } from '../config'
import { runMigrations } from '../database/migrate'
import { ErasureLedgerService } from '../privacy/erasure-ledger.service'

describe('verified user authentication with PostgreSQL', () => {
  const databaseUrl = getRuntimeConfig().databaseUrl
  const pool = new Pool({ connectionString: databaseUrl })
  const previousEnvironment = new Map<string, string | undefined>()
  const appId = 'wxintegration123456'
  const appSecret = 'integration-wechat-secret-1234567890'
  const openid = 'openid_integration_1234567890'
  const oidcIssuer = 'http://127.0.0.1'
  const oidcClientId = 'myfitness-h5-integration'
  const oidcClientSecret = 'integration-oidc-client-secret'
  const oidcRedirectUri = 'http://127.0.0.1:4173/auth/callback'
  const oidcSubject = 'oidc-user-integration'
  const oidcNonce = 'oidc_nonce_01234567890123456789012345678901'
  const oidcCodeVerifier = 'oidc_verifier_012345678901234567890123456789012345678901234567890123'
  let provider: Server
  let app: INestApplication
  let userId: string | undefined
  let oidcUserId: string | undefined
  let receiptId: string | undefined

  const setEnvironment = (name: string, value: string) => {
    previousEnvironment.set(name, process.env[name])
    process.env[name] = value
  }

  beforeAll(async () => {
    const keyPair = await generateKeyPair('RS256')
    const publicJwk = await exportJWK(keyPair.publicKey)
    publicJwk.kid = 'user-oidc-test-key'
    publicJwk.use = 'sig'
    publicJwk.alg = 'RS256'

    provider = createServer(async (incoming, outgoing) => {
      const url = new URL(incoming.url ?? '/', 'http://127.0.0.1')
      if (url.pathname === '/.well-known/jwks.json') {
        outgoing.writeHead(200, { 'content-type': 'application/json' })
        outgoing.end(JSON.stringify({ keys: [publicJwk] }))
        return
      }
      if (url.pathname === '/oauth2/token' && incoming.method === 'POST') {
        const chunks: Buffer[] = []
        for await (const chunk of incoming) chunks.push(Buffer.from(chunk))
        const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
        const expectedAuthorization = `Basic ${Buffer.from(
          `${oidcClientId}:${oidcClientSecret}`,
        ).toString('base64')}`
        if (
          incoming.headers.authorization !== expectedAuthorization ||
          incoming.headers['content-type'] !== 'application/x-www-form-urlencoded' ||
          form.get('grant_type') !== 'authorization_code' ||
          form.get('redirect_uri') !== oidcRedirectUri ||
          form.get('code_verifier') !== oidcCodeVerifier ||
          form.has('client_id')
        ) {
          outgoing.writeHead(400, { 'content-type': 'application/json' })
          outgoing.end(JSON.stringify({ error: 'invalid_request' }))
          return
        }
        const code = form.get('code')
        if (code === 'invalid-oidc-code') {
          outgoing.writeHead(400, { 'content-type': 'application/json' })
          outgoing.end(JSON.stringify({ error: 'invalid_grant' }))
          return
        }
        const now = Math.floor(Date.now() / 1000)
        const idToken = await new SignJWT({
          nonce: code === 'bad-nonce-code' ? `${oidcNonce}_mismatch` : oidcNonce,
        })
          .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
          .setIssuer(`${oidcIssuer}:${(provider.address() as { port: number }).port}`)
          .setAudience(oidcClientId)
          .setSubject(oidcSubject)
          .setIssuedAt(now)
          .setExpirationTime(now + 300)
          .sign(keyPair.privateKey)
        outgoing.writeHead(200, { 'content-type': 'application/json' })
        outgoing.end(JSON.stringify({ id_token: idToken, access_token: 'must-not-persist' }))
        return
      }
      if (
        url.pathname !== '/sns/jscode2session' ||
        url.searchParams.get('appid') !== appId ||
        url.searchParams.get('secret') !== appSecret ||
        url.searchParams.get('grant_type') !== 'authorization_code'
      ) {
        outgoing.writeHead(400, { 'content-type': 'application/json' })
        outgoing.end(JSON.stringify({ errcode: 40000 }))
        return
      }
      outgoing.writeHead(200, { 'content-type': 'application/json' })
      if (url.searchParams.get('js_code') === 'invalid-code') {
        outgoing.end(JSON.stringify({ errcode: 40029, errmsg: 'invalid code' }))
        return
      }
      outgoing.end(
        JSON.stringify({ openid, session_key: 'provider-secret-that-must-not-be-persisted' }),
      )
    })
    await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve))
    const address = provider.address()
    if (!address || typeof address === 'string') throw new Error('mock provider did not bind')

    const providerOrigin = `${oidcIssuer}:${address.port}`
    setEnvironment('AUTH_ENABLED_PROVIDERS', 'dev,wechat,oidc')
    setEnvironment('WECHAT_MINI_APP_ID', appId)
    setEnvironment('WECHAT_MINI_APP_SECRET', appSecret)
    setEnvironment('WECHAT_CODE_SESSION_URL', `http://127.0.0.1:${address.port}/sns/jscode2session`)
    setEnvironment('USER_OIDC_ISSUER', providerOrigin)
    setEnvironment('USER_OIDC_AUTHORIZATION_URL', `${providerOrigin}/oauth2/authorize`)
    setEnvironment('USER_OIDC_TOKEN_URL', `${providerOrigin}/oauth2/token`)
    setEnvironment('USER_OIDC_JWKS_URL', `${providerOrigin}/.well-known/jwks.json`)
    setEnvironment('USER_OIDC_CLIENT_ID', oidcClientId)
    setEnvironment('USER_OIDC_CLIENT_SECRET', oidcClientSecret)
    setEnvironment('USER_OIDC_REDIRECT_URI', oidcRedirectUri)
    await runMigrations(databaseUrl)
    app = await createApplication(false)
    await app.init()
  })

  afterAll(async () => {
    if (receiptId) {
      await app
        .get(ErasureLedgerService)
        .removeForVerification(receiptId)
        .catch(() => undefined)
      await pool.query('DELETE FROM data_operation_jobs WHERE receipt_id = $1', [receiptId])
      await pool.query('DELETE FROM auth_identity_suppressions WHERE erasure_receipt_id = $1', [
        receiptId,
      ])
      await pool.query('DELETE FROM privacy_erasure_receipts WHERE receipt_id = $1', [receiptId])
    }
    if (oidcUserId) await pool.query('DELETE FROM users WHERE id = $1', [oidcUserId])
    if (userId) await pool.query('DELETE FROM users WHERE id = $1', [userId])
    if (app) await app.close()
    await pool.end()
    await new Promise<void>((resolve, reject) =>
      provider.close((error) => (error ? reject(error) : resolve())),
    )
    for (const [name, value] of previousEnvironment) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })

  it('rejects untrusted identity fields and invalid provider codes', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/wechat/session')
      .send({ code: 'valid-code', openid: 'client-controlled' })
      .expect(400)

    await request(app.getHttpServer())
      .post('/v1/auth/wechat/session')
      .send({ code: 'invalid-code' })
      .expect(401)
  })

  it('publishes only browser-safe OIDC config and verifies code, PKCE and nonce', async () => {
    const config = await request(app.getHttpServer()).get('/v1/auth/oidc/config').expect(200)
    expect(config.body).toEqual({
      issuer: `${oidcIssuer}:${(provider.address() as { port: number }).port}`,
      authorizationUrl: `${oidcIssuer}:${(provider.address() as { port: number }).port}/oauth2/authorize`,
      clientId: oidcClientId,
      redirectUri: oidcRedirectUri,
      scopes: ['openid'],
    })
    expect(JSON.stringify(config.body)).not.toContain(oidcClientSecret)
    expect(JSON.stringify(config.body)).not.toContain('/oauth2/token')
    expect(JSON.stringify(config.body)).not.toContain('/.well-known/jwks.json')

    const requestBody = {
      code: 'valid-oidc-code',
      codeVerifier: oidcCodeVerifier,
      nonce: oidcNonce,
      redirectUri: oidcRedirectUri,
    }
    await request(app.getHttpServer())
      .post('/v1/auth/oidc/session')
      .send({ ...requestBody, subject: 'client-controlled' })
      .expect(400)
    await request(app.getHttpServer())
      .post('/v1/auth/oidc/session')
      .send({ ...requestBody, redirectUri: 'http://127.0.0.1:4173/other' })
      .expect(400)
    await request(app.getHttpServer())
      .post('/v1/auth/oidc/session')
      .send({ ...requestBody, code: 'invalid-oidc-code' })
      .expect(401)
    await request(app.getHttpServer())
      .post('/v1/auth/oidc/session')
      .send({ ...requestBody, code: 'bad-nonce-code' })
      .expect(401)

    const first = await request(app.getHttpServer())
      .post('/v1/auth/oidc/session')
      .send(requestBody)
      .expect(200)
    oidcUserId = first.body.userId as string
    expect(first.body).toMatchObject({ provider: 'oidc', isNewUser: true, userId: oidcUserId })

    const second = await request(app.getHttpServer())
      .post('/v1/auth/oidc/session')
      .send({ ...requestBody, code: 'valid-oidc-code-again' })
      .expect(200)
    expect(second.body).toMatchObject({ provider: 'oidc', isNewUser: false, userId: oidcUserId })

    const persisted = await pool.query<{ provider_subject: string; token_hash: string }>(
      `SELECT identity.provider_subject, session.token_hash
       FROM auth_identities AS identity
       JOIN auth_sessions AS session ON session.user_id = identity.user_id
       WHERE identity.user_id = $1 AND identity.provider = 'oidc'
       ORDER BY session.created_at DESC LIMIT 1`,
      [oidcUserId],
    )
    expect(persisted.rows[0]?.provider_subject).toBe(
      `oidc:${createHash('sha256')
        .update(`${oidcIssuer}:${(provider.address() as { port: number }).port}\0${oidcSubject}`)
        .digest('hex')}`,
    )
    expect(persisted.rows[0]?.token_hash).toHaveLength(64)
    expect(JSON.stringify(persisted.rows[0])).not.toContain(oidcSubject)
    expect(JSON.stringify(persisted.rows[0])).not.toContain('must-not-persist')
  })

  it('binds verified identity sessions and suppresses recreation after erasure', async () => {
    const first = await request(app.getHttpServer())
      .post('/v1/auth/wechat/session')
      .send({ code: 'valid-code' })
      .expect(200)
    userId = first.body.userId as string
    expect(first.body).toMatchObject({ provider: 'wechat', isNewUser: true, userId })

    const second = await request(app.getHttpServer())
      .post('/v1/auth/wechat/session')
      .send({ code: 'valid-code-again' })
      .expect(200)
    expect(second.body).toMatchObject({ provider: 'wechat', isNewUser: false, userId })

    await request(app.getHttpServer())
      .get('/v1/me/onboarding')
      .set('Authorization', `Bearer ${second.body.accessToken as string}`)
      .expect(404)

    const persisted = await pool.query<{
      provider: string
      provider_subject: string
      token_hash: string
    }>(
      `SELECT session.provider, identity.provider_subject, session.token_hash
       FROM auth_sessions AS session
       JOIN auth_identities AS identity ON identity.user_id = session.user_id
       WHERE session.user_id = $1 ORDER BY session.created_at DESC LIMIT 1`,
      [userId],
    )
    expect(persisted.rows[0]).toMatchObject({
      provider: 'wechat',
      provider_subject: `${appId}:${openid}`,
    })
    expect(persisted.rows[0]?.token_hash).toHaveLength(64)
    expect(JSON.stringify(persisted.rows[0])).not.toContain(
      'provider-secret-that-must-not-be-persisted',
    )

    const intent = await request(app.getHttpServer())
      .post('/v1/me/privacy/account-deletion-intents')
      .set('Authorization', `Bearer ${second.body.accessToken as string}`)
      .expect(201)
    const deletion = await request(app.getHttpServer())
      .delete('/v1/me/privacy/account')
      .set('Authorization', `Bearer ${second.body.accessToken as string}`)
      .set('X-Erasure-Intent-Token', intent.body.intentToken as string)
      .send({
        intentId: intent.body.intentId,
        confirmationPhrase: accountDeletionConfirmationPhrase,
        exportChoice: 'skip',
        understandsPermanent: true,
      })
      .expect(202)
    receiptId = deletion.body.receiptId as string
    expect(deletion.body.status).toBe('completed')

    const suppression = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM auth_identity_suppressions
       WHERE provider = 'wechat' AND erasure_receipt_id = $1`,
      [receiptId],
    )
    expect(Number(suppression.rows[0]?.count)).toBe(1)

    await request(app.getHttpServer())
      .post('/v1/auth/wechat/session')
      .send({ code: 'valid-code-after-erasure' })
      .expect(403)
  })
})
