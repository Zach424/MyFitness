import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

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

const release = ({
  version = 'v0.1.0-rc.1',
  revision = '1'.repeat(40),
  publishedAt = '2026-07-19T11:03:08.000Z',
} = {}) => {
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
        runId: '29684193291',
        runAttempt: '1',
      }),
    ),
    publishedAt,
  )
}

const manifestDigest = (value: unknown) =>
  `sha256:${createHash('sha256')
    .update(`${JSON.stringify(value, null, 2)}\n`)
    .digest('hex')}`

const writeReleaseBundle = async (directory: string, name: string, value: unknown) => {
  const bundleDirectory = join(directory, name)
  await mkdir(bundleDirectory, { recursive: true })
  const bytes = `${JSON.stringify(value, null, 2)}\n`
  const manifestPath = join(bundleDirectory, 'release-manifest.json')
  const checksumPath = join(bundleDirectory, 'release-manifest.sha256')
  await writeFile(manifestPath, bytes, 'utf8')
  await writeFile(
    checksumPath,
    `${createHash('sha256').update(bytes).digest('hex')}  release-manifest.json\n`,
    'utf8',
  )
  return { manifestPath, checksumPath }
}

describe('managed deployment admission', () => {
  it('admits one immutable release into a fully owned shared-test environment', () => {
    const target = release()
    const admission = createDeploymentAdmission({
      environment: environment(),
      release: target,
      releaseManifestSha256: manifestDigest(target),
      rollbackMode: 'no-traffic',
      evaluatedAt: '2026-07-19T12:00:00.000Z',
    })

    expect(admission).toMatchObject({
      schemaVersion: admissionSchemaVersion,
      status: 'admitted',
      environment: {
        deployment: { name: 'shared-alpha', stage: 'shared-test' },
        cloud: { provider: 'tencent-cloud', region: 'ap-shanghai' },
      },
      release: {
        version: 'v0.1.0-rc.1',
        source: { repository, revision: '1'.repeat(40) },
        images: {
          api: `ghcr.io/zach424/myfitness-api@sha256:${'a'.repeat(64)}`,
        },
      },
      expectedRuntime: {
        api: { authProviders: ['wechat'], trustProxyHops: 1 },
        admin: { localLoginEnabled: false, secureCookies: true },
        ai: { privateOnly: true },
      },
      rollback: { mode: 'no-traffic' },
    })
    expect(admission.deploymentOrder.map((step) => step.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('runs the real-file CLI and verifies the release transport checksum', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'myfitness-deployment-admission-'))
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    try {
      const environmentPath = join(directory, 'environment.json')
      await writeFile(environmentPath, `${JSON.stringify(environment(), null, 2)}\n`, 'utf8')
      const target = await writeReleaseBundle(directory, 'target', release())
      const output = join(directory, 'admission', 'deployment-admission.json')

      await runDeploymentAdmissionCli([
        'verify',
        '--environment',
        environmentPath,
        '--release',
        target.manifestPath,
        '--release-checksum',
        target.checksumPath,
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
      expect(stdout).toHaveBeenCalled()
    } finally {
      stdout.mockRestore()
      await rm(directory, { recursive: true, force: true })
    }
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

  it('rejects a release checksum mismatch before admission', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'myfitness-deployment-admission-'))
    try {
      const environmentPath = join(directory, 'environment.json')
      await writeFile(environmentPath, `${JSON.stringify(environment(), null, 2)}\n`, 'utf8')
      const target = await writeReleaseBundle(directory, 'target', release())
      await writeFile(target.manifestPath, '{}\n', 'utf8')

      await expect(
        runDeploymentAdmissionCli([
          'verify',
          '--environment',
          environmentPath,
          '--release',
          target.manifestPath,
          '--release-checksum',
          target.checksumPath,
          '--rollback-mode',
          'no-traffic',
          '--evaluated-at',
          '2026-07-19T12:00:00.000Z',
          '--output',
          join(directory, 'output.json'),
        ]),
      ).rejects.toThrow('target release checksum does not match its release manifest')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('limits no-traffic rollback to the first shared-test deployment', () => {
    const production = environment()
    production.deployment.stage = 'production'
    const target = release()
    expect(() =>
      createDeploymentAdmission({
        environment: production,
        release: target,
        releaseManifestSha256: manifestDigest(target),
        rollbackMode: 'no-traffic',
        evaluatedAt: '2026-07-19T12:00:00.000Z',
      }),
    ).toThrow('no-traffic rollback is allowed only for a first shared-test deployment')
  })

  it('binds a production admission to one older complete rollback release', () => {
    const production = environment()
    production.deployment.stage = 'production'
    const target = release({
      version: 'v0.1.0',
      revision: '2'.repeat(40),
      publishedAt: '2026-07-20T11:00:00.000Z',
    })
    const previous = release()

    const admission = createDeploymentAdmission({
      environment: production,
      release: target,
      releaseManifestSha256: manifestDigest(target),
      rollbackMode: 'previous-release',
      previousRelease: previous,
      previousReleaseManifestSha256: manifestDigest(previous),
      evaluatedAt: '2026-07-20T12:00:00.000Z',
    })

    expect(admission.rollback).toMatchObject({
      mode: 'previous-release',
      release: {
        version: 'v0.1.0-rc.1',
        source: { revision: '1'.repeat(40) },
      },
    })
  })

  it('rejects a same-source or newer rollback release', () => {
    const target = release({
      version: 'v0.1.0',
      revision: '2'.repeat(40),
      publishedAt: '2026-07-20T11:00:00.000Z',
    })
    const sameSource = release({
      version: 'v0.1.0-rc.2',
      revision: '2'.repeat(40),
      publishedAt: '2026-07-19T11:00:00.000Z',
    })
    expect(() =>
      createDeploymentAdmission({
        environment: environment(),
        release: target,
        releaseManifestSha256: manifestDigest(target),
        rollbackMode: 'previous-release',
        previousRelease: sameSource,
        previousReleaseManifestSha256: manifestDigest(sameSource),
        evaluatedAt: '2026-07-20T12:00:00.000Z',
      }),
    ).toThrow('previous release must have a different version and source revision')

    const future = release({
      version: 'v0.0.9',
      revision: '3'.repeat(40),
      publishedAt: '2026-07-21T11:00:00.000Z',
    })
    expect(() =>
      createDeploymentAdmission({
        environment: environment(),
        release: target,
        releaseManifestSha256: manifestDigest(target),
        rollbackMode: 'previous-release',
        previousRelease: future,
        previousReleaseManifestSha256: manifestDigest(future),
        evaluatedAt: '2026-07-20T12:00:00.000Z',
      }),
    ).toThrow('previous release must have been published before the target release')
  })

  it('rejects non-canonical admission timestamps and unsupported rollback modes', () => {
    const target = release()
    expect(() =>
      createDeploymentAdmission({
        environment: environment(),
        release: target,
        releaseManifestSha256: manifestDigest(target),
        rollbackMode: 'latest-tag',
        evaluatedAt: '2026-07-19T12:00:00.000Z',
      }),
    ).toThrow('rollback mode must be no-traffic or previous-release')

    expect(() =>
      createDeploymentAdmission({
        environment: environment(),
        release: target,
        releaseManifestSha256: manifestDigest(target),
        rollbackMode: 'no-traffic',
        evaluatedAt: '2026-07-19 12:00:00Z',
      }),
    ).toThrow('evaluatedAt must be a canonical ISO-8601 UTC timestamp')
  })
})
