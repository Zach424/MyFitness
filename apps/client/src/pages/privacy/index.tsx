import { useEffect, useMemo, useState } from 'react'

import {
  accountDeletionConfirmationPhrase,
  type AccountDeletionResult,
  type PrivacyOverview,
  type RevocableConsentPurpose,
} from '@myfitness/contracts'
import { Button, Input, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import { buttonA11yProps, checkboxA11yProps } from '../../lib/accessibility'
import {
  deletePrivacyAccount,
  downloadPrivacyExport,
  getErasureReceiptStatus,
  getPrivacyOverview,
  revokeOptionalConsent,
} from '../../lib/api'
import {
  consentCopy,
  consentStatusCopy,
  deletionReady,
  formatInventoryCount,
  privacyCategoryCopy,
} from './privacy.model'
import './index.scss'

type ExportChoice = 'downloaded' | 'skip' | null

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
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportChoice, setExportChoice] = useState<ExportChoice>(null)
  const [revokeTarget, setRevokeTarget] = useState<RevocableConsentPurpose | null>(null)
  const [revoking, setRevoking] = useState(false)
  const [phrase, setPhrase] = useState('')
  const [understandsPermanent, setUnderstandsPermanent] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleted, setDeleted] = useState<AccountDeletionResult | null>(null)

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

  const loadOverview = async () => {
    setLoading(true)
    setError('')
    try {
      setOverview(await getPrivacyOverview())
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '数据清单读取失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadOverview()
  }, [])

  const readyToDelete = useMemo(
    () => deletionReady({ phrase, exportChoice, understandsPermanent }),
    [exportChoice, phrase, understandsPermanent],
  )

  const handleExport = async () => {
    if (exporting) return
    setExporting(true)
    setError('')
    try {
      const result = await downloadPrivacyExport()
      setExportChoice('downloaded')
      setFeedback(
        process.env.TARO_ENV === 'h5'
          ? `${result.fileName} 已开始下载。`
          : `${result.fileName} 已保存到本地文件。`,
      )
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : '数据导出生成失败')
    } finally {
      setExporting(false)
    }
  }

  const handleRevoke = async (purpose: RevocableConsentPurpose) => {
    if (revoking) return
    setRevoking(true)
    setError('')
    try {
      const result = await revokeOptionalConsent(purpose)
      setFeedback(
        purpose === 'food_photo_analysis'
          ? `餐食照片授权已撤回，已清除 ${result.removedPhotoAnalyses} 项照片分析。`
          : 'AI 计划解释授权已撤回，新的解释和待处理任务已停止。',
      )
      setRevokeTarget(null)
      await loadOverview()
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : '授权撤回失败')
    } finally {
      setRevoking(false)
    }
  }

  const handleDelete = async () => {
    if (!readyToDelete || deleting) return
    setDeleting(true)
    setError('')
    try {
      const result = await deletePrivacyAccount({
        confirmationPhrase: accountDeletionConfirmationPhrase,
        exportChoice: exportChoice!,
        understandsPermanent: true,
      })
      setDeleted(result)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '账户删除未能安全完成')
    } finally {
      setDeleting(false)
    }
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
            <Text>查询密钥 {deleted.statusToken}</Text>
            <Text>清除范围 {deleted.scopeVersion}</Text>
            <Text>状态 {deleted.status}</Text>
            <Text>{formatDate(deleted.deletedAt ?? deleted.requestedAt)}</Text>
          </View>
          {complete ? (
            <Button
              {...buttonA11yProps}
              className="primary-action"
              onClick={() => void Taro.reLaunch({ url: '/pages/onboarding/index' })}
            >
              重新开始
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
              <Button
                {...buttonA11yProps}
                className="text-action"
                onClick={() => void loadOverview()}
              >
                重新读取
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
                    aria-disabled={exporting}
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
                                    aria-disabled={revoking}
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
                                onClick={() => setRevokeTarget(optionalPurpose)}
                              >
                                撤回这项授权
                              </Button>
                            )
                          ) : null}
                        </View>
                      )
                    })}
                  </View>
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
                          onClick={() => setExportChoice(exportChoice === 'skip' ? null : 'skip')}
                        >
                          {exportChoice === 'skip' ? '取消跳过' : '不导出'}
                        </Button>
                      ) : null}
                    </View>

                    <Button
                      {...checkboxA11yProps}
                      className={`deletion-check ${understandsPermanent ? 'deletion-check--checked' : ''}`}
                      aria-checked={understandsPermanent}
                      onClick={() => setUnderstandsPermanent((value) => !value)}
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
                        onInput={(event) => setPhrase(event.detail.value)}
                      />
                    </View>
                  </View>

                  <Button
                    {...buttonA11yProps}
                    className={`delete-action ${readyToDelete ? 'delete-action--ready' : ''}`}
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
