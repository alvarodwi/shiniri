import { describe, expect, it } from 'vitest'

import { FACTS, fillQuestion } from './facts'
import type { Values } from './facts'

const TODAY = '2026-12-10'
const fact = (id: string) => FACTS.find((f) => f.id === `dupes-${id}`)!

type Tabs = { tracker?: unknown[][]; pulls?: unknown[][]; roster?: unknown[][] }
const HEADERS = {
  DupeTracker: 'nikke copies expected unused',
  AllPulls: 'date nikke copy',
  RosterLog: 'date nikke copies',
  NikkeDatabase: 'nikke manufacturer class burst element weapon',
}
// Rapi and Neon are Elysion, Anis is Tetra; only Anis is Iron.
const DB = [
  ['Rapi', 'ELYSION', 'Attacker', 'Step3', 'Fire', 'AR'],
  ['Neon', 'ELYSION', 'Attacker', 'Step1', 'Fire', 'SG'],
  ['Anis', 'TETRA', 'Defender', 'Step2', 'Iron', 'RL'],
]

const columns = ({ tracker = [], pulls = [], roster = [] }: Tabs) => {
  const rows = { DupeTracker: tracker, AllPulls: pulls, RosterLog: roster, NikkeDatabase: DB }
  return Object.fromEntries(
    Object.entries(HEADERS).map(([tab, headers]) => [
      tab,
      Object.fromEntries(
        headers.split(' ').map((h, i) => [h, rows[tab as keyof typeof rows].map((r) => r[i])]),
      ),
    ]),
  )
}
const compute = (id: string, tabs: Tabs, values: Values = {}) => {
  const all = columns(tabs)
  const declared = Object.fromEntries(
    fact(id).reads.map(({ tab, columns }) => [
      tab.tab,
      Object.fromEntries(columns.map((n) => [n, all[tab.tab][n]])),
    ]),
  )
  return fact(id).compute(declared, values, TODAY)
}

const any = { trait: 'any trait' }
// The formula's row for "nothing to list".
const EMPTY = [['', '', '', '']]
// nikke, copies, expected, unused
const TRACKER = [
  ['Anis', 8, 11, 3],
  ['Rapi', 2, 5, 3],
  ['Neon', 10, 11, 1],
  ['Gap', 5, 3, -2],
]

// date, nikke, copy
const PULLS = [
  ['2026-11-01', 'Rapi', ''], // on or before the baseline
  ['2026-11-25', 'Rapi', 2],
  ['2026-11-25', 'Anis', 2],
  ['2026-11-26', 'Neon', 1], // a first copy is not a dupe
  ['2026-11-27', 'Rapi', 3],
  ['2026-11-28', 'Anis', 3],
  ['2026-11-29', 'Neon', 12], // overcore
]
// Rapi: copy 2 used after 5 days, copy 3 after 3. Anis: copy 2 same day, copy 3 still waiting.
const ROSTER = [
  ['2026-11-21', 'Rapi', 1],
  ['2026-11-21', 'Anis', 1],
  ['2026-11-25', 'Anis', 2],
  ['2026-11-30', 'Rapi', 3],
  ['2026-12-01', 'Neon', 12],
]
const HISTORY = { pulls: PULLS, roster: ROSTER }

describe('dupe facts', () => {
  it('total sums positive unused dupes by trait', () => {
    expect(compute('total', { tracker: TRACKER }, any)).toBe('7')
    expect(compute('total', { tracker: TRACKER }, { trait: 'Elysion' })).toBe('4')
    expect(compute('total', { tracker: TRACKER }, { trait: 'SR' })).toBe('0')
    expect(compute('total', { tracker: EMPTY }, any)).toBe('0')
  })

  it('pile and biggest-stack name the top, ties to the earliest row', () => {
    expect(compute('pile', { tracker: TRACKER }, { attribute: 'manufacturer' })).toBe(
      'Elysion, 4 dupes',
    )
    // Tetra 3 and Elysion 3.
    expect(compute('pile', { tracker: TRACKER.slice(0, 2) }, { attribute: 'manufacturer' })).toBe(
      'Tetra, 3 dupes',
    )
    expect(compute('biggest-stack', { tracker: TRACKER })).toBe('Anis, 3 dupes')
    expect(compute('pile', { tracker: EMPTY }, { attribute: 'class' })).toBe('None')
    expect(compute('biggest-stack', { tracker: EMPTY })).toBe('None')
    expect(compute('pile', { tracker: [['Unknown', 1, 2, 1]] }, { attribute: 'class' })).toBeNull()
  })

  it('oldest dates the earliest copy still unused', () => {
    // copies 1 used: Rapi's copy 2 onwards waits.
    const tracker = [
      ['Anis', 2, 3, 1],
      ['Rapi', 1, 3, 2],
    ]
    expect(compute('oldest', { tracker, pulls: PULLS })).toBe('Rapi, 15 days')
    const tie = [
      ['Anis', 1, 2, 1],
      ['Rapi', 1, 2, 1],
    ]
    expect(compute('oldest', { tracker: tie, pulls: PULLS })).toBe('Anis, 15 days')
    // Copy 2 was waiting at the baseline, so the earliest seen one counts.
    const seen = [['Rapi', 1, 3, 2]]
    expect(compute('oldest', { tracker: seen, pulls: [['2026-12-10', 'Rapi', 3]] })).toBe(
      'Rapi, 0 days',
    )
    expect(compute('oldest', { tracker: EMPTY, pulls: PULLS })).toBe('None')
    expect(compute('oldest', { tracker: seen, pulls: [] })).toBeNull()
  })

  it('ready-to-max lists every NIKKE whose dupes reach core 7', () => {
    expect(compute('ready-to-max', { tracker: TRACKER })).toBe('Anis, Neon')
    expect(compute('ready-to-max', { tracker: [['Rapi', 2, 5, 3]] })).toBe('None')
    expect(compute('ready-to-max', { tracker: EMPTY })).toBe('None')
  })

  it('waits count used dupes from pull to the first roster date reaching the copy', () => {
    expect(compute('longest-wait', HISTORY, any)).toBe('Rapi, 5 days')
    expect(compute('longest-wait', HISTORY, { trait: 'Tetra' })).toBe('Anis, 0 days')
    expect(compute('typical-wait', HISTORY, any)).toBe('3 days')
    expect(compute('typical-wait', HISTORY, { trait: 'Tetra' })).toBe('0 days')
    // 5 and 3 days.
    expect(compute('typical-wait', HISTORY, { trait: 'Elysion' })).toBe('4 days')
    // Same wait: the earlier pull wins.
    const tie = {
      pulls: [
        ['2026-11-25', 'Anis', 2],
        ['2026-11-25', 'Rapi', 2],
      ],
      roster: [
        ['2026-11-27', 'Rapi', 2],
        ['2026-11-27', 'Anis', 2],
      ],
    }
    expect(compute('longest-wait', tie, any)).toBe('Anis, 2 days')
    expect(compute('longest-wait', { pulls: PULLS }, any)).toBeNull()
    expect(compute('typical-wait', { pulls: PULLS }, any)).toBeNull()
  })

  it('a roster date before the pull is a logging gap, not a use', () => {
    const gap = { pulls: [['2026-11-25', 'Rapi', 2]], roster: [['2026-11-22', 'Rapi', 2]] }
    expect(compute('longest-wait', gap, any)).toBeNull()
    expect(compute('used', gap, { range: 'any period' })).toBe('0')
  })

  it('used and favourite go by the date used', () => {
    expect(compute('used', HISTORY, { range: 'any period' })).toBe('3')
    expect(compute('used', HISTORY, { range: 'last month' })).toBe('3')
    expect(compute('used', HISTORY, { range: 'this month' })).toBe('0')
    expect(compute('favourite', HISTORY, { range: 'any period' })).toBe('Rapi, 2 dupes')
    expect(compute('favourite', HISTORY, { range: 'this month' })).toBeNull()
    // One each: the earlier pull wins.
    const tie = {
      pulls: PULLS.slice(1, 3),
      roster: [
        ['2026-11-30', 'Anis', 2],
        ['2026-11-30', 'Rapi', 2],
      ],
    }
    expect(compute('favourite', tie, { range: 'any period' })).toBe('Rapi, 1 dupe')
  })

  it('biggest-hoard is the most held at once, ties to the first day', () => {
    // Held: 25th 2 (Anis's used the same day still counts), 27th 2, 28th 3.
    expect(compute('biggest-hoard', HISTORY)).toBe('3 (28 Nov 2026)')
    const tie = {
      pulls: [
        ['2026-11-25', 'Rapi', 2],
        ['2026-11-28', 'Anis', 2],
      ],
      roster: [['2026-11-26', 'Rapi', 2]],
    }
    expect(compute('biggest-hoard', tie)).toBe('1 (25 Nov 2026)')
    expect(compute('biggest-hoard', {})).toBeNull()
  })

  it('upgrade-spree is the day the most dupes were used, ties to the first', () => {
    expect(compute('upgrade-spree', HISTORY)).toBe('2 (30 Nov 2026)')
    const tie = {
      pulls: PULLS.slice(1, 3),
      roster: [
        ['2026-11-30', 'Anis', 2],
        ['2026-11-26', 'Rapi', 2],
      ],
    }
    expect(compute('upgrade-spree', tie)).toBe('1 (26 Nov 2026)')
    expect(compute('upgrade-spree', { pulls: PULLS })).toBeNull()
  })

  it('has the eleven ticket facts under Roster', () => {
    const facts = FACTS.filter((f) => f.id.startsWith('dupes-'))
    expect(facts.map((f) => f.id.slice(6))).toEqual(
      'total pile biggest-stack oldest longest-wait typical-wait used ready-to-max biggest-hoard upgrade-spree favourite'.split(
        ' ',
      ),
    )
    expect(facts.every((f) => f.category === 'Roster')).toBe(true)
    expect(fillQuestion(fact('total'), any)).toBe('How many unused dupes am I holding?')
    const options = fact('total').filters![0].options
    expect(typeof options === 'function' && options(columns({})).slice(0, 3)).toEqual([
      'any trait',
      'Elysion',
      'Tetra',
    ])
  })
})
