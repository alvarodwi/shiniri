import { ANOMALY_TAB } from '@/config/sheets'
import type { TabSpec } from '@/config/sheets'
import { ANY_TIME, RANGE_PRESETS, inRange } from '@/services/stats/ranges'

// A fact is the code-defined catalog entry; see docs/decisions/0008. `reads` names the tab and the
// header-named columns it needs; compute gets those columns (cells below the header) per tab name.
export type Columns = Record<string, Record<string, unknown[]>>
export type Answer = number | string | null // null = no answer; 0 is a real answer
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
  title: string
  question: string // {filterId} is filled with the chosen value
  filters?: Filter[]
  reads: { tab: Pick<TabSpec, 'spreadsheetId' | 'tab'>; columns: string[] }[]
  compute: (cols: Columns, values: Values, today: string) => Answer // today = game day, YYYY-MM-DD
}

export const fillQuestion = (q: string, values: Values) =>
  q.replace(/\{(\w+)\}/g, (_, id) => values[id] ?? '…')

// Placeholder facts for the tracer; the real facts come in a later session.
export const FACTS: Fact[] = [
  {
    id: 'anomaly-runs',
    title: 'Anomaly runs',
    question: 'How many Anomaly runs have I logged?',
    reads: [{ tab: ANOMALY_TAB, columns: ['date'] }],
    compute: (cols) => cols[ANOMALY_TAB.tab].date.filter((d) => d !== '' && d != null).length,
  },
  {
    id: 'anomaly-runs-by-boss',
    title: 'Anomaly runs by boss',
    question: 'How many Anomaly runs have I logged against {boss}?',
    filters: [
      {
        id: 'boss',
        label: 'Boss',
        options: (cols) => [
          'any boss',
          ...new Set(cols[ANOMALY_TAB.tab].boss.filter((b) => b !== '' && b != null).map(String)),
        ],
      },
    ],
    reads: [{ tab: ANOMALY_TAB, columns: ['boss'] }],
    compute: (cols, { boss }) =>
      cols[ANOMALY_TAB.tab].boss.filter((b) => b !== '' && (boss === 'any boss' || b === boss))
        .length,
  },
  {
    id: 'anomaly-runs-by-range',
    title: 'Anomaly runs by range',
    question: 'How many Anomaly runs have I logged {range}?',
    filters: [{ id: 'range', label: 'Range', options: [ANY_TIME, ...RANGE_PRESETS] }],
    reads: [{ tab: ANOMALY_TAB, columns: ['date'] }],
    compute: (cols, { range }, today) =>
      cols[ANOMALY_TAB.tab].date.filter(inRange(range, today)).length,
  },
]
