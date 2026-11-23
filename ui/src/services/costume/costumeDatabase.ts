import { COSTUME_DATABASE_TAB } from '@/config/sheets'
import { cellToIsoDate } from '@/services/anomaly/anomalyRows'
import type { SheetsApi } from '@/services/google/sheetsApi'
import { checkHeaders } from '@/services/sheets/tabWriter'

// Read-only view of the CostumeDatabase tab; the cli writes it. Nothing is cached here.

export type Costume = {
  costumeId: string
  nikke: string
  costumeName: string
  grade: string
  source: string
  image: string
  owned: boolean
  releaseDate: string
}

// Data rows only (no header). `releaseDateCol` is the owner's lookup column, when the sheet has one.
export function toCostumes(rows: string[][], releaseDateCol?: number): Costume[] {
  return rows.flatMap((row) => {
    const [costumeId, nikke, costumeName, grade, source, image, owned] =
      COSTUME_DATABASE_TAB.headers.map((_, i) => String(row[i] ?? '').trim())
    if (!costumeId || !nikke || !costumeName) return []
    const releaseDate =
      releaseDateCol === undefined ? '' : cellToIsoDate(String(row[releaseDateCol] ?? ''))
    return [
      {
        costumeId,
        nikke,
        costumeName,
        grade,
        source,
        image,
        owned: owned.toUpperCase() === 'TRUE',
        releaseDate,
      },
    ]
  })
}

export async function readCostumes(api: SheetsApi): Promise<Costume[]> {
  const { spreadsheetId, tab } = COSTUME_DATABASE_TAB
  // Unformatted, so a typed date is a serial number. Wide enough to reach the owner's lookup columns.
  const [header = [], ...rows] = await api.getValues(
    spreadsheetId,
    `'${tab.replace(/'/g, "''")}'!A1:Z`,
    'UNFORMATTED_VALUE',
  )
  checkHeaders(COSTUME_DATABASE_TAB, header)
  const col = header.findIndex(
    (h, i) => i >= COSTUME_DATABASE_TAB.headers.length && String(h).trim() === 'releaseDate',
  )
  return toCostumes(rows, col < 0 ? undefined : col)
}

// Appended rows follow the game's id order, so the newest costume is the last row.
export const ownedNewestFirst = (costumes: Costume[]): Costume[] =>
  costumes.filter((c) => c.owned).reverse()

export function searchOwned(costumes: Costume[], query: string): Costume[] {
  const q = query.trim().toLowerCase()
  return ownedNewestFirst(costumes).filter(
    (c) => !q || c.nikke.toLowerCase().includes(q) || c.costumeName.toLowerCase().includes(q),
  )
}

export function costumeImage(image: string): string | null {
  const m = /^character\/mi\/([\w-]+\.webp)$/.exec(image.trim())
  return m ? `${import.meta.env.BASE_URL}img/nikke/mi/${m[1]}` : null
}
