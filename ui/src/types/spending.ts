export const SPENDING_TYPES = [
  'Monthly Pass',
  'Campaign Pass',
  'Costume',
  'Mission Pass',
  'Event Pass',
  'Costume Gacha',
  'Music Pack',
] as const

export type SpendingType = (typeof SPENDING_TYPES)[number]

export const PLATFORMS = ['GooglePlay', 'RazerGold', 'Apple', 'DebitCard'] as const

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

// packageName of the monthly pass, verbatim from the sheet.
export const MONTHLY = '30-day supply'

// Form state, kept as typed; spendingRows turns it into a sheet row. `name` is the free-text package
// name (Campaign Pass, Music Pack), `ssr` the picked Nikke for the SSR-based types, and `month` an
// override of the purchase date's month ('' follows the date). `platform` '' means the suggested one.
export type SpendingEntry = {
  date: string
  type: string
  name: string
  ssr: string
  month: string
  priceIdr: string
  priceUsd: string
  platform: string
  notes: string
}
