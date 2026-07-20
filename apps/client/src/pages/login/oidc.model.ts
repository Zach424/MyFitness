import type { OidcAuthorizationConfig, OidcSessionRequest } from '@myfitness/contracts'

export const oidcTransactionStorageKey = 'myfitness.auth.oidc.transaction'
export const oidcCallbackTargetStorageKey = 'myfitness.auth.oidc.callbackTarget'
export const oidcLoginRoute = '/pages/login/index'
export const oidcCallbackPath = '/auth/callback'

const transactionVersion = 'myfitness-h5-oidc-transaction/v1'
const transactionLifetimeMs = 10 * 60 * 1000
const transactionFutureToleranceMs = 60 * 1000
const base64UrlPattern = /^[A-Za-z0-9_-]+$/
const verifierPattern = /^[A-Za-z0-9._~-]+$/
const allowedResponseParameters = new Set([
  'code',
  'state',
  'iss',
  'session_state',
  'error',
  'error_description',
  'error_uri',
])

type OidcTransaction = {
  schemaVersion: typeof transactionVersion
  issuer: string
  redirectUri: string
  state: string
  nonce: string
  codeVerifier: string
  createdAt: number
}

type StorageBoundary = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type HistoryBoundary = Pick<History, 'replaceState'>
type CryptoBoundary = {
  randomBytes: (byteLength: number) => Uint8Array<ArrayBuffer>
  sha256: (data: Uint8Array<ArrayBuffer>) => Promise<Uint8Array<ArrayBuffer>>
}

export type OidcFlowErrorKind =
  | 'configuration'
  | 'missing_transaction'
  | 'expired_transaction'
  | 'invalid_response'
  | 'provider_denied'
  | 'provider_error'

export class OidcFlowError extends Error {
  readonly kind: OidcFlowErrorKind

  constructor(kind: OidcFlowErrorKind, message: string) {
    super(message)
    this.name = 'OidcFlowError'
    this.kind = kind
  }
}

const encodeBase64Url = (bytes: Uint8Array<ArrayBuffer>) => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return globalThis.btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

const randomValue = (crypto: CryptoBoundary, byteLength: number) => {
  const bytes = crypto.randomBytes(byteLength)
  if (bytes.length !== byteLength) {
    throw new OidcFlowError('configuration', '浏览器没有生成完整的安全随机值')
  }
  return encodeBase64Url(bytes)
}

const constantTimeEqual = (left: string, right: string) => {
  let difference = left.length ^ right.length
  const maximum = Math.max(left.length, right.length)
  for (let index = 0; index < maximum; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0)
  }
  return difference === 0
}

const exactKeys = (value: Record<string, unknown>, expected: string[]) => {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index])
}

const readTransaction = (storage: StorageBoundary): OidcTransaction | null => {
  const raw = storage.getItem(oidcTransactionStorageKey)
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    if (
      !exactKeys(value, [
        'schemaVersion',
        'issuer',
        'redirectUri',
        'state',
        'nonce',
        'codeVerifier',
        'createdAt',
      ]) ||
      value.schemaVersion !== transactionVersion ||
      typeof value.issuer !== 'string' ||
      typeof value.redirectUri !== 'string' ||
      typeof value.state !== 'string' ||
      value.state.length < 43 ||
      value.state.length > 128 ||
      !base64UrlPattern.test(value.state) ||
      typeof value.nonce !== 'string' ||
      value.nonce.length < 43 ||
      value.nonce.length > 128 ||
      !base64UrlPattern.test(value.nonce) ||
      typeof value.codeVerifier !== 'string' ||
      value.codeVerifier.length < 43 ||
      value.codeVerifier.length > 128 ||
      !verifierPattern.test(value.codeVerifier) ||
      typeof value.createdAt !== 'number' ||
      !Number.isSafeInteger(value.createdAt)
    ) {
      return null
    }
    return value as OidcTransaction
  } catch {
    return null
  }
}

const assertBrowserConfig = (config: OidcAuthorizationConfig, browserOrigin: string) => {
  let redirect: URL
  let authorization: URL
  try {
    redirect = new URL(config.redirectUri)
    authorization = new URL(config.authorizationUrl)
  } catch {
    throw new OidcFlowError('configuration', '登录配置不是有效网址')
  }
  if (
    redirect.origin !== browserOrigin ||
    redirect.pathname !== oidcCallbackPath ||
    redirect.search ||
    redirect.hash
  ) {
    throw new OidcFlowError('configuration', '登录回调地址与当前网站不匹配')
  }
  if (authorization.hash) {
    throw new OidcFlowError('configuration', '身份服务授权地址不能包含片段')
  }
  if (config.scopes.length !== 1 || config.scopes[0] !== 'openid') {
    throw new OidcFlowError('configuration', '登录配置必须只申请基础身份范围')
  }
}

export const createOidcAuthorization = async ({
  config,
  browserOrigin,
  storage,
  crypto,
  now = Date.now(),
}: {
  config: OidcAuthorizationConfig
  browserOrigin: string
  storage: StorageBoundary
  crypto: CryptoBoundary
  now?: number
}) => {
  assertBrowserConfig(config, browserOrigin)
  const state = randomValue(crypto, 32)
  const nonce = randomValue(crypto, 32)
  const codeVerifier = randomValue(crypto, 64)
  const challengeBytes = await crypto.sha256(new TextEncoder().encode(codeVerifier))
  const codeChallenge = encodeBase64Url(challengeBytes)
  const transaction: OidcTransaction = {
    schemaVersion: transactionVersion,
    issuer: config.issuer,
    redirectUri: config.redirectUri,
    state,
    nonce,
    codeVerifier,
    createdAt: now,
  }
  storage.removeItem(oidcCallbackTargetStorageKey)
  storage.setItem(oidcTransactionStorageKey, JSON.stringify(transaction))

  const authorization = new URL(config.authorizationUrl)
  authorization.searchParams.set('response_type', 'code')
  authorization.searchParams.set('client_id', config.clientId)
  authorization.searchParams.set('redirect_uri', config.redirectUri)
  authorization.searchParams.set('scope', config.scopes.join(' '))
  authorization.searchParams.set('state', state)
  authorization.searchParams.set('nonce', nonce)
  authorization.searchParams.set('code_challenge', codeChallenge)
  authorization.searchParams.set('code_challenge_method', 'S256')

  return { authorizationUrl: authorization.toString(), transaction, codeChallenge }
}

const responseParameters = (href: string) => {
  const url = new URL(href)
  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
  const separator = hash.indexOf('?')
  if (separator >= 0) {
    return {
      parameters: new URLSearchParams(hash.slice(separator + 1)),
      cleanUrl: `${url.pathname}#${hash.slice(0, separator)}`,
    }
  }
  return { parameters: url.searchParams, cleanUrl: `${url.pathname}${url.hash}` }
}

const singleParameter = (
  parameters: URLSearchParams,
  name: string,
  required = false,
): string | undefined => {
  const values = parameters.getAll(name)
  if (values.length > 1 || (required && values.length !== 1)) {
    throw new OidcFlowError('invalid_response', `登录返回的 ${name} 参数无效`)
  }
  return values[0]
}

export const hasOidcAuthorizationResponse = (href: string) => {
  const { parameters } = responseParameters(href)
  return ['code', 'state', 'error', 'iss'].some((name) => parameters.has(name))
}

export const hasOidcCallbackTarget = (storage: StorageBoundary) =>
  storage.getItem(oidcCallbackTargetStorageKey) !== null

export const clearOidcAuthorizationResponseUrl = (href: string, history: HistoryBoundary) => {
  const { cleanUrl } = responseParameters(href)
  history.replaceState(null, '', cleanUrl)
}

export const consumeOidcAuthorizationResponse = ({
  config,
  href,
  browserOrigin,
  storage,
  history,
  now = Date.now(),
}: {
  config: OidcAuthorizationConfig
  href: string
  browserOrigin: string
  storage: StorageBoundary
  history: HistoryBoundary
  now?: number
}): OidcSessionRequest => {
  assertBrowserConfig(config, browserOrigin)
  const { parameters, cleanUrl } = responseParameters(href)
  const isAuthorizationResponse = ['code', 'state', 'error', 'iss'].some((name) =>
    parameters.has(name),
  )
  history.replaceState(null, '', cleanUrl)
  const transaction = readTransaction(storage)
  const callbackTarget = storage.getItem(oidcCallbackTargetStorageKey)
  storage.removeItem(oidcTransactionStorageKey)
  storage.removeItem(oidcCallbackTargetStorageKey)

  if (!isAuthorizationResponse) {
    throw new OidcFlowError('invalid_response', '身份服务没有返回可处理的登录结果')
  }
  if (!transaction || !callbackTarget) {
    throw new OidcFlowError('missing_transaction', '这次登录不属于当前标签页，请重新开始')
  }
  if (
    transaction.createdAt > now + transactionFutureToleranceMs ||
    now - transaction.createdAt > transactionLifetimeMs
  ) {
    throw new OidcFlowError('expired_transaction', '这次登录已过期，请重新开始')
  }
  if (
    transaction.issuer !== config.issuer ||
    transaction.redirectUri !== config.redirectUri ||
    callbackTarget !== config.redirectUri
  ) {
    throw new OidcFlowError('invalid_response', '登录服务或回调地址在过程中发生了变化')
  }

  for (const name of parameters.keys()) {
    if (!allowedResponseParameters.has(name)) {
      throw new OidcFlowError('invalid_response', `登录返回了不支持的参数 ${name}`)
    }
  }
  const state = singleParameter(parameters, 'state', true)
  if (!state || !constantTimeEqual(state, transaction.state)) {
    throw new OidcFlowError('invalid_response', '登录状态校验失败，请重新开始')
  }
  const issuer = singleParameter(parameters, 'iss')
  if (issuer !== undefined && issuer !== config.issuer) {
    throw new OidcFlowError('invalid_response', '登录返回的身份服务不匹配')
  }
  singleParameter(parameters, 'session_state')

  const error = singleParameter(parameters, 'error')
  const code = singleParameter(parameters, 'code')
  if (error !== undefined) {
    if (code !== undefined || !/^[A-Za-z0-9_]{1,64}$/.test(error)) {
      throw new OidcFlowError('invalid_response', '身份服务返回了无法识别的登录结果')
    }
    const description = singleParameter(parameters, 'error_description')
    const errorUri = singleParameter(parameters, 'error_uri')
    if ((description?.length ?? 0) > 1024 || (errorUri?.length ?? 0) > 2048) {
      throw new OidcFlowError('invalid_response', '身份服务返回的错误信息超出限制')
    }
    throw new OidcFlowError(
      error === 'access_denied' ? 'provider_denied' : 'provider_error',
      error === 'access_denied' ? '登录已取消，没有创建衡迹会话' : '身份服务没有完成登录',
    )
  }
  if (
    !code ||
    code.length < 8 ||
    code.length > 2048 ||
    code.trim() !== code ||
    parameters.has('error_description') ||
    parameters.has('error_uri')
  ) {
    throw new OidcFlowError('invalid_response', '身份服务没有返回有效的登录凭证')
  }

  return {
    code,
    codeVerifier: transaction.codeVerifier,
    nonce: transaction.nonce,
    redirectUri: transaction.redirectUri,
  }
}
