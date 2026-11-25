import type { SheetsApi } from '@/services/google/sheetsApi'
import type { Cell } from '@/types/sheet'

// Dev-only stand-in for the Sheets API (yarn dev:mock): one in-memory grid per tab of each spreadsheet id, nothing leaves
// the browser. It covers the A1 ranges the app uses: 'Tab'!A1:G1, 'Tab'!A:A, 'Tab'!B12.

const RANGE = /^'((?:[^']|'')+)'!(?:([A-Z]+)(\d*)(?::([A-Z]+)(\d*))?|(\d+):(\d+))$/

const colIndex = (letters: string) =>
  [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1

function parse(range: string) {
  const m = RANGE.exec(range)
  if (!m) throw new Error(`Mock sheet can't read range ${range}`)
  const [, tab, c1, r1, c2 = c1, r2 = r1, rowFrom, rowTo] = m
  const tabName = tab.replace(/''/g, "'")
  // '1:1' is whole rows: every column.
  if (rowFrom) {
    return {
      tab: tabName,
      col: 0,
      lastCol: Infinity,
      row: Number(rowFrom) - 1,
      lastRow: Number(rowTo) - 1,
    }
  }
  return {
    tab: tabName,
    col: colIndex(c1),
    lastCol: colIndex(c2),
    row: r1 ? Number(r1) - 1 : 0,
    lastRow: r2 ? Number(r2) - 1 : Infinity, // 'A:A' is the whole column
  }
}

const isEmpty = (c: string) => c === ''

// What the real API reads back for a stored value: booleans come back as TRUE / FALSE.
const asRead = (c: Cell): string => (typeof c === 'boolean' ? (c ? 'TRUE' : 'FALSE') : String(c))

// USER_ENTERED keeps a leading apostrophe's text as typed and drops the apostrophe.
const stored = (c: Cell): string => {
  const s = asRead(c)
  return typeof c === 'string' && s.startsWith("'") ? s.slice(1) : s
}

// `tabs` holds stored values (what a cell contains), so seeds are copied as they are.
export function createMockSheetsApi(sheets: Record<string, Record<string, Cell[][]>>): SheetsApi {
  const grid = new Map(
    Object.entries(sheets).map(([id, tabs]) => [
      id,
      new Map(
        Object.entries(tabs).map(([tab, rows]) => [tab, rows.map((r) => r.map(asRead))] as const),
      ),
    ]),
  )
  const tabOf = (id: string, tab: string) => grid.get(id)?.get(tab)

  return {
    async getValues(id, range) {
      const { tab, col, lastCol, row, lastRow } = parse(range)
      const rows = (tabOf(id, tab) ?? []).slice(row, lastRow + 1).map((r) => {
        const width = Math.min(lastCol, r.length - 1) - col + 1
        const cells = Array.from({ length: Math.max(width, 0) }, (_, i) => r[col + i] ?? '')
        while (cells.length && isEmpty(cells[cells.length - 1])) cells.pop()
        return cells
      })
      while (rows.length && !rows[rows.length - 1].length) rows.pop()
      return rows
    },

    async batchUpdateValues(id, data) {
      // All or nothing, like the real batch: every range is checked before any cell is written.
      const writes = data.map(({ range, rows }) => {
        const { tab, col, row } = parse(range)
        const sheet = tabOf(id, tab)
        if (!sheet)
          throw new Error(
            `Mock sheet ${id} has no tab ${tab}. Add it to services/mock/fixtures.ts.`,
          )
        return { sheet, col, row, rows }
      })
      for (const { sheet, col, row, rows } of writes) {
        rows.forEach((cells, i) => {
          const target = (sheet[row + i] ??= [])
          cells.forEach((c, j) => (target[col + j] = stored(c)))
        })
        // Rows past the old end stay dense, so later reads see '' rather than holes.
        for (let i = 0; i < sheet.length; i++) sheet[i] ??= []
      }
      return { updatedRanges: data.map((d) => d.range) }
    },

    // the fake sheet has no grid limit
    async ensureRows() {},
  }
}
