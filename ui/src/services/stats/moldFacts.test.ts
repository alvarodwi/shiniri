import { describe, expect, it } from 'vitest'

import { FACTS, fillQuestion } from './facts'

const fact = (id: string) => FACTS.find((f) => f.id === id)!
// Mold: [date, moldType, pulls, totalSsr, ssrDetails]; NikkeDatabase: [nikke, rarity, limited]
const compute = (
  id: string,
  rows: unknown[][],
  values: Record<string, string> = {},
  db = DB,
  today = '2026-11-28',
) =>
  fact(`mold-${id}`).compute(
    {
      Mold: {
        date: rows.map((r) => r[0]),
        moldType: rows.map((r) => r[1]),
        pulls: rows.map((r) => r[2]),
        totalSsr: rows.map((r) => r[3]),
        ssrDetails: rows.map((r) => r[4]),
      },
      NikkeDatabase: {
        nikke: db.map((r) => r[0]),
        rarity: db.map((r) => r[1]),
        limited: db.map((r) => r[2]),
      },
    },
    values,
    today,
  )

const DB: unknown[][] = [
  ['Alice', 'SSR', false],
  ['Noah', 'SSR', 'FALSE'],
  ['Rapi', 'SR', false],
  ['Rupee: Winter Shopper', 'SSR', true],
]

const ROWS = [
  ['2026-01-01', 'Elysion Mold', 2, 2, 'Frima, Frima'],
  ['2026-01-01', 'Purple Mold', 4, 0, ''],
  ['2026-01-01', 'Tetra Mold', 1, 1, 'Frima'],
  ['2026-01-05', 'HQ Perfect Mold', 1, 1, 'Alice'],
  ['2026-01-05', 'HQ Mold', 5, 0, ''],
  ['2026-02-01', 'Yellow Mold', 2, 1, 'Frima'],
  ['2026-02-01', 'Missilis Mold', 3, 0, ''],
  ['2026-03-01', 'Elysion Mold', 3, 1, 'Frima'], // mixed
  ['2026-03-02', 'Elysion Mold', 2, 0, ''],
  ['2026-03-02', 'Pilgrim Mold', 0, 0, ''], // nothing opened
  ['', '', '', '', ''],
]
// Perfect molds only
const PERFECT = [['2026-01-01', 'Tetra Perfect Mold', 2, 2, 'Alice, Noah']]
// three straight wins, one day
const WINS = [['2026-01-01', 'Tetra Mold', 3, 3, 'a, b, c']]
// equal best runs on two days
const TIED = [
  ['2026-01-02', 'Tetra Mold', 3, 0, ''],
  ['2026-01-01', 'Elysion Mold', 3, 3, 'a, b, c'],
  ['2026-01-03', 'Elysion Mold', 3, 3, 'a, b, c'],
  ['2026-01-04', 'Tetra Mold', 3, 0, ''],
]

const any = { range: 'any period' }
const all = { ...any, mold: 'any mold' }
const plain = { ...any, mold: 'any non-Perfect mold' }
const maker = { ...any, maker: 'any manufacturer' }
const elysion = { ...any, maker: 'Elysion' }
const win = { ...any, result: 'win' }
const lose = { ...any, result: 'lose' }
const none = 'in 2022'

// [id, values, rows, expected]
const CASES: [string, Record<string, string>, unknown[][], string | null][] = [
  ['opened', all, ROWS, '23'],
  ['opened', plain, ROWS, '22'],
  ['opened', { ...any, mold: 'Perfect' }, ROWS, '1'],
  ['opened', { ...any, mold: 'HQ' }, ROWS, '7'],
  ['opened', { ...any, mold: 'manufacturer' }, ROWS, '11'],
  ['opened', { ...all, range: none }, ROWS, '0'],
  ['ssr', all, ROWS, '6'],
  ['ssr', { ...any, mold: 'Purple' }, ROWS, '0'],
  ['luck', { ...any, mold: 'Elysion' }, ROWS, '42.9 (3 of 7), expected 50'],
  ['luck', { ...any, mold: 'Purple' }, ROWS, '0 (0 of 4), expected 21'],
  ['luck', plain, PERFECT, null],
  ['biggest-day', any, ROWS, '7 (1 Jan 2026)'],
  ['biggest-day', any, TIED, '3 (1 Jan 2026)'],
  ['biggest-day', { range: none }, ROWS, null],
  ['bust-run', plain, ROWS, '5 (from 5 Jan 2026)'], // an SSR row breaks the run
  ['bust-run', { ...any, mold: 'Purple' }, ROWS, '4 (from 1 Jan 2026)'],
  ['bust-run', { ...any, mold: 'HQ' }, ROWS, '5 (from 5 Jan 2026)'],
  ['bust-run', plain, TIED, '3 (from 2 Jan 2026)'],
  ['bust-run', plain, WINS, '0'],
  ['bust-run', plain, PERFECT, null],
  ['current-bust', plain, ROWS, '2'],
  ['current-bust', { mold: 'HQ' }, ROWS, '0'],
  ['current-bust', { mold: 'Purple' }, ROWS, null],
  ['ssr-wait', {}, ROWS, '31 days, from 1 Jan 2026'],
  ['ssr-wait', {}, TIED, '2 days, from 1 Jan 2026'],
  ['ssr-wait', {}, WINS, null],
  ['hoard', {}, ROWS, '271 days, from 2 Mar 2026'], // still going
  ['hoard', {}, [], null],
  ['missing', {}, ROWS, '1'], // Noah
  ['missing', {}, PERFECT, '0'],
  ['win-streak', maker, ROWS, '3 (from 1 Jan 2026)'],
  ['win-streak', elysion, ROWS, '2 (from 1 Jan 2026)'],
  ['win-streak', maker, TIED, '3 (from 1 Jan 2026)'],
  ['win-streak', { ...any, maker: 'Missilis' }, ROWS, '0'],
  ['win-streak', { ...any, maker: 'Pilgrim' }, ROWS, null],
  ['loss-streak', maker, ROWS, '3 (from 1 Feb 2026)'], // the mixed row ends it
  ['loss-streak', maker, TIED, '3 (from 2 Jan 2026)'],
  ['loss-streak', maker, WINS, '0'],
  ['loss-streak', maker, PERFECT, null],
  ['current-streak', { maker: 'any manufacturer' }, ROWS, 'losing, 2 in a row'],
  ['current-streak', { maker: 'Tetra' }, ROWS, 'winning, 1 in a row'],
  ['current-streak', { maker: 'Elysion' }, ROWS.slice(0, 8), '0 (the last sitting was mixed)'],
  ['current-streak', { maker: 'Pilgrim' }, ROWS, null],
  ['luckiest-maker', any, ROWS, 'Tetra, 100% (1 of 1)'],
  ['luckiest-maker', any, TIED, 'Elysion, 100% (6 of 6)'],
  ['luckiest-maker', any, [ROWS[6]], 'Missilis, 0% (0 of 3)'],
  ['luckiest-maker', any, PERFECT, null],
  ['hq-pity', {}, ROWS, '1 (10 of 50 shards toward the next)'], // 5 x 12
  ['hq-pity', {}, [['2026-01-01', 'HQ Mold', 2, 0, '']], '0 (24 of 50 shards toward the next)'],
  ['hq-pity', {}, WINS, null],
  ['vs-odds', { ...any, mold: 'Elysion' }, ROWS, '-0.5 (3 against 3.5 expected)'],
  ['vs-odds', plain, WINS, '+1.5 (3 against 1.5 expected)'],
  ['vs-odds', plain, PERFECT, null],
  ['packed-session', plain, ROWS, '2 (1 Jan 2026)'],
  ['packed-session', { ...any, mold: 'Purple' }, ROWS, '0'],
  ['packed-session', plain, PERFECT, null],
  ['sweeps', win, ROWS, '1'], // 1 Jan: 2 Elysion + 1 Tetra
  ['sweeps', lose, ROWS, '1'], // 1 Feb; 2 Mar has only 2 opens
  ['sweeps', win, TIED, '2'],
  ['sweeps', win, PERFECT, '0'],
  ['perfect-share', any, ROWS, '16.7 (1 of 6)'],
  ['perfect-share', any, WINS, '0 (0 of 3)'],
  ['perfect-share', { range: none }, ROWS, null],
]

describe('mold facts', () => {
  it.each(CASES)('mold-%s %o', (id, values, rows, expected) => {
    expect(compute(id, rows, values)).toBe(expected)
  })

  it('has no pool without NikkeDatabase rows', () => {
    expect(compute('missing', ROWS, {}, [])).toBeNull()
  })

  it('words the any options for the question', () => {
    const q = (id: string, v: Record<string, string>) => fillQuestion(fact(`mold-${id}`), v)
    expect(q('opened', all)).toBe('How many molds did I open?')
    expect(q('opened', plain)).toBe('How many non-Perfect molds did I open?')
    expect(q('win-streak', maker)).toBe("What is the most 50/50s I've won in a row?")
  })

  it('has all 18 facts in Pulls', () => {
    const facts = FACTS.filter((f) => f.id.startsWith('mold-'))
    expect(facts).toHaveLength(18)
    expect(facts.every((f) => f.category === 'Pulls')).toBe(true)
  })
})
