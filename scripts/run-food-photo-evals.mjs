import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { validateFoodPhotoCandidates } = require('../packages/domain/dist')

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const datasetPath = path.join(root, 'services/ai/evals/food-photo-candidates-v1.json')
const reportPath = path.join(root, 'output/evals/iteration-010-food-photo-evaluation.json')
const dataset = JSON.parse(await readFile(datasetPath, 'utf8'))

const results = dataset.cases.map((testCase) => {
  const validation = validateFoodPhotoCandidates(testCase.candidate)
  const actualValid = validation.valid
  return {
    id: testCase.id,
    expectedValid: testCase.expectedValid,
    actualValid,
    passed: actualValid === testCase.expectedValid,
    reason: validation.valid ? null : validation.reason,
  }
})
const passed = results.filter((result) => result.passed).length
const report = {
  datasetVersion: dataset.datasetVersion,
  promptVersion: 'food-photo-candidates-v1',
  validatorVersion: 'food-photo-catalog-safety-v1',
  summary: { total: results.length, passed, failed: results.length - passed },
  results,
}

await mkdir(path.dirname(reportPath), { recursive: true })
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
process.stdout.write(`${passed}/${results.length} food-photo eval cases passed\n`)
if (passed !== results.length) process.exitCode = 1
