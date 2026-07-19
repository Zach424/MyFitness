import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const fragmentSchemaVersion = 'myfitness-release-fragment/v1'
export const manifestSchemaVersion = 'myfitness-release/v1'
export const releaseServices = ['api', 'admin', 'ai']

const digestPattern = /^sha256:[0-9a-f]{64}$/
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const revisionPattern = /^[0-9a-f]{40}$/
const versionPattern =
  /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/

const fail = (message) => {
  throw new Error(message)
}

const requireString = (value, name) => {
  if (typeof value !== 'string' || value.length === 0) fail(`${name} must be a non-empty string`)
  return value
}

const requirePositiveInteger = (value, name) => {
  if (!Number.isInteger(value) || value < 1) fail(`${name} must be a positive integer`)
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
  const revision = requireString(value, 'source revision')
  if (!revisionPattern.test(revision))
    fail('source revision must be a lowercase 40-character Git SHA')
  return revision
}

const validateVersion = (value) => {
  const version = requireString(value, 'release version')
  const match = versionPattern.exec(version)
  const invalidNumericIdentifier = match?.[1]
    ?.split('.')
    .some((identifier) => /^0\d+$/.test(identifier))
  if (!match || invalidNumericIdentifier) {
    fail('release version must be a v-prefixed SemVer tag')
  }
  return version
}

export const validateReleaseVersion = validateVersion

const validateDigest = (value) => {
  const digest = requireString(value, 'image digest')
  if (!digestPattern.test(digest)) fail('image digest must be a lowercase sha256 digest')
  return digest
}

const validateService = (value) => {
  if (!releaseServices.includes(value))
    fail(`service must be one of: ${releaseServices.join(', ')}`)
  return value
}

const validateRun = (value) => {
  requireExactKeys(value, ['id', 'attempt'], 'workflow run')
  const id = requireString(value.id, 'workflow run id')
  if (!/^\d+$/.test(id)) fail('workflow run id must contain only digits')
  return { id, attempt: requirePositiveInteger(value.attempt, 'workflow run attempt') }
}

const expectedImageName = (repository, service) => {
  const [owner] = repository.split('/')
  return `ghcr.io/${owner.toLowerCase()}/myfitness-${service}`
}

const validateTimestamp = (value) => {
  const timestamp = requireString(value, 'publishedAt')
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== timestamp) {
    fail('publishedAt must be a canonical ISO-8601 UTC timestamp')
  }
  return timestamp
}

export const createServiceFragment = ({
  service,
  image,
  digest,
  repository,
  revision,
  version,
  runId,
  runAttempt,
}) => {
  const checkedService = validateService(service)
  const checkedRepository = validateRepository(repository)
  const checkedImage = requireString(image, 'image')
  const wantedImage = expectedImageName(checkedRepository, checkedService)
  if (checkedImage !== wantedImage) fail(`image for ${checkedService} must be ${wantedImage}`)

  return {
    schemaVersion: fragmentSchemaVersion,
    service: checkedService,
    image: checkedImage,
    digest: validateDigest(digest),
    version: validateVersion(version),
    source: {
      repository: checkedRepository,
      revision: validateRevision(revision),
    },
    workflow: validateRun({ id: runId, attempt: Number(runAttempt) }),
  }
}

export const validateServiceFragment = (value) => {
  requireExactKeys(
    value,
    ['schemaVersion', 'service', 'image', 'digest', 'version', 'source', 'workflow'],
    'release fragment',
  )
  if (value.schemaVersion !== fragmentSchemaVersion)
    fail('release fragment schemaVersion is unsupported')
  requireExactKeys(value.source, ['repository', 'revision'], 'release fragment source')
  return createServiceFragment({
    service: value.service,
    image: value.image,
    digest: value.digest,
    repository: value.source.repository,
    revision: value.source.revision,
    version: value.version,
    runId: value.workflow?.id,
    runAttempt: value.workflow?.attempt,
  })
}

export const assembleReleaseManifest = (fragments, publishedAt) => {
  if (!Array.isArray(fragments) || fragments.length !== releaseServices.length) {
    fail(`release requires exactly ${releaseServices.length} service fragments`)
  }
  const validated = fragments.map(validateServiceFragment)
  const byService = new Map(validated.map((fragment) => [fragment.service, fragment]))
  if (byService.size !== releaseServices.length)
    fail('release contains a duplicate service fragment')
  for (const service of releaseServices) {
    if (!byService.has(service)) fail(`release is missing the ${service} service fragment`)
  }

  const baseline = validated[0]
  for (const fragment of validated.slice(1)) {
    if (fragment.version !== baseline.version) fail('release fragments do not share one version')
    if (fragment.source.repository !== baseline.source.repository) {
      fail('release fragments do not share one repository')
    }
    if (fragment.source.revision !== baseline.source.revision) {
      fail('release fragments do not share one source revision')
    }
    if (
      fragment.workflow.id !== baseline.workflow.id ||
      fragment.workflow.attempt !== baseline.workflow.attempt
    ) {
      fail('release fragments do not share one workflow run')
    }
  }

  return {
    schemaVersion: manifestSchemaVersion,
    version: baseline.version,
    source: { ...baseline.source },
    workflow: { ...baseline.workflow },
    publishedAt: validateTimestamp(publishedAt),
    images: Object.fromEntries(
      releaseServices.map((service) => {
        const fragment = byService.get(service)
        return [
          service,
          {
            image: fragment.image,
            digest: fragment.digest,
            reference: `${fragment.image}@${fragment.digest}`,
          },
        ]
      }),
    ),
  }
}

export const validateReleaseManifest = (
  value,
  { expectedRepository, expectedRevision, expectedVersion } = {},
) => {
  requireExactKeys(
    value,
    ['schemaVersion', 'version', 'source', 'workflow', 'publishedAt', 'images'],
    'release manifest',
  )
  if (value.schemaVersion !== manifestSchemaVersion)
    fail('release manifest schemaVersion is unsupported')
  const version = validateVersion(value.version)
  requireExactKeys(value.source, ['repository', 'revision'], 'release manifest source')
  const repository = validateRepository(value.source.repository)
  const revision = validateRevision(value.source.revision)
  const workflow = validateRun(value.workflow)
  const publishedAt = validateTimestamp(value.publishedAt)
  requireExactKeys(value.images, releaseServices, 'release manifest images')

  const images = Object.fromEntries(
    releaseServices.map((service) => {
      const entry = value.images[service]
      requireExactKeys(entry, ['image', 'digest', 'reference'], `${service} image entry`)
      const image = requireString(entry.image, `${service} image`)
      const wantedImage = expectedImageName(repository, service)
      if (image !== wantedImage) fail(`image for ${service} must be ${wantedImage}`)
      const digest = validateDigest(entry.digest)
      if (entry.reference !== `${image}@${digest}`) {
        fail(`${service} immutable image reference does not match its image and digest`)
      }
      return [service, { image, digest, reference: entry.reference }]
    }),
  )

  if (expectedRepository && repository !== expectedRepository) {
    fail(`release repository does not match ${expectedRepository}`)
  }
  if (expectedRevision && revision !== expectedRevision) {
    fail(`release source revision does not match ${expectedRevision}`)
  }
  if (expectedVersion && version !== expectedVersion) {
    fail(`release version does not match ${expectedVersion}`)
  }

  return {
    schemaVersion: manifestSchemaVersion,
    version,
    source: { repository, revision },
    workflow,
    publishedAt,
    images,
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

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'))

const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

const commandFragment = async (args) => {
  requireArguments(args, [
    'service',
    'image',
    'digest',
    'repository',
    'revision',
    'version',
    'run-id',
    'run-attempt',
    'output',
  ])
  const fragment = createServiceFragment({
    service: args.service,
    image: args.image,
    digest: args.digest,
    repository: args.repository,
    revision: args.revision,
    version: args.version,
    runId: args['run-id'],
    runAttempt: args['run-attempt'],
  })
  await writeJson(resolve(args.output), fragment)
}

const commandAssemble = async (args) => {
  requireArguments(args, ['input-dir', 'published-at', 'output'])
  const inputDirectory = resolve(args['input-dir'])
  const fragments = await Promise.all(
    releaseServices.map((service) =>
      readJson(resolve(inputDirectory, `release-fragment-${service}.json`)),
    ),
  )
  const manifest = assembleReleaseManifest(fragments, args['published-at'])
  await writeJson(resolve(args.output), manifest)
}

const commandVerify = async (args) => {
  const allowed = ['file', 'expected-repository', 'expected-revision', 'expected-version']
  if (!args.file || Object.keys(args).some((name) => !allowed.includes(name))) {
    fail(`verify arguments may only include: ${allowed.map((name) => `--${name}`).join(', ')}`)
  }
  const manifest = validateReleaseManifest(await readJson(resolve(args.file)), {
    expectedRepository: args['expected-repository'],
    expectedRevision: args['expected-revision'],
    expectedVersion: args['expected-version'],
  })
  process.stdout.write(
    `${JSON.stringify(
      {
        status: 'ok',
        schemaVersion: manifest.schemaVersion,
        version: manifest.version,
        source: manifest.source,
        workflow: manifest.workflow,
        imageReferences: Object.fromEntries(
          releaseServices.map((service) => [service, manifest.images[service].reference]),
        ),
      },
      null,
      2,
    )}\n`,
  )
}

const commandQualify = async (args) => {
  requireArguments(args, ['version'])
  validateReleaseVersion(args.version)
}

export const runReleaseManifestCli = async ([command, ...values]) => {
  const args = parseArguments(values)
  if (command === 'qualify') return commandQualify(args)
  if (command === 'fragment') return commandFragment(args)
  if (command === 'assemble') return commandAssemble(args)
  if (command === 'verify') return commandVerify(args)
  fail('command must be one of: qualify, fragment, assemble, verify')
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runReleaseManifestCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
