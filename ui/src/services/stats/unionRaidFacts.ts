import { UNION_RAID_TAB, UNION_SEASON_TAB } from '@/config/sheets'
import { distinct } from '@/services/stats/anomalyFacts'
import { SLOT_NAMES } from '@/services/stats/clears'
import type { Columns, Fact, Filter, Values } from '@/services/stats/facts'
import {
  formatCount,
  formatDate,
  formatLarge,
  formatMonth,
  formatPlural,
  formatShare,
} from '@/services/stats/format'
import { addDays, cellGameDay, firstMax, topWithCount } from '@/services/stats/rules'
import { WEAKNESSES } from '@/types/soloRaid'
import type { Weakness } from '@/types/soloRaid'

const RAID = UNION_RAID_TAB.tab
const SEASON = UNION_SEASON_TAB.tab
const ME = 'VAROA'
const HITS_PER_DAY = 3
const ANY_SEASON = 'any season'

// bossElement -> the element it is weak to; the API's "Electronic" shows as "Electric".
const WEAK_TO: Record<string, Weakness> = {
  Fire: 'Water',
  Water: 'Electric',
  Electronic: 'Iron',
  Iron: 'Wind',
  Wind: 'Fire',
}

const sum = (numbers: number[]) => numbers.reduce((a, b) => a + b, 0)
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

// Every row of UnionRaid, oldest season and day first, so ties go to the earliest. A column the fact
// did not declare reads as blank.
function hits(cols: Columns) {
  const t = cols[RAID]
  const text = (name: string, i: number) => String(t[name]?.[i] ?? '')
  return t.nickname
    .flatMap((_, i) => {
      if (!text('season', i) && !text('mode', i)) return []
      return [
        {
          season: Number(text('season', i)),
          day: Number(text('day', i)),
          mode: text('mode', i).toLowerCase(),
          level: Number(text('level', i)),
          boss: text('boss', i),
          weakness: WEAK_TO[text('bossElement', i)] ?? '',
          mine: text('nickname', i) === ME,
          damage: Number(text('damage', i)),
          final: text('finalHit', i).toUpperCase() === 'TRUE',
          team: SLOT_NAMES.map((name) => text(name, i)).filter(Boolean),
        },
      ]
    })
    .sort((a, b) => a.season - b.season || a.day - b.day)
}
type Hit = ReturnType<typeof hits>[number]
const own = (cols: Columns) => hits(cols).filter((h) => h.mine)

// The UnionSeason rows, oldest first.
function raidSeasons(cols: Columns) {
  const t = cols[SEASON]
  const text = (name: string, i: number) => String(t[name]?.[i] ?? '')
  const number = (name: string, i: number) => (text(name, i) ? Number(text(name, i)) : null)
  return t.season
    .flatMap((_, i) => {
      if (!text('season', i)) return []
      return [
        {
          season: Number(text('season', i)),
          start: cellGameDay(t.startDate?.[i]),
          mode: text('mode', i).toLowerCase(),
          level: number('level', i),
          bossesDown: number('bossesDown', i),
          hpLeft: number('hpLeft', i),
          damageDealt: number('damageDealt', i),
        },
      ]
    })
    .sort((a, b) => a.season - b.season)
}
const startOf = (cols: Columns, season: number) =>
  raidSeasons(cols).find((s) => s.season === season)?.start ?? null

// The season numbers of the tab a fact is about, oldest first.
const numbers = (cols: Columns, tab: string) =>
  distinct(cols[tab].season)
    .map(Number)
    .sort((a, b) => a - b)

// The seasons a season filter value picks.
function picked(cols: Columns, tab: string, value: string): Set<number> {
  const all = numbers(cols, tab)
  if (value === ANY_SEASON) return new Set(all)
  const last = value.match(/^the last (\d+) seasons$/)?.[1]
  if (last) return new Set(all.slice(-Number(last)))
  const year = value.match(/^seasons in (\d{4})$/)?.[1]
  if (year) return new Set(all.filter((n) => startOf(cols, n)?.startsWith(year)))
  return new Set([Number(value.replace('season ', ''))])
}
const seasonOf = (value: string) => Number(value.replace('season ', ''))

const seasonFilter = (tab: string): Filter => ({
  id: 'season',
  label: 'Season',
  options: (cols) => {
    const all = numbers(cols, tab)
    const years = distinct(all.map((n) => startOf(cols, n)?.slice(0, 4))).sort()
    return [
      ANY_SEASON,
      'the last 3 seasons',
      'the last 6 seasons',
      ...years.map((y) => `seasons in ${y}`),
      ...all.map((n) => `season ${n}`),
    ]
  },
})
// `skip` drops that many of the earliest seasons.
const singleSeason = (tab: string, skip = 0): Filter => ({
  id: 'season',
  label: 'Season',
  options: (cols) =>
    numbers(cols, tab)
      .slice(skip)
      .map((n) => `season ${n}`),
})

// Own hits in the chosen seasons, in the given mode when there is one.
function select(cols: Columns, { season }: Values, mode?: string): Hit[] {
  const seasons = season === undefined ? null : picked(cols, RAID, season)
  return own(cols).filter(
    (h) => (!seasons || seasons.has(h.season)) && (!mode || h.mode === mode.toLowerCase()),
  )
}
const hard = (cols: Columns, values: Values) => select(cols, values, 'hard')
const against = (list: Hit[], weakness: string) => list.filter((h) => h.weakness === weakness)

// A game day of one season, from every member's rows: a day is one mode.
function raidDays(cols: Columns, mode: string) {
  const days = new Map<string, { season: number; day: number; mine: number }>()
  for (const h of hits(cols)) {
    if (h.mode !== mode.toLowerCase()) continue
    const key = `${h.season}|${h.day}`
    const day = days.get(key) ?? { season: h.season, day: h.day, mine: 0 }
    if (h.mine) day.mine++
    days.set(key, day)
  }
  return [...days.values()]
}
const unused = ({ mine }: { mine: number }) => Math.max(HITS_PER_DAY - mine, 0)

// "season 46, 31 Oct 2026"
function showDay(cols: Columns, { season, day }: { season: number; day: number }) {
  const start = startOf(cols, season)
  const date = start ? `, ${formatDate(addDays(start, day - 1))}` : ''
  return `season ${season}${date}`
}
// The latest by season and day; a tie within the day goes to the earliest row.
const latest = <T extends { season: number; day: number }>(list: T[]) =>
  firstMax(list, (x) => x.season * 1000 + x.day)

const biggest = (list: Hit[]) => {
  const best = firstMax(list, (h) => h.damage)
  return best ? `${formatLarge(best.damage)} (season ${best.season})` : null
}
const average = (list: Hit[]) =>
  list.length
    ? `${formatLarge(sum(list.map((h) => h.damage)) / list.length)} over ${formatPlural(list.length, 'hit')}`
    : null

// Own damage per season with a hit in the list, oldest first.
function totals(list: Hit[]): [number, number][] {
  const map = new Map<number, number>()
  for (const h of list) map.set(h.season, (map.get(h.season) ?? 0) + h.damage)
  return [...map]
}
const signedLarge = (n: number) => `${n > 0 ? '+' : ''}${formatLarge(n)}`
// The chosen season against the one before it in the list.
function change(list: [number, number][], value: string) {
  const i = list.findIndex(([season]) => season === seasonOf(value))
  return i > 0 ? signedLarge(list[i][1] - list[i - 1][1]) : null
}

// Own hard hits on one boss in one day, when there are exactly as many as the team name says.
function teams(list: Hit[], team: string) {
  const map = new Map<string, Hit[]>()
  for (const h of list) {
    const key = `${h.season}|${h.day}|${h.boss}`
    map.set(key, [...(map.get(key) ?? []), h])
  }
  const size = team === 'triple' ? 3 : 2
  return [...map.values()]
    .filter((group) => group.length === size)
    .map((group) => ({ ...group[0], damage: sum(group.map((h) => h.damage)) }))
}

const used = (list: Hit[]) => new Set(list.flatMap((h) => h.team))
const withNikke = (list: Hit[], nikke: string) => list.filter((h) => h.team.includes(nikke))

const isLevel4 = (s: { mode: string; level: number | null }) => s.mode === 'hard' && s.level === 4
// Seasons that reached hard level 4.
const level4 = (cols: Columns) => raidSeasons(cols).filter(isLevel4)
const dealt = (cols: Columns) =>
  level4(cols).flatMap((s): [number, number][] =>
    s.damageDealt === null ? [] : [[s.season, s.damageDealt]],
  )

const mode: Filter = { id: 'mode', label: 'Mode', options: ['Normal', 'Hard'] }
const weakness: Filter = { id: 'weakness', label: 'Weakness', options: [...WEAKNESSES] }
const team: Filter = { id: 'team', label: 'Team', options: ['double', 'triple'] }
const nikke: Filter = {
  id: 'nikke',
  label: 'NIKKE',
  options: (cols) => [...used(own(cols))].sort((a, b) => a.localeCompare(b)),
}
const season = seasonFilter(RAID)
const oneSeason = singleSeason(RAID)
const progressSeason = singleSeason(SEASON)

const raid = (...columns: string[]) => ({
  tab: UNION_RAID_TAB,
  columns: ['nickname', ...columns],
})
const progress = (...columns: string[]) => ({
  tab: UNION_SEASON_TAB,
  columns: ['season', ...columns],
})
// For a fact with a season filter: the years come from UnionSeason's startDate.
const seasonal = (...columns: string[]) => [raid('season', ...columns), progress('startDate')]
const PROGRESS = ['mode', 'level']

const fact = (f: Omit<Fact, 'category'>): Fact => ({ category: 'Raids', ...f })

export const UNION_RAID_FACTS: Fact[] = [
  fact({
    id: 'unionraid-union-raid-hits',
    title: 'Union raid hits',
    question: 'How many {mode} hits did I make in {season}?',
    filters: [mode, season],
    reads: seasonal('mode'),
    compute: (c, v) => formatCount(select(c, v, v.mode).length),
  }),
  fact({
    id: 'unionraid-unused-hits',
    title: 'Unused hits',
    question: 'How many {mode} hits did I leave unused in {season}?',
    filters: [mode, season],
    reads: seasonal('day', 'mode'),
    compute: (c, v) => {
      const seasons = picked(c, RAID, v.season)
      return formatCount(
        sum(
          raidDays(c, v.mode)
            .filter((d) => seasons.has(d.season))
            .map(unused),
        ),
      )
    },
  }),
  fact({
    id: 'unionraid-last-unused-hit',
    title: 'Last unused hit',
    question: 'When did I last leave a {mode} hit unused?',
    filters: [mode],
    reads: [raid('season', 'day', 'mode'), progress('startDate')],
    compute: (c, v) => {
      const last = latest(raidDays(c, v.mode).filter((d) => unused(d) > 0))
      return last ? showDay(c, last) : null
    },
  }),
  fact({
    id: 'unionraid-seasons-joined',
    title: 'Seasons joined',
    question: 'In how many seasons have I hit?',
    reads: [raid('season')],
    compute: (c) => formatCount(totals(own(c)).length),
  }),
  fact({
    id: 'unionraid-biggest-hard-hit',
    title: 'Biggest hard hit',
    question: 'What is my biggest Hard hit in {season}?',
    filters: [season],
    reads: seasonal('mode', 'damage'),
    compute: (c, v) => biggest(hard(c, v)),
  }),
  fact({
    id: 'unionraid-average-hard-hit',
    title: 'Average hard hit',
    question: 'What is my average Hard hit in {season}?',
    filters: [season],
    reads: seasonal('mode', 'damage'),
    compute: (c, v) => average(hard(c, v)),
  }),
  fact({
    id: 'unionraid-hard-season-damage',
    title: 'Hard season damage',
    question: 'How much Hard damage did I deal in {season}?',
    filters: [season],
    reads: seasonal('mode', 'damage'),
    compute: (c, v) => formatLarge(sum(hard(c, v).map((h) => h.damage))),
  }),
  fact({
    id: 'unionraid-best-raid-season',
    title: 'Best raid season',
    question: 'In which season did I deal the most Hard damage?',
    reads: [raid('season', 'mode', 'damage')],
    compute: (c) => {
      const best = firstMax(totals(hard(c, {})), ([, damage]) => damage)
      return best ? `season ${best[0]}, ${formatLarge(best[1])}` : null
    },
  }),
  fact({
    id: 'unionraid-season-damage-change',
    title: 'Season damage change',
    question: 'How much did my Hard damage change in {season}?',
    filters: [oneSeason],
    reads: [raid('season', 'mode', 'damage')],
    compute: (c, v) => change(totals(hard(c, {})), v.season),
  }),
  fact({
    id: 'unionraid-improved-seasons',
    title: 'Improved seasons',
    question: 'In how many seasons did I beat my previous Hard damage?',
    reads: [raid('season', 'mode', 'damage')],
    compute: (c) => {
      const list = totals(hard(c, {}))
      return formatCount(list.filter(([, d], i) => i > 0 && d > list[i - 1][1]).length)
    },
  }),
  fact({
    id: 'unionraid-favourite-hard-weakness',
    title: 'Favourite hard weakness',
    question: 'Which weakness did I hit most in Hard mode in {season}?',
    filters: [season],
    reads: seasonal('mode', 'bossElement'),
    compute: (c, v) =>
      topWithCount(
        hard(c, v).map((h) => h.weakness),
        'hit',
      ),
  }),
  fact({
    id: 'unionraid-best-by-weakness',
    title: 'Best by weakness',
    question: 'What is my biggest Hard hit on {weakness}-weak bosses in {season}?',
    filters: [weakness, season],
    reads: seasonal('mode', 'bossElement', 'damage'),
    compute: (c, v) => biggest(against(hard(c, v), v.weakness)),
  }),
  fact({
    id: 'unionraid-average-by-weakness',
    title: 'Average by weakness',
    question: 'What is my average Hard hit on {weakness}-weak bosses in {season}?',
    filters: [weakness, season],
    reads: seasonal('mode', 'bossElement', 'damage'),
    compute: (c, v) => average(against(hard(c, v), v.weakness)),
  }),
  fact({
    id: 'unionraid-different-bosses-hit',
    title: 'Different bosses hit',
    question: 'How many different bosses have I hit in Hard mode?',
    reads: [raid('mode', 'boss')],
    compute: (c) => formatCount(distinct(hard(c, {}).map((h) => h.boss)).length),
  }),
  fact({
    id: 'unionraid-level-four-hits',
    title: 'Level four hits',
    question: 'How many level 4 hits have I made in {season}?',
    filters: [season],
    reads: seasonal('mode', 'level'),
    compute: (c, v) => formatCount(hard(c, v).filter((h) => h.level === 4).length),
  }),
  fact({
    id: 'unionraid-hard-final-hits',
    title: 'Hard final hits',
    question: 'How many bosses have I finished in Hard mode in {season}?',
    filters: [season],
    reads: seasonal('mode', 'finalHit'),
    compute: (c, v) => formatCount(hard(c, v).filter((h) => h.final).length),
  }),
  fact({
    id: 'unionraid-last-hard-finish',
    title: 'Last hard finish',
    question: 'When did I last land a Hard final hit?',
    reads: [raid('season', 'day', 'mode', 'boss', 'finalHit'), progress('startDate')],
    compute: (c) => {
      const last = latest(hard(c, {}).filter((h) => h.final))
      return last ? `${last.boss} (${showDay(c, last)})` : null
    },
  }),
  fact({
    id: 'unionraid-favourite-raid-nikke',
    title: 'Favourite raid NIKKE',
    question: 'Which NIKKE did I use most in {mode} mode in {season}?',
    filters: [mode, season],
    reads: seasonal('mode', ...SLOT_NAMES),
    compute: (c, v) =>
      topWithCount(
        select(c, v, v.mode).flatMap((h) => h.team),
        'hit',
      ),
  }),
  fact({
    id: 'unionraid-nikke-hit-count',
    title: 'NIKKE hit count',
    question: 'In how many hits did I use {nikke} in {season}?',
    filters: [nikke, season],
    reads: seasonal(...SLOT_NAMES),
    compute: (c, v) => formatCount(withNikke(select(c, v), v.nikke).length),
  }),
  fact({
    id: 'unionraid-raid-roster-size',
    title: 'Raid roster size',
    question: 'How many different NIKKEs have I used in {season}?',
    filters: [season],
    reads: seasonal(...SLOT_NAMES),
    compute: (c, v) => formatCount(used(select(c, v)).size),
  }),
  fact({
    id: 'unionraid-best-with-nikke',
    title: 'Best with NIKKE',
    question: 'What is my biggest Hard hit with {nikke}?',
    filters: [nikke],
    reads: [raid('mode', 'damage', ...SLOT_NAMES)],
    compute: (c, v) => {
      const best = firstMax(withNikke(hard(c, {}), v.nikke), (h) => h.damage)
      return best ? formatLarge(best.damage) : null
    },
  }),
  fact({
    id: 'unionraid-last-teamed-boss',
    title: 'Last teamed boss',
    question: 'Which boss did I last {team}-team?',
    filters: [team],
    reads: [raid('season', 'day', 'mode', 'boss'), progress('startDate')],
    compute: (c, v) => {
      const last = latest(teams(hard(c, {}), v.team))
      return last ? `${last.boss} (${showDay(c, last)})` : null
    },
  }),
  fact({
    id: 'unionraid-teamed-boss-damage',
    title: 'Teamed boss damage',
    question: 'What is my biggest {team}-team damage on one boss in {season}?',
    filters: [team, season],
    reads: seasonal('day', 'mode', 'boss', 'damage'),
    compute: (c, v) => {
      const best = firstMax(teams(hard(c, v), v.team), (t) => t.damage)
      return best ? `${formatLarge(best.damage)}, ${best.boss} (season ${best.season})` : null
    },
  }),
  fact({
    id: 'unionraid-new-raid-nikkes',
    title: 'New raid NIKKEs',
    question: 'How many NIKKEs did I use for the first time in {season}?',
    filters: [singleSeason(RAID, 1)], // in the earliest season every NIKKE would be new
    reads: [raid('season', ...SLOT_NAMES)],
    compute: (c, v) => {
      const chosen = seasonOf(v.season)
      const list = own(c)
      const before = used(list.filter((h) => h.season < chosen))
      const now = used(list.filter((h) => h.season === chosen))
      return formatCount([...now].filter((n) => !before.has(n)).length)
    },
  }),
  fact({
    id: 'unionraid-longest-serving-nikke',
    title: 'Longest-serving NIKKE',
    question: 'Which NIKKE have I used in the most seasons in a row?',
    reads: [raid('season', ...SLOT_NAMES)],
    compute: (c) => {
      const list = own(c)
      const run = new Map<string, number>()
      const longest = new Map<string, number>()
      for (const n of numbers(c, RAID)) {
        const now = used(list.filter((h) => h.season === n))
        for (const name of run.keys()) if (!now.has(name)) run.set(name, 0)
        for (const name of now) {
          run.set(name, (run.get(name) ?? 0) + 1)
          longest.set(name, Math.max(longest.get(name) ?? 0, run.get(name)!))
        }
      }
      const best = firstMax([...longest], ([, length]) => length)
      return best ? `${best[0]}, ${formatPlural(best[1], 'season')}` : null
    },
  }),
  fact({
    id: 'unionraid-perfect-attendance-streak',
    title: 'Perfect attendance streak',
    question: 'What is my longest streak of seasons using every {mode} hit?',
    filters: [mode],
    reads: [raid('season', 'day', 'mode')],
    compute: (c, v) => {
      const perfect = new Map<number, boolean>() // only seasons with a day of the mode
      for (const d of raidDays(c, v.mode))
        perfect.set(d.season, (perfect.get(d.season) ?? true) && unused(d) === 0)
      if (!perfect.size) return null
      let current = 0
      let longest = 0
      for (const ok of perfect.values()) {
        current = ok ? current + 1 : 0
        longest = Math.max(longest, current)
      }
      return formatCount(longest)
    },
  }),
  fact({
    id: 'unionraid-weakness-staple',
    title: 'Weakness staple',
    question: 'Which NIKKE is my staple against {weakness}-weak bosses in {season}?',
    filters: [weakness, season],
    reads: seasonal('mode', 'bossElement', ...SLOT_NAMES),
    compute: (c, v) => {
      const list = hard(c, v)
      const staples = [...used(against(list, v.weakness))]
        .map((name) => {
          const all = withNikke(list, name)
          return { name, here: against(all, v.weakness).length, all: all.length }
        })
        .filter((s) => s.here * 2 > s.all)
      const best = firstMax(staples, (s) => s.here)
      return best ? `${best.name} (${best.here} of ${formatPlural(best.all, 'hit')})` : null
    },
  }),
  fact({
    id: 'unionraid-union-progress',
    title: 'Union progress',
    question: 'How far did the union get in {season}?',
    filters: [progressSeason],
    reads: [progress(...PROGRESS, 'bossesDown', 'hpLeft', 'damageDealt')],
    compute: (c, v) => {
      const s = raidSeasons(c).find((r) => r.season === seasonOf(v.season))
      if (!s?.mode || s.level === null) return null
      const where = `${capitalise(s.mode)} level ${s.level}`
      if (isLevel4(s))
        return s.damageDealt === null
          ? null
          : `${where}, ${formatLarge(s.damageDealt)} damage dealt`
      if (s.bossesDown === null || s.hpLeft === null) return null
      return `${where}, ${formatPlural(s.bossesDown, 'boss', 'bosses')} down, ${formatLarge(s.hpLeft)} HP left`
    },
  }),
  fact({
    id: 'unionraid-level-4-seasons',
    title: 'Level 4 seasons',
    question: 'In how many seasons did the union reach Hard level 4?',
    reads: [progress(...PROGRESS)],
    compute: (c) => formatCount(level4(c).length),
  }),
  fact({
    id: 'unionraid-first-level-4',
    title: 'First level 4',
    question: 'When did the union first reach Hard level 4?',
    reads: [progress('startDate', ...PROGRESS)],
    compute: (c) => {
      const first = level4(c)[0]
      if (!first) return null
      return `season ${first.season}${first.start ? `, ${formatMonth(first.start)}` : ''}`
    },
  }),
  fact({
    id: 'unionraid-most-level-4-damage',
    title: 'Most level 4 damage',
    question: "What is the union's most level 4 damage in {season}?",
    filters: [seasonFilter(SEASON)],
    reads: [progress('startDate', ...PROGRESS, 'damageDealt')],
    compute: (c, v) => {
      const seasons = picked(c, SEASON, v.season)
      const best = firstMax(
        dealt(c).filter(([n]) => seasons.has(n)),
        ([, damage]) => damage,
      )
      return best ? `${formatLarge(best[1])} (season ${best[0]})` : null
    },
  }),
  fact({
    id: 'unionraid-level-4-change',
    title: 'Level 4 change',
    question: "How much did the union's level 4 damage change in {season}?",
    filters: [progressSeason],
    reads: [progress(...PROGRESS, 'damageDealt')],
    compute: (c, v) => change(dealt(c), v.season),
  }),
  fact({
    id: 'unionraid-level-4-share',
    title: 'Level 4 share',
    question: "What % of the union's level 4 damage was mine in {season}?",
    filters: [progressSeason],
    reads: [progress(...PROGRESS, 'damageDealt'), raid('season', 'mode', 'level', 'damage')],
    compute: (c, v) => {
      const total = dealt(c).find(([n]) => n === seasonOf(v.season))?.[1]
      // A season whose hits are not on the sheet yet would read as a false 0.
      if (!total || !numbers(c, RAID).includes(seasonOf(v.season))) return null
      const mine = sum(
        hard(c, v)
          .filter((h) => h.level === 4)
          .map((h) => h.damage),
      )
      return formatShare(mine, total)
    },
  }),
  fact({
    id: 'unionraid-nearest-level-4',
    title: 'Nearest level 4',
    question: 'In which season did the union come closest to level 4 without reaching it?',
    reads: [progress(...PROGRESS, 'hpLeft')],
    compute: (c) => {
      const stopped = raidSeasons(c).filter(
        (s) => s.mode === 'hard' && s.level === 3 && s.hpLeft !== null,
      )
      const best = firstMax(stopped, (s) => -s.hpLeft!)
      return best ? `season ${best.season}, ${formatLarge(best.hpLeft!)} HP left` : null
    },
  }),
]
