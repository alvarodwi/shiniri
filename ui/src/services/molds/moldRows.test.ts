import { describe, expect, it } from 'vitest'

import { isPerfect, moldPool, toRow } from './moldRows'

import type { Nikke } from '@/services/nikke/nikkeDatabase'
import type { MoldsEntry } from '@/types/molds'

const nikke = (
  name: string,
  rarity: string,
  manufacturer: string,
  overspec = false,
  limited = manufacturer === 'ABNORMAL',
) => ({ name, rarity, manufacturer, overspec, limited }) as Nikke
const db = [
  nikke('Elysion', 'SSR', 'ELYSION'),
  nikke('Modernia', 'SSR', 'Pilgrim', true),
  nikke('Anis: Star', 'SSR', 'Tetra', true),
  nikke('Asuka', 'SSR', 'ABNORMAL'),
  nikke('Maxwell', 'SSR', 'Missilis'),
  nikke('Soda', 'SR', 'Tetra'),
  nikke('Dorothy: Serendipity', 'SSR', 'Pilgrim', true, true),
  nikke('Anne: Miracle Fairy', 'SSR', 'MISSILIS', false, true),
]
const names = (t: Parameters<typeof moldPool>[1]) => moldPool(db, t).map((n) => n.name)

const entry = (over: Partial<MoldsEntry> = {}): MoldsEntry => ({
  date: '2026-11-21',
  moldType: 'Yellow Mold',
  amount: '5',
  names: [],
  notes: '',
  ...over,
})

describe('moldPool', () => {
  it('gives only the manufacturer SSRs, case-insensitively', () => {
    expect(names('Elysion Mold')).toEqual(['Elysion'])
    expect(names('Elysion Perfect Mold')).toEqual(['Elysion'])
    expect(names('Pilgrim Mold')).toEqual(['Modernia', 'Anis: Star'])
    expect(names('Tetra Mold')).toEqual([])
  })

  it('gives every non-overspec, non-limited SSR for mixed molds', () => {
    for (const t of ['Yellow Mold', 'Purple Mold', 'HQ Mold', 'HQ Perfect Mold'] as const)
      expect(names(t)).toEqual(['Elysion', 'Maxwell'])
  })
})

it('isPerfect', () => {
  expect(isPerfect('HQ Perfect Mold')).toBe(true)
  expect(isPerfect('HQ Mold')).toBe(false)
})

describe('toRow', () => {
  it('builds columns A-F', () => {
    expect(toRow(entry({ amount: ' 5 ', names: ['Maiden', 'Folkwang'], notes: ' ok ' }))).toEqual([
      '2026-11-21',
      'Yellow Mold',
      5,
      2,
      "'Maiden, Folkwang",
      "'ok",
    ])
  })

  it('allows zero SSRs on a plain mold', () => {
    expect(toRow(entry({ moldType: 'Purple Mold', amount: '1' }))).toEqual([
      '2026-11-21',
      'Purple Mold',
      1,
      0,
      '',
      '',
    ])
  })

  it('allows the same name twice', () => {
    expect(toRow(entry({ amount: '2', names: ['Liter', 'Liter'] }))?.[3]).toBe(2)
  })

  it('is null while invalid', () => {
    expect(toRow(entry({ date: '' }))).toBeNull()
    expect(toRow(entry({ moldType: '' }))).toBeNull()
    for (const amount of ['', '0', '-1', '2.5', 'x']) expect(toRow(entry({ amount }))).toBeNull()
    expect(toRow(entry({ amount: '1', names: ['A', 'B'] }))).toBeNull()
    expect(toRow(entry({ moldType: 'HQ Perfect Mold', amount: '2', names: ['A'] }))).toBeNull()
  })

  it('accepts a Perfect mold with one name per mold', () => {
    expect(
      toRow(entry({ moldType: 'HQ Perfect Mold', amount: '2', names: ['A', 'B'] })),
    ).not.toBeNull()
  })
})
