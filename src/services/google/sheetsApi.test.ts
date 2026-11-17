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

  it('writes with PUT and USER_ENTERED to the encoded range', async () => {
    const fetchFn = vi.fn().mockResolvedValue(json(200, { updatedRange: "'Anomaly'!A5:I5" }))
    const api = createSheetsApi(async () => 't', fetchFn)

    const res = await api.updateValues('sid', "'Anomaly'!A5:I5", [['x', 1, true]])
    const [url, init] = fetchFn.mock.calls[0]
    expect(res).toEqual({ updatedRange: "'Anomaly'!A5:I5" })
    expect(init.method).toBe('PUT')
    expect(url).toContain('/spreadsheets/sid/values/')
    expect(url).toContain("'Anomaly'!A5%3AI5")
    expect(url).toContain('valueInputOption=USER_ENTERED')
    expect(JSON.parse(init.body)).toEqual({ values: [['x', 1, true]] })
  })
})
