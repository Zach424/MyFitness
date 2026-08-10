import { HttpException, HttpStatus } from '@nestjs/common'
import {
  maximumPrivacyExportBytes,
  privacyExportTooLargeCode,
  type PrivacyExport,
} from '@myfitness/contracts'

export const serializePortableExport = (
  payload: PrivacyExport,
  maximumBytes = maximumPrivacyExportBytes,
) => {
  const serialized = `${JSON.stringify(payload, null, 2)}\n`
  const byteLength = Buffer.byteLength(serialized, 'utf8')
  if (byteLength > maximumBytes) {
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
  return Buffer.from(serialized, 'utf8')
}
