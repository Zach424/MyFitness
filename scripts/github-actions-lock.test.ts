import { readdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lockPath = resolve(repositoryRoot, 'infra/ci/github-actions.lock.json')
const workflowsDirectory = resolve(repositoryRoot, '.github/workflows')
const dependabotPath = resolve(repositoryRoot, '.github/dependabot.yml')
const revisionPattern = /^[0-9a-f]{40}$/
const versionPattern = /^v\d+\.\d+\.\d+$/
const externalUsePattern =
  /^\s*(?:-\s+)?uses:\s+([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*)@([^\s#]+)(?:\s+#\s+(\S+))?\s*$/
const dockerUsePattern = /^docker:\/\/[^\s@]+@sha256:[0-9a-f]{64}(?:\s+#\s+\S+)?$/

type LockedAction = {
  action: string
  version: string
  verifiedRef: string
  revision: string
}

type ActionLock = {
  schemaVersion: string
  verifiedAt: string
  actions: LockedAction[]
}

const exactKeys = (value: object, keys: string[]) =>
  expect(Object.keys(value).sort()).toEqual([...keys].sort())

const loadLock = async () => {
  const lock = JSON.parse(await readFile(lockPath, 'utf8')) as ActionLock
  exactKeys(lock, ['schemaVersion', 'verifiedAt', 'actions'])
  expect(lock.schemaVersion).toBe('myfitness-github-actions-lock/v1')
  expect(lock.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  expect(Array.isArray(lock.actions)).toBe(true)

  const actionNames = lock.actions.map((entry) => entry.action)
  expect(actionNames).toEqual([...actionNames].sort())
  expect(new Set(actionNames).size).toBe(actionNames.length)

  for (const entry of lock.actions) {
    exactKeys(entry, ['action', 'version', 'verifiedRef', 'revision'])
    expect(entry.action).toMatch(/^[a-z0-9_.-]+\/[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)*$/)
    expect(entry.version).toMatch(versionPattern)
    expect(entry.revision).toMatch(revisionPattern)
    expect(entry.verifiedRef).toBe(`refs/tags/${entry.version}`)
  }
  return new Map(lock.actions.map((entry) => [entry.action, entry]))
}

const validateUseLine = (line: string, lock: Map<string, LockedAction>) => {
  const value = line.slice(line.indexOf('uses:') + 'uses:'.length).trim()
  if (value.startsWith('./')) return null
  if (value.startsWith('docker://')) {
    if (!dockerUsePattern.test(value)) throw new Error('container action must use a sha256 digest')
    return null
  }

  const match = externalUsePattern.exec(line)
  if (!match) throw new Error('external action must use an exact revision and version comment')
  const [, action, revision, version] = match
  if (action !== action.toLowerCase())
    throw new Error(`action identifier must be lowercase: ${action}`)
  if (!revisionPattern.test(revision))
    throw new Error(`action revision must be a full SHA: ${action}`)

  const expected = lock.get(action)
  if (!expected) throw new Error(`action is absent from the lock: ${action}`)
  if (expected.revision !== revision)
    throw new Error(`action revision does not match lock: ${action}`)
  if (expected.version !== version)
    throw new Error(`action version comment does not match lock: ${action}`)
  return action
}

describe('GitHub Actions supply-chain lock', () => {
  it('pins every external workflow action to the reviewed lock', async () => {
    const lock = await loadLock()
    const workflowEntries = await readdir(workflowsDirectory, { withFileTypes: true })
    const observed = new Set<string>()
    let useCount = 0

    for (const entry of workflowEntries) {
      if (!entry.isFile() || !/\.ya?ml$/.test(entry.name)) continue
      const lines = (await readFile(resolve(workflowsDirectory, entry.name), 'utf8')).split(/\r?\n/)
      for (const line of lines) {
        if (!line.includes('uses:') || line.trimStart().startsWith('#')) continue
        useCount += 1
        const action = validateUseLine(line, lock)
        if (action) observed.add(action)
      }
    }

    expect(useCount).toBeGreaterThan(0)
    expect([...observed].sort()).toEqual([...lock.keys()].sort())
  })

  it('rejects mutable, unknown and mislabelled action references', async () => {
    const lock = await loadLock()
    expect(() => validateUseLine('      - uses: actions/checkout@v6', lock)).toThrow(
      'action revision must be a full SHA',
    )
    expect(() =>
      validateUseLine(`      - uses: actions/checkout@${'1'.repeat(40)} # v6.0.3`, lock),
    ).toThrow('action revision does not match lock')
    expect(() =>
      validateUseLine(
        '      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.2',
        lock,
      ),
    ).toThrow('action version comment does not match lock')
  })

  it('keeps GitHub Actions updates visible through Dependabot', async () => {
    const dependabot = await readFile(dependabotPath, 'utf8')
    expect(dependabot).toContain('package-ecosystem: github-actions')
    expect(dependabot).toMatch(/directory:\s*\/?\s*$/m)
    expect(dependabot).toContain('interval: weekly')
  })
})
