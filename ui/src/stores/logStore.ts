import { defineStore } from 'pinia'

import { SPREADSHEETS } from '@/config/sheets'
import type { Spreadsheet } from '@/config/sheets'
import type { SheetsApi } from '@/services/google/sheetsApi'
import { nextEmptyRow, readColumnA, readRows } from '@/services/sheets/tabWriter'
import { sheetsApi } from '@/stores/authStore'

const CHUNK = 20

export type AuditEntry = { savedAt: string; form: string; ranges: string; rows: string }
// oldest is the first sheet row read so far; row 1 is the header, so 2 means nothing older is left.
export type LogSection = {
  name: string
  entries: AuditEntry[]
  error: string | null
  loaded: boolean
  oldest: number
  busy: boolean
}

const blank = (name: string): LogSection => ({
  name,
  entries: [],
  error: null,
  loaded: false,
  oldest: 2,
  busy: false,
})

export const hasMore = (section: LogSection) => section.loaded && section.oldest > 2

// Newest first within the chunk.
async function readChunk(
  api: SheetsApi,
  sheet: Spreadsheet,
  from: number,
  to: number,
): Promise<AuditEntry[]> {
  const rows = await readRows(api, sheet.audit, from, to)
  return rows
    .map(([savedAt = '', form = '', ranges = '', rows = '']) => ({ savedAt, form, ranges, rows }))
    .filter((e) => e.savedAt.trim()) // a row cleared by hand
    .reverse()
}

export const useLogStore = defineStore('log', {
  state: () => ({
    sections: SPREADSHEETS.map((s) => blank(s.name)),
  }),
  actions: {
    // Read-only. Reads the newest chunk of one sheet's audit tab, once. A failure marks only that
    // section.
    async open(
      name: string,
      api: SheetsApi = sheetsApi,
      spreadsheets: Spreadsheet[] = SPREADSHEETS,
    ) {
      const section = this.sections.find((s) => s.name === name)
      const sheet = spreadsheets.find((s) => s.name === name)
      if (!section || !sheet || section.loaded || section.busy) return
      section.busy = true
      section.error = null
      try {
        const last = nextEmptyRow(await readColumnA(api, sheet.audit)) - 1
        const from = Math.max(2, last - CHUNK + 1)
        section.entries = last < 2 ? [] : await readChunk(api, sheet, from, last)
        section.oldest = from
        section.loaded = true
      } catch (e) {
        section.error = (e as Error).message
      } finally {
        section.busy = false
      }
    },
    // Reads the next older chunk and appends it. A failure keeps what is already shown.
    async more(
      name: string,
      api: SheetsApi = sheetsApi,
      spreadsheets: Spreadsheet[] = SPREADSHEETS,
    ) {
      const section = this.sections.find((s) => s.name === name)
      const sheet = spreadsheets.find((s) => s.name === name)
      if (!section || !sheet || !hasMore(section) || section.busy) return
      section.busy = true
      section.error = null
      try {
        const to = section.oldest - 1
        const from = Math.max(2, to - CHUNK + 1)
        section.entries.push(...(await readChunk(api, sheet, from, to)))
        section.oldest = from
      } catch (e) {
        section.error = (e as Error).message
      } finally {
        section.busy = false
      }
    },
    reset() {
      this.sections = SPREADSHEETS.map((s) => blank(s.name))
    },
  },
})
