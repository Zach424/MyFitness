import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  assembleReleaseManifest,
  createServiceFragment,
  manifestSchemaVersion,
  releaseServices,
  runReleaseManifestCli,
  validateReleaseManifest,
} from './release-manifest.mjs'

const revision = '1'.repeat(40)
const repository = 'Zach424/MyFitness'
const version = 'v0.1.0-rc.1'
const digestByService = {
  api: `sha256:${'a'.repeat(64)}`,
  admin: `sha256:${'b'.repeat(64)}`,
  ai: `sha256:${'c'.repeat(64)}`,
} as const

const fragments = () =>
  releaseServices.map((service) =>
    createServiceFragment({
      service,
      image: `ghcr.io/zach424/myfitness-${service}`,
      digest: digestByService[service as keyof typeof digestByService],
      repository,
      revision,
      version,
      runId: '123456789',
      runAttempt: '1',
    }),
  )

describe('immutable release manifest', () => {
  it('assembles one source revision and three digest-qualified images', () => {
    const manifest = assembleReleaseManifest(fragments(), '2026-07-19T10:00:00.000Z')

    expect(manifest).toMatchObject({
      schemaVersion: manifestSchemaVersion,
      version,
      source: { repository, revision },
      workflow: { id: '123456789', attempt: 1 },
      images: {
        api: {
          reference: `ghcr.io/zach424/myfitness-api@${digestByService.api}`,
        },
        admin: {
          reference: `ghcr.io/zach424/myfitness-admin@${digestByService.admin}`,
        },
        ai: {
          reference: `ghcr.io/zach424/myfitness-ai@${digestByService.ai}`,
        },
      },
    })
    expect(
      validateReleaseManifest(manifest, {
        expectedRepository: repository,
        expectedRevision: revision,
        expectedVersion: version,
      }),
    ).toEqual(manifest)
  })

  it('rejects a fragment whose image does not belong to its service', () => {
    expect(() =>
      createServiceFragment({
        service: 'api',
        image: 'ghcr.io/zach424/myfitness-admin',
        digest: digestByService.api,
        repository,
        revision,
        version,
        runId: '123456789',
        runAttempt: '1',
      }),
    ).toThrow('image for api must be ghcr.io/zach424/myfitness-api')
  })

  it('rejects fragments built from mixed source revisions', () => {
    const mixed = fragments()
    mixed[2] = { ...mixed[2], source: { ...mixed[2].source, revision: '2'.repeat(40) } }
    expect(() => assembleReleaseManifest(mixed, '2026-07-19T10:00:00.000Z')).toThrow(
      'release fragments do not share one source revision',
    )
  })

  it('rejects a missing service or a duplicate service', () => {
    const duplicated = fragments()
    duplicated[2] = { ...duplicated[2], service: 'api', image: duplicated[0].image }
    expect(() => assembleReleaseManifest(duplicated, '2026-07-19T10:00:00.000Z')).toThrow(
      'release contains a duplicate service fragment',
    )
  })

  it('rejects a digest-qualified reference that was rewritten after assembly', () => {
    const manifest = assembleReleaseManifest(fragments(), '2026-07-19T10:00:00.000Z')
    const tampered = structuredClone(manifest)
    tampered.images.api.reference = `ghcr.io/zach424/myfitness-api@${digestByService.admin}`
    expect(() => validateReleaseManifest(tampered)).toThrow(
      'api immutable image reference does not match its image and digest',
    )
  })

  it('rejects mutable versions and unexpected manifest fields', () => {
    expect(() =>
      createServiceFragment({
        service: 'api',
        image: 'ghcr.io/zach424/myfitness-api',
        digest: digestByService.api,
        repository,
        revision,
        version: 'latest',
        runId: '123456789',
        runAttempt: '1',
      }),
    ).toThrow('release version must be a v-prefixed SemVer tag')

    expect(() =>
      createServiceFragment({
        service: 'api',
        image: 'ghcr.io/zach424/myfitness-api',
        digest: digestByService.api,
        repository,
        revision,
        version: 'v0.1.0-01',
        runId: '123456789',
        runAttempt: '1',
      }),
    ).toThrow('release version must be a v-prefixed SemVer tag')

    const manifest = {
      ...assembleReleaseManifest(fragments(), '2026-07-19T10:00:00.000Z'),
      extra: true,
    }
    expect(() => validateReleaseManifest(manifest)).toThrow('release manifest keys must be exactly')
  })

  it('rejects non-canonical publication timestamps', () => {
    expect(() => assembleReleaseManifest(fragments(), '2026-07-19 10:00:00Z')).toThrow(
      'publishedAt must be a canonical ISO-8601 UTC timestamp',
    )
  })

  it('runs the workflow fragment and assembly commands through real files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'myfitness-release-manifest-'))
    try {
      for (const service of releaseServices) {
        await runReleaseManifestCli([
          'fragment',
          '--service',
          service,
          '--image',
          `ghcr.io/zach424/myfitness-${service}`,
          '--digest',
          digestByService[service as keyof typeof digestByService],
          '--repository',
          repository,
          '--revision',
          revision,
          '--version',
          version,
          '--run-id',
          '123456789',
          '--run-attempt',
          '1',
          '--output',
          join(directory, `release-fragment-${service}.json`),
        ])
      }

      const output = join(directory, 'release-manifest.json')
      await runReleaseManifestCli([
        'assemble',
        '--input-dir',
        directory,
        '--published-at',
        '2026-07-19T10:00:00.000Z',
        '--output',
        output,
      ])
      const manifest = JSON.parse(await readFile(output, 'utf8'))
      expect(validateReleaseManifest(manifest).source).toEqual({ repository, revision })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
