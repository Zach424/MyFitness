import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { aiPlanContextSchema } = require('../packages/contracts/dist')
const { validateAiExplanation } = require('../packages/domain/dist')

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const datasetPath = path.join(root, 'services/ai/evals/plan-explanation-v1.json')
const reportPath = path.join(root, 'output/evals/iteration-009-ai-evaluation.json')
const dataset = JSON.parse(await readFile(datasetPath, 'utf8'))
const context = aiPlanContextSchema.parse(dataset.context)

const results = dataset.cases.map((testCase) => {
  const validation = validateAiExplanation(testCase.candidate, context)
  const actualValid = validation.valid
  return {
    id: testCase.id,
    expectedValid: testCase.expectedValid,
    actualValid,
    passed: actualValid === testCase.expectedValid,
    reasons: validation.valid ? [] : validation.reasons,
  }
})
const passed = results.filter((result) => result.passed).length
const report = {
  datasetVersion: dataset.datasetVersion,
  promptVersion: 'plan-explanation-v1',
  validatorVersion: 'plan-explanation-safety-v1',
  summary: { total: results.length, passed, failed: results.length - passed },
  results,
}

await mkdir(path.dirname(reportPath), { recursive: true })
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
process.stdout.write(`${passed}/${results.length} AI explanation eval cases passed\n`)
if (passed !== results.length) process.exitCode = 1
