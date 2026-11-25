import { ANOMALY_TAB } from '@/config/sheets'
import type { TabSpec } from '@/config/sheets'

// A fact is the code-defined catalog entry; see docs/decisions/0008. `reads` names the tab and the
// header-named columns it needs; compute gets those columns (cells below the header) per tab name.
export type Columns = Record<string, Record<string, unknown[]>>
export type Answer = number | string | null // null = no answer; 0 is a real answer
export type Fact = {
  id: string
  title: string
  question: string
  reads: { tab: Pick<TabSpec, 'spreadsheetId' | 'tab'>; columns: string[] }[]
  compute: (cols: Columns) => Answer
}

// Placeholder for the tracer; the real facts come in a later session.
export const FACTS: Fact[] = [
  {
    id: 'anomaly-runs',
    title: 'Anomaly runs',
    question: 'How many Anomaly runs have I logged?',
    reads: [{ tab: ANOMALY_TAB, columns: ['date'] }],
    compute: (cols) => cols[ANOMALY_TAB.tab].date.filter((d) => d !== '' && d != null).length,
  },
]
