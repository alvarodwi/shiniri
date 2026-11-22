// One entry per sheet tab a form writes to. `headers` is checked verbatim before every write.
export type TabSpec = { spreadsheetId: string; tab: string; headers: readonly string[] }

export const ANOMALY_TAB: TabSpec = {
  spreadsheetId: import.meta.env.VITE_JOURNAL_SHEET_ID,
  tab: 'Anomaly',
  // column I holds the optional note and has no header
  headers: ['date', 'boss', 'stage', 'dropped', 'modules', 'class', 'manufacturer', 'dropType', ''],
}

export const GEAR_TAB: TabSpec = {
  spreadsheetId: import.meta.env.VITE_JOURNAL_SHEET_ID,
  tab: 'Gear',
  headers: ['date', 'source', 'class', 'manufacturer', 'slot'],
}

// daysElapsed holds a formula the app writes per row; see services/level/levelRows.ts.
export const LEVEL_TAB: TabSpec = {
  spreadsheetId: import.meta.env.VITE_JOURNAL_SHEET_ID,
  tab: 'LevelLog',
  headers: ['synchroLevel', 'date', 'daysElapsed', 'notes'],
}

export const SOLO_RAID_TAB: TabSpec = {
  spreadsheetId: import.meta.env.VITE_JOURNAL_SHEET_ID,
  tab: 'SoloRaid',
  headers: ['season', 'month', 'boss', 'weakness', 'damage', 'rank', 'notes'],
}

export const FURNACE_TAB: TabSpec = {
  spreadsheetId: import.meta.env.VITE_JOURNAL_SHEET_ID,
  tab: 'Furnace',
  headers: ['date', 'target', 'sacrifice1', 'sacrifice2', 'result'],
}

// Read-only here: the cli writes it.
export const NIKKE_DATABASE_TAB: TabSpec = {
  spreadsheetId: import.meta.env.VITE_GACHA_SHEET_ID,
  tab: 'NikkeDatabase',
  headers: [
    'nameCode',
    'nikke',
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
  headers: ['date', 'pulls', 'totalSsr', 'ssrDetails', 'notes'],
}

// pulls is tickets + gems / 300 and totalSsr is the count of ssrDetails; see services/event/eventRows.ts.
export const EVENT_TAB: TabSpec = {
  spreadsheetId: import.meta.env.VITE_GACHA_SHEET_ID,
  tab: 'Event',
  headers: [
    'date',
    'rateUpName',
    'rateUpType',
    'gems',
    'tickets',
    'pulls',
    'totalSsr',
    'ssrDetails',
    'notes',
  ],
}

// pulls is tickets + gems / 300 and totalSsr is the count of ssrDetails; see services/ordinary/ordinaryRows.ts.
export const ORDINARY_TAB: TabSpec = {
  spreadsheetId: import.meta.env.VITE_GACHA_SHEET_ID,
  tab: 'Ordinary',
  headers: ['date', 'gems', 'tickets', 'pulls', 'totalSsr', 'ssrDetails', 'notes'],
}

// totalSsr is the count of ssrDetails; see services/molds/moldRows.ts.
export const MOLD_TAB: TabSpec = {
  spreadsheetId: import.meta.env.VITE_GACHA_SHEET_ID,
  tab: 'Mold',
  headers: ['date', 'moldType', 'pulls', 'totalSsr', 'ssrDetails', 'notes'],
}

// One row per copy; see services/spareBody/spareBodyRows.ts.
export const EXCHANGE_TAB: TabSpec = {
  spreadsheetId: import.meta.env.VITE_GACHA_SHEET_ID,
  tab: 'Exchange',
  headers: ['date', 'nikke', 'source', 'notes'],
}

// totalSsr is the count of ssrDetails; see services/other/otherRows.ts.
export const EXTRA_TAB: TabSpec = {
  spreadsheetId: import.meta.env.VITE_GACHA_SHEET_ID,
  tab: 'Extra',
  headers: [
    'date',
    'source',
    'sourceDetail',
    'rateUpName',
    'gems',
    'pulls',
    'totalSsr',
    'ssrDetails',
    'notes',
  ],
}

// One row per purchase; prices are numbers the sheet formats as currency. See services/spending.
export const SPENDING_TAB: TabSpec = {
  spreadsheetId: import.meta.env.VITE_GACHA_SHEET_ID,
  tab: 'Spending',
  headers: ['date', 'packageName', 'type', 'priceIdr', 'priceUsd', 'platform', 'notes'],
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

// Read-only here: sheet formulas fill copy and isOvercore.
export const ALL_PULLS_TAB: TabSpec = {
  spreadsheetId: import.meta.env.VITE_GACHA_SHEET_ID,
  tab: 'AllPulls',
  headers: ['date', 'nikke', 'source', 'spook', 'copy', 'isOvercore'],
}

// Read-only here: the cli writes it.
export const ROSTER_LOG_TAB: TabSpec = {
  spreadsheetId: import.meta.env.VITE_GACHA_SHEET_ID,
  tab: 'RosterLog',
  headers: ['date', 'nameCode', 'nikke', 'copies'],
}

// One row per Nikke copy past C7; notes stays blank, the owner fills it by hand.
export const OVERCORE_TAB: TabSpec = {
  spreadsheetId: import.meta.env.VITE_GACHA_SHEET_ID,
  tab: 'Overcore',
  headers: ['date', 'source', 'nikke', 'manufacturer', 'notes'],
}
