import { createHash } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { BadRequestException, Injectable } from '@nestjs/common'
import {
  foodPhotoContentTypes,
  foodPhotoMaxBytes,
  foodPhotoMaxDimension,
  foodPhotoMaxPixels,
} from '@myfitness/contracts'
import sharp, { type Metadata } from 'sharp'

import { getRuntimeConfig } from '../config'

type UploadedPhoto = {
  buffer: Buffer
  mimetype: string
  size: number
}

export type StoredPhoto = {
  storageKey: string
  buffer: Buffer
  byteSize: number
  width: number
  height: number
  sha256: string
}

@Injectable()
export class PhotoStorageService {
  private readonly root = getRuntimeConfig().photoStorageRoot

  private resolveKey(id: string) {
    const key = `${id}.jpg`
    const target = path.resolve(this.root, key)
    if (path.dirname(target) !== this.root || path.basename(target) !== key) {
      throw new BadRequestException('invalid private photo key')
    }
    return { key, target }
  }

  async sanitizeAndStore(id: string, upload: UploadedPhoto): Promise<StoredPhoto> {
    if (
      !foodPhotoContentTypes.includes(upload.mimetype as (typeof foodPhotoContentTypes)[number])
    ) {
      throw new BadRequestException('photo must be JPEG, PNG or WebP')
    }
    if (
      upload.size < 1 ||
      upload.size > foodPhotoMaxBytes ||
      upload.buffer.length !== upload.size
    ) {
      throw new BadRequestException(`photo must be between 1 and ${foodPhotoMaxBytes} bytes`)
    }

    let metadata: Metadata
    try {
      metadata = await sharp(upload.buffer, { limitInputPixels: foodPhotoMaxPixels }).metadata()
    } catch {
      throw new BadRequestException('photo could not be decoded safely')
    }
    const formatToMime = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const
    const detected = metadata.format && formatToMime[metadata.format as keyof typeof formatToMime]
    if (!detected || detected !== upload.mimetype || (metadata.pages ?? 1) !== 1) {
      throw new BadRequestException('photo bytes do not match a supported still-image type')
    }
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > foodPhotoMaxPixels
    ) {
      throw new BadRequestException('photo dimensions are invalid or too large')
    }

    const output = await sharp(upload.buffer, { limitInputPixels: foodPhotoMaxPixels })
      .rotate()
      .resize({
        width: foodPhotoMaxDimension,
        height: foodPhotoMaxDimension,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer({ resolveWithObject: true })
      .catch(() => {
        throw new BadRequestException('photo could not be decoded and sanitized safely')
      })
    if (!output.info.width || !output.info.height || output.data.length > foodPhotoMaxBytes) {
      throw new BadRequestException('sanitized photo is still too large')
    }

    const { key, target } = this.resolveKey(id)
    await mkdir(this.root, { recursive: true })
    await writeFile(target, output.data, { flag: 'wx', mode: 0o600 })
    return {
      storageKey: key,
      buffer: output.data,
      byteSize: output.data.length,
      width: output.info.width,
      height: output.info.height,
      sha256: createHash('sha256').update(output.data).digest('hex'),
    }
  }

  async read(id: string) {
    return readFile(this.resolveKey(id).target)
  }

  async remove(id: string) {
    try {
      await unlink(this.resolveKey(id).target)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
}
