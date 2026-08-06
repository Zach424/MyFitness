import { readFile, readdir } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

export const chineseDocumentationPolicy = {
  activeDocuments: [
    {
      path: 'docs/PROJECT_STATUS.md',
      headings: [
        '# 项目状态',
        '## 产品目标',
        '## 模块状态',
        '## 当前架构',
        '## 当前风险',
        '## 质量门禁',
        '## 首要下一步',
      ],
      minimumHanShare: 0.72,
      rejectEnglishOnlyNarrativeLines: true,
    },
    {
      path: 'docs/product/ROADMAP.md',
      headings: ['# 交付路线图', '## 发布门禁', '## 变更控制'],
    },
    {
      path: 'docs/architecture/ARCHITECTURE.md',
      headings: [
        '# 架构基线',
        '## 系统形态',
        '## 仓库边界',
        '## 交付架构',
        '## 数据规则',
        '## API 与事件约定',
        '## AI 执行路径',
        '## 安全与隐私基线',
        '## 初始本地与生产目标',
      ],
    },
    {
      path: 'docs/operations/USER_IDENTITY_RUNBOOK.md',
      headings: [
        '# 用户身份运行手册',
        '## 信任边界',
        '## 配置',
        '## 共享环境预检',
        '## 事件与轮换',
        '## 回滚',
        '## 主要参考',
      ],
    },
  ],
  recordSeries: [
    {
      directory: 'docs/iterations',
      minimumNumber: 90,
      label: '迭代档案',
      requireMetadata: true,
    },
    {
      directory: 'docs/architecture/decisions',
      minimumNumber: 85,
      label: '架构决策',
      requireMetadata: true,
    },
  ],
  minimumHanCharacters: 200,
  minimumHanShare: 0.6,
}

const fail = (message) => {
  throw new Error(message)
}

const naturalLanguageOnly = (text) =>
  text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\r\n]*`/g, '')
    .replace(/!??\[[^\]]*\]\([^\r\n)]*\)/g, '')
    .replace(/https?:\/\/\S+/g, '')

export const findEnglishOnlyNarrativeLines = (text) => {
  const lines = text.split(/\r?\n/)
  const findings = []
  let inFence = false
  for (const [index, line] of lines.entries()) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence || /^\s*\|?\s*:?-{3,}/.test(line)) continue
    const narrative = naturalLanguageOnly(line)
    const hanCharacters = [...narrative.matchAll(/\p{Script=Han}/gu)].length
    const latinWords = [...narrative.matchAll(/[A-Za-z]{2,}/g)].map((match) => match[0])
    if (hanCharacters === 0 && latinWords.length >= 3) {
      findings.push({ line: index + 1, latinWords, text: line.trim() })
    }
  }
  return findings
}

export const measureChineseNarrative = (text) => {
  const narrative = naturalLanguageOnly(text)
  const hanCharacters = [...narrative.matchAll(/\p{Script=Han}/gu)].length
  const latinCharacters = [...narrative.matchAll(/[A-Za-z]/g)].length
  const measuredCharacters = hanCharacters + latinCharacters
  return {
    hanCharacters,
    latinCharacters,
    hanShare: measuredCharacters === 0 ? 0 : hanCharacters / measuredCharacters,
  }
}

const numberedMarkdownFiles = async (root, series) => {
  const directory = resolve(root, series.directory)
  const entries = await readdir(directory, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && /^\d{3,4}-.+\.md$/.test(entry.name))
    .map((entry) => {
      const number = entry.name.match(/^(\d{3,4})-/)?.[1]
      return {
        path: resolve(directory, entry.name),
        relativePath: `${series.directory}/${entry.name}`,
        number: Number.parseInt(number, 10),
      }
    })
    .filter((entry) => entry.number >= series.minimumNumber)
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
}

const verifyActiveDocument = async (root, document) => {
  const text = await readFile(resolve(root, document.path), 'utf8')
  const actualHeadings = new Set(
    text
      .split(/\r?\n/)
      .filter((line) => /^#{1,3} /.test(line))
      .map((line) => line.trim()),
  )
  const missing = document.headings.filter((heading) => !actualHeadings.has(heading))
  if (missing.length > 0) {
    fail(`${document.path} 缺少中文权威标题：${missing.join('；')}`)
  }
  const measurement = measureChineseNarrative(text)
  if (document.minimumHanShare && measurement.hanShare < document.minimumHanShare) {
    fail(
      `${document.path} 中文占比不足：${measurement.hanShare.toFixed(3)} < ${document.minimumHanShare}`,
    )
  }
  const englishOnlyNarrativeLines = document.rejectEnglishOnlyNarrativeLines
    ? findEnglishOnlyNarrativeLines(text)
    : []
  if (englishOnlyNarrativeLines.length > 0) {
    const samples = englishOnlyNarrativeLines
      .slice(0, 5)
      .map((finding) => `第 ${finding.line} 行`)
      .join('、')
    fail(`${document.path} 仍有 ${englishOnlyNarrativeLines.length} 行纯英文叙述（${samples}）`)
  }
  return {
    path: document.path,
    headings: document.headings.length,
    ...measurement,
    englishOnlyNarrativeLines: englishOnlyNarrativeLines.length,
  }
}

const verifyChineseRecord = async (entry, series, policy) => {
  const text = await readFile(entry.path, 'utf8')
  if (!/^# .*[\p{Script=Han}]/mu.test(text)) {
    fail(`${entry.relativePath} 的一级标题必须包含中文`)
  }
  if (series.requireMetadata) {
    if (!/^日期：\d{4}-\d{2}-\d{2}\s*$/mu.test(text)) {
      fail(`${entry.relativePath} 必须使用“日期：YYYY-MM-DD”`)
    }
    if (!/^状态：\S.*$/mu.test(text)) {
      fail(`${entry.relativePath} 必须使用中文“状态：”字段`)
    }
  }

  const measurement = measureChineseNarrative(text)
  if (measurement.hanCharacters < policy.minimumHanCharacters) {
    fail(
      `${entry.relativePath} 中文正文不足：${measurement.hanCharacters} < ${policy.minimumHanCharacters}`,
    )
  }
  if (measurement.hanShare < policy.minimumHanShare) {
    fail(
      `${entry.relativePath} 中文占比不足：${measurement.hanShare.toFixed(3)} < ${policy.minimumHanShare}`,
    )
  }
  return { path: entry.relativePath, ...measurement }
}

export const verifyChineseDocumentation = async (
  root = repositoryRoot,
  policy = chineseDocumentationPolicy,
) => {
  const activeDocuments = await Promise.all(
    policy.activeDocuments.map((document) => verifyActiveDocument(root, document)),
  )
  const records = []
  for (const series of policy.recordSeries) {
    const entries = await numberedMarkdownFiles(root, series)
    if (entries.length === 0) {
      fail(`${series.label}没有编号不小于 ${series.minimumNumber} 的受检文件`)
    }
    for (const entry of entries) {
      records.push(await verifyChineseRecord(entry, series, policy))
    }
  }
  return {
    status: '通过',
    schemaVersion: 'myfitness-chinese-documentation/v2',
    activeDocuments,
    records,
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  verifyChineseDocumentation()
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(
        `中文文档检查失败（${basename(process.argv[1])}）：${error instanceof Error ? error.message : String(error)}\n`,
      )
      process.exitCode = 1
    })
}
