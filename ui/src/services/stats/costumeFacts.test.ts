import { describe, expect, it } from 'vitest'

import { FACTS, fillQuestion } from './facts'

const fact = (id: string) => FACTS.find((f) => f.id === `costume-${id}`)!
// CostumeDatabase: [nikke, grade, source, owned]
const cols = (rows: unknown[][]) => ({
  CostumeDatabase: {
    nikke: rows.map((r) => r[0]),
    grade: rows.map((r) => r[1]),
    source: rows.map((r) => r[2]),
    owned: rows.map((r) => r[3]),
  },
})
const compute = (id: string, rows: unknown[][], values: Record<string, string> = {}) =>
  fact(id).compute(cols(rows), values, '2026-11-28')

const ROWS = [
  ['Rapi', 'Unique', 'Costume Gacha', true],
  ['Rapi', 'Epic', 'Event Pass', 'FALSE'],
  ['Anis', 'Epic', 'Mission Pass', 'TRUE'],
  ['Anis', 'Unique', '', true],
  ['Neon', 'Epic', 'Cash Shop', false],
  ['', '', '', ''],
]
const any = { grade: 'any grade', source: 'any source' }
const of = (grade: string, source: string) => ({ grade, source })

describe('costume facts', () => {
  it('owned counts owned costumes of the grade and source', () => {
    expect(compute('owned', ROWS, any)).toBe('3')
    expect(compute('owned', ROWS, of('Unique', 'any source'))).toBe('2')
    expect(compute('owned', ROWS, of('any grade', 'Costume Gacha'))).toBe('1')
    expect(compute('owned', ROWS, of('Epic', 'Cash Shop'))).toBe('0')
    expect(compute('owned', ROWS, of('Unique', 'Cash Shop'))).toBeNull()
    expect(compute('owned', [], any)).toBeNull()
  })

  it('completion is the owned share of the source', () => {
    expect(compute('completion', ROWS, { source: 'any source' })).toBe('60')
    expect(compute('completion', ROWS, { source: 'Costume Gacha' })).toBe('100')
    expect(compute('completion', ROWS, { source: 'Cash Shop' })).toBe('0')
    expect(compute('completion', [], { source: 'any source' })).toBeNull()
  })

  it('missing counts unowned costumes of the grade and source', () => {
    expect(compute('missing', ROWS, any)).toBe('2')
    expect(compute('missing', ROWS, of('Epic', 'Event Pass'))).toBe('1')
    expect(compute('missing', ROWS, of('Unique', 'any source'))).toBe('0')
    expect(compute('missing', ROWS, of('Unique', 'Cash Shop'))).toBeNull()
  })

  it('dressed counts each NIKKE with an owned costume once', () => {
    expect(compute('dressed', ROWS)).toBe('2')
    expect(compute('dressed', [['Neon', 'Epic', 'Cash Shop', false]])).toBe('0')
    expect(compute('dressed', [])).toBeNull()
  })

  it('skipped passes counts unowned event and mission pass costumes', () => {
    expect(compute('skipped-passes', ROWS)).toBe('1')
    expect(compute('skipped-passes', ROWS.slice(2, 3))).toBe('0')
    expect(compute('skipped-passes', ROWS.slice(0, 1))).toBeNull()
  })

  it('takes filter options from the data and drops "any" before a noun', () => {
    const [grades, sources] = fact('owned').filters!
    const options = (f: typeof grades) =>
      typeof f.options === 'function' ? f.options(cols(ROWS)) : f.options
    expect(options(grades)).toEqual(['any grade', 'Unique', 'Epic'])
    expect(options(sources)).toEqual([
      'any source',
      'Costume Gacha',
      'Event Pass',
      'Mission Pass',
      'Cash Shop',
    ])
    expect(fillQuestion(fact('owned'), any)).toBe('How many costumes from any source do I own?')
    expect(fillQuestion(fact('completion'), { source: 'any source' })).toBe(
      'What % of costumes do I own?',
    )
    expect(fillQuestion(fact('completion'), { source: 'Event Pass' })).toBe(
      'What % of Event Pass costumes do I own?',
    )
  })
})

// [nikke, costumeName, grade, source, owned, releaseDate, priceUsd]
const DATED = [
  ['Rapi', 'Red Hood', 'Unique', 'Cash Shop', true, '2024-01-10', 20],
  ['Anis', 'Sparkling', 'Epic', 'Event Pass', false, '2024-03-01', '10.5'],
  ['Neon', 'Blue Ocean', 'Epic', 'Mission Pass', false, '2024-02-01', 'Free'],
  ['Marian', 'Future', 'Epic', 'Cash Shop', 'TRUE', '2025-06-01', ''],
  ['Pepper', 'Soon', 'Unique', 'Cash Shop', false, '2099-01-01', 99],
  ['Noir', 'Undated', 'Epic', 'Cash Shop', false, '', 5],
  ['Viper', 'Old', 'Epic', 'Event Pass', 'FALSE', '2024-03-01', 4],
]
const dated = (id: string, values: Record<string, string> = {}, rows = DATED) =>
  fact(id).compute(
    {
      CostumeDatabase: Object.fromEntries(
        ['nikke', 'costumeName', 'grade', 'source', 'owned', 'releaseDate', 'priceUsd'].map(
          (h, i) => [h, rows.map((r) => r[i])],
        ),
      ),
    },
    values,
    '2026-11-28',
  )

describe('costume date and price facts', () => {
  it('oldest-gap names the earliest released unowned costume', () => {
    expect(dated('oldest-gap')).toBe('Neon, Blue Ocean, 1 Feb 2024')
    expect(dated('oldest-gap', {}, DATED.slice(0, 1))).toBeNull()
  })
  it('by-year counts owned of released in the year', () => {
    const v = { year: '2024', grade: 'any grade', source: 'any source' }
    expect(dated('by-year', v)).toBe('1 of 4')
    expect(dated('by-year', { ...v, grade: 'Epic' })).toBe('0 of 3')
    expect(dated('by-year', { ...v, year: '2099' })).toBeNull()
  })
  it('drought is the longest gap between two releases, the future ignored', () => {
    expect(dated('drought')).toBe('457 days, 1 Mar 2024 to 1 Jun 2025')
    expect(dated('drought', {}, DATED.slice(0, 1))).toBeNull()
  })
  it('upcoming counts costumes releasing after today', () => {
    expect(dated('upcoming')).toBe('1')
    expect(dated('upcoming', {}, DATED.slice(0, 2))).toBe('0')
  })
  it('list-value sums priceUsd of owned costumes, a non-number as 0', () => {
    expect(dated('list-value', { source: 'any source' })).toBe('$20.00')
    expect(dated('list-value', { source: 'Event Pass' })).toBe('$0.00')
  })
  it('skipped-value sums unowned pass costumes', () => {
    expect(dated('skipped-value')).toBe('$14.50')
    expect(dated('skipped-value', {}, DATED.slice(0, 1))).toBeNull()
  })
})
