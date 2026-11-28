import { describe, expect, it } from 'vitest'

import { FACTS, fillQuestion } from './facts'
import { UNION_RAID_FACTS } from './unionRaidFacts'

const fact = (id: string) => FACTS.find((f) => f.id === `unionraid-${id}`)!

type Row = Record<string, unknown>
const hit = (season: number, day: number, mode: string, over: Row = {}): Row => ({
  season,
  day,
  mode,
  level: 1,
  boss: 'Ultra',
  bossElement: 'Fire',
  nickname: 'VAROA',
  damage: 1e9,
  finalHit: false,
  slot1: 'Liter',
  slot2: 'Crown',
  slot3: '',
  slot4: '',
  slot5: '',
  ...over,
})
const season = (
  n: number,
  startDate: string,
  mode = '',
  level: number | '' = '',
  over: Row = {},
) => ({
  season: n,
  startDate,
  mode,
  level,
  bossesDown: '',
  hpLeft: '',
  damageDealt: '',
  ...over,
})

// Only the declared columns are handed over, so a missing declaration fails here.
function cols(id: string, hits: Row[], seasons: Row[]) {
  const rows: Record<string, Row[]> = { UnionRaid: hits, UnionSeason: seasons }
  return Object.fromEntries(
    fact(id).reads.map(({ tab, columns }) => [
      tab.tab,
      Object.fromEntries(columns.map((name) => [name, rows[tab.tab].map((r) => r[name])])),
    ]),
  )
}

const SEASONS = [
  season(44, '2025-09-26', 'hard', 3, { bossesDown: 1, hpLeft: 20e9 }),
  season(45, '2026-09-25', 'hard', 4, { damageDealt: 561e9 }),
  season(46, '2026-10-30', 'hard', 4, { damageDealt: 1030e9 }),
  season(47, '2026-11-06', 'hard', 3, { bossesDown: 3, hpLeft: 15.2e9 }),
  season(48, '2026-11-20'), // no level data
]

const whale = { boss: 'Whale', bossElement: 'Electronic' }
const HITS = [
  // 45: full normal day; two hard hits on one boss
  hit(45, 1, 'normal'),
  hit(45, 1, 'normal'),
  hit(45, 1, 'normal'),
  hit(45, 2, 'hard', { level: 4, damage: 4e9, finalHit: true }),
  hit(45, 2, 'hard', { level: 4, damage: 6e9 }),
  hit(45, 2, 'hard', { nickname: 'other', damage: 99e9, slot1: 'Noah' }),
  // 46: out of row order; three hard hits on Whale; one normal hit
  hit(46, 2, 'hard', { ...whale, level: 4, damage: 12e9, finalHit: 'TRUE', slot2: 'Alice' }),
  hit(46, 2, 'hard', { ...whale, level: 4, damage: 15e9, slot2: 'Alice' }),
  hit(46, 2, 'hard', { ...whale, level: 4, damage: 15e9, slot2: 'Alice' }),
  hit(46, 1, 'normal'),
  // 47: I skipped the whole day
  hit(47, 1, 'hard', { nickname: 'other' }),
]
const NONE: Row[] = [hit(45, 1, 'normal', { nickname: 'other', slot1: '', slot2: '' })]

const compute = (id: string, values: Record<string, string> = {}, hits = HITS, seasons = SEASONS) =>
  fact(id).compute(cols(id, hits, seasons), values, '2026-11-28')

const any = { season: 'any season' }
const in46 = { season: 'season 46' }
const hard = { ...any, mode: 'Hard' }
const electric = { ...any, weakness: 'Water' }
const iron = { ...any, weakness: 'Iron' }

// [id, values, normal answer]
const CASES: [string, Record<string, string>, string | null][] = [
  ['union-raid-hits', hard, '5'],
  ['union-raid-hits', { mode: 'Normal', season: 'season 46' }, '1'],
  ['union-raid-hits', { mode: 'Hard', season: 'seasons in 2025' }, '0'],
  ['unused-hits', hard, '4'], // 1 in season 45, 3 in the skipped day of 47
  ['unused-hits', { mode: 'Normal', season: 'season 45' }, '0'],
  ['last-unused-hit', { mode: 'Hard' }, 'season 47, 6 Nov 2026'],
  ['last-unused-hit', { mode: 'Normal' }, 'season 46, 30 Oct 2026'],
  ['seasons-joined', {}, '2'],
  ['biggest-hard-hit', any, '15B (season 46)'],
  ['average-hard-hit', any, '10.4B over 5 hits'],
  ['hard-season-damage', any, '52B'],
  ['best-raid-season', {}, 'season 46, 42B'],
  ['season-damage-change', in46, '+32B'],
  ['season-damage-change', { season: 'season 45' }, null],
  ['improved-seasons', {}, '1'],
  ['favourite-hard-weakness', any, 'Iron, 3 hits'], // Electronic is weak to Iron
  ['best-by-weakness', electric, '6B (season 45)'],
  ['best-by-weakness', iron, '15B (season 46)'],
  ['average-by-weakness', electric, '5B over 2 hits'],
  ['different-bosses-hit', {}, '2'],
  ['level-four-hits', any, '5'],
  ['hard-final-hits', any, '2'],
  ['last-hard-finish', {}, 'Whale (season 46, 31 Oct 2026)'],
  ['favourite-raid-nikke', hard, 'Liter, 5 hits'],
  ['nikke-hit-count', { ...any, nikke: 'Alice' }, '3'],
  ['raid-roster-size', any, '3'], // another member's Noah is not mine
  ['best-with-nikke', { nikke: 'Crown' }, '6B'],
  ['last-teamed-boss', { team: 'double' }, 'Ultra (season 45, 26 Sep 2026)'],
  ['last-teamed-boss', { team: 'triple' }, 'Whale (season 46, 31 Oct 2026)'],
  ['teamed-boss-damage', { ...any, team: 'double' }, '10B, Ultra (season 45)'],
  ['teamed-boss-damage', { ...any, team: 'triple' }, '42B, Whale (season 46)'],
  ['new-raid-nikkes', in46, '1'],
  ['new-raid-nikkes', { season: 'season 47' }, '0'],
  ['longest-serving-nikke', {}, 'Liter, 2 seasons'], // ties with Crown
  ['perfect-attendance-streak', { mode: 'Normal' }, '1'],
  ['perfect-attendance-streak', { mode: 'Hard' }, '1'],
  ['weakness-staple', electric, 'Crown (2 of 2 hits)'],
  ['weakness-staple', iron, 'Liter (3 of 5 hits)'], // ties with Alice, seen first
  ['union-progress', { season: 'season 47' }, 'Hard level 3, 3 bosses down, 15.2B HP left'],
  ['union-progress', in46, 'Hard level 4, 1.03T damage dealt'],
  ['union-progress', { season: 'season 48' }, null],
  ['level-4-seasons', {}, '2'],
  ['first-level-4', {}, 'season 45, Sep 2026'],
  ['most-level-4-damage', any, '1.03T (season 46)'],
  ['most-level-4-damage', { season: 'seasons in 2025' }, null],
  ['level-4-change', in46, '+469B'],
  ['level-4-change', { season: 'season 45' }, null],
  ['level-4-change', { season: 'season 47' }, null],
  ['level-4-share', in46, '4.1'],
  ['level-4-share', { season: 'season 47' }, null],
  ['nearest-level-4', {}, 'season 47, 15.2B HP left'],
]

describe('union raid facts', () => {
  it.each(CASES)('%s %o', (id, values, expected) => {
    expect(compute(id, values)).toBe(expected)
  })

  // With no own hits and no level progress: null, or 0 for a count.
  const EMPTY: Record<string, string> = {
    'union-raid-hits': '0',
    'seasons-joined': '0',
    'hard-season-damage': '0',
    'improved-seasons': '0',
    'different-bosses-hit': '0',
    'level-four-hits': '0',
    'hard-final-hits': '0',
    'nikke-hit-count': '0',
    'raid-roster-size': '0',
    'new-raid-nikkes': '0',
    'level-4-seasons': '0',
    'perfect-attendance-streak': '0',
  }
  it.each(CASES)('%s %o without anything to count', (id, values) => {
    // Unused hits count every day I missed, so they have no empty answer here.
    if (id === 'unused-hits' || id === 'last-unused-hit') return
    const normalOnly = [{ ...NONE[0], mode: values.mode?.toLowerCase() ?? 'normal' }]
    const blank = [season(45, '2026-09-25'), season(46, '2026-10-30'), season(47, '2026-11-06')]
    expect(compute(id, values, normalOnly, blank)).toBe(EMPTY[id] ?? null)
  })

  it('has no unused answer without a day of the mode', () => {
    expect(compute('unused-hits', hard, NONE)).toBe('0')
    expect(compute('last-unused-hit', { mode: 'Hard' }, NONE)).toBeNull()
    expect(compute('perfect-attendance-streak', { mode: 'Hard' }, NONE)).toBeNull()
  })

  it('answers 0% when I missed level 4, and nothing when the hits are not on the sheet', () => {
    const missed = [hit(46, 2, 'hard', { nickname: 'other', level: 4 })]
    expect(compute('level-4-share', in46, missed)).toBe('0')
    expect(compute('level-4-share', in46, NONE)).toBeNull()
  })

  it('gives ties to the earliest', () => {
    const tied = [
      hit(46, 1, 'hard', { boss: 'B', slot1: 'Crown', slot2: '', finalHit: true }),
      hit(45, 1, 'hard', { boss: 'A', slot1: 'Liter', slot2: '' }),
      hit(46, 1, 'hard', { boss: 'C', slot1: 'Alice', slot2: '', finalHit: true }),
    ]
    expect(compute('biggest-hard-hit', any, tied)).toBe('1B (season 45)')
    expect(compute('favourite-raid-nikke', hard, tied)).toBe('Liter, 1 hit')
    expect(compute('last-hard-finish', {}, tied)).toBe('B (season 46, 30 Oct 2026)')
    expect(compute('best-by-weakness', electric, tied)).toBe('1B (season 45)')
    expect(compute('best-raid-season', {}, tied.slice(0, 2))).toBe('season 45, 1B')
    const elements = [hit(46, 1, 'hard', { bossElement: 'Iron' }), hit(45, 1, 'hard')]
    expect(compute('favourite-hard-weakness', any, elements)).toBe('Water, 1 hit')
    const doubles = ['B', 'B', 'A', 'A'].map((boss) => hit(45, 1, 'hard', { boss }))
    expect(compute('last-teamed-boss', { team: 'double' }, doubles)).toContain('B (season 45')
    expect(compute('teamed-boss-damage', { ...any, team: 'double' }, doubles)).toBe(
      '2B, B (season 45)',
    )
    const near = [45, 46].map((n) => season(n, '2026-10-30', 'hard', 3, { hpLeft: 1e9 }))
    expect(compute('nearest-level-4', {}, tied, near)).toBe('season 45, 1B HP left')
    const level = [45, 46].map((n) => season(n, '2026-10-30', 'hard', 4, { damageDealt: 1e9 }))
    expect(compute('most-level-4-damage', any, tied, level)).toBe('1B (season 45)')
  })

  it('counts the last seasons back from the newest in the tab', () => {
    const old = hit(40, 1, 'hard', { damage: 7e9 })
    expect(compute('hard-season-damage', any, [old, ...HITS])).toBe('59B')
    expect(compute('hard-season-damage', { season: 'the last 3 seasons' }, [old, ...HITS])).toBe(
      '52B',
    )
  })

  it('offers seasons from the tab the fact is about', () => {
    const options = (id: string) => {
      const f = fact(id).filters!.find((x) => x.id === 'season')!
      return (f.options as (c: unknown) => string[])(cols(id, HITS, SEASONS))
    }
    expect(options('union-raid-hits')).toEqual([
      'any season',
      'the last 3 seasons',
      'the last 6 seasons',
      'seasons in 2026',
      'season 45',
      'season 46',
      'season 47',
    ])
    expect(options('new-raid-nikkes')).toEqual(['season 46', 'season 47'])
    expect(options('union-progress')).toHaveLength(5)
  })

  it('fills its questions', () => {
    const f = fact('best-by-weakness')
    expect(fillQuestion(f, { weakness: 'Electric', season: 'season 46' })).toBe(
      'What is my biggest Hard hit on Electric-weak bosses in season 46?',
    )
  })

  it('has 34 facts, each tested', () => {
    expect(UNION_RAID_FACTS).toHaveLength(34)
    expect(new Set(CASES.map(([id]) => `unionraid-${id}`)).size).toBe(34)
  })
})
