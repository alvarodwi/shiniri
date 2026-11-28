import { describe, expect, it } from 'vitest'

import { FACTS } from './facts'

import { FURNACE_TAB } from '@/config/sheets'

const fact = (id: string) => FACTS.find((f) => f.id === id)!
// Rows follow the tab's headers; only the columns the fact declares are given, as the loader would.
const compute = (id: string, rows: unknown[][], values: Record<string, string>) => {
  const { columns } = fact(id).reads[0]
  const cols = Object.fromEntries(
    columns.map((name) => [name, rows.map((r) => r[FURNACE_TAB.headers.indexOf(name)])]),
  )
  return fact(id).compute({ Furnace: cols }, values, '2026-11-27')
}

// date, target, sacrifice 1 (class, manufacturer, slot), sacrifice 2, result (class, slot)
const ROWS = [
  [
    '2023-07-01',
    'Tetra',
    'Attacker',
    'Tetra',
    'Helmet',
    'Defender',
    'Elysion',
    'Torso',
    'Attacker',
    'Torso',
  ],
  [
    '2024-03-03',
    'Pilgrim',
    'Attacker',
    'Tetra',
    'Helmet',
    'Attacker',
    'Tetra',
    'Helmet',
    'Attacker',
    'Helmet',
  ],
  [
    '2024-03-04',
    'Pilgrim',
    'Supporter',
    'Missilis',
    'Boots',
    'Defender',
    'Elysion',
    'Torso',
    'Attacker',
    'Gloves',
  ],
  ['', '', '', '', '', '', '', '', '', ''], // a blank row
]
const TIED = [ROWS[0]] // two different sacrifices, one each

const any = { range: 'any period' }
const kind = { ...any, manufacturer: 'any manufacturer', class: 'any class', slot: 'any slot' }
const target = (t: string) => ({ ...any, target: t })
const none = { range: 'in 2022' }

// [id, values, rows, expected]
const CASES: [string, Record<string, string>, unknown[][], string | null][] = [
  ['sacrificed', kind, ROWS, '6'],
  ['sacrificed', { ...kind, manufacturer: 'Tetra' }, ROWS, '3'],
  ['sacrificed', { ...kind, class: 'Defender', slot: 'Torso' }, ROWS, '2'],
  // the parts must match on one sacrifice
  ['sacrificed', { ...kind, class: 'Attacker', slot: 'Torso' }, ROWS, '0'],
  ['sacrificed', { ...kind, ...none }, ROWS, '0'],
  ['top-piece', any, ROWS, 'Tetra Attacker Helmet, 3 pieces'],
  ['top-piece', any, TIED, 'Tetra Attacker Helmet, 1 piece'], // tie: first sacrifice
  ['top-piece', none, ROWS, null],
  ['top-manufacturer', any, ROWS, 'Tetra, 3 pieces'],
  ['top-manufacturer', any, TIED, 'Tetra, 1 piece'],
  ['top-manufacturer', none, ROWS, null],
  ['top-class', any, ROWS, 'Attacker, 3 pieces'],
  ['top-class', any, TIED, 'Attacker, 1 piece'],
  ['top-class', none, ROWS, null],
  ['top-slot', any, ROWS, 'Helmet, 3 pieces'],
  ['top-slot', any, TIED, 'Helmet, 1 piece'], // tie: first sacrifice
  ['top-slot', none, ROWS, null],
  ['attempts', target('any manufacturer'), ROWS, '3'],
  ['attempts', target('Pilgrim'), ROWS, '2'],
  ['attempts', target('Abnormal'), ROWS, '0'],
  ['top-target', any, ROWS, 'Pilgrim, 2 attempts'],
  ['top-target', any, ROWS.slice(0, 2), 'Tetra, 1 attempt'], // tie: earliest row
  ['top-target', none, ROWS, null],
  ['same-slot', any, ROWS, '2'], // both sacrifices matching counts once
  ['same-slot', none, ROWS, '0'],
  ['same-class', any, ROWS, '2'],
  ['same-class', none, ROWS, '0'],
  ['same-piece', any, ROWS, '1'], // row 1 has the class and the slot on different sacrifices
  ['same-piece', none, ROWS, '0'],
]

describe('furnace facts', () => {
  it.each(CASES)('furnace-%s %o', (id, values, rows, expected) => {
    expect(compute(`furnace-${id}`, rows, values)).toBe(expected)
  })

  it('has all 10 facts in Gear', () => {
    const facts = FACTS.filter((f) => f.id.startsWith('furnace-'))
    expect(facts).toHaveLength(10)
    expect(facts.every((f) => f.category === 'Gear')).toBe(true)
  })
})
