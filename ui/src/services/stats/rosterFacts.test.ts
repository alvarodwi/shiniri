import { describe, expect, it } from 'vitest'

import { FACTS, fillQuestion } from './facts'
import type { Columns, Values } from './facts'

const TODAY = '2026-11-28'
const fact = (id: string) => FACTS.find((f) => f.id === `roster-${id}`)!

const HEADERS: Record<string, string[]> = {
  RosterLog: ['date', 'nameCode', 'nikke', 'copies'],
  NikkeDatabase: [
    'nameCode',
    'nikke',
    'rarity',
    'manufacturer',
    'class',
    'burst',
    'element',
    'weapon',
    'limited',
  ],
}
type Tabs = Partial<Record<string, unknown[][]>>

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

const db = (code: number, name: string, maker: string, element: string, extra: unknown[] = []) => [
  code,
  name,
  extra[0] ?? 'SSR',
  maker,
  'Attacker',
  'Step3',
  element,
  'AR',
  extra[1] ?? false,
]
const NikkeDatabase = [
  db(1, 'Rapi', 'ELYSION', 'Fire'),
  db(2, 'Anis', 'TETRA', 'Electronic'),
  db(3, 'Neon', 'TETRA', 'Fire'),
  db(4, 'Ade', 'ELYSION', 'Iron', ['SSR', 'TRUE']),
  db(5, 'Product', 'TETRA', 'Iron', ['R']),
]
const row = (date: string, code: number, copies: number) => [date, code, '', copies]

const BASE = '2026-11-21'
const LATER = '2026-11-23'
const tabs: Tabs = {
  NikkeDatabase,
  RosterLog: [
    row(BASE, 1, 10),
    row(BASE, 2, 3),
    row(BASE, 5, 11),
    row(LATER, 2, 4), // +1
    row(LATER, 3, 1), // a new NIKKE: +1
    row(TODAY, 1, 11), // +1
    row(TODAY, 3, 10), // +9
  ],
}
const empty: Tabs = { NikkeDatabase, RosterLog: [] }
const any = { trait: 'any trait' }

describe('roster facts', () => {
  it('counts the owned SSRs against all of them, limited included', () => {
    expect(compute('collection', tabs, any)).toBe('3 of 4')
    expect(compute('collection', tabs, { trait: 'Electric' })).toBe('1 of 1')
    expect(compute('collection', empty, any)).toBe('0 of 4')
    expect(compute('collection', { NikkeDatabase: [], RosterLog: [] }, any)).toBeNull()
  })

  it('names the missing SSRs and marks the limited ones', () => {
    expect(compute('missing', tabs, any)).toBe('Ade (limited)')
    expect(compute('missing', empty, { trait: 'Elysion' })).toBe('Rapi, Ade (limited)')
    expect(compute('missing', tabs, { trait: 'Tetra' })).toBe('None')
    expect(compute('missing', { NikkeDatabase: [], RosterLog: [] }, any)).toBeNull()
  })

  it('counts the NIKKE at least at a stage, from their latest rows', () => {
    expect(compute('built', tabs, { ...any, stage: 'MLB' })).toBe('3')
    expect(compute('built', tabs, { ...any, stage: 'core 7' })).toBe('1')
    expect(compute('built', empty, { ...any, stage: 'MLB' })).toBe('0')
    expect(compute('built', { NikkeDatabase: [], RosterLog: [] }, any)).toBeNull()
  })

  it('names the NIKKE closest to core 7', () => {
    expect(compute('next-in-line', tabs, any)).toBe('Neon, 1 copy away')
    expect(compute('next-in-line', tabs, { trait: 'Electric' })).toBe('Anis, 7 copies away')
    expect(compute('next-in-line', empty, any)).toBeNull()
  })

  it('breaks a tie by the earliest date of the current copies, then name', () => {
    const tied = (RosterLog: unknown[][]) =>
      compute('next-in-line', { NikkeDatabase, RosterLog }, any)
    expect(tied([row(BASE, 1, 9), row(BASE, 4, 10), row(LATER, 1, 10)])).toBe(
      'Ade, 1 copy away (+1 tied)',
    )
    // A repeated row doesn't restart the wait.
    expect(tied([row(BASE, 1, 10), row(LATER, 4, 10), row(TODAY, 1, 10)])).toBe(
      'Rapi, 1 copy away (+1 tied)',
    )
    expect(tied([row(BASE, 1, 10), row(BASE, 4, 10)])).toBe('Ade, 1 copy away (+1 tied)')
  })

  it('finds the group with the most copies on average among the owned', () => {
    // Elysion: Rapi 11 (Ade unowned). Tetra: Anis 4, Neon 10.
    expect(compute('favoured-group', tabs, { attribute: 'manufacturer' })).toBe(
      'Elysion, 11 copies on average',
    )
    // Fire: Rapi 11, Neon 10.
    expect(compute('favoured-group', tabs, { attribute: 'element' })).toBe(
      'Fire, 10.5 copies on average',
    )
    // A tie goes to the group listed first in NikkeDatabase.
    const level = { NikkeDatabase, RosterLog: [row(BASE, 2, 1), row(BASE, 1, 1)] }
    expect(compute('favoured-group', level, { attribute: 'manufacturer' })).toBe(
      'Elysion, 1 copy on average',
    )
    expect(compute('favoured-group', empty, { attribute: 'element' })).toBeNull()
  })

  it('adds up the rise in copies, leaving out the baseline', () => {
    const range = 'any period'
    expect(compute('growth', tabs, { range })).toBe('12')
    expect(compute('growth', tabs, { range: `${TODAY}..` })).toBe('10')
    expect(compute('growth', tabs, { range: `${BASE}..${BASE}` })).toBe('0')
    expect(compute('growth', empty, { range })).toBeNull()
  })

  it('words the questions', () => {
    const say = (id: string, values: Values) => fillQuestion(fact(id), values)
    expect(say('collection', any)).toBe('How many NIKKE do I own, out of how many?')
    expect(say('built', { trait: 'Tetra', stage: 'core 7' })).toBe(
      'How many Tetra NIKKE are at core 7?',
    )
    expect(say('growth', { range: 'last week' })).toBe(
      'How many copies did my roster gain last week?',
    )
  })
})
