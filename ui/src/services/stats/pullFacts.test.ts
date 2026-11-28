import { describe, expect, it } from 'vitest'

import { FACTS, fillQuestion } from './facts'
import type { Values } from './facts'

const TODAY = '2026-11-28'
const fact = (id: string) => FACTS.find((f) => f.id === id)!

// Columns by name, from rows in header order.
const table = (headers: string, rows: unknown[][]) =>
  Object.fromEntries(headers.split(' ').map((h, i) => [h, rows.map((r) => r[i])]))

type Tabs = Partial<
  Record<
    'social' | 'event' | 'ordinary' | 'mold' | 'all' | 'exchange' | 'extra' | 'overcore' | 'db',
    unknown[][]
  >
>
const columns = (t: Tabs) => ({
  Social: table('date pulls totalSsr', t.social ?? []),
  Event: table('date pulls tickets totalSsr rateUpName gems ssrDetails', t.event ?? []),
  Ordinary: table('date pulls tickets totalSsr', t.ordinary ?? []),
  Mold: table('date moldType pulls totalSsr', t.mold ?? []),
  AllPulls: table('date nikke source', t.all ?? []),
  Exchange: table('date nikke source', t.exchange ?? []),
  Extra: table('date source rateUpName ssrDetails', t.extra ?? []),
  Overcore: table('date nikke', t.overcore ?? []),
  NikkeDatabase: table(
    'nikke rarity manufacturer class burst element weapon releaseDate',
    t.db ?? [],
  ),
})
// Only what the fact declares, as the loader would give it.
const compute = (id: string, tabs: Tabs, values: Values = {}, today = TODAY) => {
  const all: Record<string, Record<string, unknown[]>> = columns(tabs)
  const declared = Object.fromEntries(
    fact(id).reads.map(({ tab, columns: names }) => [
      tab.tab,
      Object.fromEntries(names.map((n) => [n, all[tab.tab][n]])),
    ]),
  )
  return fact(id).compute(declared, values, today)
}

describe('per-source session facts', () => {
  // [date, pulls, tickets, totalSsr]
  const ordinary = [
    ['2025-01-01', 10, 10, 1],
    ['2025-01-03', 20, 5, 0],
    ['2025-01-03', 5, 5, 0],
    ['2025-01-10', 4, 0, 2],
    ['2025-01-11', 25, 25, 0],
    ['2025-01-12', 8, 8, 2],
    ['2025-01-13', 25, 25, 0],
    ['', '', '', ''],
  ]
  const o = { source: 'Ordinary' }

  it('biggest-day sums the three pull sources per day', () => {
    const tabs = {
      social: [['2025-01-01', 10, 0]],
      event: [['2025-01-01', 30]],
      ordinary: [['2025-01-02', 40, 0, 0]],
    }
    // a tie goes to the earliest day
    expect(compute('pulls-biggest-day', tabs)).toBe('40 (1 Jan 2025)')
    expect(compute('pulls-biggest-day', tabs, { range: 'in 2022' })).toBeNull()
    expect(compute('pulls-biggest-day', { social: [['2025-01-01', 0, 0]] })).toBe('0')
  })

  it('longest-dry-run adds whole SSR-less sessions, tie to the earliest', () => {
    expect(compute('pulls-longest-dry-run', { ordinary }, o)).toBe('25 (from 3 Jan 2025)')
    expect(compute('pulls-longest-dry-run', { ordinary: [ordinary[0]] }, o)).toBe('0')
    expect(compute('pulls-longest-dry-run', {}, o)).toBeNull()
  })

  it('current-dry-run counts pulls since the last SSR', () => {
    expect(compute('pulls-current-dry-run', { ordinary }, o)).toBe('25')
    expect(compute('pulls-current-dry-run', { ordinary: [ordinary[0]] }, o)).toBe('0')
    expect(compute('pulls-current-dry-run', { ordinary: [ordinary[1]] }, o)).toBeNull()
  })

  it('longest-ssr-wait and longest-hoard include the stretch still running', () => {
    const tabs = {
      social: [
        ['2026-11-01', 5, 1],
        ['2026-11-03', 5, 0],
        ['2026-11-11', 5, 1],
      ],
    }
    const s = { source: 'Social' }
    expect(compute('pulls-longest-ssr-wait', tabs, s)).toBe('17 days, from 11 Nov 2026')
    expect(compute('pulls-longest-hoard', tabs, s)).toBe('17 days, from 11 Nov 2026')
    expect(compute('pulls-longest-ssr-wait', {}, s)).toBeNull()
    expect(compute('pulls-longest-hoard', {}, s)).toBeNull()
    expect(compute('pulls-longest-hoard', { social: [[TODAY, 5, 0]] }, s)).toBe(
      '0 days, from 28 Nov 2026',
    )
  })

  it('longest-ssr-wait and longest-hoard give a tie to the earliest', () => {
    const tabs = {
      social: [
        ['2026-11-08', 5, 1],
        ['2026-11-18', 5, 1],
      ],
    }
    const s = { source: 'Social' }
    for (const id of ['pulls-longest-ssr-wait', 'pulls-longest-hoard'])
      expect(compute(id, tabs, s)).toBe('10 days, from 8 Nov 2026')
  })

  it('surprise-packages counts days under 10 pulls with an SSR', () => {
    expect(compute('pulls-surprise-packages', { ordinary }, o)).toBe('2')
    expect(compute('pulls-surprise-packages', { ordinary: [ordinary[0]] }, o)).toBe('0')
  })

  it('payment-share splits pulls into tickets and the rest', () => {
    const tabs = { ordinary: [['2025-01-01', 20, 5, 0]] }
    expect(compute('pulls-payment-share', tabs, { ...o, payment: 'gems' })).toBe('75 (15 of 20)')
    expect(compute('pulls-payment-share', tabs, { ...o, payment: 'tickets' })).toBe('25 (5 of 20)')
    expect(compute('pulls-payment-share', {}, { ...o, payment: 'gems' })).toBeNull()
  })

  it('packed-session is the most SSRs of one row, tie to the earliest', () => {
    expect(compute('pulls-packed-session', { ordinary }, o)).toBe('2 (10 Jan 2025)')
    expect(compute('pulls-packed-session', { ordinary: [ordinary[1]] }, o)).toBe('0')
    expect(compute('pulls-packed-session', {}, o)).toBeNull()
  })

  it('words the source in lower case', () => {
    const f = fact('pulls-longest-hoard')
    expect(fillQuestion(f, { source: 'Event' })).toBe(
      "What is the longest I've gone without any event pull?",
    )
  })

  it('vs-odds compares SSRs with each source odds, Perfect molds left out', () => {
    const tabs = {
      social: [['2025-01-01', 100, 3]], // expects 2
      event: [['2025-01-01', 100, 0, 5]], // expects 4
      ordinary: [['2025-01-01', 50, 0, 1]], // expects 2
      mold: [
        ['2025-01-01', 'Purple Mold', 10, 3], // expects 2.1
        ['2025-01-01', 'HQ Perfect Mold', 4, 4],
      ],
    }
    expect(compute('pulls-vs-odds', tabs)).toBe('+1.9 (12 against 10.1 expected)')
    expect(compute('pulls-vs-odds', { social: [['2025-01-01', 100, 2]] })).toBe(
      '0 (2 against 2 expected)',
    )
    expect(compute('pulls-vs-odds', tabs, { range: 'in 2022' })).toBeNull()
  })
})

describe('AllPulls facts', () => {
  const all = [
    ['2025-01-01', 'Frima', 'Social'],
    ['2025-01-01', 'Frima', 'Event'],
    ['2025-01-01', 'Noah', 'Exchange'],
    ['2025-01-01', 'Noah', 'Extra'],
    ['2025-01-02', 'Noah', 'Mold'],
    ['2025-01-02', 'Noah', 'Ordinary'],
    ['2025-01-02', 'Alice', 'Event'],
    ['', '', ''],
  ]
  const db = [
    ['Frima', 'SSR', 'TETRA', 'Supporter', 'Step1', 'Water', 'RL', '2023-01-01'],
    ['Noah', 'SSR', 'PILGRIM', 'Defender', 'Step2', 'Electronic', 'RL', '2023-01-01'],
    ['Alice', 'SSR', 'TETRA', 'Attacker', 'Step3', 'Fire', 'SR', '2025-02-01'],
  ]
  const any = { source: 'any source' }

  it('best-day leaves Exchange and Extra out', () => {
    expect(compute('pulls-best-day', { all }, any)).toBe('3 (2 Jan 2025)')
    expect(compute('pulls-best-day', { all: all.slice(0, 5) }, any)).toBe('2 (1 Jan 2025)')
    expect(compute('pulls-best-day', { all }, { source: 'Event' })).toBe('1 (1 Jan 2025)')
    expect(compute('pulls-best-day', {}, any)).toBeNull()
    expect(fact('pulls-best-day').title).toBe('Luckiest day')
  })

  it('best-day, main-supplier and every-road give a tie to the earliest', () => {
    const tied = [
      ['2025-01-02', 'Noah', 'Event'],
      ['2025-01-02', 'Noah', 'Mold'],
      ['2025-01-01', 'Frima', 'Social'],
      ['2025-01-01', 'Frima', 'Ordinary'],
    ]
    expect(compute('pulls-best-day', { all: tied }, any)).toBe('2 (1 Jan 2025)')
    expect(compute('pulls-main-supplier', { all: tied })).toBe('Social, 1 SSR')
    expect(compute('pulls-every-road', { all: tied })).toBe('Frima, 2 sources')
  })

  it('nikke-count and last-visit follow the source, any counting all six', () => {
    const noah = { ...any, nikke: 'Noah' }
    expect(compute('pulls-nikke-count', { all }, noah)).toBe('4')
    expect(compute('pulls-nikke-count', { all }, { source: 'Social', nikke: 'Noah' })).toBe('0')
    expect(compute('pulls-last-visit', { all }, noah)).toBe('2 Jan 2025')
    expect(compute('pulls-last-visit', { all }, { source: 'Social', nikke: 'Noah' })).toBeNull()
  })

  it('frequent breaks a tie to the earliest row', () => {
    expect(compute('pulls-frequent', { all }, any)).toBe('Noah, 4 copies')
    expect(compute('pulls-frequent', { all }, { source: 'Event' })).toBe('Frima, 1 copy')
    expect(compute('pulls-frequent', {}, any)).toBeNull()
  })

  it('trait-count and top-trait use display labels', () => {
    const tabs = { all, db }
    expect(compute('pulls-trait-count', tabs, { ...any, trait: 'Tetra' })).toBe('3')
    expect(compute('pulls-trait-count', tabs, { ...any, trait: 'Electric' })).toBe('4')
    expect(compute('pulls-trait-count', tabs, { source: 'Social', trait: 'Electric' })).toBe('0')
    expect(compute('pulls-top-trait', tabs, { ...any, attribute: 'burst' })).toBe(
      'Burst II, 4 copies',
    )
    expect(compute('pulls-top-trait', tabs, { source: 'Event', attribute: 'class' })).toBe(
      'Supporter, 1 copy',
    )
    expect(compute('pulls-top-trait', { db }, { ...any, attribute: 'class' })).toBeNull()
  })

  it('offers the traits of pulled NIKKE only', () => {
    const [trait] = fact('pulls-trait-count').filters!
    const options = trait.options as (c: unknown) => string[]
    const got = options(columns({ all: [all[0]], db }))
    expect(got).toEqual(['Tetra', 'Supporter', 'Burst I', 'Water', 'RL'])
  })

  it('main-supplier names the source with the most SSRs', () => {
    expect(compute('pulls-main-supplier', { all })).toBe('Event, 2 SSRs')
    expect(compute('pulls-main-supplier', {})).toBeNull()
  })

  it('every-road counts distinct sources', () => {
    expect(compute('pulls-every-road', { all })).toBe('Noah, 4 sources')
    expect(compute('pulls-every-road', { all: all.slice(0, 3) })).toBe('Frima, 2 sources')
    expect(compute('pulls-every-road', {})).toBeNull()
  })

  it('twins counts days with a repeat among chance sources', () => {
    expect(compute('pulls-twins', { all })).toBe('2')
    expect(compute('pulls-twins', { all: all.slice(2, 4) })).toBe('0')
  })

  it('on-this-day lists names on that exact date', () => {
    const tabs = {
      all: [
        ['2025-11-28', 'Noah', 'Social'],
        ['2025-11-28', 'Frima', 'Extra'],
        ['2025-11-28', 'Noah', 'Mold'],
        ['2024-11-28', 'Alice', 'Mold'],
        ['2026-10-28', 'Rapi', 'Mold'],
      ],
    }
    expect(compute('pulls-on-this-day', tabs, { ago: '1 year ago' })).toBe('Noah ×2, Frima')
    expect(compute('pulls-on-this-day', tabs, { ago: '2 years ago' })).toBe('Alice')
    expect(compute('pulls-on-this-day', tabs, { ago: '1 month ago' })).toBe('Rapi')
    expect(compute('pulls-on-this-day', {}, { ago: '1 month ago' })).toBeNull()
    // there is no 31 February
    const feb = { all: [['2026-03-03', 'Noah', 'Mold']] }
    expect(compute('pulls-on-this-day', feb, { ago: '1 month ago' }, '2026-03-31')).toBeNull()
  })

  it('found-me counts skipped NIKKE arriving by chance or free', () => {
    const event = [['2025-01-01', 1, 0, 0, 'Dorothy']]
    const late = [
      ['Alice', 'SSR', '', '', '', '', '', '2025-02-01'],
      ['Old', 'SSR', '', '', '', '', '', '2024-01-01'],
      ['Dorothy', 'SSR', '', '', '', '', '', '2025-03-01'],
      ['Chosen', 'SSR', '', '', '', '', '', '2025-02-01'],
      ['Spooky', 'SSR', '', '', '', '', '', '2025-02-01'],
    ]
    const got = [
      ['2025-04-01', 'Alice', 'Mold'],
      ['2025-04-01', 'Alice', 'Social'],
      ['2025-04-01', 'Old', 'Social'],
      ['2025-04-01', 'Dorothy', 'Social'],
      ['2025-04-01', 'Chosen', 'Exchange'],
      ['2025-04-01', 'Spooky', 'Event'],
    ]
    expect(compute('pulls-found-me', { event, db: late, all: got })).toBe('1')
    expect(compute('pulls-found-me', { event, db: late })).toBe('0')
    expect(compute('pulls-found-me', { db: late, all: got })).toBeNull()
  })
})

describe('mileage facts', () => {
  // [date, pulls, tickets, totalSsr, rateUpName, gems, ssrDetails]
  const lost = (date: string, name: string) => [date, 10, 0, 0, name, 3000, '']
  const event = [
    lost('2025-01-01', 'Gold'),
    lost('2025-01-01', 'Free'),
    lost('2025-01-01', 'Late'),
    lost('2025-01-01', 'Chip'),
    ['2025-01-01', 10, 0, 1, 'Won', 3000, 'Won'],
  ]
  const exchange = [
    ['2025-01-31', 'Gold', 'Gold Mileage'], // 30 days after the last session
    ['2025-02-01', 'Late', 'Silver Mileage'],
    ['2025-01-05', 'Chip', 'Union Chip'],
    ['2025-01-05', 'Won', 'Gold Mileage'],
  ]
  const extra = [
    ['2025-01-02', 'Free Pulls', 'Free', 'Free'],
    ['2025-01-02', 'Welfare Unit', '', 'Chip'],
  ]

  it('rescued-chases counts failed chases that mileage or a free pull finished', () => {
    expect(compute('pulls-rescued-chases', { event, exchange, extra })).toBe('2')
    expect(compute('pulls-rescued-chases', { event })).toBe('0')
    expect(compute('pulls-rescued-chases', { event, exchange }, { range: 'in 2022' })).toBe('0')
  })

  it('sparks counts gold mileage exchanges', () => {
    expect(compute('pulls-sparks', { exchange })).toBe('2')
    expect(compute('pulls-sparks', { exchange }, { range: 'in 2022' })).toBe('0')
  })
})

describe('wasted exchange facts', () => {
  const exchange = [
    ['2025-01-01', 'Noah', 'Gold Mileage'],
    ['2025-02-01', 'Noah', 'Silver Mileage'],
    ['2025-03-01', 'Noah', 'Gold Mileage'], // after the overcores
    ['2025-01-01', 'Sin', 'Liberation'],
    ['2025-01-05', 'Alice', 'Union Chip'],
  ]
  const overcore = [
    ['2025-02-01', 'Noah'],
    ['2025-02-10', 'Noah'],
    ['2025-02-11', 'Noah'], // nothing left to pair with
    ['2025-02-10', 'Sin'],
    ['2025-02-10', 'Alice'],
  ]
  const tabs = { exchange, overcore }

  it('wasted pairs each overcore with one earlier exchange, then filters', () => {
    expect(compute('overcore-wasted', tabs, { source: 'any exchange' })).toBe('3')
    expect(compute('overcore-wasted', tabs, { source: 'Gold Mileage' })).toBe('1')
    expect(compute('overcore-wasted', tabs, { source: 'Bonus Recruit' })).toBe('0')
  })

  it('most-wasted names the NIKKE, tie to the earliest', () => {
    expect(compute('overcore-most-wasted', tabs)).toBe('Noah, 2 wasted exchanges')
    expect(
      compute('overcore-most-wasted', { exchange: [exchange[0], exchange[4]], overcore }),
    ).toBe('Noah, 1 wasted exchange')
    expect(compute('overcore-most-wasted', { exchange })).toBeNull()
  })
})

describe('combined pull facts', () => {
  it('has the 22 Pulls facts', () => {
    const own = FACTS.filter((f) => f.id.startsWith('pulls-'))
    expect(own).toHaveLength(22)
    expect(own.every((f) => f.category === 'Pulls')).toBe(true)
  })
})
