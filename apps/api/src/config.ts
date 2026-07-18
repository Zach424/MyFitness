import path from 'node:path'

const localDatabaseUrl = 'postgresql://myfitness:myfitness_local@127.0.0.1:54329/myfitness'
const localAiServiceUrl = 'http://127.0.0.1:8001'
const localAiServiceToken = 'myfitness-ai-local'
const localPhotoSigningSecret = 'myfitness-photo-local-signing-secret-2026'

const parsePort = (value: string | undefined) => {
  const port = Number(value ?? 3100)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('API_PORT must be an integer between 1 and 65535')
  }
  return port
}

export const getRuntimeConfig = () => {
  const production = process.env.NODE_ENV === 'production'
  const databaseUrl = process.env.DATABASE_URL ?? (production ? undefined : localDatabaseUrl)
  const aiServiceUrl = process.env.AI_SERVICE_URL ?? (production ? undefined : localAiServiceUrl)
  const aiServiceToken =
    process.env.AI_SERVICE_TOKEN ?? (production ? undefined : localAiServiceToken)
  const photoStorageRoot =
    process.env.PHOTO_STORAGE_ROOT ??
    (production ? undefined : path.resolve(process.cwd(), 'uploads/private'))
  const photoSigningSecret =
    process.env.PHOTO_UPLOAD_SIGNING_SECRET ?? (production ? undefined : localPhotoSigningSecret)

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required in production')
  }
  if (!aiServiceUrl || !aiServiceToken) {
    throw new Error('AI_SERVICE_URL and AI_SERVICE_TOKEN are required in production')
  }
  if (!photoStorageRoot || !photoSigningSecret) {
    throw new Error('PHOTO_STORAGE_ROOT and PHOTO_UPLOAD_SIGNING_SECRET are required in production')
  }
  if (photoSigningSecret.length < 32) {
    throw new Error('PHOTO_UPLOAD_SIGNING_SECRET must contain at least 32 characters')
  }

  const aiTimeoutMs = Number(process.env.AI_SERVICE_TIMEOUT_MS ?? 22_000)
  if (!Number.isInteger(aiTimeoutMs) || aiTimeoutMs < 1_000 || aiTimeoutMs > 65_000) {
    throw new Error('AI_SERVICE_TIMEOUT_MS must be an integer between 1000 and 65000')
  }

  return {
    databaseUrl,
    port: parsePort(process.env.API_PORT),
    aiServiceUrl: aiServiceUrl.replace(/\/$/, ''),
    aiServiceToken,
    aiTimeoutMs,
    photoStorageRoot: path.resolve(photoStorageRoot),
    photoSigningSecret,
  }
}
