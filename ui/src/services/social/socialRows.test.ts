import { describe, expect, it } from 'vitest'

import { toRow } from './socialRows'

import type { SocialEntry } from '@/types/social'

const entry = (over: Partial<SocialEntry> = {}): SocialEntry => ({
  date: '2026-11-21',
  times: '20',
  names: [],
  notes: '',
  ...over,
})

describe('toRow', () => {
  it('builds the row with a counted totalSsr', () => {
    const e = entry({ names: ['Biscuit', 'Biscuit', 'Frima'], notes: ' doggo ' })
    expect(toRow(e)).toEqual(['2026-11-21', 20, 3, "'Biscuit, Biscuit, Frima", "'doggo"])
  })

  it('leaves details and notes blank for a zero-SSR session', () => {
    expect(toRow(entry({ times: '1' }))).toEqual(['2026-11-21', 1, 0, '', ''])
  })

  it('refuses times that are not a whole number of at least 1', () => {
    for (const times of ['0', '1.5', '-3', '', 'abc']) expect(toRow(entry({ times }))).toBeNull()
  })

  it('trims times', () => {
    expect(toRow(entry({ times: ' 10 ' }))?.[1]).toBe(10)
  })

  it('refuses a blank date', () => {
    expect(toRow(entry({ date: '' }))).toBeNull()
  })

  it('keeps notes as text, not a formula', () => {
    expect(toRow(entry({ notes: '+2 copies' }))?.[4]).toBe("'+2 copies")
  })
})
