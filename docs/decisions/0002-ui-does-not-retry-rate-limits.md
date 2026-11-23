# 0002 The UI does not retry a 429, the CLI does

## Context
Google rate limits (429) hit both writers.

## Decision
The CLI waits and retries up to three times (it runs unattended on the homeserver). The web app
shows a fixed rate-limit message at once.

## Rejected
Waiting out the limit in the UI: a minute of "Saving…" on a phone is worse than a clear message.

Code: `ui/src/services/google/sheetsApi.ts`, `cli/src/shiniri_cli/sheets.py` (`HttpSheets`).
