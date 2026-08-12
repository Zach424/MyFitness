import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

const source = () => readFile(new URL('./index.tsx', import.meta.url), 'utf8')
const appConfig = () => readFile(new URL('../../app.config.ts', import.meta.url), 'utf8')

describe('personal model page structure', () => {
  it('registers a dedicated route and reads one explicitly selected subject at a time', async () => {
    expect(await appConfig()).toContain("'pages/personal-model/index'")
    const content = await source()

    expect(content).toContain('getCurrentPersonalModelSubject(begun.receipt.subjectKey)')
    expect(content).toContain('personalModelPageSubjects.map')
    expect(content).toContain('aria-pressed={selected}')
  })

  it('uses the shared read authority for begin, settlement and unmount invalidation', async () => {
    const content = await source()

    expect(content).toContain('beginPersonalModelCurrentSubjectRead')
    expect(content).toContain('acceptPersonalModelCurrentSubjectRead')
    expect(content).toContain('failPersonalModelCurrentSubjectRead')
    expect(content).toContain('invalidatePersonalModelCurrentSubjectRead')
    expect(content).toContain('replacePersonalModelCurrentSubject')
    expect(content).toContain('cancelFailureFocus()')
  })

  it('keeps loading, refreshing, failure and retained card states explicit', async () => {
    const content = await source()

    expect(content).toContain("phase === 'initial-loading'")
    expect(content).toContain("phase === 'refreshing'")
    expect(content).toContain('personalModelPageFailureCopy')
    expect(content).toContain('<PersonalModelCurrentSubjectCard')
    expect(content).toContain('role="status"')
  })

  it('does not add feedback, history, polling or persistence controls', async () => {
    const content = await source()

    expect(content).not.toMatch(/setInterval|setTimeout|storage|Storage|feedback|lineage|history/)
    expect(content).not.toMatch(/符合我|暂时情况|不同意|不确定/)
  })
})
