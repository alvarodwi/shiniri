import { LEVEL_MAX_JUMP, LEVEL_STEP } from '@/config/limits'
import { asText } from '@/services/anomaly/anomalyRows'
import type { RowCell } from '@/services/sheets/tabWriter'

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

// Every multiple of LEVEL_STEP above `last` up to `target`, or [] when `target` can't be logged.
// The jump cap also keeps a typo like 2250000 from building millions of steps on every keystroke.
export function levelSteps(last: number | null, target: number): number[] {
  if (!Number.isInteger(target) || target <= 0 || target % LEVEL_STEP) return []
  if (last === null) return [target]
  const first = (Math.floor(last / LEVEL_STEP) + 1) * LEVEL_STEP
  const count = (target - first) / LEVEL_STEP + 1
  if (count < 1 || count * LEVEL_STEP > LEVEL_MAX_JUMP) return []
  return Array.from({ length: count }, (_, i) => first + i * LEVEL_STEP)
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
