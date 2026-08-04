import { describe, expect, it, vi } from 'vitest'

import { keyboardActivationProps } from './accessibility'

const keyboardEvent = (key: string, repeat = false) => ({
  key,
  repeat,
  preventDefault: vi.fn(),
})

describe('keyboard activation accessibility', () => {
  it.each(['Enter', ' '])('activates once for %s and prevents page movement', (key) => {
    const activate = vi.fn()
    const event = keyboardEvent(key)

    keyboardActivationProps(activate).onKeyDown(event)

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(activate).toHaveBeenCalledOnce()
  })

  it.each([
    { key: 'Escape', repeat: false, disabled: false },
    { key: ' ', repeat: true, disabled: false },
    { key: 'Enter', repeat: false, disabled: true },
  ])('does not activate for an ineligible event %#', ({ key, repeat, disabled }) => {
    const activate = vi.fn()
    const event = keyboardEvent(key, repeat)

    keyboardActivationProps(activate, disabled).onKeyDown(event)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(activate).not.toHaveBeenCalled()
  })
})
