import { createHash, randomBytes, randomUUID } from 'node:crypto'

import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import type { DevSession, DevSessionRequest } from '@myfitness/contracts'

import { DatabaseService } from '../database/database.service'
import type { AuthPrincipal } from './auth.types'

const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

@Injectable()
export class AuthService {
  constructor(private readonly database: DatabaseService) {}

  async createDevSession(input: DevSessionRequest): Promise<DevSession> {
    if (process.env.NODE_ENV === 'production') throw new NotFoundException()

    const accessToken = `mf_dev_${randomBytes(32).toString('base64url')}`
    const sessionId = randomUUID()
    const expiresAt = new Date(Date.now() + sessionLifetimeMs)

    const userId = await this.database.withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`dev:${input.subject}`])
      const existing = await client.query<{ user_id: string }>(
        `SELECT user_id FROM auth_identities WHERE provider = 'dev' AND provider_subject = $1`,
        [input.subject],
      )

      let resolvedUserId = existing.rows[0]?.user_id
      if (!resolvedUserId) {
        resolvedUserId = randomUUID()
        await client.query('INSERT INTO users (id) VALUES ($1)', [resolvedUserId])
        await client.query(
          `
            INSERT INTO auth_identities (id, user_id, provider, provider_subject, verified_at)
            VALUES ($1, $2, 'dev', $3, NOW())
          `,
          [randomUUID(), resolvedUserId, input.subject],
        )
      }

      await client.query(
        `
          INSERT INTO auth_sessions (id, user_id, token_hash, expires_at)
          VALUES ($1, $2, $3, $4)
        `,
        [sessionId, resolvedUserId, hashToken(accessToken), expiresAt],
      )
      return resolvedUserId
    })

    return { accessToken, userId, expiresAt: expiresAt.toISOString() }
  }

  async authenticate(accessToken: string): Promise<AuthPrincipal> {
    const result = await this.database.query<{ id: string; user_id: string }>(
      `
        UPDATE auth_sessions AS session
        SET last_used_at = NOW()
        FROM users AS app_user
        WHERE session.user_id = app_user.id
          AND session.token_hash = $1
          AND session.revoked_at IS NULL
          AND session.expires_at > NOW()
          AND app_user.status = 'active'
        RETURNING session.id, session.user_id
      `,
      [hashToken(accessToken)],
    )

    const session = result.rows[0]
    if (!session) throw new UnauthorizedException('invalid or expired access token')
    return { userId: session.user_id, sessionId: session.id, provider: 'dev' }
  }
}
