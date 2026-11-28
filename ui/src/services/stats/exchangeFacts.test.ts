import { describe, expect, it } from 'vitest'

import { FACTS } from './facts'

const fact = (id: string) => FACTS.find((f) => f.id === `exchange-${id}`)!
// Exchange: [date, nikke, source]
const compute = (id: string, rows: unknown[][], source?: string) =>
  fact(id).compute(
    {
      Exchange: {
        date: rows.map((r) => r[0]),
        nikke: rows.map((r) => r[1]),
        source: rows.map((r) => r[2]),
      },
    },
    source ? { source } : {},
    '2026-11-28',
  )

const ROWS = [
  ['2025-01-01', 'Sin', 'Liberation'],
  ['2025-01-11', 'Quency', 'Liberation'],
  ['2025-03-01', 'Frima', 'Gold Mileage'],
  ['2025-03-02', 'Biscuit', 'Silver Mileage'],
  ['2025-04-01', 'Guilty', 'Liberation'],
  ['2026-11-01', 'Frima', 'Gold Mileage'],
  ['2026-11-01', 'Sin', 'Union Chip'],
  ['2026-11-02', 'Sin', 'Bonus Recruit'],
  ['', '', ''],
]

describe('exchange facts', () => {
  it('longest-liberation-wait names the NIKKE that ended the wait', () => {
    expect(compute('longest-liberation-wait', ROWS)).toBe('80 days, ended by Guilty')
    expect(compute('longest-liberation-wait', ROWS.slice(0, 1))).toBeNull() // no wait yet
    expect(compute('longest-liberation-wait', [ROWS[2]])).toBeNull()
    const sameDay = [ROWS[0], ['2025-01-01', 'Quency', 'Liberation']]
    expect(compute('longest-liberation-wait', sameDay)).toBe('0 days, ended by Quency')
    const tied = [
      ['2025-01-21', 'Guilty', 'Liberation'],
      ['2025-01-01', 'Sin', 'Liberation'],
      ['2025-01-11', 'Quency', 'Liberation'],
    ]
    expect(compute('longest-liberation-wait', tied)).toBe('10 days, ended by Quency')
  })

  it('most-exchanged-nikke counts one copy per row', () => {
    expect(compute('most-exchanged-nikke', ROWS, 'any exchange')).toBe('Sin, 3 copies')
    expect(compute('most-exchanged-nikke', ROWS, 'Gold Mileage')).toBe('Frima, 2 copies')
    expect(compute('most-exchanged-nikke', ROWS, 'Union Chip')).toBe('Sin, 1 copy')
    expect(compute('most-exchanged-nikke', ROWS.slice(0, 2), 'Bonus Recruit')).toBeNull()
    // tie: earliest row, not earliest date; an undated row is still a copy
    const tied = [ROWS[3], ROWS[2]]
    expect(compute('most-exchanged-nikke', tied, 'any exchange')).toBe('Biscuit, 1 copy')
    const undated = [...tied, ['', 'Frima', 'Gold Mileage']]
    expect(compute('most-exchanged-nikke', undated, 'any exchange')).toBe('Frima, 2 copies')
  })

  it('longest-mileage-saving counts the stretch still running', () => {
    expect(compute('longest-mileage-saving', ROWS, 'Gold Mileage')).toBe(
      '610 days, from 1 Mar 2025',
    )
    // only one Silver row: the running stretch is the answer
    expect(compute('longest-mileage-saving', ROWS, 'Silver Mileage')).toBe(
      '636 days, from 2 Mar 2025',
    )
    expect(compute('longest-mileage-saving', [ROWS[0]], 'Gold Mileage')).toBeNull()
    const today = [['2026-11-28', 'Frima', 'Gold Mileage']]
    expect(compute('longest-mileage-saving', today, 'Gold Mileage')).toBe(
      '0 days, from 28 Nov 2026',
    )
    const tied = [
      ['2026-11-08', 'Frima', 'Gold Mileage'],
      ['2026-11-18', 'Frima', 'Gold Mileage'],
    ]
    expect(compute('longest-mileage-saving', tied, 'Gold Mileage')).toBe('10 days, from 8 Nov 2026')
  })

  it('has all 3 facts in Pulls with an "Exchanged with" source filter', () => {
    const facts = FACTS.filter((f) => f.id.startsWith('exchange-'))
    expect(facts).toHaveLength(3)
    expect(facts.every((f) => f.category === 'Pulls')).toBe(true)
    expect(facts.flatMap((f) => f.filters ?? []).map((f) => f.label)).toEqual([
      'Exchanged with',
      'Exchanged with',
    ])
  })
})
