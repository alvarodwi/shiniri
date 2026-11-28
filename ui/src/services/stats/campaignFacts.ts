import { CAMPAIGN_TAB } from '@/config/sheets'
import {
  benchedLongest,
  biggestOverkill,
  biggestUnderdog,
  SLOT_NAMES,
  busiest,
  chapterNumbers,
  clearRange,
  clears,
  differentNikkes,
  favouriteDuo,
  favouriteNikke,
  favouriteTeam,
  kind,
  longestSitting,
  longestWall,
  loyalTeam,
  newestRecruit,
  nikkeClears,
  nikkeFilter,
  outing,
  passengers,
  story,
  timed,
  underdogShare,
  underdogs,
  within,
} from '@/services/stats/clears'
import type { Clear } from '@/services/stats/clears'
import type { Columns, Fact, Filter, Values } from '@/services/stats/facts'
import { formatCount, formatDate, formatDuration, formatPlural } from '@/services/stats/format'
import { firstMax } from '@/services/stats/rules'

const ANY_MODE = 'any mode'
const ANY_CHAPTER = 'any chapter'
const MODES = ['Normal', 'Hard']

const all = (cols: Columns) => clears(cols, 'Campaign')
const ofMode = (list: Clear[], mode = ANY_MODE) =>
  list.filter((c) => mode === ANY_MODE || c.mode === mode)

// The clears of the chosen mode, chapter and range; a filter the fact lacks keeps everything.
function select(cols: Columns, { mode, chapter, range }: Values, today = '') {
  const list = ofMode(all(cols), mode).filter(
    (c) => !chapter || chapter === ANY_CHAPTER || c.chapter === Number(chapter),
  )
  return range ? within(list, range, today) : list
}

type Chapter = { mode: string; chapter: number; list: Clear[]; boss?: Clear }
// Dated clears per mode and chapter, in order of first clear, so ties go to the earliest.
function chapters(list: Clear[]): Chapter[] {
  const map = new Map<string, Chapter>()
  for (const c of timed(list)) {
    const key = `${c.mode} ${c.chapter}`
    const group = map.get(key) ?? { mode: c.mode, chapter: c.chapter, list: [] }
    map.set(key, group)
    group.list.push(c)
    if (c.boss && kind(c) === 'story') group.boss ??= c
  }
  return [...map.values()]
}
const find = (cols: Columns, mode: string, chapter: string) =>
  chapters(all(cols)).find((g) => g.mode === mode && g.chapter === Number(chapter))
const showChapter = ({ mode, chapter }: Chapter) => `${mode} ch. ${chapter}`

// A Normal chapter with a stage number missing between 1 and its boss. "6-6A-1" is stage 6.
const stageNumber = (c: Clear) => Number(c.stage.match(/^\d+-(\d+)/)?.[1])
function isJumped(list: Clear[]): boolean {
  const stages = story(list)
  const boss = stages.find((c) => c.boss)
  if (!boss || boss.mode !== 'Normal') return false
  const numbers = new Set(stages.map(stageNumber))
  return Array.from({ length: stageNumber(boss) }, (_, i) => i + 1).some((n) => !numbers.has(n))
}

// Earliest story clear to the boss clear, for chapters with a boss clear.
const chapterTimes = (list: Clear[]) =>
  chapters(list).flatMap((g) =>
    g.boss ? [{ ...g, ms: g.boss.at - story(g.list)[0].at, end: g.boss }] : [],
  )
function extremeChapter(cols: Columns, values: Values, sign: 1 | -1) {
  const best = firstMax(chapterTimes(select(cols, values)), (g) => sign * g.ms)
  if (!best) return null
  const jumped = isJumped(best.list) ? ', jumped' : ''
  return `${formatDuration(best.ms)} (${showChapter(best)}${jumped})`
}

// Story stages of the Hard chapter that its jumped Normal chapter lacks.
function skipped(list: Clear[]) {
  const byChapter = (mode: string, chapter: number) =>
    story(list).filter((c) => c.mode === mode && c.chapter === chapter)
  const bare = (c: Clear) => c.stage.replace(/ HARD\b/, '')
  return [...new Set(list.map((c) => c.chapter))].reduce((total, chapter) => {
    const normal = byChapter('Normal', chapter)
    if (!isJumped(normal)) return total
    const cleared = new Set(normal.map(bare))
    return total + byChapter('Hard', chapter).filter((c) => !cleared.has(bare(c))).length
  }, 0)
}

// Each EX clear against its chapter's boss clear; negative is before the boss.
const exDelays = (list: Clear[]) =>
  chapters(list).flatMap((g) =>
    g.boss
      ? g.list.filter((c) => kind(c) === 'EX').map((c) => ({ ...g, ms: c.at - g.boss!.at }))
      : [],
  )
const afterBoss = (list: Clear[]) => exDelays(list).filter((d) => d.ms > 0)
function median(numbers: number[]) {
  const sorted = [...numbers].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// Normal boss clear to Hard boss clear, by chapter.
function catchUps(cols: Columns) {
  // by chapter: a catch-up tie goes to the lower one
  const list = chapters(all(cols)).sort((a, b) => a.chapter - b.chapter)
  return list.flatMap((normal) => {
    if (normal.mode !== 'Normal' || !normal.boss) return []
    const hard = list.find((g) => g.mode === 'Hard' && g.chapter === normal.chapter)?.boss
    const ms = hard ? hard.at - normal.boss.at : -1
    return ms >= 0 ? [{ chapter: normal.chapter, ms, normal: normal.boss, hard: hard! }] : []
  })
}
function extremeCatchUp(cols: Columns, sign: 1 | -1) {
  const best = firstMax(catchUps(cols), (c) => sign * c.ms)
  return best ? `${formatDuration(best.ms)} (ch. ${best.chapter})` : null
}

function busiestDay(list: Clear[]) {
  const best = busiest(list)
  return best
    ? `${formatCount(best.list.length)} on ${formatDate(best.day)} (${kinds(best.list)})`
    : '0'
}
const kinds = (list: Clear[]) =>
  ['story', 'SUB', 'EX']
    .map((k) => `${formatCount(list.filter((c) => kind(c) === k).length)} ${k}`)
    .join(', ')

const modeFilter: Filter = {
  id: 'mode',
  label: 'Mode',
  options: [ANY_MODE, ...MODES],
  say: (v) => (v === ANY_MODE ? '' : v),
}
const oneMode: Filter = { id: 'mode', label: 'Mode', options: MODES }
const numbers = (cols: Columns) => chapterNumbers(all(cols))
const chapter: Filter = { id: 'chapter', label: 'Chapter', options: numbers }
const anyChapter: Filter = {
  ...chapter,
  options: (cols) => [ANY_CHAPTER, ...numbers(cols)],
  say: (v) => (v === ANY_CHAPTER ? '' : `in chapter ${v}`),
}
const nikke = nikkeFilter(all)
const range = clearRange('Campaign')

const reads = (...columns: string[]) => [{ tab: CAMPAIGN_TAB, columns }]
const teamReads = reads('mode', 'date', ...SLOT_NAMES)
const namedTeamReads = reads('mode', 'stageName', 'date', ...SLOT_NAMES)
const cpReads = reads('mode', 'chapter', 'stageName', 'recommendedCp', 'teamCp')
const timeReads = reads('mode', 'chapter', 'stageName', 'date')
const stageReads = reads('mode', 'stageName', 'date')

type Entry = Omit<Fact, 'id' | 'category'> & { slug: string }
const ENTRIES: Entry[] = [
  {
    slug: 'favourite-nikke',
    title: 'Favourite NIKKE',
    question: 'Which NIKKE have I cleared the most {mode} stages with {range}?',
    filters: [modeFilter, range],
    reads: teamReads,
    compute: (c, v, today) => favouriteNikke(select(c, v, today), 'stage'),
  },
  {
    slug: 'nikke-clears',
    title: 'NIKKE clears',
    question: 'How many {mode} stages have I cleared with {nikke} {range}?',
    filters: [nikke, modeFilter, range],
    reads: teamReads,
    compute: (c, v, today) => nikkeClears(select(c, v, today), v.nikke),
  },
  {
    slug: 'first-outing',
    title: 'First outing',
    question: 'When did I first clear a {mode} stage with {nikke} {range}?',
    filters: [nikke, modeFilter, range],
    reads: namedTeamReads,
    compute: (c, v, today) => outing(select(c, v, today), v.nikke, 'first'),
  },
  {
    slug: 'last-outing',
    title: 'Last outing',
    question: 'When did I last clear a {mode} stage with {nikke} {range}?',
    filters: [nikke, modeFilter, range],
    reads: namedTeamReads,
    compute: (c, v, today) => outing(select(c, v, today), v.nikke, 'last'),
  },
  {
    slug: 'favourite-team',
    title: 'Favourite team',
    question: 'Which five have I used the most on {mode} stages {range}?',
    filters: [modeFilter, range],
    reads: teamReads,
    compute: (c, v, today) => favouriteTeam(select(c, v, today), 'stage'),
  },
  {
    slug: 'boss-favourite',
    title: 'Boss favourite',
    question: 'Which NIKKE have I beaten the most {mode} chapter bosses with {range}?',
    filters: [modeFilter, range],
    reads: namedTeamReads,
    compute: (c, v, today) =>
      favouriteNikke(
        story(select(c, v, today)).filter((s) => s.boss),
        'boss',
        'bosses',
      ),
  },
  {
    slug: 'different-nikkes',
    title: 'Different NIKKEs',
    question: 'How many different NIKKEs have I cleared {mode} stages with {range}?',
    filters: [modeFilter, range],
    reads: teamReads,
    compute: (c, v, today) => differentNikkes(select(c, v, today)),
  },
  {
    slug: 'biggest-underdog',
    title: 'Biggest underdog',
    question: 'How far under the recommended CP have I won on {mode} stages {chapter}?',
    filters: [modeFilter, anyChapter],
    reads: cpReads,
    compute: (c, v) => biggestUnderdog(story(select(c, v))),
  },
  {
    slug: 'biggest-overkill',
    title: 'Biggest overkill',
    question: 'How far over the recommended CP have I been on {mode} stages {chapter}?',
    filters: [modeFilter, anyChapter],
    reads: cpReads,
    compute: (c, v) => biggestOverkill(story(select(c, v))),
  },
  {
    slug: 'underdog-share',
    title: 'Underdog share',
    question: 'What % of my {mode} clears {chapter} were under the recommended CP?',
    filters: [modeFilter, anyChapter],
    reads: cpReads,
    compute: (c, v) => underdogShare(story(select(c, v))),
  },
  {
    slug: 'underdog-bosses',
    title: 'Underdog bosses',
    question: 'How many {mode} chapter bosses have I beaten under the recommended CP {range}?',
    filters: [modeFilter, range],
    reads: reads('mode', 'stageName', 'date', 'recommendedCp', 'teamCp'),
    compute: (c, v, today) =>
      formatCount(underdogs(story(select(c, v, today)).filter((s) => s.boss)).length),
  },
  {
    slug: 'fastest-chapter',
    title: 'Fastest chapter',
    question: "What is the fastest I've cleared a {mode} chapter?",
    filters: [modeFilter],
    reads: timeReads,
    compute: (c, v) => extremeChapter(c, v, -1),
  },
  {
    slug: 'slowest-chapter',
    title: 'Slowest chapter',
    question: 'What is the longest a {mode} chapter has taken me?',
    filters: [modeFilter],
    reads: timeReads,
    compute: (c, v) => extremeChapter(c, v, 1),
  },
  {
    slug: 'chapter-time',
    title: 'Chapter time',
    question: 'How long did {mode} chapter {chapter} take me?',
    filters: [oneMode, chapter],
    reads: timeReads,
    compute: (c, v) => {
      const group = find(c, v.mode, v.chapter)
      const [time] = group ? chapterTimes(group.list) : []
      return time ? `${formatDuration(time.ms)} (${formatDate(time.end.day)})` : null
    },
  },
  {
    slug: 'longest-wall',
    title: 'Longest wall',
    question: "What is the longest I've gone between two {mode} story clears?",
    filters: [modeFilter],
    reads: stageReads,
    compute: (c, v) => longestWall(story(select(c, v))),
  },
  {
    slug: 'busiest-day',
    title: 'Busiest day',
    question: "What is the most {mode} stages I've cleared in one day {range}?",
    filters: [modeFilter, range],
    reads: stageReads,
    compute: (c, v, today) => busiestDay(select(c, v, today)),
  },
  {
    slug: 'stage-count',
    title: 'Stage count',
    question: 'How many {mode} stages have I cleared {range}?',
    filters: [modeFilter, range],
    reads: stageReads,
    compute: (c, v, today) => {
      const list = select(c, v, today)
      return list.length ? `${formatCount(list.length)} (${kinds(list)})` : '0'
    },
  },
  {
    slug: 'skipped-stages',
    title: 'Skipped stages',
    question: 'How many story stages have I skipped by jumping?',
    reads: reads('mode', 'chapter', 'stageName'),
    compute: (c) => formatCount(skipped(all(c))),
  },
  {
    slug: 'longest-ex-delay',
    title: 'Longest EX delay',
    question: "What is the longest I've left {mode} EX stages after beating their chapter boss?",
    filters: [modeFilter],
    reads: timeReads,
    compute: (c, v) => {
      const worst = firstMax(afterBoss(select(c, v)), (d) => d.ms)
      return worst ? `${formatDuration(worst.ms)} (${showChapter(worst)})` : null
    },
  },
  {
    slug: 'usual-ex-delay',
    title: 'Usual EX delay',
    question: 'How long do I usually leave {mode} EX stages after the chapter boss?',
    filters: [modeFilter],
    reads: timeReads,
    compute: (c, v) => {
      const delays = afterBoss(select(c, v)).map((d) => d.ms)
      return delays.length ? formatDuration(median(delays)) : null
    },
  },
  {
    slug: 'early-ex',
    title: 'Early EX',
    question: 'How many {mode} EX stages have I cleared before the chapter boss?',
    filters: [modeFilter],
    reads: timeReads,
    compute: (c, v) => formatCount(exDelays(select(c, v)).filter((d) => d.ms < 0).length),
  },
  {
    slug: 'chapter-ex-delay',
    title: 'Chapter EX delay',
    question: "How long after the boss did I clear {mode} chapter {chapter}'s EX stages?",
    filters: [oneMode, chapter],
    reads: timeReads,
    compute: (c, v) => {
      const group = find(c, v.mode, v.chapter)
      const delays = group ? exDelays(group.list) : []
      const last = delays.at(-1) // clears are in time order
      if (!last) return null
      const when = last.ms > 0 ? formatDuration(last.ms) : 'before the boss'
      // a delay counts only the EX stages cleared after the boss
      const count = delays.filter((d) => last.ms <= 0 || d.ms > 0).length
      return `${when} (${count} EX)`
    },
  },
  {
    slug: 'hard-catch-up',
    title: 'Hard catch-up',
    question: 'How long after beating Normal chapter {chapter} did I beat it on Hard?',
    filters: [chapter],
    reads: timeReads,
    compute: (c, v) => {
      const up = catchUps(c).find((u) => u.chapter === Number(v.chapter))
      if (!up) return null
      const days = `Normal ${formatDate(up.normal.day)}, Hard ${formatDate(up.hard.day)}`
      return `${formatDuration(up.ms)} (${days})`
    },
  },
  {
    slug: 'fastest-catch-up',
    title: 'Fastest catch-up',
    question: "What is the fastest I've beaten a chapter on Hard after Normal?",
    reads: timeReads,
    compute: (c) => extremeCatchUp(c, -1),
  },
  {
    slug: 'slowest-catch-up',
    title: 'Slowest catch-up',
    question: "What is the longest I've taken to beat a chapter on Hard after Normal?",
    reads: timeReads,
    compute: (c) => extremeCatchUp(c, 1),
  },
  {
    slug: 'benched-longest',
    title: 'Benched longest',
    question: 'Which NIKKE have I left unused the longest on {mode} stages {range}?',
    filters: [modeFilter, range],
    reads: teamReads,
    compute: (c, v, today) => benchedLongest(select(c, v, today)),
  },
  {
    slug: 'loyal-team',
    title: 'Loyal team',
    question: "What is the most {mode} stages in a row I've cleared with the same five {range}?",
    filters: [modeFilter, range],
    reads: namedTeamReads,
    compute: (c, v, today) => loyalTeam(select(c, v, today), 'stage'),
  },
  {
    slug: 'favourite-duo',
    title: 'Favourite duo',
    question: 'Which two NIKKEs have I used together most on {mode} stages {range}?',
    filters: [modeFilter, range],
    reads: teamReads,
    compute: (c, v, today) => favouriteDuo(select(c, v, today), 'stage'),
  },
  {
    slug: 'boss-marathon',
    title: 'Boss marathon',
    question: "What is the most {mode} chapter bosses I've beaten in one day {range}?",
    filters: [modeFilter, range],
    reads: stageReads,
    compute: (c, v, today) => {
      const best = busiest(story(select(c, v, today)).filter((s) => s.boss))
      return best
        ? `${formatPlural(best.list.length, 'boss', 'bosses')} on ${formatDate(best.day)}`
        : '0'
    },
  },
  {
    slug: 'longest-sitting',
    title: 'Longest sitting',
    question: "What is the most {mode} stages I've cleared without a 30-minute break {range}?",
    filters: [modeFilter, range],
    reads: reads('mode', 'date'),
    compute: (c, v, today) => longestSitting(select(c, v, today), 'stage'),
  },
  {
    slug: 'passengers',
    title: 'Passengers',
    question: 'How many {mode} stages have I cleared with a level 1 NIKKE in the team {range}?',
    filters: [modeFilter, range],
    reads: reads('mode', 'date', 'synchroLevel'),
    compute: (c, v, today) => passengers(select(c, v, today)),
  },
  {
    slug: 'newest-recruit',
    title: 'Newest recruit',
    question: 'Which NIKKE most recently made a {mode} campaign debut {range}?',
    filters: [modeFilter, range],
    reads: namedTeamReads,
    compute: (c, v, today) => newestRecruit(ofMode(all(c), v.mode), v.range, today),
  },
]

export const CAMPAIGN_FACTS: Fact[] = ENTRIES.map(({ slug, ...fact }) => ({
  ...fact,
  id: `campaign-${slug}`,
  category: 'Modes',
}))
