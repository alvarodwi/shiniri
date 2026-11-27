import type { TabSpec } from '@/config/sheets'
import { ANOMALY_FACTS } from '@/services/stats/anomalyFacts'
import { SPECIAL_FACTS } from '@/services/stats/specialFacts'

// A fact is the code-defined catalog entry; see docs/decisions/0008. `reads` names the tab and the
// header-named columns it needs; compute gets those columns (cells below the header) per tab name.
export type Columns = Record<string, Record<string, unknown[]>>
export type Answer = string | null // null = no answer; "0" is a real answer
// The picker lists categories in this order.
export const CATEGORIES = [
  'Interception',
  'Gear',
  'Progress',
  'Raids',
  'Modes',
  'Pulls',
  'Roster',
  'Overcore',
  'Database',
  'Spending',
] as const
export type Category = (typeof CATEGORIES)[number]

// A filter has no default. Options are listed by the fact or derived from the loaded columns; "any"
// is an ordinary option a fact lists where it makes sense. An option's value is its chip text; `say`
// gives its question text where that differs ('' drops the slot).
export type Filter = {
  id: string
  label: string
  options: string[] | ((cols: Columns) => string[])
  say?: (value: string) => string
  kind?: 'dateRange' // built by dateRange(); also takes a custom range outside its options
}
export type Values = Record<string, string>
export type Fact = {
  id: string
  category: Category // topical group; the picker chooses a category before a fact
  title: string
  question: string // {filterId} is filled with the chosen value
  filters?: Filter[]
  reads: { tab: Pick<TabSpec, 'spreadsheetId' | 'tab'>; columns: string[] }[]
  compute: (cols: Columns, values: Values, today: string) => Answer // today = game day, YYYY-MM-DD
}

export const fillQuestion = (
  { question, filters }: Pick<Fact, 'question' | 'filters'>,
  values: Values,
) =>
  // A dropped slot takes the space before it along.
  question.replace(/( ?)\{(\w+)\}/g, (_, space, id) => {
    const value = values[id]
    const say = filters?.find((f) => f.id === id)?.say
    const text = value === undefined ? '…' : say ? say(value) : value
    return text && space + text
  })

// Mostly one file per tab; see format.ts and rules.ts for how a compute writes its answer.
export const FACTS: Fact[] = [...ANOMALY_FACTS, ...SPECIAL_FACTS]
