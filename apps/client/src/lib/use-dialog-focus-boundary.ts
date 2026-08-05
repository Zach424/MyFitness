import { useRef } from 'react'

import { deferH5Focus, deferH5FocusWithFallback } from './accessibility'

export const useDialogFocusBoundary = (initialFocusId: string, fallbackFocusId: string) => {
  const triggerId = useRef('')

  const enter = (nextTriggerId: string) => {
    triggerId.current = nextTriggerId
    deferH5Focus(initialFocusId, 40)
  }

  const restore = () => {
    const primaryId = triggerId.current
    triggerId.current = ''
    deferH5FocusWithFallback(primaryId, fallbackFocusId, 40)
  }

  const complete = () => {
    triggerId.current = ''
    deferH5Focus(fallbackFocusId, 40)
  }

  const reset = () => {
    triggerId.current = ''
  }

  return { enter, restore, complete, reset }
}
