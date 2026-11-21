import { NIKKE_DATABASE_TAB } from '@/config/sheets'
import { cellToIsoDate } from '@/services/anomaly/anomalyRows'
import type { SheetsApi } from '@/services/google/sheetsApi'
import { checkHeaders } from '@/services/sheets/tabWriter'

// Read-only view of the NikkeDatabase tab; the cli writes it. Nothing is cached here.

export type Nikke = {
  nameCode: string
  name: string
  rarity: string
  manufacturer: string
  class: string
  burst: string
  element: string
  weapon: string
  resourceId: string
  releaseDate: string
}

// Data rows only (no header). Blank or short rows are skipped or padded, never a crash.
export function toNikkes(rows: string[][]): Nikke[] {
  return rows.flatMap((row) => {
    const [nameCode, name, rarity, manufacturer, cls, burst, element, weapon, resourceId, date] =
      NIKKE_DATABASE_TAB.headers.map((_, i) => String(row[i] ?? '').trim())
    if (!nameCode || !name) return []
    const releaseDate = cellToIsoDate(date)
    return [
      {
        nameCode,
        name,
        rarity,
        manufacturer,
        class: cls,
        burst,
        element,
        weapon,
        resourceId,
        releaseDate,
      },
    ]
  })
}

export async function readNikkes(api: SheetsApi): Promise<Nikke[]> {
  const { spreadsheetId, tab, headers } = NIKKE_DATABASE_TAB
  const last = String.fromCharCode(64 + headers.length)
  // Unformatted, so ids carry no number formatting and a typed date is a serial number.
  const [header = [], ...rows] = await api.getValues(
    spreadsheetId,
    `'${tab.replace(/'/g, "''")}'!A1:${last}`,
    'UNFORMATTED_VALUE',
  )
  checkHeaders(NIKKE_DATABASE_TAB, header)
  return toNikkes(rows)
}

export function nikkeIcon(resourceId: string): string | null {
  const id = resourceId.trim()
  return /^\d+$/.test(id)
    ? `${import.meta.env.BASE_URL}img/nikke/si/c${id.padStart(3, '0')}.webp`
    : null
}
