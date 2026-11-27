import { OVERCORE_LINES, OVERSPEC_LINE } from '@/config/overcoreLines'
import { ALL_PULLS_TAB, ROSTER_LOG_TAB } from '@/config/sheets'
import type { TabSpec } from '@/config/sheets'
import { asText, cellToIsoDate } from '@/services/anomaly/anomalyRows'
import type { SheetsApi } from '@/services/google/sheetsApi'
import type { Nikke } from '@/services/nikke/nikkeDatabase'
import { checkHeaders } from '@/services/sheets/tabWriter'
import type { Cell } from '@/types/sheet'

export type OvercoreSource = 'Social' | 'Event' | 'Ordinary' | 'Mold' | 'Exchange' | 'Extra'
export type Overcore = { name: string; copy: number }

// Copy 12 and up is past C7.
const OVERCORE_FROM = 12

// `detail` is the mold type for Mold and the spare source for Exchange; ignored otherwise.
export function painLevel(from: OvercoreSource, detail: string): number {
  switch (from) {
    case 'Extra':
    case 'Social':
      return 1
    case 'Ordinary':
      return 2
    case 'Event':
      return 3
    case 'Mold':
      if (detail.includes('Perfect')) return 5
      return ['Pilgrim Mold', 'Missilis Mold', 'Elysion Mold', 'Tetra Mold'].includes(detail)
        ? 4
        : 2
    case 'Exchange':
      return detail === 'Gold Mileage' ? 7 : 6
  }
}

// Both inputs include their header row.
export function copyStarts(
  allPulls: string[][],
  rosterLog: string[][],
): { baseline: string | null; start: (name: string) => number } {
  const roster = rosterLog.slice(1).map((r) => ({
    date: cellToIsoDate(String(r[0] ?? '')),
    name: String(r[2] ?? '').trim(),
    copies: Number(r[3]),
  }))
  // Matches the sheet formula, which needs both a date and a name.
  const dated = roster.filter((r) => r.date && r.name)
  const baseline = dated.length ? dated.map((r) => r.date).reduce((a, b) => (b < a ? b : a)) : null
  const lastCopy = new Map<string, number | null>()
  for (const r of allPulls.slice(1)) {
    const name = String(r[1] ?? '').trim()
    if (!name) continue
    const copy = String(r[4] ?? '').trim()
    // An error cell must fail the save, not silently skip an Overcore row.
    if (copy !== '' && Number.isNaN(Number(copy)))
      throw new Error(`AllPulls copy shows ${copy} for ${name}`)
    lastCopy.set(name, copy === '' ? null : Number(copy))
  }
  return {
    baseline,
    start(name) {
      const last = lastCopy.get(name)
      if (last != null) return last
      const base = dated.find((r) => r.date === baseline && r.name === name)
      return base && Number.isFinite(base.copies) ? base.copies : 0
    },
  }
}

// shortcut: a backdated save after the baseline uses "last copy + n", which can differ from where
// the sheet formula places it; fine when logging on the day, upgrade by re-reading AllPulls after
// the write if that changes.
export function findOvercores(
  names: string[],
  date: string,
  starts: ReturnType<typeof copyStarts>,
): Overcore[] {
  if (starts.baseline === null || date <= starts.baseline) return []
  const seen = new Map<string, number>()
  const found: Overcore[] = []
  for (const name of names) {
    const copy = (seen.get(name) ?? starts.start(name)) + 1
    seen.set(name, copy)
    if (copy >= OVERCORE_FROM) found.push({ name, copy })
  }
  return found
}

const titleCase = (s: string): string => s.charAt(0) + s.slice(1).toLowerCase()
const makerOf = (name: string, nikkes: Nikke[]): string | undefined =>
  nikkes.find((n) => n.name === name)?.manufacturer

export function overcoreRows(
  found: Overcore[],
  from: OvercoreSource,
  date: string,
  nikkes: Nikke[],
): Cell[][] {
  return found.map(({ name }) => [
    date,
    from,
    asText(name),
    titleCase(makerOf(name, nikkes) ?? ''),
    '',
  ])
}

const isOverspec = (name: string, nikkes: Nikke[]): boolean =>
  nikkes.some((n) => n.name === name && n.overspec)

export function remark(
  found: Overcore[],
  from: OvercoreSource,
  detail: string,
  nikkes: Nikke[],
  rand: () => number = Math.random,
): string | null {
  if (!found.length) return null
  // The line always fits the source (a mold is never "bought"); an overspec adds OVERSPEC_LINE instead
  // of borrowing the next level's line.
  const level = painLevel(from, detail) as keyof typeof OVERCORE_LINES
  const overspec = found.some((f) => isOverspec(f.name, nikkes))
  const who = found.map((f) => `${f.name} C${f.copy - 4}`)
  const list = who.length > 1 ? `${who.slice(0, -1).join(', ')} and ${who.at(-1)}` : who[0]
  const lines = OVERCORE_LINES[level]
  const line = lines[Math.floor(rand() * lines.length)].replace('{who}', list)
  return overspec ? `${line} ${OVERSPEC_LINE}` : line
}

async function readTab(api: SheetsApi, spec: TabSpec): Promise<string[][]> {
  const last = String.fromCharCode(64 + spec.headers.length)
  const rows = await api.getValues(
    spec.spreadsheetId,
    `'${spec.tab.replace(/'/g, "''")}'!A1:${last}`,
    'UNFORMATTED_VALUE',
  )
  try {
    checkHeaders(spec, rows[0] ?? [])
  } catch (e) {
    if (e instanceof Error) e.message = `${spec.tab}: ${e.message}`
    throw e
  }
  return rows
}

export async function checkOvercores(
  api: SheetsApi,
  s: { from: OvercoreSource; detail: string; date: string; names: string[]; nikkes: Nikke[] },
  rand?: () => number,
): Promise<{ rows: Cell[][]; remark: string | null }> {
  const names = [...s.names]
  const [allPulls, rosterLog] = await Promise.all([
    readTab(api, ALL_PULLS_TAB),
    readTab(api, ROSTER_LOG_TAB),
  ])
  const found = findOvercores(names, s.date, copyStarts(allPulls, rosterLog))
  return {
    rows: overcoreRows(found, s.from, s.date, s.nikkes),
    remark: remark(found, s.from, s.detail, s.nikkes, rand),
  }
}
