import { createHash } from 'node:crypto'

import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import {
  foodPhotoContentTypes,
  foodPhotoMaxBytes,
  foodPhotoMaxDimension,
  foodPhotoMaxPixels,
} from '@myfitness/contracts'
import sharp, { type Metadata } from 'sharp'

import { getRuntimeConfig } from '../config'
import {
  ObjectAlreadyExistsError,
  ObjectStorageService,
} from '../operations/object-storage.service'

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
  private readonly prefix = getRuntimeConfig().photoObjectPrefix
  private readonly uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

  constructor(private readonly objects: ObjectStorageService) {}

  private validateStorageKey(key: string) {
    const validLegacy = /^[0-9a-f-]{36}\.jpg$/.test(key)
    const validScoped = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(key)
    if (!validLegacy && !validScoped) {
      throw new BadRequestException('invalid private photo key')
    }
    return key
  }

  private validateUserId(userId: string) {
    if (!this.uuidPattern.test(userId)) throw new BadRequestException('invalid private photo owner')
    return userId
  }

  private objectKey(storageKey: string) {
    return `${this.prefix}/${this.validateStorageKey(storageKey)}`
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
    this.validateUserId(userId)
    const key = `${userId}/${id}.jpg`
    const sha256 = createHash('sha256').update(output.data).digest('hex')
    try {
      await this.objects.putPrivateObject({
        key: this.objectKey(key),
        body: output.data,
        contentType: 'image/jpeg',
        sha256Base64: Buffer.from(sha256, 'hex').toString('base64'),
        metadata: { mediaSha256: sha256 },
        ifAbsent: true,
      })
    } catch (error) {
      if (error instanceof ObjectAlreadyExistsError) {
        throw new ConflictException('photo upload was already stored')
      }
      throw error
    }
    return {
      storageKey: key,
      buffer: output.data,
      byteSize: output.data.length,
      width: output.info.width,
      height: output.info.height,
      sha256,
    }
  }

  async read(storageKey: string) {
    return this.objects.getPrivateObject(this.objectKey(storageKey))
  }

  async remove(storageKey: string) {
    await this.objects.deletePrivateObject(this.objectKey(storageKey))
  }

  async removeUserDirectory(userId: string) {
    return this.objects.deletePrivatePrefix(`${this.prefix}/${this.validateUserId(userId)}`)
  }

  async exists(storageKey: string) {
    return this.objects.hasPrivateObject(this.objectKey(storageKey))
  }
}
