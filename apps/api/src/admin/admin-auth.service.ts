import { createHash, randomBytes, randomUUID } from 'node:crypto'

import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import {
  adminOperatorSchema,
  adminSessionSchema,
  type AdminDevSessionRequest,
  type AdminIdentityProvider,
  type AdminRole,
  type AdminSession,
} from '@myfitness/contracts'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { PoolClient, QueryResultRow } from 'pg'

import { getRuntimeConfig } from '../config'
import { DatabaseService } from '../database/database.service'
import { AdminAuditService } from './admin-audit.service'
import type { AdminPrincipal } from './admin.types'

type IdentityRow = QueryResultRow & {
  identity_id: string
  operator_id: string
  display_name: string
  status: 'active' | 'disabled'
  roles: AdminRole[]
}

type SessionRow = QueryResultRow & {
  session_id: string
  operator_id: string
  display_name: string
  provider: AdminIdentityProvider
  expires_at: Date
  roles: AdminRole[]
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

@Injectable()
export class AdminAuthService {
  private readonly config = getRuntimeConfig()
  private readonly jwks = createRemoteJWKSet(new URL(this.config.adminOidcJwksUrl))

  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AdminAuditService,
  ) {}

  private async issueSession(
    client: PoolClient,
    identity: IdentityRow,
    provider: AdminIdentityProvider,
    requestId: string,
  ): Promise<AdminSession> {
    const accessToken = `mf_admin_${randomBytes(32).toString('base64url')}`
    const sessionId = randomUUID()
    const expiresAt = new Date(Date.now() + this.config.adminSessionMinutes * 60_000)
    await client.query(
      `INSERT INTO admin_sessions (
         id, operator_id, identity_id, token_hash, expires_at
       ) VALUES ($1, $2, $3, $4, $5)`,
      [sessionId, identity.operator_id, identity.identity_id, hashToken(accessToken), expiresAt],
    )
    await this.audit.append(
      {
        operatorId: identity.operator_id,
        action: 'operator.session.created',
        outcome: 'allowed',
        targetType: 'operator',
        target: identity.operator_id,
        requestId,
        details: { provider },
      },
      client,
    )
    return adminSessionSchema.parse({
      accessToken,
      expiresAt: expiresAt.toISOString(),
      operator: {
        operatorId: identity.operator_id,
        displayName: identity.display_name,
        roles: identity.roles,
        identityProvider: provider,
      },
    })
  }

  async createDevSession(input: AdminDevSessionRequest, requestId: string) {
    if (process.env.NODE_ENV === 'production') {
      await this.audit.append({
        action: 'operator.session.denied',
        outcome: 'denied',
        requestId,
        details: { code: 'dev_issuer_disabled', provider: 'dev' },
      })
      throw new NotFoundException()
    }

    return this.database
      .withTransaction(async (client) => {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `admin-dev:${input.subject}`,
        ])
        const existing = await client.query<IdentityRow>(
          `SELECT identity.id AS identity_id, operator.id AS operator_id,
                operator.display_name, operator.status,
                COALESCE(array_agg(role.role ORDER BY role.role)
                  FILTER (WHERE role.role IS NOT NULL), '{}')::text[] AS roles
         FROM admin_identities AS identity
         JOIN admin_operators AS operator ON operator.id = identity.operator_id
         LEFT JOIN admin_operator_roles AS role ON role.operator_id = operator.id
         WHERE identity.provider = 'dev'
           AND identity.issuer = 'myfitness-local'
           AND identity.provider_subject = $1
         GROUP BY identity.id, operator.id`,
          [input.subject],
        )

        let identity = existing.rows[0]
        if (identity?.status === 'disabled') {
          await this.audit.append(
            {
              operatorId: identity.operator_id,
              action: 'operator.session.denied',
              outcome: 'denied',
              targetType: 'operator',
              target: identity.operator_id,
              requestId,
              details: { code: 'operator_disabled', provider: 'dev' },
            },
            client,
          )
          return null
        }

        if (!identity) {
          const operatorId = randomUUID()
          const identityId = randomUUID()
          await client.query('INSERT INTO admin_operators (id, display_name) VALUES ($1, $2)', [
            operatorId,
            input.displayName,
          ])
          await client.query(
            `INSERT INTO admin_identities (
             id, operator_id, provider, issuer, provider_subject, verified_at
           ) VALUES ($1, $2, 'dev', 'myfitness-local', $3, NOW())`,
            [identityId, operatorId, input.subject],
          )
          identity = {
            identity_id: identityId,
            operator_id: operatorId,
            display_name: input.displayName,
            status: 'active',
            roles: input.roles,
          }
        } else {
          await client.query(
            'UPDATE admin_operators SET display_name = $2, updated_at = NOW() WHERE id = $1',
            [identity.operator_id, input.displayName],
          )
          identity.display_name = input.displayName
          identity.roles = input.roles
          await client.query('DELETE FROM admin_operator_roles WHERE operator_id = $1', [
            identity.operator_id,
          ])
        }
        for (const role of input.roles) {
          await client.query(
            `INSERT INTO admin_operator_roles (operator_id, role)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [identity.operator_id, role],
          )
        }
        return this.issueSession(client, identity, 'dev', requestId)
      })
      .then((session) => {
        if (!session) throw new UnauthorizedException('operator is disabled')
        return session
      })
  }

  async exchangeOidc(idToken: string, expectedNonce: string, requestId: string) {
    let subject: string
    let expiresAt: number
    try {
      const verified = await jwtVerify(idToken, this.jwks, {
        issuer: this.config.adminOidcIssuer,
        audience: this.config.adminOidcAudience,
        algorithms: ['RS256', 'PS256', 'ES256'],
        maxTokenAge: '10m',
        clockTolerance: 5,
      })
      if (
        !verified.payload.sub ||
        !verified.payload.exp ||
        verified.payload.nonce !== expectedNonce
      ) {
        throw new Error('OIDC subject, expiry and matching nonce are required')
      }
      subject = verified.payload.sub
      expiresAt = verified.payload.exp
    } catch {
      await this.audit.append({
        action: 'operator.session.denied',
        outcome: 'denied',
        requestId,
        details: { code: 'invalid_oidc_token', provider: 'oidc' },
      })
      throw new UnauthorizedException('operator identity could not be verified')
    }

    const identityResult = await this.database.query<IdentityRow>(
      `SELECT identity.id AS identity_id, operator.id AS operator_id,
              operator.display_name, operator.status,
              COALESCE(array_agg(role.role ORDER BY role.role)
                FILTER (WHERE role.role IS NOT NULL), '{}')::text[] AS roles
       FROM admin_identities AS identity
       JOIN admin_operators AS operator ON operator.id = identity.operator_id
       LEFT JOIN admin_operator_roles AS role ON role.operator_id = operator.id
       WHERE identity.provider = 'oidc'
         AND identity.issuer = $1
         AND identity.provider_subject = $2
       GROUP BY identity.id, operator.id`,
      [this.config.adminOidcIssuer, subject],
    )
    const identity = identityResult.rows[0]
    if (!identity || identity.status !== 'active' || identity.roles.length === 0) {
      await this.audit.append({
        operatorId: identity?.operator_id,
        action: 'operator.session.denied',
        outcome: 'denied',
        targetType: 'operator',
        target: `${this.config.adminOidcIssuer}:${subject}`,
        requestId,
        details: {
          code: !identity ? 'operator_not_provisioned' : 'operator_inactive',
          provider: 'oidc',
        },
      })
      throw new UnauthorizedException('operator is not provisioned or active')
    }

    const tokenHash = hashToken(idToken)
    const outcome = await this.database.withTransaction(async (client) => {
      const consumed = await client.query(
        `INSERT INTO admin_oidc_exchanges (token_hash, identity_id, token_expires_at)
         VALUES ($1, $2, to_timestamp($3))
         ON CONFLICT DO NOTHING RETURNING token_hash`,
        [tokenHash, identity.identity_id, expiresAt],
      )
      if (!consumed.rows[0]) {
        await this.audit.append(
          {
            operatorId: identity.operator_id,
            action: 'operator.session.denied',
            outcome: 'denied',
            targetType: 'operator',
            target: identity.operator_id,
            requestId,
            details: { code: 'oidc_token_replayed', provider: 'oidc' },
          },
          client,
        )
        return null
      }
      await client.query('UPDATE admin_identities SET verified_at = NOW() WHERE id = $1', [
        identity.identity_id,
      ])
      return this.issueSession(client, identity, 'oidc', requestId)
    })
    if (!outcome) throw new UnauthorizedException('operator identity token was already exchanged')
    return outcome
  }

  async authenticate(accessToken: string, requestId: string): Promise<AdminPrincipal> {
    const result = await this.database.query<SessionRow>(
      `WITH touched AS (
         UPDATE admin_sessions AS session
         SET last_used_at = NOW()
         FROM admin_operators AS operator, admin_identities AS identity
         WHERE session.operator_id = operator.id
           AND session.identity_id = identity.id
           AND session.token_hash = $1
           AND session.revoked_at IS NULL
           AND session.expires_at > NOW()
           AND operator.status = 'active'
         RETURNING session.id AS session_id, session.operator_id, session.expires_at,
                   operator.display_name, identity.provider
       )
       SELECT touched.*,
              COALESCE(array_agg(role.role ORDER BY role.role)
                FILTER (WHERE role.role IS NOT NULL), '{}')::text[] AS roles
       FROM touched
       LEFT JOIN admin_operator_roles AS role ON role.operator_id = touched.operator_id
       GROUP BY touched.session_id, touched.operator_id, touched.expires_at,
                touched.display_name, touched.provider`,
      [hashToken(accessToken)],
    )
    const session = result.rows[0]
    if (!session || session.roles.length === 0) {
      await this.recordDenied(requestId, 'invalid_or_expired_session')
      throw new UnauthorizedException('invalid or expired administrator access token')
    }
    return {
      operatorId: session.operator_id,
      sessionId: session.session_id,
      displayName: session.display_name,
      roles: session.roles,
      identityProvider: session.provider,
      expiresAt: session.expires_at.toISOString(),
    }
  }

  async recordDenied(requestId: string, code: string) {
    await this.audit.append({
      action: 'operator.session.denied',
      outcome: 'denied',
      requestId,
      details: { code },
    })
  }

  async profile(principal: AdminPrincipal, requestId: string) {
    await this.audit.append({
      operatorId: principal.operatorId,
      action: 'operator.profile.read',
      outcome: 'allowed',
      targetType: 'operator',
      target: principal.operatorId,
      requestId,
    })
    return adminOperatorSchema.parse({
      operatorId: principal.operatorId,
      displayName: principal.displayName,
      roles: principal.roles,
      identityProvider: principal.identityProvider,
    })
  }

  async revoke(principal: AdminPrincipal, requestId: string) {
    await this.database.withTransaction(async (client) => {
      await client.query(
        `UPDATE admin_sessions SET revoked_at = COALESCE(revoked_at, NOW())
         WHERE id = $1 AND operator_id = $2`,
        [principal.sessionId, principal.operatorId],
      )
      await this.audit.append(
        {
          operatorId: principal.operatorId,
          action: 'operator.session.revoked',
          outcome: 'allowed',
          targetType: 'operator',
          target: principal.operatorId,
          requestId,
        },
        client,
      )
    })
  }
}
