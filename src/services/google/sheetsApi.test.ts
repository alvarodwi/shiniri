import { describe, expect, it, vi } from 'vitest'

import { createSheetsApi, SheetsApiError } from './sheetsApi'

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('sheetsApi', () => {
  it('refreshes the token once on 401 and retries', async () => {
    const getToken = vi.fn().mockResolvedValueOnce('old').mockResolvedValueOnce('new')
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(json(401))
      .mockResolvedValueOnce(json(200, { values: [['a']] }))
    const api = createSheetsApi(getToken, fetchFn)

    expect(await api.getValues('id', "'Anomaly'!A:A")).toEqual([['a']])
    expect(getToken).toHaveBeenCalledTimes(2)
    expect(getToken.mock.calls[1][0]).toEqual({ forceRefresh: true })
    expect(fetchFn.mock.calls[1][1].headers.Authorization).toBe('Bearer new')
  })

  it('gives up after a second 401', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => json(401))
    const api = createSheetsApi(async () => 't', fetchFn)

    await expect(api.getValues('id', 'r')).rejects.toMatchObject({ status: 401 })
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('does not retry other errors', async () => {
    const fetchFn = vi
      .fn()
      .mockImplementation(async () => json(500, { error: { message: 'boom' } }))
    const api = createSheetsApi(async () => 't', fetchFn)

    const err = await api.getValues('id', 'r').catch((e) => e)
    expect(err).toBeInstanceOf(SheetsApiError)
    expect(err.status).toBe(500)
    expect(err.message).toContain('boom')
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('returns [] when the range is empty', async () => {
    const api = createSheetsApi(async () => 't', vi.fn().mockResolvedValue(json(200, {})))
    expect(await api.getValues('id', 'r')).toEqual([])
  })

  it('batch-writes every range in one POST with USER_ENTERED', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      json(200, {
        responses: [{ updatedRange: "'Anomaly'!A5:I5" }, { updatedRange: "'T9Manu'!A9:E9" }],
      }),
    )
    const api = createSheetsApi(async () => 't', fetchFn)

    const res = await api.batchUpdateValues('sid', [
      { range: "'Anomaly'!A5:I5", rows: [['x', 1, true]] },
      { range: "'T9Manu'!A9:E9", rows: [['y']] },
    ])
    const [url, init] = fetchFn.mock.calls[0]
    expect(fetchFn).toHaveBeenCalledOnce()
    expect(res).toEqual({ updatedRanges: ["'Anomaly'!A5:I5", "'T9Manu'!A9:E9"] })
    expect(init.method).toBe('POST')
    expect(url).toMatch(/\/spreadsheets\/sid\/values:batchUpdate$/)
    expect(JSON.parse(init.body)).toEqual({
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: "'Anomaly'!A5:I5", values: [['x', 1, true]] },
        { range: "'T9Manu'!A9:E9", values: [['y']] },
      ],
    })
  })

  it('turns a 429 into a plain rate-limit message', async () => {
    const fetchFn = vi
      .fn()
      .mockImplementation(async () => json(429, { error: { message: 'Quota exceeded' } }))
    const err = await createSheetsApi(async () => 't', fetchFn)
      .getValues('id', 'r')
      .catch((e) => e)
    expect(err).toBeInstanceOf(SheetsApiError)
    expect(err.status).toBe(429)
    expect(err.message).toBe('Google rate limit hit. Wait a minute and try again.')
  })
})

describe('429 after a token refresh', () => {
  it('still gets the rate-limit message', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(json(401)).mockResolvedValueOnce(json(429))
    const err = await createSheetsApi(async () => 't', fetchFn)
      .getValues('id', 'r')
      .catch((e) => e)
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(err.message).toBe('Google rate limit hit. Wait a minute and try again.')
  })
})

describe('ensureRows', () => {
  const meta = (sheets: object[]) =>
    json(200, { sheets: sheets.map((properties) => ({ properties })) })

  it('appends max(shortfall, 100) rows to each short tab in one request', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        meta([
          { sheetId: 7, title: 'Anomaly', gridProperties: { rowCount: 1000 } },
          { title: 'AuditLog', gridProperties: { rowCount: 50 } },
          { sheetId: 3, title: 'Chart' },
        ]),
      )
      .mockResolvedValueOnce(json(200, {}))
    const api = createSheetsApi(async () => 't', fetchFn)

    await api.ensureRows('id', { Anomaly: 1250, AuditLog: 51 })
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(decodeURIComponent(fetchFn.mock.calls[0][0])).toMatch(
      /\/spreadsheets\/id\?fields=sheets\.properties\(sheetId,title,gridProperties\.rowCount\)$/,
    )
    const [url, init] = fetchFn.mock.calls[1]
    expect(url).toMatch(/\/spreadsheets\/id:batchUpdate$/)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      requests: [
        {
          insertDimension: {
            range: { sheetId: 7, dimension: 'ROWS', startIndex: 1000, endIndex: 1250 },
            inheritFromBefore: true,
          },
        },
        {
          copyPaste: {
            source: { sheetId: 7, startRowIndex: 999, endRowIndex: 1000 },
            destination: { sheetId: 7, startRowIndex: 1000, endRowIndex: 1250 },
            pasteType: 'PASTE_FORMAT',
          },
        },
        {
          insertDimension: {
            range: { sheetId: 0, dimension: 'ROWS', startIndex: 50, endIndex: 150 },
            inheritFromBefore: true,
          },
        },
        {
          copyPaste: {
            source: { sheetId: 0, startRowIndex: 49, endRowIndex: 50 },
            destination: { sheetId: 0, startRowIndex: 50, endRowIndex: 150 },
            pasteType: 'PASTE_FORMAT',
          },
        },
      ],
    })
  })

  it('sends nothing when every tab is long enough', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(meta([{ title: 'Anomaly', gridProperties: { rowCount: 1000 } }]))
    await createSheetsApi(async () => 't', fetchFn).ensureRows('id', { Anomaly: 1000 })
    expect(fetchFn).toHaveBeenCalledOnce()
  })

  it('throws when a tab is missing', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(meta([]))
    await expect(
      createSheetsApi(async () => 't', fetchFn).ensureRows('id', { Level: 5, Gear: 2 }),
    ).rejects.toThrow('Level, Gear tab not found')
  })
})
