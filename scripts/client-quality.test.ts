import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { verifyClientQuality } from './client-quality.mjs'

const temporaryRoots: string[] = []

const createFixture = async () => {
  const root = await mkdtemp(join(tmpdir(), 'myfitness-client-quality-'))
  temporaryRoots.push(root)
  const h5Root = join(root, 'h5')
  const weappRoot = join(root, 'weapp')
  await mkdir(join(h5Root, 'js'), { recursive: true })
  await mkdir(join(h5Root, 'css'), { recursive: true })
  await mkdir(join(h5Root, 'chunk'), { recursive: true })
  await mkdir(join(weappRoot, 'pages', 'index'), { recursive: true })
  await writeFile(
    join(h5Root, 'index.html'),
    '<script src="/js/app.js"></script><link href="/css/app.css" rel="stylesheet">',
  )
  await writeFile(join(h5Root, 'js', 'app.js'), 'app')
  await writeFile(join(h5Root, 'css', 'app.css'), 'css')
  await writeFile(join(h5Root, 'chunk', 'route.js'), 'route')
  await writeFile(join(weappRoot, 'vendors.js'), 'vendor')
  await writeFile(join(weappRoot, 'pages', 'index', 'index.js'), 'page')

  const budgetPath = join(root, 'budget.json')
  await writeFile(
    budgetPath,
    JSON.stringify({
      schemaVersion: 'myfitness-client-quality-budget/v1',
      h5: {
        maxTotalBytes: 1000,
        maxEntrypointBytes: 100,
        maxAsyncJavaScriptBytes: 100,
        forbiddenJavaScriptMarkers: ['forbidden-runtime'],
      },
      weapp: {
        maxTotalBytes: 1000,
        maxVendorBytes: 100,
        maxPageJavaScriptBytes: 100,
        forbiddenJavaScriptMarkers: ['forbidden-runtime'],
      },
    }),
  )
  return { budgetPath, h5Root, weappRoot }
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

describe('client quality verifier', () => {
  it('measures both client outputs and passes within budget', async () => {
    const paths = await createFixture()
    const report = await verifyClientQuality(paths)

    expect(report.status).toBe('passed')
    expect(report.measurements.h5.entrypointAssets).toEqual(['js/app.js', 'css/app.css'])
    expect(report.measurements.weapp.vendorBytes).toBe(6)
  })

  it('fails when an async H5 route exceeds its measured limit', async () => {
    const paths = await createFixture()
    await writeFile(join(paths.h5Root, 'chunk', 'route.js'), 'x'.repeat(101))

    await expect(verifyClientQuality(paths)).rejects.toThrow(
      'H5 largest async JavaScript exceeds budget: 101 > 100 bytes',
    )
  })

  it('fails when a forbidden validation runtime marker returns', async () => {
    const paths = await createFixture()
    const vendorPath = join(paths.weappRoot, 'vendors.js')
    await writeFile(vendorPath, `${await readFile(vendorPath, 'utf8')}forbidden-runtime`)

    await expect(verifyClientQuality(paths)).rejects.toThrow(
      'client bundles contain forbidden validation runtime markers',
    )
  })
})
