import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  assembleClientReleaseManifest,
  createClientBuildMetadata,
  createClientFragment,
  packageClientArtifact,
} from './client-release.mjs'
import {
  admissionSchemaVersion,
  createDeploymentAdmission,
  environmentSchemaVersion,
  runDeploymentAdmissionCli,
  validateManagedEnvironment,
} from './deployment-admission.mjs'
import {
  assembleReleaseManifest,
  createServiceFragment,
  releaseServices,
} from './release-manifest.mjs'

const repository = 'Zach424/MyFitness'
const defaultVersion = 'v0.1.0-rc.1'
const defaultRevision = '1'.repeat(40)
const defaultPublishedAt = '2026-07-19T11:03:08.000Z'
const apiBaseUrl = 'https://api.alpha.myfitness.cn/v1'
const temporaryRoots: string[] = []

const environment = () => ({
  schemaVersion: environmentSchemaVersion,
  deployment: {
    name: 'shared-alpha',
    stage: 'shared-test',
    changeAuthorityRef: 'change://myfitness/chg-2026-020',
  },
  cloud: {
    provider: 'tencent-cloud',
    accountRef: 'account://myfitness/shared-alpha',
    region: 'ap-shanghai',
    monthlyBudgetCny: 1500,
  },
  endpoints: {
    apiOrigin: 'https://api.alpha.myfitness.cn',
    h5Origin: 'https://h5.alpha.myfitness.cn',
    adminOrigin: 'https://admin.alpha.myfitness.cn',
    tlsPolicyRef: 'evidence://network/tls-2026-020',
    edgePolicyRef: 'evidence://network/edge-2026-020',
    trustProxyHops: 1,
  },
  runtimeSecrets: {
    apiRuntimeRef: 'secret://myfitness/shared-alpha/api-runtime',
    adminRuntimeRef: 'secret://myfitness/shared-alpha/admin-runtime',
    aiRuntimeRef: 'secret://myfitness/shared-alpha/ai-runtime',
    wechatCredentialRef: 'secret://myfitness/shared-alpha/wechat',
    adminOidcCredentialRef: 'secret://myfitness/shared-alpha/admin-oidc',
  },
  dataStores: {
    postgres: {
      serviceRef: 'service://myfitness/shared-alpha/postgres',
      ownerRef: 'owner://team/platform-data',
      backupPolicyRef: 'evidence://data/postgres-backup-2026-020',
      restoreEvidenceRef: 'evidence://data/postgres-restore-2026-020',
    },
    redis: {
      serviceRef: 'service://myfitness/shared-alpha/redis',
      ownerRef: 'owner://team/platform-data',
      tlsPolicyRef: 'evidence://data/redis-tls-2026-020',
    },
    objectStorage: {
      serviceRef: 'service://myfitness/shared-alpha/object-storage',
      ownerRef: 'owner://team/privacy-platform',
      encryptionPolicyRef: 'evidence://data/object-kms-2026-020',
      lifecyclePolicyRef: 'evidence://data/object-lifecycle-2026-020',
    },
    erasureLedger: {
      serviceRef: 'service://myfitness/shared-alpha/erasure-ledger',
      ownerRef: 'owner://team/privacy-platform',
      recoveryEvidenceRef: 'evidence://data/ledger-recovery-2026-020',
    },
  },
  observability: {
    telemetryRef: 'service://myfitness/shared-alpha/telemetry',
    alertPolicyRef: 'evidence://operations/alerts-2026-020',
    responderRef: 'owner://team/myfitness-oncall',
    rollbackThresholdsRef: 'evidence://operations/rollback-thresholds-2026-020',
  },
  aiProvider: {
    policyRef: 'evidence://ai/provider-policy-2026-020',
    retentionEvidenceRef: 'evidence://ai/retention-2026-020',
    budgetEvidenceRef: 'evidence://ai/budget-2026-020',
    canaryOwnerRef: 'owner://team/myfitness-ai',
  },
})

type ReleaseOptions = {
  version?: string
  revision?: string
  publishedAt?: string
  apiBaseUrl?: string
}

const workflowId = (revision: string) => `2968419329${revision[0]}`

const release = ({
  version = defaultVersion,
  revision = defaultRevision,
  publishedAt = defaultPublishedAt,
}: ReleaseOptions = {}) => {
  const digests: Record<string, string> = {
    api: `sha256:${'a'.repeat(64)}`,
    admin: `sha256:${'b'.repeat(64)}`,
    ai: `sha256:${'c'.repeat(64)}`,
  }
  return assembleReleaseManifest(
    releaseServices.map((service) =>
      createServiceFragment({
        service,
        image: `ghcr.io/zach424/myfitness-${service}`,
        digest: digests[service],
        repository,
        revision,
        version,
        runId: workflowId(revision),
        runAttempt: '1',
      }),
    ),
    publishedAt,
  )
}

const clientRelease = ({
  version = defaultVersion,
  revision = defaultRevision,
  publishedAt = defaultPublishedAt,
  apiBaseUrl: clientApiBaseUrl = apiBaseUrl,
}: ReleaseOptions = {}) =>
  assembleClientReleaseManifest(
    (['h5', 'weapp'] as const).map((platform, index) =>
      createClientFragment({
        metadata: createClientBuildMetadata({
          platform,
          repository,
          revision,
          version,
          runId: workflowId(revision),
          runAttempt: '1',
          apiBaseUrl: clientApiBaseUrl,
          authMode: platform === 'h5' ? 'oidc' : 'wechat',
        }),
        artifact: {
          fileName: `myfitness-client-${platform}.tar`,
          mediaType: 'application/vnd.myfitness.client-bundle.v1.tar',
          digest: `sha256:${String(index + 1).repeat(64)}`,
          bytes: 2048,
          fileCount: platform === 'h5' ? 2 : 3,
          unpackedBytes: 200,
          treeDigest: `sha256:${String(index + 3).repeat(64)}`,
        },
      }),
    ),
    publishedAt,
  )

const manifestDigest = (value: unknown) =>
  `sha256:${createHash('sha256')
    .update(`${JSON.stringify(value, null, 2)}\n`)
    .digest('hex')}`

const admissionArguments = (options: ReleaseOptions = {}) => {
  const target = release(options)
  const targetClient = clientRelease(options)
  return {
    environment: environment(),
    release: target,
    releaseManifestSha256: manifestDigest(target),
    clientRelease: targetClient,
    clientReleaseManifestSha256: manifestDigest(targetClient),
    rollbackMode: 'no-traffic',
    evaluatedAt: '2026-07-19T12:00:00.000Z',
  }
}

const makeTemporaryRoot = async () => {
  const root = await mkdtemp(join(tmpdir(), 'myfitness-deployment-admission-'))
  temporaryRoots.push(root)
  return root
}

const writeManifestBundle = async (
  directory: string,
  name: string,
  fileName: string,
  value: unknown,
) => {
  const bundleDirectory = join(directory, name)
  await mkdir(bundleDirectory, { recursive: true })
  const bytes = `${JSON.stringify(value, null, 2)}\n`
  const manifestPath = join(bundleDirectory, fileName)
  const checksumPath = join(bundleDirectory, fileName.replace('.json', '.sha256'))
  await writeFile(manifestPath, bytes, 'utf8')
  await writeFile(
    checksumPath,
    `${createHash('sha256').update(bytes).digest('hex')}  ${fileName}\n`,
    'utf8',
  )
  return { bundleDirectory, manifestPath, checksumPath }
}

const writeClientBundle = async (directory: string, name: string, options: ReleaseOptions = {}) => {
  const version = options.version ?? defaultVersion
  const revision = options.revision ?? defaultRevision
  const publishedAt = options.publishedAt ?? defaultPublishedAt
  const clientApiBaseUrl = options.apiBaseUrl ?? apiBaseUrl
  const bundleDirectory = join(directory, name)
  await mkdir(bundleDirectory, { recursive: true })
  const fragments = []
  for (const platform of ['h5', 'weapp'] as const) {
    const buildRoot = join(bundleDirectory, `dist-${platform}`)
    await mkdir(buildRoot, { recursive: true })
    await writeFile(
      join(buildRoot, 'myfitness-client-build.json'),
      `${JSON.stringify(
        createClientBuildMetadata({
          platform,
          repository,
          revision,
          version,
          runId: workflowId(revision),
          runAttempt: '1',
          apiBaseUrl: clientApiBaseUrl,
          authMode: platform === 'h5' ? 'oidc' : 'wechat',
        }),
        null,
        2,
      )}\n`,
    )
    if (platform === 'h5') {
      await mkdir(join(buildRoot, 'auth', 'callback'), { recursive: true })
      await writeFile(join(buildRoot, 'index.html'), '<!doctype html>\n')
      await writeFile(join(buildRoot, 'auth', 'callback', 'index.html'), '<!doctype html>\n')
      await writeFile(join(buildRoot, 'auth', 'callback', 'redirect.js'), 'location.replace("/")\n')
    } else {
      await writeFile(join(buildRoot, 'app.js'), 'App({})\n')
      await writeFile(join(buildRoot, 'app.json'), '{"pages":[]}\n')
    }
    fragments.push(
      await packageClientArtifact({
        platform,
        buildRoot,
        artifactPath: join(bundleDirectory, `myfitness-client-${platform}.tar`),
        fragmentPath: join(bundleDirectory, `client-release-fragment-${platform}.json`),
        repository,
        revision,
        version,
        runId: workflowId(revision),
        runAttempt: '1',
      }),
    )
  }
  const manifest = assembleClientReleaseManifest(fragments, publishedAt)
  return {
    manifest,
    ...(await writeManifestBundle(directory, name, 'client-release-manifest.json', manifest)),
  }
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

describe('managed deployment admission', () => {
  it('admits one immutable service and client release into a managed shared-test environment', () => {
    const admission = createDeploymentAdmission(admissionArguments())

    expect(admission).toMatchObject({
      schemaVersion: admissionSchemaVersion,
      status: 'admitted',
      environment: {
        deployment: { name: 'shared-alpha', stage: 'shared-test' },
        cloud: { provider: 'tencent-cloud', region: 'ap-shanghai' },
      },
      release: {
        version: defaultVersion,
        source: { repository, revision: defaultRevision },
        images: { api: `ghcr.io/zach424/myfitness-api@sha256:${'a'.repeat(64)}` },
        clients: {
          h5: { deliveryClass: 'candidate', runtime: { authMode: 'oidc' } },
          weapp: { deliveryClass: 'candidate', runtime: { authMode: 'wechat' } },
        },
      },
      expectedRuntime: {
        api: { authProviders: ['wechat', 'oidc'], trustProxyHops: 1 },
        admin: { localLoginEnabled: false, secureCookies: true },
        ai: { privateOnly: true },
      },
      rollback: { mode: 'no-traffic' },
    })
    expect(admission.deploymentOrder.map((step) => step.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(admission.clientDeliveryOrder.map((step) => step.sequence)).toEqual([1, 2, 3, 4])
    expect(admission.clientDeliveryOrder[1]).toMatchObject({
      action: 'upload-h5-candidate-to-private-preview',
    })
  })

  it('runs the real-file CLI and verifies both manifests and actual client archives', async () => {
    const directory = await makeTemporaryRoot()
    const environmentPath = join(directory, 'environment.json')
    await writeFile(environmentPath, `${JSON.stringify(environment(), null, 2)}\n`, 'utf8')
    const target = await writeManifestBundle(
      directory,
      'target-service',
      'release-manifest.json',
      release(),
    )
    const client = await writeClientBundle(directory, 'target-client')
    const output = join(directory, 'admission', 'deployment-admission.json')
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runDeploymentAdmissionCli([
      'verify',
      '--environment',
      environmentPath,
      '--release',
      target.manifestPath,
      '--release-checksum',
      target.checksumPath,
      '--client-release',
      client.manifestPath,
      '--client-release-checksum',
      client.checksumPath,
      '--client-artifact-dir',
      client.bundleDirectory,
      '--rollback-mode',
      'no-traffic',
      '--evaluated-at',
      '2026-07-19T12:00:00.000Z',
      '--output',
      output,
    ])

    const admission = JSON.parse(await readFile(output, 'utf8'))
    expect(admission.status).toBe('admitted')
    expect(admission.release.manifestSha256).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(admission.release.clientManifestSha256).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"schemaVersion"'))
  })

  it('rejects placeholders, raw-looking credentials and unknown fields', () => {
    const placeholder = environment()
    placeholder.cloud.provider = 'pending-provider'
    expect(() => validateManagedEnvironment(placeholder)).toThrow(
      'cloud provider must not contain a placeholder',
    )

    const rawSecret = environment()
    rawSecret.runtimeSecrets.apiRuntimeRef = 'a-real-secret-value'
    expect(() => validateManagedEnvironment(rawSecret)).toThrow(
      'runtime secrets apiRuntimeRef must be a non-secret secret:// reference',
    )

    expect(() => validateManagedEnvironment({ ...environment(), extra: true })).toThrow(
      'managed environment keys must be exactly',
    )
  })

  it('keeps the committed environment template deliberately non-admissible', async () => {
    const template = JSON.parse(
      await readFile(resolve('infra/deploy/managed-environment.example.json'), 'utf8'),
    )
    expect(() => validateManagedEnvironment(template)).toThrow('must not contain a placeholder')
  })

  it('canonicalizes runtime secret references independently of input key order', () => {
    const baseline = environment()
    const reordered = environment()
    reordered.runtimeSecrets = Object.fromEntries(
      Object.entries(reordered.runtimeSecrets).reverse(),
    ) as typeof reordered.runtimeSecrets
    expect(validateManagedEnvironment(reordered)).toEqual(validateManagedEnvironment(baseline))
  })

  it('rejects local, non-canonical and shared public origins', () => {
    const local = environment()
    local.endpoints.apiOrigin = 'https://127.0.0.1'
    expect(() => validateManagedEnvironment(local)).toThrow(
      'endpoints apiOrigin must use an externally routable domain name',
    )

    const path = environment()
    path.endpoints.apiOrigin = 'https://api.alpha.myfitness.cn/v1'
    expect(() => validateManagedEnvironment(path)).toThrow(
      'endpoints apiOrigin must be a canonical HTTPS origin',
    )

    const shared = environment()
    shared.endpoints.adminOrigin = shared.endpoints.h5Origin
    expect(() => validateManagedEnvironment(shared)).toThrow(
      'API, H5 and administrator origins must be distinct',
    )
  })

  it('rejects service/client identity and managed API origin mismatches', () => {
    const mixedRevision = admissionArguments()
    mixedRevision.clientRelease = clientRelease({ revision: '2'.repeat(40) })
    mixedRevision.clientReleaseManifestSha256 = manifestDigest(mixedRevision.clientRelease)
    expect(() => createDeploymentAdmission(mixedRevision)).toThrow(
      'client and service releases do not share one source revision',
    )

    const wrongApi = admissionArguments({ apiBaseUrl: 'https://other.myfitness.cn/v1' })
    expect(() => createDeploymentAdmission(wrongApi)).toThrow(
      'client release API base URL must match the managed API origin',
    )
  })

  it('rejects changed service manifests and changed client archives before admission', async () => {
    const directory = await makeTemporaryRoot()
    const environmentPath = join(directory, 'environment.json')
    await writeFile(environmentPath, `${JSON.stringify(environment(), null, 2)}\n`, 'utf8')
    const target = await writeManifestBundle(
      directory,
      'target-service',
      'release-manifest.json',
      release(),
    )
    const client = await writeClientBundle(directory, 'target-client')
    const common = [
      'verify',
      '--environment',
      environmentPath,
      '--release',
      target.manifestPath,
      '--release-checksum',
      target.checksumPath,
      '--client-release',
      client.manifestPath,
      '--client-release-checksum',
      client.checksumPath,
      '--client-artifact-dir',
      client.bundleDirectory,
      '--rollback-mode',
      'no-traffic',
      '--evaluated-at',
      '2026-07-19T12:00:00.000Z',
      '--output',
      join(directory, 'output.json'),
    ]

    await writeFile(target.manifestPath, '{}\n', 'utf8')
    await expect(runDeploymentAdmissionCli(common)).rejects.toThrow(
      'target release checksum does not match its release manifest',
    )

    await writeFile(target.manifestPath, `${JSON.stringify(release(), null, 2)}\n`, 'utf8')
    await writeFile(client.manifestPath, '{}\n', 'utf8')
    await expect(runDeploymentAdmissionCli(common)).rejects.toThrow(
      'target client release checksum does not match its release manifest',
    )

    await writeFile(client.manifestPath, `${JSON.stringify(client.manifest, null, 2)}\n`, 'utf8')
    const archivePath = join(client.bundleDirectory, 'myfitness-client-h5.tar')
    const archive = await readFile(archivePath)
    archive[600] ^= 1
    await writeFile(archivePath, archive)
    await expect(runDeploymentAdmissionCli(common)).rejects.toThrow(
      'h5 artifact digest does not match its manifest',
    )
  })

  it('limits no-traffic rollback to the first shared-test deployment', () => {
    const args = admissionArguments()
    args.environment.deployment.stage = 'production'
    expect(() => createDeploymentAdmission(args)).toThrow(
      'no-traffic rollback is allowed only for a first shared-test deployment',
    )
  })

  it('binds production rollback to older complete service and client releases', () => {
    const targetOptions = {
      version: 'v0.1.0',
      revision: '2'.repeat(40),
      publishedAt: '2026-07-20T11:00:00.000Z',
    }
    const args = admissionArguments(targetOptions)
    args.environment.deployment.stage = 'production'
    const previous = release()
    const previousClient = clientRelease()
    const admission = createDeploymentAdmission({
      ...args,
      rollbackMode: 'previous-release',
      previousRelease: previous,
      previousReleaseManifestSha256: manifestDigest(previous),
      previousClientRelease: previousClient,
      previousClientReleaseManifestSha256: manifestDigest(previousClient),
      evaluatedAt: '2026-07-20T12:00:00.000Z',
    })

    expect(admission.rollback).toMatchObject({
      mode: 'previous-release',
      release: {
        version: defaultVersion,
        source: { revision: defaultRevision },
        clientManifestSha256: expect.stringMatching(/^sha256:/),
      },
    })
  })

  it('rejects incomplete, same-source, or newer rollback releases', () => {
    const targetOptions = {
      version: 'v0.1.0',
      revision: '2'.repeat(40),
      publishedAt: '2026-07-20T11:00:00.000Z',
    }
    const args = admissionArguments(targetOptions)
    expect(() =>
      createDeploymentAdmission({
        ...args,
        rollbackMode: 'previous-release',
        previousRelease: release(),
        previousReleaseManifestSha256: manifestDigest(release()),
      }),
    ).toThrow('previous-release rollback requires verified previous service and client releases')

    const sameSourceOptions = {
      version: 'v0.1.0-rc.2',
      revision: '2'.repeat(40),
      publishedAt: '2026-07-19T11:00:00.000Z',
    }
    const sameSource = release(sameSourceOptions)
    const sameSourceClient = clientRelease(sameSourceOptions)
    expect(() =>
      createDeploymentAdmission({
        ...args,
        rollbackMode: 'previous-release',
        previousRelease: sameSource,
        previousReleaseManifestSha256: manifestDigest(sameSource),
        previousClientRelease: sameSourceClient,
        previousClientReleaseManifestSha256: manifestDigest(sameSourceClient),
      }),
    ).toThrow('previous release must have a different version and source revision')

    const futureOptions = {
      version: 'v0.0.9',
      revision: '3'.repeat(40),
      publishedAt: '2026-07-21T11:00:00.000Z',
    }
    const future = release(futureOptions)
    const futureClient = clientRelease(futureOptions)
    expect(() =>
      createDeploymentAdmission({
        ...args,
        rollbackMode: 'previous-release',
        previousRelease: future,
        previousReleaseManifestSha256: manifestDigest(future),
        previousClientRelease: futureClient,
        previousClientReleaseManifestSha256: manifestDigest(futureClient),
      }),
    ).toThrow('previous release must have been published before the target release')
  })

  it('rejects non-canonical admission timestamps and unsupported rollback modes', () => {
    expect(() =>
      createDeploymentAdmission({ ...admissionArguments(), rollbackMode: 'latest-tag' }),
    ).toThrow('rollback mode must be no-traffic or previous-release')

    expect(() =>
      createDeploymentAdmission({
        ...admissionArguments(),
        evaluatedAt: '2026-07-19 12:00:00Z',
      }),
    ).toThrow('evaluatedAt must be a canonical ISO-8601 UTC timestamp')
  })
})
