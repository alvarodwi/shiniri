import { describe, expect, it } from 'vitest'

import { FACTS, fillQuestion } from './facts'

const fact = (id: string) => FACTS.find((f) => f.id === `event-${id}`)!

// [date, rateUpName, rateUpType, gems, tickets, ssrDetails]; pulls and totalSsr are derived
type Row = [string, string, string, number, number, string]
// [nikke, rarity, limited, overspec, releaseDate]
type Db = unknown[][]
const columns = (rows: Row[], db: Db) => ({
  Event: {
    date: rows.map((r) => r[0]),
    rateUpName: rows.map((r) => r[1]),
    rateUpType: rows.map((r) => r[2]),
    gems: rows.map((r) => r[3]),
    tickets: rows.map((r) => r[4]),
    pulls: rows.map((r) => r[3] / 300 + r[4]),
    totalSsr: rows.map((r) => r[5].split(',').filter(Boolean).length),
    ssrDetails: rows.map((r) => r[5]),
  },
  NikkeDatabase: {
    nikke: db.map((r) => r[0]),
    rarity: db.map((r) => r[1]),
    limited: db.map((r) => r[2]),
    overspec: db.map((r) => r[3]),
    releaseDate: db.map((r) => r[4]),
  },
})
const compute = (id: string, rows: Row[], values: Record<string, string> = {}, db: Db = DB) =>
  fact(id).compute(columns(rows, db), values, '2026-11-28')

const DB: Db = [
  ['Frima', 'SSR', false, false, '2024-01-01'],
  ['Noah', 'SSR', false, true, '2024-01-01'],
  ['Alice', 'SSR', false, 'TRUE ', '2025-01-01'],
  ['Biscuit', 'SSR', false, false, '2025-01-02'],
  ['Dorothy', 'SSR', true, true, '2025-03-01'],
  ['Anis', 'SSR', true, false, '2024-06-01'],
  ['Rapi', 'SR', false, false, '2022-11-04'],
]

// Dorothy: a Pilgrim chase, won in its second session, then greed. Biscuit: a failed chase.
const ROWS: Row[] = [
  ['2025-03-01', 'Dorothy', 'Pilgrim Limited', 3000, 0, 'Noah, Frima'],
  ['2025-03-02', 'Dorothy', 'Pilgrim Limited', 0, 20, 'Frima, Dorothy, Alice'],
  ['2025-03-02', 'Dorothy', 'Pilgrim Limited', 6000, 0, 'Dorothy, Dorothy'],
  ['2025-05-01', 'Biscuit', 'Regular', 0, 5, 'Frima'],
  ['2025-05-02', 'Biscuit', 'Regular', 1500, 0, ''],
  ['', '', '', 0, 0, ''],
]
const ANY = { type: 'any banner type', range: 'any period' }

describe('event facts: totals', () => {
  it.each([
    ['gems', ANY, '10,500'],
    ['tickets', ANY, '25'],
    ['pulls', ANY, '60'],
    ['pulls', { ...ANY, type: 'Regular' }, '10'],
    ['pulls', { ...ANY, range: 'in 2022' }, '0'],
  ])('pulls in %s %o', (currency, values, expected) => {
    expect(compute('pulls', ROWS, { ...values, currency })).toBe(expected)
  })

  it('counts SSRs and the share of pulls that gave one', () => {
    expect(compute('ssrs', ROWS, ANY)).toBe('8')
    expect(compute('ssrs', ROWS, { ...ANY, range: 'in 2022' })).toBe('0')
    expect(compute('luck', ROWS, ANY)).toBe('13.3 (8 of 60)')
    expect(compute('luck', ROWS.slice(4), ANY)).toBe('0 (0 of 5)')
    expect(compute('luck', [], ANY)).toBeNull()
  })

  it('finds the biggest day, summing its sessions', () => {
    expect(compute('biggest-day', ROWS, { currency: 'pulls' })).toBe('40 (2 Mar 2025)')
    expect(compute('biggest-day', ROWS.slice(3, 4), { currency: 'gems' })).toBe('0')
    expect(compute('biggest-day', [], { currency: 'gems' })).toBeNull()
    const tied: Row[] = [
      ['2025-01-02', '', 'Regular', 0, 10, ''],
      ['2025-01-01', '', 'Regular', 0, 10, ''],
    ]
    expect(compute('biggest-day', tied, { currency: 'tickets' })).toBe('10 (1 Jan 2025)')
  })

  it('counts the reachable NIKKE never pulled', () => {
    // Biscuit is the only non-limited miss; Anis is limited and never a rate-up
    expect(compute('still-missing', ROWS)).toBe('1')
    expect(compute('still-missing', [['2025-01-01', 'Anis', 'Regular', 0, 1, '']])).toBe('5')
    expect(compute('still-missing', ROWS, {}, [DB[0]])).toBe('0')
    expect(compute('still-missing', ROWS, {}, [])).toBeNull()
  })

  it('words the banner type and drops "any banner type"', () => {
    const { question, filters } = fact('pulls')
    const values = { currency: 'gems', type: 'any banner type', range: 'any period' }
    expect(fillQuestion({ question, filters }, values)).toBe(
      'How many gems did I spend on event pulls?',
    )
  })
})

// id, values, expected on ROWS (any period)
const ON_ROWS: [string, Record<string, string>, string | null][] = [
  ['rate-up-luck', { odds: '1%' }, '6 (3 of 50)'],
  ['rate-up-luck', { odds: '2%' }, '0 (0 of 10)'],
  ['rate-up-share', { odds: '1%' }, '42.9 (3 of 7)'],
  ['rate-up-share', { odds: '2%' }, '0 (0 of 1)'],
  ['spook-count', { rateUp: 'any rate-up' }, '5'],
  ['spook-count', { rateUp: 'Dorothy' }, '4'],
  ['pilgrim-spooks', { rateUp: 'any rate-up' }, '2'],
  ['pilgrim-spooks', { rateUp: 'Biscuit' }, '0'],
  ['frequent-spooker', { rateUp: 'any rate-up' }, 'Frima, 3 spooks'],
  ['worst-spook-streak', { rateUp: 'any rate-up' }, '3 (Dorothy, 1 Mar 2025)'],
  ['worst-spook-streak', { rateUp: 'Biscuit' }, null],
  ['clean-wins', {}, '0'],
  ['chase-record', { goal: 'first copy' }, '1'],
  ['chase-record', { goal: 'MLB' }, '0'],
  ['priciest-chase', { currency: 'pulls' }, '50 (Dorothy, 1 Mar 2025)'],
  ['priciest-chase', { currency: 'gems' }, '9,000 (Dorothy, 1 Mar 2025)'],
  ['costliest-failure', { currency: 'tickets' }, '5 (Biscuit, 1 May 2025)'],
  ['wasted-on-failures', { currency: 'gems' }, '1,500'],
  [
    'price-of-success',
    { currency: 'pulls', goal: 'first copy', rateUp: 'any rate-up' },
    '30 over 1 chase',
  ],
  ['price-of-success', { currency: 'pulls', goal: 'MLB', rateUp: 'any rate-up' }, null],
  ['quickest-win', { goal: 'first copy' }, '30 (Dorothy, 1 Mar 2025)'],
  ['quickest-win', { goal: 'core 7' }, null],
  ['chase-receipt', { currency: 'gems', rateUp: 'Dorothy' }, '9,000'],
  ['chase-receipt', { currency: 'tickets', rateUp: 'Nobody' }, null],
  ['greed-tax', { currency: 'gems', rateUp: 'any rate-up' }, '6,000'],
  ['greed-tax', { currency: 'gems', rateUp: 'Biscuit' }, '0'],
  ['ticket-wins', {}, '0'],
  ['failed-chases', {}, '1'],
  ['biggest-greed', { currency: 'gems' }, '6,000 (Dorothy, 1 Mar 2025)'],
  ['biggest-greed', { currency: 'tickets' }, '0'],
  ['greed-haul', { rateUp: 'any rate-up' }, '2'],
  ['empty-greed', {}, '0'],
  ['instant-wins', {}, '0'],
  ['sparks-worth', {}, '0'],
  ['spooked-after-failing', {}, '0'],
  ['missed-limiteds', {}, '0'],
  ['losing-streak', {}, '1 chase, from 1 May 2025'],
  ['uninvited-guests', {}, '0'],
]

// Facts whose superlative or share has nothing to say about an empty log.
const NO_ANSWER = [
  'rate-up-luck',
  'rate-up-share',
  'frequent-spooker',
  'worst-spook-streak',
  'priciest-chase',
  'costliest-failure',
  'price-of-success',
  'quickest-win',
  'chase-receipt',
  'biggest-greed',
  'losing-streak',
  'uninvited-guests',
]
const FILLED = { odds: '1%', rateUp: 'Dorothy', goal: 'first copy', currency: 'gems' }

describe('event facts: rate-ups and chases', () => {
  it.each(ON_ROWS)('%s %o', (id, values, expected) => {
    expect(compute(id, ROWS, values)).toBe(expected)
  })

  it.each(NO_ANSWER)('%s has no answer on an empty log', (id) => {
    expect(compute(id, [], FILLED)).toBeNull()
  })

  it('splits a chase after more than 30 days, and ties go to the earliest', () => {
    const rows: Row[] = [
      ['2025-01-02', 'Biscuit', 'Regular', 300, 0, ''],
      ['2025-02-01', 'Biscuit', 'Regular', 300, 0, ''], // 30 days: same chase
      ['2025-03-04', 'Biscuit', 'Regular', 600, 0, ''], // 31 days: a new one
    ]
    expect(compute('failed-chases', rows)).toBe('2')
    expect(compute('priciest-chase', rows, { currency: 'gems' })).toBe('600 (Biscuit, 2 Jan 2025)')
    expect(compute('losing-streak', rows)).toBe('2 chases, from 2 Jan 2025')
    // a chase belongs to the range of its first session
    expect(compute('failed-chases', rows, { range: '2025-02-01..2025-02-28' })).toBe('0')
  })

  it('ignores a rerun chase with no gems and no rate-up', () => {
    const rows: Row[] = [['2025-05-01', 'Biscuit', 'Regular', 0, 5, 'Frima']]
    expect(compute('failed-chases', rows)).toBe('0')
    expect(compute('spook-count', rows, { rateUp: 'any rate-up' })).toBe('0')
    // within 30 days of release it is no rerun
    expect(compute('failed-chases', [['2025-02-01', 'Biscuit', 'Regular', 0, 5, '']])).toBe('1')
    // a free rerun that gave the rate-up counts, and as a win without gems
    const won: Row[] = [['2025-05-01', 'Biscuit', 'Regular', 0, 5, 'Biscuit']]
    expect(compute('ticket-wins', won)).toBe('1')
    expect(compute('clean-wins', won)).toBe('1')
    expect(compute('instant-wins', won)).toBe('1')
    expect(compute('empty-greed', won)).toBe('0')
  })

  it('counts empty greed and a spark spent on one chase', () => {
    const rows: Row[] = [
      ['2025-01-03', 'Biscuit', 'Regular', 3000, 0, 'Biscuit'],
      ['2025-01-04', 'Biscuit', 'Regular', 0, 190, ''],
    ]
    expect(compute('empty-greed', rows)).toBe('1')
    expect(compute('sparks-worth', rows)).toBe('1')
    expect(compute('instant-wins', rows)).toBe('1')
    expect(compute('chase-record', rows, { goal: 'first copy' })).toBe('1')
  })

  it('finds the NIKKE that spooked after their chase failed', () => {
    const rows: Row[] = [
      ['2025-03-02', 'Dorothy', 'Pilgrim Limited', 300, 0, ''],
      ['2025-03-02', 'Anis', 'Regular', 300, 0, 'Dorothy, Dorothy'],
    ]
    expect(compute('spooked-after-failing', rows)).toBe('1')
    expect(compute('spooked-after-failing', [rows[1], rows[0]])).toBe('0')
    // pulled as a spook, so no longer missed; Anis was never pulled
    expect(compute('missed-limiteds', rows)).toBe('1')
  })

  it('names the most frequent uninvited guest', () => {
    const rows: Row[] = [['2025-01-01', 'Anis', 'Regular', 300, 0, 'Biscuit, Dorothy, Dorothy']]
    expect(compute('uninvited-guests', rows)).toBe('2, mostly Dorothy (2 times)')
    // Alice was released the day of the first pull: counted
    expect(compute('uninvited-guests', [['2025-01-01', 'Anis', 'Regular', 300, 0, 'Alice']])).toBe(
      '1, mostly Alice (1 time)',
    )
  })

  it('gives ties to the earliest chase or NIKKE', () => {
    // two identical failed chases, then two identical wins with the same greed
    const rows: Row[] = [
      ['2025-01-03', 'Biscuit', 'Regular', 600, 0, 'Noah'],
      ['2025-03-01', 'Biscuit', 'Regular', 600, 0, 'Frima'],
      ['2025-05-01', 'Alice', 'Regular', 300, 0, 'Frima, Alice'],
      ['2025-05-02', 'Alice', 'Regular', 300, 0, ''],
      ['2025-07-01', 'Alice', 'Regular', 300, 0, 'Noah, Alice'],
      ['2025-07-02', 'Alice', 'Regular', 300, 0, ''],
    ]
    const gems = { currency: 'gems' }
    expect(compute('costliest-failure', rows, gems)).toBe('600 (Biscuit, 3 Jan 2025)')
    expect(compute('biggest-greed', rows, gems)).toBe('300 (Alice, 1 May 2025)')
    expect(compute('worst-spook-streak', rows)).toBe('1 (Alice, 1 May 2025)')
    expect(compute('quickest-win', rows, { goal: 'first copy' })).toBe('1 (Alice, 1 May 2025)')
    expect(compute('frequent-spooker', rows)).toBe('Noah, 2 spooks')
    const streaks: Row[] = [rows[0], rows[2], rows[1]].map((r, i) => [
      `2025-0${2 * i + 1}-01`,
      r[1],
      r[2],
      r[3],
      r[4],
      r[5],
    ])
    expect(compute('losing-streak', streaks)).toBe('1 chase, from 1 Jan 2025')
    const guests: Row[] = [['2025-01-01', 'Anis', 'Regular', 300, 0, 'Dorothy, Biscuit']]
    expect(compute('uninvited-guests', guests)).toBe('2, mostly Dorothy (1 time)')
  })

  it('answers 0 where there is something to count but nothing counts', () => {
    const won: Row[] = [['2025-01-03', 'Biscuit', 'Regular', 0, 1, 'Biscuit']]
    const gems = { currency: 'gems', goal: 'first copy', rateUp: 'Biscuit' }
    expect(compute('wasted-on-failures', won, gems)).toBe('0')
    expect(compute('greed-haul', won)).toBe('0')
    expect(compute('losing-streak', won)).toBe('0')
    expect(compute('worst-spook-streak', won)).toBe('0')
    expect(compute('chase-receipt', won, gems)).toBe('0')
    expect(compute('price-of-success', won, gems)).toBe('0 over 1 chase')
    const lost: Row[] = [['2025-01-03', 'Biscuit', 'Regular', 0, 1, '']]
    expect(compute('costliest-failure', lost, gems)).toBe('0')
  })

  it('averages the price of success over the chases that got there', () => {
    const rows: Row[] = [
      ['2025-01-03', 'Biscuit', 'Regular', 0, 10, 'Biscuit'],
      ['2025-03-01', 'Biscuit', 'Regular', 300, 20, 'Biscuit'],
      ['2025-05-01', 'Biscuit', 'Regular', 300, 90, ''], // failed: not averaged
    ]
    const values = { currency: 'pulls', goal: 'first copy', rateUp: 'Biscuit' }
    expect(compute('price-of-success', rows, values)).toBe('16 over 2 chases') // 15.5
  })

  it('has all 31 facts in Pulls with unique titles', () => {
    const facts = FACTS.filter((f) => f.id.startsWith('event-'))
    expect(facts).toHaveLength(31)
    expect(facts.every((f) => f.category === 'Pulls')).toBe(true)
    const titles = FACTS.filter((f) => f.category === 'Pulls').map((f) => f.title)
    expect(new Set(titles).size).toBe(titles.length)
  })
})
