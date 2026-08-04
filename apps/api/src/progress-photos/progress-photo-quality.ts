import {
  progressPhotoQualityMethodVersion,
  progressPhotoQualitySchema,
  type ProgressPhotoQuality,
} from '@myfitness/contracts'
import sharp from 'sharp'

import type { StoredPhoto } from '../nutrition/photo-storage.service'

const percent = (value: number, maximum: number) =>
  Math.max(0, Math.min(100, Math.round((value / maximum) * 100)))

export const analyzeProgressPhotoQuality = async (
  photo: StoredPhoto,
): Promise<ProgressPhotoQuality> => {
  const stats = await sharp(photo.buffer).stats()
  const [red, green, blue] = stats.channels
  const brightness =
    red && green && blue
      ? red.mean * 0.2126 + green.mean * 0.7152 + blue.mean * 0.0722
      : stats.channels.reduce((sum, channel) => sum + channel.mean, 0) / stats.channels.length
  const contrast =
    stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.stdev, 0) /
    Math.min(3, stats.channels.length)

  const orientationReady = photo.height >= photo.width * 1.2
  const resolutionReady = photo.width >= 720 && photo.height >= 960
  const lightingReady = brightness >= 51 && brightness <= 217
  const contrastReady = contrast >= 12
  const checks = [
    {
      key: 'orientation' as const,
      status: orientationReady ? ('ready' as const) : ('adjust' as const),
      reason: orientationReady ? ('portrait_ready' as const) : ('use_portrait_frame' as const),
    },
    {
      key: 'resolution' as const,
      status: resolutionReady ? ('ready' as const) : ('adjust' as const),
      reason: resolutionReady
        ? ('resolution_ready' as const)
        : ('move_closer_or_use_higher_resolution' as const),
    },
    {
      key: 'lighting' as const,
      status: lightingReady ? ('ready' as const) : ('adjust' as const),
      reason: lightingReady
        ? ('lighting_ready' as const)
        : brightness < 51
          ? ('image_too_dark' as const)
          : ('image_too_bright' as const),
    },
    {
      key: 'contrast' as const,
      status: contrastReady ? ('ready' as const) : ('adjust' as const),
      reason: contrastReady ? ('contrast_ready' as const) : ('increase_even_lighting' as const),
    },
  ] as const

  return progressPhotoQualitySchema.parse({
    methodVersion: progressPhotoQualityMethodVersion,
    machineEstimate: true,
    overallStatus: checks.every((check) => check.status === 'ready') ? 'ready' : 'adjust',
    metrics: {
      width: photo.width,
      height: photo.height,
      brightnessPercent: percent(brightness, 255),
      contrastPercent: percent(contrast, 128),
    },
    checks,
  })
}
