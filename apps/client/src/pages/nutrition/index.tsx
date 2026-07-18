import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Image, Input, ScrollView, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type {
  FavoriteFood,
  FoodPhotoAnalysis,
  FoodServing,
  FoodSnapshot,
  Meal,
  MealHistoryItem,
} from '@myfitness/contracts'
import { starterFoodCatalog } from '@myfitness/contracts/nutrition.constants'

import { buttonA11yProps } from '../../lib/accessibility'
import {
  ApiError,
  confirmFoodPhotoCandidate,
  createMeal,
  deleteFoodPhotoCandidate,
  deleteFavoriteFood,
  deleteMeal,
  getMealHistory,
  listFoodPhotoCandidates,
  listFavoriteFoods,
  listMeals,
  privatePhotoUrl,
  reserveFoodPhoto,
  saveFavoriteFood,
  updateMeal,
  uploadFoodPhoto,
} from '../../lib/api'
import {
  buildMealRequest,
  createCustomFoodDraft,
  draftFromCatalog,
  draftsFromPhotoConfirmation,
  draftFromMeal,
  draftFromSavedFood,
  initialMealDraft,
  mealDraftSummary,
  mealTypeLabels,
  recentFoods,
  validateCustomFood,
  validateMealDraft,
  type FoodDraft,
  type MealDraft,
} from './nutrition.model'
import './index.scss'

const actionLabels: Record<MealHistoryItem['action'], string> = {
  created: '创建餐次',
  updated: '修改餐次',
  deleted: '删除餐次',
}

const categoryLabels: Record<FoodSnapshot['category'], string> = {
  staple: '主食',
  protein: '蛋白来源',
  vegetable: '蔬菜',
  fruit: '水果',
  dairy: '乳品',
  snack: '零食',
  custom: '自定义',
}

const unitLabels: Record<FoodServing['unit'], string> = {
  g: 'g',
  ml: 'ml',
  piece: '个',
  serving: '份',
}

const displayTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))

const requestKey = () =>
  `meal-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`

const photoRequestKey = () =>
  `food-photo-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`

const messageOf = (error: unknown) =>
  error instanceof ApiError || error instanceof Error ? error.message : '操作失败，请稍后重试'

type SavedFood = { food: FoodSnapshot; defaultServing: FoodServing }

const confidenceLabels = { low: '低置信', medium: '中置信', high: '高置信' } as const

const NutritionPage = () => {
  const [draft, setDraft] = useState<MealDraft>(initialMealDraft)
  const [meals, setMeals] = useState<Meal[]>([])
  const [favorites, setFavorites] = useState<FavoriteFood[]>([])
  const [editing, setEditing] = useState<Meal>()
  const [deleting, setDeleting] = useState<Meal>()
  const [historyMeal, setHistoryMeal] = useState<Meal>()
  const [history, setHistory] = useState<MealHistoryItem[]>()
  const [sourceTab, setSourceTab] = useState<'library' | 'favorites' | 'recent'>('library')
  const [search, setSearch] = useState('')
  const [customOpen, setCustomOpen] = useState(false)
  const [custom, setCustom] = useState({
    name: '',
    grams: '100',
    energyKcal: '',
    proteinG: '',
    carbohydrateG: '',
    fatG: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [photoConsent, setPhotoConsent] = useState(false)
  const [photoAnalysis, setPhotoAnalysis] = useState<FoodPhotoAnalysis>()
  const [photoSelected, setPhotoSelected] = useState<string[]>([])
  const [photoGrams, setPhotoGrams] = useState<Record<string, string>>({})
  const [photoBusy, setPhotoBusy] = useState(false)
  const pendingKey = useRef('')

  const showPhotoAnalysis = (analysis: FoodPhotoAnalysis) => {
    setPhotoAnalysis(analysis)
    const candidates = analysis.content?.candidates ?? []
    setPhotoSelected(candidates.map((candidate) => candidate.catalogKey))
    setPhotoGrams(
      Object.fromEntries(
        candidates.map((candidate) => [
          candidate.catalogKey,
          String(
            Math.round((candidate.portionRange.minGrams + candidate.portionRange.maxGrams) / 2),
          ),
        ]),
      ),
    )
  }

  useEffect(() => {
    void (async () => {
      try {
        const [mealResult, favoriteResult, photoResult] = await Promise.all([
          listMeals(),
          listFavoriteFoods(),
          listFoodPhotoCandidates(),
        ])
        setMeals(mealResult.items)
        setFavorites(favoriteResult.items)
        const reviewable =
          photoResult.items.find((item) => item.status === 'ready') ?? photoResult.items[0]
        if (reviewable) showPhotoAnalysis(reviewable)
      } catch (error) {
        setFeedback(messageOf(error))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const summary = useMemo(() => mealDraftSummary(draft), [draft])
  const recents = useMemo(() => recentFoods(meals), [meals])
  const catalogEntries = useMemo<SavedFood[]>(() => {
    if (sourceTab === 'favorites') return favorites
    if (sourceTab === 'recent') return recents
    return starterFoodCatalog.map((entry) => ({
      food: draftFromCatalog(entry).food,
      defaultServing: {
        amount: entry.defaultServing.amount,
        unit: entry.defaultServing.unit,
        grams: entry.defaultServing.grams,
      },
    }))
  }, [favorites, recents, sourceTab])
  const visibleEntries = catalogEntries.filter((entry) => entry.food.name.includes(search.trim()))

  const addFood = (entry: SavedFood) => {
    const item =
      sourceTab === 'library'
        ? draftFromCatalog(
            starterFoodCatalog.find((candidate) => candidate.foodKey === entry.food.foodKey)!,
          )
        : draftFromSavedFood(entry)
    setDraft((current) => ({ ...current, items: [...current.items, item] }))
    setFeedback(`${entry.food.name}已加入本餐，请确认实际份量。`)
  }

  const updateAmount = (index: number, value: string) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, amount: value } : item,
      ),
    }))
  }

  const removeFood = (index: number) => {
    setDraft((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  const addCustom = () => {
    const error = validateCustomFood(custom)
    if (error) {
      setFeedback(error)
      return
    }
    setDraft((current) => ({
      ...current,
      items: [...current.items, createCustomFoodDraft(custom)],
    }))
    setCustom({
      name: '',
      grams: '100',
      energyKcal: '',
      proteinG: '',
      carbohydrateG: '',
      fatG: '',
    })
    setCustomOpen(false)
    setFeedback('自定义食物已加入；营养值按你填写的每 100g 快照计算。')
  }

  const choosePhoto = async () => {
    if (!photoConsent) {
      setFeedback('请先确认本次照片用途和删除规则。')
      return
    }
    setPhotoBusy(true)
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
      const analysis = await uploadFoodPhoto(ticket.upload.path, filePath)
      showPhotoAnalysis(analysis)
      setPhotoConsent(false)
      setFeedback(
        analysis.status === 'ready'
          ? '候选已生成。请逐项核对食物和份量；尚未写入餐次。'
          : '照片未生成可用候选，媒体已删除；你仍可手动记录。',
      )
    } catch (error) {
      if (reservedId) await deleteFoodPhotoCandidate(reservedId).catch(() => undefined)
      const message = messageOf(error)
      if (!message.toLowerCase().includes('cancel')) setFeedback(message)
    } finally {
      setPhotoBusy(false)
    }
  }

  const togglePhotoCandidate = (catalogKey: string) => {
    setPhotoSelected((current) =>
      current.includes(catalogKey)
        ? current.filter((key) => key !== catalogKey)
        : [...current, catalogKey],
    )
  }

  const discardPhoto = async () => {
    if (!photoAnalysis) return
    setPhotoBusy(true)
    try {
      await deleteFoodPhotoCandidate(photoAnalysis.id)
      setPhotoAnalysis(undefined)
      setPhotoSelected([])
      setPhotoGrams({})
      setFeedback('照片和衍生候选已删除。')
    } catch (error) {
      setFeedback(messageOf(error))
    } finally {
      setPhotoBusy(false)
    }
  }

  const confirmPhoto = async () => {
    if (!photoAnalysis?.content || photoAnalysis.status !== 'ready') return
    const candidates = new Map(
      photoAnalysis.content.candidates.map((candidate) => [candidate.catalogKey, candidate]),
    )
    const items = photoSelected.map((catalogKey) => ({
      catalogKey,
      grams: Number(photoGrams[catalogKey]),
    }))
    if (!items.length) {
      setFeedback('请至少选择一个候选，或删除校样后手动添加食物。')
      return
    }
    for (const item of items) {
      const candidate = candidates.get(item.catalogKey)
      if (
        !candidate ||
        !Number.isInteger(item.grams) ||
        item.grams < candidate.portionRange.minGrams ||
        item.grams > candidate.portionRange.maxGrams
      ) {
        setFeedback('确认克重需要位于每个候选显示的区间内。')
        return
      }
    }

    setPhotoBusy(true)
    try {
      const confirmed = await confirmFoodPhotoCandidate(photoAnalysis.id, { items })
      setDraft((current) => ({
        ...current,
        items: [...current.items, ...draftsFromPhotoConfirmation(confirmed.items)],
      }))
      setPhotoAnalysis(undefined)
      setPhotoSelected([])
      setPhotoGrams({})
      setFeedback('候选已带入当前草稿，照片已删除；餐次尚未保存，请继续核对。')
    } catch (error) {
      setFeedback(messageOf(error))
    } finally {
      setPhotoBusy(false)
    }
  }

  const isFavorite = (foodKey: string) =>
    favorites.some((favorite) => favorite.food.foodKey === foodKey)

  const toggleFavorite = async (item: FoodDraft) => {
    try {
      if (isFavorite(item.food.foodKey)) {
        await deleteFavoriteFood(item.food.foodKey)
        setFavorites((current) =>
          current.filter((favorite) => favorite.food.foodKey !== item.food.foodKey),
        )
        setFeedback(`${item.food.name}已从收藏移除。`)
      } else {
        const amount = Number(item.amount) || 1
        const saved = await saveFavoriteFood({
          food: item.food,
          defaultServing: {
            amount,
            unit: item.unit,
            grams: Math.round(amount * item.gramsPerUnit * 1_000) / 1_000,
          },
        })
        setFavorites((current) => [
          saved,
          ...current.filter((favorite) => favorite.food.foodKey !== saved.food.foodKey),
        ])
        setFeedback(`${item.food.name}已收藏，之后可快速添加。`)
      }
    } catch (error) {
      setFeedback(messageOf(error))
    }
  }

  const resetEditor = () => {
    setDraft(initialMealDraft())
    setEditing(undefined)
    pendingKey.current = ''
  }

  const save = async () => {
    const error = validateMealDraft(draft)
    if (error) {
      setFeedback(error)
      return
    }
    setSaving(true)
    try {
      if (editing) {
        const saved = await updateMeal(editing.id, buildMealRequest(draft, editing.revision))
        setMeals((current) => current.map((meal) => (meal.id === saved.id ? saved : meal)))
        setFeedback('餐次修改已保存，上一版本仍可在历史中查看。')
      } else {
        pendingKey.current ||= requestKey()
        const saved = await createMeal(buildMealRequest(draft), pendingKey.current)
        setMeals((current) => [saved, ...current.filter((meal) => meal.id !== saved.id)])
        setFeedback('餐次已保存。营养汇总来自你确认的食物与份量。')
      }
      resetEditor()
    } catch (requestError) {
      setFeedback(messageOf(requestError))
    } finally {
      setSaving(false)
    }
  }

  const edit = (meal: Meal) => {
    setEditing(meal)
    setDraft(draftFromMeal(meal))
    setFeedback('正在修改这餐；保存会产生新版本。')
    Taro.pageScrollTo({ scrollTop: 0, duration: 180 })
  }

  const repeat = (meal: Meal) => {
    setEditing(undefined)
    pendingKey.current = ''
    setDraft(draftFromMeal(meal, true))
    setFeedback('已复制食物与份量；请按今天实际吃下的内容调整后保存。')
    Taro.pageScrollTo({ scrollTop: 0, duration: 180 })
  }

  const remove = async () => {
    if (!deleting) return
    try {
      await deleteMeal(deleting.id, deleting.revision)
      setMeals((current) => current.filter((meal) => meal.id !== deleting.id))
      setDeleting(undefined)
      setFeedback('餐次已从日常记录移除，版本历史仍保留。')
    } catch (error) {
      setFeedback(messageOf(error))
    }
  }

  const openHistory = async (meal: Meal) => {
    setHistoryMeal(meal)
    setHistory(undefined)
    try {
      setHistory((await getMealHistory(meal.id)).items)
    } catch (error) {
      setFeedback(messageOf(error))
      setHistoryMeal(undefined)
    }
  }

  return (
    <View className="nutrition-page">
      <ScrollView className="nutrition-scroll" scrollY enhanced showScrollbar={false}>
        <View className="nutrition-shell">
          <View className="nutrition-topbar">
            <Button
              {...buttonA11yProps}
              className="nutrition-back"
              aria-label="返回今天"
              onClick={() => void Taro.navigateBack()}
            >
              ←
            </Button>
            <View className="nutrition-wordmark">
              <Text>衡迹</Text>
              <Text className="nutrition-wordmark__en">MEAL NOTE</Text>
            </View>
            <Text className="nutrition-count metric">{meals.length}</Text>
          </View>

          <View className="nutrition-hero">
            <Text className="nutrition-eyebrow">FOOD · PORTION · CONTEXT</Text>
            <Text className="nutrition-title">把一餐拆清楚，不必把数字吃成压力。</Text>
            <Text className="nutrition-intro">
              先确认食物和实际份量；这里整理记录，不评价“好坏”，也不把参考值当成精确化验。
            </Text>
          </View>

          <View className="nutrition-layout">
            <View className="nutrition-card meal-editor">
              <View className="nutrition-section-heading">
                <View>
                  <Text className="nutrition-eyebrow">{editing ? 'CORRECT MEAL' : 'NEW MEAL'}</Text>
                  <Text className="nutrition-panel-title">{editing ? '修改餐次' : '记录一餐'}</Text>
                </View>
                {editing ? (
                  <Button {...buttonA11yProps} className="nutrition-link" onClick={resetEditor}>
                    取消修改
                  </Button>
                ) : null}
              </View>

              <View className="meal-type-tabs">
                {(Object.keys(mealTypeLabels) as MealDraft['mealType'][]).map((type) => (
                  <Button
                    {...buttonA11yProps}
                    className={`meal-type ${draft.mealType === type ? 'meal-type--active' : ''}`}
                    aria-pressed={draft.mealType === type}
                    key={type}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        mealType: type,
                        title:
                          current.title === mealTypeLabels[current.mealType]
                            ? mealTypeLabels[type]
                            : current.title,
                      }))
                    }
                  >
                    {mealTypeLabels[type]}
                  </Button>
                ))}
              </View>

              <View className="nutrition-field">
                <Text className="nutrition-field__label">餐次名称</Text>
                <Input
                  className="nutrition-title-input"
                  value={draft.title}
                  maxlength={80}
                  aria-label="餐次名称"
                  onInput={(event) =>
                    setDraft((current) => ({ ...current, title: event.detail.value }))
                  }
                />
              </View>

              <View className="photo-proof">
                <View className="photo-proof__heading">
                  <View>
                    <Text className="nutrition-eyebrow">PHOTO PROOF / 可撤销校样</Text>
                    <Text className="photo-proof__title">从照片整理待确认食物</Text>
                  </View>
                  <Text className="photo-proof__index metric">AI · 01</Text>
                </View>

                {!photoAnalysis ? (
                  <View className="photo-intake">
                    <Text className="photo-intake__body">
                      仅用于本次食物候选分析。服务端会重编码并移除照片元数据；照片最长保留 24
                      小时，确认、删除或分析失败时立即删除。
                    </Text>
                    <Button
                      {...buttonA11yProps}
                      className={`photo-consent ${photoConsent ? 'photo-consent--active' : ''}`}
                      aria-pressed={photoConsent}
                      onClick={() => setPhotoConsent((current) => !current)}
                    >
                      <Text className="photo-consent__check">{photoConsent ? '✓' : '□'}</Text>
                      <Text>我同意本次上传与上述处理</Text>
                    </Button>
                    <Button
                      {...buttonA11yProps}
                      className="photo-choose"
                      disabled={!photoConsent || photoBusy}
                      aria-disabled={!photoConsent || photoBusy}
                      onClick={() => void choosePhoto()}
                    >
                      {photoBusy ? '正在制作校样…' : '选择一张餐食照片'}
                    </Button>
                    <Text className="photo-intake__formats metric">JPEG · PNG · WEBP / ≤ 6 MB</Text>
                  </View>
                ) : photoAnalysis.status === 'ready' ? (
                  <View className="photo-review">
                    <View className="photo-review__proof">
                      <Image
                        className="photo-review__image"
                        src={privatePhotoUrl(photoAnalysis.previewPath!)}
                        mode="aspectFill"
                        aria-label="已移除元数据的私有餐食照片预览"
                      />
                      <View className="photo-review__stamp">未确认 / PROOF</View>
                      <View className="photo-review__caption">
                        <Text>
                          {photoAnalysis.source === 'fixture'
                            ? '本地演示夹具 · 非真实识别'
                            : 'AI 图像候选 · 仍需人工确认'}
                        </Text>
                        <Text className="metric">24H AUTO DELETE</Text>
                      </View>
                    </View>

                    <View className="photo-candidates">
                      <Text className="photo-candidates__summary">
                        {photoAnalysis.content?.summary}
                      </Text>
                      {(photoAnalysis.content?.candidates ?? []).map((candidate, index) => {
                        const active = photoSelected.includes(candidate.catalogKey)
                        return (
                          <View className="photo-candidate" key={candidate.catalogKey}>
                            <Button
                              {...buttonA11yProps}
                              className={`photo-candidate__select ${active ? 'photo-candidate__select--active' : ''}`}
                              aria-pressed={active}
                              aria-label={`${active ? '取消选择' : '选择'}${candidate.label}`}
                              onClick={() => togglePhotoCandidate(candidate.catalogKey)}
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
                                  disabled={!active}
                                  value={photoGrams[candidate.catalogKey] ?? ''}
                                  aria-label={`${candidate.label}确认克重`}
                                  onInput={(event) =>
                                    setPhotoGrams((current) => ({
                                      ...current,
                                      [candidate.catalogKey]: event.detail.value,
                                    }))
                                  }
                                />
                                <Text>g</Text>
                              </View>
                            </View>
                          </View>
                        )
                      })}
                      {photoAnalysis.content?.needsManualEntry ? (
                        <Text className="photo-candidates__manual">
                          画面或目录不足以覆盖全部食物，请在下方食物库继续手动补充。
                        </Text>
                      ) : null}
                    </View>

                    <View className="photo-review__actions">
                      <Button
                        {...buttonA11yProps}
                        className="photo-review__discard"
                        disabled={photoBusy}
                        onClick={() => void discardPhoto()}
                      >
                        删除校样
                      </Button>
                      <Button
                        {...buttonA11yProps}
                        className="photo-review__confirm"
                        disabled={photoBusy}
                        onClick={() => void confirmPhoto()}
                      >
                        {photoBusy ? '正在确认…' : `确认 ${photoSelected.length} 项并带入草稿`}
                      </Button>
                    </View>
                    <Text className="photo-review__warning">
                      确认只会填充当前草稿；你仍需检查营养参考值并点击“保存餐次”。
                    </Text>
                  </View>
                ) : (
                  <View className="photo-unavailable">
                    <Text className="photo-review__stamp photo-review__stamp--deleted">
                      MEDIA DELETED
                    </Text>
                    <Text className="photo-unavailable__title">没有生成可用候选</Text>
                    <Text className="photo-unavailable__body">
                      照片已删除，不会生成猜测记录。请使用下方食物库手动添加，或删除本条结果后重新尝试。
                    </Text>
                    <Button
                      {...buttonA11yProps}
                      className="photo-review__discard"
                      disabled={photoBusy}
                      onClick={() => void discardPhoto()}
                    >
                      删除衍生结果
                    </Button>
                  </View>
                )}
              </View>

              <View className="food-picker">
                <View className="food-picker__heading">
                  <Text className="nutrition-field__label">添加食物</Text>
                  <Button
                    {...buttonA11yProps}
                    className="nutrition-link"
                    onClick={() => setCustomOpen((current) => !current)}
                  >
                    ＋ 自定义
                  </Button>
                </View>
                <View className="food-source-tabs">
                  {(
                    [
                      ['library', '食物库'],
                      ['favorites', `收藏 ${favorites.length}`],
                      ['recent', `最近 ${recents.length}`],
                    ] as const
                  ).map(([key, label]) => (
                    <Button
                      {...buttonA11yProps}
                      className={`food-source ${sourceTab === key ? 'food-source--active' : ''}`}
                      aria-pressed={sourceTab === key}
                      key={key}
                      onClick={() => setSourceTab(key)}
                    >
                      {label}
                    </Button>
                  ))}
                </View>
                <Input
                  className="food-search"
                  value={search}
                  placeholder="搜索当前列表"
                  aria-label="搜索食物"
                  onInput={(event) => setSearch(event.detail.value)}
                />
                <View className="food-catalog">
                  {visibleEntries.length ? (
                    visibleEntries.map((entry) => (
                      <Button
                        {...buttonA11yProps}
                        className="food-option"
                        aria-label={`添加${entry.food.name}`}
                        key={entry.food.foodKey}
                        onClick={() => addFood(entry)}
                      >
                        <Text className="food-option__plus">＋</Text>
                        <View>
                          <Text className="food-option__name">{entry.food.name}</Text>
                          <Text className="food-option__meta">
                            {entry.defaultServing.amount} {unitLabels[entry.defaultServing.unit]} ·{' '}
                            {Math.round(
                              (entry.food.nutrientsPer100g.energyKcal *
                                entry.defaultServing.grams) /
                                100,
                            )}{' '}
                            kcal
                          </Text>
                        </View>
                      </Button>
                    ))
                  ) : (
                    <View className="food-picker-empty">当前列表没有匹配食物</View>
                  )}
                </View>
              </View>

              {customOpen ? (
                <View className="custom-food">
                  <Text className="nutrition-eyebrow">MANUAL SNAPSHOT / 每 100g</Text>
                  <Text className="custom-food__title">按包装或食材资料录入</Text>
                  <View className="custom-grid">
                    {(
                      [
                        ['name', '食物名称', '例如：家庭炖牛肉'],
                        ['grams', '本次克重', '100'],
                        ['energyKcal', '热量 kcal', '0'],
                        ['proteinG', '蛋白质 g', '0'],
                        ['carbohydrateG', '碳水 g', '0'],
                        ['fatG', '脂肪 g', '0'],
                      ] as const
                    ).map(([key, label, placeholder]) => (
                      <View className="custom-field" key={key}>
                        <Text>{label}</Text>
                        <Input
                          className="custom-input metric"
                          type={key === 'name' ? 'text' : 'digit'}
                          value={custom[key]}
                          placeholder={placeholder}
                          aria-label={`自定义${label}`}
                          onInput={(event) =>
                            setCustom((current) => ({ ...current, [key]: event.detail.value }))
                          }
                        />
                      </View>
                    ))}
                  </View>
                  <Button {...buttonA11yProps} className="custom-add" onClick={addCustom}>
                    加入本餐
                  </Button>
                </View>
              ) : null}

              <View className="meal-items">
                <View className="meal-items__heading">
                  <Text className="nutrition-field__label">本餐内容</Text>
                  <Text className="meal-items__count metric">{draft.items.length}</Text>
                </View>
                {draft.items.length ? (
                  draft.items.map((item, index) => {
                    const grams = Number(item.amount) * item.gramsPerUnit
                    const energy =
                      Number.isFinite(grams) && grams > 0
                        ? Math.round((item.food.nutrientsPer100g.energyKcal * grams) / 100)
                        : 0
                    return (
                      <View className="meal-item" key={`${item.food.foodKey}-${index}`}>
                        <View className="meal-item__top">
                          <View>
                            <Text className="meal-item__category">
                              {categoryLabels[item.food.category]}
                            </Text>
                            <Text className="meal-item__name">{item.food.name}</Text>
                          </View>
                          <View className="meal-item__actions">
                            <Button
                              {...buttonA11yProps}
                              className={`favorite-toggle ${isFavorite(item.food.foodKey) ? 'favorite-toggle--active' : ''}`}
                              aria-label={`${isFavorite(item.food.foodKey) ? '取消收藏' : '收藏'}${item.food.name}`}
                              aria-pressed={isFavorite(item.food.foodKey)}
                              onClick={() => void toggleFavorite(item)}
                            >
                              {isFavorite(item.food.foodKey) ? '★' : '☆'}
                            </Button>
                            <Button
                              {...buttonA11yProps}
                              className="remove-food"
                              aria-label={`移除${item.food.name}`}
                              onClick={() => removeFood(index)}
                            >
                              移除
                            </Button>
                          </View>
                        </View>
                        <View className="portion-row">
                          <Text className="portion-row__label">实际份量</Text>
                          <Input
                            className="portion-input metric"
                            type="digit"
                            value={item.amount}
                            aria-label={`${item.food.name}份量`}
                            onInput={(event) => updateAmount(index, event.detail.value)}
                          />
                          <Text className="portion-unit metric">{unitLabels[item.unit]}</Text>
                          <Text className="portion-grams metric">
                            ≈ {Number.isFinite(grams) ? Math.round(grams) : 0} g
                          </Text>
                        </View>
                        <View className="meal-item__nutrition">
                          <Text className="metric">{energy} kcal</Text>
                          <Text>
                            P {Math.round((item.food.nutrientsPer100g.proteinG * grams) / 10) / 10}g
                          </Text>
                          <Text>
                            C{' '}
                            {Math.round((item.food.nutrientsPer100g.carbohydrateG * grams) / 10) /
                              10}
                            g
                          </Text>
                          <Text>
                            F {Math.round((item.food.nutrientsPer100g.fatG * grams) / 10) / 10}g
                          </Text>
                        </View>
                      </View>
                    )
                  })
                ) : (
                  <View className="meal-items-empty">从上方加入食物，再按实际份量校正。</View>
                )}
              </View>

              <View className="meal-summary" aria-label="本餐营养汇总预览">
                <View className="meal-summary__energy">
                  <Text className="meal-summary__value metric">{summary.energyKcal}</Text>
                  <Text className="meal-summary__label">kcal</Text>
                </View>
                <View>
                  <Text className="meal-summary__value metric">{summary.proteinG}</Text>
                  <Text className="meal-summary__label">蛋白质 g</Text>
                </View>
                <View>
                  <Text className="meal-summary__value metric">{summary.carbohydrateG}</Text>
                  <Text className="meal-summary__label">碳水 g</Text>
                </View>
                <View>
                  <Text className="meal-summary__value metric">{summary.fatG}</Text>
                  <Text className="meal-summary__label">脂肪 g</Text>
                </View>
              </View>

              <View className="nutrition-field">
                <Text className="nutrition-field__label">备注（可选）</Text>
                <Textarea
                  className="meal-note"
                  value={draft.note}
                  maxlength={500}
                  placeholder="烹饪方式、包装品牌，或下次需要校正的事"
                  onInput={(event) =>
                    setDraft((current) => ({ ...current, note: event.detail.value }))
                  }
                />
              </View>

              {feedback ? (
                <View className="nutrition-feedback" role="status">
                  {feedback}
                </View>
              ) : null}
              <Button
                {...buttonA11yProps}
                className="save-meal"
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? '正在保存…' : editing ? '保存餐次新版本' : '保存餐次'}
              </Button>
            </View>

            <View className="nutrition-card meal-ledger">
              <View className="nutrition-section-heading">
                <View>
                  <Text className="nutrition-eyebrow">RECENT MEALS</Text>
                  <Text className="nutrition-panel-title">饮食记录簿</Text>
                </View>
                <Text className="meal-ledger__count metric">{meals.length}</Text>
              </View>
              {loading ? (
                <View className="meal-empty">正在整理餐次…</View>
              ) : meals.length ? (
                <View className="meal-list">
                  {meals.map((meal) => (
                    <View className="meal-entry" key={meal.id}>
                      <View className="meal-entry__top">
                        <Text className="meal-entry__type">{mealTypeLabels[meal.mealType]}</Text>
                        <Text className="meal-entry__date metric">
                          {displayTime(meal.occurredAt)}
                        </Text>
                      </View>
                      <Text className="meal-entry__title">{meal.title}</Text>
                      <Text className="meal-entry__foods">
                        {meal.items.map((item) => item.food.name).join(' · ')}
                      </Text>
                      <View className="meal-entry__numbers">
                        <View>
                          <Text className="meal-entry__number metric">
                            {Math.round(meal.summary.energyKcal)}
                          </Text>
                          <Text>kcal</Text>
                        </View>
                        <View>
                          <Text className="meal-entry__number metric">{meal.summary.proteinG}</Text>
                          <Text>蛋白质 g</Text>
                        </View>
                        <View>
                          <Text className="meal-entry__number metric">v{meal.revision}</Text>
                          <Text>版本</Text>
                        </View>
                      </View>
                      <View className="meal-entry__actions">
                        <Button
                          {...buttonA11yProps}
                          className="entry-action"
                          onClick={() => repeat(meal)}
                        >
                          再记一次
                        </Button>
                        <Button
                          {...buttonA11yProps}
                          className="entry-action"
                          onClick={() => edit(meal)}
                        >
                          修改
                        </Button>
                        <Button
                          {...buttonA11yProps}
                          className="entry-action"
                          onClick={() => void openHistory(meal)}
                        >
                          历史
                        </Button>
                        <Button
                          {...buttonA11yProps}
                          className="entry-action entry-action--danger"
                          onClick={() => setDeleting(meal)}
                        >
                          删除
                        </Button>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View className="meal-empty meal-empty--illustrated">
                  <Text className="meal-empty__mark metric">01</Text>
                  <Text className="meal-empty__title">还没有饮食记录</Text>
                  <Text className="meal-empty__body">加入食物、确认份量，保存第一餐。</Text>
                </View>
              )}
            </View>
          </View>

          <Text className="nutrition-footnote">
            食物组成会随品牌、部位和烹饪方式变化；参考值用于个人记录，不替代营养或医疗评估。
          </Text>
        </View>
      </ScrollView>

      {deleting ? (
        <View className="meal-modal" role="dialog" aria-modal="true" aria-label="确认删除餐次">
          <View className="meal-modal__card">
            <Text className="nutrition-eyebrow">REMOVE MEAL</Text>
            <Text className="meal-modal__title">删除“{deleting.title}”？</Text>
            <Text className="meal-modal__body">它会离开日常记录簿，但版本审计仍会保留。</Text>
            <View className="meal-modal__actions">
              <Button
                {...buttonA11yProps}
                className="modal-action"
                onClick={() => setDeleting(undefined)}
              >
                取消
              </Button>
              <Button
                {...buttonA11yProps}
                className="modal-action modal-action--danger"
                onClick={() => void remove()}
              >
                确认删除
              </Button>
            </View>
          </View>
        </View>
      ) : null}

      {historyMeal ? (
        <View className="meal-history" role="dialog" aria-modal="true" aria-label="餐次历史">
          <Button
            {...buttonA11yProps}
            className="meal-history__scrim"
            aria-label="关闭餐次历史"
            onClick={() => setHistoryMeal(undefined)}
          />
          <View className="meal-history__sheet">
            <View className="nutrition-section-heading">
              <View>
                <Text className="nutrition-eyebrow">AUDIT TRAIL</Text>
                <Text className="nutrition-panel-title">{historyMeal.title}历史</Text>
              </View>
              <Button
                {...buttonA11yProps}
                className="history-close"
                aria-label="关闭餐次历史"
                onClick={() => setHistoryMeal(undefined)}
              >
                ×
              </Button>
            </View>
            {history ? (
              <View className="history-list">
                {history.map((item) => (
                  <View className="history-entry" key={`${item.revision}-${item.action}`}>
                    <View className={`history-mark history-mark--${item.action}`} />
                    <View>
                      <Text className="history-entry__action">{actionLabels[item.action]}</Text>
                      <Text className="history-entry__value metric">
                        v{item.revision} · {Math.round(item.summary.energyKcal)} kcal · P{' '}
                        {item.summary.proteinG}g
                      </Text>
                      <Text className="history-entry__time">{displayTime(item.changedAt)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View className="meal-empty">正在读取历史…</View>
            )}
          </View>
        </View>
      ) : null}
    </View>
  )
}

export default NutritionPage
