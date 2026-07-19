import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, dirname, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

import { validateReleaseManifest, validateReleaseVersion } from './release-manifest.mjs'

export const clientBuildSchemaVersion = 'myfitness-client-build/v1'
export const clientFragmentSchemaVersion = 'myfitness-client-release-fragment/v1'
export const clientManifestSchemaVersion = 'myfitness-client-release/v1'
export const clientPlatforms = ['h5', 'weapp']

const artifactMediaType = 'application/vnd.myfitness.client-bundle.v1.tar'
const digestPattern = /^sha256:[0-9a-f]{64}$/
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const revisionPattern = /^[0-9a-f]{40}$/
const clientRules = {
  h5: {
    artifactFileName: 'myfitness-client-h5.tar',
    authMode: 'dev',
    deliveryClass: 'preview-only',
    adapter: 'static-host',
    requiredFiles: ['index.html', 'myfitness-client-build.json'],
  },
  weapp: {
    artifactFileName: 'myfitness-client-weapp.tar',
    authMode: 'wechat',
    deliveryClass: 'candidate',
    adapter: 'wechat-code-upload',
    requiredFiles: ['app.js', 'app.json', 'myfitness-client-build.json'],
  },
}

const fail = (message) => {
  throw new Error(message)
}

const requireString = (value, name) => {
  if (typeof value !== 'string' || value.length === 0) fail(`${name} must be a non-empty string`)
  if (value.trim() !== value) fail(`${name} must not have surrounding whitespace`)
  return value
}

const requirePositiveInteger = (value, name) => {
  if (!Number.isSafeInteger(value) || value < 1) fail(`${name} must be a positive integer`)
  return value
}

const requireNonNegativeInteger = (value, name) => {
  if (!Number.isSafeInteger(value) || value < 0) fail(`${name} must be a non-negative integer`)
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
  const repository = requireString(value, 'client source repository')
  if (!repositoryPattern.test(repository))
    fail('client source repository must use owner/name format')
  return repository
}

const validateRevision = (value) => {
  const revision = requireString(value, 'client source revision')
  if (!revisionPattern.test(revision)) {
    fail('client source revision must be a lowercase 40-character Git SHA')
  }
  return revision
}

const validatePlatform = (value) => {
  if (!clientPlatforms.includes(value)) {
    fail(`client platform must be one of: ${clientPlatforms.join(', ')}`)
  }
  return value
}

const validateRun = (value) => {
  requireExactKeys(value, ['id', 'attempt'], 'client workflow run')
  const id = requireString(value.id, 'client workflow run id')
  if (!/^\d+$/.test(id)) fail('client workflow run id must contain only digits')
  return { id, attempt: requirePositiveInteger(value.attempt, 'client workflow run attempt') }
}

const validateTimestamp = (value) => {
  const timestamp = requireString(value, 'client publishedAt')
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== timestamp) {
    fail('client publishedAt must be a canonical ISO-8601 UTC timestamp')
  }
  return timestamp
}

const blockedHostSuffixes = ['.example', '.invalid', '.localhost', '.local', '.test', '.internal']

export const validateClientApiBaseUrl = (value) => {
  const exact = requireString(value, 'client API base URL')
  let parsed
  try {
    parsed = new URL(exact)
  } catch {
    fail('client API base URL must be a valid URL')
  }
  const hostname = parsed.hostname.toLowerCase()
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.pathname !== '/v1' ||
    parsed.search ||
    parsed.hash ||
    parsed.origin === 'null' ||
    exact !== `${parsed.origin}/v1`
  ) {
    fail('client API base URL must be a canonical HTTPS /v1 URL')
  }
  if (
    isIP(hostname) ||
    hostname === 'localhost' ||
    !hostname.includes('.') ||
    blockedHostSuffixes.some((suffix) => hostname.endsWith(suffix))
  ) {
    fail('client API base URL must use an externally routable domain name')
  }
  return exact
}

const validateDigest = (value, name) => {
  const digest = requireString(value, name)
  if (!digestPattern.test(digest)) fail(`${name} must be a lowercase sha256 digest`)
  return digest
}

const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`

const compareStrings = (left, right) => (left < right ? -1 : left > right ? 1 : 0)

const validateArchivePath = (value) => {
  const path = requireString(value, 'archive path')
  if (
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes('\0') ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    fail(`archive path is unsafe: ${path}`)
  }
  return path
}

const summarizeEntries = (entries) => {
  const ordered = [...entries].sort((left, right) => compareStrings(left.path, right.path))
  const paths = new Set()
  const tree = createHash('sha256')
  let unpackedBytes = 0
  for (const entry of ordered) {
    const path = validateArchivePath(entry.path)
    if (paths.has(path)) fail(`client archive contains duplicate path: ${path}`)
    paths.add(path)
    if (!Buffer.isBuffer(entry.data)) fail(`archive entry ${path} must contain bytes`)
    const digest = sha256(entry.data)
    unpackedBytes += entry.data.length
    tree.update(path)
    tree.update('\0')
    tree.update(String(entry.data.length))
    tree.update('\0')
    tree.update(digest)
    tree.update('\n')
  }
  return {
    fileCount: ordered.length,
    unpackedBytes,
    treeDigest: `sha256:${tree.digest('hex')}`,
  }
}

const collectEntries = async (root) => {
  const absoluteRoot = resolve(root)
  const rootStatus = await lstat(absoluteRoot)
  if (!rootStatus.isDirectory()) fail('client build root must be a directory')
  const entries = []
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = resolve(directory, entry.name)
      const status = await lstat(absolutePath)
      if (status.isSymbolicLink()) fail(`client build must not contain symlinks: ${absolutePath}`)
      if (status.isDirectory()) {
        await visit(absolutePath)
      } else if (status.isFile()) {
        const path = validateArchivePath(relative(absoluteRoot, absolutePath).split(sep).join('/'))
        entries.push({ path, data: await readFile(absolutePath) })
      } else {
        fail(`client build must contain regular files only: ${absolutePath}`)
      }
    }
  }
  await visit(absoluteRoot)
  entries.sort((left, right) => compareStrings(left.path, right.path))
  if (!entries.length) fail('client build root must not be empty')
  const unique = new Set(entries.map((entry) => entry.path))
  if (unique.size !== entries.length) fail('client build contains duplicate canonical paths')
  return entries
}

const writeField = (buffer, value, offset, length) => {
  const bytes = Buffer.from(value, 'utf8')
  if (bytes.length > length) fail(`tar field is too long: ${value}`)
  bytes.copy(buffer, offset)
}

const writeOctal = (buffer, value, offset, length, name) => {
  if (!Number.isSafeInteger(value) || value < 0) fail(`${name} cannot be represented in tar`)
  const encoded = value.toString(8)
  if (encoded.length > length - 1) fail(`${name} is too large for tar`)
  writeField(buffer, `${encoded.padStart(length - 1, '0')}\0`, offset, length)
}

const splitTarPath = (path) => {
  const bytes = Buffer.byteLength(path)
  if (bytes <= 100) return { name: path, prefix: '' }
  const separators = []
  for (let index = 0; index < path.length; index += 1) {
    if (path[index] === '/') separators.push(index)
  }
  for (const index of separators.reverse()) {
    const prefix = path.slice(0, index)
    const name = path.slice(index + 1)
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) {
      return { name, prefix }
    }
  }
  fail(`archive path is too long for USTAR: ${path}`)
}

const createTarHeader = (path, size) => {
  const header = Buffer.alloc(512)
  const split = splitTarPath(validateArchivePath(path))
  writeField(header, split.name, 0, 100)
  writeOctal(header, 0o644, 100, 8, 'tar mode')
  writeOctal(header, 0, 108, 8, 'tar uid')
  writeOctal(header, 0, 116, 8, 'tar gid')
  writeOctal(header, size, 124, 12, 'tar file size')
  writeOctal(header, 0, 136, 12, 'tar mtime')
  header.fill(0x20, 148, 156)
  header[156] = 0x30
  writeField(header, 'ustar\0', 257, 6)
  writeField(header, '00', 263, 2)
  writeField(header, split.prefix, 345, 155)
  const checksum = header.reduce((sum, byte) => sum + byte, 0)
  writeField(header, `${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8)
  return header
}

export const createDeterministicTar = (entries) => {
  const ordered = [...entries].sort((left, right) => compareStrings(left.path, right.path))
  summarizeEntries(ordered)
  const chunks = []
  for (const entry of ordered) {
    chunks.push(createTarHeader(entry.path, entry.data.length), entry.data)
    const padding = (512 - (entry.data.length % 512)) % 512
    if (padding) chunks.push(Buffer.alloc(padding))
  }
  chunks.push(Buffer.alloc(1024))
  return Buffer.concat(chunks)
}

const readTarString = (buffer, offset, length) => {
  const field = buffer.subarray(offset, offset + length)
  const end = field.indexOf(0)
  return field.subarray(0, end === -1 ? field.length : end).toString('utf8')
}

const readTarOctal = (buffer, offset, length, name) => {
  const raw = readTarString(buffer, offset, length).trim()
  if (!/^[0-7]+$/.test(raw)) fail(`${name} is not canonical octal`)
  const value = Number.parseInt(raw, 8)
  if (!Number.isSafeInteger(value)) fail(`${name} is too large`)
  return value
}

const isZeroBlock = (buffer) => buffer.every((byte) => byte === 0)

export const parseDeterministicTar = (archive) => {
  if (!Buffer.isBuffer(archive) || archive.length < 1024 || archive.length % 512 !== 0) {
    fail('client archive must be a complete block-aligned tar')
  }
  const entries = []
  const paths = new Set()
  let offset = 0
  let foundTerminator = false
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512)
    if (isZeroBlock(header)) {
      if (
        offset + 1024 > archive.length ||
        !isZeroBlock(archive.subarray(offset + 512, offset + 1024))
      ) {
        fail('client archive must end with two zero blocks')
      }
      if (!archive.subarray(offset).every((byte) => byte === 0)) {
        fail('client archive contains data after its terminator')
      }
      foundTerminator = true
      break
    }
    const storedChecksum = readTarOctal(header, 148, 8, 'tar checksum')
    const checksumHeader = Buffer.from(header)
    checksumHeader.fill(0x20, 148, 156)
    const actualChecksum = checksumHeader.reduce((sum, byte) => sum + byte, 0)
    if (storedChecksum !== actualChecksum) fail('client archive header checksum is invalid')
    if (readTarString(header, 257, 6) !== 'ustar') fail('client archive must use USTAR')
    const type = header[156]
    if (type !== 0 && type !== 0x30) fail('client archive must contain regular files only')
    const name = readTarString(header, 0, 100)
    const prefix = readTarString(header, 345, 155)
    const path = validateArchivePath(prefix ? `${prefix}/${name}` : name)
    if (paths.has(path)) fail(`client archive contains duplicate path: ${path}`)
    paths.add(path)
    const size = readTarOctal(header, 124, 12, 'tar file size')
    const mode = readTarOctal(header, 100, 8, 'tar mode')
    const uid = readTarOctal(header, 108, 8, 'tar uid')
    const gid = readTarOctal(header, 116, 8, 'tar gid')
    const mtime = readTarOctal(header, 136, 12, 'tar mtime')
    if (mode !== 0o644 || uid !== 0 || gid !== 0 || mtime !== 0) {
      fail('client archive metadata must use mode 0644, uid/gid 0 and mtime 0')
    }
    const start = offset + 512
    const end = start + size
    if (end > archive.length) fail(`client archive entry is truncated: ${path}`)
    entries.push({ path, data: Buffer.from(archive.subarray(start, end)) })
    offset = start + Math.ceil(size / 512) * 512
  }
  if (!foundTerminator) fail('client archive is missing its terminator')
  const ordered = [...entries].sort((left, right) => compareStrings(left.path, right.path))
  if (ordered.some((entry, index) => entry.path !== entries[index]?.path)) {
    fail('client archive paths must be sorted')
  }
  if (!archive.equals(createDeterministicTar(entries))) {
    fail('client archive must use canonical deterministic USTAR bytes')
  }
  return entries
}

export const createClientBuildMetadata = ({
  platform,
  repository,
  revision,
  version,
  runId,
  runAttempt,
  apiBaseUrl,
  authMode,
}) => {
  const checkedPlatform = validatePlatform(platform)
  const rule = clientRules[checkedPlatform]
  if (authMode !== rule.authMode) {
    fail(`${checkedPlatform} release auth mode must be ${rule.authMode}`)
  }
  return {
    schemaVersion: clientBuildSchemaVersion,
    platform: checkedPlatform,
    version: validateReleaseVersion(version),
    source: {
      repository: validateRepository(repository),
      revision: validateRevision(revision),
    },
    workflow: validateRun({ id: runId, attempt: Number(runAttempt) }),
    runtime: {
      apiBaseUrl: validateClientApiBaseUrl(apiBaseUrl),
      authMode: rule.authMode,
    },
    deliveryClass: rule.deliveryClass,
  }
}

export const validateClientBuildMetadata = (value) => {
  requireExactKeys(
    value,
    ['schemaVersion', 'platform', 'version', 'source', 'workflow', 'runtime', 'deliveryClass'],
    'client build metadata',
  )
  if (value.schemaVersion !== clientBuildSchemaVersion) {
    fail('client build metadata schemaVersion is unsupported')
  }
  requireExactKeys(value.source, ['repository', 'revision'], 'client build source')
  requireExactKeys(value.runtime, ['apiBaseUrl', 'authMode'], 'client build runtime')
  const metadata = createClientBuildMetadata({
    platform: value.platform,
    repository: value.source.repository,
    revision: value.source.revision,
    version: value.version,
    runId: value.workflow?.id,
    runAttempt: value.workflow?.attempt,
    apiBaseUrl: value.runtime.apiBaseUrl,
    authMode: value.runtime.authMode,
  })
  if (value.deliveryClass !== metadata.deliveryClass) {
    fail(`${metadata.platform} deliveryClass must be ${metadata.deliveryClass}`)
  }
  return metadata
}

const validateArtifact = (value, platform) => {
  requireExactKeys(
    value,
    ['fileName', 'mediaType', 'digest', 'bytes', 'fileCount', 'unpackedBytes', 'treeDigest'],
    `${platform} client artifact`,
  )
  const rule = clientRules[platform]
  if (value.fileName !== rule.artifactFileName) {
    fail(`${platform} artifact fileName must be ${rule.artifactFileName}`)
  }
  if (value.mediaType !== artifactMediaType) {
    fail(`${platform} artifact mediaType is unsupported`)
  }
  return {
    fileName: value.fileName,
    mediaType: artifactMediaType,
    digest: validateDigest(value.digest, `${platform} artifact digest`),
    bytes: requirePositiveInteger(value.bytes, `${platform} artifact bytes`),
    fileCount: requirePositiveInteger(value.fileCount, `${platform} artifact fileCount`),
    unpackedBytes: requireNonNegativeInteger(
      value.unpackedBytes,
      `${platform} artifact unpackedBytes`,
    ),
    treeDigest: validateDigest(value.treeDigest, `${platform} artifact treeDigest`),
  }
}

export const createClientFragment = ({ metadata, artifact }) => {
  const checkedMetadata = validateClientBuildMetadata(metadata)
  return {
    schemaVersion: clientFragmentSchemaVersion,
    platform: checkedMetadata.platform,
    version: checkedMetadata.version,
    source: checkedMetadata.source,
    workflow: checkedMetadata.workflow,
    runtime: checkedMetadata.runtime,
    deliveryClass: checkedMetadata.deliveryClass,
    adapter: clientRules[checkedMetadata.platform].adapter,
    artifact: validateArtifact(artifact, checkedMetadata.platform),
  }
}

export const validateClientFragment = (value) => {
  requireExactKeys(
    value,
    [
      'schemaVersion',
      'platform',
      'version',
      'source',
      'workflow',
      'runtime',
      'deliveryClass',
      'adapter',
      'artifact',
    ],
    'client release fragment',
  )
  if (value.schemaVersion !== clientFragmentSchemaVersion) {
    fail('client release fragment schemaVersion is unsupported')
  }
  requireExactKeys(value.source, ['repository', 'revision'], 'client release fragment source')
  requireExactKeys(value.runtime, ['apiBaseUrl', 'authMode'], 'client release fragment runtime')
  const fragment = createClientFragment({
    metadata: {
      schemaVersion: clientBuildSchemaVersion,
      platform: value.platform,
      version: value.version,
      source: value.source,
      workflow: value.workflow,
      runtime: value.runtime,
      deliveryClass: value.deliveryClass,
    },
    artifact: value.artifact,
  })
  if (value.adapter !== fragment.adapter) {
    fail(`${fragment.platform} adapter must be ${fragment.adapter}`)
  }
  return fragment
}

export const assembleClientReleaseManifest = (fragments, publishedAt) => {
  if (!Array.isArray(fragments) || fragments.length !== clientPlatforms.length) {
    fail(`client release requires exactly ${clientPlatforms.length} platform fragments`)
  }
  const validated = fragments.map(validateClientFragment)
  const byPlatform = new Map(validated.map((fragment) => [fragment.platform, fragment]))
  if (byPlatform.size !== clientPlatforms.length) {
    fail('client release contains a duplicate platform fragment')
  }
  for (const platform of clientPlatforms) {
    if (!byPlatform.has(platform)) fail(`client release is missing the ${platform} fragment`)
  }
  const baseline = validated[0]
  for (const fragment of validated.slice(1)) {
    if (fragment.version !== baseline.version) fail('client fragments do not share one version')
    if (fragment.source.repository !== baseline.source.repository) {
      fail('client fragments do not share one repository')
    }
    if (fragment.source.revision !== baseline.source.revision) {
      fail('client fragments do not share one source revision')
    }
    if (
      fragment.workflow.id !== baseline.workflow.id ||
      fragment.workflow.attempt !== baseline.workflow.attempt
    ) {
      fail('client fragments do not share one workflow run')
    }
    if (fragment.runtime.apiBaseUrl !== baseline.runtime.apiBaseUrl) {
      fail('client fragments do not share one API base URL')
    }
  }
  return {
    schemaVersion: clientManifestSchemaVersion,
    version: baseline.version,
    source: { ...baseline.source },
    workflow: { ...baseline.workflow },
    publishedAt: validateTimestamp(publishedAt),
    clients: Object.fromEntries(
      clientPlatforms.map((platform) => {
        const fragment = byPlatform.get(platform)
        return [
          platform,
          {
            runtime: { ...fragment.runtime },
            deliveryClass: fragment.deliveryClass,
            adapter: fragment.adapter,
            artifact: { ...fragment.artifact },
          },
        ]
      }),
    ),
  }
}

export const validateClientReleaseManifest = (
  value,
  { expectedRepository, expectedRevision, expectedVersion } = {},
) => {
  requireExactKeys(
    value,
    ['schemaVersion', 'version', 'source', 'workflow', 'publishedAt', 'clients'],
    'client release manifest',
  )
  if (value.schemaVersion !== clientManifestSchemaVersion) {
    fail('client release manifest schemaVersion is unsupported')
  }
  requireExactKeys(value.source, ['repository', 'revision'], 'client release source')
  requireExactKeys(value.clients, clientPlatforms, 'client release clients')
  const version = validateReleaseVersion(value.version)
  const repository = validateRepository(value.source.repository)
  const revision = validateRevision(value.source.revision)
  const workflow = validateRun(value.workflow)
  const publishedAt = validateTimestamp(value.publishedAt)
  const clients = Object.fromEntries(
    clientPlatforms.map((platform) => {
      const valueForPlatform = value.clients[platform]
      requireExactKeys(
        valueForPlatform,
        ['runtime', 'deliveryClass', 'adapter', 'artifact'],
        `${platform} client release entry`,
      )
      const fragment = createClientFragment({
        metadata: {
          schemaVersion: clientBuildSchemaVersion,
          platform,
          version,
          source: { repository, revision },
          workflow,
          runtime: valueForPlatform.runtime,
          deliveryClass: valueForPlatform.deliveryClass,
        },
        artifact: valueForPlatform.artifact,
      })
      if (valueForPlatform.adapter !== fragment.adapter) {
        fail(`${platform} adapter must be ${fragment.adapter}`)
      }
      return [
        platform,
        {
          runtime: fragment.runtime,
          deliveryClass: fragment.deliveryClass,
          adapter: fragment.adapter,
          artifact: fragment.artifact,
        },
      ]
    }),
  )
  if (clients.h5.runtime.apiBaseUrl !== clients.weapp.runtime.apiBaseUrl) {
    fail('client release platforms do not share one API base URL')
  }
  if (expectedRepository && repository !== expectedRepository) {
    fail(`client release repository does not match ${expectedRepository}`)
  }
  if (expectedRevision && revision !== expectedRevision) {
    fail(`client release source revision does not match ${expectedRevision}`)
  }
  if (expectedVersion && version !== expectedVersion) {
    fail(`client release version does not match ${expectedVersion}`)
  }
  return {
    schemaVersion: clientManifestSchemaVersion,
    version,
    source: { repository, revision },
    workflow,
    publishedAt,
    clients,
  }
}

const assertMetadataMatches = (metadata, expected, name) => {
  if (metadata.platform !== expected.platform) fail(`${name} platform does not match`)
  if (metadata.version !== expected.version) fail(`${name} version does not match`)
  if (metadata.source.repository !== expected.repository) fail(`${name} repository does not match`)
  if (metadata.source.revision !== expected.revision) fail(`${name} revision does not match`)
  if (
    metadata.workflow.id !== expected.runId ||
    metadata.workflow.attempt !== Number(expected.runAttempt)
  ) {
    fail(`${name} workflow run does not match`)
  }
}

const metadataFromEntries = (entries, platform) => {
  const metadataEntry = entries.find((entry) => entry.path === 'myfitness-client-build.json')
  if (!metadataEntry) fail(`${platform} build is missing myfitness-client-build.json`)
  let parsed
  try {
    parsed = JSON.parse(metadataEntry.data.toString('utf8'))
  } catch {
    fail(`${platform} build metadata must be valid JSON`)
  }
  return validateClientBuildMetadata(parsed)
}

const requireEntrypoints = (entries, platform) => {
  const paths = new Set(entries.map((entry) => entry.path))
  for (const required of clientRules[platform].requiredFiles) {
    if (!paths.has(required)) fail(`${platform} build is missing required file ${required}`)
  }
}

export const packageClientArtifact = async ({
  platform,
  buildRoot,
  artifactPath,
  fragmentPath,
  repository,
  revision,
  version,
  runId,
  runAttempt,
}) => {
  const checkedPlatform = validatePlatform(platform)
  const checkedVersion = validateReleaseVersion(version)
  const checkedRepository = validateRepository(repository)
  const checkedRevision = validateRevision(revision)
  const checkedRun = validateRun({ id: runId, attempt: Number(runAttempt) })
  if (basename(artifactPath) !== clientRules[checkedPlatform].artifactFileName) {
    fail(
      `${checkedPlatform} artifact path must end in ${clientRules[checkedPlatform].artifactFileName}`,
    )
  }
  const entries = await collectEntries(buildRoot)
  requireEntrypoints(entries, checkedPlatform)
  const metadata = metadataFromEntries(entries, checkedPlatform)
  assertMetadataMatches(
    metadata,
    {
      platform: checkedPlatform,
      version: checkedVersion,
      repository: checkedRepository,
      revision: checkedRevision,
      runId: checkedRun.id,
      runAttempt: checkedRun.attempt,
    },
    `${checkedPlatform} build metadata`,
  )
  const archive = createDeterministicTar(entries)
  const tree = summarizeEntries(entries)
  const artifact = {
    fileName: clientRules[checkedPlatform].artifactFileName,
    mediaType: artifactMediaType,
    digest: sha256(archive),
    bytes: archive.length,
    ...tree,
  }
  const fragment = createClientFragment({ metadata, artifact })
  await mkdir(dirname(resolve(artifactPath)), { recursive: true })
  await mkdir(dirname(resolve(fragmentPath)), { recursive: true })
  await writeFile(resolve(artifactPath), archive)
  await writeFile(resolve(fragmentPath), `${JSON.stringify(fragment, null, 2)}\n`, 'utf8')
  return fragment
}

export const verifyClientReleaseArtifacts = async (
  manifestValue,
  artifactDirectory,
  expected = {},
) => {
  const manifest = validateClientReleaseManifest(manifestValue, expected)
  for (const platform of clientPlatforms) {
    const record = manifest.clients[platform]
    const archivePath = resolve(artifactDirectory, record.artifact.fileName)
    const archive = await readFile(archivePath)
    if (archive.length !== record.artifact.bytes) {
      fail(`${platform} artifact byte length does not match its manifest`)
    }
    if (sha256(archive) !== record.artifact.digest) {
      fail(`${platform} artifact digest does not match its manifest`)
    }
    const entries = parseDeterministicTar(archive)
    requireEntrypoints(entries, platform)
    const tree = summarizeEntries(entries)
    if (
      tree.fileCount !== record.artifact.fileCount ||
      tree.unpackedBytes !== record.artifact.unpackedBytes ||
      tree.treeDigest !== record.artifact.treeDigest
    ) {
      fail(`${platform} artifact tree does not match its manifest`)
    }
    const metadata = metadataFromEntries(entries, platform)
    assertMetadataMatches(
      metadata,
      {
        platform,
        version: manifest.version,
        repository: manifest.source.repository,
        revision: manifest.source.revision,
        runId: manifest.workflow.id,
        runAttempt: manifest.workflow.attempt,
      },
      `${platform} archived metadata`,
    )
    if (
      metadata.runtime.apiBaseUrl !== record.runtime.apiBaseUrl ||
      metadata.runtime.authMode !== record.runtime.authMode ||
      metadata.deliveryClass !== record.deliveryClass
    ) {
      fail(`${platform} archived runtime metadata does not match its manifest`)
    }
  }
  return manifest
}

export const assertClientMatchesServiceRelease = (clientValue, serviceValue) => {
  const client = validateClientReleaseManifest(clientValue)
  const service = validateReleaseManifest(serviceValue)
  if (client.version !== service.version)
    fail('client and service releases do not share one version')
  if (client.source.repository !== service.source.repository) {
    fail('client and service releases do not share one repository')
  }
  if (client.source.revision !== service.source.revision) {
    fail('client and service releases do not share one source revision')
  }
  if (
    client.workflow.id !== service.workflow.id ||
    client.workflow.attempt !== service.workflow.attempt
  ) {
    fail('client and service releases do not share one workflow run')
  }
  return { client, service }
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

const readJson = async (path) => JSON.parse(await readFile(resolve(path), 'utf8'))

const writeJson = async (path, value) => {
  await mkdir(dirname(resolve(path)), { recursive: true })
  await writeFile(resolve(path), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

const commandPackage = async (args) => {
  requireArguments(args, [
    'platform',
    'build-root',
    'artifact',
    'fragment',
    'repository',
    'revision',
    'version',
    'run-id',
    'run-attempt',
  ])
  await packageClientArtifact({
    platform: args.platform,
    buildRoot: args['build-root'],
    artifactPath: args.artifact,
    fragmentPath: args.fragment,
    repository: args.repository,
    revision: args.revision,
    version: args.version,
    runId: args['run-id'],
    runAttempt: args['run-attempt'],
  })
}

const commandAssemble = async (args) => {
  requireArguments(args, ['input-dir', 'published-at', 'output'])
  const directory = resolve(args['input-dir'])
  const fragments = await Promise.all(
    clientPlatforms.map((platform) =>
      readJson(resolve(directory, `client-release-fragment-${platform}.json`)),
    ),
  )
  await writeJson(args.output, assembleClientReleaseManifest(fragments, args['published-at']))
}

const commandVerify = async (args) => {
  requireArguments(args, [
    'file',
    'artifact-dir',
    'service-release',
    'expected-repository',
    'expected-revision',
    'expected-version',
  ])
  const manifest = await verifyClientReleaseArtifacts(
    await readJson(args.file),
    args['artifact-dir'],
    {
      expectedRepository: args['expected-repository'],
      expectedRevision: args['expected-revision'],
      expectedVersion: args['expected-version'],
    },
  )
  assertClientMatchesServiceRelease(manifest, await readJson(args['service-release']))
  process.stdout.write(
    `${JSON.stringify(
      {
        status: 'ok',
        schemaVersion: manifest.schemaVersion,
        version: manifest.version,
        source: manifest.source,
        workflow: manifest.workflow,
        clients: Object.fromEntries(
          clientPlatforms.map((platform) => [
            platform,
            {
              apiBaseUrl: manifest.clients[platform].runtime.apiBaseUrl,
              authMode: manifest.clients[platform].runtime.authMode,
              deliveryClass: manifest.clients[platform].deliveryClass,
              artifactDigest: manifest.clients[platform].artifact.digest,
              treeDigest: manifest.clients[platform].artifact.treeDigest,
            },
          ]),
        ),
      },
      null,
      2,
    )}\n`,
  )
}

const commandQualify = async (args) => {
  requireArguments(args, ['version', 'api-base-url'])
  validateReleaseVersion(args.version)
  validateClientApiBaseUrl(args['api-base-url'])
}

export const runClientReleaseCli = async ([command, ...values]) => {
  const args = parseArguments(values)
  if (command === 'qualify') return commandQualify(args)
  if (command === 'package') return commandPackage(args)
  if (command === 'assemble') return commandAssemble(args)
  if (command === 'verify') return commandVerify(args)
  fail('command must be one of: qualify, package, assemble, verify')
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runClientReleaseCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
