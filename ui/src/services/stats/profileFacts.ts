import { PROFILE_TAB } from '@/config/sheets'
import type { Columns, Fact, Filter, Values } from '@/services/stats/facts'
import {
  formatCount,
  formatDate,
  formatPercent,
  formatPlural,
  formatSigned,
} from '@/services/stats/format'
import { addDays, daysBetween } from '@/services/stats/levelFacts'
import { ANY_PERIOD, dateRange, inRange } from '@/services/stats/ranges'
import { cellGameDay, firstMax } from '@/services/stats/rules'
import { streak } from '@/services/stats/specialFacts'

const { tab } = PROFILE_TAB

const WHAT: Record<string, string[]> = {
  'total gems': ['paidGems', 'freeGems'],
  'free gems': ['freeGems'],
  'paid gems': ['paidGems'],
  credits: ['credits'],
  'battle data': ['battleData'],
  'core dust': ['coreDust'],
  'recruit vouchers': ['recruitVouchers'],
  'advanced recruit vouchers': ['advRecruitVouchers'],
  'silver mileage': ['silverMileage'],
  'gold mileage': ['goldMileage'],
  'account level': ['level'],
}

// The dated snapshots, oldest first.
const snapshots = (cols: Columns) =>
  cols[tab].date
    .flatMap((date, i) => {
      const day = cellGameDay(date)
      return day ? [{ i, day }] : []
    })
    .sort((a, b) => a.day.localeCompare(b.day))

// [day, value] of the chosen thing; a snapshot missing any of its columns is left out.
const series = (cols: Columns, what: string) =>
  snapshots(cols).flatMap(({ i, day }) => {
    const cells = WHAT[what].map((name) => cols[tab][name][i])
    return cells.some((c) => c === '' || c == null)
      ? []
      : [{ day, value: cells.reduce<number>((sum, c) => sum + Number(c), 0) }]
  })
type Point = ReturnType<typeof series>[number]

// The snapshots a change is measured over: the last one before the window (else its first) onwards.
function span(list: Point[], within: (day: string) => boolean): Point[] {
  const first = list.findIndex((p) => within(p.day))
  if (first < 0) return []
  const last = list.reduce((n, p, i) => (within(p.day) ? i : n), first)
  return list.slice(Math.max(first - 1, 0), last + 1)
}
const spanOf = (cols: Columns, { what, range = ANY_PERIOD }: Values, today: string) =>
  span(series(cols, what), inRange(range, today))

// Net change per day over a span; null with fewer than two days.
function rate(list: Point[]): number | null {
  if (!list.length) return null
  const [from, to] = [list[0], list[list.length - 1]]
  const days = daysBetween(from.day, to.day)
  return days > 0 ? (to.value - from.value) / days : null
}

// Server time is UTC+9, two hours ahead of takenAt's WIB. Times are ordered from the 05:00 reset.
const RESET = 5 * 60
function sinceReset(takenAt: unknown): number | null {
  let wib: number
  if (typeof takenAt === 'number') wib = Math.floor((takenAt % 1) * 1440 + 1e-6)
  else {
    const [, h, m] = String(takenAt).match(/ (\d{1,2}):(\d{2})/) ?? []
    if (!h) return null
    wib = Number(h) * 60 + Number(m)
  }
  return (wib + 120 - RESET + 1440) % 1440
}
const clock = (since: number) => {
  const min = (since + RESET) % 1440
  return [Math.floor(min / 60), min % 60].map((n) => String(n).padStart(2, '0')).join(':')
}
// In minutes since the reset: 05:00, 12:00, 18:00 and 00:00 start them.
const SEGMENTS = { morning: 0, afternoon: 420, evening: 780, night: 1140 }
const segmentOf = (since: number) =>
  Object.entries(SEGMENTS)
    .filter(([, from]) => since >= from)
    .at(-1)![0]

// The snapshots in range, in row order, with whether the daily was done (null = blank).
function dailies(cols: Columns, { range = ANY_PERIOD }: Values, today: string) {
  const t = cols[tab]
  const within = inRange(range, today)
  return t.date.flatMap((date, i) => {
    const day = cellGameDay(date)
    if (!day || !within(date)) return []
    const done = String(t.dailyDone[i]).toUpperCase()
    return [
      {
        day,
        done: done === 'TRUE' ? true : done === 'FALSE' ? false : null,
        since: sinceReset(t.takenAt?.[i]),
      },
    ]
  })
}
// The finished days with a readable time.
const finishes = (cols: Columns, values: Values, today: string) =>
  dailies(cols, values, today).flatMap((d) =>
    d.done && d.since !== null ? [{ day: d.day, since: d.since }] : [],
  )
type Finish = ReturnType<typeof finishes>[number]
const timeAndDay = (f: Finish | undefined) => (f ? `${clock(f.since)}, ${formatDate(f.day)}` : null)

const range = dateRange((cols) => cols[tab].date)
const what: Filter = { id: 'what', label: 'What', options: Object.keys(WHAT) }

const reads = (...columns: string[]) => [{ tab: PROFILE_TAB, columns: ['date', ...columns] }]
const growthReads = reads(...new Set(Object.values(WHAT).flat()))
const timingReads = reads('takenAt', 'dailyDone')

export const PROFILE_FACTS: Fact[] = [
  {
    id: 'profile-change',
    category: 'Progress',
    title: 'Net change',
    question: 'How much has my {what} changed {range}?',
    filters: [what, range],
    reads: growthReads,
    compute: (c, v, today) => {
      const list = spanOf(c, v, today)
      if (list.length < 2) return null
      const steps = list.slice(1).map((p, i) => p.value - list[i].value)
      const rises = steps.reduce((sum, n) => sum + Math.max(n, 0), 0)
      const falls = steps.reduce((sum, n) => sum + Math.min(n, 0), 0)
      const net = list[list.length - 1].value - list[0].value
      return `${formatSigned(net)} (${formatSigned(rises)} / ${formatSigned(falls)})`
    },
  },
  {
    id: 'profile-daily-gain',
    category: 'Progress',
    title: 'Daily gain',
    question: 'How much {what} have I gained per day on average {range}?',
    filters: [what, range],
    reads: growthReads,
    compute: (c, v, today) => {
      const perDay = rate(spanOf(c, v, today))
      return perDay === null ? null : formatCount(Math.round(perDay * 10) / 10)
    },
  },
  {
    id: 'profile-best-day',
    category: 'Progress',
    title: 'Best day',
    question: 'What was my biggest one-day rise in {what} {range}?',
    filters: [what, range],
    reads: growthReads,
    compute: (c, v, today) => {
      const list = series(c, v.what)
      const within = inRange(v.range ?? ANY_PERIOD, today)
      const rises = list.slice(1).flatMap((p, i) => {
        const rise = p.value - list[i].value
        return within(p.day) && daysBetween(list[i].day, p.day) === 1 && rise > 0
          ? [{ day: p.day, rise }]
          : []
      })
      const best = firstMax(rises, (r) => r.rise)
      return best ? `${formatSigned(best.rise)}, ${formatDate(best.day)}` : null
    },
  },
  {
    id: 'profile-gem-goal',
    category: 'Progress',
    title: 'Gem goal',
    question: 'When will I reach {amount} gems at my recent rate?',
    filters: [
      { id: 'amount', label: 'Amount', options: ['30,000', '60,000', '90,000', '120,000'] },
    ],
    reads: reads('paidGems', 'freeGems'),
    compute: (c, v, today) => {
      const list = series(c, 'total gems')
      const latest = list.at(-1)
      if (!latest) return null
      const left = Number(v.amount.replace(/,/g, '')) - latest.value
      if (left <= 0) return 'Already reached'
      const since = addDays(today, -30)
      const perDay = rate(span(list, (day) => day >= since))
      return perDay !== null && perDay > 0
        ? formatDate(addDays(latest.day, Math.ceil(left / perDay)))
        : null
    },
  },
  {
    id: 'profile-usual-time',
    category: 'Progress',
    title: 'Usual finish time',
    question: 'By what server time do I usually finish my daily {range}?',
    filters: [range],
    reads: timingReads,
    compute: (c, v, today) => {
      const times = finishes(c, v, today)
        .map((f) => f.since)
        .sort((a, b) => a - b)
      return times.length ? clock(times[Math.floor((times.length - 1) / 2)]) : null
    },
  },
  {
    id: 'profile-earliest',
    category: 'Progress',
    title: 'Earliest finish',
    question: 'What was my earliest daily finish {range}?',
    filters: [range],
    reads: timingReads,
    compute: (c, v, today) => timeAndDay(firstMax(finishes(c, v, today), (f) => -f.since)),
  },
  {
    id: 'profile-latest',
    category: 'Progress',
    title: 'Latest finish',
    question: 'What was my latest daily finish {range}?',
    filters: [range],
    reads: timingReads,
    compute: (c, v, today) => timeAndDay(firstMax(finishes(c, v, today), (f) => f.since)),
  },
  {
    id: 'profile-unfinished',
    category: 'Progress',
    title: 'Unfinished days',
    question: 'On how many days did I leave my daily unfinished {range}?',
    filters: [range],
    reads: reads('dailyDone'),
    compute: (c, v, today) =>
      formatCount(dailies(c, v, today).filter((d) => d.done === false).length),
  },
  {
    id: 'profile-segment-share',
    category: 'Progress',
    title: 'Time of day',
    question: 'What % of days did I finish in the {segment} (server time) {range}?',
    filters: [{ id: 'segment', label: 'Time of day', options: Object.keys(SEGMENTS) }, range],
    reads: timingReads,
    compute: (c, v, today) => {
      const list = finishes(c, v, today)
      return formatPercent(list.filter((f) => segmentOf(f.since) === v.segment).length, list.length)
    },
  },
  {
    id: 'profile-top-segment',
    category: 'Progress',
    title: 'Favourite time',
    question: 'When in the day (server time) do I usually finish {range}?',
    filters: [range],
    reads: timingReads,
    compute: (c, v, today) => {
      const segments = finishes(c, v, today).map((f) => segmentOf(f.since))
      const counts = new Map<string, number>()
      for (const s of segments) counts.set(s, (counts.get(s) ?? 0) + 1)
      const top = firstMax([...counts], ([, n]) => n)
      return top
        ? `${top[0][0].toUpperCase()}${top[0].slice(1)}, ${formatCount(top[1])} of ${formatPlural(segments.length, 'day')}`
        : null
    },
  },
  {
    id: 'profile-streak',
    category: 'Progress',
    title: 'Daily streak',
    question: 'What is my longest run of days with the daily finished {range}?',
    filters: [range],
    reads: reads('dailyDone'),
    compute: (c, v, today) =>
      streak(
        dailies(c, v, today).sort((a, b) => a.day.localeCompare(b.day)),
        (d) => d.done === true,
      ),
  },
]
