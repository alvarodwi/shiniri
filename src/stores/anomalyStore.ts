import { defineStore } from 'pinia'

import { ANOMALY_TAB } from '@/config/sheets'
import {
  applyToRun,
  countRowsForDate,
  isRunComplete,
  lastRunDefaults,
  newRun,
  toRow,
} from '@/services/anomaly/anomalyRows'
import type { SheetsApi } from '@/services/google/sheetsApi'
import { nextEmptyRow, readColumnA, readRows, writeRowsAtEnd } from '@/services/sheets/tabWriter'
import { sheetsApi } from '@/stores/authStore'
import type { AnomalyRun, RunDefaults } from '@/types/anomaly'
import { gameDay } from '@/utils/gameDay'

const MAX_RUNS = 10
const NORMAL_LIMIT = 5

export type ConfirmDuplicate = (existing: number, after: number) => boolean | Promise<boolean>

export const useAnomalyStore = defineStore('anomaly', {
  state: () => ({
    date: gameDay(),
    doubleDay: false,
    runCount: NORMAL_LIMIT,
    runs: [] as AnomalyRun[],
    touched: [] as boolean[],
    status: 'idle' as 'idle' | 'loading' | 'saving' | 'saved' | 'error',
    error: null as string | null,
    existingForDate: 0,
    lastSaved: null as { updatedRange: string; count: number } | null,
  }),

  getters: {
    dailyLimit: (state) => (state.doubleDay ? MAX_RUNS : NORMAL_LIMIT),
    activeRuns: (state) => state.runs.slice(0, state.runCount),
    canSave(): boolean {
      return (
        this.status !== 'saving' &&
        this.status !== 'loading' &&
        this.activeRuns.length > 0 &&
        this.activeRuns.every(isRunComplete)
      )
    },
  },

  actions: {
    async load(api: SheetsApi = sheetsApi) {
      this.status = 'loading'
      this.error = null
      try {
        const colA = await readColumnA(api, ANOMALY_TAB)
        const lastDataRow = nextEmptyRow(colA) - 1
        const [lastRow] =
          lastDataRow > 1 ? await readRows(api, ANOMALY_TAB, lastDataRow, lastDataRow) : []
        this.existingForDate = countRowsForDate(colA, this.date)
        this.reset(lastRunDefaults(lastRow))
        this.status = 'idle'
      } catch (e) {
        this.status = 'error'
        this.error = (e as Error).message
      }
    },

    reset(defaults: RunDefaults) {
      this.runs = Array.from({ length: MAX_RUNS }, () => newRun(defaults))
      this.touched = Array(MAX_RUNS).fill(false)
      this.runCount = this.dailyLimit
    },

    async refreshCount(api: SheetsApi = sheetsApi) {
      this.existingForDate = countRowsForDate(await readColumnA(api, ANOMALY_TAB), this.date)
    },

    setBossOrStage(index: number, patch: Partial<RunDefaults>) {
      this.runs = applyToRun(this.runs, this.touched, index, patch)
      this.touched[index] = true
    },

    setRun(index: number, patch: Partial<AnomalyRun>) {
      this.runs[index] = { ...this.runs[index], ...patch }
    },

    setRunCount(n: number) {
      this.runCount = Math.min(this.dailyLimit, Math.max(1, Math.trunc(n) || 1))
    },

    setDoubleDay(on: boolean) {
      this.doubleDay = on
      this.runCount = this.dailyLimit
    },

    async save(api: SheetsApi = sheetsApi, confirm: ConfirmDuplicate) {
      if (!this.canSave) return
      this.status = 'saving'
      this.error = null
      try {
        // Re-read at save time: another device may have logged since this page loaded.
        await this.refreshCount(api)
        const existing = this.existingForDate
        if (existing > 0 && !(await confirm(existing, existing + this.runCount))) {
          this.status = 'idle'
          return
        }
        const rows = this.activeRuns.map((run) => toRow(this.date, run))
        const { updatedRange } = await writeRowsAtEnd(api, ANOMALY_TAB, rows)
        const saved = { updatedRange, count: rows.length }
        await this.load(api)
        this.lastSaved = saved
        this.status = 'saved'
      } catch (e) {
        this.status = 'error'
        this.error = (e as Error).message
      }
    },
  },
})
