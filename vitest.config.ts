import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@myfitness/contracts/health-record.constants',
        replacement: fileURLToPath(
          new URL('./packages/contracts/src/health-record.constants.ts', import.meta.url),
        ),
      },
      {
        find: '@myfitness/contracts/onboarding.constants',
        replacement: fileURLToPath(
          new URL('./packages/contracts/src/onboarding.constants.ts', import.meta.url),
        ),
      },
      {
        find: '@myfitness/contracts',
        replacement: fileURLToPath(new URL('./packages/contracts/src/index.ts', import.meta.url)),
      },
      {
        find: '@myfitness/domain',
        replacement: fileURLToPath(new URL('./packages/domain/src/index.ts', import.meta.url)),
      },
    ],
  },
  test: {
    coverage: {
      reporter: ['text', 'html'],
    },
    exclude: ['**/*.integration.spec.ts', '**/node_modules/**', '**/dist/**'],
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
  },
})
