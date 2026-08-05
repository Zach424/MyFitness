import type {
  CreateExerciseCatalogEntry,
  ExerciseCatalogItem,
  ExerciseEquipment,
  ExerciseTrackingMode,
} from '@myfitness/contracts'

export type ExerciseCatalogDraft = {
  name: string
  aliases: string
  category: CreateExerciseCatalogEntry['category']
  trackingMode: ExerciseTrackingMode
  equipment: ExerciseEquipment[]
  equipmentNotes: string
}

export const initialExerciseCatalogDraft = (): ExerciseCatalogDraft => ({
  name: '',
  aliases: '',
  category: 'strength',
  trackingMode: 'reps_load',
  equipment: ['bodyweight'],
  equipmentNotes: '',
})

export const exerciseCatalogDraftFromItem = (item: ExerciseCatalogItem): ExerciseCatalogDraft => ({
  name: item.name,
  aliases: item.aliases.join('，'),
  category: item.category,
  trackingMode: item.trackingMode,
  equipment: [...item.equipment],
  equipmentNotes: item.equipmentNotes ?? '',
})

export const validateExerciseCatalogDraft = (draft: ExerciseCatalogDraft) => {
  if (!draft.name.trim()) return '请填写动作名称'
  if (!draft.equipment.length) return '请至少明确一种器械；徒手请选择“自重”'
  if (draft.equipment.includes('other') && !draft.equipmentNotes.trim()) {
    return '选择“其他器械”时请写明具体器械'
  }
  const aliases = draft.aliases
    .split(/[，,]/)
    .map((value) => value.trim())
    .filter(Boolean)
  const labels = [draft.name.trim(), ...aliases].map((value) => value.toLocaleLowerCase())
  if (new Set(labels).size !== labels.length) return '动作名称和别名不能重复'
  return ''
}

export const buildExerciseCatalogRequest = (
  draft: ExerciseCatalogDraft,
): CreateExerciseCatalogEntry => {
  const error = validateExerciseCatalogDraft(draft)
  if (error) throw new Error(error)
  const aliases = draft.aliases
    .split(/[，,]/)
    .map((value) => value.trim())
    .filter(Boolean)
  return {
    name: draft.name.trim(),
    ...(aliases.length ? { aliases } : {}),
    category: draft.category,
    trackingMode: draft.trackingMode,
    equipment: draft.equipment,
    ...(draft.equipmentNotes.trim() ? { equipmentNotes: draft.equipmentNotes.trim() } : {}),
  }
}
