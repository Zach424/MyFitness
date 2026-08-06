import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buttonActivationProps,
  deferH5Focus,
  deferH5FocusWithFallback,
  escapeDismissProps,
  focusElementById,
  focusElementByIdWithFallback,
  keyboardActivationProps,
} from './accessibility'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

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

  it('uses the fallback only when the primary target is missing', () => {
    const fallbackFocus = vi.fn()
    const root = {
      getElementById: vi.fn((id: string) =>
        id === 'fallback-target' ? { focus: fallbackFocus } : null,
      ),
    }

    expect(focusElementByIdWithFallback('missing', 'fallback-target', root)).toBe(true)
    expect(root.getElementById).toHaveBeenNthCalledWith(1, 'missing')
    expect(root.getElementById).toHaveBeenNthCalledWith(2, 'fallback-target')
    expect(fallbackFocus).toHaveBeenCalledOnce()
  })

  it('does not inspect the fallback after the primary target receives focus', () => {
    const primaryFocus = vi.fn()
    const root = { getElementById: vi.fn(() => ({ focus: primaryFocus })) }

    expect(focusElementByIdWithFallback('primary-target', 'fallback-target', root)).toBe(true)
    expect(root.getElementById).toHaveBeenCalledOnce()
    expect(primaryFocus).toHaveBeenCalledOnce()
  })
})

describe('deferred H5 focus accessibility', () => {
  const h5Document = () => {
    const body = { focus: vi.fn() }
    const documentElement = { focus: vi.fn() }
    return {
      activeElement: body as unknown,
      body,
      documentElement,
      getElementById: vi.fn<(id: string) => { focus: () => void } | null>(() => null),
    }
  }

  it('retries a late-mounted target and stops after one stable focus confirmation', () => {
    vi.useFakeTimers()
    vi.stubEnv('TARO_ENV', 'h5')
    const root = h5Document()
    const target = {
      focus: vi.fn(() => {
        root.activeElement = target
      }),
    }
    root.getElementById.mockReturnValueOnce(null).mockReturnValue(target)
    vi.stubGlobal('document', root)

    deferH5Focus('late-target', 10, { maxAttempts: 4, retryDelayMs: 20 })
    vi.advanceTimersByTime(10)
    expect(target.focus).not.toHaveBeenCalled()

    vi.advanceTimersByTime(20)
    expect(target.focus).toHaveBeenCalledOnce()
    vi.runAllTimers()
    expect(root.getElementById).toHaveBeenCalledTimes(3)
  })

  it('reacquires a target replaced by the renderer after the first successful focus', () => {
    vi.useFakeTimers()
    vi.stubEnv('TARO_ENV', 'h5')
    const root = h5Document()
    const firstTarget = {
      focus: vi.fn(() => {
        root.activeElement = firstTarget
      }),
    }
    const replacementTarget = {
      focus: vi.fn(() => {
        root.activeElement = replacementTarget
      }),
    }
    root.getElementById.mockReturnValue(firstTarget)
    vi.stubGlobal('document', root)

    deferH5Focus('replaced-target', 0, { maxAttempts: 4, retryDelayMs: 20 })
    vi.advanceTimersByTime(0)
    root.activeElement = root.body
    root.getElementById.mockReturnValue(replacementTarget)
    vi.advanceTimersByTime(20)
    vi.runAllTimers()

    expect(firstTarget.focus).toHaveBeenCalledOnce()
    expect(replacementTarget.focus).toHaveBeenCalledOnce()
    expect(root.getElementById).toHaveBeenCalledTimes(3)
  })

  it('stops after the deterministic attempt budget when the target never mounts', () => {
    vi.useFakeTimers()
    vi.stubEnv('TARO_ENV', 'h5')
    const root = h5Document()
    vi.stubGlobal('document', root)

    deferH5Focus('missing-target', 0, { maxAttempts: 4, retryDelayMs: 20 })
    vi.runAllTimers()

    expect(root.getElementById).toHaveBeenCalledTimes(4)
  })

  it('does not steal focus after the user moves to another control', () => {
    vi.useFakeTimers()
    vi.stubEnv('TARO_ENV', 'h5')
    const root = h5Document()
    vi.stubGlobal('document', root)

    deferH5Focus('late-target', 0, { maxAttempts: 4, retryDelayMs: 20 })
    vi.advanceTimersByTime(0)
    root.activeElement = { focus: vi.fn() }
    vi.runAllTimers()

    expect(root.getElementById).toHaveBeenCalledOnce()
  })

  it('stops after its caller invalidates focus authority', () => {
    vi.useFakeTimers()
    vi.stubEnv('TARO_ENV', 'h5')
    const root = h5Document()
    let current = true
    vi.stubGlobal('document', root)

    deferH5Focus('late-target', 0, {
      canFocus: () => current,
      maxAttempts: 4,
      retryDelayMs: 20,
    })
    vi.advanceTimersByTime(0)
    current = false
    vi.runAllTimers()

    expect(root.getElementById).toHaveBeenCalledOnce()
  })

  it('preserves immediate fallback selection when the primary target is absent', () => {
    vi.useFakeTimers()
    vi.stubEnv('TARO_ENV', 'h5')
    const root = h5Document()
    const fallback = {
      focus: vi.fn(() => {
        root.activeElement = fallback
      }),
    }
    root.getElementById.mockImplementation((id) => (id === 'fallback-target' ? fallback : null))
    vi.stubGlobal('document', root)

    deferH5FocusWithFallback('missing-target', 'fallback-target')
    vi.runAllTimers()

    expect(root.getElementById).toHaveBeenNthCalledWith(1, 'missing-target')
    expect(root.getElementById).toHaveBeenNthCalledWith(2, 'fallback-target')
    expect(fallback.focus).toHaveBeenCalledOnce()
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
    expect(props['aria-disabled']).toBe(true)
  })
})

describe('dialog dismissal accessibility', () => {
  it('dismisses once for Escape and prevents the key from escaping the dialog boundary', () => {
    const dismiss = vi.fn()
    const event = { ...keyboardEvent('Escape'), stopPropagation: vi.fn() }

    escapeDismissProps(dismiss).onKeyDown(event)

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.stopPropagation).toHaveBeenCalledOnce()
    expect(dismiss).toHaveBeenCalledOnce()
  })

  it.each(['Enter', ' '])('ignores non-Escape key %s', (key) => {
    const dismiss = vi.fn()
    const event = { ...keyboardEvent(key), stopPropagation: vi.fn() }

    escapeDismissProps(dismiss).onKeyDown(event)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(event.stopPropagation).not.toHaveBeenCalled()
    expect(dismiss).not.toHaveBeenCalled()
  })

  it('does not dismiss a committed operation while disabled', () => {
    const dismiss = vi.fn()
    const event = { ...keyboardEvent('Escape'), stopPropagation: vi.fn() }

    escapeDismissProps(dismiss, true).onKeyDown(event)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(event.stopPropagation).not.toHaveBeenCalled()
    expect(dismiss).not.toHaveBeenCalled()
  })
})
