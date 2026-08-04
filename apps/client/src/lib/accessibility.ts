// Taro renders these attributes on H5, while its cross-platform ButtonProps
// does not currently declare the standard HTML role attribute.
export const buttonA11yProps = { role: 'button', tabIndex: 0 } as const

export const checkboxA11yProps = { role: 'checkbox', tabIndex: 0 } as const

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
