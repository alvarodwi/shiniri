import { describe, expect, it } from 'vitest'

import { FACTS } from './facts'

const fact = (id: string) => FACTS.find((f) => f.id === id)!
// Social: [date, pulls, totalSsr, ssrDetails]; NikkeDatabase: [nikke, rarity, limited, overspec]
const compute = (id: string, rows: unknown[][], range = 'any period', db: unknown[][] = []) =>
  fact(id).compute(
    {
      Social: {
        date: rows.map((r) => r[0]),
        pulls: rows.map((r) => r[1]),
        totalSsr: rows.map((r) => r[2]),
        ssrDetails: rows.map((r) => r[3]),
      },
      NikkeDatabase: {
        nikke: db.map((r) => r[0]),
        rarity: db.map((r) => r[1]),
        limited: db.map((r) => r[2]),
        overspec: db.map((r) => r[3]),
      },
    },
    { range },
    '2026-11-28',
  )

const ROWS = [
  ['2025-12-23', 100, 2, 'Frima, Biscuit'],
  ['2025-12-23', 10, 0, ''],
  ['2026-01-05', 1000, 22, 'Frima'],
  ['2026-11-28', 140, 0, ''],
  ['', '', '', ''],
]
const TIED = [
  ['2026-01-02', 10, 0, ''],
  ['2026-01-01', 10, 0, ''],
]
const DRY = [['2026-01-01', 10, 0, '']]

// [id, range, rows, expected]
const CASES: [string, string, unknown[][], string | null][] = [
  ['pulls', 'any period', ROWS, '1,250'],
  ['pulls', 'in 2025', ROWS, '110'],
  ['pulls', 'in 2022', ROWS, '0'],
  ['ssr', 'any period', ROWS, '24'],
  ['ssr', 'any period', DRY, '0'],
  ['luck', 'any period', ROWS, '1.9 (24 of 1,250)'],
  ['luck', 'any period', DRY, '0 (0 of 10)'],
  ['luck', 'in 2022', ROWS, null],
  ['biggest-day', 'any period', ROWS, '1,000 (5 Jan 2026)'],
  ['biggest-day', 'in 2025', ROWS, '110 (23 Dec 2025)'], // same-day sessions are summed
  ['biggest-day', 'any period', TIED, '10 (1 Jan 2026)'], // tie: earliest day
  ['biggest-day', 'in 2022', ROWS, null],
]

const DB = [
  ['Frima', 'SSR', false, false],
  ['Biscuit', 'SSR', 'FALSE', ''],
  ['Pepper', 'SSR', '', ''],
  ['Rapi', 'SR', false, false],
  ['Rupee: Winter Shopper', 'SSR', true, false],
  ['Noah', 'SSR', false, 'TRUE '], // hand-typed trailing space
]

describe('social facts', () => {
  it.each(CASES)('social-%s %s', (id, range, rows, expected) => {
    expect(compute(`social-${id}`, rows, range)).toBe(expected)
  })

  it('social-missing counts the pool names never pulled', () => {
    expect(compute('social-missing', ROWS, undefined, DB)).toBe('1')
    expect(compute('social-missing', DRY, undefined, DB)).toBe('3')
    expect(compute('social-missing', ROWS, undefined, DB.slice(0, 2))).toBe('0')
    expect(compute('social-missing', ROWS, undefined, DB.slice(3))).toBeNull() // no pool
  })

  it('has all 5 facts in Pulls', () => {
    const facts = FACTS.filter((f) => f.id.startsWith('social-'))
    expect(facts).toHaveLength(5)
    expect(facts.every((f) => f.category === 'Pulls')).toBe(true)
  })
})
