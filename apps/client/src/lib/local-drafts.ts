import Taro from '@tarojs/taro'

import { createDraftVault, type LocalDraftKind } from './draft-vault'
import { authUserIdStorageKey, devSubjectStorageKey } from './local-storage-keys'

const storage = {
  getItem: (key: string) => {
    const value = Taro.getStorageSync<unknown>(key)
    return typeof value === 'string' && value ? value : null
  },
  setItem: (key: string, value: string) => Taro.setStorageSync(key, value),
  removeItem: (key: string) => Taro.removeStorageSync(key),
}

const ownerScope = () => {
  const userId = Taro.getStorageSync<unknown>(authUserIdStorageKey)
  if (typeof userId === 'string' && userId) return `user:${userId}`
  const subject = Taro.getStorageSync<unknown>(devSubjectStorageKey)
  return typeof subject === 'string' && subject ? `dev:${subject}` : null
}

export const localDraftVault = createDraftVault({ storage, ownerScope })
export const clearAllLocalDrafts = () => localDraftVault.clearAll()
export const clearLocalDraft = (kind: LocalDraftKind) => localDraftVault.clear(kind)
