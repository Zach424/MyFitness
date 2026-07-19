import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { releaseServices, validateReleaseManifest } from './release-manifest.mjs'

export const environmentSchemaVersion = 'myfitness-managed-environment/v1'
export const admissionSchemaVersion = 'myfitness-deployment-admission/v1'

const projectRepository = 'Zach424/MyFitness'
const runtimeSecretNames = [
  'apiRuntimeRef',
  'adminRuntimeRef',
  'aiRuntimeRef',
  'wechatCredentialRef',
  'adminOidcCredentialRef',
]
const digestPattern = /^sha256:[0-9a-f]{64}$/
const placeholderPattern = /(?:replace|pending|unknown|todo|example)/i
const slugPattern = /^[a-z0-9][a-z0-9-]{1,62}$/
const referencePattern = /^([a-z][a-z0-9+.-]*):\/\/([A-Za-z0-9][A-Za-z0-9._~:/-]{2,255})$/

const fail = (message) => {
  throw new Error(message)
}

const requireExactKeys = (value, expected, name) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name} must be an object`)
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.join('\n') !== wanted.join('\n')) {
    fail(`${name} keys must be exactly: ${wanted.join(', ')}`)
  }
}

const requireString = (value, name) => {
  if (typeof value !== 'string' || value.length === 0) fail(`${name} must be a non-empty string`)
  if (value !== value.trim()) fail(`${name} must not contain surrounding whitespace`)
  return value
}

const validateNonPlaceholder = (value, name) => {
  const exact = requireString(value, name)
  if (placeholderPattern.test(exact)) fail(`${name} must not contain a placeholder`)
  return exact
}

const validateSlug = (value, name) => {
  const exact = validateNonPlaceholder(value, name)
  if (!slugPattern.test(exact)) fail(`${name} must be a lowercase slug`)
  return exact
}

const validateReference = (value, expectedScheme, name) => {
  const exact = validateNonPlaceholder(value, name)
  const match = referencePattern.exec(exact)
  if (!match || match[1] !== expectedScheme) {
    fail(`${name} must be a non-secret ${expectedScheme}:// reference`)
  }
  return exact
}

const validateBudget = (value) => {
  if (!Number.isInteger(value) || value < 1 || value > 1_000_000) {
    fail('cloud monthlyBudgetCny must be an integer between 1 and 1000000')
  }
  return value
}

const validateTrustProxyHops = (value) => {
  if (!Number.isInteger(value) || value < 0 || value > 3) {
    fail('endpoints trustProxyHops must be an integer between 0 and 3')
  }
  return value
}

const validatePublicOrigin = (value, name) => {
  const exact = validateNonPlaceholder(value, name)
  let parsed
  try {
    parsed = new URL(exact)
  } catch {
    fail(`${name} must be a valid HTTPS origin`)
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash ||
    parsed.origin !== exact
  ) {
    fail(`${name} must be a canonical HTTPS origin without credentials, port, path or query`)
  }
  const hostname = parsed.hostname.toLowerCase()
  if (
    isIP(hostname) !== 0 ||
    !hostname.includes('.') ||
    hostname === 'localhost' ||
    ['.local', '.internal', '.invalid', '.test'].some((suffix) => hostname.endsWith(suffix))
  ) {
    fail(`${name} must use an externally routable domain name`)
  }
  return exact
}

const validateStage = (value) => {
  if (!['shared-test', 'production'].includes(value)) {
    fail('deployment stage must be shared-test or production')
  }
  return value
}

const validateTimestamp = (value) => {
  const exact = requireString(value, 'evaluatedAt')
  const parsed = new Date(exact)
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== exact) {
    fail('evaluatedAt must be a canonical ISO-8601 UTC timestamp')
  }
  return exact
}

const validateDataStore = (value, kind) => {
  if (kind === 'postgres') {
    requireExactKeys(
      value,
      ['serviceRef', 'ownerRef', 'backupPolicyRef', 'restoreEvidenceRef'],
      'postgres control',
    )
    return {
      serviceRef: validateReference(value.serviceRef, 'service', 'postgres serviceRef'),
      ownerRef: validateReference(value.ownerRef, 'owner', 'postgres ownerRef'),
      backupPolicyRef: validateReference(
        value.backupPolicyRef,
        'evidence',
        'postgres backupPolicyRef',
      ),
      restoreEvidenceRef: validateReference(
        value.restoreEvidenceRef,
        'evidence',
        'postgres restoreEvidenceRef',
      ),
    }
  }
  if (kind === 'redis') {
    requireExactKeys(value, ['serviceRef', 'ownerRef', 'tlsPolicyRef'], 'redis control')
    return {
      serviceRef: validateReference(value.serviceRef, 'service', 'redis serviceRef'),
      ownerRef: validateReference(value.ownerRef, 'owner', 'redis ownerRef'),
      tlsPolicyRef: validateReference(value.tlsPolicyRef, 'evidence', 'redis tlsPolicyRef'),
    }
  }
  if (kind === 'objectStorage') {
    requireExactKeys(
      value,
      ['serviceRef', 'ownerRef', 'encryptionPolicyRef', 'lifecyclePolicyRef'],
      'object storage control',
    )
    return {
      serviceRef: validateReference(value.serviceRef, 'service', 'object storage serviceRef'),
      ownerRef: validateReference(value.ownerRef, 'owner', 'object storage ownerRef'),
      encryptionPolicyRef: validateReference(
        value.encryptionPolicyRef,
        'evidence',
        'object storage encryptionPolicyRef',
      ),
      lifecyclePolicyRef: validateReference(
        value.lifecyclePolicyRef,
        'evidence',
        'object storage lifecyclePolicyRef',
      ),
    }
  }
  requireExactKeys(
    value,
    ['serviceRef', 'ownerRef', 'recoveryEvidenceRef'],
    'erasure ledger control',
  )
  return {
    serviceRef: validateReference(value.serviceRef, 'service', 'erasure ledger serviceRef'),
    ownerRef: validateReference(value.ownerRef, 'owner', 'erasure ledger ownerRef'),
    recoveryEvidenceRef: validateReference(
      value.recoveryEvidenceRef,
      'evidence',
      'erasure ledger recoveryEvidenceRef',
    ),
  }
}

export const validateManagedEnvironment = (value) => {
  requireExactKeys(
    value,
    [
      'schemaVersion',
      'deployment',
      'cloud',
      'endpoints',
      'runtimeSecrets',
      'dataStores',
      'observability',
      'aiProvider',
    ],
    'managed environment',
  )
  if (value.schemaVersion !== environmentSchemaVersion) {
    fail('managed environment schemaVersion is unsupported')
  }

  requireExactKeys(value.deployment, ['name', 'stage', 'changeAuthorityRef'], 'deployment')
  const deployment = {
    name: validateSlug(value.deployment.name, 'deployment name'),
    stage: validateStage(value.deployment.stage),
    changeAuthorityRef: validateReference(
      value.deployment.changeAuthorityRef,
      'change',
      'deployment changeAuthorityRef',
    ),
  }

  requireExactKeys(value.cloud, ['provider', 'accountRef', 'region', 'monthlyBudgetCny'], 'cloud')
  const cloud = {
    provider: validateSlug(value.cloud.provider, 'cloud provider'),
    accountRef: validateReference(value.cloud.accountRef, 'account', 'cloud accountRef'),
    region: validateSlug(value.cloud.region, 'cloud region'),
    monthlyBudgetCny: validateBudget(value.cloud.monthlyBudgetCny),
  }

  requireExactKeys(
    value.endpoints,
    ['apiOrigin', 'h5Origin', 'adminOrigin', 'tlsPolicyRef', 'edgePolicyRef', 'trustProxyHops'],
    'endpoints',
  )
  const endpoints = {
    apiOrigin: validatePublicOrigin(value.endpoints.apiOrigin, 'endpoints apiOrigin'),
    h5Origin: validatePublicOrigin(value.endpoints.h5Origin, 'endpoints h5Origin'),
    adminOrigin: validatePublicOrigin(value.endpoints.adminOrigin, 'endpoints adminOrigin'),
    tlsPolicyRef: validateReference(
      value.endpoints.tlsPolicyRef,
      'evidence',
      'endpoints tlsPolicyRef',
    ),
    edgePolicyRef: validateReference(
      value.endpoints.edgePolicyRef,
      'evidence',
      'endpoints edgePolicyRef',
    ),
    trustProxyHops: validateTrustProxyHops(value.endpoints.trustProxyHops),
  }
  if (new Set([endpoints.apiOrigin, endpoints.h5Origin, endpoints.adminOrigin]).size !== 3) {
    fail('API, H5 and administrator origins must be distinct')
  }

  requireExactKeys(value.runtimeSecrets, runtimeSecretNames, 'runtime secrets')
  const runtimeSecrets = Object.fromEntries(
    runtimeSecretNames.map((name) => [
      name,
      validateReference(value.runtimeSecrets[name], 'secret', `runtime secrets ${name}`),
    ]),
  )

  requireExactKeys(
    value.dataStores,
    ['postgres', 'redis', 'objectStorage', 'erasureLedger'],
    'data stores',
  )
  const dataStores = {
    postgres: validateDataStore(value.dataStores.postgres, 'postgres'),
    redis: validateDataStore(value.dataStores.redis, 'redis'),
    objectStorage: validateDataStore(value.dataStores.objectStorage, 'objectStorage'),
    erasureLedger: validateDataStore(value.dataStores.erasureLedger, 'erasureLedger'),
  }

  requireExactKeys(
    value.observability,
    ['telemetryRef', 'alertPolicyRef', 'responderRef', 'rollbackThresholdsRef'],
    'observability',
  )
  const observability = {
    telemetryRef: validateReference(
      value.observability.telemetryRef,
      'service',
      'observability telemetryRef',
    ),
    alertPolicyRef: validateReference(
      value.observability.alertPolicyRef,
      'evidence',
      'observability alertPolicyRef',
    ),
    responderRef: validateReference(
      value.observability.responderRef,
      'owner',
      'observability responderRef',
    ),
    rollbackThresholdsRef: validateReference(
      value.observability.rollbackThresholdsRef,
      'evidence',
      'observability rollbackThresholdsRef',
    ),
  }

  requireExactKeys(
    value.aiProvider,
    ['policyRef', 'retentionEvidenceRef', 'budgetEvidenceRef', 'canaryOwnerRef'],
    'AI provider',
  )
  const aiProvider = {
    policyRef: validateReference(value.aiProvider.policyRef, 'evidence', 'AI provider policyRef'),
    retentionEvidenceRef: validateReference(
      value.aiProvider.retentionEvidenceRef,
      'evidence',
      'AI provider retentionEvidenceRef',
    ),
    budgetEvidenceRef: validateReference(
      value.aiProvider.budgetEvidenceRef,
      'evidence',
      'AI provider budgetEvidenceRef',
    ),
    canaryOwnerRef: validateReference(
      value.aiProvider.canaryOwnerRef,
      'owner',
      'AI provider canaryOwnerRef',
    ),
  }

  return {
    schemaVersion: environmentSchemaVersion,
    deployment,
    cloud,
    endpoints,
    runtimeSecrets,
    dataStores,
    observability,
    aiProvider,
  }
}

const validateManifestDigest = (value, name) => {
  const exact = requireString(value, name)
  if (!digestPattern.test(exact)) fail(`${name} must be a lowercase sha256 digest`)
  return exact
}

const releaseSummary = (release, manifestSha256) => ({
  version: release.version,
  source: release.source,
  workflow: release.workflow,
  publishedAt: release.publishedAt,
  manifestSha256: validateManifestDigest(manifestSha256, 'release manifest digest'),
  images: Object.fromEntries(
    releaseServices.map((service) => [service, release.images[service].reference]),
  ),
})

export const createDeploymentAdmission = ({
  environment,
  release,
  releaseManifestSha256,
  rollbackMode,
  previousRelease,
  previousReleaseManifestSha256,
  evaluatedAt,
}) => {
  const checkedEnvironment = validateManagedEnvironment(environment)
  const checkedRelease = validateReleaseManifest(release, {
    expectedRepository: projectRepository,
  })
  if (!['no-traffic', 'previous-release'].includes(rollbackMode)) {
    fail('rollback mode must be no-traffic or previous-release')
  }

  let rollback
  if (rollbackMode === 'no-traffic') {
    if (checkedEnvironment.deployment.stage !== 'shared-test') {
      fail('no-traffic rollback is allowed only for a first shared-test deployment')
    }
    if (previousRelease || previousReleaseManifestSha256) {
      fail('no-traffic rollback must not include a previous release')
    }
    rollback = {
      mode: 'no-traffic',
      action: 'withdraw-public-traffic-and-scale-application-services-to-zero',
    }
  } else {
    if (!previousRelease || !previousReleaseManifestSha256) {
      fail('previous-release rollback requires a verified previous release and digest')
    }
    const checkedPrevious = validateReleaseManifest(previousRelease, {
      expectedRepository: projectRepository,
    })
    if (
      checkedPrevious.version === checkedRelease.version ||
      checkedPrevious.source.revision === checkedRelease.source.revision
    ) {
      fail('previous release must have a different version and source revision')
    }
    if (new Date(checkedPrevious.publishedAt) >= new Date(checkedRelease.publishedAt)) {
      fail('previous release must have been published before the target release')
    }
    rollback = {
      mode: 'previous-release',
      release: releaseSummary(checkedPrevious, previousReleaseManifestSha256),
    }
  }

  const releaseRecord = releaseSummary(checkedRelease, releaseManifestSha256)
  return {
    schemaVersion: admissionSchemaVersion,
    status: 'admitted',
    evaluatedAt: validateTimestamp(evaluatedAt),
    environment: checkedEnvironment,
    release: releaseRecord,
    expectedRuntime: {
      api: {
        bindHost: '0.0.0.0',
        authProviders: ['wechat'],
        corsOrigins: [checkedEnvironment.endpoints.h5Origin],
        trustProxyHops: checkedEnvironment.endpoints.trustProxyHops,
      },
      admin: {
        localLoginEnabled: false,
        secureCookies: true,
        redirectOrigin: checkedEnvironment.endpoints.adminOrigin,
      },
      ai: { privateOnly: true },
    },
    deploymentOrder: [
      {
        sequence: 1,
        action: 'verify-runtime-configuration',
      },
      {
        sequence: 2,
        action: 'run-forward-database-migrations',
        image: releaseRecord.images.api,
        command: ['node', 'dist/database/migrate.js'],
      },
      { sequence: 3, action: 'deploy-private-ai', image: releaseRecord.images.ai },
      { sequence: 4, action: 'deploy-api-without-traffic', image: releaseRecord.images.api },
      {
        sequence: 5,
        action: 'deploy-administrator-behind-oidc',
        image: releaseRecord.images.admin,
      },
      { sequence: 6, action: 'verify-health-identity-custody-and-telemetry' },
      { sequence: 7, action: 'shift-bounded-canary-traffic' },
    ],
    rollback,
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

const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`

const readJsonWithChecksum = async (jsonPath, checksumPath, name) => {
  const bytes = await readFile(resolve(jsonPath))
  const checksum = (await readFile(resolve(checksumPath), 'utf8')).trim()
  const match = /^([0-9a-f]{64})  release-manifest\.json$/.exec(checksum)
  if (!match) fail(`${name} checksum must use sha256sum release-manifest.json format`)
  const actual = sha256(bytes)
  const expected = `sha256:${match[1]}`
  if (actual !== expected) fail(`${name} checksum does not match its release manifest`)
  return { value: JSON.parse(bytes.toString('utf8')), digest: actual }
}

const writeJson = async (path, value) => {
  const output = resolve(path)
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

const commandVerify = async (args) => {
  const common = [
    'environment',
    'release',
    'release-checksum',
    'rollback-mode',
    'evaluated-at',
    'output',
  ]
  const previous = ['previous-release', 'previous-release-checksum']
  const expected = args['rollback-mode'] === 'previous-release' ? [...common, ...previous] : common
  const actual = Object.keys(args).sort()
  if (actual.join('\n') !== expected.sort().join('\n')) {
    fail(`verify arguments must be exactly: ${expected.map((name) => `--${name}`).join(', ')}`)
  }

  const environment = JSON.parse(await readFile(resolve(args.environment), 'utf8'))
  const release = await readJsonWithChecksum(
    args.release,
    args['release-checksum'],
    'target release',
  )
  const previousRelease = args['previous-release']
    ? await readJsonWithChecksum(
        args['previous-release'],
        args['previous-release-checksum'],
        'previous release',
      )
    : undefined

  const admission = createDeploymentAdmission({
    environment,
    release: release.value,
    releaseManifestSha256: release.digest,
    rollbackMode: args['rollback-mode'],
    previousRelease: previousRelease?.value,
    previousReleaseManifestSha256: previousRelease?.digest,
    evaluatedAt: args['evaluated-at'],
  })
  await writeJson(args.output, admission)
  process.stdout.write(
    `${JSON.stringify(
      {
        status: admission.status,
        schemaVersion: admission.schemaVersion,
        environment: admission.environment.deployment,
        release: {
          version: admission.release.version,
          revision: admission.release.source.revision,
          manifestSha256: admission.release.manifestSha256,
        },
        rollbackMode: admission.rollback.mode,
        output: resolve(args.output),
      },
      null,
      2,
    )}\n`,
  )
}

export const runDeploymentAdmissionCli = async ([command, ...values]) => {
  const args = parseArguments(values)
  if (command === 'verify') return commandVerify(args)
  fail('command must be verify')
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runDeploymentAdmissionCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
