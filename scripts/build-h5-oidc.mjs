import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

import { removeOidcE2eArtifact, writeOidcE2eArtifact } from './oidc-e2e-artifact.mjs'

const windows = process.platform === 'win32'
const command = windows ? 'cmd.exe' : 'pnpm'
const args = windows ? ['/d', '/s', '/c', 'pnpm build:h5'] : ['build:h5']
const apiBaseUrl = process.env.OIDC_E2E_API_BASE_URL ?? 'http://127.0.0.1:3100/v1'
const receiptPath = resolve('apps/client/.taro/oidc-e2e-artifact.json')
await removeOidcE2eArtifact(receiptPath)
const result = spawnSync(command, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    TARO_APP_AUTH_MODE: 'oidc',
    TARO_APP_API_BASE_URL: apiBaseUrl,
  },
})

if (result.error) throw result.error
if (result.status !== 0) {
  process.exitCode = result.status ?? 1
} else {
  const receipt = await writeOidcE2eArtifact({
    buildRoot: resolve('apps/client/dist-h5'),
    receiptPath,
    apiBaseUrl,
  })
  console.log(JSON.stringify({ status: 'written', ...receipt }, null, 2))
}
