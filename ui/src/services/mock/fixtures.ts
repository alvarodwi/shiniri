import {
  ANOMALY_TAB,
  EVENT_TAB,
  FURNACE_TAB,
  LEVEL_TAB,
  NIKKE_DATABASE_TAB,
  MOLDS_TAB,
  SPARE_BODY_TAB,
  OTHER_TAB,
  ORDINARY_TAB,
  SOCIAL_TAB,
  SOLO_RAID_TAB,
  SPREADSHEETS,
  T9MANU_TAB,
} from '@/config/sheets'
import type { TabSpec } from '@/config/sheets'
import type { Cell } from '@/types/sheet'

// Starting data for yarn dev:mock. Headers come from the real TabSpecs; rows are made up but shaped
// like the journal, with past dates only so today's forms are open. A new form adds its tab here.

type Seed = [TabSpec, Cell[][]]

// Groups seeds by spreadsheet id, then tab name, so same-named tabs (AuditLog) stay apart.
const sheets = (seeds: Seed[]): Record<string, Record<string, Cell[][]>> => {
  const out: Record<string, Record<string, Cell[][]>> = {}
  for (const [spec, rows] of seeds)
    (out[spec.spreadsheetId] ??= {})[spec.tab] = [[...spec.headers], ...rows]
  return out
}

const tab = (spec: TabSpec, rows: Cell[][]): Seed => [spec, rows]

// Each AuditLog is seeded by its own SPREADSHEETS entry.
const AUDIT_ROWS: Record<string, Cell[][]> = {
  Progression: [
    ['2026-11-17 21:04:12', 'Anomaly', "'Anomaly'!A2:I3", 2],
    ['2026-11-18 20:55:33', 'Anomaly', "'Anomaly'!A4:I5", 2],
  ],
  Gacha: [
    ['2026-11-21 06:00:05', 'cli-nikke-database', "'NikkeDatabase'!A2:J4", 3],
    ['2026-11-21 07:00:05', 'cli-nikke-database', "'NikkeDatabase'!A5:J5", 1],
  ],
}

const days = (n: number) => `=IF(B${n + 1}="","",B${n + 1}-B${n})`

export const MOCK_SHEETS = sheets([
  tab(ANOMALY_TAB, [
    ['2026-11-17', 'Kraken', 9, true, 2, '', '', 'Modules', ''],
    ['2026-11-17', 'Ultra', 9, true, 0, 'Attacker', 'Tetra', 'Helmet', ''],
    ['2026-11-18', 'Mirror Container', 8, false, 1, '', '', 'Gloves', ''],
    ['2026-11-18', 'Harvester', 9, true, 0, 'Defender', 'Elysion', 'Boots', 'first clear'],
  ]),
  tab(T9MANU_TAB, [
    ['2026-11-16', 'Manufacturer Arms', 'Supporter', 'Missilis', 'Torso'],
    ['2026-11-17', 'Anomaly Interception', 'Attacker', 'Tetra', 'Helmet'],
    ['2026-11-18', 'Anomaly Interception', 'Defender', 'Elysion', 'Boots'],
  ]),
  tab(FURNACE_TAB, [
    [
      '2026-11-10',
      'Pilgrim',
      'Abnormal-Supporter-Torso',
      'Abnormal-Attacker-Boots',
      'Pilgrim-Defender-Torso',
    ],
    [
      '2026-11-15',
      'Tetra',
      'Missilis-Supporter-Helmet',
      'Elysion-Attacker-Gloves',
      'Tetra-Attacker-Helmet',
    ],
  ]),
  tab(LEVEL_TAB, [
    [760, '2026-10-02', days(2), ''],
    [765, '2026-10-20', days(3), ''],
    [770, '2026-11-08', days(4), 'jumped after squatting'],
    [775, '2026-11-08', days(5), ''],
    [780, '2026-11-08', days(6), ''],
  ]),
  tab(SOLO_RAID_TAB, [
    [43, '2026-09-12', 'Mother Whale', 'Electric', 9876543210, '9.12%', ''],
    [44, '2026-10-15', 'Gravedigger', 'Fire', 11234567890, '8.40%', 'new team'],
  ]),
  tab(NIKKE_DATABASE_TAB, [
    [5001, 'Rapi', 'SSR', 'ELYSION', 'Attacker', 'Step3', 'Fire', 'AR', 10, 45000],
    [5002, 'Anis', 'SR', 'TETRA', 'Supporter', 'Step1', 'Electronic', 'SG', 11, 45000],
    [
      5003,
      'Asuka Shikinami Langley',
      'SSR',
      'ABNORMAL',
      'Attacker',
      'Step3',
      'Fire',
      'AR',
      312,
      '',
    ],
    [5004, 'New Nikke', 'SSR', 'MISSILIS', 'Defender', 'Step2', 'Water', 'MG', 999, ''],
  ]),
  tab(EVENT_TAB, [
    ['2026-11-10', "'Rumani", 'Regular', 1500, 3, 8, 1, "'Rumani", ''],
    ['2026-11-14', '', 'Summer Limited', 0, 10, 10, 0, '', "'free banner"],
  ]),
  tab(ORDINARY_TAB, [
    ['2026-11-05', 0, 60, 60, 2, "'Alice, Maxwell", ''],
    ['2026-11-12', 0, 40, 40, 0, '', "'shafted"],
  ]),
  tab(MOLDS_TAB, [
    ['2026-11-06', 'Yellow Mold', 5, 2, "'Maiden, Folkwang", ''],
    ['2026-11-13', 'Purple Mold', 3, 0, '', ''],
  ]),
  tab(SPARE_BODY_TAB, [
    ['2026-11-18', "'Marian: Queen", 'Gold Mileage', ''],
    ['2026-07-23', "'Flora", 'Silver Mileage', ''],
  ]),
  tab(OTHER_TAB, [
    ['2026-04-23', 'Welfare Unit', "'3.5 Anniv", '', '', 1, 1, "'Avistar", ''],
    ['2026-01-05', 'Guaranteed SSR', "'Step Up 2026", '', 6600, 31, 2, "'Yan, Grave", ''],
  ]),
  tab(SOCIAL_TAB, [
    ['2026-11-04', 10, 1, "'Rumani", ''],
    ['2026-11-13', 20, 0, '', ''],
    ['2026-11-17', 20, 0, '', "'let's make a habit of 20 pull every tuesday"],
  ]),
  ...SPREADSHEETS.map((s) => tab(s.audit, AUDIT_ROWS[s.name])),
])
