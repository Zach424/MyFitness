import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { foodPhotoPromptVersion, foodPhotoValidatorVersion } = require('../packages/contracts/dist')
const { validateFoodPhotoCandidates } = require('../packages/domain/dist')

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const datasetPath = path.join(root, 'services/ai/evals/food-photo-safety-v2.json')
const reportPath = path.join(root, 'output/evals/iteration-024-food-photo-evaluation.json')
const dataset = JSON.parse(await readFile(datasetPath, 'utf8'))
if (dataset.promptVersion !== foodPhotoPromptVersion) {
  throw new Error('food-photo eval prompt version drift')
}
if (dataset.validatorVersion !== foodPhotoValidatorVersion) {
  throw new Error('food-photo eval validator version drift')
}

const results = dataset.cases.map((testCase) => {
  const validation = validateFoodPhotoCandidates(testCase.candidate)
  const actualValid = validation.valid
  const actualReason = validation.valid ? null : validation.reason
  return {
    id: testCase.id,
    expectedValid: testCase.expectedValid,
    actualValid,
    expectedReason: testCase.expectedReason,
    actualReason,
    passed: actualValid === testCase.expectedValid && actualReason === testCase.expectedReason,
  }
})
const passed = results.filter((result) => result.passed).length
const report = {
  datasetVersion: dataset.datasetVersion,
  promptVersion: foodPhotoPromptVersion,
  validatorVersion: foodPhotoValidatorVersion,
  summary: { total: results.length, passed, failed: results.length - passed },
  results,
}

await mkdir(path.dirname(reportPath), { recursive: true })
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
process.stdout.write(`${passed}/${results.length} food-photo eval cases passed\n`)
if (passed !== results.length) process.exitCode = 1
