import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

// The production CLI intentionally remains dependency-free JavaScript.
// @ts-expect-error the ESM script does not ship a separate declaration file
import {
  resolveVaultTarget,
  selectObsidianVault,
  synchronizeProjectStatus,
} from './sync-project-status-to-obsidian.mjs'

const temporaryRoots: string[] = []

const temporaryRoot = async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'myfitness-obsidian-'))
  temporaryRoots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

describe('Obsidian project-status mirror', () => {
  it('selects the most recent open vault deterministically', () => {
    expect(
      selectObsidianVault({
        vaults: {
          oldOpen: { path: 'C:/notes/old', ts: 20, open: true },
          recentClosed: { path: 'C:/notes/recent', ts: 30 },
          recentOpen: { path: 'C:/notes/current', ts: 40, open: true },
        },
      }),
    ).toMatchObject({ id: 'recentOpen', open: true, timestamp: 40 })
  })

  it('rejects absolute and escaping targets', () => {
    const vaultPath = resolve('notes', 'vault')
    expect(() => resolveVaultTarget(vaultPath, resolve('outside.md'))).toThrow('must be relative')
    expect(() => resolveVaultTarget(vaultPath, '../outside.md')).toThrow('must remain inside')
  })

  it('writes an exact mirror and detects stale content', async () => {
    const root = await temporaryRoot()
    const vaultPath = resolve(root, 'vault')
    const sourcePath = resolve(root, 'PROJECT_STATUS.md')
    const target = '10_Projects/MyFitness/PROJECT_STATUS.md'
    await mkdir(vaultPath)
    await writeFile(sourcePath, '# Current status\n\nValidated.\n')

    const written = await synchronizeProjectStatus({ vaultPath, sourcePath, target, mode: 'write' })
    expect(await readFile(written.target, 'utf8')).toBe('# Current status\n\nValidated.\n')
    await expect(
      synchronizeProjectStatus({ vaultPath, sourcePath, target, mode: 'verify' }),
    ).resolves.toMatchObject({ status: 'ok', mode: 'verify' })

    await writeFile(written.target, '# stale\n')
    await expect(
      synchronizeProjectStatus({ vaultPath, sourcePath, target, mode: 'verify' }),
    ).rejects.toThrow('missing or stale')
  })
})
