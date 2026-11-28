import { describe, expect, it } from 'vitest'

import { FACTS, fillQuestion } from './facts'

const fact = (id: string) => FACTS.find((f) => f.id === `spending-${id}`)!
// Spending: [date, packageName, type, priceIdr, priceUsd, platform]
const compute = (
  id: string,
  rows: unknown[][],
  values: Record<string, string> = {},
  today = '2026-11-28',
) =>
  fact(id).compute(
    {
      Spending: {
        date: rows.map((r) => r[0]),
        packageName: rows.map((r) => r[1]),
        type: rows.map((r) => r[2]),
        priceIdr: rows.map((r) => r[3]),
        priceUsd: rows.map((r) => r[4]),
        platform: rows.map((r) => r[5]),
      },
    },
    values,
    today,
  )

const ROWS = [
  ['2025-01-05', '30-day supply', 'Monthly Pass', 75000, 5, 'Apple'],
  ['2025-01-05', 'Sin Costume', 'Costume', 300000, 20, 'Apple'],
  ['2025-03-01', 'Rapi: Red Hood Costume Gacha', 'Costume Gacha', 500000, 40, 'Apple'],
  ['2026-11-01', 'Sin Event Pass (November)', 'Event Pass', 320000, 20, 'GooglePlay'],
  ['2026-11-08', 'Anis Mission Pass (November)', 'Mission Pass', 160000, 10, 'Apple'],
  ['', '', '', '', '', ''],
]
const any = { type: 'any type', range: 'any period' }
const all = { range: 'any period' }
const of = (type: string, range = 'any period') => ({ type, range })

describe('spending facts', () => {
  it('total adds both currencies', () => {
    expect(compute('total', ROWS, any)).toBe('Rp1,355,000 ($95.00)')
    expect(compute('total', ROWS, of('any type', 'in 2025'))).toBe('Rp875,000 ($65.00)')
    expect(compute('total', ROWS, of('Event Pass'))).toBe('Rp320,000 ($20.00)')
    expect(compute('total', ROWS, of('Music Pack'))).toBe('Rp0 ($0.00)')
  })

  it('daily divides by the days since launch, both ends counted', () => {
    expect(compute('daily', ROWS.slice(0, 1), {}, '2022-11-08')).toBe('Rp15,000 ($1.00)')
    expect(compute('daily', [], {})).toBeNull()
  })

  it('count counts rows', () => {
    expect(compute('count', ROWS, any)).toBe('5')
    expect(compute('count', ROWS, of('Costume'))).toBe('1')
    expect(compute('count', ROWS, of('Music Pack'))).toBe('0')
  })

  it('share is by rupiah within the range', () => {
    expect(compute('share', ROWS, of('Costume Gacha', 'in 2025'))).toBe('57')
    expect(compute('share', ROWS, of('Music Pack'))).toBe('0')
    expect(compute('share', ROWS, of('Costume', 'in 2024'))).toBeNull()
  })

  it('priciest names the purchase, earliest row on a tie', () => {
    expect(compute('priciest', ROWS, any)).toBe('Rapi: Red Hood Costume Gacha, Rp500,000 ($40.00)')
    expect(compute('priciest', ROWS, of('Music Pack'))).toBeNull()
    const tied = [ROWS[1], ['2024-01-01', 'Late Costume', 'Costume', 300000, 20, 'Apple']]
    expect(compute('priciest', tied, any)).toBe('Sin Costume, Rp300,000 ($20.00)')
  })

  it('worst-month and worst-day group by date, earliest on a tie', () => {
    expect(compute('worst-month', ROWS)).toBe('Mar 2025, Rp500,000 ($40.00)')
    expect(compute('worst-day', ROWS)).toBe('1 Mar 2025, Rp500,000 ($40.00)')
    expect(compute('worst-day', ROWS.slice(0, 2))).toBe('5 Jan 2025, Rp375,000 ($25.00)')
    const tied = [ROWS[3], ['2025-02-02', 'x Costume', 'Costume', 320000, 20, 'Apple']]
    expect(compute('worst-month', tied)).toBe('Feb 2025, Rp320,000 ($20.00)')
    expect(compute('worst-day', tied)).toBe('2 Feb 2025, Rp320,000 ($20.00)')
    expect(compute('worst-month', [])).toBeNull()
    expect(compute('worst-day', [])).toBeNull()
  })

  it('since-last counts from the latest purchase of the type', () => {
    expect(compute('since-last', ROWS, { type: 'any type' })).toBe('20')
    expect(compute('since-last', ROWS, { type: 'Event Pass' })).toBe('27')
    expect(compute('since-last', ROWS, { type: 'any type' }, '2026-11-08')).toBe('0')
    expect(compute('since-last', ROWS, { type: 'Music Pack' })).toBeNull()
  })

  it('dry-spell includes the current stretch', () => {
    expect(compute('dry-spell', ROWS, { type: 'any type' })).toBe('610 days, from 1 Mar 2025')
    expect(compute('dry-spell', ROWS, { type: 'Monthly Pass' })).toBe('692 days, from 5 Jan 2025')
    expect(compute('dry-spell', ROWS, { type: 'Music Pack' })).toBeNull()
    expect(compute('dry-spell', ROWS.slice(0, 1), { type: 'any type' }, '2025-01-05')).toBe(
      '0 days, from 5 Jan 2025',
    )
    const tied = [['2026-11-08'], ['2026-11-18']].map(([d]) => [d, 'x', 'Costume', 1, 1, 'Apple'])
    expect(compute('dry-spell', tied, { type: 'Costume' })).toBe('10 days, from 8 Nov 2026')
  })

  it('pass-lapse stacks passes and counts uncovered days through today', () => {
    const pass = (day: string) => [day, '30-day supply', 'Monthly Pass', 1, 1, 'Apple']
    // covers 1 Jan to 30 Jan
    expect(compute('pass-lapse', [pass('2026-01-01')], {}, '2026-01-30')).toBe('0')
    expect(compute('pass-lapse', [pass('2026-01-01')], {}, '2026-01-31')).toBe('1')
    // stacked: 60 days from 1 Jan, then a gap of 3 before the next
    const rows = [pass('2026-01-05'), pass('2026-01-01'), pass('2026-03-05')]
    expect(compute('pass-lapse', rows, {}, '2026-03-05')).toBe('3')
    expect(compute('pass-lapse', ROWS.slice(1))).toBeNull()
  })

  it('inflation compares the latest rate with the cheapest on the platform', () => {
    expect(compute('inflation', ROWS, { platform: 'Apple' })).toBe('28') // 16,000 over 12,500
    expect(compute('inflation', ROWS, { platform: 'GooglePlay' })).toBe('0')
    expect(compute('inflation', ROWS, { platform: 'RazerGold' })).toBeNull()
    expect(fact('inflation').filters![0].options).toBeTypeOf('function')
  })

  it('costume-total and costume-average count the four costume types', () => {
    expect(compute('costume-total', ROWS, all)).toBe('Rp1,280,000 ($90.00)')
    expect(compute('costume-total', ROWS.slice(0, 1), all)).toBe('Rp0 ($0.00)')
    expect(compute('costume-average', ROWS, all)).toBe('Rp320,000 ($22.50)')
    expect(compute('costume-average', ROWS.slice(0, 1), all)).toBeNull()
  })

  it('victim sums per NIKKE named before the type', () => {
    expect(compute('victim', ROWS, all)).toBe('Sin, Rp620,000 ($40.00)')
    expect(compute('victim', ROWS.slice(0, 1), all)).toBeNull()
    const tied = [ROWS[2], ['2025-01-01', 'Anis Costume', 'Costume', 500000, 40, 'Apple']]
    expect(compute('victim', tied, all)).toBe('Rapi: Red Hood, Rp500,000 ($40.00)')
  })

  it('has all 14 facts in Spending with the type wording', () => {
    const facts = FACTS.filter((f) => f.id.startsWith('spending-'))
    expect(facts).toHaveLength(14)
    expect(facts.every((f) => f.category === 'Spending')).toBe(true)
    const q = (id: string) => fillQuestion(fact(id), of('any type'))
    expect(q('total')).toBe('How much have I spent on anything?')
    expect(q('count')).toBe('How many purchases have I made?')
    expect(q('since-last')).toBe('How many days since my last purchase?')
    expect(q('dry-spell')).toBe("What's the longest I've gone without buying anything?")
    expect(fact('total').filters![0].label).toBe('Purchase type')
  })
})
