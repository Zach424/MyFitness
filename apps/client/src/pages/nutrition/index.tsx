import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, ScrollView, Text, Textarea, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import type {
  FavoriteFood,
  FoodCatalogItem,
  ConfirmFoodPhotoCandidate,
  FoodServing,
  FoodSnapshot,
  Meal,
  MealHistoryItem,
} from '@myfitness/contracts'

import { buttonA11yProps, buttonActivationProps, deferH5Focus } from '../../lib/accessibility'
import { parseBackfillIntent } from '../../lib/backfill-intent'
import { LocalDraftNotice } from '../../components/local-draft-notice'
import { OccurrenceField } from '../../components/occurrence-field'
import { currentCorrectionTarget } from '../../lib/correction-draft'
import {
  ApiError,
  createMeal,
  deleteFavoriteFood,
  deleteMeal,
  getMeal,
  getMealHistory,
  listFoodCatalog,
  listFavoriteFoods,
  listMeals,
  saveFavoriteFood,
  updateMeal,
} from '../../lib/api'
import { appendOlderRecords, includeExactRecord } from '../../lib/record-pages'
import { useRecoverableDraft } from '../../lib/use-local-draft'
import {
  buildMealRequest,
  draftFromFoodCatalogItem,
  draftsFromPhotoConfirmation,
  draftFromMeal,
  draftFromSavedFood,
  initialMealDraft,
  isMealDraft,
  mealDraftSummary,
  mealTypeLabels,
  recentFoods,
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

const messageOf = (error: unknown) =>
  error instanceof ApiError || error instanceof Error ? error.message : '操作失败，请稍后重试'

type SavedFood = { food: FoodSnapshot; defaultServing: FoodServing }

type CatalogDisplayEntry = SavedFood & { catalog?: FoodCatalogItem }

const catalogFoodSnapshot = (entry: FoodCatalogItem): FoodSnapshot => ({
  foodKey: entry.foodKey,
  name: entry.name,
  category: entry.category,
  nutrientsPer100g: entry.nutrientsPer100g,
  reference: entry.reference,
})

const NutritionPage = () => {
  const backfill = useRef(parseBackfillIntent(Taro.getCurrentInstance().router?.params)).current
  const [draft, setDraft] = useState<MealDraft>(() => {
    const next = initialMealDraft()
    if (backfill) {
      next.occurredLocal = backfill.localDate
      next.timezone = backfill.timezone
    }
    return next
  })
  const [meals, setMeals] = useState<Meal[]>([])
  const [favorites, setFavorites] = useState<FavoriteFood[]>([])
  const [foodCatalog, setFoodCatalog] = useState<FoodCatalogItem[]>([])
  const [editing, setEditing] = useState<Meal>()
  const [deleting, setDeleting] = useState<Meal>()
  const [historyMeal, setHistoryMeal] = useState<Meal>()
  const [history, setHistory] = useState<MealHistoryItem[]>()
  const [historyNextCursor, setHistoryNextCursor] = useState<string | null>(null)
  const [sourceTab, setSourceTab] = useState<'library' | 'custom' | 'favorites' | 'recent'>(
    'library',
  )
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const pendingKey = useRef('')
  const photoReturnFocus = useRef(false)

  useEffect(() => {
    void (async () => {
      try {
        const [mealResult, favoriteResult] = await Promise.all([
          listMeals({ limit: 20 }),
          listFavoriteFoods(),
        ])
        setMeals(mealResult.items)
        setNextCursor(mealResult.nextCursor)
        setFavorites(favoriteResult.items)
      } catch (error) {
        setFeedback(messageOf(error))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  useDidShow(() => {
    void listFoodCatalog()
      .then((result) => setFoodCatalog(result.items))
      .catch((error: unknown) => setFeedback(messageOf(error)))
    if (photoReturnFocus.current) {
      photoReturnFocus.current = false
      deferH5Focus('food-photo-launch', 350)
    }
  })

  const loadOlderMeals = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const result = await listMeals({ limit: 20, cursor: nextCursor })
      setMeals((current) => appendOlderRecords(current, result.items))
      setNextCursor(result.nextCursor)
    } catch (error) {
      setFeedback(messageOf(error))
    } finally {
      setLoadingMore(false)
    }
  }

  const recoverableDraft = useRecoverableDraft({
    kind: 'meal',
    draft,
    enabled: true,
    dirty:
      JSON.stringify(draft) !==
      JSON.stringify(editing ? draftFromMeal(editing) : initialMealDraft()),
    validate: isMealDraft,
  })

  const restorePendingDraft = async () => {
    const pending = recoverableDraft.pending
    if (!pending) return
    const correction = pending.payload.correction
    if (!correction) {
      const restored = recoverableDraft.restore()
      if (!restored) return
      setDraft(restored)
      pendingKey.current = ''
      setFeedback('本地餐次草稿已恢复；请重新核对食物、份量和参考来源。')
      return
    }
    try {
      const exact = await getMeal(correction.aggregateId)
      const target = currentCorrectionTarget([exact], correction)
      if (!target) {
        recoverableDraft.clear()
        setFeedback('这份修改基于旧版本或已删除餐次，已安全放弃；当前餐次没有被覆盖。')
        return
      }
      setMeals((current) => includeExactRecord(current, target))
      const restored = recoverableDraft.restore()
      if (!restored) return
      setEditing(target)
      setDraft(restored)
      pendingKey.current = ''
      setFeedback(`已恢复基于 R${correction.baseRevision} 的餐次修改；保存仍会校验当前版本。`)
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 404) {
        recoverableDraft.clear()
        setFeedback('这份修改对应的餐次已删除，已安全放弃；当前餐次没有被覆盖。')
        return
      }
      setFeedback(`暂时无法核对原餐次，修改草稿仍保留。${messageOf(error)}`)
    }
  }

  const summary = useMemo(() => mealDraftSummary(draft), [draft])
  const recents = useMemo(() => recentFoods(meals), [meals])
  const catalogEntries = useMemo<CatalogDisplayEntry[]>(() => {
    if (sourceTab === 'favorites') return favorites
    if (sourceTab === 'recent') return recents
    return foodCatalog
      .filter((entry) => entry.source === (sourceTab === 'custom' ? 'custom' : 'starter'))
      .map((entry) => ({
        food: catalogFoodSnapshot(entry),
        defaultServing: entry.defaultServing,
        catalog: entry,
      }))
  }, [favorites, foodCatalog, recents, sourceTab])
  const visibleEntries = catalogEntries.filter((entry) => {
    const query = search.trim().toLocaleLowerCase()
    if (!query) return true
    return [entry.food.name, ...(entry.catalog?.aliases ?? [])].some((label) =>
      label.toLocaleLowerCase().includes(query),
    )
  })

  const addFood = (entry: CatalogDisplayEntry) => {
    const item = entry.catalog ? draftFromFoodCatalogItem(entry.catalog) : draftFromSavedFood(entry)
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

  const openFoodPhotoWorkflow = () => {
    photoReturnFocus.current = true
    void Taro.navigateTo({
      url: '/pages/progress-photos/index?kind=food',
      events: {
        foodPhotoConfirmed: (items: ConfirmFoodPhotoCandidate['items']) => {
          try {
            const confirmedDrafts = draftsFromPhotoConfirmation(items)
            setDraft((current) => ({
              ...current,
              items: [...current.items, ...confirmedDrafts],
            }))
            pendingKey.current = ''
            setFeedback('候选已带入当前草稿，照片已删除；餐次尚未保存，请继续核对。')
          } catch (error) {
            setFeedback(messageOf(error))
          }
        },
      },
    }).catch((error: unknown) => {
      photoReturnFocus.current = false
      setFeedback(messageOf(error))
    })
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
    recoverableDraft.clear()
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
    if (recoverableDraft.pending) {
      setFeedback('请先恢复或放弃页面顶部的本地草稿，再开始另一项修改。')
      Taro.pageScrollTo({ scrollTop: 0, duration: 180 })
      return
    }
    setEditing(meal)
    setDraft(draftFromMeal(meal))
    setFeedback('正在修改这餐；保存会产生新版本。')
    Taro.pageScrollTo({ scrollTop: 0, duration: 180 })
  }

  const repeat = (meal: Meal) => {
    if (recoverableDraft.pending) {
      setFeedback('请先恢复或放弃页面顶部的本地草稿，再复制另一餐。')
      Taro.pageScrollTo({ scrollTop: 0, duration: 180 })
      return
    }
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
    setHistoryNextCursor(null)
    try {
      const result = await getMealHistory(meal.id, { limit: 10 })
      setHistory(result.items)
      setHistoryNextCursor(result.nextCursor)
    } catch (error) {
      setFeedback(messageOf(error))
      setHistoryMeal(undefined)
    }
  }

  const loadOlderHistory = async () => {
    if (!historyMeal || !historyNextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const result = await getMealHistory(historyMeal.id, {
        limit: 10,
        cursor: historyNextCursor,
      })
      setHistory((current) => [...(current ?? []), ...result.items])
      setHistoryNextCursor(result.nextCursor)
    } catch (error) {
      setFeedback(messageOf(error))
    } finally {
      setLoadingMore(false)
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
            <Button
              {...buttonA11yProps}
              className="nutrition-observation-link"
              aria-label="查看每日营养趋势"
              onClick={() => void Taro.navigateTo({ url: '/pages/nutrition-insights/index' })}
            >
              趋势 →
            </Button>
          </View>

          <View className="nutrition-hero">
            <Text className="nutrition-eyebrow">FOOD · PORTION · CONTEXT</Text>
            <Text className="nutrition-title">把一餐拆清楚，不必把数字吃成压力。</Text>
            <Text className="nutrition-intro">
              先确认食物和实际份量；这里整理记录，不评价“好坏”，也不把参考值当成精确化验。
            </Text>
          </View>

          {recoverableDraft.pending ? (
            <LocalDraftNotice
              mode="restore"
              envelope={recoverableDraft.pending}
              correctionRevision={recoverableDraft.pending.payload.correction?.baseRevision}
              onRestore={() => {
                void restorePendingDraft()
              }}
              onDiscard={() => {
                recoverableDraft.clear()
                setDraft(initialMealDraft())
                pendingKey.current = ''
                setFeedback('本地餐次草稿已清除。')
              }}
            />
          ) : recoverableDraft.saved ? (
            <LocalDraftNotice
              mode="saved"
              envelope={recoverableDraft.saved}
              correctionRevision={recoverableDraft.saved.payload.correction?.baseRevision}
              onDiscard={() => {
                resetEditor()
                setFeedback('本地餐次草稿已清除。')
              }}
            />
          ) : null}

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

              <OccurrenceField
                label="进餐时间"
                value={draft.occurredLocal}
                timeZone={draft.timezone}
                selectedOffsetMinutes={draft.occurrenceOffsetMinutes}
                onChange={(occurredLocal) => {
                  setDraft((current) => ({
                    ...current,
                    occurredLocal,
                    originalOccurredAt: undefined,
                  }))
                  pendingKey.current = ''
                  setFeedback('')
                }}
                onTimeZoneChange={(timezone) => {
                  setDraft((current) => ({ ...current, timezone, originalOccurredAt: undefined }))
                  pendingKey.current = ''
                  setFeedback('')
                }}
                onOffsetChange={(occurrenceOffsetMinutes) => {
                  setDraft((current) => ({
                    ...current,
                    occurrenceOffsetMinutes,
                    originalOccurredAt: undefined,
                  }))
                  pendingKey.current = ''
                  setFeedback('')
                }}
              />

              <View className="photo-launch">
                <View>
                  <Text className="nutrition-eyebrow">PHOTO PROOF / 按需打开</Text>
                  <Text className="photo-launch__title">从照片整理待确认食物</Text>
                  <Text className="photo-launch__body">
                    照片、授权与未确认候选留在独立校样台，不进入当前草稿；只有你确认的食物和克重会返回。
                  </Text>
                </View>
                <Button
                  {...buttonActivationProps(openFoodPhotoWorkflow)}
                  id="food-photo-launch"
                  className="photo-launch__action"
                >
                  打开照片校样台
                </Button>
              </View>

              <View className="food-picker">
                <View className="food-picker__heading">
                  <Text className="nutrition-field__label">添加食物</Text>
                  <Button
                    {...buttonA11yProps}
                    className="nutrition-link"
                    onClick={() => void Taro.navigateTo({ url: '/pages/food-catalog/index' })}
                  >
                    管理我的食物
                  </Button>
                </View>
                <View className="food-source-tabs">
                  {(
                    [
                      ['library', '食物库'],
                      [
                        'custom',
                        `我的 ${foodCatalog.filter((entry) => entry.source === 'custom').length}`,
                      ],
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
                      <View className="food-option-wrap" key={entry.food.foodKey}>
                        <Button
                          {...buttonA11yProps}
                          className="food-option"
                          aria-label={`添加${entry.food.name}`}
                          onClick={() => addFood(entry)}
                        >
                          <Text className="food-option__plus">＋</Text>
                          <View>
                            <Text className="food-option__name">{entry.food.name}</Text>
                            <Text className="food-option__meta">
                              {entry.defaultServing.amount} {unitLabels[entry.defaultServing.unit]}{' '}
                              ·{' '}
                              {Math.round(
                                (entry.food.nutrientsPer100g.energyKcal *
                                  entry.defaultServing.grams) /
                                  100,
                              )}{' '}
                              kcal
                            </Text>
                          </View>
                        </Button>
                        {entry.catalog?.source === 'custom' ? (
                          <Button
                            {...buttonA11yProps}
                            className="food-option__edit"
                            aria-label={`编辑${entry.food.name}`}
                            onClick={() =>
                              void Taro.navigateTo({
                                url: `/pages/food-catalog/index?entryId=${entry.catalog?.id}`,
                              })
                            }
                          >
                            修订 · R{entry.catalog.revision}
                          </Button>
                        ) : null}
                      </View>
                    ))
                  ) : (
                    <View className="food-picker-empty">当前列表没有匹配食物</View>
                  )}
                </View>
              </View>

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
                <View
                  className="nutrition-feedback"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
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
                <Text className="meal-ledger__count metric">已载入 {meals.length}</Text>
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
              {nextCursor ? (
                <Button
                  {...buttonA11yProps}
                  className="record-page-more"
                  disabled={loadingMore}
                  onClick={() => void loadOlderMeals()}
                >
                  {loadingMore ? '正在载入…' : '继续载入更早餐次'}
                </Button>
              ) : meals.length ? (
                <Text className="record-page-end">已载入当前全部餐次</Text>
              ) : null}
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
                {historyNextCursor ? (
                  <Button
                    {...buttonA11yProps}
                    className="record-page-more"
                    disabled={loadingMore}
                    onClick={() => void loadOlderHistory()}
                  >
                    {loadingMore ? '正在载入…' : '继续载入更早版本'}
                  </Button>
                ) : (
                  <Text className="record-page-end">已载入全部版本</Text>
                )}
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
