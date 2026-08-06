import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

// 生产检查器保持为无第三方依赖的 ESM JavaScript。
// @ts-expect-error ESM 脚本不单独发布类型声明
import {
  findEnglishOnlyNarrativeLines,
  measureChineseNarrative,
  verifyChineseDocumentation,
} from './docs-language-policy.mjs'

const temporaryRoots: string[] = []

const fixture = async (record: string) => {
  const root = resolve(tmpdir(), `myfitness-doc-language-${crypto.randomUUID()}`)
  temporaryRoots.push(root)
  await mkdir(resolve(root, 'docs', 'iterations'), { recursive: true })
  await mkdir(resolve(root, 'docs', 'architecture', 'decisions'), { recursive: true })
  await writeFile(resolve(root, 'docs', 'active.md'), '# 项目状态\n\n## 当前状态\n')
  await writeFile(resolve(root, 'docs', 'iterations', '090-record.md'), record)
  await writeFile(resolve(root, 'docs', 'architecture', 'decisions', '0085-record.md'), record)
  return root
}

const policy = {
  activeDocuments: [{ path: 'docs/active.md', headings: ['# 项目状态', '## 当前状态'] }],
  recordSeries: [
    { directory: 'docs/iterations', minimumNumber: 90, label: '迭代档案', requireMetadata: true },
    {
      directory: 'docs/architecture/decisions',
      minimumNumber: 85,
      label: '架构决策',
      requireMetadata: true,
    },
  ],
  minimumHanCharacters: 20,
  minimumHanShare: 0.6,
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })))
})

describe('中文文档策略', () => {
  it('忽略代码字面量和链接后计算中文正文占比', () => {
    expect(
      measureChineseNarrative(
        '中文说明用于验证。`VERY_LONG_ENGLISH_IDENTIFIER` [链接](https://example.com)',
      ),
    ).toMatchObject({ hanCharacters: 8, latinCharacters: 0, hanShare: 1 })
  })

  it('识别纯英文叙述行但允许中文句子中的技术字面量', () => {
    expect(
      findEnglishOnlyNarrativeLines(
        '- Taro client uses React and TypeScript.\n- 客户端使用 Taro、React 与 TypeScript。\n```ts\nconst englishCode = true\n```\n',
      ),
    ).toEqual([
      {
        line: 1,
        latinWords: ['Taro', 'client', 'uses', 'React', 'and', 'TypeScript'],
        text: '- Taro client uses React and TypeScript.',
      },
    ])
  })

  it('接受带中文元数据且正文以中文为主的新记录', async () => {
    const root = await fixture(
      '# 第 090 轮：中文记录\n\n日期：2026-08-05\n\n状态：已完成\n\n这是一段用于验证权威记录语言约束的中文正文，保留 `OIDC` 等代码字面量。\n',
    )

    const result = await verifyChineseDocumentation(root, policy)
    expect(result).toMatchObject({
      status: '通过',
      activeDocuments: [{ path: 'docs/active.md', headings: 2 }],
    })
    expect(result.records).toHaveLength(2)
    expect(result.records).toContainEqual(
      expect.objectContaining({ path: 'docs/iterations/090-record.md' }),
    )
    expect(result.records).toContainEqual(
      expect.objectContaining({ path: 'docs/architecture/decisions/0085-record.md' }),
    )
  })

  it('拒绝英文元数据和以英文为主的新记录', async () => {
    const root = await fixture(
      '# Iteration 090\n\nDate: 2026-08-05\n\nStatus: done\n\nThis record is intentionally written in English only.\n',
    )

    await expect(verifyChineseDocumentation(root, policy)).rejects.toThrow('一级标题必须包含中文')
  })

  it('拒绝活跃权威文档恢复为英文导航标题', async () => {
    const root = await fixture(
      '# 第 090 轮：中文记录\n\n日期：2026-08-05\n\n状态：已完成\n\n这是一段用于验证权威记录语言约束的中文正文，确保中文字符数量足够。\n',
    )
    await writeFile(resolve(root, 'docs', 'active.md'), '# Project status\n\n## Current state\n')

    await expect(verifyChineseDocumentation(root, policy)).rejects.toThrow('缺少中文权威标题')
  })

  it('拒绝活跃权威文档中的纯英文叙述正文', async () => {
    const root = await fixture(
      '# 第 090 轮：中文记录\n\n日期：2026-08-05\n\n状态：已完成\n\n这是一段用于验证权威记录语言约束的中文正文，确保中文字符数量足够。\n',
    )
    await writeFile(
      resolve(root, 'docs', 'active.md'),
      '# 项目状态\n\n## 当前状态\n\n- This paragraph remains English prose.\n',
    )
    const strictPolicy = {
      ...policy,
      activeDocuments: [
        {
          path: 'docs/active.md',
          headings: ['# 项目状态', '## 当前状态'],
          rejectEnglishOnlyNarrativeLines: true,
        },
      ],
    }

    await expect(verifyChineseDocumentation(root, strictPolicy)).rejects.toThrow('纯英文叙述')
  })

  it('拒绝活跃权威文档缺失受控正文标记', async () => {
    const root = await fixture(
      '# 第 090 轮：中文记录\n\n日期：2026-08-05\n\n状态：已完成\n\n这是一段用于验证权威记录语言约束的中文正文，确保中文字符数量足够。\n',
    )
    const strictPolicy = {
      ...policy,
      activeDocuments: [
        {
          path: 'docs/active.md',
          headings: ['# 项目状态', '## 当前状态'],
          requiredTokens: ['最后审阅：'],
        },
      ],
    }

    await expect(verifyChineseDocumentation(root, strictPolicy)).rejects.toThrow('缺少受控正文标记')
  })

  it('拒绝活跃权威文档包含禁用正文标记', async () => {
    const root = await fixture(
      '# 第 090 轮：中文记录\n\n日期：2026-08-05\n\n状态：已完成\n\n这是一段用于验证权威记录语言约束的中文正文，确保中文字符数量足够。\n',
    )
    await writeFile(
      resolve(root, 'docs', 'active.md'),
      '# 项目状态\n\n## 当前状态\n\n| 风险 | High |\n',
    )
    const strictPolicy = {
      ...policy,
      activeDocuments: [
        {
          path: 'docs/active.md',
          headings: ['# 项目状态', '## 当前状态'],
          forbiddenTokens: ['| High'],
        },
      ],
    }

    await expect(verifyChineseDocumentation(root, strictPolicy)).rejects.toThrow('禁用正文标记')
  })
})
