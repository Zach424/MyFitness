import Taro from '@tarojs/taro'

import { ApiError, clearClientAccessToken, getClientAccessToken, getClientApiBaseUrl } from './api'
import {
  PrivacyExportVerificationError,
  privacyExportContentTypeFromHeaders,
  verifyPrivacyExportArtifact,
} from './privacy-export-verification'

export type PrivacyExportDownloadResult = {
  fileName: string
  filePath: string
  byteLength: number
  schemaVersion: string
  generatedAt: string
}

export const downloadPrivacyExport = async (retry = true): Promise<PrivacyExportDownloadResult> => {
  const token = await getClientAccessToken()
  const response = await Taro.downloadFile({
    url: `${getClientApiBaseUrl()}/me/privacy/export`,
    header: { authorization: `Bearer ${token}` },
    withCredentials: true,
  })
  const releaseH5TemporaryFile = () => {
    if (
      process.env.TARO_ENV === 'h5' &&
      typeof window !== 'undefined' &&
      response.tempFilePath.startsWith('blob:')
    ) {
      window.URL.revokeObjectURL(response.tempFilePath)
    }
  }
  if (response.statusCode === 401 && retry) {
    releaseH5TemporaryFile()
    clearClientAccessToken()
    return downloadPrivacyExport(false)
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    releaseH5TemporaryFile()
    throw new ApiError(response.statusCode, { message: '数据导出生成失败' })
  }

  const fileName = `myfitness-export-${new Date().toISOString().slice(0, 10)}.json`
  let artifactText: string
  let contentType: string | undefined
  try {
    if (process.env.TARO_ENV === 'h5') {
      const localResponse = await fetch(response.tempFilePath, { cache: 'no-store' })
      const blob = await localResponse.blob()
      artifactText = await blob.text()
      contentType = blob.type || localResponse.headers.get('content-type') || undefined
    } else {
      artifactText = await new Promise<string>((resolve, reject) => {
        Taro.getFileSystemManager().readFile({
          filePath: response.tempFilePath,
          encoding: 'utf8',
          success: ({ data }) => (typeof data === 'string' ? resolve(data) : reject()),
          fail: () => reject(),
        })
      })
      contentType = privacyExportContentTypeFromHeaders(response.header)
    }
  } catch (error) {
    releaseH5TemporaryFile()
    if (error instanceof PrivacyExportVerificationError) throw error
    throw new PrivacyExportVerificationError('unreadable')
  }

  let verification
  try {
    verification = verifyPrivacyExportArtifact(artifactText, contentType)
  } catch (error) {
    releaseH5TemporaryFile()
    throw error
  }

  if (process.env.TARO_ENV === 'h5' && typeof document !== 'undefined') {
    const anchor = document.createElement('a')
    anchor.href = response.tempFilePath
    anchor.download = fileName
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(releaseH5TemporaryFile, 0)
    return { fileName, filePath: response.tempFilePath, ...verification }
  }

  const saved = await Taro.saveFile({ tempFilePath: response.tempFilePath })
  const filePath = 'savedFilePath' in saved ? saved.savedFilePath : response.tempFilePath
  return { fileName, filePath, ...verification }
}
