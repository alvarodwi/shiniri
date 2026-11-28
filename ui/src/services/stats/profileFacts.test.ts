import { describe, expect, it } from 'vitest'

import { FACTS } from './facts'

const fact = (id: string) => FACTS.find((f) => f.id === id)!
type Row = Record<string, unknown>
const compute = (id: string, rows: Row[], values: Record<string, string>) =>
  fact(id).compute(
    {
      Profile: Object.fromEntries(
        fact(id).reads[0].columns.map((name) => [name, rows.map((r) => r[name] ?? '')]),
      ),
    },
    values,
    '2026-11-27',
  )

// takenAt is WIB; server time is two hours later
const row = (date: string, freeGems: number, time: string, dailyDone: boolean): Row => ({
  date,
  freeGems,
  paidGems: 1000,
  credits: 5,
  takenAt: `${date} ${time}:59`,
  dailyDone,
})
const ROWS = [
  row('2025-12-31', 9000, '05:59', true), // morning, 07:59
  row('2026-11-01', 10000, '17:59', true), // evening, 19:59
  row('2026-11-02', 13000, '17:59', true), // evening, 19:59
  row('2026-11-03', 12000, '23:59', true), // night, 01:59
  row('2026-11-04', 12500, '02:59', false),
  row('2026-11-08', 20000, '12:59', true), // afternoon, 14:59
  { date: '' },
]
const TIED = [
  row('2026-11-01', 100, '05:59', true),
  row('2026-11-02', 200, '17:59', true),
  row('2026-11-03', 300, '17:59', false),
  row('2026-11-04', 300, '05:59', true),
]
const FLAT = [row('2026-11-01', 5, '05:59', false), row('2026-11-02', 5, '05:59', false)]

// two equal finishes, and two equal two-day runs
const PAIRS = [
  row('2026-11-01', 100, '17:59', true),
  row('2026-11-02', 100, '17:59', true),
  row('2026-11-04', 100, '05:59', true),
  row('2026-11-05', 100, '05:59', true),
]
// loses 1 gem over 30 days
const SLIGHT_LOSS = [row('2026-10-01', 100, '05:59', true), row('2026-10-31', 99, '05:59', true)]

const any = { range: 'any period' }
const nov = { range: '2026-11-01..2026-11-08' }
const none = { range: 'in 2022' }
const gems = (range: { range: string }, what = 'free gems') => ({ ...range, what })

// [id, values, rows, expected]
const CASES: [string, Record<string, string>, Row[], string | null][] = [
  // from the snapshot before the range
  ['change', gems(nov), ROWS, '+11,000 (+12,000 / -1,000)'],
  ['change', gems({ range: 'in 2025' }), ROWS, null], // one snapshot only
  ['change', gems(any, 'total gems'), ROWS, '+11,000 (+12,000 / -1,000)'],
  ['change', gems(any, 'paid gems'), ROWS, '0 (0 / 0)'],
  ['change', gems(none), ROWS, null],
  // 11,000 over 312 days
  ['daily-gain', gems(any), ROWS, '35.3'],
  ['daily-gain', gems(any, 'paid gems'), ROWS, '0'],
  ['daily-gain', gems(any), SLIGHT_LOSS, '0'],
  ['daily-gain', gems(none), ROWS, null],
  // 8 Nov follows a gap, so its +7,500 does not count
  ['best-day', gems(any), ROWS, '+3,000, 2 Nov 2026'],
  ['best-day', gems(any), TIED, '+100, 2 Nov 2026'], // tie: earliest
  ['best-day', gems(any), FLAT, null],
  ['best-day', gems(none), ROWS, null],
  // 21,000 now. Rate from the last snapshot before the 30 days: 11,000 over 312 days, else over 7
  ['gem-goal', { amount: '30,000' }, ROWS, '22 Jul 2027'],
  ['gem-goal', { amount: '30,000' }, ROWS.slice(1), '15 Nov 2026'],
  ['gem-goal', { amount: '30,000' }, FLAT, null],
  ['gem-goal', { amount: '30,000' }, [row('2026-11-08', 30000, '05:59', true)], 'Already reached'],
  ['gem-goal', { amount: '30,000' }, [], null],
  // 07:59 14:59 19:59 19:59 01:59, ordered from the 05:00 reset
  ['usual-time', any, ROWS, '19:59'],
  ['usual-time', any, TIED.slice(0, 2), '07:59'], // even count: earlier middle
  ['usual-time', any, FLAT, null],
  ['earliest', any, ROWS, '07:59, 31 Dec 2025'],
  ['earliest', any, TIED, '07:59, 1 Nov 2026'], // tie: earliest row
  ['earliest', any, FLAT, null],
  ['latest', any, ROWS, '01:59, 3 Nov 2026'],
  ['latest', any, PAIRS, '19:59, 1 Nov 2026'], // tie: earliest row
  ['latest', any, FLAT, null],
  ['unfinished', any, ROWS, '1'],
  ['unfinished', none, ROWS, '0'],
  ['segment-share', { ...any, segment: 'evening' }, ROWS, '40'],
  ['segment-share', { ...any, segment: 'night' }, TIED, '0'],
  ['segment-share', { ...any, segment: 'night' }, FLAT, null],
  ['top-segment', any, ROWS, 'Evening, 2 of 5 days'],
  ['top-segment', any, TIED.slice(0, 2), 'Morning, 1 of 2 days'], // tie: earliest row
  ['top-segment', any, FLAT, null],
  ['streak', any, ROWS, '3 days, from 1 Nov 2026'],
  ['streak', any, TIED, '2 days, from 1 Nov 2026'],
  ['streak', any, PAIRS, '2 days, from 1 Nov 2026'], // tie: earliest run
  ['streak', any, FLAT, null],
]

describe('profile facts', () => {
  it.each(CASES)('profile-%s %o', (id, values, rows, expected) => {
    expect(compute(`profile-${id}`, rows, values)).toBe(expected)
  })

  it('has all 11 facts in Progress', () => {
    const facts = FACTS.filter((f) => f.id.startsWith('profile-'))
    expect(facts).toHaveLength(11)
    expect(facts.every((f) => f.category === 'Progress')).toBe(true)
  })

  it('reads booleans as the API or the mock returns them', () => {
    const rows = [{ date: '2026-11-01', dailyDone: 'FALSE' }]
    expect(compute('profile-unfinished', rows, any)).toBe('1')
  })
})
