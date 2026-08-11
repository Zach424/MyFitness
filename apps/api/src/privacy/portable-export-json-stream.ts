import { createHash } from 'node:crypto'

import { privacyExportSchemaVersion, type PrivacyExport } from '@myfitness/contracts'

export const portableExportJsonStreamDefaultChunkBytes = 64 * 1024

const maximumChunkBytes = 1024 * 1024

export type PortableExportJsonStreamReceipt = {
  schemaVersion: typeof privacyExportSchemaVersion
  chunkBytes: number
  byteLength: number
  sha256: string
}

export type PortableExportJsonStreamSession = {
  bytes: AsyncIterable<Buffer>
  receipt: Promise<PortableExportJsonStreamReceipt>
}

const portableExportJsonAsyncArrayTag: unique symbol = Symbol('portableExportJsonAsyncArray')

export type PortableExportJsonAsyncArray<T> = {
  readonly [portableExportJsonAsyncArrayTag]: true
  readonly values: Iterable<T> | AsyncIterable<T>
}

type PortableExportData = PrivacyExport['data']

export type PortableExportJsonSource = Omit<PrivacyExport, 'data'> & {
  data: {
    [Key in keyof PortableExportData]: PortableExportData[Key] extends Array<infer Item>
      ? PortableExportData[Key] | PortableExportJsonAsyncArray<Item>
      : PortableExportData[Key]
  }
}

export const portableExportJsonAsyncArray = <T>(
  values: Iterable<T> | AsyncIterable<T>,
): PortableExportJsonAsyncArray<T> =>
  Object.freeze({ [portableExportJsonAsyncArrayTag]: true as const, values })

const validateChunkBytes = (chunkBytes: number) => {
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1 || chunkBytes > maximumChunkBytes) {
    throw new RangeError(
      `portable export JSON chunk size must be between 1 and ${maximumChunkBytes} bytes`,
    )
  }
  return chunkBytes
}

const validateMaximumBytes = (maximumBytes: number) => {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) {
    throw new RangeError('portable export JSON maximum size must be a non-negative safe integer')
  }
  return maximumBytes
}

const escapedCodeUnit = (codeUnit: number) => `\\u${codeUnit.toString(16).padStart(4, '0')}`

const jsonStringUnit = (value: string, index: number): { token: string; consumed: number } => {
  const codeUnit = value.charCodeAt(index)
  if (codeUnit === 0x22) return { token: '\\"', consumed: 1 }
  if (codeUnit === 0x5c) return { token: '\\\\', consumed: 1 }
  if (codeUnit === 0x08) return { token: '\\b', consumed: 1 }
  if (codeUnit === 0x09) return { token: '\\t', consumed: 1 }
  if (codeUnit === 0x0a) return { token: '\\n', consumed: 1 }
  if (codeUnit === 0x0c) return { token: '\\f', consumed: 1 }
  if (codeUnit === 0x0d) return { token: '\\r', consumed: 1 }
  if (codeUnit < 0x20) return { token: escapedCodeUnit(codeUnit), consumed: 1 }

  if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
    const next = value.charCodeAt(index + 1)
    if (next >= 0xdc00 && next <= 0xdfff) {
      return { token: value.slice(index, index + 2), consumed: 2 }
    }
    return { token: escapedCodeUnit(codeUnit), consumed: 1 }
  }
  if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
    return { token: escapedCodeUnit(codeUnit), consumed: 1 }
  }
  return { token: value[index]!, consumed: 1 }
}

function* jsonStringTokens(value: string, targetBytes: number): Generator<string> {
  yield '"'
  let pending: string[] = []
  let pendingBytes = 0

  for (let index = 0; index < value.length;) {
    const { token, consumed } = jsonStringUnit(value, index)
    const tokenBytes = Buffer.byteLength(token, 'utf8')
    if (pendingBytes > 0 && pendingBytes + tokenBytes > targetBytes) {
      yield pending.join('')
      pending = []
      pendingBytes = 0
    }
    pending.push(token)
    pendingBytes += tokenBytes
    index += consumed
  }

  if (pending.length > 0) yield pending.join('')
  yield '"'
}

const isPortableExportJsonAsyncArray = (
  value: unknown,
): value is PortableExportJsonAsyncArray<unknown> =>
  typeof value === 'object' &&
  value !== null &&
  (value as Partial<PortableExportJsonAsyncArray<unknown>>)[portableExportJsonAsyncArrayTag] ===
    true

async function* jsonArrayTokens(
  values: Iterable<unknown> | AsyncIterable<unknown>,
  depth: number,
  targetBytes: number,
  ancestors: Set<object>,
): AsyncGenerator<string> {
  yield '['
  let index = 0
  for await (const child of values) {
    yield index === 0 ? '\n' : ',\n'
    yield '  '.repeat(depth + 1)
    yield* jsonTokens(child, depth + 1, targetBytes, ancestors)
    index += 1
  }
  if (index === 0) {
    yield ']'
    return
  }
  yield '\n'
  yield '  '.repeat(depth)
  yield ']'
}

async function* jsonTokens(
  value: unknown,
  depth: number,
  targetBytes: number,
  ancestors: Set<object>,
): AsyncGenerator<string> {
  if (value === null) {
    yield 'null'
    return
  }
  if (typeof value === 'string') {
    yield* jsonStringTokens(value, targetBytes)
    return
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    yield JSON.stringify(value)
    return
  }
  if (typeof value !== 'object') {
    throw new TypeError('portable export contains a non-JSON value')
  }
  if (ancestors.has(value)) throw new TypeError('portable export contains a circular value')

  ancestors.add(value)
  try {
    if (isPortableExportJsonAsyncArray(value)) {
      yield* jsonArrayTokens(value.values, depth, targetBytes, ancestors)
      return
    }
    if (Array.isArray(value)) {
      yield* jsonArrayTokens(value, depth, targetBytes, ancestors)
      return
    }

    const entries = Object.entries(value)
    if (entries.length === 0) {
      yield '{}'
      return
    }
    yield '{'
    for (let index = 0; index < entries.length; index += 1) {
      const [key, child] = entries[index]!
      yield index === 0 ? '\n' : ',\n'
      yield '  '.repeat(depth + 1)
      yield* jsonStringTokens(key, targetBytes)
      yield ': '
      yield* jsonTokens(child, depth + 1, targetBytes, ancestors)
    }
    yield '\n'
    yield '  '.repeat(depth)
    yield '}'
  } finally {
    ancestors.delete(value)
  }
}

async function* utf8Chunks(
  tokens: Iterable<string> | AsyncIterable<string>,
  chunkBytes: number,
): AsyncGenerator<Buffer> {
  let pending = Buffer.allocUnsafe(chunkBytes)
  let pendingBytes = 0

  for await (const token of tokens) {
    const encoded = Buffer.from(token, 'utf8')
    let offset = 0
    while (offset < encoded.length) {
      const copied = encoded.copy(
        pending,
        pendingBytes,
        offset,
        Math.min(encoded.length, offset + chunkBytes - pendingBytes),
      )
      pendingBytes += copied
      offset += copied
      if (pendingBytes === chunkBytes) {
        yield pending
        pending = Buffer.allocUnsafe(chunkBytes)
        pendingBytes = 0
      }
    }
  }

  if (pendingBytes > 0) yield pending.subarray(0, pendingBytes)
}

export const createPortableExportJsonStream = (
  payload: PortableExportJsonSource,
  options: { chunkBytes?: number; maximumBytes?: number } = {},
): PortableExportJsonStreamSession => {
  const chunkBytes = validateChunkBytes(
    options.chunkBytes ?? portableExportJsonStreamDefaultChunkBytes,
  )
  const maximumBytes = validateMaximumBytes(options.maximumBytes ?? Number.MAX_SAFE_INTEGER)
  let resolveReceipt!: (receipt: PortableExportJsonStreamReceipt) => void
  let rejectReceipt!: (error: unknown) => void
  const receipt = new Promise<PortableExportJsonStreamReceipt>((resolve, reject) => {
    resolveReceipt = resolve
    rejectReceipt = reject
  })

  const bytes = (async function* () {
    const hash = createHash('sha256')
    let byteLength = 0
    let completed = false

    try {
      const tokens = (async function* () {
        yield* jsonTokens(payload, 0, chunkBytes, new Set())
        yield '\n'
      })()
      for await (const chunk of utf8Chunks(tokens, chunkBytes)) {
        if (byteLength > maximumBytes - chunk.length) {
          throw new RangeError('portable export JSON exceeds the configured maximum size')
        }
        byteLength += chunk.length
        hash.update(chunk)
        yield chunk
      }
      completed = true
      resolveReceipt({
        schemaVersion: privacyExportSchemaVersion,
        chunkBytes,
        byteLength,
        sha256: hash.digest('hex'),
      })
    } catch (error) {
      rejectReceipt(error)
      throw error
    } finally {
      if (!completed) rejectReceipt(new Error('portable export JSON stream did not complete'))
    }
  })()

  return { bytes, receipt }
}
