"""Google Sheets: an atomic append writer, a port of the shiniri web app's tabWriter.ts.

It never inserts, shifts or overwrites: it writes once, into rows it has just confirmed are empty, below the
last row of data, and the AuditLog row rides in the same request so it exists only if the write landed.
"""

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


class SheetsError(Exception):
    pass


class SheetsApi(Protocol):
    def get_values(self, range_: str, unformatted: bool = False) -> list[list]: ...
    def batch_update(self, data: list[tuple[str, list[list]]]) -> list[str]: ...


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


def _checked(api: SheetsApi, tab: str, headers: Sequence[str]) -> tuple[int, str]:
    """(next empty row, last column-A value) after the header check."""
    first = (api.get_values(_range(tab, len(headers), 1, 1)) or [[]])[0]
    actual = [str(first[i]).strip() if i < len(first) else "" for i in range(len(headers))]
    if actual != list(headers):
        raise SheetsError(f"{tab} headers changed: expected [{' | '.join(headers)}], "
                          f"found [{' | '.join(actual)}]")
    col_a = [r[0] if r else "" for r in api.get_values(f"{_quoted(tab)}!A:A", unformatted=True)]
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
    if len(row) != len(headers) or not str(row[0]).strip():
        raise SheetsError(f"a {tab} row needs {len(headers)} cells and a value in column A")
    start, last = _checked(api, tab, headers)
    if unless_last_a is not None and serial_to_iso(last) == unless_last_a:
        return None
    audit_start, _ = _checked(api, AUDIT_TAB, AUDIT_HEADERS)
    target = _range(tab, len(headers), start, start)
    audit = _range(AUDIT_TAB, len(AUDIT_HEADERS), audit_start, audit_start)
    _ensure_empty(api, target)
    _ensure_empty(api, audit)
    # Leading ' stores both as text: USER_ENTERED would eat the quote in 'Tab'!A1 and turn the timestamp
    # into a locale-dependent datetime.
    data = [(target, [row]), (audit, [[f"'{timestamp}", form, f"'{target}", 1]])]
    # shortcut: a web app save landing between the empty check and this write can overwrite one AuditLog
    # row; accepted for one person, switch the audit row to values.append if that changes.
    api.batch_update(data)
    return target


class HttpSheets:
    def __init__(self, spreadsheet_id: str, token: Callable[[], str], client: httpx.Client):
        self.base = f"{BASE}/{quote(spreadsheet_id, safe='')}"
        self.token = token
        self.client = client

    def _request(self, method: str, url: str, **kw) -> dict:
        resp = self.client.request(method, url, headers={"Authorization": f"Bearer {self.token()}"},
                                   timeout=30.0, **kw)
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


def service_account_token(path: Path) -> Callable[[], str]:
    from google.auth.transport.requests import Request
    from google.oauth2 import service_account

    creds = service_account.Credentials.from_service_account_file(str(path), scopes=SCOPES)

    def token() -> str:
        if not creds.valid:
            creds.refresh(Request())
        return creds.token
    return token
