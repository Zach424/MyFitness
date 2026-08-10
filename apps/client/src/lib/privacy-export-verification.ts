import {
  maximumPrivacyExportBytes,
  privacyExportContentType,
  privacyExportSchemaVersion,
} from '@myfitness/contracts/privacy.constants'

export type PrivacyExportVerificationFailure =
  'content_type' | 'invalid_contract' | 'too_large' | 'unreadable'

export type PrivacyExportVerification = {
  schemaVersion: typeof privacyExportSchemaVersion
  generatedAt: string
  byteLength: number
}

const dataKeys = [
  'account',
  'identities',
  'profile',
  'goal',
  'consentEvents',
  'healthRecords',
  'healthRecordRevisions',
  'exerciseCatalog',
  'foodCatalog',
  'workouts',
  'nutritionMeals',
  'nutritionFavorites',
  'weeklyPlans',
  'aiExplanationRuns',
  'foodPhotoAnalyses',
  'progressPhotos',
] as const

const arrayDataKeys = dataKeys.filter(
  (key) => key !== 'account' && key !== 'profile' && key !== 'goal',
)

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]) => {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

const isOffsetDateTime = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
  Number.isFinite(Date.parse(value))

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

const utf8ByteLength = (value: string) => {
  let length = 0
  for (const character of value) {
    const point = character.codePointAt(0)!
    length += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4
  }
  return length
}

const normalizedContentType = (value: string | undefined) =>
  value?.split(';', 1)[0]?.trim().toLocaleLowerCase()

const isExportData = (value: unknown) => {
  if (!isObject(value) || !hasExactKeys(value, dataKeys)) return false
  if (!isObject(value.account)) return false
  if (value.profile !== null && !isObject(value.profile)) return false
  if (value.goal !== null && !isObject(value.goal)) return false
  return arrayDataKeys.every(
    (key) => Array.isArray(value[key]) && value[key].every((item) => isObject(item)),
  )
}

export class PrivacyExportVerificationError extends Error {
  readonly kind: PrivacyExportVerificationFailure

  constructor(kind: PrivacyExportVerificationFailure) {
    const message =
      kind === 'content_type'
        ? '数据副本不是受支持的 JSON 文件，未写入下载或保存位置。'
        : kind === 'too_large'
          ? '数据副本超过当前客户端 50 MiB 验证上限，未写入下载或保存位置。'
          : kind === 'unreadable'
            ? '数据副本无法在本机完成验证，未写入下载或保存位置。'
            : '数据副本未通过当前版本与结构验证，未写入下载或保存位置。'
    super(message)
    this.name = 'PrivacyExportVerificationError'
    this.kind = kind
  }
}

export const verifyPrivacyExportArtifact = (
  text: string,
  contentType: string | undefined,
): PrivacyExportVerification => {
  if (normalizedContentType(contentType) !== privacyExportContentType) {
    throw new PrivacyExportVerificationError('content_type')
  }
  if (!text || text.length > maximumPrivacyExportBytes) {
    throw new PrivacyExportVerificationError(text ? 'too_large' : 'invalid_contract')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new PrivacyExportVerificationError('invalid_contract')
  }

  if (
    !isObject(parsed) ||
    !hasExactKeys(parsed, ['schemaVersion', 'generatedAt', 'accountId', 'data']) ||
    parsed.schemaVersion !== privacyExportSchemaVersion ||
    !isOffsetDateTime(parsed.generatedAt) ||
    !isUuid(parsed.accountId) ||
    !isExportData(parsed.data)
  ) {
    throw new PrivacyExportVerificationError('invalid_contract')
  }

  const byteLength = utf8ByteLength(text)
  if (byteLength > maximumPrivacyExportBytes) {
    throw new PrivacyExportVerificationError('too_large')
  }
  return { schemaVersion: privacyExportSchemaVersion, generatedAt: parsed.generatedAt, byteLength }
}

export const privacyExportContentTypeFromHeaders = (headers: unknown) => {
  if (typeof headers === 'string') {
    return headers.match(/^content-type:\s*([^\r\n]+)/im)?.[1]?.trim()
  }
  if (!isObject(headers)) return undefined
  const entry = Object.entries(headers).find(([key]) => key.toLocaleLowerCase() === 'content-type')
  return typeof entry?.[1] === 'string' ? entry[1] : undefined
}
