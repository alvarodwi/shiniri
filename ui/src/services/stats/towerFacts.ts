import { CAMPAIGN_TAB, TOWER_TAB } from '@/config/sheets'
import {
  benchedLongest,
  biggestOverkill,
  biggestUnderdog,
  busiest,
  clearRange,
  clears,
  debuts,
  differentNikkes,
  favouriteDuo,
  favouriteNikke,
  favouriteTeam,
  longestSitting,
  longestWall,
  loyalTeam,
  newestRecruit,
  nikkeClears,
  nikkeFilter,
  nikkesIn,
  outing,
  passengers,
  timed,
  underdogShare,
  underdogs,
  within,
} from '@/services/stats/clears'
import type { Clear } from '@/services/stats/clears'
import type { Columns, Fact, Filter, Values } from '@/services/stats/facts'
import { formatCount, formatDate, formatDuration, formatPlural } from '@/services/stats/format'
import { dateFields, inRange } from '@/services/stats/ranges'
import { addDays, firstMax } from '@/services/stats/rules'

const TRIBE = 'Tribe'
const ANY_MAKER = 'any manufacturer tower'
// Weekdays (0 = Sunday) on which each manufacturer tower is open.
const OPEN: Record<string, number[]> = {
  Elysion: [2, 5, 0],
  Missilis: [3, 6, 0],
  Tetra: [4, 1, 0],
  Pilgrim: [3, 0],
}
const MAKERS = Object.keys(OPEN)
const DAILY_LIMIT = 3

const all = (cols: Columns) => clears(cols, 'Tower')
const campaign = (cols: Columns) => clears(cols, 'Campaign')
const inGroup = (list: Clear[], group: string) =>
  list.filter((c) => (group === ANY_MAKER ? MAKERS.includes(c.mode) : c.mode === group))
const pick = (cols: Columns, { group, range }: Values, today: string) =>
  within(inGroup(all(cols), group), range, today)
const bossPick = (cols: Columns, values: Values, today: string) =>
  pick(cols, values, today).filter((c) => c.boss)

// The first clear that reached the floor in that tower.
const reached = (list: Clear[], tower: string, floor: number) =>
  timed(list).find((c) => c.mode === tower && c.floor >= floor)
const highest = (list: Clear[], tower: string) =>
  Math.max(0, ...list.filter((c) => c.mode === tower).map((c) => c.floor))
// 25, 50, ... up to `top`.
const steps = (top: number) => Array.from({ length: Math.floor(top / 25) }, (_, i) => (i + 1) * 25)

// Time between consecutive 25-floor milestones of one tower.
function milestone(list: Clear[], tower: string, sign: 1 | -1) {
  const spans = steps(highest(list, tower)).flatMap((floor) => {
    const from = reached(list, tower, floor - 25)
    const to = reached(list, tower, floor)
    return floor > 25 && from && to ? [{ ms: to.at - from.at, floor }] : []
  })
  const best = firstMax(spans, (s) => sign * s.ms)
  return best ? `${formatDuration(best.ms)} (${tower} ${best.floor - 25}F to ${best.floor}F)` : null
}

// Clears per manufacturer tower, in the order each was first seen, so ties go to the earliest row.
function climbed(list: Clear[]) {
  const order = [...new Set([...list.map((c) => c.mode), ...MAKERS])]
  return order
    .filter((m) => MAKERS.includes(m))
    .map((tower) => ({ tower, floors: list.filter((c) => c.mode === tower).length }))
}
function extremeClimb(cols: Columns, { range }: Values, today: string, sign: 1 | -1) {
  const list = climbed(within(all(cols), range, today))
  if (!list.some((t) => t.floors)) return null
  const best = firstMax(list, (t) => sign * t.floors)!
  return `${best.tower} (${formatPlural(best.floors, 'floor')})`
}

type OpenDay = { tower: string; day: string; count: number }
// Each chosen tower's open days in range, from its first clear to yesterday.
function openDays(cols: Columns, { maker, range }: Values, today: string): OpenDay[][] {
  const match = inRange(range, today)
  const list = timed(all(cols))
  const towers = maker && maker !== ANY_MAKER ? [maker] : MAKERS
  return towers.map((tower) => {
    const counts = new Map<string, number>()
    for (const c of list) if (c.mode === tower) counts.set(c.day, (counts.get(c.day) ?? 0) + 1)
    const days: OpenDay[] = []
    const first = [...counts.keys()][0]
    for (let day = first; day && day < today; day = addDays(day, 1))
      if (OPEN[tower].includes(new Date(day).getUTCDay()) && match(day))
        days.push({ tower, day, count: counts.get(day) ?? 0 })
    return days
  })
}
const full = (d: OpenDay) => d.count >= DAILY_LIMIT
const idle = (d: OpenDay) => d.count === 0

// The longest run of open days of one tower that all match.
function openStreak(towers: OpenDay[][], match: (d: OpenDay) => boolean, maker: string) {
  const runs = towers.flatMap((days) => {
    const found: OpenDay[][] = [[]]
    for (const d of days)
      if (match(d)) found[found.length - 1].push(d)
      else found.push([])
    return found.filter((r) => r.length)
  })
  runs.sort((a, b) => a[0].day.localeCompare(b[0].day))
  const best = firstMax(runs, (r) => r.length)
  if (!best) return '0'
  const tower = maker === ANY_MAKER ? `${best[0].tower}, ` : ''
  return `${formatPlural(best.length, 'open day')} (${tower}from ${formatDate(best[0].day)})`
}

function cleanSweeps(cols: Columns, values: Values, today: string) {
  const list = timed(all(cols))
  const starts = MAKERS.map((m) => list.find((c) => c.mode === m)?.day)
  if (starts.some((day) => !day)) return '0'
  const start = (starts as string[]).sort().at(-1)!
  const towers = openDays(cols, { range: values.range }, today)
  const sundays = new Map<string, number>() // Sunday → towers cleared in full
  for (const d of towers.flat())
    if (d.day >= start && new Date(d.day).getUTCDay() === 0 && full(d))
      sundays.set(d.day, (sundays.get(d.day) ?? 0) + 1)
  return formatCount([...sundays.values()].filter((n) => n === MAKERS.length).length)
}

// Both tabs' clears in range.
const both = (cols: Columns, { range }: Values, today: string) => ({
  tower: within(all(cols), range, today),
  campaign: within(campaign(cols), range, today),
})
const shareWith = (list: Clear[], nikke: string) =>
  list.filter((c) => c.team.includes(nikke)).length / list.length
const percent = (share: number) => `${Math.round(share * 100)}%`

// The deepest underdog win, as a share of the recommended CP.
const deepest = (list: Clear[]) => firstMax(underdogs(list), (c) => (c.rec - c.cp) / c.rec)
const depth = (c: Clear) => (c.rec - c.cp) / c.rec

const group: Filter = {
  id: 'group',
  label: 'Tower',
  options: [TRIBE, ANY_MAKER, ...MAKERS],
}
const maker: Filter = { id: 'maker', label: 'Tower', options: [ANY_MAKER, ...MAKERS] }
const tower: Filter = { id: 'tower', label: 'Tower', options: [TRIBE, ...MAKERS] }
const floor: Filter = {
  id: 'floor',
  label: 'Floor',
  options: (cols) => steps(Math.max(0, ...all(cols).map((c) => c.floor))).map(String),
}
const raceFloor: Filter = {
  ...floor,
  options: (cols) => steps(Math.min(...MAKERS.map((m) => highest(all(cols), m)))).map(String),
}
const modeNH: Filter = { id: 'mode', label: 'Mode', options: ['Normal', 'Hard'] }
const chapter: Filter = {
  id: 'chapter',
  label: 'Chapter',
  options: (cols) =>
    [...new Set(campaign(cols).map((c) => c.chapter))].sort((a, b) => a - b).map(String),
}
const nikke = nikkeFilter(all)
const anyNikke = nikkeFilter((cols) => [...campaign(cols), ...all(cols)])
const range = clearRange('Tower')
const bothRange = clearRange('Campaign', 'Tower')

const SLOTS = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5']
const reads = (...columns: string[]) => [{ tab: TOWER_TAB, columns }]
const bothReads = (towerColumns: string[], campaignColumns: string[]) => [
  { tab: TOWER_TAB, columns: towerColumns },
  { tab: CAMPAIGN_TAB, columns: campaignColumns },
]
const teamReads = reads('mode', 'date', ...SLOTS)
const floorTeamReads = reads('mode', 'floor', 'date', ...SLOTS)
const cpReads = reads('mode', 'floor', 'date', 'recommendedCp', 'teamCp')
const floorReads = reads('mode', 'floor', 'date')
const dayReads = reads('mode', 'date')

type Entry = Omit<Fact, 'category'>
const ENTRIES: Entry[] = [
  {
    id: 'tower-favourite-nikke',
    title: 'Tower favourite NIKKE',
    question: 'Which NIKKE have I cleared the most floors with in {group} {range}?',
    filters: [group, range],
    reads: teamReads,
    compute: (c, v, today) => favouriteNikke(pick(c, v, today), 'floor'),
  },
  {
    id: 'tower-nikke-clears',
    title: 'Tower NIKKE clears',
    question: 'How many floors have I cleared with {nikke} in {group} {range}?',
    filters: [nikke, group, range],
    reads: teamReads,
    compute: (c, v, today) => nikkeClears(pick(c, v, today), v.nikke),
  },
  {
    id: 'tower-first-outing',
    title: 'Tower first outing',
    question: 'When did I first clear a floor with {nikke} in {group} {range}?',
    filters: [nikke, group, range],
    reads: floorTeamReads,
    compute: (c, v, today) => outing(pick(c, v, today), v.nikke, 'first'),
  },
  {
    id: 'tower-last-outing',
    title: 'Tower last outing',
    question: 'When did I last clear a floor with {nikke} in {group} {range}?',
    filters: [nikke, group, range],
    reads: floorTeamReads,
    compute: (c, v, today) => outing(pick(c, v, today), v.nikke, 'last'),
  },
  {
    id: 'tower-favourite-team',
    title: 'Tower favourite team',
    question: 'Which five have I used the most in {group} {range}?',
    filters: [group, range],
    reads: teamReads,
    compute: (c, v, today) => favouriteTeam(pick(c, v, today), 'floor'),
  },
  {
    id: 'tower-favourite-duo',
    title: 'Tower favourite duo',
    question: 'Which two NIKKEs have I used together most in {group} {range}?',
    filters: [group, range],
    reads: teamReads,
    compute: (c, v, today) => favouriteDuo(pick(c, v, today), 'floor'),
  },
  {
    id: 'tower-different-nikkes',
    title: 'Tower different NIKKEs',
    question: 'How many different NIKKEs have I cleared floors with in {group} {range}?',
    filters: [group, range],
    reads: teamReads,
    compute: (c, v, today) => differentNikkes(pick(c, v, today)),
  },
  {
    id: 'tower-loyal-team',
    title: 'Tower loyal team',
    question:
      "What is the most floors in a row I've cleared with the same five in {group} {range}?",
    filters: [group, range],
    reads: floorTeamReads,
    compute: (c, v, today) => loyalTeam(pick(c, v, today), 'floor'),
  },
  {
    id: 'tower-benched-longest',
    title: 'Tower benched longest',
    question: 'Which NIKKE have I left unused the longest in {group} {range}?',
    filters: [group, range],
    reads: teamReads,
    compute: (c, v, today) => benchedLongest(pick(c, v, today)),
  },
  {
    id: 'tower-newest-recruit',
    title: 'Tower newest recruit',
    question: 'Which NIKKE most recently made a debut in {group} {range}?',
    filters: [group, range],
    reads: floorTeamReads,
    compute: (c, v, today) => newestRecruit(inGroup(all(c), v.group), v.range, today),
  },
  {
    id: 'tower-biggest-underdog',
    title: 'Tower biggest underdog',
    question: 'How far under the recommended CP have I won in {group} {range}?',
    filters: [group, range],
    reads: cpReads,
    compute: (c, v, today) => biggestUnderdog(pick(c, v, today)),
  },
  {
    id: 'tower-biggest-overkill',
    title: 'Tower biggest overkill',
    question: 'How far over the recommended CP have I been in {group} {range}?',
    filters: [group, range],
    reads: cpReads,
    compute: (c, v, today) => biggestOverkill(pick(c, v, today)),
  },
  {
    id: 'tower-underdog-share',
    title: 'Tower underdog share',
    question: 'What % of my clears in {group} {range} were under the recommended CP?',
    filters: [group, range],
    reads: reads('mode', 'date', 'recommendedCp', 'teamCp'),
    compute: (c, v, today) => underdogShare(pick(c, v, today)),
  },
  {
    id: 'tower-passengers',
    title: 'Tower passengers',
    question: 'How many floors have I cleared with a level 1 NIKKE in the team in {group} {range}?',
    filters: [group, range],
    reads: reads('mode', 'date', 'synchroLevel'),
    compute: (c, v, today) => passengers(pick(c, v, today)),
  },
  {
    id: 'tower-floor-count',
    title: 'Floor count',
    question: 'How many floors have I cleared in {group} {range}?',
    filters: [group, range],
    reads: dayReads,
    compute: (c, v, today) => formatCount(pick(c, v, today).length),
  },
  {
    id: 'tower-busiest-day',
    title: 'Tower busiest day',
    question: "What is the most floors I've cleared in one day in {group} {range}?",
    filters: [group, range],
    reads: dayReads,
    compute: (c, v, today) => {
      const best = busiest(pick(c, v, today))
      return best ? `${formatPlural(best.list.length, 'floor')} on ${formatDate(best.day)}` : '0'
    },
  },
  {
    id: 'tower-longest-sitting',
    title: 'Tower longest sitting',
    question: "What is the most floors I've cleared without a 30-minute break in {group} {range}?",
    filters: [group, range],
    reads: dayReads,
    compute: (c, v, today) => longestSitting(pick(c, v, today), 'floor'),
  },
  {
    id: 'tower-boss-favourite',
    title: 'Tower boss favourite',
    question: 'Which NIKKE have I beaten the most boss floors with in {group} {range}?',
    filters: [group, range],
    reads: floorTeamReads,
    compute: (c, v, today) => favouriteNikke(bossPick(c, v, today), 'boss', 'bosses'),
  },
  {
    id: 'tower-underdog-bosses',
    title: 'Tower underdog bosses',
    question: 'How many boss floors have I beaten under the recommended CP in {group} {range}?',
    filters: [group, range],
    reads: cpReads,
    compute: (c, v, today) => formatCount(underdogs(bossPick(c, v, today)).length),
  },
  {
    id: 'tower-boss-marathon',
    title: 'Tower boss marathon',
    question: "What is the most boss floors I've beaten in one day in {group} {range}?",
    filters: [group, range],
    reads: floorReads,
    compute: (c, v, today) => {
      const best = busiest(bossPick(c, v, today))
      return best
        ? `${formatPlural(best.list.length, 'boss floor')} on ${formatDate(best.day)}`
        : '0'
    },
  },
  {
    id: 'tower-floor-date',
    title: 'Floor date',
    question: 'When did I reach floor {floor} of {tower}?',
    filters: [tower, floor],
    reads: floorReads,
    compute: (c, v) => {
      const clear = reached(all(c), v.tower, Number(v.floor))
      return clear ? formatDate(clear.day) : null
    },
  },
  {
    id: 'tower-fastest-milestone',
    title: 'Fastest 25 floors',
    question: "What is the fastest I've climbed 25 floors of {tower}?",
    filters: [tower],
    reads: floorReads,
    compute: (c, v) => milestone(all(c), v.tower, -1),
  },
  {
    id: 'tower-slowest-milestone',
    title: 'Slowest 25 floors',
    question: 'What is the longest 25 floors of {tower} have taken me?',
    filters: [tower],
    reads: floorReads,
    compute: (c, v) => milestone(all(c), v.tower, 1),
  },
  {
    id: 'tower-tribe-wall',
    title: 'Tribe wall',
    question: "What is the longest I've gone between two Tribe clears {range}?",
    filters: [range],
    reads: floorReads,
    compute: (c, v, today) => longestWall(pick(c, { ...v, group: TRIBE }, today)),
  },
  {
    id: 'tower-floor-race',
    title: 'Floor race',
    question:
      'Which manufacturer tower reached floor {floor} first, and how far behind was the last?',
    filters: [raceFloor],
    reads: floorReads,
    compute: (c, v) => {
      const list = all(c)
      const arrivals = MAKERS.flatMap((m) => reached(list, m, Number(v.floor)) ?? [])
      if (arrivals.length < MAKERS.length) return null
      arrivals.sort((a, b) => a.at - b.at)
      const [first, last] = [arrivals[0], arrivals[arrivals.length - 1]]
      return `${first.mode} (${last.mode} last, ${formatDuration(last.at - first.at)} behind)`
    },
  },
  {
    id: 'tower-focus',
    title: 'Tower focus',
    question: 'Which manufacturer tower did I climb the most {range}?',
    filters: [range],
    reads: dayReads,
    compute: (c, v, today) => extremeClimb(c, v, today, 1),
  },
  {
    id: 'tower-neglect',
    title: 'Tower neglect',
    question: 'Which manufacturer tower did I climb the least {range}?',
    filters: [range],
    reads: dayReads,
    compute: (c, v, today) => extremeClimb(c, v, today, -1),
  },
  {
    id: 'tower-lead',
    title: 'Tower lead',
    question: 'Which manufacturer tower ended up highest {range}, and by how much over the lowest?',
    filters: [range],
    reads: floorReads,
    compute: (c, v, today) => {
      const end = dateFields(v.range, today)[1]
      const list = timed(all(c)).filter((s) => s.day <= end)
      // equal heights: the tower that got there first goes first
      const floors = MAKERS.map((m) => {
        const floor = highest(list, m)
        return { tower: m, floor, at: reached(list, m, floor)?.at ?? 0 }
      }).sort((a, b) => b.floor - a.floor || a.at - b.at)
      const [top, ...rest] = floors
      if (!top.floor) return null
      const bottom = rest.find((f) => f.floor === rest[rest.length - 1].floor)!
      const lead = formatPlural(top.floor - bottom.floor, 'floor')
      return `${top.tower} ${top.floor}F (${lead} over ${bottom.tower})`
    },
  },
  {
    id: 'tower-full-days',
    title: 'Full days',
    question: 'On how many open days of {maker} did I use all three clears {range}?',
    filters: [maker, range],
    reads: dayReads,
    compute: (c, v, today) => {
      const days = openDays(c, v, today).flat()
      if (!days.length) return null
      const used = days.filter(full).length
      const share = Math.round((used / days.length) * 100)
      return `${formatCount(used)} of ${formatPlural(days.length, 'open day')} (${share}%)`
    },
  },
  {
    id: 'tower-idle-days',
    title: 'Idle days',
    question: 'How many open days of {maker} have passed without a clear {range}?',
    filters: [maker, range],
    reads: dayReads,
    compute: (c, v, today) => formatCount(openDays(c, v, today).flat().filter(idle).length),
  },
  {
    id: 'tower-full-streak',
    title: 'Full streak',
    question: 'What is my longest run of full open days of {maker} {range}?',
    filters: [maker, range],
    reads: dayReads,
    compute: (c, v, today) => openStreak(openDays(c, v, today), full, v.maker),
  },
  {
    id: 'tower-clean-sweeps',
    title: 'Clean sweeps',
    question: 'On how many Sundays did I clear all twelve floors {range}?',
    filters: [range],
    reads: dayReads,
    compute: cleanSweeps,
  },
  {
    id: 'tower-longest-break',
    title: 'Longest break',
    question: 'What is the most open days of {maker} in a row without a clear {range}?',
    filters: [maker, range],
    reads: dayReads,
    compute: (c, v, today) => openStreak(openDays(c, v, today), idle, v.maker),
  },
  {
    id: 'tower-meanwhile-tribe',
    title: 'Meanwhile in Tribe',
    question: 'What Tribe floor was I on when I beat {mode} chapter {chapter}?',
    filters: [modeNH, chapter],
    reads: bothReads(['mode', 'floor', 'date'], ['mode', 'chapter', 'stageName', 'date']),
    compute: (c, v) => {
      const boss = timed(campaign(c)).find(
        (s) => s.mode === v.mode && s.chapter === Number(v.chapter) && s.boss,
      )
      if (!boss) return null
      const floor = highest(
        all(c).filter((s) => s.at <= boss.at),
        TRIBE,
      )
      return floor ? `${TRIBE} ${floor}F (${formatDate(boss.day)})` : null
    },
  },
  {
    id: 'tower-biggest-push',
    title: 'Biggest push',
    question: "What is the most stages and floors I've cleared in one day {range}?",
    filters: [bothRange],
    reads: bothReads(['date'], ['date']),
    compute: (c, v, today) => {
      const sides = both(c, v, today)
      const best = busiest([...sides.campaign, ...sides.tower])
      if (!best) return '0'
      const floors = sides.tower.filter((s) => s.day === best.day).length
      const split = `${formatPlural(best.list.length - floors, 'stage')}, ${formatPlural(floors, 'floor')}`
      return `${formatCount(best.list.length)} on ${formatDate(best.day)} (${split})`
    },
  },
  {
    id: 'tower-specialist',
    title: 'Tower specialist',
    question: 'Which NIKKE do I use far more in towers than in the campaign {range}?',
    filters: [bothRange],
    reads: bothReads(['date', ...SLOTS], ['date', ...SLOTS]),
    compute: (c, v, today) => {
      const sides = both(c, v, today)
      if (!sides.tower.length || !sides.campaign.length) return null
      const gaps = nikkesIn(sides.tower).map((nikke) => ({
        nikke,
        tower: shareWith(sides.tower, nikke),
        campaign: shareWith(sides.campaign, nikke),
      }))
      const best = firstMax(
        gaps.filter((g) => g.tower > g.campaign),
        (g) => g.tower - g.campaign,
      )
      return best
        ? `${best.nikke} (${percent(best.tower)} of tower clears, ${percent(best.campaign)} of campaign)`
        : null
    },
  },
  {
    id: 'tower-exclusives',
    title: 'Tower exclusives',
    question: 'How many NIKKEs have I used in towers but never in the campaign {range}?',
    filters: [bothRange],
    reads: bothReads(['date', ...SLOTS], ['date', ...SLOTS]),
    compute: (c, v, today) => {
      const sides = both(c, v, today)
      const used = new Set(nikkesIn(sides.campaign))
      return formatCount(nikkesIn(sides.tower).filter((n) => !used.has(n)).length)
    },
  },
  {
    id: 'tower-first-deployment',
    title: 'First deployment',
    question: 'Did {nikke} debut in the campaign or a tower, and when?',
    filters: [anyNikke],
    reads: bothReads(['mode', 'floor', 'date', ...SLOTS], ['mode', 'stageName', 'date', ...SLOTS]),
    compute: (c, v) => {
      const sides = [
        { where: 'Campaign', clear: debuts(campaign(c)).get(v.nikke) },
        { where: 'Tower', clear: debuts(all(c)).get(v.nikke) },
      ].flatMap(({ where, clear }) => (clear ? [{ where, clear }] : []))
      const first = firstMax(sides, (s) => -s.clear.at)
      return first ? `${first.where}, ${formatDate(first.clear.day)} (${first.clear.name})` : null
    },
  },
  {
    id: 'tower-braver-mode',
    title: 'Braver mode',
    question: 'Have I won further under the recommended CP in the campaign or in a tower {range}?',
    filters: [bothRange],
    reads: bothReads(
      ['date', 'recommendedCp', 'teamCp'],
      ['stageName', 'date', 'recommendedCp', 'teamCp'],
    ),
    compute: (c, v, today) => {
      const sides = both(c, v, today)
      const story = sides.campaign.filter((s) => !/^(sub|ex)\b/i.test(s.stage))
      const found = [
        { where: 'Campaign', other: 'in a tower', best: deepest(story) },
        { where: 'Tower', other: 'in the campaign', best: deepest(sides.tower) },
      ]
      const [a, b] = found.sort(
        (x, y) => (y.best ? depth(y.best) : 0) - (x.best ? depth(x.best) : 0),
      )
      if (!a.best) return null
      const rest = b.best ? percent(depth(b.best)) : 'none'
      return `${a.where} (${percent(depth(a.best))} under, ${rest} ${a.other})`
    },
  },
  {
    id: 'tower-double-breakthrough',
    title: 'Double breakthrough',
    question: 'On how many days did I beat both a campaign boss and a boss floor {range}?',
    filters: [bothRange],
    reads: bothReads(['floor', 'date'], ['stageName', 'date']),
    compute: (c, v, today) => {
      const sides = both(c, v, today)
      const days = (list: Clear[]) => new Set(list.filter((s) => s.boss).map((s) => s.day))
      const floors = days(sides.tower)
      return formatCount([...days(sides.campaign)].filter((d) => floors.has(d)).length)
    },
  },
]

export const TOWER_FACTS: Fact[] = ENTRIES.map((fact) => ({ ...fact, category: 'Modes' }))
