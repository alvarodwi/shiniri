import { defineStore } from 'pinia'

import { SPENDING_TAB } from '@/config/sheets'
import type { SheetsApi } from '@/services/google/sheetsApi'
import { readNikkes } from '@/services/nikke/nikkeDatabase'
import type { Nikke } from '@/services/nikke/nikkeDatabase'
import { checkHeaders, writeTabsAtEnd } from '@/services/sheets/tabWriter'
import {
  lastMonthly,
  packageName,
  pastNames,
  spendingPool,
  suggestedPlatform,
  toHistory,
  toRow,
} from '@/services/spending/spendingRows'
import type { Purchase } from '@/services/spending/spendingRows'
import { sheetsApi } from '@/stores/authStore'
import type { SpendingEntry } from '@/types/spending'
import { wibTimestamp } from '@/utils/wibTimestamp'

// A purchase belongs to its calendar day in WIB, not the game day.
const newEntry = (): SpendingEntry => ({
  date: wibTimestamp().slice(0, 10),
  type: '',
  name: '',
  ssr: '',
  month: '',
  priceIdr: '',
  priceUsd: '',
  platform: '',
  notes: '',
})

async function readHistory(api: SheetsApi): Promise<Purchase[]> {
  const rows = await api.getValues(
    SPENDING_TAB.spreadsheetId,
    `'${SPENDING_TAB.tab}'!A1:G`,
    'UNFORMATTED_VALUE',
  )
  checkHeaders(SPENDING_TAB, rows[0] ?? [])
  return toHistory(rows.slice(1))
}

export const useSpendingStore = defineStore('spending', {
  state: () => ({
    entry: newEntry(),
    nikkes: [] as Nikke[],
    history: [] as Purchase[],
    status: 'idle' as 'idle' | 'loading' | 'saving' | 'saved' | 'error',
    error: null as string | null,
    lastSaved: null as string | null,
  }),

  getters: {
    pool: (state) => spendingPool(state.nikkes),
    name: (state) => packageName(state.entry),
    pastNames: (state) => pastNames(state.history, state.entry.type),
    // A platform the owner tapped wins; otherwise the one this package or type last used.
    platform(): string {
      return this.entry.platform || suggestedPlatform(this.history, this.name, this.entry.type)
    },
    row(): ReturnType<typeof toRow> {
      return toRow(this.entry, this.platform)
    },
    canSave(): boolean {
      return this.row !== null && this.status !== 'loading' && this.status !== 'saving'
    },
  },

  actions: {
    // Runs on every visit to the page, so it must not undo a save in flight or a typed entry.
    async load(api: SheetsApi = sheetsApi): Promise<boolean> {
      if (this.status === 'saving') return false
      this.status = 'loading'
      this.error = null
      try {
        ;[this.history, this.nikkes] = await Promise.all([readHistory(api), readNikkes(api)])
        this.status = 'idle'
        return true
      } catch (e) {
        this.status = 'error'
        this.error = (e as Error).message
        return false
      }
    },

    // Clears what the new type doesn't use, so a stale name or SSR can't reach the sheet.
    setType(t: string) {
      const e = this.entry
      if (e.type === t) return
      e.type = t
      e.name = ''
      e.ssr = ''
      e.month = ''
      e.platform = ''
      e.priceIdr = ''
      e.priceUsd = ''
    },

    // The monthly pass in one tap: prices and platform as last time, when there is a last time.
    quickMonthly() {
      this.setType('Monthly Pass')
      const prev = lastMonthly(this.history)
      this.entry.platform = ''
      this.entry.priceIdr = prev?.priceIdr ?? ''
      this.entry.priceUsd = prev?.priceUsd ?? ''
    },

    async save(api: SheetsApi = sheetsApi) {
      const row = this.row
      if (!this.canSave || !row) return
      this.status = 'saving'
      this.error = null
      this.lastSaved = null
      try {
        const { updatedRanges } = await writeTabsAtEnd(
          api,
          [{ tab: SPENDING_TAB, rows: [row] }],
          'Spending',
        )
        // Clear the form before reloading, so a failed reload can't leave the row to be saved twice.
        this.entry = newEntry()
        this.lastSaved = updatedRanges[0]
        this.status = 'idle' // the write is done; let load run
        if (await this.load(api)) this.status = 'saved'
      } catch (e) {
        this.status = 'error'
        this.error = (e as Error).message
      }
    },
  },
})
