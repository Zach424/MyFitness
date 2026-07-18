import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@myfitness/contracts': fileURLToPath(
        new URL('./packages/contracts/src/index.ts', import.meta.url),
      ),
      '@myfitness/domain': fileURLToPath(
        new URL('./packages/domain/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**'],
    fileParallelism: false,
    include: ['apps/**/*.integration.spec.ts'],
    testTimeout: 20_000,
  },
})
