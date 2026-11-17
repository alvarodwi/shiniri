// One entry per sheet tab a form writes to. `headers` is checked verbatim before every write.
export type TabSpec = { spreadsheetId: string; tab: string; headers: readonly string[] }

export const ANOMALY_TAB: TabSpec = {
  spreadsheetId: import.meta.env.VITE_JOURNAL_SHEET_ID,
  tab: 'Anomaly',
  // column I holds the optional note and has no header
  headers: [
    'date',
    'bossName',
    'stage',
    'dropped',
    'modules',
    'gear class',
    'gear manu',
    'dropType',
    '',
  ],
}
