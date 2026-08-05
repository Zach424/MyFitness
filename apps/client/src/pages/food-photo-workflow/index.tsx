import { useEffect, useState } from 'react'
import { Button, Image, Input, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { ConfirmFoodPhotoCandidate, FoodPhotoAnalysis } from '@myfitness/contracts'

import { buttonA11yProps } from '../../lib/accessibility'
import {
  ApiError,
  confirmFoodPhotoCandidate,
  deleteFoodPhotoCandidate,
  listFoodPhotoCandidates,
  privatePhotoUrl,
  reserveFoodPhoto,
  uploadFoodPhoto,
} from '../../lib/api'
import {
  buildFoodPhotoConfirmation,
  reviewDraftFromAnalysis,
  type FoodPhotoReviewDraft,
} from './food-photo-workflow.model'
import './index.scss'

const confidenceLabels = { low: '低置信', medium: '中置信', high: '高置信' } as const

const photoRequestKey = () =>
  `food-photo-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`

const messageOf = (error: unknown) =>
  error instanceof ApiError || error instanceof Error ? error.message : '操作失败，请稍后重试'

type FoodPhotoEventChannel = {
  emit?: (eventName: 'foodPhotoConfirmed', items: ConfirmFoodPhotoCandidate['items']) => void
}

const openerEventChannel = () =>
  Taro.getCurrentInstance().page?.getOpenerEventChannel?.() as FoodPhotoEventChannel | undefined

const FoodPhotoWorkflowPage = () => {
  const [analysis, setAnalysis] = useState<FoodPhotoAnalysis>()
  const [review, setReview] = useState<FoodPhotoReviewDraft>({ selected: [], grams: {} })
  const [consent, setConsent] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')

  const showAnalysis = (next: FoodPhotoAnalysis) => {
    setAnalysis(next)
    setReview(reviewDraftFromAnalysis(next))
  }

  const clearAnalysis = () => {
    setAnalysis(undefined)
    setReview({ selected: [], grams: {} })
  }

  useEffect(() => {
    let active = true
    void listFoodPhotoCandidates()
      .then((result) => {
        if (!active) return
        const reviewable = result.items.find((item) => item.status === 'ready') ?? result.items[0]
        if (reviewable) showAnalysis(reviewable)
      })
      .catch((error: unknown) => {
        if (active) setFeedback(messageOf(error))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const choosePhoto = async () => {
    if (!consent) {
      setFeedback('请先确认本次照片用途和删除规则。')
      return
    }
    setBusy(true)
    let reservedId = ''
    try {
      const selected = await Taro.chooseImage({
        count: 1,
        sizeType: ['original'],
        sourceType: ['album', 'camera'],
      })
      const filePath = selected.tempFilePaths[0]
      if (!filePath) throw new Error('没有读取到所选照片')
      const ticket = await reserveFoodPhoto(photoRequestKey())
      reservedId = ticket.id
      const next = await uploadFoodPhoto(ticket.upload.path, filePath)
      showAnalysis(next)
      setConsent(false)
      setFeedback(
        next.status === 'ready'
          ? '校样已生成。逐项核对食物与克重；它们仍不是餐食记录。'
          : '没有生成可用候选，媒体删除已开始；你仍可返回手动记录。',
      )
    } catch (error) {
      if (reservedId) await deleteFoodPhotoCandidate(reservedId).catch(() => undefined)
      const message = messageOf(error)
      if (!message.toLowerCase().includes('cancel')) setFeedback(message)
    } finally {
      setBusy(false)
    }
  }

  const toggleCandidate = (catalogKey: string) => {
    setReview((current) => ({
      ...current,
      selected: current.selected.includes(catalogKey)
        ? current.selected.filter((key) => key !== catalogKey)
        : [...current.selected, catalogKey],
    }))
  }

  const discardPhoto = async () => {
    if (!analysis) return
    setBusy(true)
    try {
      await deleteFoodPhotoCandidate(analysis.id)
      clearAnalysis()
      setFeedback('照片和衍生候选已删除。你可以返回餐食草稿或重新开始。')
    } catch (error) {
      setFeedback(messageOf(error))
    } finally {
      setBusy(false)
    }
  }

  const confirmPhoto = async () => {
    if (!analysis) return
    const channel = openerEventChannel()
    if (!channel?.emit) {
      setFeedback('请返回餐食草稿，并从“打开照片校样台”重新进入后再确认。')
      return
    }

    let request: ConfirmFoodPhotoCandidate
    try {
      request = buildFoodPhotoConfirmation(analysis, review)
    } catch (error) {
      setFeedback(messageOf(error))
      return
    }

    setBusy(true)
    try {
      const confirmed = await confirmFoodPhotoCandidate(analysis.id, request)
      channel.emit('foodPhotoConfirmed', confirmed.items)
      await Taro.navigateBack()
    } catch (error) {
      setFeedback(messageOf(error))
      setBusy(false)
    }
  }

  return (
    <View className="food-photo-shell">
      <View className="food-photo-topbar">
        <Button
          {...buttonA11yProps}
          className="food-photo-back"
          aria-label="返回餐食草稿"
          onClick={() => void Taro.navigateBack()}
        >
          ←
        </Button>
        <View>
          <Text className="food-photo-topbar__eyebrow">PRIVATE CUSTODY / FOOD</Text>
          <Text className="food-photo-topbar__title">餐食照片校样台</Text>
        </View>
        <Text className="food-photo-topbar__code metric">24H</Text>
      </View>

      <ScrollView className="food-photo-scroll" scrollY enhanced showScrollbar={false}>
        <View className="food-photo-workbench">
          <View className="food-photo-hero">
            <Text className="food-photo-hero__eyebrow">AI PROPOSAL · NOT A RECORD</Text>
            <Text className="food-photo-hero__title">先校样，再带回餐食。</Text>
            <Text className="food-photo-hero__body">
              这里不读取当前餐食草稿。照片和未确认候选只在临时校样流程中处理；确认后仅返回目录食物键与整数克重。
            </Text>
            <View className="food-photo-custody" aria-label="照片处理边界">
              <Text>01 本次授权</Text>
              <Text>02 私有校样</Text>
              <Text>03 确认后删图</Text>
            </View>
          </View>

          {feedback ? (
            <View className="food-photo-feedback" role="status" aria-live="polite">
              <Text>{feedback}</Text>
            </View>
          ) : null}

          <View className="food-photo-card">
            {loading ? (
              <View className="food-photo-loading">
                <Text className="metric">CHECKING PRIVATE PROOF…</Text>
                <Text>正在检查是否有待处理校样。</Text>
              </View>
            ) : !analysis ? (
              <View className="photo-intake">
                <Text className="photo-section-label">NEW PROOF / 一次一授权</Text>
                <Text className="photo-intake__title">选择一张餐食照片</Text>
                <Text className="photo-intake__body">
                  服务端会重编码并移除元数据。照片最长保留 24
                  小时，确认、删除、失败或到期时进入可追踪删除流程；不会自动创建餐食。
                </Text>
                <Button
                  {...buttonA11yProps}
                  className={`photo-consent ${consent ? 'photo-consent--active' : ''}`}
                  aria-pressed={consent}
                  onClick={() => setConsent((current) => !current)}
                >
                  <Text className="photo-consent__check">{consent ? '✓' : '□'}</Text>
                  <Text>我同意本次上传与上述处理</Text>
                </Button>
                <Button
                  {...buttonA11yProps}
                  className="photo-choose"
                  disabled={!consent || busy}
                  aria-disabled={!consent || busy}
                  onClick={() => void choosePhoto()}
                >
                  {busy ? '正在制作校样…' : '选择一张餐食照片'}
                </Button>
                <Text className="photo-intake__formats metric">JPEG · PNG · WEBP / ≤ 6 MB</Text>
              </View>
            ) : analysis.status === 'ready' ? (
              <View className="photo-review">
                <View className="photo-review__proof">
                  <Image
                    className="photo-review__image"
                    src={privatePhotoUrl(analysis.previewPath!)}
                    mode="aspectFill"
                    aria-label="已移除元数据的私有餐食照片预览"
                  />
                  <View className="photo-review__stamp">未确认 / PROOF</View>
                  <View className="photo-review__caption">
                    <Text>
                      {analysis.source === 'fixture'
                        ? '本地演示夹具 · 非真实识别'
                        : 'AI 图像候选 · 仍需人工确认'}
                    </Text>
                    <Text className="metric">24H AUTO DELETE</Text>
                  </View>
                </View>

                <View className="photo-candidates">
                  <Text className="photo-section-label">REVIEW / 逐项确认</Text>
                  <Text className="photo-candidates__summary">{analysis.content?.summary}</Text>
                  {(analysis.content?.candidates ?? []).map((candidate, index) => {
                    const active = review.selected.includes(candidate.catalogKey)
                    return (
                      <View className="photo-candidate" key={candidate.catalogKey}>
                        <Button
                          {...buttonA11yProps}
                          className={`photo-candidate__select ${active ? 'photo-candidate__select--active' : ''}`}
                          aria-pressed={active}
                          aria-label={`${active ? '取消选择' : '选择'}${candidate.label}`}
                          onClick={() => toggleCandidate(candidate.catalogKey)}
                        >
                          <Text className="photo-candidate__number metric">
                            {String(index + 1).padStart(2, '0')}
                          </Text>
                          <View>
                            <Text className="photo-candidate__name">{candidate.label}</Text>
                            <Text className="photo-candidate__basis">{candidate.visualBasis}</Text>
                          </View>
                          <Text
                            className={`photo-candidate__confidence photo-candidate__confidence--${candidate.confidence}`}
                          >
                            {confidenceLabels[candidate.confidence]}
                          </Text>
                        </Button>
                        <View className="photo-candidate__portion">
                          <Text className="metric">
                            估计 {candidate.portionRange.minGrams}–{candidate.portionRange.maxGrams}{' '}
                            g
                          </Text>
                          <View className="photo-candidate__input-wrap">
                            <Input
                              className="photo-candidate__input metric"
                              type="number"
                              disabled={!active}
                              value={review.grams[candidate.catalogKey] ?? ''}
                              aria-label={`${candidate.label}确认克重`}
                              onInput={(event) =>
                                setReview((current) => ({
                                  ...current,
                                  grams: {
                                    ...current.grams,
                                    [candidate.catalogKey]: event.detail.value,
                                  },
                                }))
                              }
                            />
                            <Text>g</Text>
                          </View>
                        </View>
                      </View>
                    )
                  })}
                  {analysis.content?.needsManualEntry ? (
                    <Text className="photo-candidates__manual">
                      画面或目录不足以覆盖全部食物。确认已有候选后，请回到餐食草稿手动补充。
                    </Text>
                  ) : null}
                </View>

                <View className="photo-review__actions">
                  <Button
                    {...buttonA11yProps}
                    className="photo-review__discard"
                    style={{ color: 'var(--color-pulse)' }}
                    disabled={busy}
                    onClick={() => void discardPhoto()}
                  >
                    删除校样
                  </Button>
                  <Button
                    {...buttonA11yProps}
                    className="photo-review__confirm"
                    style={{ color: 'var(--color-paper)' }}
                    disabled={busy}
                    onClick={() => void confirmPhoto()}
                  >
                    {busy ? '正在确认…' : `确认 ${review.selected.length} 项并返回草稿`}
                  </Button>
                </View>
                <Text className="photo-review__warning">
                  此操作会删除照片并把确认项交回上一页；你仍需核对营养参考值并点击“保存餐次”。
                </Text>
              </View>
            ) : (
              <View className="photo-unavailable">
                <Text className="photo-review__stamp photo-review__stamp--deleted">
                  MEDIA DELETED
                </Text>
                <Text className="photo-unavailable__title">没有生成可用候选</Text>
                <Text className="photo-unavailable__body">
                  照片删除已开始，不会生成猜测记录。删除本条衍生结果后，可以返回手动添加或重新尝试。
                </Text>
                <Button
                  {...buttonA11yProps}
                  className="photo-review__discard photo-review__discard--full"
                  style={{ color: 'var(--color-pulse)' }}
                  disabled={busy}
                  onClick={() => void discardPhoto()}
                >
                  删除衍生结果
                </Button>
              </View>
            )}
          </View>

          <Text className="food-photo-footnote">
            这是一般健身记录辅助，不判断食物质量、热量目标、疾病或治疗；演示夹具也不代表真实图像识别能力。
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}

export default FoodPhotoWorkflowPage
