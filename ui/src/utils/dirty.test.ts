import { describe, expect, it } from 'vitest'

import { isEntryDirty } from './dirty'

const fresh = () => ({ date: '2026-11-23', times: '', names: [] as string[], copies: 1 })

describe('isEntryDirty', () => {
  it('is false for equal entries', () => {
    expect(isEntryDirty(fresh(), fresh())).toBe(false)
  })
  it('ignores the date alone, so a rolled game day never prompts', () => {
    expect(isEntryDirty({ ...fresh(), date: '2026-11-24' }, fresh())).toBe(false)
  })
  it('is true when a string, number or array field differs', () => {
    expect(isEntryDirty({ ...fresh(), times: '10' }, fresh())).toBe(true)
    expect(isEntryDirty({ ...fresh(), copies: 2 }, fresh())).toBe(true)
    expect(isEntryDirty({ ...fresh(), names: ['Rapi'] }, fresh())).toBe(true)
  })
})
