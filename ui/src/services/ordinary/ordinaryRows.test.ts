import { describe, expect, it } from 'vitest'

import { toRow } from './ordinaryRows'

import type { OrdinaryEntry } from '@/types/ordinary'

const entry = (over: Partial<OrdinaryEntry> = {}): OrdinaryEntry => ({
  date: '2026-11-21',
  gems: '0',
  tix: '1',
  names: [],
  notes: '',
  ...over,
})

describe('toRow', () => {
  it('builds the row with a computed times and a counted totalSsr', () => {
    const e = entry({ gems: '600', tix: '3', names: ['Rumani', 'Alice'], notes: ' lucky ' })
    expect(toRow(e)).toEqual(['2026-11-21', 600, 3, 5, 2, "'Rumani, Alice", "'lucky"])
  })

  it('saves a session with no SSR as 0 and blank text cells', () => {
    expect(toRow(entry())).toEqual(['2026-11-21', 0, 1, 1, 0, '', ''])
  })

  it('refuses a missing date, gems off a multiple of 300, or both currencies blank', () => {
    expect(toRow(entry({ date: '' }))).toBeNull()
    expect(toRow(entry({ gems: '150' }))).toBeNull()
    expect(toRow(entry({ gems: '', tix: '' }))).toBeNull()
  })

  it('trims gems and tix', () => {
    expect(toRow(entry({ gems: ' 300 ', tix: '' }))?.[3]).toBe(1)
  })
})
