import { spawnSync } from 'node:child_process'

const windows = process.platform === 'win32'
const command = windows ? 'cmd.exe' : 'pnpm'
const args = windows ? ['/d', '/s', '/c', 'pnpm build:h5'] : ['build:h5']
const result = spawnSync(command, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    TARO_APP_AUTH_MODE: 'oidc',
    TARO_APP_API_BASE_URL: process.env.OIDC_E2E_API_BASE_URL ?? 'http://127.0.0.1:3100/v1',
  },
})

if (result.error) throw result.error
process.exitCode = result.status ?? 1
