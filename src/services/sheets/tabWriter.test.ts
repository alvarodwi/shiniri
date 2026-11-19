import { describe, expect, it, vi } from 'vitest'

import {
  columnLetter,
  HeaderMismatchError,
  nextEmptyRow,
  readColumnA,
  TargetNotEmptyError,
  writeTabsAtEnd,
} from './tabWriter'
import type { WriteTarget } from './tabWriter'

import type { Spreadsheet, TabSpec } from '@/config/sheets'
import type { SheetsApi } from '@/services/google/sheetsApi'

const tab: TabSpec = { spreadsheetId: 'sid', tab: 'Anomaly', headers: ['date', 'boss', 'note', ''] }
const HEADER = "'Anomaly'!A1:D1"
const COL_A = "'Anomaly'!A:A"

const audit: TabSpec = {
  spreadsheetId: 'sid',
  tab: 'AuditLog',
  headers: ['savedAt', 'form', 'ranges', 'rows'],
}
const SHEETS: Spreadsheet[] = [{ name: 'Test', audit }]
const NOW = new Date('2026-11-19T14:04:12Z')
const AUDIT_DEFAULTS: Record<string, string[][]> = {
  "'AuditLog'!A1:D1": [['savedAt', 'form', 'ranges', 'rows']],
  "'AuditLog'!A:A": [['savedAt'], ['x']],
}

const write = (api: SheetsApi, targets: WriteTarget[]) =>
  writeTabsAtEnd(api, targets, 'Anomaly', SHEETS, NOW)

function fakeApi(values: Record<string, string[][]>) {
  const api = {
    getValues: vi.fn(
      async (_id: string, range: string) => values[range] ?? AUDIT_DEFAULTS[range] ?? [],
    ),
    batchUpdateValues: vi.fn(async (_id: string, data: { range: string }[]) => ({
      updatedRanges: data.map((d) => d.range),
    })),
  }
  return api satisfies SheetsApi
}

const colA = (n: number) => [['date'], ...Array.from({ length: n - 1 }, () => ['2026-11-17'])]
const row = ['2026-11-17', 'Kraken', '', '']

describe('columnLetter', () => {
  it('converts 1-based indexes', () => {
    expect(columnLetter(1)).toBe('A')
    expect(columnLetter(9)).toBe('I')
    expect(columnLetter(26)).toBe('Z')
    expect(columnLetter(27)).toBe('AA')
  })
})

describe('nextEmptyRow', () => {
  it('uses the last non-empty row, not the count', () => {
    expect(nextEmptyRow(['date', 'a', '', 'b'])).toBe(5)
    expect(nextEmptyRow(['date', 'a', '', ''])).toBe(3)
    expect(nextEmptyRow(['date'])).toBe(2)
  })
})

describe('readColumnA', () => {
  it('flattens unformatted column A to strings, keeping blanks', async () => {
    const api = fakeApi({ [COL_A]: [['date'], [], [46343 as unknown as string]] })
    expect(await readColumnA(api, tab)).toEqual(['date', '', '46343'])
    expect(api.getValues).toHaveBeenCalledWith('sid', COL_A, 'UNFORMATTED_VALUE')
  })
})

describe('writeTabsAtEnd guards', () => {
  it('writes directly below the last row in one update', async () => {
    const api = fakeApi({ [HEADER]: [['date', 'boss', 'note']], [COL_A]: colA(2990) })
    const res = await write(api, [{ tab, rows: [row, row] }])
    expect(api.batchUpdateValues).toHaveBeenCalledTimes(1)
    expect(api.batchUpdateValues.mock.calls[0][1][0]).toEqual({
      range: "'Anomaly'!A2991:D2992",
      rows: [row, row],
    })
    expect(res.updatedRanges).toEqual(["'Anomaly'!A2991:D2992"])
  })

  it('accepts trimmed headers and a missing trailing empty header', async () => {
    const api = fakeApi({ [HEADER]: [[' date ', 'boss ', 'note']], [COL_A]: colA(2) })
    await write(api, [{ tab, rows: [row] }])
    expect(api.batchUpdateValues).toHaveBeenCalledOnce()
  })

  it('refuses when headers differ', async () => {
    const api = fakeApi({ [HEADER]: [['date', 'bossName', 'note']], [COL_A]: colA(2) })
    const err = await write(api, [{ tab, rows: [row] }]).catch((e) => e)
    expect(err).toBeInstanceOf(HeaderMismatchError)
    expect(err.actual).toEqual(['date', 'bossName', 'note', ''])
    expect(api.batchUpdateValues).not.toHaveBeenCalled()
  })

  it('refuses when the trailing empty header has text', async () => {
    const api = fakeApi({ [HEADER]: [['date', 'boss', 'note', 'notes']], [COL_A]: colA(2) })
    await expect(write(api, [{ tab, rows: [row] }])).rejects.toBeInstanceOf(HeaderMismatchError)
  })

  it('refuses when a target cell is not empty', async () => {
    const api = fakeApi({
      [HEADER]: [['date', 'boss', 'note']],
      [COL_A]: colA(10),
      ["'Anomaly'!A11:D11"]: [['', '', 'x']],
    })
    const err = await write(api, [{ tab, rows: [row] }]).catch((e) => e)
    expect(err).toBeInstanceOf(TargetNotEmptyError)
    expect(err.range).toBe("'Anomaly'!A11:D11")
    expect(api.batchUpdateValues).not.toHaveBeenCalled()
  })

  it('reads column A at call time', async () => {
    const values = { [HEADER]: [['date', 'boss', 'note']], [COL_A]: colA(5) }
    const api = fakeApi(values)
    await write(api, [{ tab, rows: [row] }])
    values[COL_A] = colA(8)
    await write(api, [{ tab, rows: [row] }])
    expect(api.batchUpdateValues.mock.calls.map((c) => c[1][0].range)).toEqual([
      "'Anomaly'!A6:D6",
      "'Anomaly'!A9:D9",
    ])
  })

  it('refuses rows with an empty column A, which would hide them from nextEmptyRow', async () => {
    const api = fakeApi({})
    await expect(write(api, [{ tab, rows: [['', 'Kraken', '', '']] }])).rejects.toThrow(/column A/)
    await expect(write(api, [{ tab, rows: [[' ', 'Kraken', '', '']] }])).rejects.toThrow(/column A/)
    expect(api.getValues).not.toHaveBeenCalled()
  })

  it('resolves function cells with their own sheet row', async () => {
    const api = fakeApi({ [HEADER]: [['date', 'boss', 'note']], [COL_A]: colA(5) })
    const f = (n: number) => `=B${n + 1}`
    await write(api, [
      {
        tab,
        rows: [
          ['a', f, '', ''],
          ['b', f, '', ''],
        ],
      },
    ])
    expect(api.batchUpdateValues.mock.calls[0][1][0]).toEqual({
      range: "'Anomaly'!A6:D7",
      rows: [
        ['a', '=B7', '', ''],
        ['b', '=B8', '', ''],
      ],
    })
  })

  it('refuses a function cell in column A before reading', async () => {
    const api = fakeApi({})
    await expect(write(api, [{ tab, rows: [[() => 'x', '', '', '']] }])).rejects.toThrow(
      'Every Anomaly row needs a value in column A.',
    )
    expect(api.getValues).not.toHaveBeenCalled()
  })

  it('rejects empty or wrong-width rows without calling the API', async () => {
    const api = fakeApi({})
    await expect(write(api, [{ tab, rows: [] }])).rejects.toThrow(/Nothing to write/)
    await expect(write(api, [{ tab, rows: [['a']] }])).rejects.toThrow(/must have 4 cells/)
    expect(api.getValues).not.toHaveBeenCalled()
  })
})

describe('writeTabsAtEnd', () => {
  const t9: TabSpec = { spreadsheetId: 'sid', tab: 'T9Manu', headers: ['date', 'source'] }
  const t9Row = ['2026-11-19', 'Anomaly Interception']
  const base = () => ({
    [HEADER]: [['date', 'boss', 'note']],
    [COL_A]: colA(5),
    ["'T9Manu'!A1:B1"]: [['date', 'source']],
    ["'T9Manu'!A:A"]: [['date'], ['x'], ['x']],
  })

  it('writes every tab in one batch, in order', async () => {
    const api = fakeApi(base())
    const res = await write(api, [
      { tab, rows: [row] },
      { tab: t9, rows: [t9Row, t9Row] },
    ])
    expect(api.batchUpdateValues).toHaveBeenCalledOnce()
    expect(api.batchUpdateValues).toHaveBeenCalledWith('sid', [
      { range: "'Anomaly'!A6:D6", rows: [row] },
      { range: "'T9Manu'!A4:B5", rows: [t9Row, t9Row] },
      {
        range: "'AuditLog'!A3:D3",
        rows: [["'2026-11-19 21:04:12", 'Anomaly', "''Anomaly'!A6:D6, 'T9Manu'!A4:B5", 3]],
      },
    ])
    expect(res.updatedRanges).toEqual(["'Anomaly'!A6:D6", "'T9Manu'!A4:B5"])
  })

  it('writes nothing when a later tab fails its header check', async () => {
    const api = fakeApi({ ...base(), ["'T9Manu'!A1:B1"]: [['date', 'sourceType']] })
    await expect(
      write(api, [
        { tab, rows: [row] },
        { tab: t9, rows: [t9Row] },
      ]),
    ).rejects.toBeInstanceOf(HeaderMismatchError)
    expect(api.batchUpdateValues).not.toHaveBeenCalled()
  })

  it('refuses other spreadsheets, repeated tabs and empty targets before reading', async () => {
    const api = fakeApi(base())
    const other = { ...t9, spreadsheetId: 'other' }
    await expect(
      write(api, [
        { tab, rows: [row] },
        { tab: other, rows: [t9Row] },
      ]),
    ).rejects.toThrow(/one spreadsheet/)
    await expect(
      write(api, [
        { tab, rows: [row] },
        { tab, rows: [row] },
      ]),
    ).rejects.toThrow(/appears twice/)
    await expect(
      write(api, [
        { tab, rows: [row] },
        { tab: t9, rows: [] },
      ]),
    ).rejects.toThrow(/Nothing to write to T9Manu/)
    await expect(write(api, [])).rejects.toThrow(/Nothing to write/)
    expect(api.getValues).not.toHaveBeenCalled()
  })

  it('writes nothing when the audit tab header is wrong', async () => {
    const api = fakeApi({ ...base(), "'AuditLog'!A1:D1": [['when', 'form', 'ranges', 'rows']] })
    await expect(write(api, [{ tab, rows: [row] }])).rejects.toBeInstanceOf(HeaderMismatchError)
    expect(api.batchUpdateValues).not.toHaveBeenCalled()
  })

  it('refuses a spreadsheet with no audit tab before reading', async () => {
    const api = fakeApi(base())
    await expect(writeTabsAtEnd(api, [{ tab, rows: [row] }], 'Anomaly', [], NOW)).rejects.toThrow(
      /No audit tab/,
    )
    expect(api.getValues).not.toHaveBeenCalled()
  })

  it('writes nothing when the audit tab does not exist', async () => {
    const api = fakeApi(base())
    api.getValues.mockImplementation(async (_id, r) => {
      if (r.startsWith("'AuditLog'")) throw new Error('Sheets API 400: Unable to parse range')
      return base()[r as keyof ReturnType<typeof base>] ?? []
    })
    await expect(write(api, [{ tab, rows: [row] }])).rejects.toThrow(/Unable to parse range/)
    expect(api.batchUpdateValues).not.toHaveBeenCalled()
  })
})
