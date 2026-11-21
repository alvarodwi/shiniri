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

// daysElapsed holds a formula the app writes per row; see services/level/levelRows.ts.
export const LEVEL_TAB: TabSpec = {
  spreadsheetId: import.meta.env.VITE_JOURNAL_SHEET_ID,
  tab: 'LevelLogs',
  headers: ['newSynchroLevel', 'achievedAt', 'daysElapsed', 'note'],
}

export const SOLO_RAID_TAB: TabSpec = {
  spreadsheetId: import.meta.env.VITE_JOURNAL_SHEET_ID,
  tab: 'SoloRaid',
  headers: ['season', 'month', 'boss', 'weakness', 'totalDmg', 'rank', 'comments'],
}

export const FURNACE_TAB: TabSpec = {
  spreadsheetId: import.meta.env.VITE_JOURNAL_SHEET_ID,
  tab: 'Furnace',
  headers: ['Date', 'Target', 'Sacrifice 1', 'Sacrifice 2', 'Result'],
}

// Read-only here: the cli writes it.
export const NIKKE_DATABASE_TAB: TabSpec = {
  spreadsheetId: import.meta.env.VITE_GACHA_SHEET_ID,
  tab: 'NikkeDatabase',
  headers: [
    'nameCode',
    'name',
    'rarity',
    'manufacturer',
    'class',
    'burst',
    'element',
    'weapon',
    'resourceId',
    'releaseDate',
  ],
}

// totalSsr is the count of the names in ssrDetails; see services/social/socialRows.ts.
export const SOCIAL_TAB: TabSpec = {
  spreadsheetId: import.meta.env.VITE_GACHA_SHEET_ID,
  tab: 'Social',
  headers: ['date', 'times', 'totalSsr', 'ssrDetails', 'notes'],
}

// times is tix + gems / 300 and totalSsr is the count of ssrDetails; see services/event/eventRows.ts.
export const EVENT_TAB: TabSpec = {
  spreadsheetId: import.meta.env.VITE_GACHA_SHEET_ID,
  tab: 'Event',
  headers: [
    'date',
    'rateUpName',
    'rateUpType',
    'gems',
    'tix',
    'times',
    'totalSsr',
    'ssrDetails',
    'notes',
  ],
}

// times is tix + gems / 300 and totalSsr is the count of ssrDetails; see services/ordinary/ordinaryRows.ts.
export const ORDINARY_TAB: TabSpec = {
  spreadsheetId: import.meta.env.VITE_GACHA_SHEET_ID,
  tab: 'Ordinary',
  headers: ['date', 'gems', 'tix', 'times', 'totalSsr', 'ssrDetails', 'notes'],
}

// ssr is the count of result; see services/molds/moldRows.ts.
export const MOLDS_TAB: TabSpec = {
  spreadsheetId: import.meta.env.VITE_GACHA_SHEET_ID,
  tab: 'Molds',
  headers: ['date', 'moldType', 'amount', 'ssr', 'result', 'notes'],
}

// One row per copy; see services/spareBody/spareBodyRows.ts.
export const SPARE_BODY_TAB: TabSpec = {
  spreadsheetId: import.meta.env.VITE_GACHA_SHEET_ID,
  tab: 'SpareBody',
  headers: ['date', 'target', 'source', 'notes'],
}

// totalSsr is the count of ssrDetails; see services/other/otherRows.ts.
export const OTHER_TAB: TabSpec = {
  spreadsheetId: import.meta.env.VITE_GACHA_SHEET_ID,
  tab: 'Other',
  headers: [
    'date',
    'sourceType',
    'sourceInfo',
    'rateUpName',
    'gems',
    'times',
    'totalSsr',
    'ssrDetails',
    'notes',
  ],
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
  {
    name: 'Gacha',
    audit: {
      spreadsheetId: import.meta.env.VITE_GACHA_SHEET_ID,
      tab: 'AuditLog',
      headers: AUDIT_HEADERS,
    },
  },
]
