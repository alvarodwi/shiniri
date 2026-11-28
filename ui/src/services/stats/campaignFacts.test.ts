import { describe, expect, it } from 'vitest'

import { A, B, CAMPAIGN, compute, row } from './clearRows.fixture'
import type { Row } from './clearRows.fixture'
import { FACTS, fillQuestion } from './facts'

type Values = Record<string, string>
const any = { mode: 'any mode', range: 'any period' }
const none = { mode: 'any mode', range: 'in 2024' }
const normal = { ...any, mode: 'Normal' }
const hard = { ...any, mode: 'Hard' }
const of = (mode: string, chapter: string) => ({ mode, chapter })
// two equal fastest and slowest chapters, catch-ups and EX delays
const TIED = [2, 3].flatMap((ch) => [
  row('Normal', ch, `${ch}-1 BOSS`, `2025-0${ch}-01 10:00:00`),
  row('Normal', ch, 'EX STAGE', `2025-0${ch}-02 10:00:00`),
  row('Hard', ch, `${ch}-1 HARD BOSS`, `2025-0${ch}-03 10:00:00`),
])
const UNDATED = [row('Normal', 2, '2-1 STAGE', '', A, 0, 0)]

// three equal gaps, underdogs and sittings, the team alternating
const TWINS = [A, B, A].map((team, i) =>
  row('Normal', 1, `1-${i + 1} STAGE`, `2025-01-0${i + 1} 10:00:00`, team, 1000, 900),
)
const OVER = TWINS.map((r) => ({ ...r, teamCp: 1100 }))
const everyChapter = of('any mode', 'any chapter')

// [slug, values, expected, rows]
const CASES: [string, Values, string | null, Row[]?][] = [
  ['favourite-nikke', any, 'Liter (11 stages)'], // four tie; the first in the first row
  ['favourite-nikke', hard, 'Liter (4 stages)'],
  ['favourite-nikke', none, null],
  ['nikke-clears', { ...any, nikke: 'Neon' }, '3'],
  ['nikke-clears', { ...none, nikke: 'Neon' }, '0'],
  ['first-outing', { ...any, nikke: 'Alice' }, '1 Jan 2025 (Normal SUB 2-1)'],
  ['first-outing', { ...none, nikke: 'Alice' }, null],
  ['last-outing', { ...any, nikke: 'Alice' }, '5 Mar 2025 (Normal EX)'],
  ['last-outing', { ...any, nikke: 'Neon' }, '2 Feb 2025 (Hard 2-3 BOSS)'],
  ['last-outing', { ...none, nikke: 'Neon' }, null],
  ['favourite-team', any, 'Alice, Anis, Crown, Liter, Rapi (8 stages)'],
  ['favourite-team', none, null],
  ['boss-favourite', any, 'Liter (3 bosses)'],
  ['boss-favourite', none, null],
  ['different-nikkes', any, '6'],
  ['different-nikkes', none, '0'],
  ['biggest-underdog', of('any mode', 'any chapter'), '2,000 CP under, -25% (Hard 2-3 BOSS)'],
  ['biggest-underdog', of('Normal', '2'), '500 CP under, -25% (Normal 2-3 BOSS)'],
  ['biggest-underdog', of('Normal', '3'), null],
  ['biggest-overkill', of('any mode', 'any chapter'), '3,000 CP over, +100% (Hard 2-1)'],
  ['biggest-overkill', of('Normal', 'any chapter'), null], // the SUB stage does not count
  ['underdog-share', of('any mode', 'any chapter'), '43'],
  ['underdog-share', of('Normal', '3'), '0'],
  ['underdog-share', of('Normal', '9'), null],
  ['underdog-bosses', any, '2'],
  ['underdog-bosses', none, '0'],
  ['fastest-chapter', any, '20 min (Normal ch. 2, jumped)'],
  ['fastest-chapter', any, '0 min (Normal ch. 2)', TIED],
  ['fastest-chapter', any, null, UNDATED],
  ['slowest-chapter', any, '3 days 2 h (Normal ch. 3)'],
  ['slowest-chapter', hard, '1 day (Hard ch. 2)'],
  ['slowest-chapter', any, null, UNDATED],
  ['chapter-time', of('Normal', '3'), '3 days 2 h (4 Mar 2025)'],
  ['chapter-time', of('Hard', '3'), null],
  ['longest-wall', normal, '58 days 23 h (before Normal 3-1)'],
  ['longest-wall', hard, '1 day (before Hard 2-3 BOSS)'],
  ['longest-wall', any, null, UNDATED],
  ['busiest-day', any, '3 on 1 Jan 2025 (2 story, 1 SUB, 0 EX)'], // ties with 1 Feb
  ['busiest-day', none, '0'],
  ['stage-count', any, '11 (7 story, 1 SUB, 3 EX)'],
  ['stage-count', none, '0'],
  ['skipped-stages', {}, '1'], // Hard 2-2
  ['skipped-stages', {}, '0', TIED],
  ['longest-ex-delay', any, '2 days (Normal ch. 2)'],
  ['longest-ex-delay', any, '1 day (Normal ch. 2)', TIED],
  ['longest-ex-delay', hard, null],
  ['usual-ex-delay', any, '1 day 12 h'],
  ['usual-ex-delay', hard, null],
  ['early-ex', any, '1'],
  ['early-ex', normal, '0'],
  ['chapter-ex-delay', of('Normal', '2'), '2 days (1 EX)'],
  ['chapter-ex-delay', of('Hard', '2'), 'before the boss (1 EX)'],
  ['chapter-ex-delay', of('Hard', '3'), null],
  ['hard-catch-up', { chapter: '2' }, '31 days 23 h (Normal 1 Jan 2025, Hard 2 Feb 2025)'],
  ['hard-catch-up', { chapter: '3' }, null],
  ['fastest-catch-up', {}, '31 days 23 h (ch. 2)'],
  ['fastest-catch-up', {}, '2 days (ch. 2)', TIED],
  ['fastest-catch-up', {}, null, UNDATED],
  ['slowest-catch-up', {}, '2 days (ch. 2)', TIED],
  ['slowest-catch-up', {}, null, UNDATED],
  ['benched-longest', any, 'Neon (last used 2 Feb 2025)'],
  ['benched-longest', none, null],
  ['loyal-team', any, '5 stages (from Normal SUB 2-1)'],
  ['loyal-team', none, '0'],
  ['favourite-duo', any, 'Anis and Crown (11 stages)'],
  ['favourite-duo', none, null],
  ['boss-marathon', any, '1 boss on 1 Jan 2025'],
  ['boss-marathon', none, '0'],
  ['longest-sitting', any, '3 stages in 6 min (1 Feb 2025)'],
  ['longest-sitting', none, '0'],
  ['biggest-underdog', everyChapter, '100 CP under, -10% (Normal 1-1)', TWINS],
  ['biggest-overkill', everyChapter, '100 CP over, +10% (Normal 1-1)', OVER],
  ['longest-wall', any, '1 day (before Normal 1-2)', TWINS],
  ['loyal-team', any, '1 stage (from Normal 1-1)', TWINS],
  ['longest-sitting', any, '1 stage in 0 min (1 Jan 2025)', TWINS],
  [
    'chapter-ex-delay',
    of('Normal', '1'),
    '1 day (1 EX)', // the EX before the boss is not counted
    [
      row('Normal', 1, 'EX STAGE', '2025-01-01 10:00:00'),
      row('Normal', 1, '1-1 BOSS', '2025-01-02 10:00:00'),
      row('Normal', 1, 'EX STAGE', '2025-01-03 10:00:00'),
    ],
  ],
  ['passengers', any, '2'],
  ['passengers', none, '0'],
  ['newest-recruit', any, 'Alice (debut 1 Jan 2025, Normal SUB 2-1)'],
  ['newest-recruit', hard, 'Neon (debut 2 Feb 2025, Hard 2-3 BOSS)'],
  ['newest-recruit', none, null],
  [
    'newest-recruit',
    any,
    'Liter (debut 1 Jan 2025, Normal 1-1)',
    [row('Normal', 1, '1-1 STAGE', '2025-01-01 10:00:00', B)],
  ],
]

describe('Campaign facts', () => {
  it.each(CASES)('%s %o is %s', (slug, values, expected, rows = CAMPAIGN) => {
    expect(compute(`campaign-${slug}`, values, { Campaign: rows })).toBe(expected)
  })

  it('has 32 Modes facts, each covered', () => {
    const facts = FACTS.filter((f) => f.id.startsWith('campaign-'))
    expect(facts).toHaveLength(32)
    expect(facts.every((f) => f.category === 'Modes')).toBe(true)
    expect(new Set(CASES.map(([slug]) => `campaign-${slug}`))).toEqual(
      new Set(facts.map((f) => f.id)),
    )
  })

  it('drops the any slots from the question', () => {
    const fact = FACTS.find((f) => f.id === 'campaign-underdog-share')!
    expect(fillQuestion(fact, of('any mode', 'any chapter'))).toBe(
      'What % of my clears were under the recommended CP?',
    )
    expect(fillQuestion(fact, of('Hard', '3'))).toBe(
      'What % of my Hard clears in chapter 3 were under the recommended CP?',
    )
  })

  it('derives the nikke and chapter options from the data', () => {
    const fact = FACTS.find((f) => f.id === 'campaign-nikke-clears')!
    const options = fact.filters![0].options as (c: unknown) => string[]
    expect(options({ Campaign: { mode: ['Normal'], slot1: ['Rapi'], slot2: ['Anis'] } })).toEqual([
      'Anis',
      'Rapi',
    ])
  })
})
