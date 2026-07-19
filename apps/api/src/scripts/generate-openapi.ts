import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { format, resolveConfig } from 'prettier'

import { createApplication } from '../bootstrap'
import { buildOpenApiDocument } from '../openapi'

const outputDirectory = path.resolve(__dirname, '../../../../docs/api')

const generate = async () => {
  const app = await createApplication(false, 'metadata')
  await app.init()
  const document = buildOpenApiDocument(app)
  await mkdir(outputDirectory, { recursive: true })
  const outputPath = path.join(outputDirectory, 'openapi.json')
  const prettierConfig = await resolveConfig(outputPath)
  const output = await format(JSON.stringify(document), {
    ...prettierConfig,
    filepath: outputPath,
  })
  await writeFile(outputPath, output)
  await app.close()
}

generate().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
