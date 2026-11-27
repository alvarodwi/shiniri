import type { TabSpec } from '@/config/sheets'

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
// is an ordinary option a fact lists where it makes sense.
export type Filter = {
  id: string
  label: string
  options: string[] | ((cols: Columns) => string[])
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

export const fillQuestion = (q: string, values: Values) =>
  q.replace(/\{(\w+)\}/g, (_, id) => values[id] ?? '…')

// Filled per tab; see format.ts and rules.ts for how a compute writes its answer.
export const FACTS: Fact[] = []
