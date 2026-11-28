import { describe, expect, it } from 'vitest'

import { FACTS, fillQuestion } from './facts'

type Row = [date: unknown, source: string, cls: string, manufacturer: string, slot: string]
const HEADERS = ['date', 'source', 'class', 'manufacturer', 'slot']
type SpecialDay = [date: string, boss: string]

const fact = (id: string) => FACTS.find((f) => f.id === id)!
// Only the columns the fact declares, as the loader would give them.
const compute = (
  id: string,
  rows: Row[],
  values: Record<string, string>,
  special: SpecialDay[] = [],
) => {
  const cols = Object.fromEntries(
    fact(id).reads.map(({ tab, columns }) => [
      tab.tab,
      Object.fromEntries(
        columns.map((name) => [
          name,
          tab.tab === 'Gear'
            ? rows.map((r) => r[HEADERS.indexOf(name)])
            : special.map((r) => r[name === 'date' ? 0 : 1]),
        ]),
      ),
    ]),
  )
  return fact(id).compute(cols, values, '2026-11-27')
}

const SI = 'Special Interception'
const AI = 'Anomaly Interception'
const ARMS = 'Manufacturer Arms'
const BOX = 'Manufacturer Selection Box'
const FURNACE = 'Manufacturer Arms Furnace'

const ROWS: Row[] = [
  ['2023-07-01', SI, 'Attacker', 'Tetra', 'Helmet'],
  ['2023-07-02', SI, 'Defender', 'Elysion', 'Torso'],
  ['2024-03-03', AI, 'Attacker', 'Tetra', 'Helmet'],
  ['2024-03-04', ARMS, 'Attacker', 'Tetra', 'Torso'],
  ['2024-03-05', BOX, 'Supporter', 'Pilgrim', 'Boots'],
  ['2024-03-05', BOX, 'Supporter', 'Pilgrim', 'Boots'],
  ['2024-03-05', BOX, 'Supporter', 'Pilgrim', 'Boots'],
  ['2024-03-06', FURNACE, 'Attacker', 'Missilis', 'Gloves'],
  ['2024-03-06', FURNACE, 'Attacker', 'Missilis', 'Gloves'],
  ['2024-03-06', FURNACE, 'Attacker', 'Missilis', 'Boots'],
  ['', '', '', '', ''], // a blank row
]
const SET: Row[] = ['Helmet', 'Torso', 'Gloves', 'Boots', 'Boots'].map((slot) => [
  '2024-01-01',
  ARMS,
  'Attacker',
  'Tetra',
  slot,
])

const kind = { manufacturer: 'any manufacturer', class: 'any class', slot: 'any slot' }
const all = { source: 'any source', range: 'any period' }
const from = (source: string) => ({ ...all, source })
const anySet = { manufacturer: 'any manufacturer', class: 'any class' }

// [id, values, rows, expected]
const CASES: [string, Record<string, string>, Row[], string | null][] = [
  ['pieces', { ...all, ...kind }, ROWS, '10'],
  ['pieces', { ...from('any box'), ...kind }, ROWS, '7'],
  ['pieces', { ...from('any interception'), ...kind }, ROWS, '3'],
  ['pieces', { ...from(BOX), ...kind }, ROWS, '3'],
  ['pieces', { ...all, ...kind, manufacturer: 'Tetra', slot: 'Helmet' }, ROWS, '2'],
  ['pieces', { ...all, ...kind, range: 'in 2023' }, ROWS, '2'],
  ['pieces', { ...all, ...kind, manufacturer: 'Abnormal' }, ROWS, '0'],
  ['first-piece', { ...all, ...kind, class: 'Attacker' }, ROWS, '1 Jul 2023'],
  // earliest date, not earliest row
  ['first-piece', { ...all, ...kind }, [ROWS[2], ROWS[0]], '1 Jul 2023'],
  ['first-piece', { ...all, ...kind, manufacturer: 'Abnormal' }, ROWS, null],
  // chance facts: no Selection Box; manufacturer and piece ones no Furnace either
  ['top-piece', all, ROWS, 'Tetra Attacker Helmet, 2 pieces'],
  ['top-piece', all, ROWS.slice(0, 2), 'Tetra Attacker Helmet, 1 piece'], // tie: earliest row
  ['top-piece', from(FURNACE), ROWS, null],
  ['top-manufacturer', all, ROWS, 'Tetra, 3 pieces'],
  ['top-manufacturer', from('any box'), ROWS, 'Tetra, 1 piece'],
  ['top-manufacturer', all, ROWS.slice(0, 2), 'Tetra, 1 piece'], // tie: earliest row
  ['top-manufacturer', from(BOX), ROWS, null],
  ['top-class', all, ROWS, 'Attacker, 6 pieces'],
  ['top-class', all, ROWS.slice(0, 2), 'Attacker, 1 piece'], // tie: earliest row
  ['top-class', from(BOX), ROWS, null],
  ['top-slot', all, ROWS, 'Helmet, 2 pieces'], // tie with Torso and Gloves: earliest row
  ['top-slot', { ...all, range: 'in 2022' }, ROWS, null],
  ['manufacturer-share', { ...all, manufacturer: 'Tetra' }, ROWS, '75'],
  ['manufacturer-share', { ...all, manufacturer: 'Missilis' }, ROWS, '0'],
  ['manufacturer-share', { ...from(FURNACE), manufacturer: 'Missilis' }, ROWS, null],
  ['class-share', { ...all, class: 'Attacker' }, ROWS, '86'],
  ['class-share', { ...all, class: 'Supporter' }, ROWS, '0'],
  ['class-share', { ...from(BOX), class: 'Supporter' }, ROWS, null],
  ['slot-share', { ...all, slot: 'Gloves' }, ROWS, '29'],
  ['slot-share', { ...from(AI), slot: 'Torso' }, ROWS, '0'],
  ['slot-share', { ...all, slot: 'Gloves', range: 'in 2022' }, ROWS, null],
  ['collection', { source: 'any source' }, ROWS, '6'],
  ['collection', { source: BOX }, ROWS, '1'],
  ['collection', { source: BOX }, [], '0'],
  ['last-new-piece', { source: 'any source' }, ROWS, 'Missilis Attacker Gloves, 6 Mar 2024'],
  ['last-new-piece', { source: AI }, ROWS, 'Tetra Attacker Helmet, 3 Mar 2024'],
  ['last-new-piece', { source: AI }, [], null],
  ['complete-sets', anySet, SET, '1'],
  ['complete-sets', anySet, [...SET, ...SET], '2'],
  ['complete-sets', anySet, ROWS, '0'], // slots never mix across combinations
  ['complete-sets', { manufacturer: 'Pilgrim', class: 'any class' }, SET, '0'],
  ['overdue-piece', {}, ROWS, 'Elysion Defender Torso, 1,244 days'],
  // tie: earliest row
  ['overdue-piece', {}, [ROWS[8], ROWS[9]], 'Missilis Attacker Gloves, 996 days'],
  [
    'overdue-piece',
    {},
    [['2026-11-27', ARMS, 'Attacker', 'Tetra', 'Helmet']],
    'Tetra Attacker Helmet, 0 days',
  ],
  ['overdue-piece', {}, [], null],
]

const DAYS: SpecialDay[] = [
  ['2023-07-01', 'Alteisen'],
  ['2023-07-02', 'Gravedigger'],
]
const special = { boss: 'any boss', range: 'any period' }
const alteisen = { ...special, boss: 'Alteisen' }
const modernia = { ...special, boss: 'Modernia' }

// [id, values, expected], over ROWS and DAYS
const SPECIAL_CASES: [string, Record<string, string>, string | null][] = [
  ['pieces', { ...special, ...kind }, '2'],
  ['pieces', { ...alteisen, ...kind }, '1'],
  ['pieces', { ...modernia, ...kind }, '0'],
  ['top-piece', special, 'Tetra Attacker Helmet, 1 piece'], // tie: earliest row
  ['top-piece', modernia, null],
  ['top-manufacturer', { ...special, boss: 'Gravedigger' }, 'Elysion, 1 piece'],
  ['top-manufacturer', special, 'Tetra, 1 piece'], // tie: earliest row
  ['top-manufacturer', modernia, null],
  ['top-class', special, 'Attacker, 1 piece'], // tie: earliest row
  ['manufacturer-share', { ...special, manufacturer: 'Pilgrim' }, '0'],
  ['slot-share', { ...special, slot: 'Boots' }, '0'],
  ['top-class', alteisen, 'Attacker, 1 piece'],
  ['top-class', modernia, null],
  ['top-slot', special, 'Helmet, 1 piece'],
  ['top-slot', { ...special, range: 'in 2024' }, null],
  ['manufacturer-share', { ...special, manufacturer: 'Tetra' }, '50'],
  ['manufacturer-share', { ...modernia, manufacturer: 'Tetra' }, null],
  ['class-share', { ...alteisen, class: 'Defender' }, '0'],
  ['class-share', { ...modernia, class: 'Defender' }, null],
  ['slot-share', { ...special, slot: 'Torso' }, '50'],
  ['slot-share', { ...modernia, slot: 'Torso' }, null],
]

describe('gear facts', () => {
  it.each(CASES)('gear-%s %o', (id, values, rows, expected) => {
    expect(compute(`gear-${id}`, rows, values)).toBe(expected)
  })

  it.each(SPECIAL_CASES)('gear-special-%s %o', (id, values, expected) => {
    expect(compute(`gear-special-${id}`, ROWS, values, DAYS)).toBe(expected)
  })

  it('has all 21 facts in Gear', () => {
    const facts = FACTS.filter((f) => f.id.startsWith('gear-'))
    expect(facts).toHaveLength(21)
    expect(facts.every((f) => f.category === 'Gear')).toBe(true)
  })

  it('offers no Selection Box or Furnace where the result is chosen', () => {
    const sources = (id: string) => fact(id).filters!.find((f) => f.id === 'source')!.options
    expect(sources('gear-pieces')).toEqual(expect.arrayContaining([BOX, FURNACE]))
    expect(sources('gear-top-class')).not.toContain(BOX)
    expect(sources('gear-top-class')).toContain(FURNACE)
    for (const id of ['gear-top-piece', 'gear-top-manufacturer', 'gear-manufacturer-share']) {
      expect(sources(id)).not.toContain(BOX)
      expect(sources(id)).not.toContain(FURNACE)
    }
  })

  it('words "any" and hides Quick on finished history', () => {
    const sets = fact('gear-complete-sets')
    expect(fillQuestion(sets, anySet)).toBe('How many full sets could I build from my pieces?')

    const range = fact('gear-special-pieces').filters!.find((f) => f.id === 'range')!
    const options = (range.options as (c: object) => string[])({
      Special: { date: ['2023-07-01'] },
    })
    expect(options).toEqual(['any period', 'in 2023'])
  })
})
