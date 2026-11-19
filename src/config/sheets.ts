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
    'gearClass',
    'gearManu',
    'dropType',
    '',
  ],
}

export const T9MANU_TAB: TabSpec = {
  spreadsheetId: import.meta.env.VITE_JOURNAL_SHEET_ID,
  tab: 'T9Manu',
  headers: ['date', 'sourceType', 'classType', 'manufacturer', 'slotType'],
}

export const FURNACE_TAB: TabSpec = {
  spreadsheetId: import.meta.env.VITE_JOURNAL_SHEET_ID,
  tab: 'Furnace',
  headers: ['Date', 'Target', 'Sacrifice 1', 'Sacrifice 2', 'Result'],
}

// Every save appends one row here, in the same write as its data.
export const AUDIT_HEADERS = ['savedAt', 'form', 'ranges', 'rows'] as const

export type Spreadsheet = { name: string; audit: TabSpec }

export const SPREADSHEETS: Spreadsheet[] = [
  {
    name: 'Progression',
    audit: {
      spreadsheetId: import.meta.env.VITE_JOURNAL_SHEET_ID,
      tab: 'AuditLog',
      headers: AUDIT_HEADERS,
    },
  },
]
