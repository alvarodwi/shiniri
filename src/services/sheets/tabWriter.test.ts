import { describe, expect, it, vi } from 'vitest'

import {
  columnLetter,
  HeaderMismatchError,
  nextEmptyRow,
  readColumnA,
  TargetNotEmptyError,
  writeRowsAtEnd,
} from './tabWriter'

import type { TabSpec } from '@/config/sheets'
import type { SheetsApi } from '@/services/google/sheetsApi'

const tab: TabSpec = { spreadsheetId: 'sid', tab: 'Anomaly', headers: ['date', 'boss', 'note', ''] }
const HEADER = "'Anomaly'!A1:D1"
const COL_A = "'Anomaly'!A:A"

function fakeApi(values: Record<string, string[][]>) {
  const api = {
    getValues: vi.fn(async (_id: string, range: string) => values[range] ?? []),
    updateValues: vi.fn(async (_id: string, range: string) => ({ updatedRange: range })),
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
  it('flattens column A, keeping blanks', async () => {
    const api = fakeApi({ [COL_A]: [['date'], [], ['x']] })
    expect(await readColumnA(api, tab)).toEqual(['date', '', 'x'])
  })
})

describe('writeRowsAtEnd', () => {
  it('writes directly below the last row in one update', async () => {
    const api = fakeApi({ [HEADER]: [['date', 'boss', 'note']], [COL_A]: colA(2990) })
    const res = await writeRowsAtEnd(api, tab, [row, row])
    expect(api.updateValues).toHaveBeenCalledTimes(1)
    expect(api.updateValues).toHaveBeenCalledWith('sid', "'Anomaly'!A2991:D2992", [row, row])
    expect(res.updatedRange).toBe("'Anomaly'!A2991:D2992")
  })

  it('accepts trimmed headers and a missing trailing empty header', async () => {
    const api = fakeApi({ [HEADER]: [[' date ', 'boss ', 'note']], [COL_A]: colA(2) })
    await writeRowsAtEnd(api, tab, [row])
    expect(api.updateValues).toHaveBeenCalledOnce()
  })

  it('refuses when headers differ', async () => {
    const api = fakeApi({ [HEADER]: [['date', 'bossName', 'note']], [COL_A]: colA(2) })
    const err = await writeRowsAtEnd(api, tab, [row]).catch((e) => e)
    expect(err).toBeInstanceOf(HeaderMismatchError)
    expect(err.actual).toEqual(['date', 'bossName', 'note', ''])
    expect(api.updateValues).not.toHaveBeenCalled()
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
    expect(api.updateValues).not.toHaveBeenCalled()
  })

  it('reads column A at call time', async () => {
    const values = { [HEADER]: [['date', 'boss', 'note']], [COL_A]: colA(5) }
    const api = fakeApi(values)
    await writeRowsAtEnd(api, tab, [row])
    values[COL_A] = colA(8)
    await writeRowsAtEnd(api, tab, [row])
    expect(api.updateValues.mock.calls.map((c) => c[1])).toEqual([
      "'Anomaly'!A6:D6",
      "'Anomaly'!A9:D9",
    ])
  })

  it('rejects empty or wrong-width rows without calling the API', async () => {
    const api = fakeApi({})
    await expect(writeRowsAtEnd(api, tab, [])).rejects.toThrow()
    await expect(writeRowsAtEnd(api, tab, [['a']])).rejects.toThrow()
    expect(api.getValues).not.toHaveBeenCalled()
  })
})
