import { ANOMALY_TAB } from '@/config/sheets'
import type { Columns, Fact, Filter, Values } from '@/services/stats/facts'
import { formatCount, formatDate, formatPercent, formatPlural } from '@/services/stats/format'
import { ANY_PERIOD, dateRange, inRange } from '@/services/stats/ranges'
import { cellGameDay, firstMax, groupByGameDay, topWithCount } from '@/services/stats/rules'

const { tab } = ANOMALY_TAB
const ANY_BOSS = 'any boss'
const ANY_SIZE = 'any size'

// A row without a date is not a run. Columns a fact did not declare read as blank.
function runs(cols: Columns) {
  const t = cols[tab]
  const text = (name: string, i: number) => String(t[name]?.[i] ?? '')
  return t.date.flatMap((date, i) =>
    cellGameDay(date) === null
      ? []
      : [
          {
            date,
            boss: text('boss', i),
            stage: Number(text('stage', i)),
            dropped: text('dropped', i).toUpperCase() === 'TRUE',
            modules: Number(text('modules', i)),
            class: text('class', i),
            manufacturer: text('manufacturer', i),
            slot: text('dropType', i),
          },
        ],
  )
}
type Run = ReturnType<typeof runs>[number]

// The runs in range, against the chosen boss when the fact has one.
function select(cols: Columns, { boss = ANY_BOSS, range = ANY_PERIOD }: Values, today: string) {
  const within = inRange(range, today)
  return runs(cols).filter((r) => within(r.date) && (boss === ANY_BOSS || r.boss === boss))
}

// Kraken never gives gear.
const gearSelect = (cols: Columns, values: Values, today: string) =>
  select(cols, values, today).filter((r) => r.boss !== '' && r.boss !== 'Kraken')
const gearDrops = (cols: Columns, values: Values, today: string) =>
  gearSelect(cols, values, today).filter((r) => r.dropped)
const unguaranteed = (cols: Columns, values: Values, today: string) =>
  gearSelect(cols, values, today).filter((r) => r.stage >= 1 && r.stage < 9)

const hasSize = (size: string) => (r: Run) =>
  size === ANY_SIZE ? r.modules >= 1 : r.modules === Number(size)

const sumModules = (list: Run[]) => list.reduce((sum, r) => sum + r.modules, 0)

// [day, runs] oldest first.
const byDay = (list: Run[]) =>
  groupByGameDay(list.map((r) => r.date)).map(
    ([day, rows]) => [day, rows.map((i) => list[i])] as const,
  )
const firstDay = (list: Run[]) => {
  const day = byDay(list)[0]?.[0]
  return day ? formatDate(day) : null
}

const distinct = (cells: unknown[]) =>
  [...new Set(cells.map((c) => String(c ?? '')))].filter(Boolean)
const bosses = (cols: Columns) => distinct(cols[tab].boss)
const fromData = (id: string, label: string, options: (cols: Columns) => string[]): Filter => ({
  id,
  label,
  options,
})

const boss = fromData('boss', 'Boss', (cols) => [ANY_BOSS, ...bosses(cols)])
const oneBoss = fromData('boss', 'Boss', bosses)
const gearBoss = fromData('boss', 'Boss', (cols) => [
  ANY_BOSS,
  ...bosses(cols).filter((b) => b !== 'Kraken'),
])
const size: Filter = {
  id: 'size',
  label: 'Module size',
  options: [ANY_SIZE, '1', '2', '3'],
  say: (v) => (v === ANY_SIZE ? '' : `of size ${v}`),
}
const manufacturer = fromData('manufacturer', 'Manufacturer', (cols) =>
  distinct(cols[tab].manufacturer),
)
const classType = fromData('class', 'Class', (cols) => distinct(cols[tab].class))
const range = dateRange((cols) => cols[tab].date)

const reads = (...columns: string[]) => [{ tab: ANOMALY_TAB, columns: ['date', ...columns] }]

export const ANOMALY_FACTS: Fact[] = [
  {
    id: 'anomaly-runs',
    category: 'Interception',
    title: 'Anomaly runs',
    question: 'How many runs did I log against {boss} {range}?',
    filters: [boss, range],
    reads: reads('boss'),
    compute: (c, v, today) => formatCount(select(c, v, today).length),
  },
  {
    id: 'anomaly-top-boss',
    category: 'Interception',
    title: 'Most fought boss',
    question: 'Which boss did I fight most {range}?',
    filters: [range],
    reads: reads('boss'),
    compute: (c, v, today) =>
      topWithCount(
        select(c, v, today).map((r) => r.boss),
        'run',
      ),
  },
  {
    id: 'anomaly-first-clear',
    category: 'Interception',
    title: 'First clear',
    question: 'When did I first clear stage 9 against {boss}?',
    filters: [boss],
    reads: reads('boss', 'stage'),
    compute: (c, v, today) => firstDay(select(c, v, today).filter((r) => r.stage === 9)),
  },
  {
    id: 'anomaly-modules',
    category: 'Interception',
    title: 'Modules obtained',
    question: 'How many modules did I get from {boss} {range}?',
    filters: [boss, range],
    reads: reads('boss', 'modules'),
    compute: (c, v, today) => formatCount(sumModules(select(c, v, today))),
  },
  {
    id: 'anomaly-double-days',
    category: 'Interception',
    title: 'Double reward days',
    question: 'How many double reward days did I have {range}?',
    filters: [range],
    reads: reads(),
    compute: (c, v, today) =>
      formatCount(
        byDay(select(c, v, today)).filter(([, dayRuns]) => [6, 10].includes(dayRuns.length)).length,
      ),
  },
  {
    id: 'anomaly-zero-days',
    category: 'Interception',
    title: 'Zero module days',
    question: 'On how many days {range} did I get no modules?',
    filters: [range],
    reads: reads('modules'),
    compute: (c, v, today) =>
      formatCount(
        byDay(select(c, v, today)).filter(([, dayRuns]) => sumModules(dayRuns) === 0).length,
      ),
  },
  {
    id: 'anomaly-first-run',
    category: 'Interception',
    title: 'First attempt',
    question: 'When did I first fight {boss}?',
    filters: [boss],
    reads: reads('boss'),
    compute: (c, v, today) => firstDay(select(c, v, today)),
  },
  {
    id: 'anomaly-module-runs',
    category: 'Interception',
    title: 'Module drop runs',
    question: 'How many runs against {boss} {range} had a module drop {size}?',
    filters: [boss, size, range],
    reads: reads('boss', 'modules'),
    compute: (c, v, today) => formatCount(select(c, v, today).filter(hasSize(v.size)).length),
  },
  {
    id: 'anomaly-gear-runs',
    category: 'Interception',
    title: 'Gear drop runs',
    question: 'How many runs against {boss} {range} dropped gear?',
    filters: [gearBoss, range],
    reads: reads('boss', 'dropped'),
    compute: (c, v, today) => formatCount(gearDrops(c, v, today).length),
  },
  {
    id: 'anomaly-best-day',
    category: 'Interception',
    title: 'Best module day',
    question: 'What is the most modules I got in one day from {boss} {range}?',
    filters: [boss, range],
    reads: reads('boss', 'modules'),
    compute: (c, v, today) => {
      const days = byDay(select(c, v, today)).map(
        ([day, dayRuns]) => [day, sumModules(dayRuns)] as const,
      )
      const best = firstMax(days, ([, n]) => n)
      return best ? `${formatPlural(best[1], 'module')}, ${formatDate(best[0])}` : null
    },
  },
  {
    id: 'anomaly-modules-per-run',
    category: 'Interception',
    title: 'Modules per run',
    question: 'How many modules did I average per run against {boss} {range}?',
    filters: [boss, range],
    reads: reads('boss', 'modules'),
    compute: (c, v, today) => {
      const list = select(c, v, today)
      return list.length ? (sumModules(list) / list.length).toFixed(2) : null
    },
  },
  {
    id: 'anomaly-boss-share',
    category: 'Interception',
    title: 'Boss share',
    question: 'What % of my runs {range} were against {boss}?',
    filters: [oneBoss, range],
    reads: reads('boss'),
    compute: (c, v, today) => {
      const all = select(c, { range: v.range }, today)
      return formatPercent(all.filter((r) => r.boss === v.boss).length, all.length)
    },
  },
  {
    id: 'anomaly-module-rate',
    category: 'Interception',
    title: 'Module drop rate',
    question: 'What % of runs against {boss} {range} had a module drop {size}?',
    filters: [boss, size, range],
    reads: reads('boss', 'modules'),
    compute: (c, v, today) => {
      const list = select(c, v, today)
      return formatPercent(list.filter(hasSize(v.size)).length, list.length)
    },
  },
  {
    id: 'anomaly-gear-rate',
    category: 'Interception',
    title: 'Gear drop rate',
    question: 'What % of runs against {boss} {range} dropped gear?',
    filters: [gearBoss, range],
    reads: reads('boss', 'dropped'),
    compute: (c, v, today) =>
      formatPercent(gearDrops(c, v, today).length, gearSelect(c, v, today).length),
  },
  {
    id: 'anomaly-top-piece',
    category: 'Gear',
    title: 'Top gear piece',
    question: 'Which gear piece did I get most from {boss} {range}?',
    filters: [gearBoss, range],
    reads: reads('boss', 'dropped', 'class', 'manufacturer', 'dropType'),
    compute: (c, v, today) =>
      topWithCount(
        gearDrops(c, v, today).map((r) =>
          r.manufacturer && r.class && r.slot ? `${r.manufacturer} ${r.class} ${r.slot}` : '',
        ),
        'drop',
      ),
  },
  {
    id: 'anomaly-top-manufacturer',
    category: 'Gear',
    title: 'Top gear manufacturer',
    question: 'Which manufacturer did I get most from {boss} {range}?',
    filters: [gearBoss, range],
    reads: reads('boss', 'dropped', 'manufacturer'),
    compute: (c, v, today) =>
      topWithCount(
        gearDrops(c, v, today).map((r) => r.manufacturer),
        'drop',
      ),
  },
  {
    id: 'anomaly-top-class',
    category: 'Gear',
    title: 'Top gear class',
    question: 'Which class did I get most from {boss} {range}?',
    filters: [gearBoss, range],
    reads: reads('boss', 'dropped', 'class'),
    compute: (c, v, today) =>
      topWithCount(
        gearDrops(c, v, today).map((r) => r.class),
        'drop',
      ),
  },
  {
    id: 'anomaly-manufacturer-share',
    category: 'Gear',
    title: 'Manufacturer share',
    question: 'What % of gear from {boss} {range} was {manufacturer}?',
    filters: [manufacturer, gearBoss, range],
    reads: reads('boss', 'dropped', 'manufacturer'),
    compute: (c, v, today) => {
      const known = gearDrops(c, v, today).filter((r) => r.manufacturer)
      return formatPercent(
        known.filter((r) => r.manufacturer === v.manufacturer).length,
        known.length,
      )
    },
  },
  {
    id: 'anomaly-class-share',
    category: 'Gear',
    title: 'Class share',
    question: 'What % of gear from {boss} {range} was for {class}?',
    filters: [classType, gearBoss, range],
    reads: reads('boss', 'dropped', 'class'),
    compute: (c, v, today) => {
      const known = gearDrops(c, v, today).filter((r) => r.class)
      return formatPercent(known.filter((r) => r.class === v.class).length, known.length)
    },
  },
  {
    id: 'anomaly-unguaranteed-runs',
    category: 'Interception',
    title: 'Unguaranteed runs',
    question: 'How many runs against {boss} {range} had no guaranteed gear?',
    filters: [gearBoss, range],
    reads: reads('boss', 'stage'),
    compute: (c, v, today) => formatCount(unguaranteed(c, v, today).length),
  },
  {
    id: 'anomaly-lucky-runs',
    category: 'Interception',
    title: 'Lucky gear runs',
    question: 'How many unguaranteed runs against {boss} {range} still dropped gear?',
    filters: [gearBoss, range],
    reads: reads('boss', 'stage', 'dropped'),
    compute: (c, v, today) =>
      formatCount(unguaranteed(c, v, today).filter((r) => r.dropped).length),
  },
  {
    id: 'anomaly-missed-runs',
    category: 'Interception',
    title: 'Missed gear runs',
    question: 'How many unguaranteed runs against {boss} {range} dropped no gear?',
    filters: [gearBoss, range],
    reads: reads('boss', 'stage', 'dropped'),
    compute: (c, v, today) =>
      formatCount(unguaranteed(c, v, today).filter((r) => !r.dropped).length),
  },
  {
    id: 'anomaly-lucky-rate',
    category: 'Interception',
    title: 'Lucky gear rate',
    question: 'What % of unguaranteed runs against {boss} {range} still dropped gear?',
    filters: [gearBoss, range],
    reads: reads('boss', 'stage', 'dropped'),
    compute: (c, v, today) => {
      const list = unguaranteed(c, v, today)
      return formatPercent(list.filter((r) => r.dropped).length, list.length)
    },
  },
]
