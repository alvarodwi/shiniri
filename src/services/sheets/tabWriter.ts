import { SPREADSHEETS } from '@/config/sheets'
import type { Spreadsheet, TabSpec } from '@/config/sheets'
import type { SheetsApi } from '@/services/google/sheetsApi'
import type { Cell } from '@/types/sheet'
import { wibTimestamp } from '@/utils/wibTimestamp'

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

// Header check, next empty row from column A, and an empty-target check. Returns the range to write.
async function checkedRange(api: SheetsApi, tab: TabSpec, rowCount: number): Promise<string> {
  const [headerRow = []] = await readRows(api, tab, 1, 1)
  const actual = tab.headers.map((_, i) => (headerRow[i] ?? '').trim())
  if (actual.some((h, i) => h !== tab.headers[i]))
    throw new HeaderMismatchError(tab.headers, actual)

  const start = nextEmptyRow(await readColumnA(api, tab))
  const target = range(tab, start, start + rowCount - 1)
  const existing = await api.getValues(tab.spreadsheetId, target)
  if (existing.some((r) => r.some((c) => String(c).trim()))) throw new TargetNotEmptyError(target)
  return target
}

// Every guard runs on every tab before anything is written; then one batch request writes them all.
// The spreadsheet's AuditLog row rides in the same batch, so it exists only if the save landed.
export async function writeTabsAtEnd(
  api: SheetsApi,
  targets: WriteTarget[],
  form: string,
  spreadsheets: Spreadsheet[] = SPREADSHEETS,
  now: Date = new Date(),
): Promise<{ updatedRanges: string[] }> {
  if (!targets.length) throw new Error('Nothing to write.')
  const { spreadsheetId } = targets[0].tab
  const audit = spreadsheets.find((s) => s.audit.spreadsheetId === spreadsheetId)?.audit
  if (!audit) throw new Error('No audit tab configured for this spreadsheet.')
  for (const { tab, rows } of targets) {
    if (tab.spreadsheetId !== spreadsheetId) throw new Error('All tabs must be in one spreadsheet.')
    if ([...targets.map((t) => t.tab), audit].filter((t) => t.tab === tab.tab).length > 1)
      throw new Error(`Tab ${tab.tab} appears twice.`)
    if (!rows.length) throw new Error(`Nothing to write to ${tab.tab}.`)
    if (rows.some((r) => r.length !== tab.headers.length))
      throw new Error(`Each ${tab.tab} row must have ${tab.headers.length} cells.`)
    // nextEmptyRow only reads column A, so a blank A would get its row written over by the next save.
    if (rows.some((r) => !String(r[0]).trim()))
      throw new Error(`Every ${tab.tab} row needs a value in column A.`)
  }

  // Tabs are independent, so their checks run in parallel to keep the check-then-write gap short.
  const [auditRange, ...dataRanges] = await Promise.all([
    checkedRange(api, audit, 1),
    ...targets.map((t) => checkedRange(api, t.tab, t.rows.length)),
  ])
  const data = targets.map((t, i) => ({ range: dataRanges[i], rows: t.rows }))

  // Leading ' stores both as text: USER_ENTERED would eat the quote in 'Tab'!A1, and would turn the
  // timestamp into a datetime whose display depends on the sheet's locale.
  const ranges = `'${data.map((d) => d.range).join(', ')}`
  const total = targets.reduce((n, t) => n + t.rows.length, 0)
  data.push({ range: auditRange, rows: [[`'${wibTimestamp(now)}`, form, ranges, total]] })

  // shortcut: a few round trips pass between the empty checks and this write, so a save from another
  // device in that gap would be overwritten. Fine for one person; use values.append if that changes.
  const { updatedRanges } = await api.batchUpdateValues(spreadsheetId, data)
  return { updatedRanges: updatedRanges.slice(0, targets.length) }
}
