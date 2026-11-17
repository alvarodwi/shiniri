import type { Cell } from '@/types/sheet'

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

export type TokenGetter = (opts?: { forceRefresh?: boolean }) => Promise<string>

export interface SheetsApi {
  getValues(spreadsheetId: string, range: string): Promise<string[][]>
  updateValues(
    spreadsheetId: string,
    range: string,
    rows: Cell[][],
  ): Promise<{ updatedRange: string }>
}

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
    async getValues(id, range) {
      const body = await request(`${url(id, range)}?valueRenderOption=FORMATTED_VALUE`)
      return body.values ?? []
    },
    async updateValues(id, range, rows) {
      const body = await request(`${url(id, range)}?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        body: JSON.stringify({ values: rows }),
      })
      return { updatedRange: body.updatedRange }
    },
  }
}
