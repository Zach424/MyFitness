import { mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

// 生产检查器保持为无第三方依赖的 ESM JavaScript。
// @ts-expect-error ESM 脚本不单独发布类型声明
import { verifyDocumentationMigrationInventory } from './docs-migration-inventory.mjs'

const temporaryRoots: string[] = []

const policy = {
  schemaVersion: 'myfitness-documentation-migration-index/v1',
  indexPath: 'docs/DOCUMENTATION_MIGRATION_INDEX.md',
  activePaths: ['docs/active.md', 'docs/DOCUMENTATION_MIGRATION_INDEX.md'],
  governancePaths: ['docs/policy.md'],
  topicBatches: [
    {
      id: 'topic-one',
      label: '专题一',
      status: 'pending',
      paths: ['docs/topic.md'],
    },
  ],
  historicalBatches: [
    {
      id: 'iterations-old',
      label: '旧迭代',
      status: 'pending',
      directory: 'docs/iterations',
      minimumNumber: 0,
      maximumNumber: 1,
    },
    {
      id: 'decisions-old',
      label: '旧决策',
      status: 'pending',
      directory: 'docs/architecture/decisions',
      minimumNumber: 1,
      maximumNumber: 2,
    },
  ],
  protectedSeries: [
    {
      id: 'iterations-current',
      label: '当前迭代',
      directory: 'docs/iterations',
      minimumNumber: 90,
    },
    {
      id: 'decisions-current',
      label: '当前决策',
      directory: 'docs/architecture/decisions',
      minimumNumber: 85,
    },
  ],
}

const write = async (root: string, path: string, content = '# 文档\n') => {
  const target = resolve(root, path)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, content)
}

const fixture = async () => {
  const root = resolve(tmpdir(), `myfitness-doc-inventory-${crypto.randomUUID()}`)
  temporaryRoots.push(root)
  await Promise.all([
    write(root, 'docs/active.md'),
    write(root, 'docs/policy.md'),
    write(root, 'docs/topic.md'),
    write(root, 'docs/iterations/000-zero.md'),
    write(root, 'docs/iterations/001-one.md'),
    write(root, 'docs/iterations/090-current.md'),
    write(root, 'docs/architecture/decisions/0001-one.md'),
    write(root, 'docs/architecture/decisions/0002-two.md'),
    write(root, 'docs/architecture/decisions/0085-current.md'),
    write(
      root,
      'docs/DOCUMENTATION_MIGRATION_INDEX.md',
      '# 中文文档迁移索引\n\nSchema：`myfitness-documentation-migration-index/v1`\n\n受保护活跃文档：2 份。\n\n待迁移总量：5 份（专题 1 份，历史 4 份）。\n\n`topic-one` [专题](topic.md)\n\n`iterations-old`\n\n`decisions-old`\n',
    ),
  ])
  return root
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })))
})

describe('文档迁移索引', () => {
  it('接受每份 Markdown 恰好归类一次的连续清单', async () => {
    const result = await verifyDocumentationMigrationInventory(await fixture(), policy)

    expect(result).toMatchObject({
      status: '通过',
      totalMarkdownFiles: 10,
      activeDocuments: 2,
      governanceDocuments: 1,
      pending: { topicFiles: 1, historicalFiles: 4, totalFiles: 5 },
    })
    expect(result.protectedSeries).toEqual([
      expect.objectContaining({ id: 'iterations-current', count: 1, maximumNumber: 90 }),
      expect.objectContaining({ id: 'decisions-current', count: 1, maximumNumber: 85 }),
    ])
  })

  it('拒绝未登记的新 Markdown 文件', async () => {
    const root = await fixture()
    await write(root, 'docs/untracked.md')

    await expect(verifyDocumentationMigrationInventory(root, policy)).rejects.toThrow(
      '存在未归类 Markdown',
    )
  })

  it('拒绝历史编号缺口', async () => {
    const root = await fixture()
    await unlink(resolve(root, 'docs/iterations/001-one.md'))

    await expect(verifyDocumentationMigrationInventory(root, policy)).rejects.toThrow(
      'iterations-old 缺少编号 1',
    )
  })

  it('拒绝同一文档被两个范围重复归类', async () => {
    const root = await fixture()
    const overlappingPolicy = {
      ...policy,
      topicBatches: [
        {
          ...policy.topicBatches[0],
          paths: ['docs/topic.md', 'docs/active.md'],
        },
      ],
    }

    await expect(verifyDocumentationMigrationInventory(root, overlappingPolicy)).rejects.toThrow(
      '存在重复归类 Markdown',
    )
  })

  it('拒绝陈旧的索引计数或批次标记', async () => {
    const root = await fixture()
    await write(
      root,
      'docs/DOCUMENTATION_MIGRATION_INDEX.md',
      '# 中文文档迁移索引\n\nSchema：`myfitness-documentation-migration-index/v1`\n\n待迁移总量：3 份（专题 1 份，历史 2 份）。\n',
    )

    await expect(verifyDocumentationMigrationInventory(root, policy)).rejects.toThrow(
      '迁移索引缺少受控标记',
    )
  })

  it('拒绝陈旧的活跃文档计数', async () => {
    const root = await fixture()
    const indexPath = resolve(root, 'docs/DOCUMENTATION_MIGRATION_INDEX.md')
    const staleIndex = (await readFile(indexPath, 'utf8')).replace(
      '受保护活跃文档：2 份。',
      '受保护活跃文档：1 份。',
    )
    await writeFile(indexPath, staleIndex)

    await expect(verifyDocumentationMigrationInventory(root, policy)).rejects.toThrow(
      '迁移索引缺少受控标记',
    )
  })
})
