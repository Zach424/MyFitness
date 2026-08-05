import { describe, expect, it, vi } from 'vitest'

import { buttonActivationProps, focusElementById, keyboardActivationProps } from './accessibility'

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

describe('focus restoration accessibility', () => {
  it('focuses the requested element through an injectable document boundary', () => {
    const focus = vi.fn()
    const root = { getElementById: vi.fn(() => ({ focus })) }

    expect(focusElementById('return-target', root)).toBe(true)
    expect(root.getElementById).toHaveBeenCalledWith('return-target')
    expect(focus).toHaveBeenCalledOnce()
  })

  it('reports a missing focus target without throwing', () => {
    expect(focusElementById('missing', { getElementById: () => null })).toBe(false)
    expect(focusElementById('missing')).toBe(false)
  })
})

describe('Taro button activation accessibility', () => {
  it('uses the same activation for pointer and keyboard input', () => {
    const activate = vi.fn()
    const props = buttonActivationProps(activate)

    props.onClick()
    props.onKeyDown(keyboardEvent('Enter'))

    expect(activate).toHaveBeenCalledTimes(2)
  })

  it('blocks pointer and keyboard activation while disabled', () => {
    const activate = vi.fn()
    const props = buttonActivationProps(activate, true)

    props.onClick()
    props.onKeyDown(keyboardEvent(' '))

    expect(activate).not.toHaveBeenCalled()
  })
})
