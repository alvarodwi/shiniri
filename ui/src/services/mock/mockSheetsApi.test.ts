import { describe, expect, it } from 'vitest'

import { MOCK_SHEETS } from './fixtures'
import { createMockSheetsApi } from './mockSheetsApi'

import {
  ANOMALY_TAB,
  FURNACE_TAB,
  LEVEL_TAB,
  SOLO_RAID_TAB,
  SPREADSHEETS,
  T9MANU_TAB,
} from '@/config/sheets'

const grid = () => ({
  id: {
    T: [
      ['date', 'boss', 'note'],
      ['2026-11-10', 'Kraken', 5],
      ['', '', ''],
      ['2026-11-12', 'Ultra', ''],
    ],
  },
})

describe('createMockSheetsApi reads', () => {
  it('reads a header row, a column with an inner blank row, and a single cell as strings', async () => {
    const api = createMockSheetsApi(grid())
    expect(await api.getValues('id', "'T'!A1:C1")).toEqual([['date', 'boss', 'note']])
    expect(await api.getValues('id', "'T'!A:A")).toEqual([
      ['date'],
      ['2026-11-10'],
      [],
      ['2026-11-12'],
    ])
    expect(await api.getValues('id', "'T'!C2")).toEqual([['5']])
  })

  it('drops trailing empty cells and rows like the real API', async () => {
    const api = createMockSheetsApi(grid())
    expect(await api.getValues('id', "'T'!A3:C3")).toEqual([])
    expect(await api.getValues('id', "'T'!A4:C9")).toEqual([['2026-11-12', 'Ultra']])
  })

  it('keeps seeded values as they are stored, apostrophes included', async () => {
    const api = createMockSheetsApi({ id: { T: [['ranges'], ["'Anomaly'!A2:I3"]] } })
    expect(await api.getValues('id', "'T'!A2")).toEqual([["'Anomaly'!A2:I3"]])
  })

  it('reads nothing from an unknown tab', async () => {
    expect(await createMockSheetsApi(grid()).getValues('id', "'Nope'!A:A")).toEqual([])
  })

  it('does not change the grid it was given', async () => {
    const tabs = grid()
    const api = createMockSheetsApi(tabs)
    await api.batchUpdateValues('id', [{ range: "'T'!A5:C5", rows: [['x', 'y', 'z']] }])
    expect(tabs.id.T).toHaveLength(4)
  })
})

describe('createMockSheetsApi writes', () => {
  it('writes rows the next read sees, parsing a leading apostrophe as text', async () => {
    const api = createMockSheetsApi(grid())
    const res = await api.batchUpdateValues('id', [
      {
        range: "'T'!A5:C6",
        rows: [
          ['2026-11-13', "'7.95%", 12],
          ['2026-11-14', 'Ultra', ''],
        ],
      },
    ])
    expect(res.updatedRanges).toEqual(["'T'!A5:C6"])
    expect(await api.getValues('id', "'T'!A5:C6")).toEqual([
      ['2026-11-13', '7.95%', '12'],
      ['2026-11-14', 'Ultra'],
    ])
  })

  it('refuses a batch with an unknown tab and writes none of it', async () => {
    const api = createMockSheetsApi(grid())
    await expect(
      api.batchUpdateValues('id', [
        { range: "'T'!A5:A5", rows: [['x']] },
        { range: "'Nope'!A2:A2", rows: [['x']] },
      ]),
    ).rejects.toThrow(/Nope/)
    expect(await api.getValues('id', "'T'!A5")).toEqual([])
  })

  it('reads booleans back as TRUE and FALSE, like the real API', async () => {
    const api = createMockSheetsApi({ id: { T: [['dropped'], [false]] } })
    await api.batchUpdateValues('id', [{ range: "'T'!A3:A3", rows: [[true]] }])
    expect(await api.getValues('id', "'T'!A:A")).toEqual([['dropped'], ['FALSE'], ['TRUE']])
  })

  it('keeps the gap as blank rows when a write lands past the end', async () => {
    const api = createMockSheetsApi(grid())
    await api.batchUpdateValues('id', [{ range: "'T'!A7:A7", rows: [['x']] }])
    expect(await api.getValues('id', "'T'!A:A")).toEqual([
      ['date'],
      ['2026-11-10'],
      [],
      ['2026-11-12'],
      [],
      [],
      ['x'],
    ])
  })
})

describe('same-named tabs in two spreadsheets', () => {
  it('keeps same-named tabs of different spreadsheets apart', async () => {
    const api = createMockSheetsApi({
      a: { AuditLog: [['savedAt'], ['x']] },
      b: { AuditLog: [['savedAt']] },
    })
    await api.batchUpdateValues('b', [{ range: "'AuditLog'!A2:A2", rows: [['y']] }])
    expect(await api.getValues('a', "'AuditLog'!A:A")).toEqual([['savedAt'], ['x']])
    expect(await api.getValues('b', "'AuditLog'!A:A")).toEqual([['savedAt'], ['y']])
  })
})

describe('MOCK_SHEETS', () => {
  it('seeds every tab the app writes with its real headers and some rows', () => {
    const specs = [ANOMALY_TAB, T9MANU_TAB, FURNACE_TAB, LEVEL_TAB, SOLO_RAID_TAB]
    for (const spec of [...specs, ...SPREADSHEETS.map((s) => s.audit)]) {
      const tab = MOCK_SHEETS[spec.spreadsheetId]?.[spec.tab]
      expect(tab?.[0], spec.tab).toEqual([...spec.headers])
      expect(tab.length, spec.tab).toBeGreaterThanOrEqual(3)
    }
  })

  it('gives every spreadsheet its own id', () => {
    expect(new Set(SPREADSHEETS.map((s) => s.audit.spreadsheetId)).size).toBe(SPREADSHEETS.length)
  })
})
