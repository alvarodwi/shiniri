import { describe, expect, it } from 'vitest'

import { A, B, CAMPAIGN, TOWER, compute, floor, row } from './clearRows.fixture'
import type { Row } from './clearRows.fixture'
import { FACTS } from './facts'

type Values = Record<string, string>
const any = 'any period'
const tribe = { group: 'Tribe', range: any }
const makers = { group: 'any manufacturer tower', range: any }
const none = { group: 'Tribe', range: 'in 2024' }
const climb = { range: any }
const before = { range: 'in 2024' }

// each manufacturer tower reaches 25F once, Tetra first
const RACE = [
  floor('Tetra', 25, '2025-01-05 12:00:00'),
  floor('Elysion', 25, '2025-01-07 12:00:00'),
  floor('Missilis', 25, '2025-01-08 12:00:00'),
  floor('Pilgrim', 25, '2025-01-12 12:00:00'),
]
// two equal 25-floor spans
const EVEN = [25, 50, 75].map((n, i) => floor('Tribe', n, `2025-01-0${i + 1} 12:00:00`))

const clears = (tower: string, day: string, n: number) =>
  Array.from({ length: n }, (_, i) => floor(tower, i + 1, `${day} 12:0${i}:00`))
// Tetra is open Mon, Thu and Sun: full on 2, 5 and 13 Jan, one clear on 6, none on 9 and 12
const TETRA = [
  ...clears('Tetra', '2025-01-02', 3),
  ...clears('Tetra', '2025-01-05', 3),
  ...clears('Tetra', '2025-01-06', 1),
  ...clears('Tetra', '2025-01-13', 3),
]
// full, empty, full: two equal streaks
const BROKEN = [...clears('Tetra', '2025-01-02', 3), ...clears('Tetra', '2025-01-06', 3)]
// all four towers full on Sunday 5 Jan, only Tetra on Sunday 12
const SWEEP = [
  ...['Elysion', 'Missilis', 'Tetra', 'Pilgrim'].flatMap((t) => clears(t, '2025-01-05', 3)),
  ...clears('Tetra', '2025-01-12', 3),
]
const tetra = { maker: 'Tetra', range: any }

// [id, values, expected, rows, today]
const CASES: [string, Values, string | null, Row[]?, string?][] = [
  ['favourite-nikke', tribe, 'Liter (3 floors)'], // four tie
  ['favourite-nikke', none, null],
  ['nikke-clears', { ...tribe, nikke: 'Neon' }, '2'],
  ['nikke-clears', { ...makers, nikke: 'Neon' }, '0'],
  ['first-outing', { ...tribe, nikke: 'Alice' }, '11 Jan 2025 (Tribe 50F)'],
  ['first-outing', { ...none, nikke: 'Alice' }, null],
  ['last-outing', { ...tribe, nikke: 'Neon' }, '1 Jan 2025 (Tribe 25F)'],
  ['last-outing', { ...makers, nikke: 'Neon' }, null],
  ['favourite-team', tribe, 'Anis, Crown, Liter, Neon, Rapi (2 floors)'],
  ['favourite-team', none, null],
  ['favourite-duo', tribe, 'Anis and Crown (3 floors)'],
  ['favourite-duo', none, null],
  ['different-nikkes', tribe, '6'],
  ['different-nikkes', none, '0'],
  ['loyal-team', tribe, '2 floors (from Tribe 10F)'],
  ['loyal-team', none, '0'],
  ['benched-longest', tribe, 'Neon (last used 1 Jan 2025)'],
  ['benched-longest', none, null],
  ['newest-recruit', tribe, 'Alice (debut 11 Jan 2025, Tribe 50F)'],
  ['newest-recruit', none, null],
  ['biggest-underdog', tribe, '1,000 CP under, -50% (Tribe 50F)'],
  ['biggest-underdog', none, null],
  ['biggest-overkill', tribe, '2,000 CP over, +200% (Tribe 25F)'],
  ['biggest-overkill', none, null],
  ['underdog-share', tribe, '67'],
  ['underdog-share', tribe, '0', RACE.map((r) => ({ ...r, mode: 'Tribe' }))],
  ['underdog-share', none, null],
  ['passengers', tribe, '1'],
  ['passengers', makers, '0'],
  ['floor-count', tribe, '3'],
  ['floor-count', makers, '2'],
  ['floor-count', none, '0'],
  ['busiest-day', tribe, '2 floors on 1 Jan 2025'],
  ['busiest-day', makers, '1 floor on 5 Jan 2025', RACE], // four tie
  ['busiest-day', none, '0'],
  ['longest-sitting', tribe, '2 floors in 10 min (1 Jan 2025)'],
  ['longest-sitting', none, '0'],
  ['boss-favourite', tribe, 'Liter (2 bosses)'],
  ['boss-favourite', none, null],
  ['underdog-bosses', tribe, '2'],
  ['underdog-bosses', none, '0'],
  ['boss-marathon', tribe, '1 boss floor on 1 Jan 2025'],
  ['boss-marathon', none, '0'],
  ['floor-date', { tower: 'Tribe', floor: '25' }, '1 Jan 2025'],
  ['floor-date', { tower: 'Tetra', floor: '50' }, null],
  ['fastest-milestone', { tower: 'Tribe' }, '10 days 2 h (Tribe 25F to 50F)'],
  ['fastest-milestone', { tower: 'Tribe' }, '1 day (Tribe 25F to 50F)', EVEN],
  ['fastest-milestone', { tower: 'Tetra' }, null],
  ['slowest-milestone', { tower: 'Tribe' }, '1 day (Tribe 25F to 50F)', EVEN],
  ['slowest-milestone', { tower: 'Tetra' }, null],
  ['tribe-wall', climb, '10 days 2 h (before Tribe 50F)'],
  ['tribe-wall', before, null],
  ['floor-race', { floor: '25' }, 'Tetra (Pilgrim last, 7 days behind)', RACE],
  ['floor-race', { floor: '25' }, null],
  ['focus', climb, 'Tetra (2 floors)'],
  ['focus', climb, 'Tetra (1 floor)', RACE], // four tie
  ['focus', before, null],
  ['neglect', climb, 'Elysion (0 floors)'],
  ['neglect', climb, 'Tetra (1 floor)', RACE],
  ['neglect', before, null],
  ['lead', climb, 'Tetra 25F (25 floors over Elysion)'],
  ['lead', climb, 'Tetra 25F (0 floors over Elysion)', RACE],
  ['lead', before, null],
  ['full-days', tetra, '3 of 6 open days (50%)', TETRA, '2025-01-16'], // today is left out
  ['full-days', tetra, '0 of 1 open day (0%)', clears('Tetra', '2025-01-02', 1), '2025-01-03'],
  ['full-days', { ...tetra, range: 'in 2024' }, null, TETRA],
  ['idle-days', tetra, '2', TETRA, '2025-01-16'],
  ['idle-days', { ...tetra, range: 'in 2024' }, '0', TETRA],
  ['full-streak', tetra, '2 open days (from 2 Jan 2025)', TETRA, '2025-01-16'],
  [
    'full-streak',
    { ...tetra, maker: 'any manufacturer tower' },
    '2 open days (Tetra, from 2 Jan 2025)',
    TETRA,
    '2025-01-16',
  ],
  ['full-streak', tetra, '1 open day (from 2 Jan 2025)', BROKEN, '2025-01-07'],
  ['full-streak', { ...tetra, range: 'in 2024' }, '0', TETRA],
  ['longest-break', tetra, '2 open days (from 9 Jan 2025)', TETRA, '2025-01-16'],
  ['longest-break', tetra, '0', BROKEN.slice(0, 3), '2025-01-03'],
  ['clean-sweeps', climb, '1', SWEEP, '2025-01-16'],
  ['clean-sweeps', before, '0', SWEEP],
  ['clean-sweeps', climb, '0', TETRA],
]

// [id, values, expected, tower rows, campaign rows]
const BOTH: [string, Values, string | null, Row[]?, Row[]?][] = [
  ['meanwhile-tribe', { mode: 'Normal', chapter: '2' }, 'Tribe 25F (1 Jan 2025)'],
  ['meanwhile-tribe', { mode: 'Hard', chapter: '3' }, null],
  ['biggest-push', climb, '5 on 1 Jan 2025 (3 stages, 2 floors)'],
  ['biggest-push', before, '0'],
  ['specialist', climb, 'Neon (40% of tower clears, 27% of campaign)'],
  ['specialist', climb, null, CAMPAIGN],
  ['specialist', before, null],
  ['exclusives', climb, '0'],
  ['exclusives', before, '0'],
  [
    'specialist', // Noah and Dorothy tie
    climb,
    'Noah (100% of tower clears, 0% of campaign)',
    [floor('Tribe', 1, '2025-01-01 10:00:00', ['Noah', 'Dorothy'])],
  ],
  [
    'braver-mode', // equal depths: the tower clear is earlier
    climb,
    'Tower (20% under, 20% in the campaign)',
    [floor('Tribe', 1, '2025-01-01 10:00:00', B, 1000, 800)],
    [row('Normal', 1, '1-1 STAGE', '2025-01-05 10:00:00', B, 1000, 800)],
  ],
  ['exclusives', climb, '1', [floor('Tribe', 1, '2025-01-01 10:00:00', ['Noah', ...A.slice(1)])]],
  ['first-deployment', { nikke: 'Alice' }, 'Campaign, 1 Jan 2025 (Normal SUB 2-1)'],
  ['first-deployment', { nikke: 'Neon' }, 'Campaign, 1 Jan 2025 (Normal 2-1)'], // same instant
  ['first-deployment', { nikke: 'Nobody' }, null],
  ['braver-mode', climb, 'Tower (50% under, 25% in the campaign)'],
  ['braver-mode', climb, 'Campaign (25% under, none in a tower)', RACE],
  ['braver-mode', before, null],
  ['double-breakthrough', climb, '1'],
  ['double-breakthrough', before, '0'],
]

describe('Tower facts', () => {
  it.each(CASES)('%s %o is %s', (slug, values, expected, rows = TOWER, today = undefined) => {
    expect(compute(`tower-${slug}`, values, { Tower: rows }, today)).toBe(expected)
  })

  it.each(BOTH)('%s %o is %s', (slug, values, expected, tower = TOWER, campaign = CAMPAIGN) => {
    const id = `tower-${slug}`
    expect(compute(id, values, { Tower: tower, Campaign: campaign })).toBe(expected)
  })

  it('has 40 Modes facts, each covered, seven reading both tabs', () => {
    const facts = FACTS.filter((f) => f.id.startsWith('tower-'))
    expect(facts).toHaveLength(40)
    expect(facts.every((f) => f.category === 'Modes')).toBe(true)
    expect(facts.filter((f) => f.reads.length === 2)).toHaveLength(7)
    expect(new Set([...CASES, ...BOTH].map(([slug]) => `tower-${slug}`))).toEqual(
      new Set(facts.map((f) => f.id)),
    )
  })

  it('keeps titles unique within Modes', () => {
    const titles = FACTS.filter((f) => f.category === 'Modes').map((f) => f.title)
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('offers only floors every manufacturer tower reached to the race', () => {
    const race = FACTS.find((f) => f.id === 'tower-floor-race')!
    const options = race.filters![0].options as (c: unknown) => string[]
    const cols = (rows: Row[]) => ({
      Tower: { mode: rows.map((r) => r.mode), floor: rows.map((r) => r.floor) },
    })
    expect(options(cols(RACE))).toEqual(['25'])
    expect(options(cols(TOWER))).toEqual([])
  })
})
