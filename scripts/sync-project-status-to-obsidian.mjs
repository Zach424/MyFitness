import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const defaultObsidianTarget = '10_Projects/MyFitness/PROJECT_STATUS.md'
export const defaultStatusSource = resolve(repositoryRoot, 'docs/PROJECT_STATUS.md')

const fail = (message) => {
  throw new Error(message)
}

const exactObject = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`)
  }
  return value
}

export const selectObsidianVault = (value) => {
  const config = exactObject(value, 'Obsidian config')
  const vaults = exactObject(config.vaults, 'Obsidian config vaults')
  const candidates = Object.entries(vaults).map(([id, rawVault]) => {
    const vault = exactObject(rawVault, `Obsidian vault ${id}`)
    if (typeof vault.path !== 'string' || vault.path.trim() === '') {
      fail(`Obsidian vault ${id} path must be a non-empty string`)
    }
    if (vault.ts !== undefined && (!Number.isFinite(vault.ts) || vault.ts < 0)) {
      fail(`Obsidian vault ${id} timestamp must be a non-negative number`)
    }
    if (vault.open !== undefined && typeof vault.open !== 'boolean') {
      fail(`Obsidian vault ${id} open state must be boolean`)
    }
    return {
      id,
      path: resolve(vault.path),
      open: vault.open === true,
      timestamp: vault.ts ?? 0,
    }
  })

  if (candidates.length === 0) fail('Obsidian config does not contain a vault')
  candidates.sort(
    (left, right) =>
      Number(right.open) - Number(left.open) ||
      right.timestamp - left.timestamp ||
      left.path.localeCompare(right.path),
  )
  return candidates[0]
}

export const resolveVaultTarget = (vaultPath, target = defaultObsidianTarget) => {
  if (typeof vaultPath !== 'string' || vaultPath.trim() === '') {
    fail('Obsidian vault path must be a non-empty string')
  }
  if (typeof target !== 'string' || target.trim() === '') {
    fail('Obsidian target must be a non-empty relative path')
  }
  if (isAbsolute(target)) fail('Obsidian target must be relative to the selected vault')

  const exactVaultPath = resolve(vaultPath)
  const exactTargetPath = resolve(exactVaultPath, target)
  const relativeTarget = relative(exactVaultPath, exactTargetPath)
  if (
    relativeTarget === '' ||
    relativeTarget === '..' ||
    relativeTarget.startsWith(`..\\`) ||
    relativeTarget.startsWith('../') ||
    isAbsolute(relativeTarget)
  ) {
    fail('Obsidian target must remain inside the selected vault')
  }
  return exactTargetPath
}

const loadVaultFromConfig = async (configPath) => {
  let parsed
  try {
    parsed = JSON.parse(await readFile(configPath, 'utf8'))
  } catch (error) {
    fail(
      `Unable to read Obsidian config at ${configPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
  return selectObsidianVault(parsed)
}

export const discoverObsidianVault = async ({ appData, configPath, vaultPath } = {}) => {
  if (vaultPath) return { id: 'explicit', path: resolve(vaultPath), open: true, timestamp: 0 }
  const exactConfigPath = configPath
    ? resolve(configPath)
    : appData
      ? resolve(appData, 'obsidian', 'obsidian.json')
      : fail('APPDATA or an explicit Obsidian config/vault path is required')
  return loadVaultFromConfig(exactConfigPath)
}

const digest = (content) => createHash('sha256').update(content).digest('hex')

export const synchronizeProjectStatus = async ({
  mode = 'write',
  sourcePath = defaultStatusSource,
  target = defaultObsidianTarget,
  vaultPath,
}) => {
  if (!['write', 'verify'].includes(mode)) fail('mode must be one of: write, verify')
  if (typeof vaultPath !== 'string' || vaultPath.trim() === '') {
    fail('Obsidian vault path must be a non-empty string')
  }
  const exactSourcePath = resolve(sourcePath)
  const exactVaultPath = resolve(vaultPath)
  const vaultInfo = await stat(exactVaultPath).catch(() => null)
  if (!vaultInfo?.isDirectory()) fail(`Obsidian vault does not exist: ${exactVaultPath}`)

  const targetPath = resolveVaultTarget(exactVaultPath, target)
  const source = await readFile(exactSourcePath)
  if (mode === 'write') {
    await mkdir(dirname(targetPath), { recursive: true })
    await writeFile(targetPath, source)
  } else {
    const mirrored = await readFile(targetPath).catch(() => null)
    if (!mirrored || !source.equals(mirrored)) {
      fail(`Obsidian project status is missing or stale: ${targetPath}`)
    }
  }

  return {
    status: 'ok',
    mode,
    source: exactSourcePath,
    target: targetPath,
    bytes: source.byteLength,
    sha256: digest(source),
  }
}

const parseArguments = (values) => {
  const options = { mode: 'write' }
  const remaining = [...values]
  if (remaining[0] && !remaining[0].startsWith('--')) options.mode = remaining.shift()
  while (remaining.length > 0) {
    const key = remaining.shift()
    const value = remaining.shift()
    if (!value || value.startsWith('--')) fail(`${key} requires a value`)
    if (key === '--vault') options.vaultPath = value
    else if (key === '--config') options.configPath = value
    else if (key === '--source') options.sourcePath = value
    else if (key === '--target') options.target = value
    else fail(`unknown argument: ${key}`)
  }
  return options
}

export const runObsidianSyncCli = async (values, environment = process.env) => {
  const options = parseArguments(values)
  const vault = await discoverObsidianVault({
    appData: environment.APPDATA,
    configPath: options.configPath,
    vaultPath: options.vaultPath ?? environment.OBSIDIAN_VAULT_PATH,
  })
  const result = await synchronizeProjectStatus({
    mode: options.mode,
    sourcePath: options.sourcePath,
    target: options.target ?? environment.MYFITNESS_OBSIDIAN_STATUS_TARGET,
    vaultPath: vault.path,
  })
  process.stdout.write(`${JSON.stringify({ ...result, vaultId: vault.id }, null, 2)}\n`)
  return result
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runObsidianSyncCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
