import { useEffect, useRef, useState } from 'react'
import { Button, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import { buttonA11yProps } from '../../lib/accessibility'
import {
  ApiError,
  exchangeOidcAuthorizationCode,
  getOidcAuthorizationConfig,
  hasStoredAuthSession,
  isOidcAuthMode,
} from '../../lib/api'
import {
  clearOidcAuthorizationResponseUrl,
  consumeOidcAuthorizationResponse,
  createOidcAuthorization,
  hasOidcAuthorizationResponse,
  hasOidcCallbackTarget,
  OidcFlowError,
} from './oidc.model'
import './index.scss'

type LoginStage = 'loading' | 'ready' | 'redirecting' | 'exchanging' | 'complete' | 'error'

type LoginFeedback = {
  title: string
  detail: string
}

const feedbackFor = (error: unknown): LoginFeedback => {
  if (error instanceof OidcFlowError) {
    if (error.kind === 'provider_denied') {
      return { title: '登录已取消', detail: '没有创建衡迹会话。可以在准备好后重新开始。' }
    }
    if (error.kind === 'provider_error') {
      return {
        title: '身份服务没有完成登录',
        detail: '本次一次性登录已结束，请重新开始；不会自动重放登录凭证。',
      }
    }
    if (error.kind === 'configuration') {
      return { title: '登录配置尚未就绪', detail: error.message }
    }
    return {
      title: '无法确认这次登录',
      detail: `${error.message} 本次一次性登录已清理，不会继续交换。`,
    }
  }
  if (error instanceof ApiError) {
    if (error.statusCode === 401) {
      return {
        title: '登录凭证已失效',
        detail: '身份服务没有接受这次一次性凭证，请重新开始登录。',
      }
    }
    if (error.statusCode === 503) {
      return {
        title: '身份服务暂时不可用',
        detail: '衡迹没有创建会话。稍后重新开始登录即可。',
      }
    }
  }
  return {
    title: '登录连接没有完成',
    detail: '请检查网络后重新开始。为避免重复使用一次性凭证，衡迹不会自动重试交换。',
  }
}

const stageIndex = (stage: LoginStage) => {
  if (stage === 'redirecting') return 1
  if (stage === 'exchanging' || stage === 'complete') return 2
  return 0
}

const LoginPage = () => {
  const processed = useRef(false)
  const [stage, setStage] = useState<LoginStage>('loading')
  const [feedback, setFeedback] = useState<LoginFeedback>()
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (processed.current) return
    processed.current = true

    void (async () => {
      if (process.env.TARO_ENV !== 'h5' || !isOidcAuthMode) {
        await Taro.reLaunch({ url: '/pages/index/index' })
        return
      }
      if (hasStoredAuthSession()) {
        await Taro.reLaunch({ url: '/pages/index/index' })
        return
      }

      const callbackHref = window.location.href
      const hasCallback =
        hasOidcAuthorizationResponse(callbackHref) || hasOidcCallbackTarget(window.sessionStorage)
      if (hasCallback) {
        clearOidcAuthorizationResponseUrl(callbackHref, window.history)
        setStage('exchanging')
      }

      try {
        const config = await getOidcAuthorizationConfig()
        if (!hasCallback) {
          setStage('ready')
          return
        }
        const payload = consumeOidcAuthorizationResponse({
          config,
          href: callbackHref,
          browserOrigin: window.location.origin,
          storage: window.sessionStorage,
          history: window.history,
        })
        const session = await exchangeOidcAuthorizationCode(payload)
        setStage('complete')
        await Taro.reLaunch({
          url: session.isNewUser ? '/pages/onboarding/index' : '/pages/index/index',
        })
      } catch (error) {
        setFeedback(feedbackFor(error))
        setStage('error')
      }
    })()
  }, [retryCount])

  const startLogin = async () => {
    setFeedback(undefined)
    setStage('loading')
    try {
      if (!globalThis.crypto?.getRandomValues || !globalThis.crypto?.subtle) {
        throw new OidcFlowError('configuration', '当前浏览器不支持安全登录所需的加密能力')
      }
      const config = await getOidcAuthorizationConfig()
      const authorization = await createOidcAuthorization({
        config,
        browserOrigin: window.location.origin,
        storage: window.sessionStorage,
        crypto: {
          randomBytes: (byteLength) => window.crypto.getRandomValues(new Uint8Array(byteLength)),
          sha256: async (data) =>
            new Uint8Array(await window.crypto.subtle.digest('SHA-256', data)),
        },
      })
      setStage('redirecting')
      window.location.assign(authorization.authorizationUrl)
    } catch (error) {
      setFeedback(feedbackFor(error))
      setStage('error')
    }
  }

  const restart = () => {
    processed.current = false
    setFeedback(undefined)
    setStage('loading')
    setRetryCount((value) => value + 1)
  }

  const activeStep = stageIndex(stage)
  const busy = ['loading', 'redirecting', 'exchanging', 'complete'].includes(stage)

  return (
    <View className="login-page">
      <ScrollView className="login-scroll" scrollY enhanced showScrollbar={false}>
        <View className="login-shell">
          <View className="login-wordmark" aria-label="衡迹 MyFitness">
            <Text className="login-wordmark__cn">衡迹</Text>
            <Text className="login-wordmark__en">DAILY NOTE</Text>
          </View>

          <View className="login-layout">
            <View className="login-main">
              <Text className="login-kicker">PRIVATE SIGN-IN</Text>
              <Text className="login-title">登录后，继续记录真实发生的事。</Text>
              <Text className="login-intro">
                身份服务只负责确认“你是你”。训练、身体、饮食和恢复记录不会交给身份服务。
              </Text>

              <View className="login-trace" aria-label="网页登录过程">
                {[
                  ['本机生成', '状态与加密校验值只留在当前标签页'],
                  ['身份确认', '前往已配置的身份服务完成确认'],
                  ['返回衡迹', '服务端验证后签发衡迹会话'],
                ].map(([title, detail], index) => (
                  <View
                    className={`login-trace__step ${index <= activeStep ? 'login-trace__step--active' : ''}`}
                    key={title}
                  >
                    <View className="login-trace__marker" aria-hidden="true">
                      <Text>{index + 1}</Text>
                    </View>
                    <View className="login-trace__copy">
                      <Text className="login-trace__title">{title}</Text>
                      <Text className="login-trace__detail">{detail}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <View className="login-status" role="status" aria-live="polite">
                {stage === 'loading' ? <Text>正在检查登录配置…</Text> : null}
                {stage === 'redirecting' ? <Text>正在前往身份服务…</Text> : null}
                {stage === 'exchanging' ? <Text>正在验证一次性登录结果…</Text> : null}
                {stage === 'complete' ? <Text>登录完成，正在进入衡迹…</Text> : null}
                {stage === 'ready' ? <Text>登录配置已就绪。</Text> : null}
                {stage === 'error' && feedback ? (
                  <View className="login-error">
                    <Text className="login-error__title">{feedback.title}</Text>
                    <Text className="login-error__detail">{feedback.detail}</Text>
                  </View>
                ) : null}
              </View>

              {stage === 'ready' ? (
                <Button
                  {...buttonA11yProps}
                  className="login-action"
                  onClick={() => void startLogin()}
                >
                  继续登录
                  <Text aria-hidden="true"> →</Text>
                </Button>
              ) : null}
              {stage === 'error' ? (
                <Button {...buttonA11yProps} className="login-action" onClick={restart}>
                  重新开始登录
                </Button>
              ) : null}
              {busy ? (
                <View className="login-progress" aria-hidden="true">
                  <View className="login-progress__bar" />
                </View>
              ) : null}
            </View>

            <View className="login-aside">
              <Text className="login-aside__label">当前边界</Text>
              <Text className="login-aside__title">一次登录，一条短轨迹。</Text>
              <View className="login-aside__rule" />
              <View className="login-aside__item">
                <Text className="login-aside__term">标签页</Text>
                <Text className="login-aside__value">关闭后，未完成的状态与校验值一并消失</Text>
              </View>
              <View className="login-aside__item">
                <Text className="login-aside__term">回调地址</Text>
                <Text className="login-aside__value">必须与衡迹配置完全一致</Text>
              </View>
              <View className="login-aside__item">
                <Text className="login-aside__term">失败处理</Text>
                <Text className="login-aside__value">清除一次性结果，重新创建登录，不自动重放</Text>
              </View>
              <Text className="login-aside__note">
                衡迹是健身与生活方式记录工具，不提供医疗诊断或治疗。
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

export default LoginPage
