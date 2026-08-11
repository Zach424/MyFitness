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
      minimumHanShare: 0.72,
      rejectEnglishOnlyNarrativeLines: true,
    },
    {
      path: 'docs/product/PRODUCT_BRIEF.md',
      headings: [
        '# 产品简报',
        '## 产品主张',
        '## 初始受众',
        '## 核心用户任务',
        '## 信息架构',
        '## MVP 功能范围',
        '### 基础与个人资料',
        '### 记录',
        '### 洞察与规划',
        '### 图像辅助',
        '## 首个版本明确排除项',
        '## 成功模型',
        '## 商业模式假设',
      ],
      minimumHanShare: 0.72,
      rejectEnglishOnlyNarrativeLines: true,
    },
    {
      path: 'docs/product/IMPLEMENTED_PRD.md',
      headings: [
        '# 衡迹已实现产品需求文档',
        '## 1. 文档目的',
        '## 4. 信息架构与页面入口',
        '## 5. 全局交互规则',
        '## 22. 全局异常状态矩阵',
      ],
      minimumHanShare: 0.72,
      rejectEnglishOnlyNarrativeLines: true,
    },
    {
      path: 'docs/product/RISK_REGISTER.md',
      headings: ['# 产品风险登记册'],
      requiredTokens: [
        '最后审阅：2026-08-11，第 143 轮',
        '全表复核结论：30 项开放风险全部保持开放，严重度为 20 项高、10 项中',
        '当前控制 / 下一门禁',
        '产品级风险只有在具名的发布证据存在后才能关闭。',
      ],
      forbiddenTokens: ['| High', '| Medium', '| Low'],
      riskInventory: {
        orderedIds: [
          'R-002',
          'R-003',
          'R-004',
          'R-005',
          'R-006',
          'R-007',
          'R-008',
          'R-009',
          'R-010',
          'R-011',
          'R-012',
          'R-013',
          'R-014',
          'R-015',
          'R-016',
          'R-017',
          'R-019',
          'R-020',
          'R-021',
          'R-022',
          'R-023',
          'R-024',
          'R-025',
          'R-026',
          'R-027',
          'R-028',
          'R-029',
          'R-030',
          'R-031',
          'R-032',
          'R-033',
        ],
        severityCounts: { 高: 21, 中: 10 },
      },
      minimumHanShare: 0.72,
      rejectEnglishOnlyNarrativeLines: true,
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
      minimumHanShare: 0.72,
      rejectEnglishOnlyNarrativeLines: true,
    },
    {
      path: 'docs/architecture/PERSONAL_MODEL.md',
      headings: [
        '# 个人认知模型',
        '## 1. 目标与边界',
        '## 2. 现状复用与缺口',
        '## 3. 八类认知的严格边界',
        '## 4. 领域聚合与结构',
        '## 5. 证据模型',
        '## 6. 生命周期与状态机',
        '## 7. 置信与模型更新',
        '## 8. 用户校准',
        '## 9. 每周认知回顾（Weekly Cognitive Review）',
        '## 10. 最小闭环与首批场景',
        '## 11. 数据库与 API 候选边界',
        '## 12. AI 与 Contextual Decision 边界',
        '## 13. 隐私、安全与产品风险',
        '## 14. 分阶段实施与验收',
        '## 15. 待决策与下一步',
      ],
      minimumHanShare: 0.72,
      rejectEnglishOnlyNarrativeLines: true,
    },
    {
      path: 'docs/architecture/DATABASE_DESIGN.md',
      headings: [
        '# 衡迹数据库设计文档',
        '## 1. 文档范围与实测基线',
        '## 3. 领域关系总览',
        '## 4. 当前表清单与本地行数',
        '## 18. 关键索引策略',
      ],
      minimumHanShare: 0.65,
      rejectEnglishOnlyNarrativeLines: true,
    },
    {
      path: 'docs/api/API_REFERENCE.md',
      headings: [
        '# 衡迹接口参考文档',
        '## 1. 范围与契约来源',
        '## 2. 通用约定',
        '## 3. 核心请求与响应模型',
        '## 16. 系统接口',
      ],
      minimumHanShare: 0.6,
      rejectEnglishOnlyNarrativeLines: true,
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
      minimumHanShare: 0.72,
      rejectEnglishOnlyNarrativeLines: true,
    },
    {
      path: 'docs/DOCUMENTATION_MIGRATION_INDEX.md',
      headings: [
        '# 中文文档迁移索引',
        '## 目的与边界',
        '## 已受门禁保护的范围',
        '## 待迁移专题批次',
        '## 待迁移历史批次',
        '## 自动检查',
        '## 参考',
      ],
      minimumHanShare: 0.72,
      rejectEnglishOnlyNarrativeLines: true,
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

export const measureRiskInventory = (text) => {
  const rows = text
    .split(/\r?\n/)
    .filter((line) => /^\|\s*R-\d{3}\s*\|/.test(line))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    )

  const malformed = rows.find(
    (cells) => cells.length !== 4 || !['高', '中', '低'].includes(cells[2]),
  )
  if (malformed) {
    fail(`风险登记行格式或严重度无效：${malformed.join(' | ')}`)
  }

  return {
    orderedIds: rows.map((cells) => cells[0]),
    severityCounts: rows.reduce((counts, cells) => {
      counts[cells[2]] = (counts[cells[2]] ?? 0) + 1
      return counts
    }, {}),
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
  const missingTokens = (document.requiredTokens ?? []).filter((token) => !text.includes(token))
  if (missingTokens.length > 0) {
    fail(`${document.path} 缺少受控正文标记：${missingTokens.join('；')}`)
  }
  const forbiddenTokens = (document.forbiddenTokens ?? []).filter((token) => text.includes(token))
  if (forbiddenTokens.length > 0) {
    fail(`${document.path} 仍包含禁用正文标记：${forbiddenTokens.join('；')}`)
  }
  let riskInventory
  if (document.riskInventory) {
    riskInventory = measureRiskInventory(text)
    const expectedIds = document.riskInventory.orderedIds
    if (riskInventory.orderedIds.join(',') !== expectedIds.join(',')) {
      fail(
        `${document.path} 开放风险编号或顺序漂移：${riskInventory.orderedIds.join('、')}；预期 ${expectedIds.join('、')}`,
      )
    }
    for (const [severity, expected] of Object.entries(document.riskInventory.severityCounts)) {
      const actual = riskInventory.severityCounts[severity] ?? 0
      if (actual !== expected) {
        fail(`${document.path} ${severity}风险数量漂移：${actual}；预期 ${expected}`)
      }
    }
    const unexpectedSeverities = Object.keys(riskInventory.severityCounts).filter(
      (severity) => !(severity in document.riskInventory.severityCounts),
    )
    if (unexpectedSeverities.length > 0) {
      fail(`${document.path} 出现未登记的风险严重度：${unexpectedSeverities.join('、')}`)
    }
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
    ...(riskInventory ? { riskInventory } : {}),
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
