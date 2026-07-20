import type {
  AiExplanation,
  CreateHealthRecord,
  CreateMeal,
  CreateWorkout,
  Dashboard,
  DevSession,
  VerifiedSession,
  FavoriteFood,
  FavoriteFoodInput,
  FoodPhotoAnalysis,
  FoodPhotoConfirmation,
  FoodPhotoTicket,
  GenerateWeeklyPlan,
  GenerateAiExplanation,
  ConfirmFoodPhotoCandidate,
  HealthRecord,
  HealthRecordHistoryItem,
  Meal,
  MealHistoryItem,
  OidcAuthorizationConfig,
  OidcSessionRequest,
  OnboardingRequest,
  OnboardingResponse,
  PlanDecision,
  PrivacyOverview,
  RevocableConsentPurpose,
  ConsentRevocationResult,
  AccountDeletionRequest,
  AccountDeletionResult,
  AccountDeletionIntent,
  ErasureReceiptStatus,
  UpdateHealthRecord,
  UpdateMeal,
  UpdateWorkout,
  WeeklyPlan,
  WeeklyPlanHistoryItem,
  Workout,
  WorkoutHistoryItem,
} from '@myfitness/contracts'
import {
  foodPhotoConsentVersion,
  oidcAuthorizationConfigSchema,
  verifiedSessionSchema,
} from '@myfitness/contracts'
import Taro from '@tarojs/taro'

const API_BASE_URL = __API_BASE_URL__.replace(/\/$/, '')
const AUTH_MODE = __AUTH_MODE__
const TOKEN_KEY = 'myfitness.auth.accessToken'
const LEGACY_TOKEN_KEY = 'myfitness.dev.accessToken'
const SUBJECT_KEY = 'myfitness.dev.subject'
const ERASURE_RECEIPT_KEY = 'myfitness.privacy.erasureReceipt'

type StoredErasureReceipt = {
  intentId: string
  statusToken: string
  expiresAt: string
  receiptId?: string
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const erasureTokenPattern = /^[A-Za-z0-9_-]{43}$/

const readStoredErasureReceipt = (): StoredErasureReceipt | null => {
  const raw = Taro.getStorageSync<string>(ERASURE_RECEIPT_KEY)
  if (!raw || typeof raw !== 'string') return null
  try {
    const value = JSON.parse(raw) as Partial<StoredErasureReceipt>
    if (
      typeof value.intentId !== 'string' ||
      !uuidPattern.test(value.intentId) ||
      typeof value.statusToken !== 'string' ||
      !erasureTokenPattern.test(value.statusToken) ||
      typeof value.expiresAt !== 'string' ||
      !Number.isFinite(Date.parse(value.expiresAt)) ||
      (value.receiptId !== undefined &&
        (typeof value.receiptId !== 'string' || !uuidPattern.test(value.receiptId)))
    ) {
      throw new Error('stored erasure receipt is invalid')
    }
    return value as StoredErasureReceipt
  } catch {
    Taro.removeStorageSync(ERASURE_RECEIPT_KEY)
    return null
  }
}

const writeStoredErasureReceipt = (value: StoredErasureReceipt) =>
  Taro.setStorageSync(ERASURE_RECEIPT_KEY, JSON.stringify(value))

const clearAuthStorage = () => {
  Taro.removeStorageSync(TOKEN_KEY)
  Taro.removeStorageSync(LEGACY_TOKEN_KEY)
  Taro.removeStorageSync(SUBJECT_KEY)
}

type ClientSession = {
  accessToken: string
  isNewUser: boolean
}

type ApiErrorBody = {
  message?: string | string[]
  statusCode?: number
}

export class ApiError extends Error {
  readonly statusCode: number

  constructor(statusCode: number, body?: ApiErrorBody) {
    const message = Array.isArray(body?.message)
      ? body.message.join('；')
      : (body?.message ?? `请求失败（${statusCode}）`)
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
  }
}

export class AuthenticationRequiredError extends Error {
  constructor() {
    super('请先完成网页登录')
    this.name = 'AuthenticationRequiredError'
  }
}

const createSubject = () => {
  const randomPart =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `local:${randomPart}`
}

const requestDevSession = async (): Promise<ClientSession> => {
  let subject = Taro.getStorageSync<string>(SUBJECT_KEY)
  const isNewUser = !subject
  if (!subject) {
    subject = createSubject()
    Taro.setStorageSync(SUBJECT_KEY, subject)
  }

  const response = await Taro.request<DevSession>({
    url: `${API_BASE_URL}/auth/dev/session`,
    method: 'POST',
    data: { subject },
    header: { 'content-type': 'application/json' },
  })
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new ApiError(response.statusCode, response.data as ApiErrorBody)
  }
  Taro.setStorageSync(TOKEN_KEY, response.data.accessToken)
  return { accessToken: response.data.accessToken, isNewUser }
}

const requestWechatSession = async (): Promise<ClientSession> => {
  const login = await Taro.login({ timeout: 8_000 })
  if (!login.code) throw new Error('微信登录凭证获取失败，请稍后重试')
  const response = await Taro.request<VerifiedSession>({
    url: `${API_BASE_URL}/auth/wechat/session`,
    method: 'POST',
    data: { code: login.code },
    header: { 'content-type': 'application/json' },
  })
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new ApiError(response.statusCode, response.data as ApiErrorBody)
  }
  Taro.setStorageSync(TOKEN_KEY, response.data.accessToken)
  return response.data
}

const requireOidcSession = async (): Promise<never> => {
  await Taro.reLaunch({ url: '/pages/login/index' })
  throw new AuthenticationRequiredError()
}

const requestAuthSession = () => {
  Taro.removeStorageSync(LEGACY_TOKEN_KEY)
  if (AUTH_MODE === 'wechat') return requestWechatSession()
  if (AUTH_MODE === 'oidc') return requireOidcSession()
  return requestDevSession()
}

const getAccessToken = async () => {
  const stored = Taro.getStorageSync<string>(TOKEN_KEY)
  if (stored) return stored
  return (await requestAuthSession()).accessToken
}

const privateApiUrl = (path: string) => `${API_BASE_URL.replace(/\/v1$/, '')}${path}`

export const getOidcAuthorizationConfig = async (): Promise<OidcAuthorizationConfig> => {
  const response = await Taro.request<unknown>({
    url: `${API_BASE_URL}/auth/oidc/config`,
    method: 'GET',
  })
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new ApiError(response.statusCode, response.data as ApiErrorBody)
  }
  return oidcAuthorizationConfigSchema.parse(response.data)
}

export const exchangeOidcAuthorizationCode = async (
  payload: OidcSessionRequest,
): Promise<VerifiedSession> => {
  const response = await Taro.request<unknown>({
    url: `${API_BASE_URL}/auth/oidc/session`,
    method: 'POST',
    data: payload,
    header: { 'content-type': 'application/json' },
  })
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new ApiError(response.statusCode, response.data as ApiErrorBody)
  }
  const session = verifiedSessionSchema.parse(response.data)
  if (session.provider !== 'oidc') throw new Error('身份服务返回了不匹配的登录方式')
  Taro.setStorageSync(TOKEN_KEY, session.accessToken)
  return session
}

export const hasStoredAuthSession = () => Boolean(Taro.getStorageSync<string>(TOKEN_KEY))
export const isOidcAuthMode = AUTH_MODE === 'oidc'

const authenticatedRequest = async <T>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  data?: unknown,
  headers: Record<string, string> = {},
  retry = true,
): Promise<T> => {
  const token = await getAccessToken()
  const response = await Taro.request<T>({
    url: `${API_BASE_URL}${path}`,
    method,
    data,
    header: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...headers,
    },
  })

  if (response.statusCode === 401 && retry) {
    Taro.removeStorageSync(TOKEN_KEY)
    return authenticatedRequest<T>(path, method, data, headers, false)
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new ApiError(response.statusCode, response.data as ApiErrorBody)
  }
  return response.data
}

export const getOnboarding = async (): Promise<OnboardingResponse | undefined> => {
  if (!Taro.getStorageSync<string>(TOKEN_KEY)) {
    const session = await requestAuthSession()
    if (session.isNewUser) return undefined
  }
  try {
    return await authenticatedRequest<OnboardingResponse>('/me/onboarding', 'GET')
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 404) return undefined
    throw error
  }
}

export const saveOnboarding = (payload: OnboardingRequest) =>
  authenticatedRequest<OnboardingResponse>('/me/onboarding', 'PUT', payload)

export const listHealthRecords = () =>
  authenticatedRequest<{ items: HealthRecord[] }>('/health-records', 'GET')

export const createHealthRecord = (payload: CreateHealthRecord, idempotencyKey: string) =>
  authenticatedRequest<HealthRecord>('/health-records', 'POST', payload, {
    'x-idempotency-key': idempotencyKey,
  })

export const updateHealthRecord = (recordId: string, payload: UpdateHealthRecord) =>
  authenticatedRequest<HealthRecord>(`/health-records/${recordId}`, 'PUT', payload)

export const deleteHealthRecord = (recordId: string, expectedRevision: number) =>
  authenticatedRequest<void>(`/health-records/${recordId}`, 'DELETE', undefined, {
    'x-expected-revision': String(expectedRevision),
  })

export const getHealthRecordHistory = async (recordId: string) =>
  authenticatedRequest<{ recordId: string; items: HealthRecordHistoryItem[] }>(
    `/health-records/${recordId}/history`,
    'GET',
  )

export const listWorkouts = () => authenticatedRequest<{ items: Workout[] }>('/workouts', 'GET')

export const createWorkout = (payload: CreateWorkout, idempotencyKey: string) =>
  authenticatedRequest<Workout>('/workouts', 'POST', payload, {
    'x-idempotency-key': idempotencyKey,
  })

export const updateWorkout = (workoutId: string, payload: UpdateWorkout) =>
  authenticatedRequest<Workout>(`/workouts/${workoutId}`, 'PUT', payload)

export const deleteWorkout = (workoutId: string, expectedRevision: number) =>
  authenticatedRequest<void>(`/workouts/${workoutId}`, 'DELETE', undefined, {
    'x-expected-revision': String(expectedRevision),
  })

export const getWorkoutHistory = (workoutId: string) =>
  authenticatedRequest<{ workoutId: string; items: WorkoutHistoryItem[] }>(
    `/workouts/${workoutId}/history`,
    'GET',
  )

export const listMeals = () => authenticatedRequest<{ items: Meal[] }>('/nutrition/meals', 'GET')

export const createMeal = (payload: CreateMeal, idempotencyKey: string) =>
  authenticatedRequest<Meal>('/nutrition/meals', 'POST', payload, {
    'x-idempotency-key': idempotencyKey,
  })

export const updateMeal = (mealId: string, payload: UpdateMeal) =>
  authenticatedRequest<Meal>(`/nutrition/meals/${mealId}`, 'PUT', payload)

export const deleteMeal = (mealId: string, expectedRevision: number) =>
  authenticatedRequest<void>(`/nutrition/meals/${mealId}`, 'DELETE', undefined, {
    'x-expected-revision': String(expectedRevision),
  })

export const getMealHistory = (mealId: string) =>
  authenticatedRequest<{ mealId: string; items: MealHistoryItem[] }>(
    `/nutrition/meals/${mealId}/history`,
    'GET',
  )

export const listFavoriteFoods = () =>
  authenticatedRequest<{ items: FavoriteFood[] }>('/nutrition/favorites', 'GET')

export const saveFavoriteFood = (payload: FavoriteFoodInput) =>
  authenticatedRequest<FavoriteFood>(
    `/nutrition/favorites/${encodeURIComponent(payload.food.foodKey)}`,
    'PUT',
    payload,
  )

export const deleteFavoriteFood = (foodKey: string) =>
  authenticatedRequest<void>(`/nutrition/favorites/${encodeURIComponent(foodKey)}`, 'DELETE')

export const reserveFoodPhoto = (idempotencyKey: string) =>
  authenticatedRequest<FoodPhotoTicket>(
    '/nutrition/photo-candidates',
    'POST',
    {
      consent: {
        granted: true,
        version: foodPhotoConsentVersion,
      },
    },
    { 'x-idempotency-key': idempotencyKey },
  )

export const uploadFoodPhoto = async (
  uploadPath: string,
  filePath: string,
  retry = true,
): Promise<FoodPhotoAnalysis> => {
  const token = await getAccessToken()
  const response = await Taro.uploadFile({
    url: privateApiUrl(uploadPath),
    filePath,
    name: 'file',
    header: { authorization: `Bearer ${token}` },
  })
  let body: unknown
  try {
    body = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
  } catch {
    body = { message: '图片分析返回了无法读取的内容' }
  }
  if (response.statusCode === 401 && retry) {
    Taro.removeStorageSync(TOKEN_KEY)
    return uploadFoodPhoto(uploadPath, filePath, false)
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new ApiError(response.statusCode, body as ApiErrorBody)
  }
  return body as FoodPhotoAnalysis
}

export const listFoodPhotoCandidates = () =>
  authenticatedRequest<{ items: FoodPhotoAnalysis[] }>('/nutrition/photo-candidates', 'GET')

export const confirmFoodPhotoCandidate = (photoId: string, payload: ConfirmFoodPhotoCandidate) =>
  authenticatedRequest<FoodPhotoConfirmation>(
    `/nutrition/photo-candidates/${photoId}/confirm`,
    'POST',
    payload,
  )

export const deleteFoodPhotoCandidate = (photoId: string) =>
  authenticatedRequest<void>(`/nutrition/photo-candidates/${photoId}`, 'DELETE')

export const getDashboard = (timezone: string) =>
  authenticatedRequest<Dashboard>(
    `/insights/dashboard?timezone=${encodeURIComponent(timezone)}`,
    'GET',
  )

export const listWeeklyPlans = () =>
  authenticatedRequest<{ items: WeeklyPlan[] }>('/plans/weekly', 'GET')

export const generateWeeklyPlan = (payload: GenerateWeeklyPlan, idempotencyKey: string) =>
  authenticatedRequest<WeeklyPlan>('/plans/weekly', 'POST', payload, {
    'x-idempotency-key': idempotencyKey,
  })

export const decideWeeklyPlan = (planId: string, payload: PlanDecision) =>
  authenticatedRequest<WeeklyPlan>(`/plans/weekly/${planId}/decision`, 'PUT', payload)

export const getWeeklyPlanHistory = async (planId: string) =>
  (
    await authenticatedRequest<{ items: WeeklyPlanHistoryItem[] }>(
      `/plans/weekly/${planId}/history`,
      'GET',
    )
  ).items

export const generateAiExplanation = (
  planId: string,
  payload: GenerateAiExplanation,
  idempotencyKey: string,
) =>
  authenticatedRequest<AiExplanation>(`/plans/weekly/${planId}/explanation`, 'POST', payload, {
    'x-idempotency-key': idempotencyKey,
  })

export const getAiExplanationHistory = async (planId: string) =>
  (
    await authenticatedRequest<{ items: AiExplanation[] }>(
      `/plans/weekly/${planId}/explanations`,
      'GET',
    )
  ).items

export const getPrivacyOverview = () => authenticatedRequest<PrivacyOverview>('/me/privacy', 'GET')

export const revokeOptionalConsent = (purpose: RevocableConsentPurpose) =>
  authenticatedRequest<ConsentRevocationResult>(`/me/privacy/consents/${purpose}/revoke`, 'POST', {
    confirmed: true,
  })

export const downloadPrivacyExport = async (
  retry = true,
): Promise<{ fileName: string; filePath: string; byteLength: number | null }> => {
  const token = await getAccessToken()
  const response = await Taro.downloadFile({
    url: `${API_BASE_URL}/me/privacy/export`,
    header: { authorization: `Bearer ${token}` },
    withCredentials: true,
  })
  if (response.statusCode === 401 && retry) {
    Taro.removeStorageSync(TOKEN_KEY)
    return downloadPrivacyExport(false)
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new ApiError(response.statusCode, { message: '数据导出生成失败' })
  }

  const fileName = `myfitness-export-${new Date().toISOString().slice(0, 10)}.json`
  if (process.env.TARO_ENV === 'h5' && typeof document !== 'undefined') {
    const anchor = document.createElement('a')
    anchor.href = response.tempFilePath
    anchor.download = fileName
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    return { fileName, filePath: response.tempFilePath, byteLength: response.dataLength ?? null }
  }

  const saved = await Taro.saveFile({ tempFilePath: response.tempFilePath })
  const filePath = 'savedFilePath' in saved ? saved.savedFilePath : response.tempFilePath
  return { fileName, filePath, byteLength: response.dataLength ?? null }
}

export const getErasureReceiptStatus = async (
  receiptId: string,
  statusToken: string,
): Promise<ErasureReceiptStatus> => {
  const response = await Taro.request<ErasureReceiptStatus>({
    url: `${API_BASE_URL}/privacy/erasure-receipts/${encodeURIComponent(receiptId)}`,
    method: 'GET',
    header: { 'X-Erasure-Receipt-Token': statusToken },
  })
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new ApiError(response.statusCode, response.data as ApiErrorBody)
  }
  const stored = readStoredErasureReceipt()
  if (stored?.statusToken === statusToken) {
    writeStoredErasureReceipt({ ...stored, receiptId })
  }
  return response.data
}

const recoverErasureReceipt = async (statusToken: string): Promise<ErasureReceiptStatus> => {
  const response = await Taro.request<ErasureReceiptStatus>({
    url: `${API_BASE_URL}/privacy/erasure-receipts/recover`,
    method: 'POST',
    header: { 'X-Erasure-Receipt-Token': statusToken },
  })
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new ApiError(response.statusCode, response.data as ApiErrorBody)
  }
  return response.data
}

export const prepareAccountDeletion = async (): Promise<AccountDeletionIntent> => {
  const intent = await authenticatedRequest<AccountDeletionIntent>(
    '/me/privacy/account-deletion-intents',
    'POST',
  )
  writeStoredErasureReceipt({
    intentId: intent.intentId,
    statusToken: intent.intentToken,
    expiresAt: intent.expiresAt,
  })
  return intent
}

export const recoverPendingAccountDeletion = async (): Promise<AccountDeletionResult | null> => {
  const stored = readStoredErasureReceipt()
  if (!stored) return null
  try {
    const status = await recoverErasureReceipt(stored.statusToken)
    const result = { ...status, statusToken: stored.statusToken }
    writeStoredErasureReceipt({ ...stored, receiptId: status.receiptId })
    clearAuthStorage()
    return result
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 401 && !stored.receiptId) {
      if (Date.parse(stored.expiresAt) <= Date.now()) {
        Taro.removeStorageSync(ERASURE_RECEIPT_KEY)
      }
      return null
    }
    throw error
  }
}

export const forgetErasureReceipt = () => Taro.removeStorageSync(ERASURE_RECEIPT_KEY)

export const deletePrivacyAccount = async (
  payload: AccountDeletionRequest,
  intentToken: string,
): Promise<AccountDeletionResult> => {
  let result: AccountDeletionResult
  try {
    result = await authenticatedRequest<AccountDeletionResult>(
      '/me/privacy/account',
      'DELETE',
      payload,
      { 'X-Erasure-Intent-Token': intentToken },
      false,
    )
  } catch (error) {
    try {
      const recovered = await recoverErasureReceipt(intentToken)
      result = { ...recovered, statusToken: intentToken }
    } catch {
      throw error
    }
  }
  const stored = readStoredErasureReceipt()
  writeStoredErasureReceipt({
    intentId: payload.intentId,
    statusToken: intentToken,
    expiresAt: stored?.expiresAt ?? result.requestedAt,
    receiptId: result.receiptId,
  })
  clearAuthStorage()
  return result
}

export const apiBaseUrl = API_BASE_URL
export const privatePhotoUrl = privateApiUrl
