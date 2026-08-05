import { expect, type Locator, type Page } from '@playwright/test'

export const expectVisibleFocus = async (locator: Locator) => {
  await expect(locator).toBeFocused()
  const indicator = await locator.evaluate((element) => {
    const style = globalThis.getComputedStyle(element)
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
    }
  })
  expect(indicator.outlineStyle).not.toBe('none')
  expect(indicator.outlineWidth).toBeGreaterThanOrEqual(2)
}

export const expectPoliteStatus = async (locator: Locator) => {
  await expect(locator).toBeVisible()
  await expect(locator).toHaveAttribute('role', 'status')
  await expect(locator).toHaveAttribute('aria-live', 'polite')
  await expect(locator).toHaveAttribute('aria-atomic', 'true')
}

export const expectReducedMotion = async (page: Page) => {
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
    true,
  )
}
