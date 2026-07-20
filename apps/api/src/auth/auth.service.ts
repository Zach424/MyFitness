import { createHash, randomBytes, randomUUID } from 'node:crypto'

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import type {
  DevSession,
  DevSessionRequest,
  OidcAuthorizationConfig,
  OidcSessionRequest,
  UserAuthProvider,
  VerifiedSession,
  WechatSessionRequest,
} from '@myfitness/contracts'
import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from 'jose'

import { getRuntimeConfig } from '../config'
import { DatabaseService } from '../database/database.service'
import { ErasureLedgerService } from '../privacy/erasure-ledger.service'
import type { AuthPrincipal } from './auth.types'

const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
const formEncode = (value: string) =>
  new URLSearchParams([['value', value]]).toString().slice('value='.length)

@Injectable()
export class AuthService {
  private readonly config = getRuntimeConfig()
  private readonly oidcJwks = this.config.userOidcJwksUrl
    ? createRemoteJWKSet(new URL(this.config.userOidcJwksUrl))
    : undefined

  constructor(
    private readonly database: DatabaseService,
    private readonly erasureLedger: ErasureLedgerService,
  ) {}

  async createDevSession(input: DevSessionRequest): Promise<DevSession> {
    if (
      process.env.NODE_ENV === 'production' ||
      !this.config.authEnabledProviders.includes('dev')
    ) {
      throw new NotFoundException()
    }
    const session = await this.issueProviderSession('dev', input.subject)
    return {
      accessToken: session.accessToken,
      userId: session.userId,
      expiresAt: session.expiresAt,
    }
  }

  async createWechatSession(input: WechatSessionRequest): Promise<VerifiedSession> {
    if (!this.config.authEnabledProviders.includes('wechat')) throw new NotFoundException()
    const openid = await this.exchangeWechatCode(input.code)
    return this.issueProviderSession('wechat', `${this.config.wechatMiniAppId}:${openid}`)
  }

  getOidcAuthorizationConfig(): OidcAuthorizationConfig {
    if (!this.config.authEnabledProviders.includes('oidc')) throw new NotFoundException()
    return {
      issuer: this.config.userOidcIssuer!,
      authorizationUrl: this.config.userOidcAuthorizationUrl!,
      clientId: this.config.userOidcClientId!,
      redirectUri: this.config.userOidcRedirectUri!,
      scopes: ['openid'],
    }
  }

  async createOidcSession(input: OidcSessionRequest): Promise<VerifiedSession> {
    if (!this.config.authEnabledProviders.includes('oidc')) throw new NotFoundException()
    if (input.redirectUri !== this.config.userOidcRedirectUri) {
      throw new BadRequestException('OIDC redirect URI does not match the configured callback')
    }
    const subject = await this.exchangeOidcCode(input)
    const providerSubject = `oidc:${hashToken(`${this.config.userOidcIssuer}\0${subject}`)}`
    return this.issueProviderSession('oidc', providerSubject)
  }

  private async exchangeOidcCode(input: OidcSessionRequest) {
    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
    })
    const headers: Record<string, string> = {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    }
    if (this.config.userOidcClientSecret) {
      headers.authorization = `Basic ${Buffer.from(
        `${formEncode(this.config.userOidcClientId!)}:${formEncode(this.config.userOidcClientSecret)}`,
      ).toString('base64')}`
    } else {
      form.set('client_id', this.config.userOidcClientId!)
    }

    let response: Response
    try {
      response = await fetch(this.config.userOidcTokenUrl!, {
        method: 'POST',
        headers,
        body: form,
        signal: AbortSignal.timeout(8_000),
      })
    } catch {
      throw new ServiceUnavailableException('identity provider is unavailable')
    }
    if (!response.ok) {
      if (response.status === 400 || response.status === 401) {
        throw new UnauthorizedException('OIDC login code is invalid or expired')
      }
      throw new ServiceUnavailableException('identity provider is unavailable')
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new ServiceUnavailableException('identity provider returned an invalid response')
    }
    if (!payload || typeof payload !== 'object') {
      throw new ServiceUnavailableException('identity provider returned an invalid response')
    }
    const idToken = (payload as { id_token?: unknown }).id_token
    if (typeof idToken !== 'string' || idToken.length < 32 || idToken.length > 32_768) {
      throw new ServiceUnavailableException('identity provider returned an invalid response')
    }

    try {
      if (!this.oidcJwks) throw new Error('OIDC key set is unavailable')
      const verified = await jwtVerify(idToken, this.oidcJwks, {
        issuer: this.config.userOidcIssuer!,
        audience: this.config.userOidcClientId!,
        algorithms: ['RS256', 'PS256', 'ES256'],
        maxTokenAge: '10m',
        clockTolerance: 5,
      })
      const subject = verified.payload.sub
      if (
        !subject ||
        Buffer.byteLength(subject, 'utf8') > 255 ||
        !verified.payload.exp ||
        verified.payload.nonce !== input.nonce ||
        (Array.isArray(verified.payload.aud) &&
          verified.payload.aud.length > 1 &&
          verified.payload.azp !== this.config.userOidcClientId)
      ) {
        throw new Error('OIDC claims are invalid')
      }
      return subject
    } catch (error) {
      if (
        error instanceof TypeError ||
        error instanceof joseErrors.JWKSInvalid ||
        error instanceof joseErrors.JWKSTimeout
      ) {
        throw new ServiceUnavailableException('identity provider is unavailable')
      }
      throw new UnauthorizedException('OIDC identity could not be verified')
    }
  }

  private async exchangeWechatCode(code: string) {
    const url = new URL(this.config.wechatCodeSessionUrl)
    url.searchParams.set('appid', this.config.wechatMiniAppId!)
    url.searchParams.set('secret', this.config.wechatMiniAppSecret!)
    url.searchParams.set('js_code', code)
    url.searchParams.set('grant_type', 'authorization_code')

    let response: Response
    try {
      response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      })
    } catch {
      throw new ServiceUnavailableException('identity provider is unavailable')
    }
    if (!response.ok) throw new ServiceUnavailableException('identity provider is unavailable')

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new ServiceUnavailableException('identity provider returned an invalid response')
    }
    if (!payload || typeof payload !== 'object') {
      throw new ServiceUnavailableException('identity provider returned an invalid response')
    }
    const result = payload as { errcode?: unknown; openid?: unknown }
    if (typeof result.errcode === 'number' && result.errcode !== 0) {
      throw new UnauthorizedException('WeChat login code is invalid or expired')
    }
    if (typeof result.openid !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(result.openid)) {
      throw new ServiceUnavailableException('identity provider returned an invalid response')
    }
    return result.openid
  }

  private async issueProviderSession(
    provider: UserAuthProvider,
    providerSubject: string,
  ): Promise<VerifiedSession> {
    const accessToken = `mf_user_${randomBytes(32).toString('base64url')}`
    const sessionId = randomUUID()
    const expiresAt = new Date(Date.now() + sessionLifetimeMs)
    const subjectRef = this.erasureLedger.identitySubjectRef(provider, providerSubject)

    const issued = await this.database.withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `user-auth:${provider}:${providerSubject}`,
      ])
      const suppressed = await client.query(
        `SELECT 1 FROM auth_identity_suppressions
         WHERE provider = $1 AND subject_ref = $2`,
        [provider, subjectRef],
      )
      if (suppressed.rows[0]) {
        throw new ForbiddenException('this identity was permanently erased')
      }

      const existing = await client.query<{ user_id: string; status: string }>(
        `SELECT identity.user_id, app_user.status
         FROM auth_identities AS identity
         JOIN users AS app_user ON app_user.id = identity.user_id
         WHERE identity.provider = $1 AND identity.provider_subject = $2`,
        [provider, providerSubject],
      )

      let resolvedUserId = existing.rows[0]?.user_id
      if (resolvedUserId && existing.rows[0]?.status !== 'active') {
        throw new ForbiddenException('account is not active')
      }
      let isNewUser = false
      if (!resolvedUserId) {
        isNewUser = true
        resolvedUserId = randomUUID()
        await client.query('INSERT INTO users (id) VALUES ($1)', [resolvedUserId])
        await client.query(
          `
            INSERT INTO auth_identities (id, user_id, provider, provider_subject, verified_at)
            VALUES ($1, $2, $3, $4, NOW())
          `,
          [randomUUID(), resolvedUserId, provider, providerSubject],
        )
      }

      await client.query(
        `
          INSERT INTO auth_sessions (id, user_id, provider, token_hash, expires_at)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [sessionId, resolvedUserId, provider, hashToken(accessToken), expiresAt],
      )
      return { userId: resolvedUserId, isNewUser }
    })

    return {
      accessToken,
      userId: issued.userId,
      provider,
      isNewUser: issued.isNewUser,
      expiresAt: expiresAt.toISOString(),
    }
  }

  async authenticate(accessToken: string): Promise<AuthPrincipal> {
    const result = await this.database.query<{
      id: string
      user_id: string
      provider: UserAuthProvider
    }>(
      `
        UPDATE auth_sessions AS session
        SET last_used_at = NOW()
        FROM users AS app_user
        WHERE session.user_id = app_user.id
          AND session.token_hash = $1
          AND session.revoked_at IS NULL
          AND session.expires_at > NOW()
          AND app_user.status = 'active'
        RETURNING session.id, session.user_id, session.provider
      `,
      [hashToken(accessToken)],
    )

    const session = result.rows[0]
    if (!session) throw new UnauthorizedException('invalid or expired access token')
    return { userId: session.user_id, sessionId: session.id, provider: session.provider }
  }
}
