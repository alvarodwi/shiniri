import { LEVEL_STEP } from '@/config/limits'
import { LEVEL_TAB } from '@/config/sheets'
import type { Columns, Fact } from '@/services/stats/facts'
import { formatCount, formatDate, formatPlural } from '@/services/stats/format'
import { ANY_PERIOD, dateRange, inRange } from '@/services/stats/ranges'
import { addDays, cellGameDay, daysBetween, firstMax, groupByGameDay } from '@/services/stats/rules'

const { tab } = LEVEL_TAB
// The dated milestones, oldest first; a day keeps its row order. Approximated rows count too.
const milestones = (cols: Columns) =>
  cols[tab].date
    .flatMap((date, i) => {
      const day = cellGameDay(date)
      const level = Number(cols[tab].synchroLevel[i])
      return day && level ? [{ day, level }] : []
    })
    .sort((a, b) => a.day.localeCompare(b.day))
type Milestone = ReturnType<typeof milestones>[number]

// Days per level from the last milestone before the window (else its first) to its last one.
function daysPerLevel(list: Milestone[], within: (m: Milestone) => boolean): number | null {
  const first = list.findIndex(within)
  if (first < 0) return null
  const from = list[Math.max(first - 1, 0)]
  const to = list.filter(within).at(-1)!
  const gained = to.level - from.level
  return gained > 0 ? daysBetween(from.day, to.day) / gained : null
}

// The days with two or more milestones, with the level they started from (none on the first day).
function jumps(cols: Columns) {
  const list = milestones(cols)
  return groupByGameDay(list.map((m) => m.day)).flatMap(([day, rows]) =>
    rows.length < 2
      ? []
      : [{ day, from: list[rows[0] - 1]?.level, to: Math.max(...rows.map((i) => list[i].level)) }],
  )
}

const range = dateRange((cols) => cols[tab].date)
const reads = [{ tab: LEVEL_TAB, columns: ['synchroLevel', 'date'] }]

export const LEVEL_FACTS: Fact[] = [
  {
    id: 'levellog-pace',
    category: 'Progress',
    title: 'Level-up pace',
    question: 'How many days has it taken me on average to gain {levels} {range}?',
    filters: [{ id: 'levels', label: 'Levels', options: ['1 level', '5 levels'] }, range],
    reads,
    compute: (c, v, today) => {
      const within = inRange(v.range ?? ANY_PERIOD, today)
      const pace = daysPerLevel(milestones(c), (m) => within(m.day))
      return pace === null ? null : (pace * (v.levels === '1 level' ? 1 : LEVEL_STEP)).toFixed(1)
    },
  },
  {
    id: 'levellog-jumps',
    category: 'Progress',
    title: 'Level jumps',
    question: 'How many level jumps have I made {range}?',
    filters: [range],
    reads,
    compute: (c, v, today) => {
      const within = inRange(v.range ?? ANY_PERIOD, today)
      return formatCount(jumps(c).filter((j) => within(j.day)).length)
    },
  },
  {
    id: 'levellog-last-jump',
    category: 'Progress',
    title: 'Last level jump',
    question: 'What was my last level jump?',
    reads,
    compute: (c) => {
      const last = jumps(c).at(-1)
      return last?.from ? `${last.from} to ${last.to}, ${formatDate(last.day)}` : null
    },
  },
  {
    id: 'levellog-next',
    category: 'Progress',
    title: 'Next milestone',
    question: 'When will I likely reach my next synchro milestone?',
    reads,
    compute: (c, _, today) => {
      const list = milestones(c)
      const yearAgo = addDays(today, -365)
      const pace = daysPerLevel(list, (m) => m.day >= yearAgo)
      if (pace === null) return null
      const last = list.at(-1)!
      const next = (Math.floor(last.level / LEVEL_STEP) + 1) * LEVEL_STEP
      return `${next}, ${formatDate(addDays(last.day, Math.round(pace * LEVEL_STEP)))}`
    },
  },
  {
    id: 'levellog-slowest',
    category: 'Progress',
    title: 'Slowest milestone',
    question: 'Which 5 levels took me longest {range}?',
    filters: [range],
    reads,
    compute: (c, v, today) => {
      const within = inRange(v.range ?? ANY_PERIOD, today)
      const list = milestones(c)
      const steps = list.slice(1).flatMap((to, i) => {
        const from = list[i]
        return within(to.day)
          ? [{ from: from.level, to: to.level, days: daysBetween(from.day, to.day) }]
          : []
      })
      const slowest = firstMax(steps, (s) => s.days)
      return slowest
        ? `${slowest.from} to ${slowest.to}, ${formatPlural(slowest.days, 'day')}`
        : null
    },
  },
]
