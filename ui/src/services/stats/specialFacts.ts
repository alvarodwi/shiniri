import { ANOMALY_TAB, SPECIAL_TAB } from '@/config/sheets'
import { distinct, select as anomalyRuns, sumModules } from '@/services/stats/anomalyFacts'
import type { Columns, Fact, Filter, Values } from '@/services/stats/facts'
import { formatCount, formatDate, formatPercent, formatPlural } from '@/services/stats/format'
import { ANY_PERIOD, dateRange, inRange } from '@/services/stats/ranges'
import { firstMax, groupByGameDay } from '@/services/stats/rules'

const { tab } = SPECIAL_TAB
const ANY_BOSS = 'any boss'
// Each run gives exactly one of these.
const OUTCOMES = ['t9', 'modules', 't9Manu', 'empty']
const DROPS: Record<string, string[]> = {
  'a module': ['modules'],
  'T9 gear': ['t9'],
  'manufacturer gear': ['t9Manu'],
  'any gear': ['t9', 't9Manu'],
  nothing: ['empty'],
}

// The dated rows in range, against the chosen boss. `runs` and `drops` read the count columns, so a
// fact that did not declare them gets 0.
function select(
  cols: Columns,
  { boss = ANY_BOSS, range = ANY_PERIOD, drop }: Values,
  today: string,
) {
  const t = cols[tab]
  const within = inRange(range, today)
  const sum = (names: string[], i: number) =>
    names.reduce((total, name) => total + Number(t[name]?.[i] ?? 0), 0)
  return t.date.flatMap((date, i) => {
    const name = String(t.boss?.[i] ?? '')
    return within(date) && (boss === ANY_BOSS || name === boss)
      ? [{ date, boss: name, runs: sum(OUTCOMES, i), drops: sum(DROPS[drop] ?? [], i) }]
      : []
  })
}
type Row = ReturnType<typeof select>[number]

const total = (rows: Row[], key: 'runs' | 'drops') => rows.reduce((sum, r) => sum + r[key], 0)

// One entry per game day, oldest first.
const days = (rows: Row[]) =>
  groupByGameDay(rows.map((r) => r.date)).map(([day, indexes]) => {
    const list = indexes.map((i) => rows[i])
    return { day, runs: total(list, 'runs'), drops: total(list, 'drops') }
  })
type Day = ReturnType<typeof days>[number]

// "6 days, from 3 Oct 2023": the longest run of consecutive calendar dates that match.
function streak(list: Day[], match: (d: Day) => boolean): string | null {
  const streaks: { from: string; length: number }[] = []
  let next = NaN // the date that would extend the current streak
  for (const d of list) {
    if (!match(d)) continue
    const at = Date.parse(d.day)
    if (at === next) streaks[streaks.length - 1].length++
    else streaks.push({ from: d.day, length: 1 })
    next = at + 86_400_000
  }
  const best = firstMax(streaks, (s) => s.length)
  return best ? `${formatPlural(best.length, 'day')}, from ${formatDate(best.from)}` : null
}

const boss: Filter = {
  id: 'boss',
  label: 'Boss',
  options: (cols) => [ANY_BOSS, ...distinct(cols[tab].boss)],
}
const drop: Filter = { id: 'drop', label: 'Drop', options: Object.keys(DROPS) }
// Finished history: a preset would always be empty.
const range = dateRange((cols) => cols[tab].date, { quick: false })

const reads = (...columns: string[]) => [
  { tab: SPECIAL_TAB, columns: ['date', ...columns, ...OUTCOMES] },
]

const bothRange = dateRange((cols) => [...cols[ANOMALY_TAB.tab].date, ...cols[tab].date])
const bothReads = (anomaly: string[], special: string[]) => [
  { tab: ANOMALY_TAB, columns: ['date', ...anomaly] },
  { tab: SPECIAL_TAB, columns: ['date', ...special] },
]

export const SPECIAL_FACTS: Fact[] = [
  {
    id: 'special-runs',
    category: 'Interception',
    title: 'Special runs',
    question: 'How many Special runs did I log against {boss} {range}?',
    filters: [boss, range],
    reads: reads('boss'),
    compute: (c, v, today) => formatCount(total(select(c, v, today), 'runs')),
  },
  {
    id: 'special-double-days',
    category: 'Interception',
    title: 'Special double days',
    question: 'How many double reward days did I have {range}?',
    filters: [range],
    reads: reads(),
    compute: (c, v, today) =>
      formatCount(days(select(c, v, today)).filter((d) => d.runs === 6).length),
  },
  {
    id: 'special-drops',
    category: 'Interception',
    title: 'Special drops',
    question: 'How many runs against {boss} {range} gave {drop}?',
    filters: [boss, drop, range],
    reads: reads('boss'),
    compute: (c, v, today) => formatCount(total(select(c, v, today), 'drops')),
  },
  {
    id: 'special-drop-rate',
    category: 'Interception',
    title: 'Special drop rate',
    question: 'What % of runs against {boss} {range} gave {drop}?',
    filters: [boss, drop, range],
    reads: reads('boss'),
    compute: (c, v, today) => {
      const rows = select(c, v, today)
      return formatPercent(total(rows, 'drops'), total(rows, 'runs'))
    },
  },
  {
    id: 'special-best-day',
    category: 'Interception',
    title: 'Best drop day',
    question: 'What is the most runs in one day against {boss} {range} that gave {drop}?',
    filters: [boss, drop, range],
    reads: reads('boss'),
    compute: (c, v, today) => {
      const best = firstMax(days(select(c, v, today)), (d) => d.drops)
      return best?.drops ? `${formatPlural(best.drops, 'run')}, ${formatDate(best.day)}` : null
    },
  },
  {
    id: 'special-dry-days',
    category: 'Interception',
    title: 'Dry days',
    question: 'On how many days against {boss} {range} did no run give {drop}?',
    filters: [boss, drop, range],
    reads: reads('boss'),
    compute: (c, v, today) =>
      formatCount(days(select(c, v, today)).filter((d) => d.drops === 0).length),
  },
  {
    id: 'special-top-boss',
    category: 'Interception',
    title: 'Top drop boss',
    question: 'Which boss gave me {drop} most often {range}?',
    filters: [drop, range],
    reads: reads('boss'),
    compute: (c, v, today) => {
      const totals = new Map<string, number>()
      for (const r of select(c, v, today))
        if (r.boss) totals.set(r.boss, (totals.get(r.boss) ?? 0) + r.drops)
      const top = firstMax([...totals], ([, n]) => n)
      return top?.[1] ? `${top[0]}, ${formatPlural(top[1], 'run')}` : null
    },
  },
  {
    id: 'special-full-days',
    category: 'Interception',
    title: 'Full house days',
    question: 'On how many days against {boss} {range} did every run give {drop}?',
    filters: [boss, drop, range],
    reads: reads('boss'),
    compute: (c, v, today) =>
      formatCount(days(select(c, v, today)).filter((d) => d.runs > 0 && d.drops === d.runs).length),
  },
  {
    id: 'special-dry-streak',
    category: 'Interception',
    title: 'Longest dry streak',
    question: 'What is the most days in a row {range} that no run gave {drop}?',
    filters: [drop, range],
    reads: reads(),
    compute: (c, v, today) => streak(days(select(c, v, today)), (d) => d.drops === 0),
  },
  {
    id: 'special-drop-streak',
    category: 'Interception',
    title: 'Longest drop streak',
    question: 'What is the most days in a row {range} that at least one run gave {drop}?',
    filters: [drop, range],
    reads: reads(),
    compute: (c, v, today) => streak(days(select(c, v, today)), (d) => d.drops > 0),
  },
  {
    id: 'interception-runs',
    category: 'Interception',
    title: 'All interception runs',
    question: 'How many interception runs did I log {range}?',
    filters: [bothRange],
    reads: bothReads([], OUTCOMES),
    compute: (c, v, today) =>
      formatCount(anomalyRuns(c, v, today).length + total(select(c, v, today), 'runs')),
  },
  {
    id: 'interception-modules',
    category: 'Interception',
    title: 'All interception modules',
    question: 'How many modules have I got from all interception {range}?',
    filters: [bothRange],
    reads: bothReads(['modules'], ['modules']),
    compute: (c, v, today) =>
      formatCount(
        sumModules(anomalyRuns(c, v, today)) +
          total(select(c, { ...v, drop: 'a module' }, today), 'drops'),
      ),
  },
  {
    id: 'interception-days',
    category: 'Interception',
    title: 'Interception days',
    question: 'On how many days did I log interception {range}?',
    filters: [bothRange],
    reads: bothReads([], []),
    compute: (c, v, today) =>
      formatCount(
        groupByGameDay([...anomalyRuns(c, v, today), ...select(c, v, today)].map((r) => r.date))
          .length,
      ),
  },
]
