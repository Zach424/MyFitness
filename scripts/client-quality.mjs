import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

export const clientQualityBudgetSchemaVersion = 'myfitness-client-quality-budget/v1'
export const clientQualityReportSchemaVersion = 'myfitness-client-quality/v1'

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

const requirePositiveInteger = (value, name) => {
  if (!Number.isInteger(value) || value < 1) fail(`${name} must be a positive integer`)
  return value
}

const requireMarkerList = (value, name) => {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.some((marker) => typeof marker !== 'string' || marker.length < 3)
  ) {
    fail(`${name} must be a non-empty string array`)
  }
  return value
}

export const parseClientQualityBudget = (value) => {
  requireExactKeys(value, ['schemaVersion', 'h5', 'weapp'], 'client quality budget')
  if (value.schemaVersion !== clientQualityBudgetSchemaVersion) {
    fail(`client quality budget schemaVersion must be ${clientQualityBudgetSchemaVersion}`)
  }
  requireExactKeys(
    value.h5,
    [
      'maxTotalBytes',
      'maxEntrypointBytes',
      'maxAsyncJavaScriptBytes',
      'forbiddenJavaScriptMarkers',
    ],
    'h5 budget',
  )
  requireExactKeys(
    value.weapp,
    ['maxTotalBytes', 'maxVendorBytes', 'maxPageJavaScriptBytes', 'forbiddenJavaScriptMarkers'],
    'weapp budget',
  )
  return {
    schemaVersion: value.schemaVersion,
    h5: {
      maxTotalBytes: requirePositiveInteger(value.h5.maxTotalBytes, 'h5.maxTotalBytes'),
      maxEntrypointBytes: requirePositiveInteger(
        value.h5.maxEntrypointBytes,
        'h5.maxEntrypointBytes',
      ),
      maxAsyncJavaScriptBytes: requirePositiveInteger(
        value.h5.maxAsyncJavaScriptBytes,
        'h5.maxAsyncJavaScriptBytes',
      ),
      forbiddenJavaScriptMarkers: requireMarkerList(
        value.h5.forbiddenJavaScriptMarkers,
        'h5.forbiddenJavaScriptMarkers',
      ),
    },
    weapp: {
      maxTotalBytes: requirePositiveInteger(value.weapp.maxTotalBytes, 'weapp.maxTotalBytes'),
      maxVendorBytes: requirePositiveInteger(value.weapp.maxVendorBytes, 'weapp.maxVendorBytes'),
      maxPageJavaScriptBytes: requirePositiveInteger(
        value.weapp.maxPageJavaScriptBytes,
        'weapp.maxPageJavaScriptBytes',
      ),
      forbiddenJavaScriptMarkers: requireMarkerList(
        value.weapp.forbiddenJavaScriptMarkers,
        'weapp.forbiddenJavaScriptMarkers',
      ),
    },
  }
}

const listFiles = async (root) => {
  const absoluteRoot = resolve(root)
  const rootStat = await lstat(absoluteRoot).catch(() => null)
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) {
    fail(`build root must be a real directory: ${absoluteRoot}`)
  }

  const files = []
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isSymbolicLink()) fail(`build output must not contain symlinks: ${path}`)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile()) files.push(path)
    }
  }
  await visit(absoluteRoot)
  return { absoluteRoot, files }
}

const safeAssetPath = (root, assetReference) => {
  const pathPart = assetReference.split(/[?#]/, 1)[0]
  if (!pathPart || /^(?:data:|https?:|\/\/)/i.test(pathPart)) return null
  const candidate = resolve(root, pathPart.replace(/^\/+/, ''))
  const rootPrefix = `${resolve(root)}${sep}`
  if (!candidate.startsWith(rootPrefix))
    fail(`entrypoint asset escapes build root: ${assetReference}`)
  return candidate
}

const sumFileBytes = async (files) => {
  let total = 0
  for (const file of files) total += (await lstat(file)).size
  return total
}

const scanForbiddenMarkers = async (files, markers, root) => {
  const matches = []
  for (const file of files.filter((path) => path.endsWith('.js'))) {
    const source = await readFile(file, 'utf8')
    for (const marker of markers) {
      if (source.includes(marker))
        matches.push({ file: relative(root, file).replaceAll('\\', '/'), marker })
    }
  }
  return matches
}

const measureH5 = async (root, budget) => {
  const tree = await listFiles(root)
  const indexPath = resolve(tree.absoluteRoot, 'index.html')
  const html = await readFile(indexPath, 'utf8').catch(() =>
    fail(`missing H5 entrypoint: ${indexPath}`),
  )
  const entrypointAssets = [
    ...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:[?#][^"']*)?)["']/g),
  ]
    .map((match) => safeAssetPath(tree.absoluteRoot, match[1]))
    .filter(Boolean)
  if (entrypointAssets.length < 1) fail('H5 index.html must reference JavaScript or CSS assets')
  for (const asset of entrypointAssets) {
    const stat = await lstat(asset).catch(() => null)
    if (!stat?.isFile() || stat.isSymbolicLink()) fail(`missing H5 entrypoint asset: ${asset}`)
  }

  const asyncJavaScript = tree.files.filter((file) => {
    const path = relative(tree.absoluteRoot, file).replaceAll('\\', '/')
    return path.startsWith('chunk/') && path.endsWith('.js')
  })
  if (asyncJavaScript.length < 1) fail('H5 build must contain asynchronous JavaScript chunks')
  const asyncSizes = await Promise.all(
    asyncJavaScript.map(async (file) => (await lstat(file)).size),
  )

  return {
    totalBytes: await sumFileBytes(tree.files),
    entrypointBytes: await sumFileBytes(entrypointAssets),
    maxAsyncJavaScriptBytes: Math.max(...asyncSizes),
    entrypointAssets: entrypointAssets.map((file) =>
      relative(tree.absoluteRoot, file).replaceAll('\\', '/'),
    ),
    forbiddenMarkerMatches: await scanForbiddenMarkers(
      tree.files,
      budget.forbiddenJavaScriptMarkers,
      tree.absoluteRoot,
    ),
  }
}

const measureWeapp = async (root, budget) => {
  const tree = await listFiles(root)
  const vendorPath = resolve(tree.absoluteRoot, 'vendors.js')
  const vendorStat = await lstat(vendorPath).catch(() => null)
  if (!vendorStat?.isFile() || vendorStat.isSymbolicLink()) {
    fail(`missing WeApp vendor bundle: ${vendorPath}`)
  }
  const pageJavaScript = tree.files.filter((file) => {
    const path = relative(tree.absoluteRoot, file).replaceAll('\\', '/')
    return path.startsWith('pages/') && path.endsWith('.js')
  })
  if (pageJavaScript.length < 1) fail('WeApp build must contain page JavaScript')
  const pageSizes = await Promise.all(pageJavaScript.map(async (file) => (await lstat(file)).size))

  return {
    totalBytes: await sumFileBytes(tree.files),
    vendorBytes: vendorStat.size,
    maxPageJavaScriptBytes: Math.max(...pageSizes),
    forbiddenMarkerMatches: await scanForbiddenMarkers(
      tree.files,
      budget.forbiddenJavaScriptMarkers,
      tree.absoluteRoot,
    ),
  }
}

const assertWithin = (actual, maximum, name) => {
  if (actual > maximum) fail(`${name} exceeds budget: ${actual} > ${maximum} bytes`)
}

export const verifyClientQuality = async ({ budgetPath, h5Root, weappRoot }) => {
  const budget = parseClientQualityBudget(JSON.parse(await readFile(resolve(budgetPath), 'utf8')))
  const [h5, weapp] = await Promise.all([
    measureH5(h5Root, budget.h5),
    measureWeapp(weappRoot, budget.weapp),
  ])

  assertWithin(h5.totalBytes, budget.h5.maxTotalBytes, 'H5 total')
  assertWithin(h5.entrypointBytes, budget.h5.maxEntrypointBytes, 'H5 entrypoint')
  assertWithin(
    h5.maxAsyncJavaScriptBytes,
    budget.h5.maxAsyncJavaScriptBytes,
    'H5 largest async JavaScript',
  )
  assertWithin(weapp.totalBytes, budget.weapp.maxTotalBytes, 'WeApp total')
  assertWithin(weapp.vendorBytes, budget.weapp.maxVendorBytes, 'WeApp vendors.js')
  assertWithin(
    weapp.maxPageJavaScriptBytes,
    budget.weapp.maxPageJavaScriptBytes,
    'WeApp largest page JavaScript',
  )
  if (h5.forbiddenMarkerMatches.length > 0 || weapp.forbiddenMarkerMatches.length > 0) {
    fail(
      `client bundles contain forbidden validation runtime markers: ${JSON.stringify({ h5: h5.forbiddenMarkerMatches, weapp: weapp.forbiddenMarkerMatches })}`,
    )
  }

  return {
    schemaVersion: clientQualityReportSchemaVersion,
    checkedAt: new Date().toISOString(),
    budget,
    measurements: { h5, weapp },
    status: 'passed',
  }
}

const parseArguments = (values) => {
  const args = {}
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index]
    const value = values[index + 1]
    if (!key?.startsWith('--') || !value) fail(`invalid argument sequence near ${key ?? 'end'}`)
    args[key.slice(2)] = value
  }
  return args
}

const run = async () => {
  const [command, ...values] = process.argv.slice(2)
  if (command !== 'verify')
    fail(
      'usage: client-quality.mjs verify --budget PATH --h5-root PATH --weapp-root PATH [--output PATH]',
    )
  const args = parseArguments(values)
  if (!args.budget || !args['h5-root'] || !args['weapp-root']) {
    fail('verify requires --budget, --h5-root and --weapp-root')
  }
  const report = await verifyClientQuality({
    budgetPath: args.budget,
    h5Root: args['h5-root'],
    weappRoot: args['weapp-root'],
  })
  const serialized = `${JSON.stringify(report, null, 2)}\n`
  if (args.output) {
    const outputPath = resolve(args.output)
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, serialized, { flag: 'w' })
  }
  process.stdout.write(serialized)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
