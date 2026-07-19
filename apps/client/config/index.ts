import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import type { IProjectConfig } from '@tarojs/taro/types/compile'
import type { Compiler } from 'webpack'

const apiBaseUrl = process.env.TARO_APP_API_BASE_URL ?? 'http://127.0.0.1:3100/v1'
const authMode = process.env.TARO_APP_AUTH_MODE ?? 'dev'
const platform = process.env.TARO_ENV ?? 'h5'
if (!['dev', 'wechat'].includes(authMode)) {
  throw new Error('TARO_APP_AUTH_MODE must be dev or wechat')
}
if (authMode === 'wechat' && process.env.TARO_ENV !== 'weapp') {
  throw new Error('wechat authentication can only be built for TARO_ENV=weapp')
}
if (authMode === 'wechat' && !apiBaseUrl.startsWith('https://')) {
  throw new Error('TARO_APP_API_BASE_URL must use HTTPS for wechat authentication')
}

const releaseEnvironment = {
  version: process.env.MYFITNESS_CLIENT_RELEASE_VERSION,
  repository: process.env.MYFITNESS_CLIENT_SOURCE_REPOSITORY,
  revision: process.env.MYFITNESS_CLIENT_SOURCE_REVISION,
  runId: process.env.MYFITNESS_CLIENT_WORKFLOW_RUN_ID,
  runAttempt: process.env.MYFITNESS_CLIENT_WORKFLOW_RUN_ATTEMPT,
}
const releaseValues = Object.values(releaseEnvironment)
const isReleaseBuild = releaseValues.some(Boolean)
if (isReleaseBuild && releaseValues.some((value) => !value)) {
  throw new Error('client release metadata variables must be supplied together')
}
if (isReleaseBuild && !['h5', 'weapp'].includes(platform)) {
  throw new Error('client release metadata is supported only for h5 and weapp')
}
if (isReleaseBuild && platform === 'weapp' && authMode !== 'wechat') {
  throw new Error('a WeApp release build must use wechat authentication')
}
if (isReleaseBuild && platform === 'h5' && authMode !== 'dev') {
  throw new Error('the current H5 release build is preview-only and must use dev authentication')
}

const releaseMetadata = isReleaseBuild
  ? {
      schemaVersion: 'myfitness-client-build/v1',
      platform,
      version: releaseEnvironment.version,
      source: {
        repository: releaseEnvironment.repository,
        revision: releaseEnvironment.revision,
      },
      workflow: {
        id: releaseEnvironment.runId,
        attempt: Number(releaseEnvironment.runAttempt),
      },
      runtime: {
        apiBaseUrl,
        authMode,
      },
      deliveryClass: platform === 'weapp' ? 'candidate' : 'preview-only',
    }
  : undefined

class ClientBuildMetadataPlugin {
  constructor(private readonly metadata: NonNullable<typeof releaseMetadata>) {}

  apply(compiler: Compiler) {
    compiler.hooks.thisCompilation.tap('MyFitnessClientBuildMetadata', (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: 'MyFitnessClientBuildMetadata',
          stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
        },
        () => {
          compilation.emitAsset(
            'myfitness-client-build.json',
            new compiler.webpack.sources.RawSource(`${JSON.stringify(this.metadata, null, 2)}\n`),
          )
        },
      )
    })
  }
}

type WebpackChain = Parameters<NonNullable<NonNullable<IProjectConfig['h5']>['webpackChain']>>[0]

const addReleaseMetadata = (chain: WebpackChain) => {
  if (releaseMetadata) {
    chain
      .plugin('myfitness-client-build-metadata')
      .use(ClientBuildMetadataPlugin, [releaseMetadata])
  }
}

const config: UserConfigExport = {
  projectName: 'myfitness-client',
  date: '2026-07-18',
  designWidth: 390,
  deviceRatio: {
    390: 1,
    750: 0.52,
  },
  sourceRoot: 'src',
  outputRoot: `dist-${platform}`,
  framework: 'react',
  compiler: 'webpack5',
  cache: {
    enable: true,
  },
  plugins: [],
  defineConstants: {
    __API_BASE_URL__: JSON.stringify(apiBaseUrl),
    __AUTH_MODE__: JSON.stringify(authMode),
  },
  copy: {
    patterns: [],
    options: {},
  },
  mini: {
    webpackChain: addReleaseMetadata,
    postcss: {
      pxtransform: {
        enable: true,
        config: {},
      },
      url: {
        enable: true,
        config: {
          limit: 1024,
        },
      },
      cssModules: {
        enable: false,
        config: {
          namingPattern: 'module',
          generateScopedName: '[name]__[local]___[hash:base64:5]',
        },
      },
    },
  },
  h5: {
    publicPath: '/',
    staticDirectory: 'static',
    webpackChain: addReleaseMetadata,
  },
}

export default defineConfig(config)
