import type { TabSpec } from '@/config/sheets'
import type { SheetsApi } from '@/services/google/sheetsApi'
import type { Cell } from '@/types/sheet'

// The only write path to the sheet. It never inserts, shifts or overwrites:
// it writes once, into rows it has just confirmed are empty, below the last row of data.

export class HeaderMismatchError extends Error {
  expected: readonly string[]
  actual: string[]

  constructor(expected: readonly string[], actual: string[]) {
    super(
      `Sheet headers changed. Expected [${expected.join(' | ')}], found [${actual.join(' | ')}].`,
    )
    this.name = 'HeaderMismatchError'
    this.expected = expected
    this.actual = actual
  }
}

export class TargetNotEmptyError extends Error {
  range: string

  constructor(range: string) {
    super(`Refusing to write: ${range} is not empty.`)
    this.range = range
    this.name = 'TargetNotEmptyError'
  }
}

export function columnLetter(n: number): string {
  let s = ''
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

const quoted = (tab: TabSpec) => `'${tab.tab.replace(/'/g, "''")}'`
const lastCol = (tab: TabSpec) => columnLetter(tab.headers.length)
const range = (tab: TabSpec, from: number, to: number) =>
  `${quoted(tab)}!A${from}:${lastCol(tab)}${to}`

export async function readColumnA(api: SheetsApi, tab: TabSpec): Promise<string[]> {
  // Unformatted: dates come back as serial numbers, independent of the cell's display format.
  const values = await api.getValues(tab.spreadsheetId, `${quoted(tab)}!A:A`, 'UNFORMATTED_VALUE')
  return values.map((r) => String(r[0] ?? ''))
}

export const readRows = (api: SheetsApi, tab: TabSpec, fromRow: number, toRow: number) =>
  api.getValues(tab.spreadsheetId, range(tab, fromRow, toRow))

export function nextEmptyRow(colA: string[]): number {
  let last = colA.length - 1
  while (last >= 0 && !colA[last].trim()) last--
  return last + 2
}

export type WriteTarget = { tab: TabSpec; rows: Cell[][] }

// Every guard runs on every tab before anything is written; then one batch request writes them all.
export async function writeTabsAtEnd(
  api: SheetsApi,
  targets: WriteTarget[],
): Promise<{ updatedRanges: string[] }> {
  if (!targets.length) throw new Error('Nothing to write.')
  const { spreadsheetId } = targets[0].tab
  for (const { tab, rows } of targets) {
    if (tab.spreadsheetId !== spreadsheetId) throw new Error('All tabs must be in one spreadsheet.')
    if (targets.filter((t) => t.tab.tab === tab.tab).length > 1)
      throw new Error(`Tab ${tab.tab} appears twice.`)
    if (!rows.length) throw new Error(`Nothing to write to ${tab.tab}.`)
    if (rows.some((r) => r.length !== tab.headers.length))
      throw new Error(`Each ${tab.tab} row must have ${tab.headers.length} cells.`)
    // nextEmptyRow only reads column A, so a blank A would get its row written over by the next save.
    if (rows.some((r) => !String(r[0]).trim()))
      throw new Error(`Every ${tab.tab} row needs a value in column A.`)
  }

  const data = []
  for (const { tab, rows } of targets) {
    const [headerRow = []] = await readRows(api, tab, 1, 1)
    const actual = tab.headers.map((_, i) => (headerRow[i] ?? '').trim())
    if (actual.some((h, i) => h !== tab.headers[i]))
      throw new HeaderMismatchError(tab.headers, actual)

    const start = nextEmptyRow(await readColumnA(api, tab))
    const target = range(tab, start, start + rows.length - 1)
    const existing = await api.getValues(spreadsheetId, target)
    if (existing.some((r) => r.some((c) => String(c).trim()))) throw new TargetNotEmptyError(target)
    data.push({ range: target, rows })
  }

  // shortcut: under a second passes between the empty checks and this write, so a save from another
  // device in that gap would be overwritten. Fine for one person; use values.append if that changes.
  return api.batchUpdateValues(spreadsheetId, data)
}

export async function writeRowsAtEnd(
  api: SheetsApi,
  tab: TabSpec,
  rows: Cell[][],
): Promise<{ updatedRange: string }> {
  const { updatedRanges } = await writeTabsAtEnd(api, [{ tab, rows }])
  return { updatedRange: updatedRanges[0] }
}
