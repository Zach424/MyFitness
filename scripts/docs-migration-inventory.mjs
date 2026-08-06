import { readFile, readdir } from 'node:fs/promises'
import { basename, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

export const documentationMigrationPolicy = {
  schemaVersion: 'myfitness-documentation-migration-index/v1',
  indexPath: 'docs/DOCUMENTATION_MIGRATION_INDEX.md',
  activePaths: [
    'docs/PROJECT_STATUS.md',
    'docs/product/ROADMAP.md',
    'docs/product/PRODUCT_BRIEF.md',
    'docs/product/RISK_REGISTER.md',
    'docs/architecture/ARCHITECTURE.md',
    'docs/operations/USER_IDENTITY_RUNBOOK.md',
    'docs/DOCUMENTATION_MIGRATION_INDEX.md',
  ],
  governancePaths: ['docs/DOCUMENTATION_LANGUAGE_POLICY.md'],
  topicBatches: [
    {
      id: 'topic-product-design',
      label: '产品、设计与 API 说明',
      status: 'pending',
      paths: ['docs/api/README.md', 'docs/design/DESIGN_SYSTEM.md'],
    },
    {
      id: 'topic-architecture-models',
      label: '专题架构模型',
      status: 'pending',
      paths: [
        'docs/architecture/ADMIN_SUPPORT_MODEL.md',
        'docs/architecture/AI_EXPLANATION_MODEL.md',
        'docs/architecture/FOOD_PHOTO_MODEL.md',
        'docs/architecture/HEALTH_RECORD_MODEL.md',
        'docs/architecture/IDENTITY_PROFILE_MODEL.md',
        'docs/architecture/NUTRITION_MODEL.md',
        'docs/architecture/OPERATIONS_PERIMETER.md',
        'docs/architecture/PLAN_MODEL.md',
        'docs/architecture/PRIVACY_OWNERSHIP_MODEL.md',
        'docs/architecture/PROGRESS_PHOTO_MODEL.md',
        'docs/architecture/WORKOUT_MODEL.md',
      ],
    },
    {
      id: 'topic-operations-runbooks',
      label: '剩余运行手册',
      status: 'pending',
      paths: [
        'docs/operations/ADMIN_ACCESS_RUNBOOK.md',
        'docs/operations/API_OPERATIONS_RUNBOOK.md',
        'docs/operations/DATA_CUSTODY_RUNBOOK.md',
        'docs/operations/DEPLOYMENT_RUNBOOK.md',
      ],
    },
  ],
  historicalBatches: [
    {
      id: 'iterations-000-029',
      label: '迭代档案 000–029',
      status: 'pending',
      directory: 'docs/iterations',
      minimumNumber: 0,
      maximumNumber: 29,
    },
    {
      id: 'iterations-030-059',
      label: '迭代档案 030–059',
      status: 'pending',
      directory: 'docs/iterations',
      minimumNumber: 30,
      maximumNumber: 59,
    },
    {
      id: 'iterations-060-089',
      label: '迭代档案 060–089',
      status: 'pending',
      directory: 'docs/iterations',
      minimumNumber: 60,
      maximumNumber: 89,
    },
    {
      id: 'decisions-0001-0028',
      label: '架构决策 0001–0028',
      status: 'pending',
      directory: 'docs/architecture/decisions',
      minimumNumber: 1,
      maximumNumber: 28,
    },
    {
      id: 'decisions-0029-0056',
      label: '架构决策 0029–0056',
      status: 'pending',
      directory: 'docs/architecture/decisions',
      minimumNumber: 29,
      maximumNumber: 56,
    },
    {
      id: 'decisions-0057-0084',
      label: '架构决策 0057–0084',
      status: 'pending',
      directory: 'docs/architecture/decisions',
      minimumNumber: 57,
      maximumNumber: 84,
    },
  ],
  protectedSeries: [
    {
      id: 'iterations-current',
      label: '第 090 轮起的迭代档案',
      directory: 'docs/iterations',
      minimumNumber: 90,
    },
    {
      id: 'decisions-current',
      label: 'ADR-0085 起的架构决策',
      directory: 'docs/architecture/decisions',
      minimumNumber: 85,
    },
  ],
}

const fail = (message) => {
  throw new Error(message)
}

const normalizeRelativePath = (root, path) => relative(root, path).split(sep).join('/')

const markdownFiles = async (root) => {
  const found = []
  const visit = async (directory) => {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile() && entry.name.endsWith('.md')) {
        found.push(normalizeRelativePath(root, path))
      }
    }
  }
  await visit(resolve(root, 'docs'))
  return found.sort((left, right) => left.localeCompare(right))
}

const numberedEntry = (path, directory) => {
  if (!path.startsWith(`${directory}/`)) return undefined
  const name = path.slice(directory.length + 1)
  if (name.includes('/')) return undefined
  const match = name.match(/^(\d{3,4})-.+\.md$/)
  if (!match) return undefined
  return { path, number: Number.parseInt(match[1], 10) }
}

const addClassification = (classifications, path, classification) => {
  const current = classifications.get(path) ?? []
  current.push(classification)
  classifications.set(path, current)
}

const verifyExactRange = (entries, batch) => {
  const byNumber = new Map()
  for (const entry of entries) {
    const current = byNumber.get(entry.number) ?? []
    current.push(entry.path)
    byNumber.set(entry.number, current)
  }
  for (let number = batch.minimumNumber; number <= batch.maximumNumber; number += 1) {
    const paths = byNumber.get(number) ?? []
    if (paths.length === 0) fail(`${batch.id} 缺少编号 ${number}`)
    if (paths.length > 1) fail(`${batch.id} 的编号 ${number} 重复：${paths.join('；')}`)
  }
}

const verifyProtectedSeries = (entries, series) => {
  const protectedEntries = entries.filter((entry) => entry.number >= series.minimumNumber)
  if (protectedEntries.length === 0) fail(`${series.id} 没有受保护记录`)
  const maximumNumber = Math.max(...protectedEntries.map((entry) => entry.number))
  verifyExactRange(protectedEntries, { ...series, maximumNumber })
  return { ...series, maximumNumber, count: protectedEntries.length }
}

export const verifyDocumentationMigrationInventory = async (
  root = repositoryRoot,
  policy = documentationMigrationPolicy,
) => {
  const files = await markdownFiles(root)
  const fileSet = new Set(files)
  const classifications = new Map(files.map((path) => [path, []]))

  const explicitGroups = [
    { id: 'active', paths: policy.activePaths },
    { id: 'governance', paths: policy.governancePaths },
    ...policy.topicBatches.map((batch) => ({ id: batch.id, paths: batch.paths })),
  ]
  for (const group of explicitGroups) {
    for (const path of group.paths) {
      if (!fileSet.has(path)) fail(`${group.id} 缺少已登记文档：${path}`)
      addClassification(classifications, path, group.id)
    }
  }

  const numberedDirectories = new Set([
    ...policy.historicalBatches.map((batch) => batch.directory),
    ...policy.protectedSeries.map((series) => series.directory),
  ])
  const numberedByDirectory = new Map()
  for (const directory of numberedDirectories) {
    numberedByDirectory.set(
      directory,
      files.map((path) => numberedEntry(path, directory)).filter(Boolean),
    )
  }

  for (const batch of policy.historicalBatches) {
    const entries = (numberedByDirectory.get(batch.directory) ?? []).filter(
      (entry) => entry.number >= batch.minimumNumber && entry.number <= batch.maximumNumber,
    )
    verifyExactRange(entries, batch)
    for (const entry of entries) addClassification(classifications, entry.path, batch.id)
  }

  const protectedSeries = policy.protectedSeries.map((series) => {
    const entries = numberedByDirectory.get(series.directory) ?? []
    const result = verifyProtectedSeries(entries, series)
    for (const entry of entries.filter((candidate) => candidate.number >= series.minimumNumber)) {
      addClassification(classifications, entry.path, series.id)
    }
    return result
  })

  const unclassified = []
  const overlapping = []
  for (const [path, assigned] of classifications) {
    if (assigned.length === 0) unclassified.push(path)
    else if (assigned.length > 1) overlapping.push(`${path}（${assigned.join('、')}）`)
  }
  if (unclassified.length > 0) fail(`存在未归类 Markdown：${unclassified.join('；')}`)
  if (overlapping.length > 0) fail(`存在重复归类 Markdown：${overlapping.join('；')}`)

  const pendingTopicFiles = policy.topicBatches
    .filter((batch) => batch.status === 'pending')
    .reduce((total, batch) => total + batch.paths.length, 0)
  const pendingHistoricalFiles = policy.historicalBatches
    .filter((batch) => batch.status === 'pending')
    .reduce((total, batch) => total + batch.maximumNumber - batch.minimumNumber + 1, 0)
  const pendingTotal = pendingTopicFiles + pendingHistoricalFiles
  const index = await readFile(resolve(root, policy.indexPath), 'utf8')
  const requiredTokens = [
    '# 中文文档迁移索引',
    `Schema：\`${policy.schemaVersion}\``,
    `受保护活跃文档：${policy.activePaths.length} 份。`,
    `待迁移总量：${pendingTotal} 份（专题 ${pendingTopicFiles} 份，历史 ${pendingHistoricalFiles} 份）。`,
    ...policy.topicBatches.map((batch) => `\`${batch.id}\``),
    ...policy.historicalBatches.map((batch) => `\`${batch.id}\``),
    ...policy.topicBatches.flatMap((batch) =>
      batch.paths.map((path) => `](${path.replace(/^docs\//, '')})`),
    ),
  ]
  const missingTokens = requiredTokens.filter((token) => !index.includes(token))
  if (missingTokens.length > 0) {
    fail(`迁移索引缺少受控标记：${missingTokens.join('；')}`)
  }

  return {
    status: '通过',
    schemaVersion: policy.schemaVersion,
    totalMarkdownFiles: files.length,
    activeDocuments: policy.activePaths.length,
    governanceDocuments: policy.governancePaths.length,
    protectedSeries,
    pending: {
      topicFiles: pendingTopicFiles,
      historicalFiles: pendingHistoricalFiles,
      totalFiles: pendingTotal,
    },
    topicBatches: policy.topicBatches.map((batch) => ({
      id: batch.id,
      status: batch.status,
      count: batch.paths.length,
    })),
    historicalBatches: policy.historicalBatches.map((batch) => ({
      id: batch.id,
      status: batch.status,
      count: batch.maximumNumber - batch.minimumNumber + 1,
    })),
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  verifyDocumentationMigrationInventory()
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(
        `文档迁移索引检查失败（${basename(process.argv[1])}）：${error instanceof Error ? error.message : String(error)}\n`,
      )
      process.exitCode = 1
    })
}
