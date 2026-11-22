import { defineStore } from 'pinia'

import { ANOMALY_RUNS } from '@/config/limits'
import { ANOMALY_TAB, GEAR_TAB } from '@/config/sheets'
import {
  anomalyGearRow,
  applyToRun,
  isRunComplete,
  lastRunDefaults,
  newRun,
  rowNumbersForDate,
  toRow,
} from '@/services/anomaly/anomalyRows'
import type { SheetsApi } from '@/services/google/sheetsApi'
import { nextEmptyRow, readColumnA, readRows, writeTabsAtEnd } from '@/services/sheets/tabWriter'
import type { WriteTarget } from '@/services/sheets/tabWriter'
import { sheetsApi } from '@/stores/authStore'
import type { AnomalyRun, RunDefaults } from '@/types/anomaly'
import { gameDay } from '@/utils/gameDay'

export const useAnomalyStore = defineStore('anomaly', {
  state: () => ({
    date: gameDay(),
    doubleDay: false,
    runs: [] as AnomalyRun[],
    touched: [] as boolean[],
    status: 'idle' as 'idle' | 'loading' | 'saving' | 'saved' | 'error',
    error: null as string | null,
    // Rows (A-I) already in the sheet for `date`. Any row locks the day: one save per game day.
    loggedRows: [] as string[][],
    lastSaved: [] as { updatedRange: string; count: number }[],
  }),

  getters: {
    dailyLimit: (state) => (state.doubleDay ? ANOMALY_RUNS.double : ANOMALY_RUNS.normal),
    // Every save logs the full daily limit.
    activeRuns(): AnomalyRun[] {
      return this.runs.slice(0, this.dailyLimit)
    },
    locked: (state) => state.loggedRows.length > 0,
    canSave(): boolean {
      return (
        !this.locked &&
        this.status !== 'saving' &&
        this.status !== 'loading' &&
        this.activeRuns.length > 0 &&
        this.activeRuns.every(isRunComplete)
      )
    },
  },

  actions: {
    async load(api: SheetsApi = sheetsApi): Promise<boolean> {
      this.status = 'loading'
      this.error = null
      try {
        const colA = await readColumnA(api, ANOMALY_TAB)
        const lastDataRow = nextEmptyRow(colA) - 1
        const [lastRow] =
          lastDataRow > 1 ? await readRows(api, ANOMALY_TAB, lastDataRow, lastDataRow) : []
        await this.readDay(api, colA)
        this.reset(lastRunDefaults(lastRow))
        this.status = 'idle'
        return true
      } catch (e) {
        this.status = 'error'
        this.error = (e as Error).message
        return false
      }
    },

    reset(defaults: RunDefaults) {
      this.runs = Array.from({ length: ANOMALY_RUNS.double }, () => newRun(defaults))
      this.touched = Array(ANOMALY_RUNS.double).fill(false)
    },

    async readDay(api: SheetsApi = sheetsApi, colA?: string[]) {
      const date = this.date
      const nums = rowNumbersForDate(colA ?? (await readColumnA(api, ANOMALY_TAB)), date)
      const rows = nums.length
        ? await readRows(api, ANOMALY_TAB, nums[0], nums[nums.length - 1])
        : []
      // The date may have changed while reading; a stale answer must not lock the new date.
      if (date === this.date) this.loggedRows = nums.map((n) => rows[n - nums[0]] ?? [])
    },

    setBossOrStage(index: number, patch: Partial<RunDefaults>) {
      this.runs = applyToRun(this.runs, this.touched, index, patch)
      this.touched[index] = true
    },

    // Filling a run in counts as touching it, so later carry-forward leaves it alone.
    setRun(index: number, patch: Partial<AnomalyRun>) {
      this.runs[index] = { ...this.runs[index], ...patch }
      this.touched[index] = true
    },

    setDoubleDay(on: boolean) {
      this.doubleDay = on
    },

    async save(api: SheetsApi = sheetsApi) {
      if (!this.canSave) return
      this.status = 'saving'
      this.error = null
      this.lastSaved = []
      try {
        // Re-read at save time: another device may have logged since this page loaded.
        await this.readDay(api)
        if (this.locked) throw new Error(`Already logged for ${this.date}.`)
        const rows = this.activeRuns.map((run) => toRow(this.date, run))
        const gearRows = this.activeRuns
          .map((run) => anomalyGearRow(this.date, run))
          .filter((r) => r !== null)
        // Gear drops go to Gear in the same write, so the two tabs never disagree.
        const targets: WriteTarget[] = [{ tab: ANOMALY_TAB, rows }]
        if (gearRows.length) targets.push({ tab: GEAR_TAB, rows: gearRows })
        const { updatedRanges } = await writeTabsAtEnd(api, targets, 'Anomaly')
        // Clear the form before reloading, so a failed reload can't leave saved runs to resave.
        const last = this.activeRuns[this.activeRuns.length - 1]
        this.lastSaved = targets.map((t, i) => ({
          updatedRange: updatedRanges[i],
          count: t.rows.length,
        }))
        this.reset({ boss: last.boss, stage: last.stage })
        if (await this.load(api)) this.status = 'saved'
      } catch (e) {
        this.status = 'error'
        this.error = (e as Error).message
      }
    },
  },
})
