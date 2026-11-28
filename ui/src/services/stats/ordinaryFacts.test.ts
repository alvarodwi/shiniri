import { describe, expect, it } from 'vitest'

import { FACTS } from './facts'

const fact = (id: string) => FACTS.find((f) => f.id === id)!
// Ordinary: [date, gems, tickets, pulls, totalSsr, ssrDetails];
// NikkeDatabase: [nikke, rarity, limited, overspec]
const compute = (
  id: string,
  rows: unknown[][],
  values: Record<string, string> = {},
  db = DB,
  today = '2026-11-28',
) =>
  fact(`ordinary-${id}`).compute(
    {
      Ordinary: {
        date: rows.map((r) => r[0]),
        gems: rows.map((r) => r[1]),
        tickets: rows.map((r) => r[2]),
        pulls: rows.map((r) => r[3]),
        totalSsr: rows.map((r) => r[4]),
        ssrDetails: rows.map((r) => r[5]),
      },
      NikkeDatabase: {
        nikke: db.map((r) => r[0]),
        rarity: db.map((r) => r[1]),
        limited: db.map((r) => r[2]),
        overspec: db.map((r) => r[3]),
      },
    },
    values,
    today,
  )

const DB: unknown[][] = [
  ['Alice', 'SSR', false, true],
  ['Noah', 'SSR', 'FALSE', 'TRUE '],
  ['Frima', 'SSR', '', ''],
  ['Pepper', 'SSR', false, false],
  ['Rapi', 'SR', false, false],
  ['Rupee: Winter Shopper', 'SSR', true, false],
]

const ROWS = [
  ['2025-12-23', 150, 0, 1, 0, ''],
  ['2025-12-23', 0, 10, 10, 2, 'Alice, Frima'],
  ['2026-01-05', 3000, 5, 15, 1, 'Frima'],
  ['2026-02-01', 0, 20, 20, 0, ''],
  ['2026-03-01', 300, 29, 30, 1, 'Frima'],
  ['', '', '', '', '', ''],
]
const TIED = [
  ['2026-01-02', 300, 0, 1, 0, ''],
  ['2026-01-01', 300, 0, 1, 0, ''],
  ['2026-01-03', 0, 1, 1, 1, 'Alice'],
  ['2026-01-04', 0, 1, 1, 0, ''],
]
const DRY = [['2026-01-01', 0, 10, 10, 0, '']]
const ALICE_LAST = [['2026-01-01', 0, 10, 10, 1, 'Alice']]

const any = { range: 'any period' }
const gems = { ...any, currency: 'gems' }
const none = { range: 'in 2022' }

// [id, values, rows, expected]
const CASES: [string, Record<string, string>, unknown[][], string | null][] = [
  ['pulls', gems, ROWS, '3,450'],
  ['pulls', { ...any, currency: 'tickets' }, ROWS, '64'],
  ['pulls', { ...any, currency: 'pulls' }, ROWS, '76'],
  ['pulls', { ...none, currency: 'gems' }, ROWS, '0'],
  ['ssr', any, ROWS, '4'],
  ['ssr', any, DRY, '0'],
  ['luck', any, ROWS, '5.3 (4 of 76)'],
  ['luck', any, DRY, '0 (0 of 10)'],
  ['luck', none, ROWS, null],
  ['biggest-day', gems, ROWS, '3,000 (5 Jan 2026)'],
  ['biggest-day', { ...any, currency: 'pulls' }, ROWS, '30 (1 Mar 2026)'],
  ['biggest-day', gems, TIED, '300 (1 Jan 2026)'],
  ['biggest-day', gems, DRY, '0'],
  ['biggest-day', { ...none, currency: 'gems' }, ROWS, null],
  ['missing', {}, ROWS, '2'], // Noah, Pepper
  ['missing', {}, DRY, '4'],
  ['pilgrim-share', any, ROWS, '25 (1 of 4)'],
  ['pilgrim-share', { range: 'in 2026' }, ROWS, '0 (0 of 2)'],
  ['pilgrim-share', any, DRY, null],
  ['pilgrim-drought', {}, ROWS, '65'],
  ['pilgrim-drought', {}, ALICE_LAST, '0'],
  ['pilgrim-drought', {}, DRY, null],
  ['pilgrim-dry-run', any, ROWS, '65 (from 5 Jan 2026)'],
  ['pilgrim-dry-run', { range: 'in 2025' }, ROWS, '1 (from 23 Dec 2025)'],
  ['pilgrim-dry-run', any, TIED, '2 (from 1 Jan 2026)'],
  ['pilgrim-dry-run', any, ALICE_LAST, '0'],
  ['pilgrim-dry-run', none, ROWS, null],
  ['splurges', any, ROWS, '3'],
  ['splurges', any, DRY, '0'],
  ['last-splurge', {}, ROWS, '272 days (1 Mar 2026)'],
  ['last-splurge', {}, DRY, null],
  ['mileage-forgone', any, ROWS, '11'], // 3,450 / 300, rounded down
  ['mileage-forgone', any, DRY, '0'],
  ['gem-luck', any, ROWS, '4.3 (2 of 46)'],
  ['gem-luck', any, TIED.slice(0, 2), '0 (0 of 2)'],
  ['gem-luck', any, DRY, null],
]

describe('ordinary facts', () => {
  it.each(CASES)('ordinary-%s %o', (id, values, rows, expected) => {
    expect(compute(id, rows, values)).toBe(expected)
  })

  it('has no pool without NikkeDatabase rows, and 0 once all are pulled', () => {
    expect(compute('missing', ROWS, {}, [])).toBeNull()
    expect(compute('missing', ROWS, {}, DB.slice(0, 1))).toBe('0')
  })

  it('a splurge today is 0 days old', () => {
    expect(compute('last-splurge', ROWS, {}, DB, '2026-03-01')).toBe('0 days (1 Mar 2026)')
  })

  it('has all 12 facts in Pulls', () => {
    const facts = FACTS.filter((f) => f.id.startsWith('ordinary-'))
    expect(facts).toHaveLength(12)
    expect(facts.every((f) => f.category === 'Pulls')).toBe(true)
  })
})
