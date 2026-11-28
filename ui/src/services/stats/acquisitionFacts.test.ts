import { describe, expect, it } from 'vitest'

import { FACTS, fillQuestion } from './facts'
import type { Values } from './facts'

const TODAY = '2026-11-28'
const fact = (id: string) => FACTS.find((f) => f.id === `acquisition-${id}`)!

const HEADERS = 'nikke confidence releaseDate firstCopy lb1 lb2 lb3 c1 c2 c3 c4 c5 c6 c7'.split(' ')
const SLOTS = HEADERS.slice(3)

// A slot is 'date source' here and date, newline, source on the sheet.
const row = (nikke: string, slots: string[], releaseDate = '', confidence = 'Perfect') => [
  nikke,
  confidence,
  releaseDate,
  ...SLOTS.map((_, i) => (slots[i] ?? '').replace(' ', '\n')),
]
// Row 2 of the tab numbers the slots.
const NUMBERS = ['', '', '', ...SLOTS.map((_, i) => i + 1)]

// Ten copies like the first, then core 7.
const maxed = (first: string, last: string) => [first, ...Array(9).fill(first), last]

const compute = (id: string, rows: unknown[][], values: Values = {}, db: unknown[][] = []) => {
  const all: Record<string, Record<string, unknown[]>> = {
    AcquisitionLog: Object.fromEntries(
      HEADERS.map((h, i) => [h, [NUMBERS, ...rows].map((r) => r[i])]),
    ),
    NikkeDatabase: Object.fromEntries(
      'nikke manufacturer class burst element weapon'
        .split(' ')
        .map((h, i) => [h, db.map((r) => r[i])]),
    ),
  }
  const declared = Object.fromEntries(
    fact(id).reads.map(({ tab, columns }) => [
      tab.tab,
      Object.fromEntries(columns.map((n) => [n, all[tab.tab][n]])),
    ]),
  )
  return fact(id).compute(declared, values, TODAY)
}

describe('acquisition facts', () => {
  it('copy-date gives the day and source of one stage', () => {
    const rows = [row('Rapi', ['?', '2024-08-22 Event'])]
    const lb1 = { nikke: 'Rapi', stage: 'LB1' }
    expect(compute('copy-date', rows, lb1)).toBe('22 Aug 2024, Event')
    expect(compute('copy-date', rows, { nikke: 'Rapi', stage: 'first copy' })).toBeNull()
    expect(compute('copy-date', rows, { nikke: 'Rapi', stage: 'core 7' })).toBeNull()
  })

  it('lb-wait counts days from first copy to LB3', () => {
    const slots = ['2024-01-01 Event', '?', '?', '2024-01-11 Mold']
    const v = { nikke: 'Rapi' }
    expect(compute('lb-wait', [row('Rapi', slots)], v)).toBe('10 days')
    expect(compute('lb-wait', [row('Rapi', Array(4).fill('2024-01-01 Event'))], v)).toBe('0 days')
    expect(compute('lb-wait', [row('Rapi', ['2024-01-01 Event'])], v)).toBeNull()
  })

  it('fastest and slowest max core rank first copy to core 7, ties to the earliest row', () => {
    const rows = [
      row('A', maxed('2024-01-01 Event', '2024-01-11 Event')),
      row('B', maxed('2024-02-01 Event', '2024-02-11 Event')),
      row('C', maxed('2024-01-01 Event', '2024-02-01 Event')),
      row('D', maxed('?', '2024-01-01 Event')),
      row('E', maxed('2024-03-01 Event', '2024-04-01 Event')),
    ]
    expect(compute('fastest-max', rows)).toBe('A, 10 days')
    expect(compute('slowest-max', rows)).toBe('C, 31 days')
    const same = [row('A', maxed('2024-01-01 Event', '2024-01-01 Event'))]
    expect(compute('fastest-max', same)).toBe('A, 0 days')
    expect(compute('fastest-max', [])).toBeNull()
    expect(compute('slowest-max', [])).toBeNull()
  })

  it('drought is the widest gap between two known copies', () => {
    const rows = [
      row('A', ['?', '2024-01-01 Event', '2024-01-31 Mold']),
      row('B', ['2024-01-01 Event', '2024-01-02 Mold', '2024-02-01 Mold']),
    ]
    expect(compute('drought', rows)).toBe('A, 30 days from 1 Jan 2024')
    expect(compute('drought', [row('A', ['2024-01-01 Event', '2024-01-01 Mold'])])).toBe(
      'A, 0 days from 1 Jan 2024',
    )
    expect(compute('drought', [row('A', ['?', '2024-01-01 Event'])])).toBeNull()
  })

  it('first-meetings counts first copies from a source in range', () => {
    const rows = [row('A', ['2024-01-01 Event']), row('B', ['2025-01-01 Event']), row('C', ['?'])]
    const v = { source: 'Event', range: 'any period' }
    expect(compute('first-meetings', rows, v)).toBe('2')
    expect(compute('first-meetings', rows, { ...v, range: 'in 2025' })).toBe('1')
    expect(compute('first-meetings', rows, { ...v, source: 'Mold' })).toBe('0')
    const source = fact('first-meetings').filters![0].options
    const cols = {
      AcquisitionLog: { firstCopy: [1, 'x', '2024-01-01\nEvent', '2024-01-01\nMold'] },
    }
    expect(typeof source === 'function' && source(cols)).toEqual(['Event', 'Mold'])
  })

  it('finishing-source names the commonest core 7 source, tie to the earliest', () => {
    const rows = [row('A', maxed('?', '2024-01-01 Mold')), row('B', maxed('?', '2024-01-01 Event'))]
    expect(compute('finishing-source', rows)).toBe('Mold, 1 NIKKE')
    expect(compute('finishing-source', [row('A', ['?'])])).toBeNull()
  })

  it('release-day counts first copies dated the release day', () => {
    const rows = [
      row('A', ['2024-01-01 Event'], '2024-01-01'),
      row('B', ['2024-01-02 Event'], '2024-01-01'),
      row('C', ['?'], '2024-01-01'),
    ]
    expect(compute('release-day', rows, { range: 'any period' })).toBe('1')
    expect(compute('release-day', rows, { range: 'in 2023' })).toBe('0')
  })

  it('late-arrival only counts releases since the earliest logged copy', () => {
    const rows = [
      row('Old', ['2024-06-01 Event'], '2022-11-04'),
      // the earliest logged copy is in a later slot
      row('A', ['?', '2024-01-01 Mold'], '2023-01-01'),
      row('B', ['2024-01-11 Event'], '2024-01-01'),
      row('C', ['2024-02-11 Event'], '2024-02-01'),
    ]
    expect(compute('late-arrival', rows)).toBe('B, 10 days')
    expect(compute('late-arrival', [row('B', ['2024-01-01 Event'], '2024-01-01')])).toBe(
      'B, 0 days',
    )
    expect(compute('late-arrival', [rows[0]])).toBeNull()
    expect(compute('late-arrival', [])).toBeNull()
  })

  it('confidence counts NIKKE of one confidence', () => {
    const rows = [row('A', []), row('B', [], '', 'Good'), row('C', [])]
    expect(compute('confidence', rows, { confidence: 'Perfect' })).toBe('2')
    expect(compute('confidence', rows, { confidence: 'Unknown' })).toBe('0')
    expect(compute('confidence', [], { confidence: 'Perfect' })).toBeNull()
  })

  it('first core facts pick the earliest core 7 of a trait', () => {
    const db = [
      ['A', 'TETRA', 'Attacker', 'Step1', 'Electronic', 'AR'],
      ['B', 'ELYSION', 'Attacker', 'Step3', 'Fire', 'AR'],
      ['C', 'TETRA', 'Defender', 'Step3', 'Fire', 'SG'],
    ]
    const rows = [
      row('A', maxed('?', '2024-03-01 Mold'), '', 'Good'),
      row('B', maxed('?', '2024-02-01 Mold')),
      row('C', maxed('?', '2024-02-01 Mold'), '', 'Approx'),
    ]
    const any = { trait: 'any trait' }
    expect(compute('first-max', rows, any, db)).toBe('B, 1 Feb 2024')
    expect(compute('first-max', rows, { trait: 'Electric' }, db)).toBe('A, 1 Mar 2024')
    expect(compute('first-max', rows, { trait: 'Water' }, db)).toBeNull()
    expect(compute('first-recorded-max', rows, { trait: 'Tetra' }, db)).toBeNull()
    expect(compute('first-recorded-max', rows, any, db)).toBe('B, 1 Feb 2024')
  })

  it('lists the 12 Roster facts and drops "any trait" from the question', () => {
    const facts = FACTS.filter((f) => f.id.startsWith('acquisition-'))
    expect(facts).toHaveLength(12)
    expect(facts.every((f) => f.category === 'Roster')).toBe(true)
    expect(fillQuestion(fact('first-max'), { trait: 'any trait' })).toBe(
      'Which NIKKE reached core 7 first?',
    )
  })
})
