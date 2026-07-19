import { defineConfig, type UserConfigExport } from '@tarojs/cli'

const apiBaseUrl = process.env.TARO_APP_API_BASE_URL ?? 'http://127.0.0.1:3100/v1'
const authMode = process.env.TARO_APP_AUTH_MODE ?? 'dev'
if (!['dev', 'wechat'].includes(authMode)) {
  throw new Error('TARO_APP_AUTH_MODE must be dev or wechat')
}
if (authMode === 'wechat' && process.env.TARO_ENV !== 'weapp') {
  throw new Error('wechat authentication can only be built for TARO_ENV=weapp')
}
if (authMode === 'wechat' && !apiBaseUrl.startsWith('https://')) {
  throw new Error('TARO_APP_API_BASE_URL must use HTTPS for wechat authentication')
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
  outputRoot: `dist-${process.env.TARO_ENV ?? 'h5'}`,
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
  },
}

export default defineConfig(config)
