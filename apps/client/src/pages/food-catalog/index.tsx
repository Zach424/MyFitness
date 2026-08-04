import { useEffect, useRef, useState } from 'react'
import { Button, Input, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type {
  CustomFoodCatalogEntry,
  FoodCatalogEntryHistoryItem,
  FoodSnapshot,
} from '@myfitness/contracts'

import { buttonA11yProps } from '../../lib/accessibility'
import {
  ApiError,
  archiveFoodCatalogEntry,
  createFoodCatalogEntry,
  getFoodCatalogEntryHistory,
  listFoodCatalog,
  updateFoodCatalogEntry,
} from '../../lib/api'
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

const displayTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))

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

const FoodCatalogPage = () => {
  const requestedEntryId = useRef(Taro.getCurrentInstance().router?.params.entryId ?? '')
  const [entries, setEntries] = useState<CustomFoodCatalogEntry[]>([])
  const [editing, setEditing] = useState<CustomFoodCatalogEntry>()
  const [archiving, setArchiving] = useState<CustomFoodCatalogEntry>()
  const [history, setHistory] = useState<FoodCatalogEntryHistoryItem[]>([])
  const [form, setForm] = useState(emptyForm)
  const [editorOpen, setEditorOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')

  const openEditor = async (entry?: CustomFoodCatalogEntry) => {
    setEditing(entry)
    setForm(entry ? formFromEntry(entry) : emptyForm())
    setHistory([])
    setEditorOpen(true)
    if (!entry) return
    try {
      setHistory((await getFoodCatalogEntryHistory(entry.id)).items)
    } catch (error) {
      setFeedback(messageOf(error))
    }
  }

  useEffect(() => {
    let active = true
    void listFoodCatalog()
      .then((result) => {
        if (!active) return
        const custom = result.items.filter(
          (entry): entry is CustomFoodCatalogEntry => entry.source === 'custom',
        )
        setEntries(custom)
        const requested = custom.find((entry) => entry.id === requestedEntryId.current)
        if (requested) void openEditor(requested)
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

  const closeEditor = () => {
    setEditorOpen(false)
    setEditing(undefined)
    setHistory([])
    setForm(emptyForm())
  }

  const save = async () => {
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
        : await createFoodCatalogEntry(payload, requestKey())
      setEntries((current) => [saved, ...current.filter((entry) => entry.id !== saved.id)])
      closeEditor()
      setFeedback(
        wasCorrection
          ? '定义已纠正；餐食页中的当前草稿、历史餐食和收藏快照不会被改写。'
          : '自建食物已保存；返回餐食页后可从“我的”列表加入本餐。',
      )
    } catch (error) {
      setFeedback(messageOf(error))
    } finally {
      setBusy(false)
    }
  }

  const archive = async () => {
    if (!archiving) return
    setBusy(true)
    try {
      await archiveFoodCatalogEntry(archiving.id, archiving.revision)
      setEntries((current) => current.filter((entry) => entry.id !== archiving.id))
      setArchiving(undefined)
      closeEditor()
      setFeedback('自建食物已归档；历史餐食与收藏未被改写。')
    } catch (error) {
      setFeedback(messageOf(error))
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
              {...buttonA11yProps}
              className="food-catalog-back"
              aria-label="返回餐食记录"
              onClick={() => void Taro.navigateBack()}
            >
              ←
            </Button>
            <View>
              <Text className="food-catalog-wordmark">衡迹</Text>
              <Text className="food-catalog-eyebrow">OWNED FOOD REGISTER</Text>
            </View>
            <Text className="food-catalog-count metric">{entries.length}</Text>
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
              {...buttonA11yProps}
              className="food-catalog-new"
              onClick={() => void openEditor()}
            >
              ＋ 新建食物
            </Button>
            <Text>照片候选仍只使用受控的演示目录，不会自动信任自建条目。</Text>
          </View>

          {feedback ? (
            <View className="food-catalog-feedback" role="status">
              {feedback}
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
                      className="food-editor__input metric"
                      type={['name', 'aliases', 'reference'].includes(key) ? 'text' : 'digit'}
                      value={form[key]}
                      placeholder={placeholder}
                      aria-label={`自定义${label}`}
                      onInput={(event) =>
                        setForm((current) => ({ ...current, [key]: event.detail.value }))
                      }
                    />
                  </View>
                ))}
              </View>
              <View className="food-editor__categories" aria-label="食物分类">
                {(Object.keys(categoryLabels) as FoodSnapshot['category'][]).map((category) => (
                  <Button
                    {...buttonA11yProps}
                    className={`food-editor__category ${form.category === category ? 'food-editor__category--active' : ''}`}
                    aria-pressed={form.category === category}
                    key={category}
                    onClick={() => setForm((current) => ({ ...current, category }))}
                  >
                    {categoryLabels[category]}
                  </Button>
                ))}
              </View>
              {history.length ? (
                <View className="food-editor__history">
                  <Text className="food-catalog-eyebrow">REVISION LEDGER</Text>
                  {history.map((item) => (
                    <Text
                      className="food-editor__revision"
                      key={`${item.revision}-${item.changedAt}`}
                    >
                      R{item.revision} ·{' '}
                      {item.action === 'created'
                        ? '创建'
                        : item.action === 'updated'
                          ? '纠正'
                          : '归档'}{' '}
                      · {item.name} · {displayTime(item.changedAt)}
                    </Text>
                  ))}
                </View>
              ) : null}
              <View className="food-editor__actions">
                {editing ? (
                  <Button
                    {...buttonA11yProps}
                    className="food-editor__archive"
                    disabled={busy}
                    onClick={() => setArchiving(editing)}
                  >
                    归档
                  </Button>
                ) : null}
                <Button
                  {...buttonA11yProps}
                  className="food-editor__cancel"
                  disabled={busy}
                  onClick={closeEditor}
                >
                  取消
                </Button>
                <Button
                  {...buttonA11yProps}
                  className="food-editor__save"
                  disabled={busy}
                  onClick={() => void save()}
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
              <Text className="metric">{entries.length}</Text>
            </View>
            {loading ? (
              <View className="food-register__empty">正在读取目录…</View>
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
                    {...buttonA11yProps}
                    className="food-register__edit"
                    aria-label={`编辑${entry.name}`}
                    onClick={() => void openEditor(entry)}
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
            <View className="food-modal__actions">
              <Button {...buttonA11yProps} disabled={busy} onClick={() => setArchiving(undefined)}>
                取消
              </Button>
              <Button
                {...buttonA11yProps}
                className="food-modal__danger"
                disabled={busy}
                onClick={() => void archive()}
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

export default FoodCatalogPage
