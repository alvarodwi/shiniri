import { BOSSES, DROP_TYPE } from '@/types/anomaly'
import type { AnomalyRun, Boss, RunDefaults } from '@/types/anomaly'
import { ANOMALY_SOURCE } from '@/types/gear'
import type { Cell } from '@/types/sheet'

const FALLBACK: RunDefaults = { boss: 'Kraken', stage: 9 }

export const isDropped = (run: AnomalyRun): boolean => run.stage === 9 || run.dropped

export const needsGear = (run: AnomalyRun): boolean => run.boss !== 'Kraken' && isDropped(run)

export const isRunComplete = (run: AnomalyRun): boolean => !needsGear(run) || run.gear !== null

// Columns A-I of the Anomaly tab. Gear is written only when it can exist, so stale picks never leak.
export function toRow(date: string, run: AnomalyRun): Cell[] {
  const gear = needsGear(run) ? run.gear : null
  return [
    date,
    run.boss,
    run.stage,
    isDropped(run),
    run.modules,
    gear?.classType ?? '',
    gear?.manufacturer ?? '',
    DROP_TYPE[run.boss],
    asText(run.note.trim()),
  ]
}

// The T9Manu row for a run's gear drop, or null when the run has no gear.
export const anomalyGearRow = (date: string, run: AnomalyRun): Cell[] | null =>
  needsGear(run) && run.gear
    ? [date, ANOMALY_SOURCE, run.gear.classType, run.gear.manufacturer, DROP_TYPE[run.boss]]
    : null

// USER_ENTERED parses "=1+1", "-5" or "2026-11-19"; a leading apostrophe keeps it as typed text.
export const asText = (s: string): string => (s ? `'${s}` : '')

export function lastRunDefaults(row: string[] | undefined): RunDefaults {
  const boss = row?.[1]
  const stage = Number(row?.[2])
  if (!BOSSES.includes(boss as Boss) || !Number.isInteger(stage) || stage < 1 || stage > 9)
    return { ...FALLBACK }
  return { boss: boss as Boss, stage }
}

export const newRun = (d: RunDefaults): AnomalyRun => ({
  ...d,
  dropped: true,
  modules: 0, // most failed runs drop nothing, so 0 saves a tap
  gear: null,
  note: '',
})

export function applyToRun(
  runs: AnomalyRun[],
  touched: boolean[],
  index: number,
  patch: Partial<RunDefaults>,
): AnomalyRun[] {
  return runs.map((run, i) =>
    i === index || (i > index && !touched[i]) ? { ...run, ...patch } : run,
  )
}

const SHEETS_EPOCH = Date.UTC(1899, 11, 30)

// Column A holds real dates (serial numbers when read unformatted) or ISO text in older rows.
export function cellToIsoDate(value: string): string {
  const v = value.trim()
  if (!/^\d+(\.\d+)?$/.test(v)) return v
  return new Date(SHEETS_EPOCH + Math.floor(Number(v)) * 86_400_000).toISOString().slice(0, 10)
}

// 1-based sheet row numbers whose column A is the given date, in any order in the sheet.
export const rowNumbersForDate = (colA: string[], date: string): number[] =>
  colA.flatMap((v, i) => (cellToIsoDate(v) === date ? [i + 1] : []))
