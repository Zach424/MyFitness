import { describe, expect, it } from 'vitest'

import { colors, contrastRatio, relativeLuminance } from './index'

describe('design tokens', () => {
  it('uses portable six-digit hex colors', () => {
    Object.values(colors).forEach((color) => {
      expect(color).toMatch(/^#[0-9A-F]{6}$/i)
    })
  })

  it('keeps primary text above WCAG AA contrast on reading surfaces', () => {
    expect(contrastRatio(colors.ink, colors.paper)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(colors.ink, colors.mist)).toBeGreaterThanOrEqual(4.5)
  })

  it('rejects ambiguous color input', () => {
    expect(() => relativeLuminance('#fff')).toThrow(/six-digit hex color/)
  })
})
