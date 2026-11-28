import { describe, expect, it } from 'vitest'

import { FACTS } from './facts'

const fact = (id: string) => FACTS.find((f) => f.id === `extra-${id}`)!
// Extra: [date, source, rateUpName, totalSsr, ssrDetails]
const compute = (id: string, rows: unknown[][], range?: string) =>
  fact(id).compute(
    {
      Extra: {
        date: rows.map((r) => r[0]),
        source: rows.map((r) => r[1]),
        rateUpName: rows.map((r) => r[2]),
        totalSsr: rows.map((r) => r[3]),
        ssrDetails: rows.map((r) => r[4]),
      },
    },
    range ? { range } : {},
    '2026-11-28',
  )

const ROWS = [
  ['2025-05-01', 'Free Pulls', 'Alice', 1, 'Alice'],
  ['2025-05-02', 'Free Pulls', 'Alice', 1, 'Noah'],
  ['2025-05-03', 'Welfare Unit', '', 1, 'Rapi'],
  ['2026-11-01', 'Welfare Pass', '', 1, 'Frima'],
  ['2026-11-02', 'Free Pulls', 'Sin', 1, 'Sin'],
  ['2026-11-03', 'Guaranteed SSR', '', 3, 'a, b, c'],
  ['2026-11-04', 'Guaranteed SSR', '', 1, 'd'],
  ['', '', '', '', ''],
]

describe('extra facts', () => {
  it('free-hits sums free pull SSRs in the range', () => {
    expect(compute('free-hits', ROWS)).toBe('3')
    expect(compute('free-hits', ROWS, 'in 2025')).toBe('2')
    expect(compute('free-hits', ROWS, 'in 2022')).toBe('0')
  })

  it('free-rate-ups counts free pulls that gave the rate-up', () => {
    expect(compute('free-rate-ups', ROWS)).toBe('2')
    expect(compute('free-rate-ups', [ROWS[1], ROWS[5]])).toBe('0')
    expect(compute('free-rate-ups', [['', 'Free Pulls', '', 1, '']])).toBe('0')
  })

  it('freebie-haul counts welfare copies only', () => {
    expect(compute('freebie-haul', ROWS)).toBe('2')
    expect(compute('freebie-haul', ROWS, 'this month')).toBe('1')
    expect(compute('freebie-haul', [ROWS[0]])).toBe('0')
  })

  it('bonus-guests counts SSRs beyond one per guaranteed recruit', () => {
    expect(compute('bonus-guests', ROWS)).toBe('2')
    expect(compute('bonus-guests', [ROWS[6]])).toBe('0')
    expect(compute('bonus-guests', [])).toBe('0')
  })

  it('has all 4 facts in Pulls', () => {
    const facts = FACTS.filter((f) => f.id.startsWith('extra-'))
    expect(facts.map((f) => f.title)).toEqual([
      'Free pull hits',
      'Free rate-ups',
      'Freebie haul',
      'Bonus guests',
    ])
    expect(facts.every((f) => f.category === 'Pulls')).toBe(true)
  })
})
