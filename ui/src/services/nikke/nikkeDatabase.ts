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
  limited: boolean
}

// Data rows only (no header). Blank or short rows are skipped or padded, never a crash.
export function toNikkes(rows: string[][]): Nikke[] {
  return rows.flatMap((row) => {
    const [
      nameCode,
      name,
      rarity,
      manufacturer,
      cls,
      burst,
      element,
      weapon,
      resourceId,
      date,
      ltd,
    ] = NIKKE_DATABASE_TAB.headers.map((_, i) => String(row[i] ?? '').trim())
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
        limited: ltd.toUpperCase() === 'TRUE',
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

// Name search for the picker: names starting with the query first, then the rest in sheet order.
// A blank query matches nothing, so the picker shows no list until the owner types.
export function searchNikkes(nikkes: Nikke[], query: string, limit = 8): Nikke[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hits = nikkes.filter((n) => n.name.toLowerCase().includes(q))
  const starts = hits.filter((n) => n.name.toLowerCase().startsWith(q))
  return [...starts, ...hits.filter((n) => !starts.includes(n))].slice(0, limit)
}
