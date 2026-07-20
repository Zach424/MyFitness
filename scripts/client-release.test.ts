import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  assembleClientReleaseManifest,
  assertClientMatchesServiceRelease,
  clientManifestSchemaVersion,
  createClientBuildMetadata,
  createDeterministicTar,
  packageClientArtifact,
  parseDeterministicTar,
  runClientReleaseCli,
  validateClientApiBaseUrl,
  validateClientReleaseManifest,
  verifyClientReleaseArtifacts,
} from './client-release.mjs'
import {
  assembleReleaseManifest,
  createServiceFragment,
  releaseServices,
} from './release-manifest.mjs'

const repository = 'Zach424/MyFitness'
const revision = '1'.repeat(40)
const version = 'v0.1.0-rc.2'
const runId = '29692031372'
const runAttempt = '1'
const apiBaseUrl = 'https://api.release.myfitness.cn/v1'
const publishedAt = '2026-07-19T12:00:00.000Z'
const temporaryRoots: string[] = []

const makeTemporaryRoot = async () => {
  const root = await mkdtemp(join(tmpdir(), 'myfitness-client-release-'))
  temporaryRoots.push(root)
  return root
}

const writeJson = async (path: string, value: unknown) =>
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')

const buildMetadata = (platform: 'h5' | 'weapp') =>
  createClientBuildMetadata({
    platform,
    repository,
    revision,
    version,
    runId,
    runAttempt,
    apiBaseUrl,
    authMode: platform === 'h5' ? 'oidc' : 'wechat',
  })

const createBuildRoot = async (root: string, platform: 'h5' | 'weapp') => {
  const buildRoot = join(root, `dist-${platform}`)
  await mkdir(join(buildRoot, 'assets'), { recursive: true })
  await writeJson(join(buildRoot, 'myfitness-client-build.json'), buildMetadata(platform))
  if (platform === 'h5') {
    await mkdir(join(buildRoot, 'auth', 'callback'), { recursive: true })
    await writeFile(join(buildRoot, 'index.html'), '<!doctype html><title>MyFitness</title>\n')
    await writeFile(join(buildRoot, 'auth', 'callback', 'index.html'), '<!doctype html>\n')
    await writeFile(join(buildRoot, 'auth', 'callback', 'redirect.js'), 'location.replace("/")\n')
  } else {
    await writeFile(join(buildRoot, 'app.js'), 'App({})\n')
    await writeFile(join(buildRoot, 'app.json'), '{"pages":[]}\n')
  }
  await writeFile(join(buildRoot, 'assets', 'main.js'), 'console.log("衡迹")\n')
  return buildRoot
}

const packagePlatform = async (root: string, platform: 'h5' | 'weapp', suffix = '') => {
  const buildRoot = await createBuildRoot(root, platform)
  const outputRoot = join(root, `release${suffix}`)
  await mkdir(outputRoot, { recursive: true })
  const artifactPath = join(outputRoot, `myfitness-client-${platform}.tar`)
  const fragmentPath = join(outputRoot, `client-release-fragment-${platform}.json`)
  const fragment = await packageClientArtifact({
    platform,
    buildRoot,
    artifactPath,
    fragmentPath,
    repository,
    revision,
    version,
    runId,
    runAttempt,
  })
  return { artifactPath, fragmentPath, fragment, outputRoot }
}

const createClientRelease = async (root: string) => {
  const h5 = await packagePlatform(root, 'h5')
  const weapp = await packagePlatform(root, 'weapp')
  return {
    h5,
    weapp,
    manifest: assembleClientReleaseManifest([h5.fragment, weapp.fragment], publishedAt),
  }
}

const serviceRelease = () =>
  assembleReleaseManifest(
    releaseServices.map((service, index) =>
      createServiceFragment({
        service,
        image: `ghcr.io/zach424/myfitness-${service}`,
        digest: `sha256:${String(index + 1).repeat(64)}`,
        repository,
        revision,
        version,
        runId,
        runAttempt,
      }),
    ),
    publishedAt,
  )

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
  vi.restoreAllMocks()
})

describe('immutable client delivery artifacts', () => {
  it('packages byte-identical archives from the same build content', async () => {
    const firstRoot = await makeTemporaryRoot()
    const secondRoot = await makeTemporaryRoot()

    const first = await packagePlatform(firstRoot, 'h5')
    const second = await packagePlatform(secondRoot, 'h5')

    expect(await readFile(first.artifactPath)).toEqual(await readFile(second.artifactPath))
    expect(first.fragment.artifact).toEqual(second.fragment.artifact)
    expect(
      parseDeterministicTar(await readFile(first.artifactPath)).map((entry) => entry.path),
    ).toEqual([
      'assets/main.js',
      'auth/callback/index.html',
      'auth/callback/redirect.js',
      'index.html',
      'myfitness-client-build.json',
    ])
  })

  it('assembles, validates, and verifies both actual platform archives', async () => {
    const root = await makeTemporaryRoot()
    const release = await createClientRelease(root)

    expect(release.manifest).toMatchObject({
      schemaVersion: clientManifestSchemaVersion,
      version,
      source: { repository, revision },
      workflow: { id: runId, attempt: 1 },
      clients: {
        h5: { deliveryClass: 'candidate', adapter: 'static-host' },
        weapp: { deliveryClass: 'candidate', adapter: 'wechat-code-upload' },
      },
    })
    await expect(
      verifyClientReleaseArtifacts(release.manifest, release.h5.outputRoot, {
        expectedRepository: repository,
        expectedRevision: revision,
        expectedVersion: version,
      }),
    ).resolves.toEqual(release.manifest)
    expect(assertClientMatchesServiceRelease(release.manifest, serviceRelease())).toEqual({
      client: release.manifest,
      service: serviceRelease(),
    })
  })

  it('rejects an archive whose bytes changed after publication', async () => {
    const root = await makeTemporaryRoot()
    const release = await createClientRelease(root)
    const archive = await readFile(release.h5.artifactPath)
    archive[600] ^= 1
    await writeFile(release.h5.artifactPath, archive)

    await expect(
      verifyClientReleaseArtifacts(release.manifest, release.h5.outputRoot),
    ).rejects.toThrow('h5 artifact digest does not match its manifest')
  })

  it('rejects unsafe paths and non-canonical archive headers', () => {
    expect(() => createDeterministicTar([{ path: '../secret', data: Buffer.from('x') }])).toThrow(
      'archive path is unsafe',
    )
    expect(() =>
      createDeterministicTar([
        { path: 'index.html', data: Buffer.from('one') },
        { path: 'index.html', data: Buffer.from('two') },
      ]),
    ).toThrow('client archive contains duplicate path')

    const archive = createDeterministicTar([{ path: 'index.html', data: Buffer.from('ok') }])
    expect(() => parseDeterministicTar(Buffer.concat([archive, Buffer.alloc(512)]))).toThrow(
      'client archive must use canonical deterministic USTAR bytes',
    )
    archive[100] = 0x37
    expect(() => parseDeterministicTar(archive)).toThrow(
      'client archive header checksum is invalid',
    )
  })

  it('rejects missing entrypoints and embedded release metadata mismatches', async () => {
    const missingRoot = await makeTemporaryRoot()
    const missingBuild = await createBuildRoot(missingRoot, 'h5')
    await rm(join(missingBuild, 'index.html'))
    await expect(
      packageClientArtifact({
        platform: 'h5',
        buildRoot: missingBuild,
        artifactPath: join(missingRoot, 'myfitness-client-h5.tar'),
        fragmentPath: join(missingRoot, 'client-release-fragment-h5.json'),
        repository,
        revision,
        version,
        runId,
        runAttempt,
      }),
    ).rejects.toThrow('h5 build is missing required file index.html')

    const callbackMissingRoot = await makeTemporaryRoot()
    const callbackMissingBuild = await createBuildRoot(callbackMissingRoot, 'h5')
    await rm(join(callbackMissingBuild, 'auth', 'callback', 'redirect.js'))
    await expect(
      packageClientArtifact({
        platform: 'h5',
        buildRoot: callbackMissingBuild,
        artifactPath: join(callbackMissingRoot, 'myfitness-client-h5.tar'),
        fragmentPath: join(callbackMissingRoot, 'client-release-fragment-h5.json'),
        repository,
        revision,
        version,
        runId,
        runAttempt,
      }),
    ).rejects.toThrow('h5 build is missing required file auth/callback/redirect.js')

    const mismatchRoot = await makeTemporaryRoot()
    const mismatchBuild = await createBuildRoot(mismatchRoot, 'weapp')
    await expect(
      packageClientArtifact({
        platform: 'weapp',
        buildRoot: mismatchBuild,
        artifactPath: join(mismatchRoot, 'myfitness-client-weapp.tar'),
        fragmentPath: join(mismatchRoot, 'client-release-fragment-weapp.json'),
        repository,
        revision: '2'.repeat(40),
        version,
        runId,
        runAttempt,
      }),
    ).rejects.toThrow('weapp build metadata revision does not match')
  })

  it('rejects non-routable API bases and unsafe platform auth classes', () => {
    for (const value of [
      'http://api.myfitness.cn/v1',
      'https://127.0.0.1/v1',
      'https://api.example/v1',
      'https://api.myfitness.cn/v2',
      'https://api.myfitness.cn:443/v1',
    ]) {
      expect(() => validateClientApiBaseUrl(value)).toThrow()
    }
    expect(validateClientApiBaseUrl(apiBaseUrl)).toBe(apiBaseUrl)
    expect(() => createClientBuildMetadata({ ...buildMetadata('weapp'), authMode: 'dev' })).toThrow(
      'weapp release auth mode must be wechat',
    )
    expect(() => createClientBuildMetadata({ ...buildMetadata('h5'), authMode: 'dev' })).toThrow(
      'h5 release auth mode must be oidc',
    )
  })

  it('rejects fragments that do not share source, workflow, and API identity', async () => {
    const root = await makeTemporaryRoot()
    const { h5, weapp } = await createClientRelease(root)

    expect(() =>
      assembleClientReleaseManifest(
        [
          h5.fragment,
          { ...weapp.fragment, source: { ...weapp.fragment.source, revision: '2'.repeat(40) } },
        ],
        publishedAt,
      ),
    ).toThrow('client fragments do not share one source revision')
    expect(() =>
      assembleClientReleaseManifest(
        [h5.fragment, { ...weapp.fragment, workflow: { ...weapp.fragment.workflow, id: '7' } }],
        publishedAt,
      ),
    ).toThrow('client fragments do not share one workflow run')
    expect(() =>
      assembleClientReleaseManifest(
        [
          h5.fragment,
          {
            ...weapp.fragment,
            runtime: { ...weapp.fragment.runtime, apiBaseUrl: 'https://api2.myfitness.cn/v1' },
          },
        ],
        publishedAt,
      ),
    ).toThrow('client fragments do not share one API base URL')
  })

  it('rejects unknown manifest fields and a service release from another commit', async () => {
    const root = await makeTemporaryRoot()
    const { manifest } = await createClientRelease(root)

    expect(() => validateClientReleaseManifest({ ...manifest, mutableTag: 'latest' })).toThrow(
      'client release manifest keys must be exactly',
    )
    const otherService = {
      ...serviceRelease(),
      source: { repository, revision: '2'.repeat(40) },
    }
    expect(() => assertClientMatchesServiceRelease(manifest, otherService)).toThrow(
      'client and service releases do not share one source revision',
    )
  })

  it('runs the package, assemble, qualify, and verify CLI contract end to end', async () => {
    const root = await makeTemporaryRoot()
    const outputRoot = join(root, 'release')
    await mkdir(outputRoot)

    for (const platform of ['h5', 'weapp'] as const) {
      const buildRoot = await createBuildRoot(root, platform)
      await runClientReleaseCli([
        'package',
        '--platform',
        platform,
        '--build-root',
        buildRoot,
        '--artifact',
        join(outputRoot, `myfitness-client-${platform}.tar`),
        '--fragment',
        join(outputRoot, `client-release-fragment-${platform}.json`),
        '--repository',
        repository,
        '--revision',
        revision,
        '--version',
        version,
        '--run-id',
        runId,
        '--run-attempt',
        runAttempt,
      ])
    }
    const manifestPath = join(outputRoot, 'client-release-manifest.json')
    await runClientReleaseCli([
      'assemble',
      '--input-dir',
      outputRoot,
      '--published-at',
      publishedAt,
      '--output',
      manifestPath,
    ])
    const servicePath = join(outputRoot, 'release-manifest.json')
    await writeJson(servicePath, serviceRelease())
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runClientReleaseCli(['qualify', '--version', version, '--api-base-url', apiBaseUrl])
    await runClientReleaseCli([
      'verify',
      '--file',
      manifestPath,
      '--artifact-dir',
      outputRoot,
      '--service-release',
      servicePath,
      '--expected-repository',
      repository,
      '--expected-revision',
      revision,
      '--expected-version',
      version,
    ])

    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"status": "ok"'))
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"deliveryClass": "candidate"'))
  })
})
