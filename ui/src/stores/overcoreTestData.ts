import { ALL_PULLS_TAB, OVERCORED_TAB, ROSTER_LOG_TAB } from '@/config/sheets'

// Fake-sheet values for the tabs checkOvercores reads and the Overcored tab it may write.
// Nothing is baselined, so a save makes no overcore unless the test adds a RosterLog row.
export const overcoreValues = (): Record<string, string[][]> => ({
  "'AllPulls'!A1:F": [[...ALL_PULLS_TAB.headers]],
  "'RosterLog'!A1:D": [[...ROSTER_LOG_TAB.headers]],
  "'Overcored'!A1:E1": [[...OVERCORED_TAB.headers]],
  "'Overcored'!A:A": [['date']],
})

// A baseline before any test entry date, so the next copy is C8.
export const baseline = (name: string, copies = '11') => ['2026-11-10', '5001', name, copies]
