import { HttpException, HttpStatus } from '@nestjs/common'
import {
  maximumPrivacyExportBytes,
  privacyExportTooLargeCode,
  type PrivacyExport,
} from '@myfitness/contracts'

const portableExportJson = (payload: PrivacyExport) => `${JSON.stringify(payload, null, 2)}\n`

const assertPortableExportByteLength = (byteLength: number, maximumBytes: number) => {
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
) => assertPortableExportByteLength(portableExportByteLength(payload), maximumBytes)

export const serializePortableExport = (
  payload: PrivacyExport,
  maximumBytes = maximumPrivacyExportBytes,
) => {
  const serialized = portableExportJson(payload)
  const byteLength = Buffer.byteLength(serialized, 'utf8')
  assertPortableExportByteLength(byteLength, maximumBytes)
  return Buffer.from(serialized, 'utf8')
}
