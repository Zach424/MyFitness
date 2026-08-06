import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'

export const oidcE2eArtifactSchemaVersion = 'myfitness-oidc-e2e-artifact/v1'

const requiredFiles = ['index.html', 'auth/callback/index.html', 'auth/callback/redirect.js']

const fail = (message) => {
  throw new Error(message)
}

const exactKeys = (value, expected) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('OIDC E2E build receipt must be an object')
  }
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.join('\n') !== wanted.join('\n')) {
    fail(`OIDC E2E build receipt keys must be exactly: ${wanted.join(', ')}`)
  }
}

const collectFiles = async (buildRoot) => {
  const root = resolve(buildRoot)
  const files = []
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isSymbolicLink()) fail(`OIDC E2E build must not contain symlinks: ${path}`)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile()) files.push(path)
    }
  }
  await visit(root).catch((error) => {
    if (error?.code === 'ENOENT') fail(`OIDC E2E build root is missing: ${root}`)
    throw error
  })
  return { root, files: files.sort() }
}

const requireCallbackBoundary = async (buildRoot) => {
  for (const requiredFile of requiredFiles) {
    const path = resolve(buildRoot, requiredFile)
    const bytes = await readFile(path).catch((error) => {
      if (error?.code === 'ENOENT') fail(`OIDC E2E build is missing ${requiredFile}`)
      throw error
    })
    if (bytes.length === 0) fail(`OIDC E2E build file is empty: ${requiredFile}`)
  }
}

export const hashOidcE2eTree = async (buildRoot) => {
  const tree = await collectFiles(buildRoot)
  const hash = createHash('sha256')
  hash.update('myfitness-oidc-e2e-tree/v1\0')
  for (const path of tree.files) {
    const name = relative(tree.root, path).split(sep).join('/')
    const bytes = await readFile(path)
    hash.update(`${name}\0${bytes.length}\0`)
    hash.update(bytes)
    hash.update('\0')
  }
  return `sha256:${hash.digest('hex')}`
}

const validateReceipt = (value, apiBaseUrl) => {
  exactKeys(value, ['schemaVersion', 'authMode', 'apiBaseUrl', 'treeSha256'])
  if (value.schemaVersion !== oidcE2eArtifactSchemaVersion) {
    fail('OIDC E2E build receipt schemaVersion is unsupported')
  }
  if (value.authMode !== 'oidc') fail('OIDC E2E build receipt authMode must be oidc')
  if (value.apiBaseUrl !== apiBaseUrl) {
    fail(`OIDC E2E build API base does not match: ${value.apiBaseUrl} !== ${apiBaseUrl}`)
  }
  if (typeof value.treeSha256 !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value.treeSha256)) {
    fail('OIDC E2E build treeSha256 must be a SHA-256 digest')
  }
  return value
}

export const removeOidcE2eArtifact = async (receiptPath) => {
  await rm(resolve(receiptPath), { force: true })
}

export const writeOidcE2eArtifact = async ({ buildRoot, receiptPath, apiBaseUrl }) => {
  await requireCallbackBoundary(buildRoot)
  const receipt = {
    schemaVersion: oidcE2eArtifactSchemaVersion,
    authMode: 'oidc',
    apiBaseUrl,
    treeSha256: await hashOidcE2eTree(buildRoot),
  }
  await mkdir(dirname(resolve(receiptPath)), { recursive: true })
  await writeFile(resolve(receiptPath), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8')
  return receipt
}

export const verifyOidcE2eArtifact = async ({ buildRoot, receiptPath, apiBaseUrl }) => {
  await requireCallbackBoundary(buildRoot)
  const receiptText = await readFile(resolve(receiptPath), 'utf8').catch((error) => {
    if (error?.code === 'ENOENT') {
      fail('OIDC E2E build receipt is missing; run pnpm build:h5:oidc before the browser runner')
    }
    throw error
  })
  let receipt
  try {
    receipt = JSON.parse(receiptText)
  } catch {
    fail('OIDC E2E build receipt must be valid JSON')
  }
  validateReceipt(receipt, apiBaseUrl)
  const treeSha256 = await hashOidcE2eTree(buildRoot)
  if (receipt.treeSha256 !== treeSha256) {
    fail('OIDC E2E build tree digest does not match; rebuild with pnpm build:h5:oidc')
  }
  return receipt
}
