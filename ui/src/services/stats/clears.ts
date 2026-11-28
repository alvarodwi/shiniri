import type { Columns, Filter } from '@/services/stats/facts'
import {
  formatCount,
  formatDate,
  formatDuration,
  formatPercent,
  formatPlural,
  formatSigned,
} from '@/services/stats/format'
import { dateRange, inRange } from '@/services/stats/ranges'
import { cellGameDay, cellTime, firstMax, groupByGameDay } from '@/services/stats/rules'

// What the Campaign and Tower tabs share: one row per stage or floor clear.

export const SLOT_NAMES = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5']

// Columns a fact did not declare read as blank.
export function clears(cols: Columns, tab: 'Campaign' | 'Tower') {
  const t = cols[tab]
  const length = Math.max(...Object.values(t).map((c) => c.length))
  const text = (name: string, i: number) => String(t[name]?.[i] ?? '')
  return Array.from({ length }, (_, i) => {
    const mode = text('mode', i)
    const stage = text('stageName', i)
    const floor = Number(t.floor?.[i])
    return {
      date: t.date?.[i],
      at: cellTime(t.date?.[i]),
      day: cellGameDay(t.date?.[i]) ?? '',
      mode,
      stage,
      floor,
      chapter: Number(t.chapter?.[i]),
      // "Tetra 1045F", "Hard 46-40 BOSS"
      name:
        tab === 'Tower'
          ? `${mode} ${floor}F`
          : `${mode} ${stage.replace(/ HARD\b/, '').replace(/ STAGE$/, '')}`,
      boss: tab === 'Tower' ? floor % 10 === 0 : stage.endsWith('BOSS'),
      team: SLOT_NAMES.map((s) => text(s, i)).filter(Boolean),
      rec: Number(t.recommendedCp?.[i]),
      cp: Number(t.teamCp?.[i]),
      synchro: text('synchroLevel', i),
    }
  }).sort((a, b) => (a.at || Infinity) - (b.at || Infinity) || 0) // undated rows keep sheet order, last
}
export type Clear = ReturnType<typeof clears>[number]

// Campaign stages only; SUB and EX are side stages.
export const kind = (c: Clear) =>
  /^sub\b/i.test(c.stage) ? 'SUB' : /^ex\b/i.test(c.stage) ? 'EX' : 'story'
export const story = (list: Clear[]) => list.filter((c) => kind(c) === 'story')
export const chapterNumbers = (list: Clear[]) =>
  [...new Set(list.map((c) => c.chapter))].sort((a, b) => a - b).map(String)

export const within = (list: Clear[], range: string, today: string) => {
  const match = inRange(range, today)
  return list.filter((c) => match(c.date))
}
export const timed = (list: Clear[]) => list.filter((c) => !Number.isNaN(c.at))

export const nikkesIn = (list: Clear[]) => [...new Set(list.flatMap((c) => c.team))]
export const nikkeFilter = (options: (cols: Columns) => Clear[]): Filter => ({
  id: 'nikke',
  label: 'NIKKE',
  options: (cols) => nikkesIn(options(cols)).sort((a, b) => a.localeCompare(b)),
})
export const clearRange = (...tabs: string[]) =>
  dateRange((cols) => tabs.flatMap((tab) => cols[tab].date))

// The most frequent key with its count; a tie goes to the one seen first.
const mostCommon = (keys: string[]) => {
  const counts = new Map<string, number>()
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1)
  return firstMax([...counts], ([, n]) => n)
}
const counted = (keys: string[], unit: string, plural?: string) => {
  const top = mostCommon(keys)
  return top ? `${top[0]} (${formatPlural(top[1], unit, plural)})` : null
}

export const favouriteNikke = (list: Clear[], unit: string, plural?: string) =>
  counted(
    list.flatMap((c) => c.team),
    unit,
    plural,
  )
const teamKey = (c: Clear) => [...c.team].sort((a, b) => a.localeCompare(b)).join(', ')
export const favouriteTeam = (list: Clear[], unit: string) =>
  counted(list.filter((c) => c.team.length === 5).map(teamKey), unit)
export const favouriteDuo = (list: Clear[], unit: string) =>
  counted(
    list.flatMap((c) => {
      const team = [...c.team].sort((a, b) => a.localeCompare(b))
      return team.flatMap((a, i) => team.slice(i + 1).map((b) => `${a} and ${b}`))
    }),
    unit,
  )

export const nikkeClears = (list: Clear[], nikke: string) =>
  formatCount(list.filter((c) => c.team.includes(nikke)).length)
export const differentNikkes = (list: Clear[]) => formatCount(nikkesIn(list).length)
export function outing(list: Clear[], nikke: string, which: 'first' | 'last') {
  const used = list.filter((c) => c.day && c.team.includes(nikke))
  const clear = used.at(which === 'first' ? 0 : -1)
  return clear ? `${formatDate(clear.day)} (${clear.name})` : null
}

// The longest run of clears in time order where `joins` links each one to the one before.
function longestRun(list: Clear[], joins: (a: Clear, b: Clear) => boolean) {
  const runs: Clear[][] = []
  for (const c of timed(list)) {
    const run = runs.at(-1)
    if (run && joins(run[run.length - 1], c)) run.push(c)
    else runs.push([c])
  }
  return firstMax(runs, (r) => r.length)
}

export function loyalTeam(list: Clear[], unit: string) {
  const best = longestRun(list, (a, b) => teamKey(a) === teamKey(b))
  return best ? `${formatPlural(best.length, unit)} (from ${best[0].name})` : '0'
}

export function longestSitting(list: Clear[], unit: string) {
  const best = longestRun(list, (a, b) => b.at - a.at <= 30 * 60_000)
  if (!best) return '0'
  const duration = formatDuration(best[best.length - 1].at - best[0].at)
  return `${formatPlural(best.length, unit)} in ${duration} (${formatDate(best[0].day)})`
}

export function benchedLongest(list: Clear[]) {
  const last = new Map<string, Clear>()
  for (const c of timed(list)) for (const n of c.team) last.set(n, c)
  const oldest = firstMax([...last], ([, c]) => -c.at)
  return oldest ? `${oldest[0]} (last used ${formatDate(oldest[1].day)})` : null
}

// Each NIKKE's first clear, in time order.
export function debuts(list: Clear[]) {
  const first = new Map<string, Clear>()
  for (const c of timed(list)) for (const n of c.team) if (!first.has(n)) first.set(n, c)
  return first
}
// Debuts come from the whole history; the range only picks which ones count.
export function newestRecruit(list: Clear[], range: string, today: string) {
  const match = inRange(range, today)
  const newest = firstMax(
    [...debuts(list)].filter(([, c]) => match(c.date)),
    ([, c]) => c.at,
  )
  return newest ? `${newest[0]} (debut ${formatDate(newest[1].day)}, ${newest[1].name})` : null
}

// The gap is teamCp - recommendedCp; a row without a recommended CP has none.
const rated = (list: Clear[]) => list.filter((c) => c.rec > 0 && c.cp > 0)
export const underdogs = (list: Clear[]) => rated(list).filter((c) => c.cp < c.rec)
const percentOf = (c: Clear) => Math.round(((c.cp - c.rec) / c.rec) * 100)

export function biggestUnderdog(list: Clear[]) {
  const c = firstMax(underdogs(list), (c) => c.rec - c.cp)
  return c ? `${formatCount(c.rec - c.cp)} CP under, ${percentOf(c)}% (${c.name})` : null
}
export function biggestOverkill(list: Clear[]) {
  const c = firstMax(
    rated(list).filter((c) => c.cp > c.rec),
    (c) => c.cp - c.rec,
  )
  return c
    ? `${formatCount(c.cp - c.rec)} CP over, ${formatSigned(percentOf(c))}% (${c.name})`
    : null
}
export const underdogShare = (list: Clear[]) =>
  formatPercent(underdogs(list).length, rated(list).length)

// synchroLevel is one level, or lists one per slot.
export const passengers = (list: Clear[]) =>
  formatCount(list.filter((c) => c.synchro.split(',').some((l) => Number(l) === 1)).length)

// The game day with the most clears.
export function busiest(list: Clear[]) {
  const days = groupByGameDay(list.map((c) => c.date))
  const best = firstMax(days, ([, rows]) => rows.length)
  return best ? { day: best[0], list: best[1].map((i) => list[i]) } : null
}

// "40 days 3 h (before Hard 34-12)": the longest gap between consecutive clears of one mode.
export function longestWall(list: Clear[]) {
  const last = new Map<string, number>()
  const gaps = timed(list).flatMap((c) => {
    const before = last.get(c.mode)
    last.set(c.mode, c.at)
    return before === undefined ? [] : [{ ms: c.at - before, name: c.name }]
  })
  const wall = firstMax(gaps, (g) => g.ms)
  return wall ? `${formatDuration(wall.ms)} (before ${wall.name})` : null
}
