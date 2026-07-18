import type {
  AiExplanation,
  CreateHealthRecord,
  CreateMeal,
  CreateWorkout,
  Dashboard,
  DevSession,
  FavoriteFood,
  FavoriteFoodInput,
  GenerateWeeklyPlan,
  GenerateAiExplanation,
  HealthRecord,
  HealthRecordHistoryItem,
  Meal,
  MealHistoryItem,
  OnboardingRequest,
  OnboardingResponse,
  PlanDecision,
  UpdateHealthRecord,
  UpdateMeal,
  UpdateWorkout,
  WeeklyPlan,
  WeeklyPlanHistoryItem,
  Workout,
  WorkoutHistoryItem,
} from '@myfitness/contracts'
import Taro from '@tarojs/taro'

const API_BASE_URL = __API_BASE_URL__.replace(/\/$/, '')
const TOKEN_KEY = 'myfitness.dev.accessToken'
const SUBJECT_KEY = 'myfitness.dev.subject'

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

const createSubject = () => {
  const randomPart =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `local:${randomPart}`
}

const requestDevSession = async (): Promise<DevSession> => {
  let subject = Taro.getStorageSync<string>(SUBJECT_KEY)
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
  return response.data
}

const getAccessToken = async () => {
  const stored = Taro.getStorageSync<string>(TOKEN_KEY)
  if (stored) return stored
  return (await requestDevSession()).accessToken
}

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
  const isFirstLocalSession = !Taro.getStorageSync<string>(SUBJECT_KEY)
  if (isFirstLocalSession) {
    await requestDevSession()
    return undefined
  }
  return authenticatedRequest<OnboardingResponse>('/me/onboarding', 'GET')
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

export const apiBaseUrl = API_BASE_URL
