import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  qualifyHostedReleaseCandidate,
  qualificationSchemaVersion,
  runReleaseQualificationCli,
  validateReleaseQualificationRecord,
} from './release-qualification.mjs'

const repository = 'Zach424/MyFitness'
const revision = '1'.repeat(40)
const tagObjectSha = '2'.repeat(40)
const version = 'v0.2.0-rc.1'
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const input = {
  repository,
  revision,
  version,
  tagRef: `refs/tags/${version}`,
  defaultBranch: 'main',
  ciWorkflow: 'ci.yml',
  currentRunId: '9002',
  currentRunAttempt: '1',
}

const successfulRun = {
  id: 9001,
  run_attempt: 2,
  head_sha: revision,
  head_branch: 'main',
  path: '.github/workflows/ci.yml@main',
  event: 'push',
  status: 'completed',
  conclusion: 'success',
  html_url: `https://github.com/${repository}/actions/runs/9001`,
}

const hostedResponses = (overrides: Record<string, unknown> = {}) => ({
  repository: { default_branch: 'main' },
  tagRef: {
    ref: `refs/tags/${version}`,
    object: { type: 'tag', sha: tagObjectSha },
  },
  tag: { object: { type: 'commit', sha: revision } },
  comparison: { status: 'ahead', merge_base_commit: { sha: revision } },
  runs: { workflow_runs: [successfulRun] },
  ...overrides,
})

const requester = (overrides: Record<string, unknown> = {}) => {
  const responses = hostedResponses(overrides)
  return async (path: string) => {
    if (path === `/repos/${repository}`) return responses.repository
    if (path.includes('/git/ref/tags/')) return responses.tagRef
    if (path.includes('/git/tags/')) return responses.tag
    if (path.includes('/compare/')) return responses.comparison
    if (path.includes('/actions/workflows/')) return responses.runs
    throw new Error(`unexpected request ${path}`)
  }
}

const cliArguments = (fileFlag: '--output' | '--file', file: string) => [
  '--repository',
  repository,
  '--revision',
  revision,
  '--version',
  version,
  '--tag-ref',
  `refs/tags/${version}`,
  '--default-branch',
  'main',
  '--ci-workflow',
  'ci.yml',
  '--current-run-id',
  '9002',
  '--current-run-attempt',
  '1',
  fileFlag,
  file,
]

describe('hosted release qualification', () => {
  it('binds an annotated tag, current main ancestry and exact successful CI run', async () => {
    const record = await qualifyHostedReleaseCandidate(input, { requestJson: requester() })

    expect(record).toEqual({
      schemaVersion: qualificationSchemaVersion,
      release: { repository, revision, version },
      releaseWorkflow: { id: '9002', attempt: 1 },
      tag: {
        ref: `refs/tags/${version}`,
        objectType: 'tag',
        dereferenceDepth: 1,
        targetRevision: revision,
      },
      sourceBranch: { name: 'main', relation: 'ahead' },
      ci: {
        workflowPath: '.github/workflows/ci.yml',
        runId: '9001',
        runAttempt: 2,
        headSha: revision,
        event: 'push',
        branch: 'main',
        status: 'completed',
        conclusion: 'success',
        url: `https://github.com/${repository}/actions/runs/9001`,
      },
    })
  })

  it('accepts a lightweight tag that resolves directly to the release commit', async () => {
    const record = await qualifyHostedReleaseCandidate(input, {
      requestJson: requester({
        tagRef: { ref: `refs/tags/${version}`, object: { type: 'commit', sha: revision } },
      }),
    })

    expect(record.tag).toEqual({
      ref: `refs/tags/${version}`,
      objectType: 'commit',
      dereferenceDepth: 0,
      targetRevision: revision,
    })
  })

  it('rejects a tag ref or remote tag that does not bind the release revision', async () => {
    await expect(
      qualifyHostedReleaseCandidate(
        { ...input, tagRef: 'refs/tags/v0.2.0-rc.2' },
        {
          requestJson: requester(),
        },
      ),
    ).rejects.toThrow(`tag ref must equal refs/tags/${version}`)

    await expect(
      qualifyHostedReleaseCandidate(input, {
        requestJson: requester({ tag: { object: { type: 'commit', sha: '3'.repeat(40) } } }),
      }),
    ).rejects.toThrow('remote tag does not resolve to the release revision')
  })

  it('rejects a release revision that is no longer in current main history', async () => {
    await expect(
      qualifyHostedReleaseCandidate(input, {
        requestJson: requester({
          comparison: { status: 'diverged', merge_base_commit: { sha: '4'.repeat(40) } },
        }),
      }),
    ).rejects.toThrow('release revision is not an ancestor of main')
  })

  it('rejects missing, failed or wrong-event CI evidence', async () => {
    await expect(
      qualifyHostedReleaseCandidate(input, {
        requestJson: requester({ runs: { workflow_runs: [] } }),
      }),
    ).rejects.toThrow('release revision has no successful main push CI run')

    await expect(
      qualifyHostedReleaseCandidate(input, {
        requestJson: requester({
          runs: {
            workflow_runs: [{ ...successfulRun, event: 'pull_request', conclusion: 'failure' }],
          },
        }),
      }),
    ).rejects.toThrow('release revision has no successful main push CI run')
  })

  it('rejects a tampered qualification record', async () => {
    const record = await qualifyHostedReleaseCandidate(input, { requestJson: requester() })
    expect(() =>
      validateReleaseQualificationRecord(
        {
          ...record,
          ci: { ...record.ci, workflowPath: '.github/workflows/other.yml' },
        },
        {
          ciWorkflow: 'ci.yml',
        },
      ),
    ).toThrow('qualification CI workflow does not match ci.yml')
    expect(() =>
      validateReleaseQualificationRecord({
        ...record,
        releaseWorkflow: { ...record.releaseWorkflow, id: record.ci.runId },
      }),
    ).toThrow('CI run must precede the release workflow')
    expect(() =>
      validateReleaseQualificationRecord({
        ...record,
        ci: { ...record.ci, headSha: '5'.repeat(40) },
      }),
    ).toThrow('qualified CI head does not match release revision')
    expect(() =>
      validateReleaseQualificationRecord({
        ...record,
        tag: { ...record.tag, targetRevision: '6'.repeat(40) },
      }),
    ).toThrow('qualified tag target does not match release revision')
  })

  it('creates and rechecks the strict qualification artifact through the CLI', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'myfitness-release-qualification-'))
    try {
      const file = join(directory, 'release-qualification.json')
      await runReleaseQualificationCli(['verify', ...cliArguments('--output', file)], {
        requestJson: requester(),
      })
      const record = JSON.parse(await readFile(file, 'utf8'))
      expect(record.schemaVersion).toBe(qualificationSchemaVersion)
      await runReleaseQualificationCli(['check', ...cliArguments('--file', file)], {
        requestJson: requester(),
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('wires qualification before publication and retains its record as a release asset', async () => {
    const workflow = await readFile(
      resolve(repositoryRoot, '.github/workflows/publish-images.yml'),
      'utf8',
    )
    const qualificationIndex = workflow.indexOf('node scripts/release-qualification.mjs verify')
    const registryLoginIndex = workflow.indexOf('docker/login-action@')

    expect(qualificationIndex).toBeGreaterThan(0)
    expect(registryLoginIndex).toBeGreaterThan(qualificationIndex)
    expect(workflow).toContain('actions: read')
    expect(workflow).toContain('name: release-qualification')
    expect(workflow).toContain('node scripts/release-qualification.mjs check')
    expect(workflow).toContain('"${RECORD_DIRECTORY}/release-qualification.json"')
  })
})
