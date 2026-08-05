import { useEffect, useRef, useState } from 'react'
import { Button, Input, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type {
  CustomFoodCatalogEntry,
  FoodCatalogEntryHistoryItem,
  FoodSnapshot,
} from '@myfitness/contracts'

import { buttonActivationProps, deferH5Focus } from '../../lib/accessibility'
import { DefinitionRevisionLedger } from '../../components/definition-revision-ledger'
import {
  ApiError,
  archiveFoodCatalogEntry,
  createFoodCatalogEntry,
  getFoodCatalogEntryHistory,
  listFoodCatalog,
  updateFoodCatalogEntry,
} from '../../lib/api'
import { describeWorkbenchFailure, type WorkbenchRecovery } from '../../lib/workbench-recovery'
import {
  classifyRegisterReadFailure,
  registerReadFailureCopy,
  registerReadPhase,
  type RegisterReadFailureKind,
} from '../../lib/register-read'
import { useAggregateHistory } from '../../lib/use-aggregate-history'
import ExerciseCatalogPage from '../exercise-catalog'
import './index.scss'

const categoryLabels: Record<FoodSnapshot['category'], string> = {
  staple: '主食',
  protein: '蛋白来源',
  vegetable: '蔬菜',
  fruit: '水果',
  dairy: '乳品',
  snack: '零食',
  custom: '自定义',
}

const emptyForm = () => ({
  name: '',
  aliases: '',
  grams: '100',
  category: 'custom' as FoodSnapshot['category'],
  energyKcal: '',
  proteinG: '',
  carbohydrateG: '',
  fatG: '',
  fiberG: '',
  reference: '',
})

type FoodForm = ReturnType<typeof emptyForm>

const messageOf = (error: unknown) =>
  error instanceof ApiError || error instanceof Error ? error.message : '操作失败，请稍后重试'

const requestKey = () =>
  `food-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`

const customEntriesFrom = (items: Awaited<ReturnType<typeof listFoodCatalog>>['items']) =>
  items.filter((entry): entry is CustomFoodCatalogEntry => entry.source === 'custom')

const formFromEntry = (entry: CustomFoodCatalogEntry): FoodForm => ({
  name: entry.name,
  aliases: entry.aliases.join('，'),
  grams: String(entry.defaultServing.grams),
  category: entry.category,
  energyKcal: String(entry.nutrientsPer100g.energyKcal),
  proteinG: String(entry.nutrientsPer100g.proteinG),
  carbohydrateG: String(entry.nutrientsPer100g.carbohydrateG),
  fatG: String(entry.nutrientsPer100g.fatG),
  fiberG: entry.nutrientsPer100g.fiberG === undefined ? '' : String(entry.nutrientsPer100g.fiberG),
  reference: entry.reference,
})

const validationError = (form: FoodForm) => {
  if (!form.name.trim()) return '请填写食物名称。'
  if (!form.reference.trim()) return '请填写营养数据依据，例如包装标签或配方估算。'
  if (!Number.isFinite(Number(form.grams)) || Number(form.grams) <= 0) {
    return '默认克重需为大于 0 的数字。'
  }
  for (const [label, value] of [
    ['热量', form.energyKcal],
    ['蛋白质', form.proteinG],
    ['碳水', form.carbohydrateG],
    ['脂肪', form.fatG],
  ] as const) {
    if (!value.trim() || !Number.isFinite(Number(value)) || Number(value) < 0) {
      return `${label}需为不小于 0 的数字。`
    }
  }
  if (form.fiberG.trim() && (!Number.isFinite(Number(form.fiberG)) || Number(form.fiberG) < 0)) {
    return '膳食纤维需为不小于 0 的数字。'
  }
  return ''
}

const payloadFromForm = (form: FoodForm) => {
  const aliases = form.aliases
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean)
  return {
    name: form.name.trim(),
    ...(aliases.length ? { aliases } : {}),
    category: form.category,
    nutrientsPer100g: {
      energyKcal: Number(form.energyKcal),
      proteinG: Number(form.proteinG),
      carbohydrateG: Number(form.carbohydrateG),
      fatG: Number(form.fatG),
      ...(form.fiberG.trim() ? { fiberG: Number(form.fiberG) } : {}),
    },
    reference: form.reference.trim(),
    defaultServing: { amount: Number(form.grams), unit: 'g' as const, grams: Number(form.grams) },
  }
}

const entryMatchesForm = (entry: CustomFoodCatalogEntry, form: FoodForm) => {
  const payload = payloadFromForm(form)
  return (
    entry.name === payload.name &&
    JSON.stringify(entry.aliases) === JSON.stringify(payload.aliases ?? []) &&
    entry.category === payload.category &&
    entry.nutrientsPer100g.energyKcal === payload.nutrientsPer100g.energyKcal &&
    entry.nutrientsPer100g.proteinG === payload.nutrientsPer100g.proteinG &&
    entry.nutrientsPer100g.carbohydrateG === payload.nutrientsPer100g.carbohydrateG &&
    entry.nutrientsPer100g.fatG === payload.nutrientsPer100g.fatG &&
    entry.nutrientsPer100g.fiberG === payload.nutrientsPer100g.fiberG &&
    entry.reference === payload.reference &&
    entry.defaultServing.amount === payload.defaultServing.amount &&
    entry.defaultServing.unit === payload.defaultServing.unit &&
    entry.defaultServing.grams === payload.defaultServing.grams
  )
}

const FoodCatalogPage = () => {
  const requestedEntryId = useRef(Taro.getCurrentInstance().router?.params.entryId ?? '')
  const pendingCreateKey = useRef('')
  const [entries, setEntries] = useState<CustomFoodCatalogEntry[]>([])
  const [editing, setEditing] = useState<CustomFoodCatalogEntry>()
  const [archiving, setArchiving] = useState<CustomFoodCatalogEntry>()
  const [form, setForm] = useState(emptyForm)
  const [editorOpen, setEditorOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [hasReadSnapshot, setHasReadSnapshot] = useState(false)
  const [readFailure, setReadFailure] = useState<RegisterReadFailureKind>()
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [recovery, setRecovery] = useState<WorkbenchRecovery>()
  const readInFlight = useRef(false)
  const pageActive = useRef(true)
  const historyRead = useAggregateHistory<CustomFoodCatalogEntry, FoodCatalogEntryHistoryItem>(
    getFoodCatalogEntryHistory,
    'food-definition-history-read-retry',
  )

  const patchForm = (patch: Partial<FoodForm>) => {
    setForm((current) => ({ ...current, ...patch }))
    if (!editing) pendingCreateKey.current = ''
    setRecovery(undefined)
    setFeedback('')
  }

  const openEditor = (entry?: CustomFoodCatalogEntry, acceptedInitialRead = false) => {
    if (!acceptedInitialRead && !readAuthorityReady) return
    setEditing(entry)
    setForm(entry ? formFromEntry(entry) : emptyForm())
    setEditorOpen(true)
    setFeedback('')
    setRecovery(undefined)
    pendingCreateKey.current = ''
    if (entry) historyRead.open(entry)
    else historyRead.close()
  }

  const loadRegisterAuthority = async () => {
    if (readInFlight.current) return
    const hadSnapshot = hasReadSnapshot
    readInFlight.current = true
    setLoading(true)
    setReadFailure(undefined)
    try {
      const result = await listFoodCatalog()
      if (!pageActive.current) return
      const custom = customEntriesFrom(result.items)
      setEntries(custom)
      setHasReadSnapshot(true)
      const requested = custom.find((entry) => entry.id === requestedEntryId.current)
      requestedEntryId.current = ''
      if (requested) void openEditor(requested, true)
      if (!hadSnapshot) deferH5Focus('food-catalog-back', 350)
    } catch (error) {
      if (!pageActive.current) return
      setReadFailure(classifyRegisterReadFailure(error))
      deferH5Focus('food-register-read-retry', hadSnapshot ? 80 : 500)
    } finally {
      readInFlight.current = false
      if (pageActive.current) setLoading(false)
    }
  }

  useEffect(() => {
    pageActive.current = true
    void loadRegisterAuthority()
    return () => {
      pageActive.current = false
    }
  }, [])

  const readPhase = registerReadPhase({
    hasSnapshot: hasReadSnapshot,
    busy: loading,
    hasFailure: Boolean(readFailure),
  })
  const readAuthorityReady = readPhase === 'ready'
  const readFailurePresentation = readFailure
    ? registerReadFailureCopy(readFailure, 'food', hasReadSnapshot)
    : undefined

  const closeEditor = () => {
    setEditorOpen(false)
    setEditing(undefined)
    historyRead.close()
    setForm(emptyForm())
    pendingCreateKey.current = ''
    setRecovery(undefined)
  }

  const save = async () => {
    if (!readAuthorityReady) return
    const error = validationError(form)
    if (error) {
      setFeedback(error)
      return
    }
    setBusy(true)
    setFeedback('')
    try {
      const payload = payloadFromForm(form)
      const wasCorrection = Boolean(editing)
      const saved = editing
        ? await updateFoodCatalogEntry(editing.id, {
            ...payload,
            expectedRevision: editing.revision,
          })
        : await createFoodCatalogEntry(payload, (pendingCreateKey.current ||= requestKey()))
      setEntries((current) => [saved, ...current.filter((entry) => entry.id !== saved.id)])
      setRecovery(undefined)
      closeEditor()
      setFeedback(
        wasCorrection
          ? '定义已纠正；餐食页中的当前草稿、历史餐食和收藏快照不会被改写。'
          : '自建食物已保存；返回餐食页后可从“我的”列表加入本餐。',
      )
    } catch (error) {
      setRecovery(describeWorkbenchFailure(editing ? 'food_update' : 'food_create', error))
    } finally {
      setBusy(false)
    }
  }

  const reconcileDefinition = async () => {
    if (!recovery || recovery.operation !== 'food_update' || !editing) return
    setBusy(true)
    try {
      const result = await listFoodCatalog()
      const custom = customEntriesFrom(result.items)
      const current = custom.find((entry) => entry.id === editing.id)
      setEntries(custom)
      if (!current) {
        setRecovery({
          ...recovery,
          authority: 'terminal',
          eyebrow: 'CURRENT STATE / 定义已不可编辑',
          message:
            '核对后，服务端当前目录已没有这条可编辑食物定义。页面仍保留营养值与依据输入，但不会把上次纠正报告为成功。',
          actionLabel: '返回检查目录',
        })
        return
      }
      if (current.revision > editing.revision && entryMatchesForm(current, form)) {
        closeEditor()
        setFeedback(`核对完成：服务端 R${current.revision} 与保留输入一致，上次纠正已经提交。`)
        return
      }
      setEditing(current)
      setRecovery(undefined)
      setFeedback(
        current.revision === editing.revision
          ? `核对完成：服务端仍为 R${current.revision}，没有纠正成功的证据；营养值与依据输入已保留。`
          : `核对完成：服务端已到 R${current.revision} 且内容不同；输入已保留，请重新核对来源后再保存。`,
      )
    } catch (error) {
      setRecovery(describeWorkbenchFailure('food_update', error))
    } finally {
      setBusy(false)
    }
  }

  const reconcileArchive = async () => {
    if (!recovery || recovery.operation !== 'food_archive' || !archiving) return
    setBusy(true)
    try {
      const result = await listFoodCatalog()
      const custom = customEntriesFrom(result.items)
      const current = custom.find((entry) => entry.id === archiving.id)
      setEntries(custom)
      setRecovery(undefined)
      setArchiving(undefined)
      if (!current) {
        closeEditor()
        setFeedback('核对完成：服务端当前目录已不再包含此食物；仅据此确认它不会用于未来选择。')
        return
      }
      setEditing(current)
      setFeedback(
        '核对完成：服务端仍显示此食物可用，本次归档没有成功证据；如仍需归档，请再次明确确认。',
      )
    } catch (error) {
      setRecovery(describeWorkbenchFailure('food_archive', error))
    } finally {
      setBusy(false)
    }
  }

  const cancelArchive = () => {
    setArchiving(undefined)
    if (recovery?.operation === 'food_archive') setRecovery(undefined)
  }

  const handleRecoveryAction = () => {
    if (!recovery) return
    if (recovery.authority === 'terminal') {
      const operation = recovery.operation
      setRecovery(undefined)
      setFeedback('当前尝试已终止；营养值与依据输入仍保留，请检查后重新开始。')
      if (operation === 'food_archive') cancelArchive()
      return
    }
    if (recovery.authority === 'retry_same_request' && recovery.operation === 'food_create') {
      void save()
      return
    }
    if (recovery.operation === 'food_update') {
      void reconcileDefinition()
      return
    }
    if (recovery.operation === 'food_archive') void reconcileArchive()
  }

  const archive = async () => {
    if (!archiving || !readAuthorityReady) return
    setBusy(true)
    try {
      await archiveFoodCatalogEntry(archiving.id, archiving.revision)
      setEntries((current) => current.filter((entry) => entry.id !== archiving.id))
      setArchiving(undefined)
      setRecovery(undefined)
      closeEditor()
      setFeedback('自建食物已归档；历史餐食与收藏未被改写。')
    } catch (error) {
      setRecovery(describeWorkbenchFailure('food_archive', error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View className="food-catalog-page">
      <ScrollView className="food-catalog-scroll" scrollY enhanced showScrollbar={false}>
        <View className="food-catalog-shell">
          <View className="food-catalog-topbar">
            <Button
              {...buttonActivationProps(() => void Taro.navigateBack())}
              id="food-catalog-back"
              className="food-catalog-back"
              aria-label="返回餐食记录"
            >
              ←
            </Button>
            <View>
              <Text className="food-catalog-wordmark">衡迹</Text>
              <Text className="food-catalog-eyebrow">OWNED FOOD REGISTER</Text>
            </View>
            <Text className="food-catalog-count metric">
              {hasReadSnapshot ? entries.length : '—'}
            </Text>
          </View>

          <View className="food-catalog-hero">
            <Text className="food-catalog-eyebrow">DEFINE · CORRECT · SNAPSHOT</Text>
            <Text className="food-catalog-title">我的食物，是可修订的定义，不是会漂移的历史。</Text>
            <Text className="food-catalog-intro">
              按包装标签、配方称量或资料录入每 100g
              参考值。这里保存定义；餐食会复制选择当时的名称、营养和依据。
            </Text>
          </View>

          <View className="food-catalog-actions">
            <Button
              {...buttonActivationProps(() => void openEditor(), !readAuthorityReady || busy)}
              id="food-new-definition"
              className="food-catalog-new"
            >
              ＋ 新建食物
            </Button>
            <Button
              {...buttonActivationProps(
                () => void loadRegisterAuthority(),
                !hasReadSnapshot || loading || busy || editorOpen,
              )}
              id="food-register-refresh"
              className="register-read-refresh"
              aria-label="更新我的食物定义目录"
            >
              {loading ? '核对中…' : '更新目录'}
            </Button>
            <Text>照片候选仍只使用受控的演示目录，不会自动信任自建条目。</Text>
          </View>

          {readPhase === 'refreshing' && hasReadSnapshot ? (
            <View className="register-read-state register-read-state--refreshing" role="status">
              <Text className="register-read-state__eyebrow">CHECKING REGISTER / 保留上次目录</Text>
              <Text className="register-read-state__title">正在复核食物定义目录</Text>
              <Text className="register-read-state__copy">
                复核完成前，旧目录只读保留；新建、纠正、历史与归档均已冻结。
              </Text>
            </View>
          ) : readFailurePresentation ? (
            <View className="register-read-state" role="status">
              <Text className="register-read-state__eyebrow">
                {readFailurePresentation.eyebrow}
              </Text>
              <Text className="register-read-state__title">{readFailurePresentation.title}</Text>
              <Text className="register-read-state__copy">{readFailurePresentation.detail}</Text>
              <Text className="register-read-state__retained metric">
                OWNED FOODS {hasReadSnapshot ? entries.length : '—'}
              </Text>
              <Button
                {...buttonActivationProps(
                  () => void loadRegisterAuthority(),
                  loading || busy || editorOpen,
                )}
                id="food-register-read-retry"
                className="register-read-state__action"
                aria-label="重新核对我的食物定义目录"
              >
                重新核对
              </Button>
            </View>
          ) : null}

          {feedback ? (
            <View
              className="food-catalog-feedback"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {feedback}
            </View>
          ) : null}

          {recovery && recovery.operation !== 'food_archive' ? (
            <View
              className="workbench-recovery"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <Text className="workbench-recovery__eyebrow">{recovery.eyebrow}</Text>
              <Text className="workbench-recovery__message">{recovery.message}</Text>
              <Button
                {...buttonActivationProps(handleRecoveryAction, busy)}
                className="workbench-recovery__action"
                style={{ color: 'var(--color-warning)' }}
                disabled={busy}
              >
                {busy ? '处理中…' : recovery.actionLabel}
              </Button>
            </View>
          ) : null}

          {editorOpen ? (
            <View className="food-editor">
              <Text className="food-catalog-eyebrow">
                {editing ? `CORRECT DEFINITION / R${editing.revision}` : 'NEW OWNED FOOD / 每 100g'}
              </Text>
              <Text className="food-editor__title">
                {editing ? '纠正只影响未来选择' : '保存一条可复用定义'}
              </Text>
              <Text className="food-editor__notice">
                营养值是你确认的参考数据，不代表实验室检测，也不会自动生成摄入建议。
              </Text>
              <View className="food-editor__grid">
                {(
                  [
                    ['name', '食物名称', '例如：家庭炖牛肉'],
                    ['aliases', '别名（逗号分隔）', '例如：周末炖牛肉'],
                    ['grams', '默认克重', '100'],
                    ['energyKcal', '热量 kcal', '0'],
                    ['proteinG', '蛋白质 g', '0'],
                    ['carbohydrateG', '碳水 g', '0'],
                    ['fatG', '脂肪 g', '0'],
                    ['fiberG', '膳食纤维 g（可选）', '0'],
                    ['reference', '数据依据（必填）', '例如：包装标签 2026-08-05'],
                  ] as const
                ).map(([key, label, placeholder]) => (
                  <View className="food-editor__field" key={key}>
                    <Text>{label}</Text>
                    <Input
                      id={key === 'name' ? 'food-definition-name' : undefined}
                      className="food-editor__input metric"
                      type={['name', 'aliases', 'reference'].includes(key) ? 'text' : 'digit'}
                      value={form[key]}
                      placeholder={placeholder}
                      aria-label={`自定义${label}`}
                      onInput={(event) => patchForm({ [key]: event.detail.value })}
                    />
                  </View>
                ))}
              </View>
              <View className="food-editor__categories" aria-label="食物分类">
                {(Object.keys(categoryLabels) as FoodSnapshot['category'][]).map((category) => (
                  <Button
                    {...buttonActivationProps(() => patchForm({ category }))}
                    className={`food-editor__category ${form.category === category ? 'food-editor__category--active' : ''}`}
                    aria-pressed={form.category === category}
                    key={category}
                  >
                    {categoryLabels[category]}
                  </Button>
                ))}
              </View>
              {editing ? (
                <DefinitionRevisionLedger
                  items={historyRead.items}
                  nextCursor={historyRead.nextCursor}
                  busy={historyRead.busy}
                  phase={historyRead.phase}
                  failure={historyRead.failure}
                  subject="食物定义"
                  retryId="food-definition-history-read-retry"
                  onLoadOlder={historyRead.loadOlder}
                  onRetry={historyRead.retry}
                />
              ) : null}
              <View className="food-editor__actions">
                {editing ? (
                  <Button
                    {...buttonActivationProps(
                      () => setArchiving(editing),
                      busy || Boolean(recovery) || !readAuthorityReady,
                    )}
                    className="food-editor__archive"
                    style={{ color: 'var(--color-pulse)' }}
                    disabled={busy || Boolean(recovery) || !readAuthorityReady}
                  >
                    归档
                  </Button>
                ) : null}
                <Button
                  {...buttonActivationProps(closeEditor, busy)}
                  className="food-editor__cancel"
                  style={{ color: 'var(--color-muted)' }}
                  disabled={busy}
                >
                  取消
                </Button>
                <Button
                  {...buttonActivationProps(
                    () => void save(),
                    busy || Boolean(recovery) || !readAuthorityReady,
                  )}
                  className="food-editor__save"
                  style={{ color: 'var(--color-paper)' }}
                  disabled={busy || Boolean(recovery) || !readAuthorityReady}
                >
                  {busy ? '保存中…' : editing ? '保存纠正' : '保存定义'}
                </Button>
              </View>
            </View>
          ) : null}

          <View className="food-register">
            <View className="food-register__heading">
              <View>
                <Text className="food-catalog-eyebrow">ACTIVE DEFINITIONS</Text>
                <Text className="food-register__title">当前目录</Text>
              </View>
              <Text className="metric">{hasReadSnapshot ? entries.length : '—'}</Text>
            </View>
            {loading && !hasReadSnapshot ? (
              <View className="food-register__empty">正在读取目录…</View>
            ) : !hasReadSnapshot ? (
              <View className="food-register__empty">食物定义数量尚未核对。</View>
            ) : entries.length ? (
              entries.map((entry) => (
                <View className="food-register__item" key={entry.id}>
                  <View>
                    <Text className="food-register__name">{entry.name}</Text>
                    <Text className="food-register__meta">
                      R{entry.revision} · {categoryLabels[entry.category]} ·{' '}
                      {entry.defaultServing.grams} g · {entry.nutrientsPer100g.energyKcal} kcal/100g
                    </Text>
                    <Text className="food-register__reference">依据：{entry.reference}</Text>
                  </View>
                  <Button
                    {...buttonActivationProps(() => void openEditor(entry), !readAuthorityReady)}
                    className="food-register__edit"
                    aria-label={`编辑${entry.name}`}
                  >
                    修订
                  </Button>
                </View>
              ))
            ) : (
              <View className="food-register__empty">
                还没有自建食物。先从包装或配方资料建立第一条。
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {archiving ? (
        <View className="food-modal" role="dialog" aria-modal="true" aria-label="确认归档自建食物">
          <View className="food-modal__card">
            <Text className="food-catalog-eyebrow">ARCHIVE OWNED FOOD</Text>
            <Text className="food-modal__title">归档“{archiving.name}”？</Text>
            <Text className="food-modal__body">
              它会离开可选目录；已有餐食、收藏和版本历史都保持原样。
            </Text>
            {recovery?.operation === 'food_archive' ? (
              <View
                className="workbench-recovery workbench-recovery--modal"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <Text className="workbench-recovery__eyebrow">{recovery.eyebrow}</Text>
                <Text className="workbench-recovery__message">{recovery.message}</Text>
                <Button
                  {...buttonActivationProps(handleRecoveryAction, busy)}
                  className="workbench-recovery__action"
                  style={{ color: 'var(--color-warning)' }}
                  disabled={busy}
                >
                  {busy ? '核对中…' : recovery.actionLabel}
                </Button>
              </View>
            ) : null}
            <View className="food-modal__actions">
              <Button
                {...buttonActivationProps(cancelArchive, busy)}
                style={{ color: 'var(--color-muted)' }}
                disabled={busy}
              >
                取消
              </Button>
              <Button
                {...buttonActivationProps(
                  () => void archive(),
                  busy || Boolean(recovery) || !readAuthorityReady,
                )}
                className="food-modal__danger"
                style={{ color: 'var(--color-pulse)' }}
                disabled={busy || Boolean(recovery) || !readAuthorityReady}
              >
                {busy ? '归档中…' : '确认归档'}
              </Button>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  )
}

const OwnerCatalogPage = () =>
  Taro.getCurrentInstance().router?.params.kind === 'exercise' ? (
    <ExerciseCatalogPage />
  ) : (
    <FoodCatalogPage />
  )

export default OwnerCatalogPage
