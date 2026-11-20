import type { Cell } from '@/types/sheet'

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

export type ValueRender = 'FORMATTED_VALUE' | 'UNFORMATTED_VALUE'

export type TokenGetter = (opts?: { forceRefresh?: boolean }) => Promise<string>

export interface SheetsApi {
  getValues(spreadsheetId: string, range: string, render?: ValueRender): Promise<string[][]>
  // One request for every range, so a save lands in all its tabs or in none.
  batchUpdateValues(
    spreadsheetId: string,
    data: { range: string; rows: Cell[][] }[],
  ): Promise<{ updatedRanges: string[] }>
  // Adds blank rows, formatted like the last row, below the grid of each tab that ends before its
  // row. Nothing above them moves.
  ensureRows(spreadsheetId: string, rows: Record<string, number>): Promise<void>
}

const GROW_MIN = 100 // rows appended at least, so a full tab is not grown again on every save
const RATE_LIMITED = 'Google rate limit hit. Wait a minute and try again.'

export class SheetsApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
    this.name = 'SheetsApiError'
  }
}

export function createSheetsApi(getToken: TokenGetter, fetchFn: typeof fetch = fetch): SheetsApi {
  // Tokens expire after ~1h with no refresh token, so a 401 gets exactly one fresh-token retry.
  async function request(url: string, init: RequestInit = {}): Promise<any> {
    let res: Response | undefined
    for (const forceRefresh of [false, true]) {
      const token = await getToken(forceRefresh ? { forceRefresh } : undefined)
      res = await fetchFn(url, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      })
      if (res.status !== 401) break
    }
    if (res!.status === 429) throw new SheetsApiError(RATE_LIMITED, 429)
    const body = await res!.json().catch(() => ({}))
    if (!res!.ok)
      throw new SheetsApiError(
        `Sheets API ${res!.status}: ${body?.error?.message ?? res!.statusText}`,
        res!.status,
      )
    return body
  }

  const url = (id: string, range: string) =>
    `${BASE}/${encodeURIComponent(id)}/values/${encodeURIComponent(range)}`

  return {
    async getValues(id, range, render = 'FORMATTED_VALUE') {
      const body = await request(`${url(id, range)}?valueRenderOption=${render}`)
      return body.values ?? []
    },
    async batchUpdateValues(id, data) {
      const body = await request(`${BASE}/${encodeURIComponent(id)}/values:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: data.map(({ range, rows }) => ({ range, values: rows })),
        }),
      })
      return {
        updatedRanges: (body.responses ?? []).map((r: { updatedRange: string }) => r.updatedRange),
      }
    },
    async ensureRows(id, rows) {
      const base = `${BASE}/${encodeURIComponent(id)}`
      const fields = 'sheets.properties(sheetId,title,gridProperties.rowCount)'
      const body = await request(`${base}?fields=${encodeURIComponent(fields)}`)
      // sheetId 0 may be omitted as a default; a sheet without gridProperties (a chart) is no tab.
      const grid = new Map<string, { sheetId: number; rowCount: number }>()
      for (const { properties: p } of body.sheets ?? [])
        if (p.gridProperties)
          grid.set(p.title, { sheetId: p.sheetId ?? 0, rowCount: p.gridProperties.rowCount ?? 0 })

      const missing = Object.keys(rows).filter((t) => !grid.has(t))
      if (missing.length) throw new Error(`${missing.join(', ')} tab not found`)
      const requests = Object.entries(rows).flatMap(([title, needed]) => {
        const tab = grid.get(title)!
        if (tab.rowCount >= needed) return []
        const length = Math.max(needed - tab.rowCount, GROW_MIN)
        const { sheetId, rowCount } = tab
        const end = rowCount + length
        // Inserted after the last grid row, so nothing shifts. Inheriting keeps fonts and number
        // formats but drops borders, so the last row's format is pasted over the new rows too.
        const insert = {
          insertDimension: {
            range: { sheetId, dimension: 'ROWS', startIndex: rowCount, endIndex: end },
            inheritFromBefore: rowCount > 0,
          },
        }
        if (!rowCount) return [insert]
        const copyPaste = {
          source: { sheetId, startRowIndex: rowCount - 1, endRowIndex: rowCount },
          destination: { sheetId, startRowIndex: rowCount, endRowIndex: end },
          pasteType: 'PASTE_FORMAT',
        }
        return [insert, { copyPaste }]
      })
      if (requests.length)
        await request(`${base}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests }) })
    },
  }
}
