import { createServer, type Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { accountDeletionConfirmationPhrase } from '@myfitness/contracts'
import { Pool } from 'pg'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApplication } from '../bootstrap'
import { getRuntimeConfig } from '../config'
import { runMigrations } from '../database/migrate'
import { ErasureLedgerService } from '../privacy/erasure-ledger.service'

describe('verified WeChat user authentication with PostgreSQL', () => {
  const databaseUrl = getRuntimeConfig().databaseUrl
  const pool = new Pool({ connectionString: databaseUrl })
  const previousEnvironment = new Map<string, string | undefined>()
  const appId = 'wxintegration123456'
  const appSecret = 'integration-wechat-secret-1234567890'
  const openid = 'openid_integration_1234567890'
  let provider: Server
  let app: INestApplication
  let userId: string | undefined
  let receiptId: string | undefined

  const setEnvironment = (name: string, value: string) => {
    previousEnvironment.set(name, process.env[name])
    process.env[name] = value
  }

  beforeAll(async () => {
    provider = createServer((incoming, outgoing) => {
      const url = new URL(incoming.url ?? '/', 'http://127.0.0.1')
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

    setEnvironment('AUTH_ENABLED_PROVIDERS', 'dev,wechat')
    setEnvironment('WECHAT_MINI_APP_ID', appId)
    setEnvironment('WECHAT_MINI_APP_SECRET', appSecret)
    setEnvironment('WECHAT_CODE_SESSION_URL', `http://127.0.0.1:${address.port}/sns/jscode2session`)
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
    if (userId) await pool.query('DELETE FROM users WHERE id = $1', [userId])
    await app.close()
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
