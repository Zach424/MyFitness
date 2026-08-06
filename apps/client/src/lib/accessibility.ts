// Taro renders these attributes on H5, while its cross-platform ButtonProps
// does not currently declare the standard HTML role attribute.
export const buttonA11yProps = { role: 'button', tabIndex: 0 } as const

export const checkboxA11yProps = { role: 'checkbox', tabIndex: 0 } as const

type FocusableElement = {
  focus: () => void
}

type FocusRoot = {
  getElementById: (id: string) => FocusableElement | null
}

type FocusDocument = FocusRoot & {
  activeElement?: unknown
  body?: unknown
  documentElement?: unknown
}

export type DeferredH5FocusOptions = {
  canFocus?: () => boolean
  maxAttempts?: number
  retryDelayMs?: number
}

export type DeferredH5FocusRequest = {
  cancel: () => void
}

export const focusElementById = (id: string, root?: FocusRoot) => {
  const target = root?.getElementById(id)
  if (!target) return false
  target.focus()
  return true
}

export const focusElementByIdWithFallback = (
  primaryId: string,
  fallbackId: string,
  root?: FocusRoot,
) =>
  (primaryId ? focusElementById(primaryId, root) : false) ||
  (fallbackId ? focusElementById(fallbackId, root) : false)

const deferFocus = (
  findTarget: (root: FocusDocument) => FocusableElement | null,
  delayMs: number,
  options: DeferredH5FocusOptions,
): DeferredH5FocusRequest | false => {
  if (process.env.TARO_ENV !== 'h5' || typeof document === 'undefined') return false
  const root: FocusDocument = document
  const initialActiveElement = root.activeElement
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 4))
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 80)
  let attemptCount = 0
  let cancelled = false
  let lastFocusedTarget: FocusableElement | undefined
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined

  const focusWasMoved = () => {
    const activeElement = root.activeElement
    return (
      activeElement != null &&
      activeElement !== initialActiveElement &&
      activeElement !== root.body &&
      activeElement !== root.documentElement &&
      activeElement !== lastFocusedTarget
    )
  }

  const attempt = () => {
    if (cancelled || options.canFocus?.() === false || focusWasMoved()) return
    attemptCount += 1
    const target = findTarget(root)
    if (target && target === lastFocusedTarget && root.activeElement === target) return
    if (target) {
      target.focus()
      if (root.activeElement === target) lastFocusedTarget = target
    }
    if (attemptCount < maxAttempts) timer = globalThis.setTimeout(attempt, retryDelayMs)
  }

  timer = globalThis.setTimeout(attempt, Math.max(0, delayMs))
  return {
    cancel: () => {
      cancelled = true
      if (timer !== undefined) globalThis.clearTimeout(timer)
    },
  }
}

export const deferH5Focus = (id: string, delayMs = 0, options: DeferredH5FocusOptions = {}) => {
  return deferFocus((root) => root.getElementById(id), delayMs, options)
}

export const deferH5FocusWithFallback = (
  primaryId: string,
  fallbackId: string,
  delayMs = 0,
  options: DeferredH5FocusOptions = {},
) =>
  deferFocus(
    (root) =>
      (primaryId ? root.getElementById(primaryId) : null) ??
      (fallbackId ? root.getElementById(fallbackId) : null),
    delayMs,
    options,
  )

type KeyboardActivationEvent = {
  key: string
  repeat: boolean
  preventDefault: () => void
}

type EscapeDismissEvent = KeyboardActivationEvent & {
  stopPropagation?: () => void
}

export const keyboardActivationProps = (activate: () => void, disabled = false) => ({
  onKeyDown: (event: KeyboardActivationEvent) => {
    if (disabled || event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    activate()
  },
})

export const buttonActivationProps = (activate: () => void, disabled = false) => ({
  ...buttonA11yProps,
  'aria-disabled': disabled,
  ...keyboardActivationProps(activate, disabled),
  onClick: () => {
    if (!disabled) activate()
  },
})

export const escapeDismissProps = (dismiss: () => void, disabled = false) => ({
  onKeyDown: (event: EscapeDismissEvent) => {
    if (disabled || event.repeat || event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation?.()
    dismiss()
  },
})
