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

  it('binds feedback to the exact write authority and explicitly rereads after success', async () => {
    const content = await source()

    expect(content).toContain('beginPersonalModelFeedbackWrite')
    expect(content).toContain('submitPersonalModelFeedback')
    expect(content).toContain('acceptPersonalModelFeedbackWrite')
    expect(content).toContain('await readCurrentSubject()')
    expect(content).toContain('replacePersonalModelFeedbackSubject')
    expect(content).toContain('invalidatePersonalModelFeedbackWrite')
    expect(content).toContain('重试同一次反馈')
  })

  it('keeps temporary, notes, history, polling and persistence outside this surface', async () => {
    const content = await source()

    expect(content).not.toMatch(/setInterval|setTimeout|storage|Storage|lineage|history/)
    expect(content).toContain('contextValidUntil: null')
    expect(content).toContain('note: null')
    expect(content).toContain('“只是暂时情况”需要你指定截止时间，将在下一步开放')
  })
})
