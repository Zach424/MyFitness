import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Image, Input, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { ConfirmFoodPhotoCandidate, FoodPhotoAnalysis } from '@myfitness/contracts'

import { buttonActivationProps, deferH5Focus } from '../../lib/accessibility'
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
import {
  PrivateInventoryReadState,
  PrivateInventoryReadToolbar,
} from '../../components/private-inventory-read-state'
import {
  classifyPrivateInventoryReadFailure,
  privateInventoryReadFailureCopy,
  privateInventoryReadPhase,
  type PrivateInventoryReadFailureKind,
} from '../../lib/private-inventory-read'
import {
  describeWorkbenchFailure,
  type WorkbenchOperation,
  type WorkbenchRecovery,
} from '../../lib/workbench-recovery'
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
  const pendingReservationKey = useRef('')
  const analysisRef = useRef<FoodPhotoAnalysis>()
  const inventoryRequest = useRef(0)
  const inventoryBusyRef = useRef(false)
  const hasInventorySnapshotRef = useRef(false)
  const [analysis, setAnalysis] = useState<FoodPhotoAnalysis>()
  const [inventory, setInventory] = useState<FoodPhotoAnalysis[]>([])
  const [hasInventorySnapshot, setHasInventorySnapshot] = useState(false)
  const [inventoryBusy, setInventoryBusy] = useState(true)
  const [inventoryFailure, setInventoryFailure] = useState<PrivateInventoryReadFailureKind>()
  const [review, setReview] = useState<FoodPhotoReviewDraft>({ selected: [], grams: {} })
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [recovery, setRecovery] = useState<WorkbenchRecovery>()
  const [recoveryTargetId, setRecoveryTargetId] = useState('')

  const showAnalysis = useCallback((next: FoodPhotoAnalysis, preserveReview = false) => {
    const sameProof = analysisRef.current?.id === next.id
    analysisRef.current = next
    setAnalysis(next)
    if (!preserveReview || !sameProof) setReview(reviewDraftFromAnalysis(next))
    setRecovery(undefined)
    setRecoveryTargetId('')
  }, [])

  const clearAnalysis = useCallback(() => {
    analysisRef.current = undefined
    setAnalysis(undefined)
    setReview({ selected: [], grams: {} })
  }, [])

  const acceptInventory = useCallback(
    (items: FoodPhotoAnalysis[]) => {
      const currentId = analysisRef.current?.id
      const reviewable =
        items.find((item) => item.id === currentId) ??
        items.find((item) => item.status === 'ready') ??
        items[0]
      setInventory(items)
      hasInventorySnapshotRef.current = true
      setHasInventorySnapshot(true)
      setInventoryFailure(undefined)
      if (reviewable) showAnalysis(reviewable, reviewable.id === currentId)
      else clearAnalysis()
    },
    [clearAnalysis, showAnalysis],
  )

  const loadInventory = useCallback(async () => {
    if (inventoryBusyRef.current) return
    inventoryBusyRef.current = true
    const request = ++inventoryRequest.current
    const hadSnapshot = hasInventorySnapshotRef.current
    setInventoryBusy(true)
    setInventoryFailure(undefined)
    try {
      const result = await listFoodPhotoCandidates()
      if (request !== inventoryRequest.current) return
      acceptInventory(result.items)
      if (!hadSnapshot) deferH5Focus('food-photo-back', 350)
    } catch (error) {
      if (request !== inventoryRequest.current) return
      setInventoryFailure(classifyPrivateInventoryReadFailure(error))
      deferH5Focus('food-photo-inventory-retry', hadSnapshot ? 80 : 500)
    } finally {
      if (request === inventoryRequest.current) {
        inventoryBusyRef.current = false
        setInventoryBusy(false)
      }
    }
  }, [acceptInventory])

  useEffect(() => {
    inventoryBusyRef.current = false
    void loadInventory()
    return () => {
      inventoryRequest.current += 1
      inventoryBusyRef.current = false
    }
  }, [loadInventory])

  const inventoryPhase = privateInventoryReadPhase({
    hasSnapshot: hasInventorySnapshot,
    busy: inventoryBusy,
    hasFailure: Boolean(inventoryFailure),
  })
  const inventoryActionsDisabled = inventoryPhase !== 'ready'
  const inventoryFailurePresentation = inventoryFailure
    ? privateInventoryReadFailureCopy(inventoryFailure, 'food-proof', hasInventorySnapshot)
    : undefined

  const choosePhoto = async () => {
    if (inventoryActionsDisabled) return
    if (!consent) {
      setFeedback('请先确认本次照片用途和删除规则。')
      return
    }
    setBusy(true)
    setFeedback('')
    setRecovery(undefined)
    setRecoveryTargetId('')
    let reservedId = ''
    let operation: WorkbenchOperation = 'photo_reserve'
    try {
      const selected = await Taro.chooseImage({
        count: 1,
        sizeType: ['original'],
        sourceType: ['album', 'camera'],
      })
      const filePath = selected.tempFilePaths[0]
      if (!filePath) throw new Error('没有读取到所选照片')
      const ticket = await reserveFoodPhoto((pendingReservationKey.current ||= photoRequestKey()))
      reservedId = ticket.id
      pendingReservationKey.current = ''
      operation = 'photo_upload'
      const next = await uploadFoodPhoto(ticket.upload.path, filePath)
      setInventory((items) => [next, ...items.filter((item) => item.id !== next.id)])
      hasInventorySnapshotRef.current = true
      setHasInventorySnapshot(true)
      setInventoryFailure(undefined)
      showAnalysis(next)
      setConsent(false)
      setFeedback(
        next.status === 'ready'
          ? '校样已生成。逐项核对食物与克重；它们仍不是餐食记录。'
          : '没有生成可用候选，媒体删除已开始；你仍可返回手动记录。',
      )
    } catch (error) {
      const message = messageOf(error)
      if (message.toLowerCase().includes('cancel')) {
        if (!reservedId) pendingReservationKey.current = ''
      } else {
        setRecovery(describeWorkbenchFailure(operation, error))
        setRecoveryTargetId(reservedId)
      }
    } finally {
      setBusy(false)
    }
  }

  const toggleCandidate = (catalogKey: string) => {
    if (recovery || inventoryActionsDisabled) return
    setReview((current) => ({
      ...current,
      selected: current.selected.includes(catalogKey)
        ? current.selected.filter((key) => key !== catalogKey)
        : [...current.selected, catalogKey],
    }))
  }

  const discardPhoto = async () => {
    if (!analysis || inventoryActionsDisabled) return
    setBusy(true)
    setFeedback('')
    setRecovery(undefined)
    setRecoveryTargetId('')
    try {
      await deleteFoodPhotoCandidate(analysis.id)
      setInventory((items) => items.filter((item) => item.id !== analysis.id))
      clearAnalysis()
      setFeedback('照片和衍生候选已删除。你可以返回餐食草稿或重新开始。')
    } catch (error) {
      setRecovery(describeWorkbenchFailure('photo_delete', error))
      setRecoveryTargetId(analysis.id)
    } finally {
      setBusy(false)
    }
  }

  const confirmPhoto = async () => {
    if (!analysis || inventoryActionsDisabled) return
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
    setFeedback('')
    setRecovery(undefined)
    setRecoveryTargetId('')
    try {
      const confirmed = await confirmFoodPhotoCandidate(analysis.id, request)
      channel.emit('foodPhotoConfirmed', confirmed.items)
      await Taro.navigateBack()
    } catch (error) {
      setRecovery(describeWorkbenchFailure('photo_confirm', error))
      setRecoveryTargetId(analysis.id)
      setBusy(false)
    }
  }

  const reconcilePhotoState = async () => {
    if (!recovery || !recoveryTargetId) return
    setBusy(true)
    try {
      const result = await listFoodPhotoCandidates()
      const current = result.items.find((item) => item.id === recoveryTargetId)
      if (current) {
        acceptInventory(result.items)
        setFeedback(
          recovery.operation === 'photo_upload'
            ? '核对完成：服务端已有可审阅结果；没有重复上传，也没有写入餐食草稿。'
            : recovery.operation === 'photo_confirm'
              ? '核对完成：服务端仍显示未确认校样；没有候选被带回餐食，可重新核对后明确确认。'
              : '核对完成：服务端仍显示此校样可审阅，删除没有成功证据；如仍需删除，请再次明确操作。',
        )
        return
      }

      setInventory(result.items)
      hasInventorySnapshotRef.current = true
      setHasInventorySnapshot(true)
      setInventoryFailure(undefined)
      clearAnalysis()
      if (recovery.operation === 'photo_upload') {
        setRecovery({
          ...recovery,
          eyebrow: 'NOT REVIEWABLE / 禁止重复上传',
          message:
            '服务端当前没有返回可审阅校样；它可能仍在处理，或已进入失败/到期清理。页面没有保存照片，也不会重复上传；可稍后再次只读核对。',
          actionLabel: '再次核对服务端状态',
        })
        return
      }

      setRecovery({
        ...recovery,
        authority: 'terminal',
        eyebrow:
          recovery.operation === 'photo_confirm'
            ? 'NO CONFIRMED HANDOFF / 未写入餐食'
            : 'NO REVIEWABLE PROOF / 清理状态受控',
        message:
          recovery.operation === 'photo_confirm'
            ? '服务端已不再返回这份可审阅校样，页面无法证明或恢复确认结果，因此没有向餐食草稿写入任何候选。请返回餐食后重新开始。'
            : '服务端已不再返回这份可审阅校样；页面仅据此移除校样，不声称私有媒体已经物理删除，最终状态仍由持久化清理证据负责。',
        actionLabel: recovery.operation === 'photo_confirm' ? '返回餐食重新开始' : '关闭这条状态',
      })
    } catch (error) {
      setRecovery(describeWorkbenchFailure(recovery.operation, error))
    } finally {
      setBusy(false)
    }
  }

  const handleRecoveryAction = () => {
    if (!recovery) return
    if (recovery.authority === 'retry_same_request' && recovery.operation === 'photo_reserve') {
      void choosePhoto()
      return
    }
    if (recovery.authority === 'reconcile_required') {
      void reconcilePhotoState()
      return
    }
    const operation = recovery.operation
    setRecovery(undefined)
    setRecoveryTargetId('')
    if (operation === 'photo_reserve') pendingReservationKey.current = ''
    if (operation === 'photo_confirm') {
      setFeedback('没有候选写入餐食草稿；请返回餐食后重新进入校样台。')
      void Taro.navigateBack()
      return
    }
    setFeedback('当前尝试已终止；服务端没有可审阅校样，可重新授权开始。')
    setConsent(false)
  }

  return (
    <View className="food-photo-shell">
      <View className="food-photo-topbar">
        <Button
          {...buttonActivationProps(() => void Taro.navigateBack())}
          id="food-photo-back"
          className="food-photo-back"
          aria-label="返回餐食草稿"
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

          <PrivateInventoryReadToolbar
            label={
              hasInventorySnapshot
                ? `PRIVATE INVENTORY · ${inventory.length} ITEMS`
                : 'PRIVATE INVENTORY · UNKNOWN'
            }
            buttonId="food-photo-inventory-refresh"
            busy={inventoryBusy}
            disabled={inventoryPhase !== 'ready' || busy || Boolean(recovery)}
            onRefresh={() => void loadInventory()}
          />

          <PrivateInventoryReadState
            phase={inventoryPhase}
            subject="food-proof"
            presentation={inventoryFailurePresentation}
            retainedLabel={
              hasInventorySnapshot
                ? `PRIVATE ITEMS ${inventory.length} · PAGE MEMORY`
                : 'PRIVATE ITEMS UNKNOWN'
            }
            retryId="food-photo-inventory-retry"
            retryLabel="重新核对餐食照片校样清单"
            onRetry={() => void loadInventory()}
          />

          {feedback ? (
            <View
              className="food-photo-feedback"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <Text>{feedback}</Text>
            </View>
          ) : null}

          {recovery ? (
            <View
              className="food-photo-recovery"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <Text className="food-photo-recovery__eyebrow">{recovery.eyebrow}</Text>
              <Text className="food-photo-recovery__message">{recovery.message}</Text>
              <Button
                {...buttonActivationProps(handleRecoveryAction, busy)}
                className="food-photo-recovery__action"
                style={{ color: 'var(--color-warning)' }}
                disabled={busy}
              >
                {busy ? '核对中…' : recovery.actionLabel}
              </Button>
            </View>
          ) : null}

          {hasInventorySnapshot ? (
            <View className="food-photo-card">
              {!analysis ? (
                <View className="photo-intake">
                  <Text className="photo-section-label">NEW PROOF / 一次一授权</Text>
                  <Text className="photo-intake__title">选择一张餐食照片</Text>
                  <Text className="photo-intake__body">
                    服务端会重编码并移除元数据。照片最长保留 24
                    小时，确认、删除、失败或到期时进入可追踪删除流程；不会自动创建餐食。
                  </Text>
                  <Button
                    {...buttonActivationProps(() => setConsent((current) => !current))}
                    className={`photo-consent ${consent ? 'photo-consent--active' : ''}`}
                    aria-pressed={consent}
                  >
                    <Text className="photo-consent__check">{consent ? '✓' : '□'}</Text>
                    <Text>我同意本次上传与上述处理</Text>
                  </Button>
                  <Button
                    {...buttonActivationProps(
                      () => void choosePhoto(),
                      !consent || busy || Boolean(recovery) || inventoryActionsDisabled,
                    )}
                    className="photo-choose"
                    disabled={!consent || busy || Boolean(recovery) || inventoryActionsDisabled}
                    aria-disabled={
                      !consent || busy || Boolean(recovery) || inventoryActionsDisabled
                    }
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
                            {...buttonActivationProps(
                              () => toggleCandidate(candidate.catalogKey),
                              Boolean(recovery) || inventoryActionsDisabled,
                            )}
                            className={`photo-candidate__select ${active ? 'photo-candidate__select--active' : ''}`}
                            disabled={Boolean(recovery) || inventoryActionsDisabled}
                            aria-pressed={active}
                            aria-label={`${active ? '取消选择' : '选择'}${candidate.label}`}
                          >
                            <Text className="photo-candidate__number metric">
                              {String(index + 1).padStart(2, '0')}
                            </Text>
                            <View>
                              <Text className="photo-candidate__name">{candidate.label}</Text>
                              <Text className="photo-candidate__basis">
                                {candidate.visualBasis}
                              </Text>
                            </View>
                            <Text
                              className={`photo-candidate__confidence photo-candidate__confidence--${candidate.confidence}`}
                            >
                              {confidenceLabels[candidate.confidence]}
                            </Text>
                          </Button>
                          <View className="photo-candidate__portion">
                            <Text className="metric">
                              估计 {candidate.portionRange.minGrams}–
                              {candidate.portionRange.maxGrams} g
                            </Text>
                            <View className="photo-candidate__input-wrap">
                              <Input
                                className="photo-candidate__input metric"
                                type="number"
                                disabled={!active || Boolean(recovery) || inventoryActionsDisabled}
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
                      {...buttonActivationProps(
                        () => void discardPhoto(),
                        busy || Boolean(recovery) || inventoryActionsDisabled,
                      )}
                      className="photo-review__discard"
                      style={{ color: 'var(--color-pulse)' }}
                      disabled={busy || Boolean(recovery) || inventoryActionsDisabled}
                    >
                      删除校样
                    </Button>
                    <Button
                      {...buttonActivationProps(
                        () => void confirmPhoto(),
                        busy || Boolean(recovery) || inventoryActionsDisabled,
                      )}
                      className="photo-review__confirm"
                      style={{ color: 'var(--color-paper)' }}
                      disabled={busy || Boolean(recovery) || inventoryActionsDisabled}
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
                    {...buttonActivationProps(
                      () => void discardPhoto(),
                      busy || Boolean(recovery) || inventoryActionsDisabled,
                    )}
                    className="photo-review__discard photo-review__discard--full"
                    style={{ color: 'var(--color-pulse)' }}
                    disabled={busy || Boolean(recovery) || inventoryActionsDisabled}
                  >
                    删除衍生结果
                  </Button>
                </View>
              )}
            </View>
          ) : null}

          <Text className="food-photo-footnote">
            这是一般健身记录辅助，不判断食物质量、热量目标、疾病或治疗；演示夹具也不代表真实图像识别能力。
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}

export default FoodPhotoWorkflowPage
