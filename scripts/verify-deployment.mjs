const endpoints = {
  api: (process.env.MYFITNESS_DEPLOY_API_URL ?? 'http://127.0.0.1:13100/v1').replace(/\/$/, ''),
  admin: (process.env.MYFITNESS_DEPLOY_ADMIN_URL ?? 'http://127.0.0.1:13101').replace(/\/$/, ''),
  ai: (process.env.MYFITNESS_DEPLOY_AI_URL ?? 'http://127.0.0.1:18001').replace(/\/$/, ''),
}

const request = async (name, url) => {
  const response = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
    headers: { 'x-request-id': crypto.randomUUID() },
  })
  const body = await response.text()
  if (!response.ok)
    throw new Error(`${name} returned HTTP ${response.status}: ${body.slice(0, 300)}`)
  return { response, body }
}

const json = (name, value) => {
  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`${name} did not return JSON`)
  }
}

const requireValue = (condition, message) => {
  if (!condition) throw new Error(message)
}

const checks = []

const live = await request('API liveness', `${endpoints.api}/health/live`)
const liveBody = json('API liveness', live.body)
requireValue(
  liveBody.status === 'alive' && liveBody.service === 'myfitness-api',
  'API liveness contract mismatch',
)
requireValue(
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    live.response.headers.get('x-request-id') ?? '',
  ),
  'API liveness response is missing a valid request ID',
)
checks.push('api-liveness-and-correlation')

const ready = json(
  'API readiness',
  (await request('API readiness', `${endpoints.api}/health`)).body,
)
requireValue(
  ready.status === 'ok' &&
    ready.database === 'up' &&
    ready.redis === 'up' &&
    ready.objectStorage === 'up',
  'API readiness dependencies are incomplete',
)
checks.push('api-postgres-redis-object-readiness')

const ai = json('AI health', (await request('AI health', `${endpoints.ai}/health`)).body)
requireValue(
  ai.status === 'ok' && ai.service === 'myfitness-ai' && typeof ai.provider === 'string',
  'AI health contract mismatch',
)
checks.push('ai-worker-health')

const admin = await request('administrator page', endpoints.admin)
const csp = admin.response.headers.get('content-security-policy') ?? ''
requireValue(csp.includes("frame-ancestors 'none'"), 'administrator CSP does not deny framing')
requireValue(
  admin.response.headers.get('x-frame-options') === 'DENY',
  'administrator frame header mismatch',
)
requireValue(
  !admin.response.headers.has('x-powered-by'),
  'administrator leaks its framework header',
)
requireValue(
  (admin.response.headers.get('content-type') ?? '').includes('text/html'),
  'administrator did not return HTML',
)
checks.push('administrator-html-and-security-headers')

process.stdout.write(
  `${JSON.stringify(
    {
      status: 'ok',
      checkedAt: new Date().toISOString(),
      endpoints,
      checks,
    },
    null,
    2,
  )}\n`,
)
