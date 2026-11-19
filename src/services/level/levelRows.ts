import { asText } from '@/services/anomaly/anomalyRows'
import type { RowCell } from '@/services/sheets/tabWriter'

const STEP = 5
// A typo like 2250000 would otherwise build millions of steps on every keystroke.
const MAX_STEPS = 100

// The last filled cell of column A (row 1 is the header) and its sheet row. It must be a level:
// the writer appends below it, so the formula above the new rows would subtract against it.
export function lastLevel(colA: string[]): { level: number; row: number } | null {
  let i = colA.length - 1
  while (i >= 1 && !colA[i].trim()) i--
  if (i < 1) return null
  const v = colA[i].trim()
  if (!Number.isFinite(Number(v))) throw new Error(`LevelLogs row ${i + 1} isn't a level: ${v}`)
  return { level: Number(v), row: i + 1 }
}

// Every multiple of 5 above `last` up to `target`, or [] when `target` can't be logged.
export function levelSteps(last: number | null, target: number): number[] {
  if (!Number.isInteger(target) || target <= 0 || target % STEP) return []
  if (last === null) return [target]
  const first = (Math.floor(last / STEP) + 1) * STEP
  const count = (target - first) / STEP + 1
  if (count < 1 || count > MAX_STEPS) return []
  return Array.from({ length: count }, (_, i) => first + i * STEP)
}

// Days spent at row n's level before the next one; blank until the next row exists.
const daysElapsed = (n: number) => `=IF(B${n + 1}="","",B${n + 1}-B${n})`

// A jump writes one row per step on the same date; the note belongs to the level actually reached.
export const toRows = (steps: number[], date: string, note: string): RowCell[][] =>
  steps.map((level, i) => [
    level,
    date,
    daysElapsed,
    i === steps.length - 1 ? asText(note.trim()) : '',
  ])
