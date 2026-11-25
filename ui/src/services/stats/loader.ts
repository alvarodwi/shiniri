import type { SheetsApi } from '@/services/google/sheetsApi'
import { columnLetter } from '@/services/sheets/tabWriter'
import type { Columns, Fact } from '@/services/stats/facts'

const quoteTab = (tab: string) => `'${tab.replace(/'/g, "''")}'`

// In-memory only, per loader: one read per tab header row and per column. A failed read is
// evicted so a retry refetches.
export function createLoader() {
  const cache = new Map<string, Promise<unknown[][]>>()

  function read(api: SheetsApi, id: string, range: string) {
    const key = `${id}!${range}`
    let hit = cache.get(key)
    if (!hit) {
      hit = api.getValues(id, range, 'UNFORMATTED_VALUE')
      cache.set(key, hit)
      hit.catch(() => cache.delete(key))
    }
    return hit
  }

  return async function load(api: SheetsApi, fact: Fact): Promise<Columns> {
    const out: Columns = {}
    for (const { tab, columns } of fact.reads) {
      const [header = []] = await read(api, tab.spreadsheetId, `${quoteTab(tab.tab)}!1:1`)
      const cols: Record<string, unknown[]> = {}
      for (const name of columns) {
        const i = header.indexOf(name)
        if (i < 0) throw new Error(`Tab ${tab.tab} has no header "${name}".`)
        const letter = columnLetter(i + 1)
        const values = await read(
          api,
          tab.spreadsheetId,
          `${quoteTab(tab.tab)}!${letter}:${letter}`,
        )
        cols[name] = values.slice(1).map((r) => r[0] ?? '')
      }
      out[tab.tab] = cols
    }
    return out
  }
}
