import { describe, expect, it } from 'vitest'

import { aiExplanationLedgerState, nextAiExplanationHistoryCount } from './ai-explanations.model'

describe('AI explanation ledger presentation model', () => {
  it('keeps current, frozen, and historical plan authority distinct', () => {
    expect(aiExplanationLedgerState(3, 3, true)).toBe('current')
    expect(aiExplanationLedgerState(3, 3, false)).toBe('frozen')
    expect(aiExplanationLedgerState(2, 3, true)).toBe('history')
  })

  it('reveals bounded history in batches of five without exceeding the total', () => {
    expect(nextAiExplanationHistoryCount(5, 14)).toBe(10)
    expect(nextAiExplanationHistoryCount(10, 14)).toBe(14)
    expect(nextAiExplanationHistoryCount(14, 14)).toBe(14)
  })
})
