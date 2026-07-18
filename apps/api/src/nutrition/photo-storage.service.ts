import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises'
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
  private readonly uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

  private resolveKey(key: string) {
    const validLegacy = /^[0-9a-f-]{36}\.jpg$/.test(key)
    const validScoped = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(key)
    const segments = key.split('/')
    const target = path.resolve(this.root, ...segments)
    const relative = path.relative(this.root, target)
    if (
      (!validLegacy && !validScoped) ||
      relative.startsWith('..') ||
      path.isAbsolute(relative) ||
      relative.split(path.sep).join('/') !== key
    ) {
      throw new BadRequestException('invalid private photo key')
    }
    return target
  }

  private userDirectory(userId: string) {
    if (!this.uuidPattern.test(userId)) throw new BadRequestException('invalid private photo owner')
    const target = path.resolve(this.root, userId)
    if (path.dirname(target) !== this.root) {
      throw new BadRequestException('invalid private photo owner')
    }
    return target
  }

  async sanitizeAndStore(userId: string, id: string, upload: UploadedPhoto): Promise<StoredPhoto> {
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

    if (!this.uuidPattern.test(id)) throw new BadRequestException('invalid private photo id')
    const key = `${userId}/${id}.jpg`
    const target = this.resolveKey(key)
    await mkdir(path.dirname(target), { recursive: true })
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

  async read(storageKey: string) {
    return readFile(this.resolveKey(storageKey))
  }

  async remove(storageKey: string) {
    try {
      await unlink(this.resolveKey(storageKey))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  async removeUserDirectory(userId: string) {
    await rm(this.userDirectory(userId), { recursive: true, force: true })
  }
}
