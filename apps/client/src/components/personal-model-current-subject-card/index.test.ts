import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

const source = () => readFile(new URL('./index.tsx', import.meta.url), 'utf8')
const styles = () => readFile(new URL('./index.scss', import.meta.url), 'utf8')

describe('personal model current-subject card structure', () => {
  it('labels the card, evidence scale, limitations and status for assistive technology', async () => {
    const content = await source()

    expect(content).toContain('role="group"')
    expect(content).toContain('role="status"')
    expect(content).toContain('aria-label="证据刻度"')
    expect(content).toContain('aria-label="资料限制"')
  })

  it('remains props-only and introduces no inactive controls', async () => {
    const content = await source()

    expect(content).not.toContain('<Button')
    expect(content).not.toMatch(/onClick=|onKeyDown=|useEffect|useState/)
    expect(content).not.toMatch(/personal-model-current-subject-api|requestCurrentPersonalModel/)
  })

  it('uses the shared design tokens and preserves the mobile evidence grid', async () => {
    const content = await styles()

    expect(content).toContain('var(--color-juniper)')
    expect(content).toContain('var(--font-metric)')
    expect(content).toContain('@media (max-width: 360px)')
    expect(content).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))')
  })
})
