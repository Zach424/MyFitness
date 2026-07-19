import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { validateReleaseVersion } from './release-manifest.mjs'

export const qualificationSchemaVersion = 'myfitness-release-qualification/v1'

const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const revisionPattern = /^[0-9a-f]{40}$/
const branchPattern = /^[A-Za-z0-9._/-]+$/
const workflowPattern = /^[A-Za-z0-9_.-]+\.ya?ml$/

const fail = (message) => {
  throw new Error(message)
}

const requireString = (value, name) => {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    fail(`${name} must be a non-empty string without surrounding whitespace`)
  }
  return value
}

const requireExactKeys = (value, expected, name) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name} must be an object`)
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.join('\n') !== wanted.join('\n')) {
    fail(`${name} keys must be exactly: ${wanted.join(', ')}`)
  }
}

const validateRepository = (value) => {
  const repository = requireString(value, 'repository')
  if (!repositoryPattern.test(repository)) fail('repository must use owner/name format')
  return repository
}

const validateRevision = (value) => {
  const revision = requireString(value, 'revision')
  if (!revisionPattern.test(revision)) fail('revision must be a lowercase 40-character Git SHA')
  return revision
}

const validateBranch = (value) => {
  const branch = requireString(value, 'default branch')
  if (!branchPattern.test(branch) || branch.includes('..') || branch.startsWith('/')) {
    fail('default branch is invalid')
  }
  return branch
}

const validateWorkflow = (value) => {
  const workflow = requireString(value, 'CI workflow')
  if (!workflowPattern.test(workflow)) fail('CI workflow must be a workflow file name')
  return workflow
}

const validateRunId = (value, name) => {
  const id = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value
  if (typeof id !== 'string' || !/^[1-9]\d*$/.test(id)) {
    fail(`${name} must be a positive integer string`)
  }
  return id
}

const validateRunAttempt = (value, name) => {
  const attempt = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
  if (!Number.isSafeInteger(attempt) || attempt < 1) fail(`${name} must be a positive integer`)
  return attempt
}

const validateInput = ({
  repository,
  revision,
  version,
  tagRef,
  defaultBranch,
  ciWorkflow,
  currentRunId,
  currentRunAttempt,
}) => {
  const checkedVersion = validateReleaseVersion(version)
  const checkedTagRef = requireString(tagRef, 'tag ref')
  if (checkedTagRef !== `refs/tags/${checkedVersion}`) {
    fail(`tag ref must equal refs/tags/${checkedVersion}`)
  }
  return {
    repository: validateRepository(repository),
    revision: validateRevision(revision),
    version: checkedVersion,
    tagRef: checkedTagRef,
    defaultBranch: validateBranch(defaultBranch),
    ciWorkflow: validateWorkflow(ciWorkflow),
    currentRunId: validateRunId(currentRunId, 'current workflow run id'),
    currentRunAttempt: validateRunAttempt(currentRunAttempt, 'current workflow run attempt'),
  }
}

export const validateReleaseQualificationRecord = (value, expected = {}) => {
  requireExactKeys(
    value,
    ['schemaVersion', 'release', 'releaseWorkflow', 'tag', 'sourceBranch', 'ci'],
    'qualification record',
  )
  if (value.schemaVersion !== qualificationSchemaVersion) {
    fail('qualification record schemaVersion is unsupported')
  }

  requireExactKeys(value.release, ['repository', 'revision', 'version'], 'qualified release')
  const repository = validateRepository(value.release.repository)
  const revision = validateRevision(value.release.revision)
  const version = validateReleaseVersion(value.release.version)

  requireExactKeys(value.releaseWorkflow, ['id', 'attempt'], 'release workflow')
  const releaseWorkflow = {
    id: validateRunId(value.releaseWorkflow.id, 'release workflow run id'),
    attempt: validateRunAttempt(value.releaseWorkflow.attempt, 'release workflow run attempt'),
  }

  requireExactKeys(
    value.tag,
    ['ref', 'objectType', 'dereferenceDepth', 'targetRevision'],
    'qualified tag',
  )
  const tagRef = requireString(value.tag.ref, 'qualified tag ref')
  if (tagRef !== `refs/tags/${version}`) fail(`qualified tag ref must equal refs/tags/${version}`)
  if (!['commit', 'tag'].includes(value.tag.objectType)) {
    fail('qualified tag objectType must be commit or tag')
  }
  if (!Number.isSafeInteger(value.tag.dereferenceDepth) || value.tag.dereferenceDepth < 0) {
    fail('qualified tag dereferenceDepth must be a non-negative integer')
  }
  if (
    (value.tag.objectType === 'commit' && value.tag.dereferenceDepth !== 0) ||
    (value.tag.objectType === 'tag' && value.tag.dereferenceDepth < 1)
  ) {
    fail('qualified tag objectType and dereferenceDepth disagree')
  }
  const tagTargetRevision = validateRevision(value.tag.targetRevision)
  if (tagTargetRevision !== revision) fail('qualified tag target does not match release revision')

  requireExactKeys(value.sourceBranch, ['name', 'relation'], 'qualified source branch')
  const defaultBranch = validateBranch(value.sourceBranch.name)
  if (!['ahead', 'identical'].includes(value.sourceBranch.relation)) {
    fail('qualified source branch must contain the tagged commit')
  }

  requireExactKeys(
    value.ci,
    [
      'workflowPath',
      'runId',
      'runAttempt',
      'headSha',
      'event',
      'branch',
      'status',
      'conclusion',
      'url',
    ],
    'qualified CI',
  )
  const workflowPath = requireString(value.ci.workflowPath, 'qualified CI workflow path')
  if (!/^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/.test(workflowPath)) {
    fail('qualified CI workflow path is invalid')
  }
  const ci = {
    workflowPath,
    runId: validateRunId(value.ci.runId, 'CI workflow run id'),
    runAttempt: validateRunAttempt(value.ci.runAttempt, 'CI workflow run attempt'),
    headSha: validateRevision(value.ci.headSha),
    event: requireString(value.ci.event, 'CI event'),
    branch: validateBranch(value.ci.branch),
    status: requireString(value.ci.status, 'CI status'),
    conclusion: requireString(value.ci.conclusion, 'CI conclusion'),
    url: requireString(value.ci.url, 'CI URL'),
  }
  if (ci.headSha !== revision) fail('qualified CI head does not match release revision')
  if (
    ci.event !== 'push' ||
    ci.branch !== defaultBranch ||
    ci.status !== 'completed' ||
    ci.conclusion !== 'success'
  ) {
    fail('qualified CI must be a successful completed push on the default branch')
  }
  if (ci.runId === releaseWorkflow.id) fail('CI run must precede the release workflow')
  if (ci.url !== `https://github.com/${repository}/actions/runs/${ci.runId}`) {
    fail('qualified CI URL does not match its repository and run id')
  }

  const record = {
    schemaVersion: qualificationSchemaVersion,
    release: { repository, revision, version },
    releaseWorkflow,
    tag: {
      ref: tagRef,
      objectType: value.tag.objectType,
      dereferenceDepth: value.tag.dereferenceDepth,
      targetRevision: tagTargetRevision,
    },
    sourceBranch: { name: defaultBranch, relation: value.sourceBranch.relation },
    ci,
  }

  if (expected.repository && record.release.repository !== expected.repository) {
    fail(`qualification repository does not match ${expected.repository}`)
  }
  if (expected.revision && record.release.revision !== expected.revision) {
    fail(`qualification revision does not match ${expected.revision}`)
  }
  if (expected.version && record.release.version !== expected.version) {
    fail(`qualification version does not match ${expected.version}`)
  }
  if (expected.tagRef && record.tag.ref !== expected.tagRef) {
    fail(`qualification tag ref does not match ${expected.tagRef}`)
  }
  if (expected.defaultBranch && record.sourceBranch.name !== expected.defaultBranch) {
    fail(`qualification default branch does not match ${expected.defaultBranch}`)
  }
  if (
    expected.ciWorkflow &&
    record.ci.workflowPath !== `.github/workflows/${expected.ciWorkflow}`
  ) {
    fail(`qualification CI workflow does not match ${expected.ciWorkflow}`)
  }
  if (expected.currentRunId && record.releaseWorkflow.id !== String(expected.currentRunId)) {
    fail(`qualification release workflow id does not match ${expected.currentRunId}`)
  }
  if (
    expected.currentRunAttempt &&
    record.releaseWorkflow.attempt !== Number(expected.currentRunAttempt)
  ) {
    fail(`qualification release workflow attempt does not match ${expected.currentRunAttempt}`)
  }
  return record
}

const resolveTagTarget = async (requestJson, repository, version) => {
  const ref = await requestJson(`/repos/${repository}/git/ref/tags/${encodeURIComponent(version)}`)
  if (ref?.ref !== `refs/tags/${version}` || !ref.object)
    fail('remote tag ref is missing or invalid')
  const initialType = ref.object.type
  let target = ref.object
  let dereferenceDepth = 0
  while (target?.type === 'tag') {
    dereferenceDepth += 1
    if (dereferenceDepth > 5) fail('remote tag nesting exceeds the supported depth')
    const tag = await requestJson(`/repos/${repository}/git/tags/${target.sha}`)
    target = tag?.object
  }
  if (target?.type !== 'commit' || !revisionPattern.test(target.sha ?? '')) {
    fail('remote tag must resolve to a commit')
  }
  return { revision: target.sha, objectType: initialType, dereferenceDepth }
}

export const qualifyHostedReleaseCandidate = async (input, { requestJson }) => {
  if (typeof requestJson !== 'function') fail('requestJson must be provided')
  const checked = validateInput(input)
  const repository = await requestJson(`/repos/${checked.repository}`)
  if (repository?.default_branch !== checked.defaultBranch) {
    fail(`repository default branch must be ${checked.defaultBranch}`)
  }

  const tag = await resolveTagTarget(requestJson, checked.repository, checked.version)
  if (tag.revision !== checked.revision) fail('remote tag does not resolve to the release revision')

  const comparison = await requestJson(
    `/repos/${checked.repository}/compare/${checked.revision}...${encodeURIComponent(checked.defaultBranch)}`,
  )
  if (
    !['ahead', 'identical'].includes(comparison?.status) ||
    comparison?.merge_base_commit?.sha !== checked.revision
  ) {
    fail(`release revision is not an ancestor of ${checked.defaultBranch}`)
  }

  const query = new URLSearchParams({
    branch: checked.defaultBranch,
    event: 'push',
    status: 'success',
    head_sha: checked.revision,
    per_page: '100',
  })
  const runs = await requestJson(
    `/repos/${checked.repository}/actions/workflows/${encodeURIComponent(checked.ciWorkflow)}/runs?${query}`,
  )
  const expectedPath = `.github/workflows/${checked.ciWorkflow}`
  const candidates = Array.isArray(runs?.workflow_runs)
    ? runs.workflow_runs.filter(
        (run) =>
          run?.head_sha === checked.revision &&
          run?.head_branch === checked.defaultBranch &&
          run?.event === 'push' &&
          run?.status === 'completed' &&
          run?.conclusion === 'success' &&
          String(run?.path ?? '').split('@')[0] === expectedPath,
      )
    : []
  candidates.sort(
    (left, right) =>
      Number(right.run_attempt ?? 0) - Number(left.run_attempt ?? 0) ||
      Number(right.id ?? 0) - Number(left.id ?? 0),
  )
  const ciRun = candidates[0]
  if (!ciRun) fail('release revision has no successful main push CI run')

  return validateReleaseQualificationRecord(
    {
      schemaVersion: qualificationSchemaVersion,
      release: {
        repository: checked.repository,
        revision: checked.revision,
        version: checked.version,
      },
      releaseWorkflow: { id: checked.currentRunId, attempt: checked.currentRunAttempt },
      tag: {
        ref: checked.tagRef,
        objectType: tag.objectType,
        dereferenceDepth: tag.dereferenceDepth,
        targetRevision: tag.revision,
      },
      sourceBranch: { name: checked.defaultBranch, relation: comparison.status },
      ci: {
        workflowPath: expectedPath,
        runId: ciRun.id,
        runAttempt: ciRun.run_attempt,
        headSha: ciRun.head_sha,
        event: ciRun.event,
        branch: ciRun.head_branch,
        status: ciRun.status,
        conclusion: ciRun.conclusion,
        url: ciRun.html_url,
      },
    },
    {
      repository: checked.repository,
      revision: checked.revision,
      version: checked.version,
      tagRef: checked.tagRef,
      defaultBranch: checked.defaultBranch,
      ciWorkflow: checked.ciWorkflow,
      currentRunId: checked.currentRunId,
      currentRunAttempt: checked.currentRunAttempt,
    },
  )
}

export const createGithubRequester = (token, fetchImpl = fetch) => {
  const checkedToken = requireString(token, 'GITHUB_TOKEN')
  return async (path) => {
    const response = await fetchImpl(`https://api.github.com${path}`, {
      headers: {
        Authorization: `Bearer ${checkedToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
    if (!response.ok) fail(`GitHub qualification request failed with status ${response.status}`)
    return response.json()
  }
}

const parseArguments = (values) => {
  const result = {}
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index]
    const value = values[index + 1]
    if (!name?.startsWith('--') || value === undefined || value.startsWith('--')) {
      fail(`invalid command argument near ${name ?? '<end>'}`)
    }
    const key = name.slice(2)
    if (Object.hasOwn(result, key)) fail(`duplicate command argument --${key}`)
    result[key] = value
  }
  return result
}

const requireArguments = (args, names) => {
  const actual = Object.keys(args).sort()
  const expected = [...names].sort()
  if (actual.join('\n') !== expected.join('\n')) {
    fail(`command arguments must be exactly: ${expected.map((name) => `--${name}`).join(', ')}`)
  }
}

const inputFromArguments = (args) => ({
  repository: args.repository,
  revision: args.revision,
  version: args.version,
  tagRef: args['tag-ref'],
  defaultBranch: args['default-branch'],
  ciWorkflow: args['ci-workflow'],
  currentRunId: args['current-run-id'],
  currentRunAttempt: args['current-run-attempt'],
})

const commonArguments = [
  'repository',
  'revision',
  'version',
  'tag-ref',
  'default-branch',
  'ci-workflow',
  'current-run-id',
  'current-run-attempt',
]

const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

const commandVerify = async (args, dependencies) => {
  requireArguments(args, [...commonArguments, 'output'])
  const record = await qualifyHostedReleaseCandidate(inputFromArguments(args), {
    requestJson: dependencies.requestJson,
  })
  await writeJson(resolve(args.output), record)
  process.stdout.write(
    `${JSON.stringify({ status: 'qualified', schemaVersion: record.schemaVersion, release: record.release, sourceBranch: record.sourceBranch, ci: record.ci }, null, 2)}\n`,
  )
}

const commandCheck = async (args) => {
  requireArguments(args, [...commonArguments, 'file'])
  const checkedInput = validateInput(inputFromArguments(args))
  const record = validateReleaseQualificationRecord(
    JSON.parse(await readFile(resolve(args.file), 'utf8')),
    {
      repository: checkedInput.repository,
      revision: checkedInput.revision,
      version: checkedInput.version,
      tagRef: checkedInput.tagRef,
      defaultBranch: checkedInput.defaultBranch,
      ciWorkflow: checkedInput.ciWorkflow,
      currentRunId: checkedInput.currentRunId,
      currentRunAttempt: checkedInput.currentRunAttempt,
    },
  )
  process.stdout.write(
    `${JSON.stringify({ status: 'ok', schemaVersion: record.schemaVersion, release: record.release, sourceBranch: record.sourceBranch, ci: record.ci }, null, 2)}\n`,
  )
}

export const runReleaseQualificationCli = async ([command, ...values], { requestJson } = {}) => {
  const args = parseArguments(values)
  if (command === 'verify') {
    return commandVerify(args, {
      requestJson: requestJson ?? createGithubRequester(process.env.GITHUB_TOKEN),
    })
  }
  if (command === 'check') return commandCheck(args)
  fail('command must be one of: verify, check')
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runReleaseQualificationCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
