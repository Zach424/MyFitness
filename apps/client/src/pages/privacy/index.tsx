import { useEffect, useMemo, useRef, useState } from 'react'

import type {
  AccountDeletionResult,
  PrivacyOverview,
  RevocableConsentPurpose,
} from '@myfitness/contracts'
import { accountDeletionConfirmationPhrase } from '@myfitness/contracts/privacy.constants'
import { Button, Input, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import {
  buttonActivationProps,
  buttonA11yProps,
  checkboxA11yProps,
  deferH5Focus,
} from '../../lib/accessibility'
import {
  deletePrivacyAccount,
  forgetErasureReceipt,
  getErasureReceiptStatus,
  getPrivacyOverview,
  logoutClientSession,
  prepareAccountDeletion,
  recoverPendingAccountDeletion,
  revokeOptionalConsent,
} from '../../lib/api'
import {
  classifyPrivacyReadFailure,
  consentCopy,
  consentStatusCopy,
  deletionReady,
  formatInventoryCount,
  formatReceiptToken,
  privacyReadPhase,
  privacyCategoryCopy,
  type PrivacyReadFailureKind,
} from './privacy.model'
import {
  classifyRevocationEvidence,
  describeRevocationFailure,
  describeRevocationReconciliationFailure,
  type RevocationRecoveryReceipt,
} from './privacy-revoke-recovery'
import { ConsentReceiptHistory } from './consent-receipt-history'
import './index.scss'

type ExportChoice = 'downloaded' | 'skip' | null
type RevocationRecovery = {
  purpose: RevocableConsentPurpose
  receipt: RevocationRecoveryReceipt
}

const privacyReadFailureCopy = (
  kind: PrivacyReadFailureKind,
  hasSnapshot: boolean,
): { eyebrow: string; title: string; detail: string } => {
  if (kind === 'offline') {
    return {
      eyebrow: 'OFFLINE / 连接未完成',
      title: hasSnapshot ? '数据清单复核没有完成' : '还没有核对销户回执与数据清单',
      detail: hasSnapshot
        ? '上次成功读取的清单仍在下方，但导出、撤回授权与永久删除均已冻结。'
        : '页面必须先核对本机是否有待恢复的销户回执，再读取账户清单；当前不会显示零数据或开放敏感操作。',
    }
  }
  if (kind === 'refused') {
    return {
      eyebrow: 'READ REFUSED / 读取被拒绝',
      title: hasSnapshot ? '服务拒绝了本次清单复核' : '服务没有接受本次隐私核对',
      detail: hasSnapshot
        ? '旧清单继续只读保留；重新读取前不会生成导出、撤回授权或准备销户。'
        : '销户回执与数据库存仍是未知状态；页面不会用空清单代替。',
    }
  }
  if (kind === 'service') {
    return {
      eyebrow: 'SERVICE PAUSED / 服务暂不可用',
      title: hasSnapshot ? '本次清单复核暂未完成' : '隐私台账暂时无法读取',
      detail: hasSnapshot
        ? '下方保留上次清单用于查看，所有数据保管操作保持冻结。'
        : '服务暂时没有返回销户回执或库存证据；请稍后明确重试。',
    }
  }
  return {
    eyebrow: 'READ UNKNOWN / 结果未知',
    title: hasSnapshot ? '无法确认当前数据清单' : '无法确认账户保管状态',
    detail: hasSnapshot
      ? '旧清单继续只读保留；重新读取前不会提交任何导出或不可逆操作。'
      : '页面尚未取得可信的回执与清单快照，也不会推断账户没有数据。',
  }
}

const formatDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '尚无记录'

const PrivacyPage = () => {
  const [overview, setOverview] = useState<PrivacyOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasReadSnapshot, setHasReadSnapshot] = useState(false)
  const [readFailure, setReadFailure] = useState<PrivacyReadFailureKind>()
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportChoice, setExportChoice] = useState<ExportChoice>(null)
  const [revokeTarget, setRevokeTarget] = useState<RevocableConsentPurpose | null>(null)
  const [revoking, setRevoking] = useState(false)
  const [revocationRecovery, setRevocationRecovery] = useState<RevocationRecovery | null>(null)
  const [reconcilingRevocation, setReconcilingRevocation] = useState(false)
  const [phrase, setPhrase] = useState('')
  const [understandsPermanent, setUnderstandsPermanent] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleted, setDeleted] = useState<AccountDeletionResult | null>(null)
  const readInFlight = useRef(false)

  useEffect(() => {
    if (!deleted || deleted.status === 'completed' || deleted.status === 'dead_letter') return
    const timer = setTimeout(() => {
      void getErasureReceiptStatus(deleted.receiptId, deleted.statusToken)
        .then((status) => setDeleted({ ...status, statusToken: deleted.statusToken }))
        .catch((statusError) => {
          setError(statusError instanceof Error ? statusError.message : '删除凭据状态读取失败')
        })
    }, 1_500)
    return () => clearTimeout(timer)
  }, [deleted])

  const acceptOverview = (nextOverview: PrivacyOverview) => {
    setOverview(nextOverview)
    setHasReadSnapshot(true)
    setReadFailure(undefined)
  }

  const loadOverview = async (focusOnFailure = true) => {
    if (readInFlight.current) return false
    readInFlight.current = true
    setLoading(true)
    setReadFailure(undefined)
    try {
      acceptOverview(await getPrivacyOverview())
      return true
    } catch (loadError) {
      setReadFailure(classifyPrivacyReadFailure(loadError))
      if (focusOnFailure) deferH5Focus('privacy-read-retry', 80)
      return false
    } finally {
      readInFlight.current = false
      setLoading(false)
    }
  }

  const loadPrivacyAuthority = async (isActive: () => boolean = () => true) => {
    if (readInFlight.current) return
    readInFlight.current = true
    setLoading(true)
    setReadFailure(undefined)
    try {
      const receipt = await recoverPendingAccountDeletion()
      if (!isActive()) return
      if (receipt) {
        setDeleted(receipt)
        return
      }
      const nextOverview = await getPrivacyOverview()
      if (isActive()) acceptOverview(nextOverview)
    } catch (authorityError) {
      if (!isActive()) return
      setReadFailure(classifyPrivacyReadFailure(authorityError))
      deferH5Focus('privacy-read-retry', 80)
    } finally {
      readInFlight.current = false
      if (isActive()) setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    void loadPrivacyAuthority(() => active)
    return () => {
      active = false
    }
  }, [])

  const readPhase = privacyReadPhase({
    hasSnapshot: hasReadSnapshot,
    busy: loading,
    hasFailure: Boolean(readFailure),
  })
  const readAuthorityReady = readPhase === 'ready'
  const custodyAuthorityReady = readAuthorityReady && !revocationRecovery
  const readFailurePresentation = readFailure
    ? privacyReadFailureCopy(readFailure, hasReadSnapshot)
    : undefined

  const readyToDelete = useMemo(
    () => custodyAuthorityReady && deletionReady({ phrase, exportChoice, understandsPermanent }),
    [custodyAuthorityReady, exportChoice, phrase, understandsPermanent],
  )

  const handleExport = async () => {
    if (exporting || !custodyAuthorityReady) return
    setExporting(true)
    setError('')
    try {
      const { downloadPrivacyExport } = await import('../../lib/privacy-export-download')
      const result = await downloadPrivacyExport()
      setExportChoice('downloaded')
      setFeedback(
        process.env.TARO_ENV === 'h5'
          ? `${result.fileName} 已通过 ${result.schemaVersion} 结构验证，已开始下载（${result.byteLength.toLocaleString('zh-CN')} 字节）。`
          : `${result.fileName} 已通过 ${result.schemaVersion} 结构验证，已保存到本地（${result.byteLength.toLocaleString('zh-CN')} 字节）。`,
      )
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : '数据导出生成失败')
    } finally {
      setExporting(false)
    }
  }

  const handleRevoke = async (purpose: RevocableConsentPurpose) => {
    if (revoking || !custodyAuthorityReady) return
    setRevoking(true)
    setError('')
    try {
      const result = await revokeOptionalConsent(purpose)
      setFeedback(
        purpose === 'food_photo_analysis'
          ? `餐食照片授权已撤回，已清除 ${result.removedPhotoAnalyses} 项照片分析。`
          : purpose === 'progress_photo_analysis'
            ? `进度照检查授权已撤回，已处理 ${result.removedProgressPhotos} 项进度照；明确保留的照片仍在。`
            : purpose === 'progress_photo_retention'
              ? `进度照保留授权已撤回，已清除 ${result.removedProgressPhotos} 项照片记录。`
              : 'AI 计划解释授权已撤回，新的解释和待处理任务已停止。',
      )
      setRevokeTarget(null)
      await loadOverview(true)
    } catch (revokeError) {
      const receipt = describeRevocationFailure(revokeError, consentCopy[purpose].label)
      setRevokeTarget(null)
      if (receipt.authority === 'reconcile_required') {
        setRevocationRecovery({ purpose, receipt })
      } else {
        setError(receipt.message)
      }
    } finally {
      setRevoking(false)
    }
  }

  const reconcileRevocation = async () => {
    if (!revocationRecovery || reconcilingRevocation) return
    setReconcilingRevocation(true)
    setError('')
    const { purpose } = revocationRecovery
    const label = consentCopy[purpose].label
    try {
      const current = await getPrivacyOverview()
      acceptOverview(current)
      const evidence = classifyRevocationEvidence(current, purpose)
      setRevocationRecovery(null)
      if (evidence === 'applied') {
        setFeedback(
          `当前授权清单确认“${label}”已撤回。原始响应已丢失，因此不显示本次敏感数据清理条数。`,
        )
      } else if (evidence === 'not_applied') {
        setFeedback(
          `当前授权清单显示“${label}”仍然有效；系统没有自动重放撤回。如仍需撤回，请再次明确操作。`,
        )
      } else {
        setError(
          `当前授权清单无法找到“${label}”的预期有效或已撤回凭据。已保留本次读取结果，请检查后重新决定。`,
        )
      }
    } catch {
      setRevocationRecovery({
        purpose,
        receipt: describeRevocationReconciliationFailure(label),
      })
    } finally {
      setReconcilingRevocation(false)
    }
  }

  const handleDelete = async () => {
    if (!readyToDelete || deleting || !custodyAuthorityReady) return
    setDeleting(true)
    setError('')
    try {
      const intent = await prepareAccountDeletion()
      const result = await deletePrivacyAccount(
        {
          intentId: intent.intentId,
          confirmationPhrase: accountDeletionConfirmationPhrase,
          exportChoice: exportChoice!,
          understandsPermanent: true,
        },
        intent.intentToken,
      )
      setDeleted(result)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '账户删除未能安全完成')
    } finally {
      setDeleting(false)
    }
  }

  const handleForgetReceipt = () => {
    forgetErasureReceipt()
    void Taro.reLaunch({ url: '/pages/onboarding/index' })
  }

  const handleLogout = () => {
    logoutClientSession()
    void Taro.reLaunch({ url: '/pages/login/index' })
  }

  if (deleted) {
    const complete = deleted.status === 'completed'
    const needsOperations = deleted.status === 'dead_letter'
    return (
      <View className="privacy-page privacy-page--complete">
        <View className="deletion-complete" role="status">
          <Text className="deletion-complete__eyebrow">ERASURE RECEIPT</Text>
          <Text className="deletion-complete__mark" aria-hidden="true">
            {complete ? '✓' : needsOperations ? '!' : '…'}
          </Text>
          <Text className="deletion-complete__title">
            {complete
              ? '账户数据已删除'
              : needsOperations
                ? '删除任务需要运维处理'
                : '正在安全删除账户'}
          </Text>
          <Text className="deletion-complete__body">
            {complete
              ? '旧会话已失效，主数据库与私有照片已清除，恢复删除日志已发布。'
              : needsOperations
                ? '账户访问仍保持关闭。请保存此凭据，运维人员可在不查看健康数据的情况下恢复删除任务。'
                : '账户访问已关闭；系统正在删除私有照片、发布恢复删除日志并清除主数据库记录。此页面会自动更新。'}
          </Text>
          <View className="deletion-complete__receipt">
            <Text>凭据 {deleted.receiptId}</Text>
            <Text>查询密钥 已保存在本机 · {formatReceiptToken(deleted.statusToken)}</Text>
            <Text>清除范围 {deleted.scopeVersion}</Text>
            <Text>状态 {deleted.status}</Text>
            <Text>{formatDate(deleted.deletedAt ?? deleted.requestedAt)}</Text>
          </View>
          <Text className="deletion-complete__local-note">
            查询密钥已保存在本机，页面重启后仍可恢复回执。从本机移除后，系统不会再显示这份回执。
          </Text>
          {complete ? (
            <Button {...buttonA11yProps} className="primary-action" onClick={handleForgetReceipt}>
              从本机移除回执
            </Button>
          ) : null}
        </View>
      </View>
    )
  }

  return (
    <View className="privacy-page">
      <ScrollView className="privacy-scroll" scrollY>
        <View className="privacy-shell">
          <View className="privacy-topbar">
            <Button
              {...buttonA11yProps}
              className="back-action"
              aria-label="返回今日"
              onClick={() => void Taro.navigateBack()}
            >
              ← 今日
            </Button>
            <View className="privacy-wordmark" aria-label="衡迹数据与隐私">
              <Text>衡迹</Text>
              <Text className="privacy-wordmark__en">DATA CUSTODY</Text>
            </View>
            <Button
              {...buttonA11yProps}
              className="profile-action"
              onClick={() => void Taro.navigateTo({ url: '/pages/onboarding/index' })}
            >
              编辑资料
            </Button>
          </View>

          <View className="privacy-hero">
            <Text className="privacy-hero__eyebrow">YOUR RECORDS, YOUR EXIT</Text>
            <Text className="privacy-hero__title">把数据带走，也能彻底离开。</Text>
            <Text className="privacy-hero__body">
              这里展示衡迹当前保存的数据、授权状态与删除边界。导出不会包含会话令牌或内部安全哈希。
            </Text>
          </View>

          {error ? (
            <View className="privacy-alert" role="alert">
              <Text>{error}</Text>
              <Button {...buttonA11yProps} className="text-action" onClick={() => setError('')}>
                关闭
              </Button>
            </View>
          ) : null}
          {feedback ? (
            <View className="privacy-feedback" role="status">
              <Text>{feedback}</Text>
              <Button
                {...buttonA11yProps}
                className="privacy-feedback__close"
                onClick={() => setFeedback('')}
              >
                关闭
              </Button>
            </View>
          ) : null}

          {revocationRecovery ? (
            <View className="privacy-read-state privacy-read-state--stale" role="status">
              <View>
                <Text className="privacy-read-state__eyebrow">
                  {revocationRecovery.receipt.eyebrow}
                </Text>
                <Text className="privacy-read-state__title">撤回结果需要当前授权凭据</Text>
                <Text className="privacy-read-state__copy">
                  {revocationRecovery.receipt.message}
                </Text>
                {overview ? (
                  <Text className="privacy-read-state__retained metric">
                    RETAINED INVENTORY · {overview.totalRecordCount} ITEMS ·{' '}
                    {formatDate(overview.generatedAt)}
                  </Text>
                ) : null}
              </View>
              <Button
                id="privacy-revocation-reconcile"
                className="privacy-read-state__action"
                aria-label={revocationRecovery.receipt.actionLabel}
                {...buttonActivationProps(() => void reconcileRevocation(), reconcilingRevocation)}
              >
                {reconcilingRevocation ? '正在核对…' : revocationRecovery.receipt.actionLabel}
              </Button>
            </View>
          ) : null}

          {readPhase === 'refreshing' && hasReadSnapshot ? (
            <View className="privacy-read-state privacy-read-state--refreshing" role="status">
              <View>
                <Text className="privacy-read-state__eyebrow">CHECKING CUSTODY / 保留上次清单</Text>
                <Text className="privacy-read-state__title">正在复核数据清单与授权状态</Text>
                <Text className="privacy-read-state__copy">
                  复核完成前，下方清单只读保留；导出、撤回授权与永久删除均已冻结。
                </Text>
              </View>
            </View>
          ) : readFailurePresentation ? (
            <View className={`privacy-read-state privacy-read-state--${readPhase}`} role="status">
              <View>
                <Text className="privacy-read-state__eyebrow">
                  {readFailurePresentation.eyebrow}
                </Text>
                <Text className="privacy-read-state__title">{readFailurePresentation.title}</Text>
                <Text className="privacy-read-state__copy">{readFailurePresentation.detail}</Text>
                {hasReadSnapshot && overview ? (
                  <Text className="privacy-read-state__retained metric">
                    RETAINED INVENTORY · {overview.totalRecordCount} ITEMS ·{' '}
                    {formatDate(overview.generatedAt)}
                  </Text>
                ) : null}
              </View>
              <Button
                id="privacy-read-retry"
                className="privacy-read-state__action"
                aria-label="重新核对销户回执与数据清单"
                {...buttonActivationProps(
                  () => void (hasReadSnapshot ? loadOverview(true) : loadPrivacyAuthority()),
                  loading,
                )}
              >
                重新核对
              </Button>
            </View>
          ) : null}

          {loading && !overview ? (
            <View className="privacy-loading" role="status">
              正在核对数据清单…
            </View>
          ) : overview ? (
            <View className="custody-grid">
              <View className="custody-grid__ledger">
                <View className="custody-sheet">
                  <View className="custody-sheet__heading">
                    <View>
                      <Text className="section-kicker">OWNERSHIP LEDGER</Text>
                      <Text className="section-title">我的数据清单</Text>
                    </View>
                    <View className="custody-total">
                      <Text className="custody-total__value">{overview.totalRecordCount}</Text>
                      <Text className="custody-total__label">项可导出内容</Text>
                    </View>
                  </View>

                  <View className="inventory-list">
                    {overview.inventory.map((item, index) => {
                      const copy = privacyCategoryCopy[item.category]
                      return (
                        <View className="inventory-row" key={item.category}>
                          <Text className="inventory-row__index">
                            {String(index + 1).padStart(2, '0')}
                          </Text>
                          <View className="inventory-row__copy">
                            <Text className="inventory-row__label">{copy.label}</Text>
                            <Text className="inventory-row__note">
                              {copy.note} · {formatDate(item.lastUpdatedAt)}
                            </Text>
                          </View>
                          <Text
                            className={`inventory-row__count ${item.recordCount ? 'inventory-row__count--owned' : ''}`}
                          >
                            {formatInventoryCount(item.recordCount)}
                          </Text>
                        </View>
                      )
                    })}
                  </View>

                  <View className="custody-seal" aria-label="数据保管状态">
                    <Text>ACCOUNT</Text>
                    <Text aria-hidden="true">→</Text>
                    <Text>DATA</Text>
                    <Text aria-hidden="true">→</Text>
                    <Text>CONSENT</Text>
                    <Text aria-hidden="true">→</Text>
                    <Text>EXIT</Text>
                  </View>
                  <Text className="custody-sheet__stamp">
                    核对于 {formatDate(overview.generatedAt)} · 在保留期照片{' '}
                    {overview.activePhotoCount} 张
                  </Text>
                </View>
              </View>

              <View className="custody-grid__actions">
                <View className="privacy-card export-card">
                  <Text className="section-kicker">PORTABLE COPY</Text>
                  <Text className="section-title">下载数据副本</Text>
                  <Text className="section-body">
                    生成版本化 JSON，包含记录历史、AI
                    来源和仍在保留期内的净化照片。文件只在本次操作中生成。
                  </Text>
                  <View className="export-facts">
                    <Text>格式 · {overview.portableExport.schemaVersion}</Text>
                    <Text>缓存 · 禁止服务端与浏览器缓存</Text>
                  </View>
                  <Button
                    {...buttonA11yProps}
                    className="primary-action"
                    disabled={exporting || !custodyAuthorityReady}
                    aria-disabled={exporting || !custodyAuthorityReady}
                    onClick={() => void handleExport()}
                  >
                    {exporting ? '正在生成…' : '下载我的数据'}
                  </Button>
                </View>

                <View className="privacy-card consent-card">
                  <Text className="section-kicker">CONSENT RECEIPTS</Text>
                  <Text className="section-title">授权凭据</Text>
                  <Text className="section-body">
                    基础授权随账户存在；AI 与照片授权可以独立撤回，并在下次明确同意时重新建立。
                  </Text>
                  <View className="consent-list">
                    {overview.consents.map((consent) => {
                      const copy = consentCopy[consent.purpose]
                      const optionalPurpose = consent.purpose as RevocableConsentPurpose
                      const confirming = revokeTarget === optionalPurpose
                      return (
                        <View className="consent-row" key={consent.purpose}>
                          <View className="consent-row__main">
                            <View>
                              <Text className="consent-row__label">{copy.label}</Text>
                              <Text className="consent-row__note">{copy.note}</Text>
                            </View>
                            <Text className={`consent-status consent-status--${consent.status}`}>
                              {consentStatusCopy[consent.status]}
                            </Text>
                          </View>
                          <Text className="consent-row__time">
                            {consent.acceptedAt
                              ? `接受 ${formatDate(consent.acceptedAt)}${consent.revokedAt ? ` · 撤回 ${formatDate(consent.revokedAt)}` : ''}`
                              : '尚未产生授权凭据'}
                          </Text>
                          {consent.revocable && consent.status === 'active' ? (
                            confirming ? (
                              <View className="revoke-confirm" role="alert">
                                <Text>
                                  {consent.purpose === 'food_photo_analysis'
                                    ? '将清除餐食照片分析和仍保留的图片。'
                                    : consent.purpose === 'progress_photo_analysis'
                                      ? '将删除临时进度照，并从长期保留照片中清除机器检查结果；保留照片不会被删除。'
                                      : consent.purpose === 'progress_photo_retention'
                                        ? '将永久清除全部进度照媒体与记录。'
                                        : '将停止新的 AI 计划解释和待处理任务。'}
                                </Text>
                                <View className="revoke-confirm__actions">
                                  <Button
                                    {...buttonA11yProps}
                                    className="text-action"
                                    onClick={() => setRevokeTarget(null)}
                                  >
                                    保留授权
                                  </Button>
                                  <Button
                                    {...buttonA11yProps}
                                    className="revoke-action"
                                    disabled={revoking || !custodyAuthorityReady}
                                    aria-disabled={revoking || !custodyAuthorityReady}
                                    onClick={() => void handleRevoke(optionalPurpose)}
                                  >
                                    {revoking ? '正在撤回…' : '确认撤回'}
                                  </Button>
                                </View>
                              </View>
                            ) : (
                              <Button
                                {...buttonA11yProps}
                                className="text-action"
                                disabled={!custodyAuthorityReady}
                                aria-disabled={!custodyAuthorityReady}
                                onClick={() => {
                                  if (custodyAuthorityReady) setRevokeTarget(optionalPurpose)
                                }}
                              >
                                撤回这项授权
                              </Button>
                            )
                          ) : null}
                        </View>
                      )
                    })}
                  </View>
                  <ConsentReceiptHistory
                    key={overview.generatedAt}
                    disabled={!custodyAuthorityReady}
                  />
                </View>

                <View className="privacy-card session-card">
                  <Text className="section-kicker">LOCAL SESSION</Text>
                  <Text className="section-title">退出这台设备</Text>
                  <Text className="section-body">
                    退出会移除当前会话和三类未完成本地草稿；销户查询回执不会被混入或随草稿恢复。
                  </Text>
                  <Button {...buttonA11yProps} className="session-action" onClick={handleLogout}>
                    退出登录并清除草稿
                  </Button>
                </View>

                <View className="tear-line" aria-hidden="true">
                  <Text>PERMANENT EXIT</Text>
                </View>
                <View className="privacy-card deletion-card">
                  <Text className="section-kicker">ACCOUNT ERASURE</Text>
                  <Text className="section-title">永久删除账户</Text>
                  <Text className="section-body">
                    删除会清除账户、记录历史、AI
                    内容、授权凭据、会话和私有照片，且无法恢复。备份处置仍以发布前通过审查的保留规则为准。
                  </Text>

                  <View className="deletion-steps">
                    <View className="deletion-step">
                      <Text className="deletion-step__number">1</Text>
                      <View>
                        <Text className="deletion-step__label">决定是否先导出</Text>
                        <Text className="deletion-step__note">
                          {exportChoice === 'downloaded'
                            ? '已下载本次数据副本'
                            : exportChoice === 'skip'
                              ? '已选择不导出'
                              : '尚未选择'}
                        </Text>
                      </View>
                      {exportChoice !== 'downloaded' ? (
                        <Button
                          {...buttonA11yProps}
                          className="step-action"
                          disabled={!custodyAuthorityReady}
                          aria-disabled={!custodyAuthorityReady}
                          onClick={() => {
                            if (custodyAuthorityReady)
                              setExportChoice(exportChoice === 'skip' ? null : 'skip')
                          }}
                        >
                          {exportChoice === 'skip' ? '取消跳过' : '不导出'}
                        </Button>
                      ) : null}
                    </View>

                    <Button
                      {...checkboxA11yProps}
                      className={`deletion-check ${understandsPermanent ? 'deletion-check--checked' : ''}`}
                      disabled={!custodyAuthorityReady}
                      aria-checked={understandsPermanent}
                      aria-disabled={!custodyAuthorityReady}
                      onClick={() => {
                        if (custodyAuthorityReady) setUnderstandsPermanent((value) => !value)
                      }}
                    >
                      <Text className="deletion-check__box" aria-hidden="true">
                        {understandsPermanent ? '✓' : ''}
                      </Text>
                      <Text>我知道删除无法撤销，并会让当前会话立即失效。</Text>
                    </Button>

                    <View className="deletion-input">
                      <Text className="deletion-input__label">
                        输入“{accountDeletionConfirmationPhrase}”
                      </Text>
                      <Input
                        className="deletion-input__control"
                        aria-label={`输入${accountDeletionConfirmationPhrase}`}
                        value={phrase}
                        maxlength={accountDeletionConfirmationPhrase.length}
                        placeholder={accountDeletionConfirmationPhrase}
                        disabled={!custodyAuthorityReady}
                        onInput={(event) => setPhrase(event.detail.value)}
                      />
                    </View>
                  </View>

                  <Button
                    {...buttonA11yProps}
                    className={`delete-action ${readyToDelete ? 'delete-action--ready' : ''}`}
                    disabled={!readyToDelete || deleting || !custodyAuthorityReady}
                    aria-disabled={!readyToDelete || deleting}
                    onClick={() => void handleDelete()}
                  >
                    {deleting ? '正在安全删除…' : '永久删除账户'}
                  </Button>
                </View>
              </View>
            </View>
          ) : null}

          <Text className="privacy-footnote">
            本页是产品行为说明，不替代适用地区的法律与合规审查。
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}

export default PrivacyPage
