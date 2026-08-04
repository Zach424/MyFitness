import type { ProgressPhotoItem, ProgressPhotoQuality } from '@myfitness/contracts'

export const progressViewCopy = {
  front: { label: '正面', cue: '镜头与胸口同高，双脚落在定位线内' },
  side: { label: '侧面', cue: '自然站立，不刻意收腹或调整姿势' },
  back: { label: '背面', cue: '保持相同距离，让肩部完整进入画面' },
} as const

type QualityReason = ProgressPhotoQuality['checks'][number]['reason']

export const qualityReasonCopy: Record<QualityReason, string> = {
  portrait_ready: '竖向画幅合适',
  use_portrait_frame: '请改用竖向画幅',
  resolution_ready: '清晰度足够用于对位',
  move_closer_or_use_higher_resolution: '请靠近一些或使用更高清照片',
  lighting_ready: '整体亮度适合观察轮廓',
  image_too_dark: '画面偏暗，请增加均匀照明',
  image_too_bright: '画面偏亮，请避开强烈直射光',
  contrast_ready: '轮廓与背景可区分',
  increase_even_lighting: '轮廓不清，请换纯净背景并均匀补光',
}

export const retainedPhotosForView = (
  photos: ProgressPhotoItem[],
  view: ProgressPhotoItem['view'],
) => photos.filter((photo) => photo.retentionMode === 'retained' && photo.view === view)

export const defaultComparisonPair = (photos: ProgressPhotoItem[]) =>
  photos.length >= 2 ? { current: photos[0]!, baseline: photos[1]! } : null

export const selectedComparisonPair = (
  photos: ProgressPhotoItem[],
  baselineId: string,
  currentId: string,
) => {
  const baseline = photos.find((photo) => photo.id === baselineId)
  const current = photos.find((photo) => photo.id === currentId)
  if (!baseline || !current || baseline.id === current.id) return defaultComparisonPair(photos)
  return { baseline, current }
}
