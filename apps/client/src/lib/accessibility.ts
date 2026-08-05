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

export const focusElementById = (id: string, root?: FocusRoot) => {
  const target = root?.getElementById(id)
  if (!target) return false
  target.focus()
  return true
}

export const deferH5Focus = (id: string, delayMs = 0) => {
  if (process.env.TARO_ENV !== 'h5' || typeof document === 'undefined') return false
  globalThis.setTimeout(() => focusElementById(id, document), Math.max(0, delayMs))
  return true
}

type KeyboardActivationEvent = {
  key: string
  repeat: boolean
  preventDefault: () => void
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
