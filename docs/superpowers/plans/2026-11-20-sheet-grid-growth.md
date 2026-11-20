# Sheet Grid Growth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Saves keep working when a tab's data reaches its last grid row, and a 429 shows a clear
message.

**Architecture:** `SheetsApi` gains `ensureRows`, which reads tab metadata and appends blank rows at
the bottom of short tabs. `writeTabsAtEnd` calls it once per save, between finding the start rows and
the empty checks. `request()` maps a 429 to a fixed message.

**Tech Stack:** Vue 3, TypeScript, Vitest, Google Sheets REST v4.

**Spec:** `docs/superpowers/specs/2026-11-20-sheet-grid-growth-design.md`

## Global Constraints

- Grow amount per short tab: `max(shortfall, 100)`.
- Metadata request: `GET {BASE}/{id}?fields=sheets.properties(sheetId,title,gridProperties.rowCount)`.
  A missing `sheetId` means 0. Skip sheets without `gridProperties`.
- Grow request: one `POST {BASE}/{id}:batchUpdate` with
  `{ requests: [{ appendDimension: { sheetId, dimension: 'ROWS', length } }] }`. Nothing is sent when
  no tab is short.
- Missing tab error message: `` `${title} tab not found` ``.
- 429 message, verbatim: `Google rate limit hit. Wait a minute and try again.` (`SheetsApiError`,
  status 429).
- The values write stays one `values:batchUpdate` carrying data plus the AuditLog row.
- Don't commit. The owner commits on "commit and merge".

## Review Focus

- Tab title with `'` (e.g. `Solo Raid's`): `ensureRows` keys by the raw `tab.tab`, not the quoted
  form. Task 2 test uses a title with an apostrophe.
- Several tabs short in one save: one grow POST lists them all. Task 1 test.
- A tab with exactly enough rows (`rowCount === needed`): no grow. Task 1 test.
- 429 on the 401-retry path: the message still applies after a token refresh. Covered because the
  mapping happens after the loop.
- Grow before empty check: an empty check past the grid would 400. Task 2 asserts call order.

---

### Task 1: `ensureRows` and the 429 message in `SheetsApi`

**Files:**

- Modify: `src/services/google/sheetsApi.ts` (interface, `request`, new method)
- Modify: `src/stores/authStore.ts:12` (delegating wrapper gains `ensureRows`)
- Modify: `src/services/mock/mockSheetsApi.ts` (`ensureRows` no-op)
- Test: `src/services/google/sheetsApi.test.ts`

**Interfaces:**

- Produces: `SheetsApi.ensureRows(spreadsheetId: string, rows: Record<string, number>): Promise<void>`.
  Keys are raw tab titles, values are the last row the save needs.

- [ ] **Step 1: Write failing tests in `sheetsApi.test.ts`**

```ts
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
  expect(fetchFn.mock.calls[0][0]).toContain(
    'fields=sheets.properties(sheetId%2Ctitle%2CgridProperties.rowCount)',
  )
  expect(fetchFn.mock.calls[1][0]).toMatch(/\/id:batchUpdate$/)
  expect(JSON.parse(fetchFn.mock.calls[1][1].body)).toEqual({
    requests: [
      { appendDimension: { sheetId: 7, dimension: 'ROWS', length: 250 } },
      { appendDimension: { sheetId: 0, dimension: 'ROWS', length: 100 } },
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
    createSheetsApi(async () => 't', fetchFn).ensureRows('id', { Level: 5 }),
  ).rejects.toThrow('Level tab not found')
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
```

(The `fields` assertion should match however `URLSearchParams` or `encodeURIComponent` encodes the
comma. Adjust the expected string to the encoding you use, but keep the field list exact.)

- [ ] **Step 2: Run them to verify they fail**

Run: `yarn test src/services/google/sheetsApi.test.ts`
Expected: FAIL. `ensureRows` is not a function, and the 429 message doesn't match.

- [ ] **Step 3: Implement**

In `sheetsApi.ts`:

- Add `ensureRows` to the `SheetsApi` interface, with a one-line comment: appends blank rows at the
  bottom only, never inserts.
- In `request`, on `res.status === 429` throw `SheetsApiError` with the fixed message, before the
  generic `!res.ok` throw.
- Implement `ensureRows` per Global Constraints.

In `authStore.ts`, add `ensureRows: (...args) => impl.ensureRows(...args)`. In `mockSheetsApi.ts`,
add `async ensureRows() {}` with the comment `// the fake sheet has no grid limit`.

- [ ] **Step 4: Run them to verify they pass**

Run: `yarn test src/services/google/sheetsApi.test.ts`
Expected: PASS.

---

### Task 2: grow tabs inside `writeTabsAtEnd`

**Files:**

- Modify: `src/services/sheets/tabWriter.ts` (`checkedRange` split, `writeTabsAtEnd`, header comment)
- Modify: test fakes that build a `SheetsApi`: `src/services/sheets/tabWriter.test.ts`,
  `src/stores/{anomaly,gear,level,soloRaid,log,auth}Store.test.ts`. Add
  `ensureRows: vi.fn(async () => {})`, typed `vi.fn<SheetsApi['ensureRows']>` where the file types
  its fakes that way.
- Modify: `CLAUDE.md` (Invariants)

**Interfaces:**

- Consumes: `SheetsApi.ensureRows` from Task 1.

- [ ] **Step 1: Write failing tests in `tabWriter.test.ts`**

```ts
it('grows each tab to its end row, plus the AuditLog row, before the empty checks', async () => {
  const api = fakeApi({ [HEADER]: [tab.headers as string[]], [COL_A]: colA(5) })
  await write(api, [{ tab, rows: [row, row] }])
  expect(api.ensureRows).toHaveBeenCalledExactlyOnceWith('sid', { AuditLog: 3, Anomaly: 7 })
  const growAt = api.ensureRows.mock.invocationCallOrder[0]
  const emptyCheck = api.getValues.mock.calls.findIndex(([, r]) => r === "'Anomaly'!A6:D7")
  expect(api.getValues.mock.invocationCallOrder[emptyCheck]).toBeGreaterThan(growAt)
})

it('keys ensureRows by the raw tab title', async () => {
  const quirky: TabSpec = { ...tab, tab: "Solo Raid's" }
  const api = fakeApi({
    "'Solo Raid''s'!A1:D1": [tab.headers as string[]],
    "'Solo Raid''s'!A:A": colA(2),
  })
  await write(api, [{ tab: quirky, rows: [row] }])
  expect(api.ensureRows.mock.calls[0][1]).toHaveProperty("Solo Raid's", 3)
})

it('does not write when growing fails', async () => {
  const api = fakeApi({ [HEADER]: [tab.headers as string[]], [COL_A]: colA(5) })
  api.ensureRows.mockRejectedValueOnce(new Error('Anomaly tab not found'))
  await expect(write(api, [{ tab, rows: [row] }])).rejects.toThrow('Anomaly tab not found')
  expect(api.batchUpdateValues).not.toHaveBeenCalled()
})
```

Add `ensureRows: vi.fn(async (_id: string, _rows: Record<string, number>) => {})` to `fakeApi`.

- [ ] **Step 2: Run them to verify they fail**

Run: `yarn test src/services/sheets/tabWriter.test.ts`
Expected: FAIL. `ensureRows` is never called.

- [ ] **Step 3: Implement in `tabWriter.ts`**

Split `checkedRange` into:

- `startRow(api, tab: TabSpec): Promise<number>`, which does the header check and returns
  `nextEmptyRow`.
- `checkEmpty(api, tab: TabSpec, start: number, rowCount: number): Promise<string>`, which builds
  the target range, throws `TargetNotEmptyError` if it isn't empty, and returns the range.

`writeTabsAtEnd` runs three steps:

1. `startRow` for AuditLog and every tab, in parallel.
2. One `api.ensureRows(spreadsheetId, { [tab.tab]: start + rowCount - 1, ... })` covering AuditLog
   and every tab.
3. `checkEmpty` for every tab, in parallel.

Everything after that is unchanged. Update the header comment: the function never inserts or
overwrites, and it may append blank rows at the bottom of a tab first.

- [ ] **Step 4: Add `ensureRows` to every other fake listed under Files**

- [ ] **Step 5: Add the CLAUDE.md invariant**

Under the Append-only bullet in `CLAUDE.md`, add: "Before that batch it may append blank rows at
the bottom of a tab whose grid is too short (`SheetsApi.ensureRows`). Blank rows left by a failed
save are harmless."

- [ ] **Step 6: Run the full checks**

Run: `yarn format && yarn lint && yarn check && yarn build && yarn test`
Expected: all pass.

- [ ] **Step 7: Mock-mode smoke check**

Run `yarn dev:mock`, then
`google-chrome --headless=new --virtual-time-budget=5000 --dump-dom http://localhost:5173/#/level`.
Expected: the page renders with no error text. A save in the mock still lands (`ensureRows` is a
no-op).

---

## Owner checks on the sheet copy (before merge)

1. On one tab the app writes (e.g. Level), delete the blank rows under the data, so the last data
   row is the last grid row.
2. Save that form. Expected: the save succeeds, the row lands right under the old data, and 100 blank
   rows now sit below it.
3. Save again. Expected: no new rows are added (the grid already has room).
4. Do the same with `AuditLog`. Expected: the audit row lands and that tab grows too.
