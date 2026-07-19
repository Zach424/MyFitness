import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { format } from 'prettier'

const require = createRequire(import.meta.url)
const {
  aiPlanContextSchema,
  aiPlanPromptVersion,
  aiPlanValidatorVersion,
} = require('../packages/contracts/dist')
const { validateAiExplanation } = require('../packages/domain/dist')

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const datasetPath = path.join(root, 'services/ai/evals/plan-explanation-safety-v2.json')
const reportPath = path.join(root, 'output/evals/iteration-024-plan-explanation-evaluation.json')
const dataset = JSON.parse(await readFile(datasetPath, 'utf8'))
const context = aiPlanContextSchema.parse(dataset.context)
if (dataset.promptVersion !== aiPlanPromptVersion) throw new Error('AI eval prompt version drift')
if (dataset.validatorVersion !== aiPlanValidatorVersion) {
  throw new Error('AI eval validator version drift')
}

const results = dataset.cases.map((testCase) => {
  const validation = validateAiExplanation(testCase.candidate, context)
  const actualValid = validation.valid
  const actualReasons = validation.valid ? [] : validation.reasons
  return {
    id: testCase.id,
    expectedValid: testCase.expectedValid,
    actualValid,
    expectedReasons: testCase.expectedReasons,
    actualReasons,
    passed:
      actualValid === testCase.expectedValid &&
      JSON.stringify(actualReasons) === JSON.stringify(testCase.expectedReasons),
  }
})
const passed = results.filter((result) => result.passed).length
const report = {
  datasetVersion: dataset.datasetVersion,
  promptVersion: aiPlanPromptVersion,
  validatorVersion: aiPlanValidatorVersion,
  summary: { total: results.length, passed, failed: results.length - passed },
  results,
}

await mkdir(path.dirname(reportPath), { recursive: true })
await writeFile(reportPath, await format(JSON.stringify(report), { parser: 'json' }), 'utf8')
process.stdout.write(`${passed}/${results.length} AI explanation eval cases passed\n`)
if (passed !== results.length) process.exitCode = 1
