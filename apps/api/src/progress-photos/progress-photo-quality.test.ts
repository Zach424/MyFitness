import { describe, expect, it } from 'vitest'
import sharp from 'sharp'

import { analyzeProgressPhotoQuality } from './progress-photo-quality'

const checkerboard = (width: number, height: number) => {
  const data = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = (Math.floor(x / 40) + Math.floor(y / 40)) % 2 === 0 ? 80 : 190
      const offset = (y * width + x) * 3
      data[offset] = value
      data[offset + 1] = value
      data[offset + 2] = value
    }
  }
  return sharp(data, { raw: { width, height, channels: 3 } })
    .jpeg()
    .toBuffer()
}

describe('progress-photo capture quality', () => {
  it('marks a well-lit portrait checkerboard ready without body inference', async () => {
    const buffer = await checkerboard(800, 1_200)
    const result = await analyzeProgressPhotoQuality({
      storageKey:
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/progress/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg',
      buffer,
      byteSize: buffer.length,
      width: 800,
      height: 1_200,
      sha256: 'a'.repeat(64),
    })
    expect(result.overallStatus).toBe('ready')
    expect(result.checks.map((check) => check.key)).toEqual([
      'orientation',
      'resolution',
      'lighting',
      'contrast',
    ])
    expect(JSON.stringify(result)).not.toMatch(/body.?fat|posture|diagnos/i)
  })

  it('returns bounded adjustment codes for an unsuitable flat landscape', async () => {
    const buffer = await sharp({
      create: { width: 400, height: 240, channels: 3, background: '#050505' },
    })
      .jpeg()
      .toBuffer()
    const result = await analyzeProgressPhotoQuality({
      storageKey:
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/progress/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg',
      buffer,
      byteSize: buffer.length,
      width: 400,
      height: 240,
      sha256: 'b'.repeat(64),
    })
    expect(result.overallStatus).toBe('adjust')
    expect(result.checks.map((check) => check.reason)).toEqual([
      'use_portrait_frame',
      'move_closer_or_use_higher_resolution',
      'image_too_dark',
      'increase_even_lighting',
    ])
  })
})
