import { describe, expect, it } from 'vitest'

import { appendOlderRecords, includeExactRecord } from './record-pages'

describe('progressive record pages', () => {
  it('appends older rows in server order without duplicating a moved boundary row', () => {
    expect(
      appendOlderRecords(
        [
          { id: 'new', revision: 1 },
          { id: 'boundary', revision: 2 },
        ],
        [
          { id: 'boundary', revision: 1 },
          { id: 'old', revision: 1 },
        ],
      ),
    ).toEqual([
      { id: 'new', revision: 1 },
      { id: 'boundary', revision: 2 },
      { id: 'old', revision: 1 },
    ])
  })

  it('makes an exact correction target available without fetching intervening pages', () => {
    expect(includeExactRecord([{ id: 'new', revision: 1 }], { id: 'old', revision: 4 })).toEqual([
      { id: 'new', revision: 1 },
      { id: 'old', revision: 4 },
    ])
  })
})
