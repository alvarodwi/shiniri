import { defineStore } from 'pinia'

import { OVERCORE_TAB, EXTRA_TAB } from '@/config/sheets'
import type { SheetsApi } from '@/services/google/sheetsApi'
import { readNikkes } from '@/services/nikke/nikkeDatabase'
import type { Nikke } from '@/services/nikke/nikkeDatabase'
import { otherPool, toRows } from '@/services/other/otherRows'
import { checkOvercores } from '@/services/overcore/overcore'
import { writeTabsAtEnd } from '@/services/sheets/tabWriter'
import { sheetsApi } from '@/stores/authStore'
import { FREE_PULLS, GUARANTEED } from '@/types/other'
import type { OtherEntry } from '@/types/other'
import { gameDay } from '@/utils/gameDay'

const newEntry = (): OtherEntry => ({
  date: gameDay(),
  sourceType: '',
  sourceInfo: '',
  rateUpName: '',
  gems: '',
  times: '',
  copies: '1',
  names: [],
  notes: '',
})

export const useOtherStore = defineStore('other', {
  state: () => ({
    entry: newEntry(),
    nikkes: [] as Nikke[],
    status: 'idle' as 'idle' | 'loading' | 'saving' | 'saved' | 'error',
    error: null as string | null,
    lastSaved: null as string | null,
    remark: null as string | null,
  }),

  getters: {
    rows: (state) => toRows(state.entry),
    pool: (state) => otherPool(state.nikkes),
    canSave(): boolean {
      return (
        this.rows !== null &&
        this.nikkes.length > 0 &&
        this.status !== 'loading' &&
        this.status !== 'saving'
      )
    },
  },

  actions: {
    // Runs on every visit to the page, so it must not undo a save in flight or a typed entry.
    async load(api: SheetsApi = sheetsApi): Promise<boolean> {
      if (this.status === 'saving') return false
      this.status = 'loading'
      this.error = null
      try {
        this.nikkes = await readNikkes(api)
        this.status = 'idle'
        return true
      } catch (e) {
        this.nikkes = []
        this.status = 'error'
        this.error = (e as Error).message
        return false
      }
    },

    // Clears what the new type doesn't use, so it can't reach the sheet.
    setSourceType(t: string) {
      const e = this.entry
      e.sourceType = t
      if (t !== FREE_PULLS) e.rateUpName = ''
      else e.sourceInfo = ''
      if (t !== GUARANTEED) {
        e.gems = ''
        e.times = ''
        e.names = e.names.slice(0, 1)
      }
    },

    async save(api: SheetsApi = sheetsApi) {
      const rows = this.rows
      if (!this.canSave || !rows) return
      this.status = 'saving'
      this.error = null
      this.lastSaved = null
      this.remark = null
      try {
        const entry = this.entry
        const oc = await checkOvercores(api, {
          from: 'Extra',
          detail: '',
          date: entry.date,
          // Welfare rows repeat one name once per copy; only Guaranteed SSR lists several names in one row.
          names: entry.sourceType === GUARANTEED ? entry.names : rows.map(() => entry.names[0]),
          nikkes: this.nikkes,
        })
        const { updatedRanges } = await writeTabsAtEnd(
          api,
          [
            { tab: EXTRA_TAB, rows },
            ...(oc.rows.length ? [{ tab: OVERCORE_TAB, rows: oc.rows }] : []),
          ],
          'Extra',
        )
        this.remark = oc.remark
        // Clear the form before reloading, so a failed reload can't leave the rows to be saved twice.
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
