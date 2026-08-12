import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@myfitness/contracts/personal-model-time.runtime',
        replacement: fileURLToPath(
          new URL('./packages/contracts/src/personal-model-time.runtime.ts', import.meta.url),
        ),
      },
      {
        find: '@myfitness/contracts/personal-model-current-subject.constants',
        replacement: fileURLToPath(
          new URL(
            './packages/contracts/src/personal-model-current-subject.constants.ts',
            import.meta.url,
          ),
        ),
      },
      {
        find: '@myfitness/contracts/personal-model-feedback.runtime',
        replacement: fileURLToPath(
          new URL('./packages/contracts/src/personal-model-feedback.runtime.ts', import.meta.url),
        ),
      },
      {
        find: '@myfitness/contracts/personal-model-feedback.constants',
        replacement: fileURLToPath(
          new URL('./packages/contracts/src/personal-model-feedback.constants.ts', import.meta.url),
        ),
      },
      {
        find: '@myfitness/contracts/personal-model-current-subject.runtime',
        replacement: fileURLToPath(
          new URL(
            './packages/contracts/src/personal-model-current-subject.runtime.ts',
            import.meta.url,
          ),
        ),
      },
      {
        find: '@myfitness/contracts/exercise-catalog.constants',
        replacement: fileURLToPath(
          new URL('./packages/contracts/src/exercise-catalog.constants.ts', import.meta.url),
        ),
      },
      {
        find: '@myfitness/contracts/ai.constants',
        replacement: fileURLToPath(
          new URL('./packages/contracts/src/ai.constants.ts', import.meta.url),
        ),
      },
      {
        find: '@myfitness/contracts/food-photo.constants',
        replacement: fileURLToPath(
          new URL('./packages/contracts/src/food-photo.constants.ts', import.meta.url),
        ),
      },
      {
        find: '@myfitness/contracts/privacy.constants',
        replacement: fileURLToPath(
          new URL('./packages/contracts/src/privacy.constants.ts', import.meta.url),
        ),
      },
      {
        find: '@myfitness/contracts/progress-photo.constants',
        replacement: fileURLToPath(
          new URL('./packages/contracts/src/progress-photo.constants.ts', import.meta.url),
        ),
      },
      {
        find: '@myfitness/contracts/nutrition.constants',
        replacement: fileURLToPath(
          new URL('./packages/contracts/src/nutrition.constants.ts', import.meta.url),
        ),
      },
      {
        find: '@myfitness/contracts/workout.constants',
        replacement: fileURLToPath(
          new URL('./packages/contracts/src/workout.constants.ts', import.meta.url),
        ),
      },
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
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
})
