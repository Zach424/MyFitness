import { useEffect, useRef } from 'react'

import {
  deferH5Focus,
  deferH5FocusWithFallback,
  type DeferredH5FocusRequest,
} from './accessibility'

export const useDialogFocusBoundary = (initialFocusId: string, fallbackFocusId: string) => {
  const triggerId = useRef('')
  const focusGeneration = useRef(0)
  const focusRequest = useRef<DeferredH5FocusRequest>()

  const invalidateFocus = () => {
    focusGeneration.current += 1
    focusRequest.current?.cancel()
    focusRequest.current = undefined
  }

  const scheduleFocus = (primaryId: string, fallbackId = '') => {
    invalidateFocus()
    const generation = focusGeneration.current
    const options = { canFocus: () => focusGeneration.current === generation }
    const request = fallbackId
      ? deferH5FocusWithFallback(primaryId, fallbackId, 40, options)
      : deferH5Focus(primaryId, 40, options)
    focusRequest.current = request || undefined
  }

  useEffect(
    () => () => {
      invalidateFocus()
    },
    [],
  )

  const enter = (nextTriggerId: string) => {
    triggerId.current = nextTriggerId
    scheduleFocus(initialFocusId)
  }

  const restore = () => {
    const primaryId = triggerId.current
    triggerId.current = ''
    scheduleFocus(primaryId, fallbackFocusId)
  }

  const complete = () => {
    triggerId.current = ''
    scheduleFocus(fallbackFocusId)
  }

  const reset = () => {
    triggerId.current = ''
    invalidateFocus()
  }

  return { enter, restore, complete, reset }
}
