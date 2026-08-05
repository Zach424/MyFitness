import { useEffect, useMemo, useState } from 'react'
import { Button, Image, ScrollView, Slider, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { ProgressPhotoItem } from '@myfitness/contracts'
import {
  progressPhotoAnalysisConsentVersion,
  progressPhotoRetentionConsentVersion,
} from '@myfitness/contracts/progress-photo.constants'

import { buttonA11yProps } from '../../lib/accessibility'
import {
  ApiError,
  deleteProgressPhoto,
  listProgressPhotos,
  privatePhotoUrl,
  reserveProgressPhoto,
  uploadProgressPhoto,
} from '../../lib/api'
import {
  progressViewCopy,
  qualityReasonCopy,
  retainedPhotosForView,
  selectedComparisonPair,
} from './progress-photo.model'
import FoodPhotoWorkflowPage from '../food-photo-workflow'
import './index.scss'

const requestKey = () =>
  `progress-photo-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`

const messageOf = (error: unknown) =>
  error instanceof ApiError || error instanceof Error ? error.message : '操作失败，请稍后重试'

const captureTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))

const ProgressPhotosPage = () => {
  const [photos, setPhotos] = useState<ProgressPhotoItem[]>([])
  const [view, setView] = useState<ProgressPhotoItem['view']>('front')
  const [retained, setRetained] = useState(false)
  const [analysisConsent, setAnalysisConsent] = useState(false)
  const [retentionConsent, setRetentionConsent] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [baselineId, setBaselineId] = useState('')
  const [currentId, setCurrentId] = useState('')
  const [overlayOpacity, setOverlayOpacity] = useState(52)
  const [deleting, setDeleting] = useState<ProgressPhotoItem>()

  const load = async () => {
    setLoading(true)
    try {
      const result = await listProgressPhotos()
      setPhotos(result.items)
    } catch (error) {
      setFeedback(messageOf(error))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const comparisonPhotos = useMemo(() => retainedPhotosForView(photos, view), [photos, view])
  const comparisonPair = useMemo(
    () => selectedComparisonPair(comparisonPhotos, baselineId, currentId),
    [baselineId, comparisonPhotos, currentId],
  )

  const choosePhoto = async () => {
    if (!analysisConsent) {
      setFeedback('请先确认本次本地画质检查授权。')
      return
    }
    if (retained && !retentionConsent) {
      setFeedback('长期保留需要单独确认；也可以改为 24 小时后自动删除。')
      return
    }
    setBusy(true)
    setFeedback('')
    let reservedId = ''
    try {
      const selected = await Taro.chooseImage({
        count: 1,
        sizeType: ['original'],
        sourceType: ['camera', 'album'],
      })
      const filePath = selected.tempFilePaths[0]
      if (!filePath) throw new Error('没有读取到所选照片')
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      const ticket = await reserveProgressPhoto(
        {
          view,
          capturedAt: new Date().toISOString(),
          timezone,
          analysisConsent: {
            granted: true,
            version: progressPhotoAnalysisConsentVersion,
          },
          retention: retained
            ? {
                mode: 'retained',
                consent: {
                  granted: true,
                  version: progressPhotoRetentionConsentVersion,
                },
              }
            : { mode: 'analysis_only' },
        },
        requestKey(),
      )
      reservedId = ticket.id
      const uploaded = await uploadProgressPhoto(ticket.upload.path, filePath)
      setPhotos((items) => [uploaded, ...items.filter((item) => item.id !== uploaded.id)])
      setAnalysisConsent(false)
      setRetentionConsent(false)
      setFeedback(
        uploaded.quality?.overallStatus === 'ready'
          ? '照片已完成净化与对位条件检查。机器只检查画幅、清晰度、亮度和对比度。'
          : '照片已保存；下方列出了需要调整的拍摄条件。这不是身体或体态判断。',
      )
    } catch (error) {
      if (reservedId) await deleteProgressPhoto(reservedId).catch(() => undefined)
      const message = messageOf(error)
      if (!message.toLowerCase().includes('cancel')) setFeedback(message)
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setBusy(true)
    try {
      await deleteProgressPhoto(deleting.id)
      setPhotos((items) => items.filter((item) => item.id !== deleting.id))
      setDeleting(undefined)
      setFeedback('照片、机器画质检查与私有媒体对象均已删除。')
    } catch (error) {
      setFeedback(messageOf(error))
    } finally {
      setBusy(false)
    }
  }

  const setAsBaseline = (id: string) => {
    if (currentId === id) setCurrentId(baselineId)
    setBaselineId(id)
  }

  const setAsCurrent = (id: string) => {
    if (baselineId === id) setBaselineId(currentId)
    setCurrentId(id)
  }

  return (
    <View className="progress-page">
      <ScrollView className="progress-scroll" scrollY enhanced showScrollbar={false}>
        <View className="progress-shell">
          <View className="progress-topbar">
            <Button
              {...buttonA11yProps}
              className="progress-back"
              aria-label="返回身体记录"
              onClick={() => void Taro.navigateBack()}
            >
              ←
            </Button>
            <View className="progress-brand">
              <Text>衡迹</Text>
              <Text className="progress-brand__en">ALIGNMENT CONTACT SHEET</Text>
            </View>
            <Button
              {...buttonA11yProps}
              className="privacy-link"
              onClick={() => void Taro.navigateTo({ url: '/pages/privacy/index' })}
            >
              数据权限
            </Button>
          </View>

          <View className="progress-hero">
            <Text className="section-kicker">SAME VIEW · SAME DISTANCE · YOUR DECISION</Text>
            <Text className="progress-title">用相同条件，看见自己的长期变化。</Text>
            <Text className="progress-lead">
              系统只检查拍摄条件并帮助两张照片对位，不判断体态、不估算体脂，也不提供医学结论。
            </Text>
          </View>

          {feedback ? (
            <View className="progress-feedback" role="status">
              <Text>{feedback}</Text>
              <Button
                {...buttonA11yProps}
                className="feedback-close"
                onClick={() => setFeedback('')}
              >
                关闭
              </Button>
            </View>
          ) : null}

          <View className="progress-grid">
            <View className="capture-card paper-card">
              <View className="card-heading">
                <View>
                  <Text className="section-kicker">CAPTURE REGISTER</Text>
                  <Text className="section-title">建立一张可对位的照片</Text>
                </View>
                <Text className="card-index">01</Text>
              </View>

              <View className="view-tabs" aria-label="选择拍摄方向">
                {(['front', 'side', 'back'] as const).map((item) => (
                  <Button
                    {...buttonA11yProps}
                    key={item}
                    className={`view-tab ${view === item ? 'view-tab--active' : ''}`}
                    aria-pressed={view === item}
                    onClick={() => setView(item)}
                  >
                    {progressViewCopy[item].label}
                  </Button>
                ))}
              </View>

              <View
                className="capture-register"
                aria-label={`${progressViewCopy[view].label}拍摄参考框`}
              >
                <View className="register-corner register-corner--tl" />
                <View className="register-corner register-corner--tr" />
                <View className="register-corner register-corner--bl" />
                <View className="register-corner register-corner--br" />
                <View className="register-axis register-axis--vertical" />
                <View className="register-axis register-axis--horizontal" />
                <View className={`body-marker body-marker--${view}`} aria-hidden="true">
                  <View className="body-marker__head" />
                  <View className="body-marker__torso" />
                  <View className="body-marker__legs" />
                </View>
                <Text className="register-view">{progressViewCopy[view].label}</Text>
              </View>
              <Text className="capture-cue">{progressViewCopy[view].cue}</Text>

              <View className="retention-choice">
                <Button
                  {...buttonA11yProps}
                  className={`retention-option ${!retained ? 'retention-option--active' : ''}`}
                  aria-pressed={!retained}
                  onClick={() => {
                    setRetained(false)
                    setRetentionConsent(false)
                  }}
                >
                  <Text className="retention-option__title">仅本次分析</Text>
                  <Text className="retention-option__note">
                    24 小时内自动删除，不能进入长期对比
                  </Text>
                </Button>
                <Button
                  {...buttonA11yProps}
                  className={`retention-option ${retained ? 'retention-option--active' : ''}`}
                  aria-pressed={retained}
                  onClick={() => setRetained(true)}
                >
                  <Text className="retention-option__title">保留用于对比</Text>
                  <Text className="retention-option__note">保留净化照片，直到你删除或撤回授权</Text>
                </Button>
              </View>

              <Button
                {...buttonA11yProps}
                className={`consent-toggle ${analysisConsent ? 'consent-toggle--checked' : ''}`}
                aria-pressed={analysisConsent}
                onClick={() => setAnalysisConsent((value) => !value)}
              >
                <Text className="consent-toggle__box">{analysisConsent ? '✓' : ''}</Text>
                <Text>同意本次照片净化与拍摄条件机器检查</Text>
              </Button>
              {retained ? (
                <Button
                  {...buttonA11yProps}
                  className={`consent-toggle ${retentionConsent ? 'consent-toggle--checked' : ''}`}
                  aria-pressed={retentionConsent}
                  onClick={() => setRetentionConsent((value) => !value)}
                >
                  <Text className="consent-toggle__box">{retentionConsent ? '✓' : ''}</Text>
                  <Text>另行同意保留净化照片用于长期对比</Text>
                </Button>
              ) : null}

              <Button
                {...buttonA11yProps}
                className="capture-action"
                disabled={busy}
                onClick={() => void choosePhoto()}
              >
                {busy ? '正在处理…' : '拍摄或选择照片'}
              </Button>
              <Text className="capture-privacy">
                上传前后都会剥离 EXIF；原图不会公开。分析结果始终标记为机器估计。
              </Text>
            </View>

            <View className="compare-card paper-card">
              <View className="card-heading">
                <View>
                  <Text className="section-kicker">ONION-SKIN COMPARE</Text>
                  <Text className="section-title">同视角叠片对比</Text>
                </View>
                <Text className="card-index">02</Text>
              </View>

              {comparisonPair ? (
                <>
                  <View className="comparison-stage">
                    <Image
                      className="comparison-image comparison-image--baseline"
                      src={privatePhotoUrl(comparisonPair.baseline.previewPath)}
                      mode="aspectFit"
                    />
                    <Image
                      className="comparison-image comparison-image--current"
                      src={privatePhotoUrl(comparisonPair.current.previewPath)}
                      mode="aspectFit"
                      style={{ opacity: overlayOpacity / 100 }}
                    />
                    <View className="comparison-seam" style={{ left: `${overlayOpacity}%` }}>
                      <View className="comparison-seam__handle">↔</View>
                    </View>
                    <View className="comparison-cross comparison-cross--top" />
                    <View className="comparison-cross comparison-cross--bottom" />
                    <Text className="comparison-label comparison-label--baseline">基准</Text>
                    <Text className="comparison-label comparison-label--current">当前</Text>
                  </View>
                  <View className="opacity-control">
                    <Text>当前照片透明度</Text>
                    <Text className="metric">{overlayOpacity}%</Text>
                  </View>
                  <Slider
                    min={10}
                    max={90}
                    value={overlayOpacity}
                    activeColor="#3F756B"
                    backgroundColor="#D5E0DD"
                    blockColor="#244C66"
                    blockSize={22}
                    onChange={(event) => setOverlayOpacity(event.detail.value)}
                  />
                  <View className="comparison-meta">
                    <Text>基准 · {captureTime(comparisonPair.baseline.capturedAt)}</Text>
                    <Text>当前 · {captureTime(comparisonPair.current.capturedAt)}</Text>
                  </View>
                </>
              ) : (
                <View className="comparison-empty">
                  <Text className="comparison-empty__mark">＋</Text>
                  <Text className="comparison-empty__title">需要两张同视角保留照片</Text>
                  <Text>
                    选择“保留用于对比”并以相同方向拍摄两次后，这里会生成可调透明度的叠片。
                  </Text>
                </View>
              )}
              <Text className="compare-safety">
                对比仅呈现原始视觉差异。光线、距离、衣着和时间都会影响观感，请不要把它当作健康结论。
              </Text>
            </View>
          </View>

          <View className="history-card paper-card">
            <View className="card-heading">
              <View>
                <Text className="section-kicker">PRIVATE CONTACT SHEET</Text>
                <Text className="section-title">我的进度照</Text>
              </View>
              <Text className="card-index">{String(photos.length).padStart(2, '0')}</Text>
            </View>

            {loading ? (
              <View className="history-state">正在核对私有照片清单…</View>
            ) : photos.length ? (
              <View className="photo-list">
                {photos.map((photo) => (
                  <View className="photo-strip" key={photo.id}>
                    <View className="photo-thumb-wrap">
                      <Image
                        className="photo-thumb"
                        src={privatePhotoUrl(photo.previewPath)}
                        mode="aspectFill"
                      />
                      <View className="thumb-register" aria-hidden="true" />
                    </View>
                    <View className="photo-strip__body">
                      <View className="photo-strip__heading">
                        <View>
                          <Text className="photo-strip__view">
                            {progressViewCopy[photo.view].label}
                          </Text>
                          <Text className="photo-strip__date">{captureTime(photo.capturedAt)}</Text>
                        </View>
                        <Text className={`retention-tag retention-tag--${photo.retentionMode}`}>
                          {photo.retentionMode === 'retained' ? '已保留' : '24H 自动删除'}
                        </Text>
                      </View>

                      {photo.quality ? (
                        <View className="quality-sheet">
                          <Text className="quality-sheet__label">
                            机器拍摄条件检查 ·{' '}
                            {photo.quality.overallStatus === 'ready' ? '可对位' : '建议调整'}
                          </Text>
                          <View className="quality-checks">
                            {photo.quality.checks.map((check) => (
                              <Text
                                className={`quality-check quality-check--${check.status}`}
                                key={check.key}
                              >
                                {check.status === 'ready' ? '✓' : '!'}{' '}
                                {qualityReasonCopy[check.reason]}
                              </Text>
                            ))}
                          </View>
                        </View>
                      ) : (
                        <Text className="analysis-revoked">
                          机器检查授权已撤回；保留照片仍归你所有。
                        </Text>
                      )}

                      <View className="photo-actions">
                        {photo.retentionMode === 'retained' && photo.view === view ? (
                          <>
                            <Button
                              {...buttonA11yProps}
                              className={`photo-action ${comparisonPair?.baseline.id === photo.id ? 'photo-action--active' : ''}`}
                              onClick={() => setAsBaseline(photo.id)}
                            >
                              设为基准
                            </Button>
                            <Button
                              {...buttonA11yProps}
                              className={`photo-action ${comparisonPair?.current.id === photo.id ? 'photo-action--active' : ''}`}
                              onClick={() => setAsCurrent(photo.id)}
                            >
                              设为当前
                            </Button>
                          </>
                        ) : null}
                        <Button
                          {...buttonA11yProps}
                          className="photo-action photo-action--danger"
                          onClick={() => setDeleting(photo)}
                        >
                          删除
                        </Button>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View className="history-state">
                <Text className="history-state__title">这里还没有照片</Text>
                <Text>先建立一张拍摄条件明确、保留方式清楚的进度照。</Text>
              </View>
            )}
          </View>

          <Text className="progress-footer">
            衡迹不会从照片诊断疾病、判断“好坏体态”或生成精确体脂率。身体不适请咨询专业医疗人员。
          </Text>
        </View>
      </ScrollView>

      {deleting ? (
        <View className="delete-layer" role="dialog" aria-modal="true" aria-label="确认删除进度照">
          <View className="delete-card">
            <Text className="section-kicker">REMOVE PRIVATE PHOTO</Text>
            <Text className="delete-card__title">
              永久删除这张{progressViewCopy[deleting.view].label}照片？
            </Text>
            <Text className="delete-card__body">
              净化照片与机器拍摄条件检查会一起删除；该操作不能撤销。
            </Text>
            <View className="delete-card__actions">
              <Button
                {...buttonA11yProps}
                className="delete-button"
                onClick={() => setDeleting(undefined)}
              >
                保留照片
              </Button>
              <Button
                {...buttonA11yProps}
                className="delete-button delete-button--danger"
                disabled={busy}
                onClick={() => void confirmDelete()}
              >
                确认删除
              </Button>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  )
}

const PrivatePhotoRoutePage = () =>
  Taro.getCurrentInstance().router?.params.kind === 'food' ? (
    <FoodPhotoWorkflowPage />
  ) : (
    <ProgressPhotosPage />
  )

export default PrivatePhotoRoutePage
