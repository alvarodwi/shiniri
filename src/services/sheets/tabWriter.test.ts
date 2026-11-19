import { describe, expect, it, vi } from 'vitest'

import {
  columnLetter,
  HeaderMismatchError,
  nextEmptyRow,
  readColumnA,
  TargetNotEmptyError,
  writeRowsAtEnd,
  writeTabsAtEnd,
} from './tabWriter'

import type { TabSpec } from '@/config/sheets'
import type { SheetsApi } from '@/services/google/sheetsApi'

const tab: TabSpec = { spreadsheetId: 'sid', tab: 'Anomaly', headers: ['date', 'boss', 'note', ''] }
const HEADER = "'Anomaly'!A1:D1"
const COL_A = "'Anomaly'!A:A"

function fakeApi(values: Record<string, string[][]>) {
  const api = {
    getValues: vi.fn(async (_id: string, range: string) => values[range] ?? []),
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

describe('writeRowsAtEnd', () => {
  it('writes directly below the last row in one update', async () => {
    const api = fakeApi({ [HEADER]: [['date', 'boss', 'note']], [COL_A]: colA(2990) })
    const res = await writeRowsAtEnd(api, tab, [row, row])
    expect(api.batchUpdateValues).toHaveBeenCalledTimes(1)
    expect(api.batchUpdateValues).toHaveBeenCalledWith('sid', [
      { range: "'Anomaly'!A2991:D2992", rows: [row, row] },
    ])
    expect(res.updatedRange).toBe("'Anomaly'!A2991:D2992")
  })

  it('accepts trimmed headers and a missing trailing empty header', async () => {
    const api = fakeApi({ [HEADER]: [[' date ', 'boss ', 'note']], [COL_A]: colA(2) })
    await writeRowsAtEnd(api, tab, [row])
    expect(api.batchUpdateValues).toHaveBeenCalledOnce()
  })

  it('refuses when headers differ', async () => {
    const api = fakeApi({ [HEADER]: [['date', 'bossName', 'note']], [COL_A]: colA(2) })
    const err = await writeRowsAtEnd(api, tab, [row]).catch((e) => e)
    expect(err).toBeInstanceOf(HeaderMismatchError)
    expect(err.actual).toEqual(['date', 'bossName', 'note', ''])
    expect(api.batchUpdateValues).not.toHaveBeenCalled()
  })

  it('refuses when the trailing empty header has text', async () => {
    const api = fakeApi({ [HEADER]: [['date', 'boss', 'note', 'notes']], [COL_A]: colA(2) })
    await expect(writeRowsAtEnd(api, tab, [row])).rejects.toBeInstanceOf(HeaderMismatchError)
  })

  it('refuses when a target cell is not empty', async () => {
    const api = fakeApi({
      [HEADER]: [['date', 'boss', 'note']],
      [COL_A]: colA(10),
      ["'Anomaly'!A11:D11"]: [['', '', 'x']],
    })
    const err = await writeRowsAtEnd(api, tab, [row]).catch((e) => e)
    expect(err).toBeInstanceOf(TargetNotEmptyError)
    expect(err.range).toBe("'Anomaly'!A11:D11")
    expect(api.batchUpdateValues).not.toHaveBeenCalled()
  })

  it('reads column A at call time', async () => {
    const values = { [HEADER]: [['date', 'boss', 'note']], [COL_A]: colA(5) }
    const api = fakeApi(values)
    await writeRowsAtEnd(api, tab, [row])
    values[COL_A] = colA(8)
    await writeRowsAtEnd(api, tab, [row])
    expect(api.batchUpdateValues.mock.calls.map((c) => c[1][0].range)).toEqual([
      "'Anomaly'!A6:D6",
      "'Anomaly'!A9:D9",
    ])
  })

  it('refuses rows with an empty column A, which would hide them from nextEmptyRow', async () => {
    const api = fakeApi({})
    await expect(writeRowsAtEnd(api, tab, [['', 'Kraken', '', '']])).rejects.toThrow(/column A/)
    await expect(writeRowsAtEnd(api, tab, [[' ', 'Kraken', '', '']])).rejects.toThrow(/column A/)
    expect(api.getValues).not.toHaveBeenCalled()
  })

  it('rejects empty or wrong-width rows without calling the API', async () => {
    const api = fakeApi({})
    await expect(writeRowsAtEnd(api, tab, [])).rejects.toThrow(/Nothing to write/)
    await expect(writeRowsAtEnd(api, tab, [['a']])).rejects.toThrow(/must have 4 cells/)
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
    const res = await writeTabsAtEnd(api, [
      { tab, rows: [row] },
      { tab: t9, rows: [t9Row, t9Row] },
    ])
    expect(api.batchUpdateValues).toHaveBeenCalledOnce()
    expect(api.batchUpdateValues).toHaveBeenCalledWith('sid', [
      { range: "'Anomaly'!A6:D6", rows: [row] },
      { range: "'T9Manu'!A4:B5", rows: [t9Row, t9Row] },
    ])
    expect(res.updatedRanges).toEqual(["'Anomaly'!A6:D6", "'T9Manu'!A4:B5"])
  })

  it('writes nothing when a later tab fails its header check', async () => {
    const api = fakeApi({ ...base(), ["'T9Manu'!A1:B1"]: [['date', 'sourceType']] })
    await expect(
      writeTabsAtEnd(api, [
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
      writeTabsAtEnd(api, [
        { tab, rows: [row] },
        { tab: other, rows: [t9Row] },
      ]),
    ).rejects.toThrow(/one spreadsheet/)
    await expect(
      writeTabsAtEnd(api, [
        { tab, rows: [row] },
        { tab, rows: [row] },
      ]),
    ).rejects.toThrow(/appears twice/)
    await expect(
      writeTabsAtEnd(api, [
        { tab, rows: [row] },
        { tab: t9, rows: [] },
      ]),
    ).rejects.toThrow(/Nothing to write to T9Manu/)
    await expect(writeTabsAtEnd(api, [])).rejects.toThrow(/Nothing to write/)
    expect(api.getValues).not.toHaveBeenCalled()
  })
})
