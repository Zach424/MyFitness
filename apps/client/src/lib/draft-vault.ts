export const localDraftContract = 'myfitness-sensitive-draft/v1' as const
export const localDraftVersion = 1 as const
export const localDraftTtlMs = 24 * 60 * 60 * 1_000
export const localDraftMaxBytes = 96 * 1_024

export const localDraftKinds = ['workout', 'meal', 'health-record'] as const
export type LocalDraftKind = (typeof localDraftKinds)[number]

export type DraftStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

export type LocalDraftEnvelope<T> = {
  contract: typeof localDraftContract
  version: typeof localDraftVersion
  kind: LocalDraftKind
  ownerScope: string
  savedAt: string
  expiresAt: string
  payload: T
}

export type LocalDraftRead<T> =
  | { status: 'ready'; envelope: LocalDraftEnvelope<T> }
  | { status: 'missing' | 'expired' | 'invalid' | 'owner_mismatch' | 'unscoped' }

type DraftVaultOptions = {
  storage: DraftStorage
  ownerScope: () => string | null
  now?: () => number
}

const keyFor = (kind: LocalDraftKind) => `myfitness.local-draft.${kind}`

const utf8ByteLength = (value: string) => {
  let bytes = 0
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4
        index += 1
      } else bytes += 3
    } else bytes += 3
  }
  return bytes
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isExactKeys = (value: Record<string, unknown>, allowed: readonly string[]) =>
  Object.keys(value).every((key) => allowed.includes(key))

const isTimestamp = (value: unknown) =>
  typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value))

const isEnvelope = (
  value: unknown,
  kind: LocalDraftKind,
  ownerScope: string,
): value is LocalDraftEnvelope<unknown> => {
  if (!isRecord(value)) return false
  if (
    !isExactKeys(value, [
      'contract',
      'version',
      'kind',
      'ownerScope',
      'savedAt',
      'expiresAt',
      'payload',
    ]) ||
    value.contract !== localDraftContract ||
    value.version !== localDraftVersion ||
    value.kind !== kind ||
    typeof value.ownerScope !== 'string' ||
    value.ownerScope.length > 200 ||
    value.ownerScope !== ownerScope ||
    !isTimestamp(value.savedAt) ||
    !isTimestamp(value.expiresAt)
  ) {
    return false
  }
  return true
}

export const createDraftVault = ({ storage, ownerScope, now = Date.now }: DraftVaultOptions) => ({
  read<T>(kind: LocalDraftKind, validate: (value: unknown) => value is T): LocalDraftRead<T> {
    const owner = ownerScope()
    if (!owner) return { status: 'unscoped' }
    const key = keyFor(kind)
    const raw = storage.getItem(key)
    if (!raw) return { status: 'missing' }
    if (utf8ByteLength(raw) > localDraftMaxBytes) {
      storage.removeItem(key)
      return { status: 'invalid' }
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      storage.removeItem(key)
      return { status: 'invalid' }
    }
    if (isRecord(parsed) && parsed.ownerScope !== owner) {
      storage.removeItem(key)
      return { status: 'owner_mismatch' }
    }
    if (!isEnvelope(parsed, kind, owner) || !validate(parsed.payload)) {
      storage.removeItem(key)
      return { status: 'invalid' }
    }
    const currentTime = now()
    const savedTime = Date.parse(parsed.savedAt)
    const expiryTime = Date.parse(parsed.expiresAt)
    if (expiryTime - savedTime !== localDraftTtlMs || savedTime > currentTime) {
      storage.removeItem(key)
      return { status: 'invalid' }
    }
    if (expiryTime <= currentTime) {
      storage.removeItem(key)
      return { status: 'expired' }
    }
    return { status: 'ready', envelope: parsed as LocalDraftEnvelope<T> }
  },

  write<T>(kind: LocalDraftKind, payload: T, validate: (value: unknown) => value is T) {
    const key = keyFor(kind)
    const owner = ownerScope()
    if (!owner || !validate(payload)) {
      storage.removeItem(key)
      return null
    }
    const savedAt = new Date(now()).toISOString()
    const envelope: LocalDraftEnvelope<T> = {
      contract: localDraftContract,
      version: localDraftVersion,
      kind,
      ownerScope: owner,
      savedAt,
      expiresAt: new Date(Date.parse(savedAt) + localDraftTtlMs).toISOString(),
      payload,
    }
    const serialized = JSON.stringify(envelope)
    if (utf8ByteLength(serialized) > localDraftMaxBytes) {
      storage.removeItem(key)
      return null
    }
    storage.setItem(key, serialized)
    return envelope
  },

  clear(kind: LocalDraftKind) {
    storage.removeItem(keyFor(kind))
  },

  clearAll() {
    for (const kind of localDraftKinds) storage.removeItem(keyFor(kind))
  },
})

export const localDraftStorageKey = keyFor
