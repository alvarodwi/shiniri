import { defineStore } from 'pinia'

import { SPREADSHEETS } from '@/config/sheets'
import type { Spreadsheet } from '@/config/sheets'
import type { SheetsApi } from '@/services/google/sheetsApi'
import { nextEmptyRow, readColumnA, readRows } from '@/services/sheets/tabWriter'
import { sheetsApi } from '@/stores/authStore'

const RECENT = 20

export type AuditEntry = { savedAt: string; form: string; ranges: string; rows: string }
export type LogSection = { name: string; entries: AuditEntry[]; error: string | null }

// Newest first. Row 1 is the header, so an empty log reads nothing past column A.
async function recentEntries(api: SheetsApi, sheet: Spreadsheet): Promise<AuditEntry[]> {
  const last = nextEmptyRow(await readColumnA(api, sheet.audit)) - 1
  if (last < 2) return []
  const rows = await readRows(api, sheet.audit, Math.max(2, last - RECENT + 1), last)
  return rows
    .map(([savedAt = '', form = '', ranges = '', rows = '']) => ({ savedAt, form, ranges, rows }))
    .filter((e) => e.savedAt.trim()) // a row cleared by hand
    .reverse()
}

export const useLogStore = defineStore('log', {
  state: () => ({
    sections: [] as LogSection[],
    status: 'idle' as 'idle' | 'loading',
  }),

  actions: {
    // Read-only. A failing spreadsheet only marks its own section.
    async load(api: SheetsApi = sheetsApi, spreadsheets: Spreadsheet[] = SPREADSHEETS) {
      if (this.status === 'loading') return // e.g. leaving and re-opening the page mid-load
      this.status = 'loading'
      this.sections = await Promise.all(
        spreadsheets.map(async (sheet) => {
          try {
            return { name: sheet.name, entries: await recentEntries(api, sheet), error: null }
          } catch (e) {
            return { name: sheet.name, entries: [], error: (e as Error).message }
          }
        }),
      )
      this.status = 'idle'
    },
  },
})
