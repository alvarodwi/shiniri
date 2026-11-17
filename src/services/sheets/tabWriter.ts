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
  const values = await api.getValues(tab.spreadsheetId, `${quoted(tab)}!A:A`)
  return values.map((r) => r[0] ?? '')
}

export const readRows = (api: SheetsApi, tab: TabSpec, fromRow: number, toRow: number) =>
  api.getValues(tab.spreadsheetId, range(tab, fromRow, toRow))

export function nextEmptyRow(colA: string[]): number {
  let last = colA.length - 1
  while (last >= 0 && !colA[last].trim()) last--
  return last + 2
}

export async function writeRowsAtEnd(
  api: SheetsApi,
  tab: TabSpec,
  rows: Cell[][],
): Promise<{ updatedRange: string }> {
  if (!rows.length) throw new Error('Nothing to write.')
  if (rows.some((r) => r.length !== tab.headers.length))
    throw new Error(`Each row must have ${tab.headers.length} cells.`)

  const [headerRow = []] = await readRows(api, tab, 1, 1)
  const actual = tab.headers.map((_, i) => (headerRow[i] ?? '').trim())
  if (actual.some((h, i) => h !== tab.headers[i]))
    throw new HeaderMismatchError(tab.headers, actual)

  const start = nextEmptyRow(await readColumnA(api, tab))
  const target = range(tab, start, start + rows.length - 1)
  const existing = await api.getValues(tab.spreadsheetId, target)
  if (existing.some((r) => r.some((c) => String(c).trim()))) throw new TargetNotEmptyError(target)

  return api.updateValues(tab.spreadsheetId, target, rows)
}
