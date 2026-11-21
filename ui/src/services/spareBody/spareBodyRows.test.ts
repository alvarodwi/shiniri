import { describe, expect, it } from 'vitest'

import { parseCopies, spareBodyPool, toRows } from './spareBodyRows'

import type { Nikke } from '@/services/nikke/nikkeDatabase'
import type { SpareBodyEntry } from '@/types/spareBody'

const nikke = (name: string, rarity: string, manufacturer: string) =>
  ({ name, rarity, manufacturer }) as Nikke
const db = [
  nikke('Modernia', 'SSR', 'Pilgrim'),
  nikke('Asuka', 'SSR', 'ABNORMAL'),
  nikke('Maxwell', 'SSR', 'Missilis'),
  nikke('Sin', 'SSR', 'Pilgrim'),
  nikke('Sin: Swift Bunny', 'SSR', 'Pilgrim'),
  nikke('Quency', 'SSR', 'Missilis'),
  nikke('Soda', 'SR', 'Tetra'),
]
const pool = (s: string) => spareBodyPool(db, s).map((n) => n.name)

describe('spareBodyPool', () => {
  it('gives every SSR for Gold Mileage', () => {
    expect(pool('Gold Mileage')).toEqual([
      'Modernia',
      'Asuka',
      'Maxwell',
      'Sin',
      'Sin: Swift Bunny',
      'Quency',
    ])
  })
  it('leaves Abnormal out for Silver Mileage', () => {
    expect(pool('Silver Mileage')).not.toContain('Asuka')
    expect(pool('Silver Mileage')).toContain('Modernia')
  })
  it('gives only the exact liberation names for Union Chip', () => {
    expect(pool('Union Chip')).toEqual(['Sin', 'Quency'])
  })
  it('is empty for Liberation and no source', () => {
    expect(pool('Liberation')).toEqual([])
    expect(pool('')).toEqual([])
  })
})

describe('parseCopies', () => {
  it('trims and accepts 1 to 11', () => {
    expect(parseCopies(' 3 ')).toBe(3)
    expect(parseCopies('11')).toBe(11)
  })
  it.each(['', '0', '12', '2.5', 'x'])('rejects %j', (s) => {
    expect(parseCopies(s)).toBeNull()
  })
})

const entry = (over: Partial<SpareBodyEntry> = {}): SpareBodyEntry => ({
  date: '2026-11-18',
  source: 'Gold Mileage',
  target: 'Marian: Queen',
  copies: '3',
  notes: ' c7 ',
  ...over,
})

describe('toRows', () => {
  it('writes one row per copy, note on the last only', () => {
    const row = ['2026-11-18', "'Marian: Queen", 'Gold Mileage', '']
    expect(toRows(entry())).toEqual([row, row, [...row.slice(0, 3), "'c7"]])
  })
  it('writes one row with the note for one copy', () => {
    expect(toRows(entry({ copies: '1' }))).toEqual([
      ['2026-11-18', "'Marian: Queen", 'Gold Mileage', "'c7"],
    ])
  })
  it.each([
    { date: '' },
    { source: '' },
    { source: 'Liberation' },
    { target: '' },
    { copies: '0' },
    { copies: '12' },
  ])('is null for %j', (over) => {
    expect(toRows(entry(over))).toBeNull()
  })
})
