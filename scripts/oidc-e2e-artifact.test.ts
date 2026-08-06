import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { verifyOidcE2eArtifact, writeOidcE2eArtifact } from './oidc-e2e-artifact.mjs'

const temporaryRoots: string[] = []
const apiBaseUrl = 'http://127.0.0.1:3100/v1'

const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), 'myfitness-oidc-e2e-'))
  temporaryRoots.push(root)
  const buildRoot = join(root, 'dist-h5')
  const receiptPath = join(root, '.taro', 'oidc-e2e-artifact.json')
  await mkdir(join(buildRoot, 'auth', 'callback'), { recursive: true })
  await mkdir(join(buildRoot, 'js'), { recursive: true })
  await writeFile(join(buildRoot, 'index.html'), '<script src="/js/app.js"></script>')
  await writeFile(join(buildRoot, 'js', 'app.js'), 'const authMode="oidc"')
  await writeFile(join(buildRoot, 'auth', 'callback', 'index.html'), '<title>callback</title>')
  await writeFile(join(buildRoot, 'auth', 'callback', 'redirect.js'), 'location.replace("/")')
  return { buildRoot, receiptPath }
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })))
})

describe('OIDC E2E build artifact', () => {
  it('writes and verifies a receipt bound to the complete H5 tree', async () => {
    const paths = await fixture()

    const written = await writeOidcE2eArtifact({ ...paths, apiBaseUrl })
    const verified = await verifyOidcE2eArtifact({ ...paths, apiBaseUrl })

    expect(verified).toEqual(written)
    expect(verified).toMatchObject({
      schemaVersion: 'myfitness-oidc-e2e-artifact/v1',
      authMode: 'oidc',
      apiBaseUrl,
    })
    expect(verified.treeSha256).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('fails closed when no OIDC build receipt exists', async () => {
    const paths = await fixture()

    await expect(verifyOidcE2eArtifact({ ...paths, apiBaseUrl })).rejects.toThrow(
      'OIDC E2E build receipt is missing',
    )
  })

  it('rejects a receipt after another build changes the served tree', async () => {
    const paths = await fixture()
    await writeOidcE2eArtifact({ ...paths, apiBaseUrl })
    await writeFile(join(paths.buildRoot, 'js', 'app.js'), 'const authMode="dev"')

    await expect(verifyOidcE2eArtifact({ ...paths, apiBaseUrl })).rejects.toThrow(
      'OIDC E2E build tree digest does not match',
    )
  })

  it('refuses to attest a build without the exact callback bridge', async () => {
    const paths = await fixture()
    await rm(join(paths.buildRoot, 'auth', 'callback', 'redirect.js'))

    await expect(writeOidcE2eArtifact({ ...paths, apiBaseUrl })).rejects.toThrow(
      'OIDC E2E build is missing auth/callback/redirect.js',
    )
  })
})
