import { describe, expect, it } from 'vitest'

import { FACTS, fillQuestion } from './facts'

const fact = (id: string) => FACTS.find((f) => f.id === `soloraid-${id}`)!
type Row = [number | '', string, string, string, number | string, number | string]
const NAMES = ['season', 'month', 'boss', 'weakness', 'damage', 'rank']
const cols = (id: string, rows: Row[]) => ({
  SoloRaid: Object.fromEntries(
    fact(id).reads[0].columns.map((name) => [name, rows.map((r) => r[NAMES.indexOf(name)])]),
  ),
})
const compute = (id: string, rows: Row[], values: Record<string, string> = {}) =>
  fact(id).compute(cols(id, rows), values, '2026-11-28')

// out of season order on purpose
const ROWS: Row[] = [
  [2, '2025-02-10', 'Whale', 'Electric', 12e9, '2.50%'],
  [1, '2025-01-10', 'Digger', 'Fire', 10e9, '8.00%'],
  [3, '2025-07-10', 'Digger', 'Fire', '-', '12.00%'],
  [4, '2025-08-10', 'Whale', 'Electric', 16.7e9, '3.76%'],
  [5, '2026-01-10', 'DEAD', 'Iron', '', ''],
  [6, '2026-02-10', 'Golem', 'Iron', 22.4e9, '#12'],
  [7, '2026-03-10', 'Golem', 'Iron', 20e9, 0.05], // a percent-formatted cell: 5%
  ['', '', '', '', '', ''],
]
// two equal bests, damages and averages
const TIED: Row[] = [
  [2, '2025-02-10', 'B', 'Water', 5e9, '4.00%'],
  [1, '2025-01-10', 'A', 'Wind', 5e9, '4.00%'],
]
const PLACES: Row[] = [
  [1, '2025-01-10', 'A', 'Wind', 1, '#30'],
  [2, '2025-02-10', 'B', 'Wind', 1, '#7'],
]
const UNRANKED: Row[] = [[1, '2025-01-10', 'A', 'Wind', '-', '']]

// both average 3.2, which floats miss by a hair
const FLOATS: Row[] = [
  [1, '2025-01-10', 'A', 'Wind', 1, '3.20%'],
  [2, '2025-02-10', 'B', 'Water', 1, '3.10%'],
  [3, '2025-03-10', 'B', 'Water', 1, '3.20%'],
  [4, '2025-04-10', 'B', 'Water', 1, '3.30%'],
]
const FLOATS_LATER = FLOATS.map((r): Row => [
  r[0],
  r[1],
  r[2],
  r[3] === 'Wind' ? 'Water' : 'Wind',
  r[4],
  r[5],
])
// down by less than half a percent
const SLIGHT_DROP: Row[] = [
  [1, '2025-01-10', 'A', 'Wind', 10e9, ''],
  [2, '2025-02-10', 'A', 'Wind', 10e9, ''],
  [3, '2025-07-10', 'A', 'Wind', 9.96e9, ''],
]

const any = { range: 'any period' }
const none = { range: 'in 2022' }
const against = (weakness: string, range = any) => ({ ...range, weakness })
const frame = (tier: string, weakness = 'any weakness') => ({ frame: tier, weakness })

// [id, values, rows, expected]
const CASES: [string, Record<string, string>, Row[], string | null][] = [
  ['frames', { ...any, frame: 'tier 3' }, ROWS, '2'], // 2.50% and #12
  ['frames', { ...any, frame: 'tier 2' }, ROWS, '3'],
  ['frames', { ...any, frame: 'tier 1' }, ROWS, '1'],
  ['frames', { ...none, frame: 'tier 3' }, ROWS, '0'],
  ['last-frame', frame('tier 3'), ROWS, 'Golem (season 6, Feb 2026)'],
  ['last-frame', frame('tier 3', 'Electric'), ROWS, 'Whale (season 2, Feb 2025)'],
  ['last-frame', frame('tier 1', 'Iron'), ROWS, null],
  ['near-miss', any, ROWS, '3.76%, Whale (season 4, Aug 2025)'],
  ['near-miss', any, TIED, '4.00%, A (season 1, Jan 2025)'],
  ['near-miss', any, PLACES, null],
  // 3 and 4; 5 has no rank, 6 is tier 3
  ['drought', {}, ROWS, '2'],
  ['drought', {}, PLACES, '0'],
  ['drought', {}, UNRANKED, '0'],
  ['average-rank', against('Electric'), ROWS, '3.13% over 2 seasons'],
  ['average-rank', against('Iron'), ROWS, '2.50% over 2 seasons'], // a placement counts as 0%
  ['average-rank', against('Water'), ROWS, null],
  ['average-rank', against('Wind'), PLACES, '0.00% over 2 seasons'],
  ['best-weakness', any, ROWS, 'Iron, 2.50% over 2 seasons'],
  ['best-weakness', any, TIED, 'Wind, 4.00% over 1 season'],
  ['best-weakness', none, ROWS, null],
  ['best-weakness', any, FLOATS, 'Wind, 3.20% over 1 season'],
  ['best-weakness', any, FLOATS_LATER, 'Water, 3.20% over 1 season'],
  ['power-creep', { period: 'in H2 2025' }, SLIGHT_DROP, '0 (10B to 9.96B)'],
  ['best-rank', against('any weakness'), ROWS, '#12, Golem (season 6, Feb 2026)'],
  ['best-rank', against('any weakness'), PLACES, '#7, B (season 2, Feb 2025)'],
  ['best-rank', against('any weakness'), TIED, '4.00%, A (season 1, Jan 2025)'],
  ['best-rank', against('Water'), ROWS, null],
  ['top-damage', against('any weakness'), ROWS, '22.4B, Golem (season 6, Feb 2026)'],
  ['top-damage', against('any weakness'), TIED, '5B, A (season 1, Jan 2025)'],
  ['top-damage', against('Wind'), UNRANKED, null],
  ['last-boss', { boss: 'Digger' }, ROWS, '12.00%, season 3 (Jul 2025)'],
  ['last-boss', { boss: 'DEAD' }, ROWS, null],
  // H2 2025 against H1 2025: 16.7 against a mean of 11
  ['power-creep', { period: 'in H1 2026' }, ROWS, null], // H2 2025 has one damage
  ['power-creep', { period: 'in H2 2025' }, ROWS, '+52 (11B to 16.7B)'],
  ['power-creep', { period: 'in 2026' }, ROWS, '+64 (12.9B to 21.2B)'],
  [
    'power-creep',
    { period: 'in H2 2025' },
    [...TIED, [3, '2025-07-01', 'C', 'Fire', 5e9, '']],
    '0 (5B to 5B)',
  ],
]

describe('SoloRaid facts', () => {
  it.each(CASES)('%s %o', (id, values, rows, expected) => {
    expect(compute(id, rows, values)).toBe(expected)
  })

  const options = (id: string, filter: string, rows: Row[] = ROWS) => {
    const { options } = fact(id).filters!.find((f) => f.id === filter)!
    return typeof options === 'function' ? options(cols(id, rows)) : options
  }

  it('offers ranked bosses, comparable periods and no range presets', () => {
    expect(options('last-boss', 'boss')).toEqual(['Digger', 'Whale', 'Golem'])
    // H1 2026 follows a half with one damage season, so it is left out
    expect(options('power-creep', 'period')).toEqual(['in H2 2025', 'in 2026'])
    expect(options('frames', 'range')).toEqual(['any period', 'in 2025', 'in 2026'])
  })

  it('fills the questions', () => {
    expect(fillQuestion(fact('frames'), { frame: 'tier 3', range: 'any period' })).toBe(
      'How many tier 3 frames have I got?',
    )
    expect(fillQuestion(fact('best-rank'), against('any weakness'))).toBe(
      'What is my best rank against any weakness?',
    )
  })

  it('has the ten facts, all in Raids', () => {
    const facts = FACTS.filter((f) => f.id.startsWith('soloraid-'))
    expect(facts).toHaveLength(10)
    expect(new Set(facts.map((f) => f.category))).toEqual(new Set(['Raids']))
  })
})
