"""Google Sheets: an atomic append writer, a port of the shiniri web app's tabWriter.ts.

It never inserts, shifts or overwrites: it writes once, into rows it has just confirmed are empty, below the
last row of data, and the AuditLog row rides in the same request so it exists only if the write landed. When a
tab's grid is too short, blank rows are appended at its bottom first.
"""

import time
from datetime import date, timedelta
from pathlib import Path
from typing import Callable, Protocol, Sequence
from urllib.parse import quote

import httpx

BASE = "https://sheets.googleapis.com/v4/spreadsheets"
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
AUDIT_TAB = "AuditLog"
AUDIT_HEADERS = ("savedAt", "form", "ranges", "rows")
SERIAL_EPOCH = date(1899, 12, 30)
GROW_MIN = 100  # rows appended at least, so a full tab is not grown again on every write


class SheetsError(Exception):
    pass


class SheetsApi(Protocol):
    def get_values(self, range_: str, unformatted: bool = False) -> list[list]: ...
    def batch_update(self, data: list[tuple[str, list[list]]]) -> list[str]: ...
    def ensure_rows(self, rows: dict[str, int]) -> None: ...


def column_letter(n: int) -> str:
    s = ""
    while n > 0:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def serial_to_iso(v) -> str:
    """Column A read unformatted: a date cell comes back as a serial day count, text as itself."""
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return (SERIAL_EPOCH + timedelta(days=int(v))).isoformat()
    return str(v).strip()


def _quoted(tab: str) -> str:
    return "'" + tab.replace("'", "''") + "'"


def _range(tab: str, width: int, start: int, end: int) -> str:
    return f"{_quoted(tab)}!A{start}:{column_letter(width)}{end}"


def column_a(api: SheetsApi, tab: str) -> list:
    """Column A read unformatted, header included."""
    return [r[0] if r else "" for r in api.get_values(f"{_quoted(tab)}!A:A", unformatted=True)]


def int_ids(values: list) -> set[int]:
    """The whole numbers in column A below the header, however they were typed; anything else is skipped."""
    out = set()
    for v in values[1:]:  # row 1 is the header
        try:
            out.add(int(float(v)))
        except (TypeError, ValueError, OverflowError):
            pass  # something typed by hand; not an id
    return out


def _checked(api: SheetsApi, tab: str, headers: Sequence[str]) -> tuple[int, str]:
    """(next empty row, last column-A value) after the header check."""
    first = (api.get_values(_range(tab, len(headers), 1, 1)) or [[]])[0]
    actual = [str(first[i]).strip() if i < len(first) else "" for i in range(len(headers))]
    if actual != list(headers):
        raise SheetsError(f"{tab} headers changed: expected [{' | '.join(headers)}], "
                          f"found [{' | '.join(actual)}]")
    col_a = column_a(api, tab)
    last = len(col_a) - 1
    while last >= 0 and not str(col_a[last]).strip():
        last -= 1
    return last + 2, col_a[last] if last >= 0 else ""


def _ensure_empty(api: SheetsApi, target: str) -> None:
    if any(str(c).strip() for r in api.get_values(target) for c in r):
        raise SheetsError(f"Refusing to write: {target} is not empty.")


def write_row(api: SheetsApi, tab: str, headers: Sequence[str], row: list, *, form: str, timestamp: str,
              unless_last_a: str | None = None) -> str | None:
    """Append `row` to `tab` plus its AuditLog row in one request. None when the last column-A value of
    `tab` already equals `unless_last_a`."""
    return write_rows(api, tab, headers, [row], form=form, timestamp=timestamp, unless_last_a=unless_last_a)


def write_rows(api: SheetsApi, tab: str, headers: Sequence[str], rows: list[list], *, form: str, timestamp: str,
               unless_last_a: str | None = None) -> str | None:
    """Append `rows` to `tab` as one block plus one AuditLog row, in one request. None when the last
    column-A value of `tab` already equals `unless_last_a`."""
    if not rows or any(len(r) != len(headers) or not str(r[0]).strip() for r in rows):
        raise SheetsError(f"{tab} rows need {len(headers)} cells each and a value in column A")
    start, last = _checked(api, tab, headers)
    if unless_last_a is not None and serial_to_iso(last) == unless_last_a:
        return None
    audit_start, _ = _checked(api, AUDIT_TAB, AUDIT_HEADERS)
    target = _range(tab, len(headers), start, start + len(rows) - 1)
    audit = _range(AUDIT_TAB, len(AUDIT_HEADERS), audit_start, audit_start)
    api.ensure_rows({tab: start + len(rows) - 1, AUDIT_TAB: audit_start})
    _ensure_empty(api, target)
    _ensure_empty(api, audit)
    # Leading ' stores both as text: USER_ENTERED would eat the quote in 'Tab'!A1 and turn the timestamp
    # into a locale-dependent datetime.
    data = [(target, rows), (audit, [[f"'{timestamp}", form, f"'{target}", len(rows)]])]
    # shortcut: a web app save landing between the empty check and this write can overwrite one AuditLog
    # row; accepted for one person, switch the audit row to values.append if that changes.
    api.batch_update(data)
    return target


class HttpSheets:
    def __init__(self, spreadsheet_id: str, token: Callable[[], str], client: httpx.Client, *,
                 sleep: Callable[[float], None] = time.sleep):
        self.base = f"{BASE}/{quote(spreadsheet_id, safe='')}"
        self.token = token
        self.client = client
        self.sleep = sleep
        self._grid: dict[str, list[int]] | None = None  # title -> [sheetId, rowCount], read once per instance

    def _request(self, method: str, url: str, **kw) -> dict:
        for attempt in range(4):
            resp = self.client.request(method, url, headers={"Authorization": f"Bearer {self.token()}"},
                                       timeout=30.0, **kw)
            if resp.status_code != 429 or attempt == 3:
                break
            self.sleep(60.0)  # the read quota is per minute: a 60 s wait always refills it
        if not resp.is_success:
            try:
                msg = resp.json()["error"]["message"]
            except (ValueError, KeyError, TypeError):
                msg = resp.reason_phrase
            raise SheetsError(f"Sheets API {resp.status_code}: {msg}")
        return resp.json()

    def get_values(self, range_: str, unformatted: bool = False) -> list[list]:
        render = "UNFORMATTED_VALUE" if unformatted else "FORMATTED_VALUE"
        body = self._request("GET", f"{self.base}/values/{quote(range_, safe='')}",
                             params={"valueRenderOption": render})
        return body.get("values", [])

    def batch_update(self, data: list[tuple[str, list[list]]]) -> list[str]:
        body = self._request("POST", f"{self.base}/values:batchUpdate", json={
            "valueInputOption": "USER_ENTERED",
            "data": [{"range": r, "values": v} for r, v in data],
        })
        return [r["updatedRange"] for r in body.get("responses", [])]

    def ensure_rows(self, rows: dict[str, int]) -> None:
        """Add blank rows, formatted like the last row, below each tab whose grid is shorter than its count."""
        if self._grid is None:
            body = self._request("GET", self.base,
                                 params={"fields": "sheets.properties(sheetId,title,gridProperties.rowCount)"})
            # sheetId 0 may be omitted as a default; a sheet without gridProperties (a chart) is no tab
            self._grid = {p["title"]: [p.get("sheetId", 0), p["gridProperties"].get("rowCount", 0)]
                          for p in (sh["properties"] for sh in body.get("sheets", []))
                          if "gridProperties" in p}
        missing = [t for t in rows if t not in self._grid]
        if missing:
            raise SheetsError(f"{', '.join(missing)} tab not found")
        short = {t: max(n - self._grid[t][1], GROW_MIN) for t, n in rows.items() if self._grid[t][1] < n}
        if not short:
            return
        requests = []
        for t, n in short.items():
            sheet_id, start = self._grid[t]
            end = start + n
            # Inserted past the last grid row, so nothing shifts. Inheriting keeps fonts and number formats
            # but drops borders, so the last row's format is pasted over the new rows too (web ensureRows).
            requests.append({"insertDimension": {"range": {"sheetId": sheet_id, "dimension": "ROWS",
                                                           "startIndex": start, "endIndex": end},
                                                 "inheritFromBefore": start > 0}})
            if start:
                requests.append({"copyPaste": {
                    "source": {"sheetId": sheet_id, "startRowIndex": start - 1, "endRowIndex": start},
                    "destination": {"sheetId": sheet_id, "startRowIndex": start, "endRowIndex": end},
                    "pasteType": "PASTE_FORMAT"}})
        self._request("POST", f"{self.base}:batchUpdate", json={"requests": requests})
        for t, n in short.items():
            self._grid[t][1] += n


def service_account_token(path: Path) -> Callable[[], str]:
    from google.auth.transport.requests import Request
    from google.oauth2 import service_account

    creds = service_account.Credentials.from_service_account_file(str(path), scopes=SCOPES)

    def token() -> str:
        if not creds.valid:
            creds.refresh(Request())
        return creds.token
    return token
