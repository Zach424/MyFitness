import { describe, expect, it } from 'vitest'

import {
  createDraftVault,
  localDraftContract,
  localDraftMaxBytes,
  localDraftStorageKey,
  localDraftTtlMs,
  type DraftStorage,
} from './draft-vault'

const createMemoryStorage = () => {
  const values = new Map<string, string>()
  const storage: DraftStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
  return { storage, values }
}

const isDraft = (value: unknown): value is { title: string } =>
  typeof value === 'object' && value !== null && (value as { title?: unknown }).title === '未完成'

describe('sensitive local draft vault', () => {
  it('writes a versioned owner-scoped envelope and restores it before expiry', () => {
    const { storage, values } = createMemoryStorage()
    const now = Date.parse('2026-08-05T08:00:00.000Z')
    const vault = createDraftVault({ storage, ownerScope: () => 'user:alpha', now: () => now })

    const saved = vault.write('workout', { title: '未完成' }, isDraft)

    expect(saved).toMatchObject({
      contract: localDraftContract,
      version: 1,
      ownerScope: 'user:alpha',
      savedAt: '2026-08-05T08:00:00.000Z',
      expiresAt: '2026-08-06T08:00:00.000Z',
    })
    expect(vault.read('workout', isDraft)).toEqual({ status: 'ready', envelope: saved })
    expect(values.has(localDraftStorageKey('workout'))).toBe(true)
  })

  it('purges expired, cross-owner, malformed, incompatible and oversized values', () => {
    const cases: Array<{
      raw: string
      owner: string
      status: 'expired' | 'owner_mismatch' | 'invalid'
    }> = [
      {
        raw: JSON.stringify({
          contract: localDraftContract,
          version: 1,
          kind: 'meal',
          ownerScope: 'user:alpha',
          savedAt: '2026-08-04T07:59:59.999Z',
          expiresAt: '2026-08-05T07:59:59.999Z',
          payload: { title: '未完成' },
        }),
        owner: 'user:alpha',
        status: 'expired',
      },
      {
        raw: JSON.stringify({
          contract: localDraftContract,
          version: 1,
          kind: 'meal',
          ownerScope: 'user:alpha',
          savedAt: '2026-08-05T08:00:00.000Z',
          expiresAt: '2026-08-06T08:00:00.000Z',
          payload: { title: '未完成' },
        }),
        owner: 'user:beta',
        status: 'owner_mismatch',
      },
      { raw: '{broken', owner: 'user:alpha', status: 'invalid' },
      {
        raw: JSON.stringify({
          contract: localDraftContract,
          version: 2,
          kind: 'meal',
          ownerScope: 'user:alpha',
          savedAt: '2026-08-05T08:00:00.000Z',
          expiresAt: '2026-08-06T08:00:00.000Z',
          payload: { title: '未完成' },
        }),
        owner: 'user:alpha',
        status: 'invalid',
      },
      {
        raw: JSON.stringify({
          contract: localDraftContract,
          version: 1,
          kind: 'meal',
          ownerScope: 'user:alpha',
          savedAt: '2026-08-05T08:00:00.000Z',
          expiresAt: '2026-08-07T08:00:00.000Z',
          payload: { title: '未完成' },
        }),
        owner: 'user:alpha',
        status: 'invalid',
      },
      { raw: 'x'.repeat(localDraftMaxBytes + 1), owner: 'user:alpha', status: 'invalid' },
    ]

    for (const testCase of cases) {
      const { storage, values } = createMemoryStorage()
      values.set(localDraftStorageKey('meal'), testCase.raw)
      const vault = createDraftVault({
        storage,
        ownerScope: () => testCase.owner,
        now: () => Date.parse('2026-08-05T08:00:00.000Z'),
      })
      expect(vault.read('meal', isDraft)).toEqual({ status: testCase.status })
      expect(values.has(localDraftStorageKey('meal'))).toBe(false)
    }
  })

  it('does not persist without an owner or with an invalid payload and clears all kinds', () => {
    const { storage, values } = createMemoryStorage()
    const unscoped = createDraftVault({ storage, ownerScope: () => null })
    expect(unscoped.write('health-record', { title: '未完成' }, isDraft)).toBeNull()
    expect(unscoped.read('health-record', isDraft)).toEqual({ status: 'unscoped' })

    const vault = createDraftVault({ storage, ownerScope: () => 'user:alpha' })
    values.set(localDraftStorageKey('meal'), JSON.stringify({ stale: true }))
    expect(vault.write('meal', { title: '不兼容' }, isDraft)).toBeNull()
    expect(values.has(localDraftStorageKey('meal'))).toBe(false)
    values.set(localDraftStorageKey('meal'), JSON.stringify({ stale: true }))
    expect(
      vault.write(
        'meal',
        { title: `未完成${'中'.repeat(localDraftMaxBytes / 2)}` },
        (value): value is { title: string } => typeof value === 'object' && value !== null,
      ),
    ).toBeNull()
    expect(values.has(localDraftStorageKey('meal'))).toBe(false)
    for (const kind of ['workout', 'meal', 'health-record'] as const) {
      values.set(localDraftStorageKey(kind), JSON.stringify({}))
    }
    vault.clearAll()
    expect(values.size).toBe(0)
    expect(localDraftTtlMs).toBe(86_400_000)
  })
})
