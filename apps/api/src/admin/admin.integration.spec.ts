import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from 'jose'
import { Pool } from 'pg'
import { createClient } from 'redis'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApplication } from '../bootstrap'
import { DatabaseService } from '../database/database.service'
import { runMigrations } from '../database/migrate'

const maintenanceUrl = 'postgresql://myfitness:myfitness_local@127.0.0.1:54329/postgres'
const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:63799'
const databaseName = `myfitness_admin_test_${randomUUID().replaceAll('-', '')}`
const databaseUrl = `postgresql://myfitness:myfitness_local@127.0.0.1:54329/${databaseName}`
const keyPrefix = `myfitness:rate:admin-test:${randomUUID()}`
const issuer = 'http://127.0.0.1'
const audience = 'myfitness-admin-integration'
const jwtKeyId = 'admin-integration-key'

const previousEnvironment = {
  databaseUrl: process.env.DATABASE_URL,
  auditSecret: process.env.ADMIN_AUDIT_HASH_SECRET,
  oidcIssuer: process.env.ADMIN_OIDC_ISSUER,
  oidcAudience: process.env.ADMIN_OIDC_AUDIENCE,
  oidcJwksUrl: process.env.ADMIN_OIDC_JWKS_URL,
  ratePrefix: process.env.RATE_LIMIT_KEY_PREFIX,
  nodeEnv: process.env.NODE_ENV,
}

const restoreEnvironment = (name: string, value: string | undefined) => {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

describe('administrator trust boundary integration', () => {
  let app: INestApplication
  let database: DatabaseService
  let jwksServer: Server
  let privateKey: CryptoKey
  let publicJwk: JWK
  let oidcIssuer: string
  const cleanupRedis = createClient({ url: redisUrl })
  const maintenance = new Pool({ connectionString: maintenanceUrl, max: 1 })

  const createAdminSession = async (roles: Array<'support_reader' | 'audit_reader'>) => {
    const response = await request(app.getHttpServer())
      .post('/v1/admin/auth/dev/session')
      .send({
        subject: `operator-${roles.join('-')}`,
        displayName: roles.includes('support_reader') ? '支持审阅员' : '审计审阅员',
        roles,
      })
      .expect(200)
    return response.body as {
      accessToken: string
      operator: { operatorId: string; roles: string[] }
    }
  }

  const createUser = async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .send({ subject: `admin-support-user-${randomUUID()}` })
      .expect(200)
    return response.body as { accessToken: string; userId: string }
  }

  const createIdToken = async (subject: string, tokenAudience = audience) => {
    const now = Math.floor(Date.now() / 1_000)
    return new SignJWT({ scope: 'openid', nonce: 'integration-nonce-2026' })
      .setProtectedHeader({ alg: 'RS256', kid: jwtKeyId, typ: 'JWT' })
      .setIssuer(oidcIssuer)
      .setAudience(tokenAudience)
      .setSubject(subject)
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .setJti(randomUUID())
      .sign(privateKey)
  }

  beforeAll(async () => {
    const keys = await generateKeyPair('RS256')
    privateKey = keys.privateKey
    publicJwk = await exportJWK(keys.publicKey)
    publicJwk.kid = jwtKeyId
    publicJwk.alg = 'RS256'
    publicJwk.use = 'sig'

    jwksServer = createServer((incoming, response) => {
      if (incoming.url !== '/.well-known/jwks.json') {
        response.writeHead(404).end()
        return
      }
      response.writeHead(200, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      })
      response.end(JSON.stringify({ keys: [publicJwk] }))
    })
    await new Promise<void>((resolve) => jwksServer.listen(0, '127.0.0.1', resolve))
    const address = jwksServer.address()
    if (!address || typeof address === 'string') throw new Error('JWKS server address unavailable')
    oidcIssuer = `${issuer}:${address.port}/operator-tenant/`

    await maintenance.query(`CREATE DATABASE "${databaseName}"`)
    await runMigrations(databaseUrl)
    process.env.DATABASE_URL = databaseUrl
    process.env.ADMIN_AUDIT_HASH_SECRET = 'admin-integration-audit-hash-secret-2026'
    process.env.ADMIN_OIDC_ISSUER = oidcIssuer
    process.env.ADMIN_OIDC_AUDIENCE = audience
    process.env.ADMIN_OIDC_JWKS_URL = `${issuer}:${address.port}/.well-known/jwks.json`
    process.env.RATE_LIMIT_KEY_PREFIX = keyPrefix
    delete process.env.NODE_ENV
    await cleanupRedis.connect()
    app = await createApplication(false)
    await app.init()
    database = app.get(DatabaseService)
  }, 30_000)

  afterAll(async () => {
    await app?.close()
    const keys = await cleanupRedis.keys(`${keyPrefix}:*`)
    if (keys.length) await cleanupRedis.del(keys)
    cleanupRedis.destroy()
    await new Promise<void>((resolve, reject) =>
      jwksServer.close((error) => (error ? reject(error) : resolve())),
    )
    await maintenance.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`,
      [databaseName],
    )
    await maintenance.query(`DROP DATABASE "${databaseName}"`)
    await maintenance.end()
    restoreEnvironment('DATABASE_URL', previousEnvironment.databaseUrl)
    restoreEnvironment('ADMIN_AUDIT_HASH_SECRET', previousEnvironment.auditSecret)
    restoreEnvironment('ADMIN_OIDC_ISSUER', previousEnvironment.oidcIssuer)
    restoreEnvironment('ADMIN_OIDC_AUDIENCE', previousEnvironment.oidcAudience)
    restoreEnvironment('ADMIN_OIDC_JWKS_URL', previousEnvironment.oidcJwksUrl)
    restoreEnvironment('RATE_LIMIT_KEY_PREFIX', previousEnvironment.ratePrefix)
    restoreEnvironment('NODE_ENV', previousEnvironment.nodeEnv)
  })

  it('keeps user and administrator sessions independent and production-disables the dev issuer', async () => {
    const user = await createUser()
    const support = await createAdminSession(['support_reader'])

    await request(app.getHttpServer())
      .get('/v1/health-records')
      .set('Authorization', `Bearer ${support.accessToken}`)
      .expect(401)
    await request(app.getHttpServer())
      .post('/v1/admin/support/users/lookup')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        accountId: user.userId,
        ticketReference: 'SUP-IDENTITY-01',
        reason: 'account_access',
      })
      .expect(401)

    process.env.NODE_ENV = 'production'
    await request(app.getHttpServer())
      .post('/v1/admin/auth/dev/session')
      .send({
        subject: 'production-denied',
        displayName: '不可签发',
        roles: ['support_reader'],
      })
      .expect(404)
    delete process.env.NODE_ENV

    const denied = await database.query<{ details: { code: string } }>(
      `SELECT details FROM admin_audit_events
       WHERE action = 'operator.session.denied'
       ORDER BY occurred_at DESC LIMIT 1`,
    )
    expect(denied.rows[0]?.details.code).toBe('dev_issuer_disabled')
  })

  it('enforces least privilege and returns only bounded evidence for an exact lookup', async () => {
    const user = await createUser()
    const support = await createAdminSession(['support_reader'])
    const auditor = await createAdminSession(['audit_reader'])

    const lookedUp = await request(app.getHttpServer())
      .post('/v1/admin/support/users/lookup')
      .set('Authorization', `Bearer ${support.accessToken}`)
      .send({
        accountId: user.userId,
        ticketReference: 'SUP-LOOKUP-01',
        reason: 'data_export',
      })
      .expect(200)
    expect(lookedUp.headers['cache-control']).toContain('no-store')
    expect(lookedUp.body).toMatchObject({
      account: {
        accountId: user.userId,
        status: 'active',
        identityProviders: ['dev'],
        onboarding: { profilePresent: false, goalPresent: false, profileRevision: null },
        activeSessionCount: 1,
      },
    })
    const serialized = JSON.stringify(lookedUp.body)
    expect(serialized).not.toContain('provider_subject')
    expect(serialized).not.toContain('display_name')
    expect(serialized).not.toContain(user.accessToken)

    await request(app.getHttpServer())
      .get('/v1/admin/audit')
      .set('Authorization', `Bearer ${support.accessToken}`)
      .expect(403)
    await request(app.getHttpServer())
      .post('/v1/admin/support/users/lookup')
      .set('Authorization', `Bearer ${auditor.accessToken}`)
      .send({
        accountId: user.userId,
        ticketReference: 'SUP-DENIED-01',
        reason: 'technical_issue',
      })
      .expect(403)

    const audit = await database.query<{
      target_ref: string
      details: { ticketReference: string; reason: string }
    }>(
      `SELECT target_ref, details FROM admin_audit_events
       WHERE id = $1`,
      [lookedUp.body.lookupReceiptId],
    )
    expect(audit.rows[0]?.target_ref).toMatch(/^[0-9a-f]{64}$/)
    expect(audit.rows[0]?.target_ref).not.toBe(user.userId)
    expect(audit.rows[0]?.details).toEqual({
      ticketReference: 'SUP-LOOKUP-01',
      reason: 'data_export',
    })
  })

  it('audits a not-found lookup and makes every audit row database-immutable', async () => {
    const support = await createAdminSession(['support_reader'])
    const missingId = randomUUID()
    const missing = await request(app.getHttpServer())
      .post('/v1/admin/support/users/lookup')
      .set('Authorization', `Bearer ${support.accessToken}`)
      .send({
        accountId: missingId,
        ticketReference: 'SUP-MISSING-01',
        reason: 'account_erasure',
      })
      .expect(404)
    expect(missing.body).toMatchObject({ code: 'support_account_not_found' })
    const receiptId = String(missing.body.lookupReceiptId)
    const event = await database.query<{ outcome: string; target_ref: string }>(
      'SELECT outcome, target_ref FROM admin_audit_events WHERE id = $1',
      [receiptId],
    )
    expect(event.rows[0]?.outcome).toBe('not_found')
    expect(event.rows[0]?.target_ref).not.toContain(missingId)

    await expect(
      database.query("UPDATE admin_audit_events SET outcome = 'allowed' WHERE id = $1", [
        receiptId,
      ]),
    ).rejects.toThrow('admin audit events are append-only')
    await expect(
      database.query('DELETE FROM admin_audit_events WHERE id = $1', [receiptId]),
    ).rejects.toThrow('admin audit events are append-only')
    const preserved = await database.query<{ outcome: string }>(
      'SELECT outcome FROM admin_audit_events WHERE id = $1',
      [receiptId],
    )
    expect(preserved.rows[0]?.outcome).toBe('not_found')
  })

  it('allows only an audit reader to page sanitized events', async () => {
    const auditor = await createAdminSession(['audit_reader'])
    await request(app.getHttpServer())
      .get('/v1/admin/auth/me')
      .set('Authorization', `Bearer ${auditor.accessToken}`)
      .expect(200)
    await request(app.getHttpServer())
      .get('/v1/admin/auth/me')
      .set('Authorization', `Bearer ${auditor.accessToken}`)
      .expect(200)
    const response = await request(app.getHttpServer())
      .get('/v1/admin/audit?limit=2')
      .set('Authorization', `Bearer ${auditor.accessToken}`)
      .expect(200)
    expect(response.headers['cache-control']).toContain('no-store')
    expect(response.body.events).toHaveLength(2)
    expect(response.body.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(JSON.stringify(response.body)).not.toContain('mf_admin_')

    const next = await request(app.getHttpServer())
      .get(`/v1/admin/audit?limit=2&cursor=${response.body.nextCursor}`)
      .set('Authorization', `Bearer ${auditor.accessToken}`)
      .expect(200)
    expect(next.body.events.length).toBeGreaterThan(0)
    expect(next.body.events[0].eventId).not.toBe(response.body.events[0].eventId)
  })

  it('verifies a pre-provisioned OIDC identity and rejects replay, wrong audience and unknown actors', async () => {
    const operatorId = randomUUID()
    const identityId = randomUUID()
    const subject = `oidc-operator-${randomUUID()}`
    await database.withTransaction(async (client) => {
      await client.query('INSERT INTO admin_operators (id, display_name) VALUES ($1, $2)', [
        operatorId,
        'OIDC 审计员',
      ])
      await client.query(
        "INSERT INTO admin_operator_roles (operator_id, role) VALUES ($1, 'audit_reader')",
        [operatorId],
      )
      await client.query(
        `INSERT INTO admin_identities (
           id, operator_id, provider, issuer, provider_subject, verified_at
         ) VALUES ($1, $2, 'oidc', $3, $4, NOW())`,
        [identityId, operatorId, oidcIssuer, subject],
      )
    })

    const idToken = await createIdToken(subject)
    const exchanged = await request(app.getHttpServer())
      .post('/v1/admin/auth/oidc/exchange')
      .send({ idToken, nonce: 'integration-nonce-2026' })
      .expect(200)
    expect(exchanged.body.operator).toMatchObject({
      operatorId,
      roles: ['audit_reader'],
      identityProvider: 'oidc',
    })
    await request(app.getHttpServer())
      .get('/v1/admin/auth/me')
      .set('Authorization', `Bearer ${exchanged.body.accessToken}`)
      .expect(200)
    await request(app.getHttpServer())
      .post('/v1/admin/auth/oidc/exchange')
      .send({ idToken, nonce: 'integration-nonce-2026' })
      .expect(401)

    const wrongAudience = await createIdToken(subject, 'another-admin-audience')
    await request(app.getHttpServer())
      .post('/v1/admin/auth/oidc/exchange')
      .send({ idToken: wrongAudience, nonce: 'integration-nonce-2026' })
      .expect(401)
    await request(app.getHttpServer())
      .post('/v1/admin/auth/oidc/exchange')
      .send({ idToken: await createIdToken(subject), nonce: 'wrong-nonce-2026' })
      .expect(401)
    await request(app.getHttpServer())
      .post('/v1/admin/auth/oidc/exchange')
      .send({
        idToken: await createIdToken(`unknown-${randomUUID()}`),
        nonce: 'integration-nonce-2026',
      })
      .expect(401)

    await request(app.getHttpServer())
      .delete('/v1/admin/auth/session')
      .set('Authorization', `Bearer ${exchanged.body.accessToken}`)
      .expect(204)
    await request(app.getHttpServer())
      .get('/v1/admin/auth/me')
      .set('Authorization', `Bearer ${exchanged.body.accessToken}`)
      .expect(401)
  })
})
