import { asText } from '@/services/anomaly/anomalyRows'
import type { Nikke } from '@/services/nikke/nikkeDatabase'
import { ssrPool } from '@/services/nikke/nikkePool'
import type { Cell } from '@/types/sheet'
import { MONTHLY, MONTHS, PLATFORMS, SPENDING_TYPES } from '@/types/spending'
import type { SpendingEntry } from '@/types/spending'

// Costumes and passes exist for any SSR, collab and Pilgrim included.
export const spendingPool = (nikkes: Nikke[]): Nikke[] =>
  ssrPool(nikkes, { pilgrim: true, abnormal: true })

// One logged purchase, as read back from the sheet (prices as text, for the form's inputs).
export type Purchase = {
  packageName: string
  type: string
  priceIdr: string
  priceUsd: string
  platform: string
}

const cell = (v: unknown) => String(v ?? '').trim()

// Data rows of Spending A:G (no header), oldest first. Rows without a packageName are skipped.
export function toHistory(rows: unknown[][]): Purchase[] {
  return rows
    .map((r) => ({
      packageName: cell(r[1]),
      type: cell(r[2]),
      priceIdr: cell(r[3]),
      priceUsd: cell(r[4]),
      platform: cell(r[5]),
    }))
    .filter((p) => p.packageName)
}

export const monthOf = (date: string): string => MONTHS[Number(date.slice(5, 7)) - 1] ?? ''

// The sheet's packageName for the entry, or '' while the field its type needs is blank.
export function packageName(e: SpendingEntry): string {
  const ssr = e.ssr.trim()
  switch (e.type) {
    case 'Monthly Pass':
      return MONTHLY
    case 'Mission Pass':
    case 'Event Pass': {
      const month = e.month || monthOf(e.date)
      return ssr && month ? `${ssr} ${e.type} (${month})` : ''
    }
    case 'Costume Gacha':
    case 'Costume':
      return ssr ? `${ssr} ${e.type}` : ''
    case 'Campaign Pass':
    case 'Music Pack':
      return e.name.trim()
    default:
      return ''
  }
}

const last = <T>(xs: T[], ok: (x: T) => boolean): T | undefined => [...xs].reverse().find(ok)

// Platform of the last purchase of this package, else of this type, else ''.
export function suggestedPlatform(history: Purchase[], name: string, type: string): string {
  const known = (p: Purchase) => (PLATFORMS as readonly string[]).includes(p.platform)
  return (
    (name && last(history, (p) => known(p) && p.packageName === name)?.platform) ||
    (type && last(history, (p) => known(p) && p.type === type)?.platform) ||
    ''
  )
}

// Whole rupiah and dollars with up to two decimals; separators are rejected so 79.000 never lands
// as 79.
const IDR = /^[1-9]\d*$/
const USD = /^(?!0+(\.0+)?$)\d+(\.\d{1,2})?$/
export const validIdr = (s: string): boolean => IDR.test(s.trim())
export const validUsd = (s: string): boolean => USD.test(s.trim())

// The last monthly pass with usable prices, so one hand row without prices can't blank the fill.
export const lastMonthly = (history: Purchase[]): Purchase | undefined =>
  last(history, (p) => p.packageName === MONTHLY && validIdr(p.priceIdr) && validUsd(p.priceUsd))

// Names logged under a type, newest first, for the free-text suggestions.
export const pastNames = (history: Purchase[], type: string): string[] => [
  ...new Set(
    history
      .filter((p) => p.type === type)
      .map((p) => p.packageName)
      .reverse(),
  ),
]

// Columns A-G of Spending, or null while something required is missing or invalid.
export function toRow(e: SpendingEntry, platform: string): Cell[] | null {
  const name = packageName(e)
  const idr = e.priceIdr.trim()
  const usd = e.priceUsd.trim()
  if (!e.date || !name || !(SPENDING_TYPES as readonly string[]).includes(e.type)) return null
  if (!(PLATFORMS as readonly string[]).includes(platform)) return null
  if (!validIdr(idr) || !validUsd(usd)) return null
  return [e.date, asText(name), e.type, Number(idr), Number(usd), platform, asText(e.notes.trim())]
}
