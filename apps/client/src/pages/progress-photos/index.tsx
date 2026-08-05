import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Image, ScrollView, Slider, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { CreateProgressPhoto, ProgressPhotoItem } from '@myfitness/contracts'
import {
  progressPhotoAnalysisConsentVersion,
  progressPhotoRetentionConsentVersion,
} from '@myfitness/contracts/progress-photo.constants'

import { buttonActivationProps } from '../../lib/accessibility'
import {
  ApiError,
  deleteProgressPhoto,
  listProgressPhotos,
  privatePhotoUrl,
  reserveProgressPhoto,
  uploadProgressPhoto,
} from '../../lib/api'
import { describeWorkbenchFailure, type WorkbenchRecovery } from '../../lib/workbench-recovery'
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
  const pendingReservation = useRef<{ key: string; payload: CreateProgressPhoto }>()
  const pendingUploadId = useRef('')
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
  const [recovery, setRecovery] = useState<WorkbenchRecovery>()

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

  const resetCaptureAttempt = () => {
    pendingReservation.current = undefined
    pendingUploadId.current = ''
    setRecovery(undefined)
  }

  const finishCapture = (
    uploaded: ProgressPhotoItem,
    message?: string,
    currentPhotos?: ProgressPhotoItem[],
  ) => {
    setPhotos(
      currentPhotos ?? ((items) => [uploaded, ...items.filter((item) => item.id !== uploaded.id)]),
    )
    resetCaptureAttempt()
    setAnalysisConsent(false)
    setRetentionConsent(false)
    setFeedback(
      message ??
        (uploaded.quality?.overallStatus === 'ready'
          ? '照片已完成净化与对位条件检查。机器只检查画幅、清晰度、亮度和对比度。'
          : '照片已保存；下方列出了需要调整的拍摄条件。这不是身体或体态判断。'),
    )
  }

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
    try {
      let selected
      try {
        selected = await Taro.chooseImage({
          count: 1,
          sizeType: ['original'],
          sourceType: ['camera', 'album'],
        })
      } catch (error) {
        const message = messageOf(error)
        if (!message.toLowerCase().includes('cancel')) setFeedback(message)
        return
      }
      const filePath = selected.tempFilePaths[0]
      if (!filePath) throw new Error('没有读取到所选照片')

      const reservation =
        pendingReservation.current ??
        ({
          key: requestKey(),
          payload: {
            view,
            capturedAt: new Date().toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
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
        } satisfies { key: string; payload: CreateProgressPhoto })
      pendingReservation.current = reservation

      let ticket
      try {
        ticket = await reserveProgressPhoto(reservation.payload, reservation.key)
      } catch (error) {
        setRecovery(describeWorkbenchFailure('progress_reserve', error))
        return
      }
      pendingReservation.current = undefined
      pendingUploadId.current = ticket.id

      try {
        finishCapture(await uploadProgressPhoto(ticket.upload.path, filePath))
      } catch (error) {
        setRecovery(describeWorkbenchFailure('progress_upload', error))
      }
    } catch (error) {
      setFeedback(messageOf(error))
    } finally {
      setBusy(false)
    }
  }

  const reconcileUpload = async () => {
    if (!recovery || recovery.operation !== 'progress_upload' || !pendingUploadId.current) return
    setBusy(true)
    try {
      const result = await listProgressPhotos()
      const current = result.items.find((item) => item.id === pendingUploadId.current)
      setPhotos(result.items)
      if (current) {
        finishCapture(
          current,
          '核对完成：净化照片已进入当前私有清单；机器结果仍只描述拍摄条件。',
          result.items,
        )
        return
      }
      setRecovery({
        ...recovery,
        authority: 'terminal',
        eyebrow: 'NO REVIEWABLE PHOTO / 未加入私有清单',
        message:
          '核对后，当前私有清单没有这次预约对应的照片。页面不会重放媒体；未使用预约与临时数据按既有到期清理。',
        actionLabel: '返回重新拍摄',
      })
    } catch (error) {
      setRecovery(describeWorkbenchFailure('progress_upload', error))
    } finally {
      setBusy(false)
    }
  }

  const reconcileDelete = async () => {
    if (!recovery || recovery.operation !== 'progress_delete' || !deleting) return
    setBusy(true)
    try {
      const result = await listProgressPhotos()
      const current = result.items.find((item) => item.id === deleting.id)
      setPhotos(result.items)
      if (!current) {
        if (baselineId === deleting.id) setBaselineId('')
        if (currentId === deleting.id) setCurrentId('')
        setDeleting(undefined)
        setRecovery(undefined)
        setFeedback(
          '核对完成：照片已离开当前私有清单；对象删除由持久任务继续处理，不能仅据此声称物理字节已经删除。',
        )
        return
      }
      setRecovery({
        ...recovery,
        authority: 'terminal',
        eyebrow: 'CURRENT STATE / 照片仍在私有清单',
        message:
          '核对后照片仍可见，本次删除没有成功证据。页面不会自动重放删除；请返回清单后重新明确确认。',
        actionLabel: '返回检查照片',
      })
    } catch (error) {
      setRecovery(describeWorkbenchFailure('progress_delete', error))
    } finally {
      setBusy(false)
    }
  }

  const handleRecoveryAction = () => {
    if (!recovery) return
    if (recovery.authority === 'terminal') {
      const operation = recovery.operation
      resetCaptureAttempt()
      if (operation === 'progress_delete') setDeleting(undefined)
      setFeedback(
        operation === 'progress_delete'
          ? '当前删除尝试已终止；请核对照片清单后重新明确确认。'
          : '当前拍摄尝试已终止；页面未保存照片或重放媒体，请重新开始。',
      )
      return
    }
    if (recovery.operation === 'progress_reserve') {
      void choosePhoto()
      return
    }
    if (recovery.operation === 'progress_upload') {
      void reconcileUpload()
      return
    }
    if (recovery.operation === 'progress_delete') void reconcileDelete()
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setBusy(true)
    try {
      await deleteProgressPhoto(deleting.id)
      setPhotos((items) => items.filter((item) => item.id !== deleting.id))
      if (baselineId === deleting.id) setBaselineId('')
      if (currentId === deleting.id) setCurrentId('')
      setDeleting(undefined)
      setRecovery(undefined)
      setFeedback('照片已从当前私有清单移除；对象删除由持久任务处理，可在数据权限中继续核对。')
    } catch (error) {
      setRecovery(describeWorkbenchFailure('progress_delete', error))
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
              {...buttonActivationProps(() => void Taro.navigateBack())}
              className="progress-back"
              aria-label="返回身体记录"
            >
              ←
            </Button>
            <View className="progress-brand">
              <Text>衡迹</Text>
              <Text className="progress-brand__en">ALIGNMENT CONTACT SHEET</Text>
            </View>
            <Button
              {...buttonActivationProps(
                () => void Taro.navigateTo({ url: '/pages/privacy/index' }),
              )}
              className="privacy-link"
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
            <View className="progress-feedback" role="status" aria-live="polite" aria-atomic="true">
              <Text>{feedback}</Text>
              <Button {...buttonActivationProps(() => setFeedback(''))} className="feedback-close">
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
                    {...buttonActivationProps(() => setView(item), busy || Boolean(recovery))}
                    key={item}
                    className={`view-tab ${view === item ? 'view-tab--active' : ''}`}
                    aria-pressed={view === item}
                    disabled={busy || Boolean(recovery)}
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
                  {...buttonActivationProps(
                    () => {
                      setRetained(false)
                      setRetentionConsent(false)
                    },
                    busy || Boolean(recovery),
                  )}
                  className={`retention-option ${!retained ? 'retention-option--active' : ''}`}
                  aria-pressed={!retained}
                  disabled={busy || Boolean(recovery)}
                >
                  <Text className="retention-option__title">仅本次分析</Text>
                  <Text className="retention-option__note">
                    24 小时内自动删除，不能进入长期对比
                  </Text>
                </Button>
                <Button
                  {...buttonActivationProps(() => setRetained(true), busy || Boolean(recovery))}
                  className={`retention-option ${retained ? 'retention-option--active' : ''}`}
                  aria-pressed={retained}
                  disabled={busy || Boolean(recovery)}
                >
                  <Text className="retention-option__title">保留用于对比</Text>
                  <Text className="retention-option__note">保留净化照片，直到你删除或撤回授权</Text>
                </Button>
              </View>

              <Button
                {...buttonActivationProps(
                  () => setAnalysisConsent((value) => !value),
                  busy || Boolean(recovery),
                )}
                className={`consent-toggle ${analysisConsent ? 'consent-toggle--checked' : ''}`}
                style={{
                  color: analysisConsent ? 'var(--color-ink)' : 'var(--color-muted)',
                }}
                aria-pressed={analysisConsent}
                disabled={busy || Boolean(recovery)}
              >
                <Text className="consent-toggle__box">{analysisConsent ? '✓' : ''}</Text>
                <Text>同意本次照片净化与拍摄条件机器检查</Text>
              </Button>
              {retained ? (
                <Button
                  {...buttonActivationProps(
                    () => setRetentionConsent((value) => !value),
                    busy || Boolean(recovery),
                  )}
                  className={`consent-toggle ${retentionConsent ? 'consent-toggle--checked' : ''}`}
                  style={{
                    color: retentionConsent ? 'var(--color-ink)' : 'var(--color-muted)',
                  }}
                  aria-pressed={retentionConsent}
                  disabled={busy || Boolean(recovery)}
                >
                  <Text className="consent-toggle__box">{retentionConsent ? '✓' : ''}</Text>
                  <Text>另行同意保留净化照片用于长期对比</Text>
                </Button>
              ) : null}

              {recovery && recovery.operation !== 'progress_delete' ? (
                <View
                  className="progress-recovery"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <Text className="progress-recovery__eyebrow">{recovery.eyebrow}</Text>
                  <Text className="progress-recovery__message">{recovery.message}</Text>
                  <Button
                    {...buttonActivationProps(handleRecoveryAction, busy)}
                    className="progress-recovery__action"
                    style={{ color: 'var(--color-warning)' }}
                    disabled={busy}
                  >
                    {busy ? '核对中…' : recovery.actionLabel}
                  </Button>
                </View>
              ) : null}

              <Button
                {...buttonActivationProps(() => void choosePhoto(), busy || Boolean(recovery))}
                className="capture-action"
                style={{ color: 'var(--color-paper)' }}
                disabled={busy || Boolean(recovery)}
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
                              {...buttonActivationProps(() => setAsBaseline(photo.id))}
                              className={`photo-action ${comparisonPair?.baseline.id === photo.id ? 'photo-action--active' : ''}`}
                            >
                              设为基准
                            </Button>
                            <Button
                              {...buttonActivationProps(() => setAsCurrent(photo.id))}
                              className={`photo-action ${comparisonPair?.current.id === photo.id ? 'photo-action--active' : ''}`}
                            >
                              设为当前
                            </Button>
                          </>
                        ) : null}
                        <Button
                          {...buttonActivationProps(() => setDeleting(photo))}
                          className="photo-action photo-action--danger"
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
            {recovery?.operation === 'progress_delete' ? (
              <View
                className="progress-recovery progress-recovery--dialog"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <Text className="progress-recovery__eyebrow">{recovery.eyebrow}</Text>
                <Text className="progress-recovery__message">{recovery.message}</Text>
                <Button
                  {...buttonActivationProps(handleRecoveryAction, busy)}
                  className="progress-recovery__action"
                  style={{ color: 'var(--color-warning)' }}
                  disabled={busy}
                >
                  {busy ? '核对中…' : recovery.actionLabel}
                </Button>
              </View>
            ) : null}
            <View className="delete-card__actions">
              <Button
                {...buttonActivationProps(() => setDeleting(undefined), busy || Boolean(recovery))}
                className="delete-button"
                style={{ color: 'var(--color-ink)' }}
                disabled={busy || Boolean(recovery)}
              >
                保留照片
              </Button>
              <Button
                {...buttonActivationProps(() => void confirmDelete(), busy || Boolean(recovery))}
                className="delete-button delete-button--danger"
                style={{ color: 'var(--color-paper)' }}
                disabled={busy || Boolean(recovery)}
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
