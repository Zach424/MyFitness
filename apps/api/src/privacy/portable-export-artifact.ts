import { HttpException, HttpStatus } from '@nestjs/common'
import {
  maximumPrivacyExportBytes,
  privacyExportTooLargeCode,
  type PrivacyExport,
} from '@myfitness/contracts'

const portableExportJson = (payload: PrivacyExport) => `${JSON.stringify(payload, null, 2)}\n`

export const assertPortableExportByteLengthWithinLimit = (
  byteLength: number,
  maximumBytes = maximumPrivacyExportBytes,
) => {
  if (byteLength <= maximumBytes) return byteLength

  throw new HttpException(
    {
      statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
      code: privacyExportTooLargeCode,
      message: '同步数据副本超过当前 50 MiB 上限，未生成下载附件。',
      maximumBytes,
    },
    HttpStatus.PAYLOAD_TOO_LARGE,
  )
}

export const portableExportByteLength = (payload: PrivacyExport) =>
  Buffer.byteLength(portableExportJson(payload), 'utf8')

export const assertPortableExportWithinLimit = (
  payload: PrivacyExport,
  maximumBytes = maximumPrivacyExportBytes,
) => assertPortableExportByteLengthWithinLimit(portableExportByteLength(payload), maximumBytes)

const portableExportMediaWrapperByteLength = (media: Record<string, unknown> | null) =>
  Buffer.byteLength(JSON.stringify({ data: { photos: [{ media }] } }, null, 2), 'utf8')

const nullMediaWrapperByteLength = portableExportMediaWrapperByteLength(null)
const emptyBase64MediaByteDelta =
  portableExportMediaWrapperByteLength({
    contentType: 'image/jpeg',
    encoding: 'base64',
    data: '',
  }) - nullMediaWrapperByteLength

export const portableExportUnavailableMediaByteDelta =
  portableExportMediaWrapperByteLength({ unavailable: true }) - nullMediaWrapperByteLength

export const portableExportBase64MediaByteDelta = (sourceByteLength: number) => {
  if (!Number.isSafeInteger(sourceByteLength) || sourceByteLength < 0) {
    throw new RangeError('portable export media byte length must be a non-negative safe integer')
  }
  return emptyBase64MediaByteDelta + 4 * Math.ceil(sourceByteLength / 3)
}

export const serializePortableExport = (
  payload: PrivacyExport,
  maximumBytes = maximumPrivacyExportBytes,
) => {
  const serialized = portableExportJson(payload)
  const byteLength = Buffer.byteLength(serialized, 'utf8')
  assertPortableExportByteLengthWithinLimit(byteLength, maximumBytes)
  return Buffer.from(serialized, 'utf8')
}
