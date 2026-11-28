import { describe, expect, it } from 'vitest'

import { FACTS, fillQuestion } from './facts'
import type { Columns, Values } from './facts'

import { OVERCORE_LINES } from '@/config/overcoreLines'

const TODAY = '2026-11-28'
const fact = (id: string) => FACTS.find((f) => f.id === `overcore-${id}`)!
const line = (level: keyof typeof OVERCORE_LINES, who: string) =>
  OVERCORE_LINES[level][0]!.replace('{who}', who)

const HEADERS: Record<string, string[]> = {
  Overcore: ['date', 'source', 'nikke', 'notes'],
  Mold: ['date', 'moldType', 'ssrDetails'],
  Exchange: ['date', 'nikke', 'source'],
  NikkeDatabase: ['nikke', 'manufacturer', 'class', 'burst', 'element', 'weapon'],
}
type Tabs = Partial<Record<string, string[][]>>

const columns = (id: string, tabs: Tabs): Columns =>
  Object.fromEntries(
    fact(id).reads.map(({ tab, columns }) => [
      tab.tab,
      Object.fromEntries(
        columns.map((name) => [
          name,
          (tabs[tab.tab] ?? []).map((r) => r[HEADERS[tab.tab]!.indexOf(name)] ?? ''),
        ]),
      ),
    ]),
  )
const compute = (id: string, tabs: Tabs, values: Values = {}) =>
  fact(id).compute(columns(id, tabs), values, TODAY)

const over = (date: string, source: string, nikke: string, notes = '') => [
  date,
  source,
  nikke,
  notes,
]
const NikkeDatabase = [
  ['Rapi', 'Elysion', 'Attacker', 'Step3', 'Fire', 'AR'],
  ['Anis', 'Tetra', 'Supporter', 'Step1', 'Iron', 'RL'],
]

describe('overcore pain facts', () => {
  // Rapi: Social 1 + Gold Mileage 7. Anis: Event 3 + manufacturer mold 4.
  const tabs: Tabs = {
    Overcore: [
      over('2024-05-01', 'Social', 'Rapi'),
      over('2024-05-02', 'Event', 'Anis'),
      over('2024-06-01', 'Mold', 'Anis'),
      over('2024-07-01', 'Exchange', 'Rapi'),
    ],
    Mold: [['2024-06-01', 'Tetra Mold', 'Neon, Anis']],
    Exchange: [['2024-07-01', 'Rapi', 'Gold Mileage']],
  }
  const unmatched: Tabs = { ...tabs, Mold: [], Exchange: [] }
  const any = { source: 'any source' }

  it('sums pain levels in range', () => {
    expect(compute('pain-total', tabs)).toBe('15')
    expect(compute('pain-total', tabs, { range: 'in 2023' })).toBe('0')
    expect(compute('pain-total', unmatched)).toBeNull()
  })

  it('needs a match only for the rows in range', () => {
    expect(compute('pain-total', unmatched, { range: '2024-05-01..2024-05-31' })).toBe('4')
  })

  it('gives no answer when two matches disagree on the level', () => {
    const molds = [...tabs.Mold!, ['2024-06-01', 'Purple Mold', 'Anis']]
    expect(compute('pain-total', { ...tabs, Mold: molds })).toBeNull()
    const same = [...tabs.Mold!, ['2024-06-01', 'Elysion Mold', 'Anis']]
    expect(compute('pain-total', { ...tabs, Mold: same })).toBe('15')
  })

  it('ranks NIKKE and days by summed pain, ties to the earliest', () => {
    expect(compute('most-painful', tabs)).toBe('Rapi, 8 pain points')
    expect(compute('worst-day', tabs)).toBe('1 Jul 2024, 7 pain points')
    const tie = { Overcore: [over('2024-05-01', 'Social', 'A'), over('2024-05-02', 'Extra', 'B')] }
    expect(compute('most-painful', tie)).toBe('A, 1 pain point')
    expect(compute('worst-day', tie)).toBe('1 May 2024, 1 pain point')
    for (const id of ['most-painful', 'worst-day']) {
      expect(compute(id, {})).toBeNull()
      expect(compute(id, unmatched)).toBeNull()
    }
  })

  it("sore-spot answers with the level's line and the date", () => {
    expect(compute('sore-spot', tabs, any)).toBe(`${line(7, 'Rapi')} (1 Jul 2024)`)
    expect(compute('sore-spot', tabs, { source: 'Mold' })).toBe(`${line(4, 'Anis')} (1 Jun 2024)`)
    expect(compute('sore-spot', tabs, { source: 'Ordinary' })).toBeNull()
    expect(compute('sore-spot', unmatched, any)).toBeNull()
    const tie = { Overcore: [over('2024-05-01', 'Social', 'A'), over('2024-05-02', 'Extra', 'B')] }
    expect(compute('sore-spot', tie, any)).toBe(`${line(1, 'A')} (1 May 2024)`)
  })
})

describe('overcore record facts', () => {
  const tabs: Tabs = {
    Overcore: [
      over('2024-05-02', 'Event', 'Anis', 'ouch'),
      over('2024-08-30', 'Mold', 'Rapi'),
      over('2024-09-01', 'Event', 'Rapi', 'again'),
      over('2024-09-01', 'Social', 'Anis'),
    ],
    NikkeDatabase,
  }
  const all = { trait: 'any trait', source: 'any source' }

  it('counts by trait, source and range', () => {
    expect(compute('count', tabs, all)).toBe('4')
    expect(compute('count', tabs, { ...all, trait: 'Tetra', source: 'Event' })).toBe('1')
    expect(compute('count', tabs, { ...all, range: 'in 2023' })).toBe('0')
  })

  it('words its any options', () => {
    expect(fillQuestion(fact('count'), { ...all, range: 'any period' })).toBe(
      'How many overcores of NIKKE from any source have I had?',
    )
    expect(fillQuestion(fact('sore-spot'), { source: 'any source' })).toBe(
      'What was my most painful overcore?',
    )
  })

  it('repeat names the most overcored, ties to the earliest', () => {
    expect(compute('repeat', tabs, all)).toBe('Anis, 2 overcores')
    expect(compute('repeat', tabs, { trait: 'Elysion' })).toBe('Rapi, 2 overcores')
    expect(compute('repeat', {}, all)).toBeNull()
  })

  it('first names the earliest overcore with the trait', () => {
    expect(compute('first', tabs, all)).toBe('Anis, 2 May 2024')
    expect(compute('first', tabs, { trait: 'Attacker' })).toBe('Rapi, 30 Aug 2024')
    expect(compute('first', {}, all)).toBeNull()
  })

  it('blessed-streak is the longest gap, the running one included', () => {
    const closed = [over('2024-05-02', 'Event', 'A'), over('2024-08-30', 'Event', 'A')]
    expect(
      fact('blessed-streak').compute(
        columns('blessed-streak', { Overcore: closed }),
        {},
        '2024-09-01',
      ),
    ).toBe('120 (2 May 2024 to 30 Aug 2024)')
    expect(compute('blessed-streak', tabs)).toBe('818 (1 Sep 2024 to 28 Nov 2026)')
    expect(compute('blessed-streak', { Overcore: [over(TODAY, 'Event', 'A')] })).toBe('0')
    expect(compute('blessed-streak', {})).toBeNull()
  })

  it('days-of-peace counts from the latest overcore', () => {
    expect(compute('days-of-peace', tabs)).toBe('818')
    expect(compute('days-of-peace', { Overcore: [over(TODAY, 'Event', 'A')] })).toBe('0')
    expect(compute('days-of-peace', {})).toBeNull()
  })

  it('diary quotes the newest note, ties to the earliest row', () => {
    expect(compute('diary', tabs, { nikke: 'Rapi' })).toBe('again (1 Sep 2024)')
    expect(compute('diary', tabs, { nikke: 'Anis' })).toBe('ouch (2 May 2024)')
    expect(compute('diary', tabs, { nikke: 'Neon' })).toBeNull()
    const tie = [over('2024-05-01', 'Event', 'A', 'one'), over('2024-05-01', 'Event', 'A', 'two')]
    expect(compute('diary', { Overcore: tie }, { nikke: 'A' })).toBe('one (1 May 2024)')
  })

  it('diary offers only NIKKE with a note', () => {
    const options = fact('diary').filters![0]!.options as (c: Columns) => string[]
    const rows = [over('2024-05-01', 'Event', 'A'), over('2024-05-02', 'Event', 'B', 'x')]
    expect(options(columns('diary', { Overcore: rows }))).toEqual(['B'])
  })
})
