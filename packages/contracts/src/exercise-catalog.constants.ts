import { muscleModelVersion } from './muscle-model.constants'

export const exerciseCatalogVersion = 'starter-2026-08-12-v2' as const

export const exerciseCatalogSources = ['starter', 'custom'] as const
export const exerciseCatalogRevisionActions = ['created', 'updated', 'archived'] as const
export const exerciseMuscleMappingSources = ['starter_catalog', 'user_confirmed'] as const
export const exerciseTrackingModes = ['reps_load', 'duration', 'duration_distance'] as const
export const exerciseEquipmentOptions = [
  'bodyweight',
  'dumbbells',
  'barbell',
  'kettlebell',
  'resistance_band',
  'bench',
  'pull_up_bar',
  'cable_machine',
  'cardio_machine',
  'bicycle',
  'open_space',
  'other',
] as const

export const starterExerciseCatalog = [
  {
    key: 'goblet_squat',
    name: '高脚杯深蹲',
    aliases: ['杯式深蹲'],
    category: 'strength',
    trackingMode: 'reps_load',
    equipment: ['dumbbells'],
    muscleMapping: {
      status: 'mapped',
      modelVersion: muscleModelVersion,
      source: 'starter_catalog',
      primaryMuscles: ['gluteus_maximus', 'quadriceps'],
      secondaryMuscles: ['hamstrings', 'adductors'],
    },
  },
  {
    key: 'romanian_deadlift',
    name: '罗马尼亚硬拉',
    aliases: ['RDL'],
    category: 'strength',
    trackingMode: 'reps_load',
    equipment: ['dumbbells'],
    muscleMapping: {
      status: 'mapped',
      modelVersion: muscleModelVersion,
      source: 'starter_catalog',
      primaryMuscles: ['gluteus_maximus', 'hamstrings'],
      secondaryMuscles: ['erector_spinae', 'adductors'],
    },
  },
  {
    key: 'push_up',
    name: '俯卧撑',
    aliases: ['伏地挺身'],
    category: 'strength',
    trackingMode: 'reps_load',
    equipment: ['bodyweight'],
    muscleMapping: {
      status: 'mapped',
      modelVersion: muscleModelVersion,
      source: 'starter_catalog',
      primaryMuscles: ['chest_middle', 'triceps_brachii'],
      secondaryMuscles: ['chest_upper', 'deltoid_anterior'],
    },
  },
  {
    key: 'dumbbell_row',
    name: '哑铃划船',
    aliases: ['单臂划船'],
    category: 'strength',
    trackingMode: 'reps_load',
    equipment: ['dumbbells'],
    muscleMapping: {
      status: 'mapped',
      modelVersion: muscleModelVersion,
      source: 'starter_catalog',
      primaryMuscles: ['latissimus_dorsi', 'rhomboids'],
      secondaryMuscles: ['teres_major', 'deltoid_posterior', 'biceps_brachii'],
    },
  },
  {
    key: 'overhead_press',
    name: '肩上推举',
    aliases: ['推肩'],
    category: 'strength',
    trackingMode: 'reps_load',
    equipment: ['dumbbells'],
    muscleMapping: {
      status: 'mapped',
      modelVersion: muscleModelVersion,
      source: 'starter_catalog',
      primaryMuscles: ['deltoid_anterior', 'deltoid_lateral'],
      secondaryMuscles: ['triceps_brachii', 'trapezius'],
    },
  },
  {
    key: 'plank',
    name: '平板支撑',
    aliases: ['平板'],
    category: 'strength',
    trackingMode: 'duration',
    equipment: ['bodyweight'],
    muscleMapping: {
      status: 'mapped',
      modelVersion: muscleModelVersion,
      source: 'starter_catalog',
      primaryMuscles: ['rectus_abdominis'],
      secondaryMuscles: ['obliques'],
    },
  },
  {
    key: 'running',
    name: '跑步',
    aliases: ['慢跑'],
    category: 'cardio',
    trackingMode: 'duration_distance',
    equipment: ['open_space'],
    muscleMapping: {
      status: 'mapped',
      modelVersion: muscleModelVersion,
      source: 'starter_catalog',
      primaryMuscles: ['gluteus_maximus', 'quadriceps', 'hamstrings'],
      secondaryMuscles: ['gastrocnemius', 'soleus'],
    },
  },
  {
    key: 'cycling',
    name: '骑行',
    aliases: ['自行车'],
    category: 'cardio',
    trackingMode: 'duration_distance',
    equipment: ['bicycle'],
    muscleMapping: {
      status: 'mapped',
      modelVersion: muscleModelVersion,
      source: 'starter_catalog',
      primaryMuscles: ['gluteus_maximus', 'quadriceps'],
      secondaryMuscles: ['hamstrings', 'gastrocnemius'],
    },
  },
  {
    key: 'mobility_flow',
    name: '灵活性练习',
    aliases: ['关节活动'],
    category: 'mobility',
    trackingMode: 'duration',
    equipment: ['bodyweight'],
    muscleMapping: {
      status: 'unmapped',
      modelVersion: null,
      source: null,
      primaryMuscles: [],
      secondaryMuscles: [],
    },
  },
] as const

// Backward-compatible name for clients compiled before the catalog became an API resource.
export const exerciseCatalog = starterExerciseCatalog
