import { defineConfig } from '@playwright/test'

import { apiOrigin } from './tests/e2e/runtime'

const apiPort = new URL(apiOrigin).port || '3100'

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: 'oidc-login.spec.ts',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  webServer: [
    {
      command: 'pnpm --filter @myfitness/api start',
      url: `${apiOrigin}/v1/health`,
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        ...process.env,
        API_PORT: apiPort,
      },
    },
    {
      command: 'pnpm preview:h5',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @myfitness/admin start:preview',
      url: 'http://127.0.0.1:3101',
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        ...process.env,
        ADMIN_ENABLE_LOCAL_LOGIN: 'true',
        ADMIN_COOKIE_SECURE: 'false',
        MYFITNESS_API_URL: `${apiOrigin}/v1`,
      },
    },
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    trace: 'retain-on-failure',
  },
})
