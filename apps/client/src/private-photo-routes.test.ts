import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const clientSourceRoot = resolve(fileURLToPath(new URL('.', import.meta.url)))

const source = (path: string) => readFile(resolve(clientSourceRoot, path), 'utf8')

describe('私有照片路由边界', () => {
  it('把食物照片与进度照注册为两个独立延迟页面', async () => {
    const [appConfig, nutritionPage, progressPage, buildConfig] = await Promise.all([
      source('app.config.ts'),
      source('pages/nutrition/index.tsx'),
      source('pages/progress-photos/index.tsx'),
      source('../config/index.ts'),
    ])

    expect(appConfig.match(/pages\/food-photo-workflow\/index/g)).toHaveLength(1)
    expect(appConfig.match(/pages\/progress-photos\/index/g)).toHaveLength(1)
    expect(nutritionPage).toContain("url: '/pages/food-photo-workflow/index'")
    expect(nutritionPage).not.toContain('/pages/progress-photos/index?kind=food')
    expect(progressPage).not.toContain('FoodPhotoWorkflowPage')
    expect(progressPage).not.toContain("router?.params.kind === 'food'")
    expect(buildConfig).toContain('clientAsyncShared')
    expect(buildConfig).toContain("name: 'client-async-shared'")
    expect(buildConfig).toContain("chunks: 'async'")
    expect(buildConfig).toContain('minChunks: 2')
  })

  it('只在应用级声明自定义导航样式', async () => {
    const pageConfigs = await Promise.all(
      [
        'pages/ai-explanations/index.config.ts',
        'pages/nutrition/index.config.ts',
        'pages/onboarding/index.config.ts',
        'pages/plans/index.config.ts',
        'pages/privacy/index.config.ts',
        'pages/records/index.config.ts',
        'pages/workouts/index.config.ts',
      ].map(source),
    )

    expect(await source('app.config.ts')).toContain("navigationStyle: 'custom'")
    expect(pageConfigs.every((config) => !config.includes('navigationStyle'))).toBe(true)
  })
})
