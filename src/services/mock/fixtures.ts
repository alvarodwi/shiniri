import {
  ANOMALY_TAB,
  FURNACE_TAB,
  LEVEL_TAB,
  SOLO_RAID_TAB,
  SPREADSHEETS,
  T9MANU_TAB,
} from '@/config/sheets'
import type { TabSpec } from '@/config/sheets'
import type { Cell } from '@/types/sheet'

// Starting data for yarn dev:mock. Headers come from the real TabSpecs; rows are made up but shaped
// like the journal, with past dates only so today's forms are open. A new form adds its tab here.

const tab = (spec: TabSpec, rows: Cell[][]): [string, Cell[][]] => [
  spec.tab,
  [[...spec.headers], ...rows],
]

const days = (n: number) => `=IF(B${n + 1}="","",B${n + 1}-B${n})`

export const MOCK_TABS: Record<string, Cell[][]> = Object.fromEntries([
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
  ...SPREADSHEETS.map((s) =>
    tab(s.audit, [
      ['2026-11-17 21:04:12', 'Anomaly', "'Anomaly'!A2:I3", 2],
      ['2026-11-18 20:55:33', 'Anomaly', "'Anomaly'!A4:I5", 2],
    ]),
  ),
])
